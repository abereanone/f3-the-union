const sessionCookieName = 'f3_union_session';
const loginCodeExpiresMs = 10 * 60 * 1000;
const sessionExpiresMs = 30 * 24 * 60 * 60 * 1000;
const maxLoginAttempts = 5;
const devLoginCode = '000000';
const categories = ['run', 'walk', 'ruck', 'bike', 'swim'];
const categorySet = new Set(categories);

const SLACK_INVITE_URL = 'https://join.slack.com/t/f3theunion/shared_invite/zt-3yuik6r2e-jRhoULZd4xxTvot0AO3GAw';

const DEBUGGING_CHANNEL_ID = 'C03TPUJ5WSV';
const SITE_Q_CHANNEL_ID = 'C03T6Q9CPDX';
const DAY_MS = 24 * 60 * 60 * 1000;

// Keep in sync with pax/fng/locations.json - frontend fetches that file directly as a static asset.
const FNG_LOCATIONS = [
  { name: 'The Farm',       slackChannelId: 'C03SC9U3JCB' },
  { name: 'The Yard',       slackChannelId: 'C03SCB1G343' },
  { name: 'The Factory',    slackChannelId: 'C03SEQVDJ3E' },
  { name: 'The Plant',      slackChannelId: 'C03SR2R5AMP' },
  { name: 'The Redzone',    slackChannelId: 'C04D8JHJHPS' },
  { name: 'The Dock',       slackChannelId: 'C05LTUXCSCF' },
  { name: 'The Cafeteria',  slackChannelId: 'C04MJLJ8MJB' },
  { name: 'The Floor',      slackChannelId: 'C04MS0UJHP0' },
  { name: 'The Forge',      slackChannelId: 'C08CNFCKKD2' },
  { name: 'The Clocktower', slackChannelId: 'C08PSLE3VUM' },
  { name: 'The Fountain',   slackChannelId: 'C07E8QBMJ58' },
  { name: 'The Show',       slackChannelId: 'C066VQJLJGL' },
];
const FNG_LOCATION_NAMES = new Set(FNG_LOCATIONS.map((l) => l.name));
const DOW_LABELS = {
  1: 'Sun',
  2: 'Mon',
  3: 'Tue',
  4: 'Wed',
  5: 'Thu',
  6: 'Fri',
  7: 'Sat',
};

export async function onRequest(ctx) {
  try {
    const url = new URL(ctx.request.url);
    const segments = ctx.params.path || [];
    const path = `/${segments.join('/')}`;
    const method = ctx.request.method.toUpperCase();

    if (method === 'OPTIONS') return json({ ok: true });
    if (method === 'POST' && path === '/auth/request-code') return await requestLoginCode(ctx);
    if (method === 'POST' && path === '/auth/verify-code') return await verifyLoginCode(ctx);
    if (method === 'POST' && path === '/auth/logout') return await logout(ctx);
    if (method === 'GET' && path === '/aos') return await listAos(ctx);
    if (method === 'POST' && path === '/contact') return await contactSubmit(ctx);
    if (method === 'POST' && path === '/reminders/run' && isReminderAutomationAuthorized(ctx, url)) {
      return await runReminderNotifications(ctx);
    }
    if (method === 'POST' && path === '/fng/slack-recheck/run') {
      if (!isFngSlackRecheckAuthorized(ctx, url)) {
        return error('FORBIDDEN', 'Invalid FNG Slack recheck secret.', 403);
      }
      return await runFngSlackRecheck(ctx);
    }

    if (method === 'GET' && path === '/miles/raw') return await rawMiles(ctx);
    if (method === 'GET' && path === '/miles/summary') return await milesSummary(ctx, url);
    if (method === 'GET' && path === '/miles/exceptions') return await milesExceptions(ctx);
    if (method === 'GET' && path === '/miles/meta') return await milesMeta(ctx);
    if (method === 'GET' && path === '/challenges') return await listChallenges(ctx);

    if (method === 'GET' && path === '/fng/locations') return json({ ok: true, locations: FNG_LOCATIONS.map((l) => l.name) });
    if (method === 'GET' && path === '/fng/pax') return await fngPaxList(ctx);
    if (method === 'POST' && path === '/fng/submit') return await fngSubmit(ctx);

    const person = await requirePerson(ctx);

    if (method === 'GET' && path === '/me') return json({ ok: true, person: mapPerson(person) });
    if (method === 'GET' && path === '/people') return await listPeople(ctx);
    if (method === 'GET' && path === '/miles/my-entries') return await myMilesEntries(ctx, person, url);
    if (method === 'POST' && path === '/miles/entries') return await createMilesEntry(ctx, person);
    if (segments[0] === 'miles' && segments[1] === 'entries' && segments[2] && method === 'PUT') {
      return await updateMilesEntry(ctx, person, segments[2]);
    }
    if (segments[0] === 'miles' && segments[1] === 'entries' && segments[2] && method === 'DELETE') {
      return await deleteMilesEntry(ctx, person, segments[2]);
    }
    if (segments[0] === 'challenges' && segments[1] && segments[2] === 'enroll' && method === 'POST') {
      return await setChallengeEnrollment(ctx, person, segments[1]);
    }
    if (method === 'GET' && path === '/reminders') return await listReminders(ctx);
    if (method === 'POST' && path === '/reminders') return await createReminder(ctx, person);
    if (method === 'POST' && path === '/reminders/run') {
      assertAdmin(person);
      return await runReminderNotifications(ctx);
    }
    if (segments[0] === 'reminders' && segments[1] && method === 'PUT') {
      return await updateReminder(ctx, person, segments[1]);
    }
    if (segments[0] === 'reminders' && segments[1] && method === 'DELETE') {
      return await deleteReminder(ctx, person, segments[1]);
    }

    if (method === 'GET' && path === '/fng/entries') return await listFngEntries(ctx, person);
    if (segments[0] === 'fng' && segments[1] === 'entries' && segments[2] && method === 'PUT') {
      return await updateFngEntry(ctx, person, segments[2]);
    }
    if (segments[0] === 'fng' && segments[1] === 'entries' && segments[2] && method === 'DELETE') {
      return await deleteFngEntry(ctx, person, segments[2]);
    }

    return error('NOT_FOUND', 'Route not found.', 404);
  } catch (err) {
    if (err instanceof ApiError) return error(err.code, err.message, err.status);
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    return error('SERVER_ERROR', message, 500);
  }
}

class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

function error(code, message, status, extra = {}) {
  return json({ ok: false, error: { code, message, ...extra } }, { status });
}

async function body(ctx) {
  try {
    return await ctx.request.json();
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
}

function id() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError('VALIDATION_ERROR', 'Enter a valid email address.');
  }
  return email;
}

function requireLoginCode(value) {
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', 'Enter the 6 digit code.');
  const code = value.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) throw new ApiError('VALIDATION_ERROR', 'Enter the 6 digit code.');
  return code;
}

function requireDate(value, label = 'Date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError('VALIDATION_ERROR', `${label} must be YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError('VALIDATION_ERROR', `${label} must be a real date.`);
  }
  return value;
}

function addDaysYmd(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function parseYmd(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return { year, month, day };
}

function requireCategory(value) {
  if (typeof value !== 'string' || !categorySet.has(value)) {
    throw new ApiError('VALIDATION_ERROR', 'Choose run, walk, ruck, bike, or swim.');
  }
  return value;
}

function requireMiles(value) {
  const miles = Number(value);
  if (!Number.isFinite(miles) || miles <= 0 || miles > 1000) {
    throw new ApiError('VALIDATION_ERROR', 'Miles must be greater than 0.');
  }
  return Math.round(miles * 100) / 100;
}

function randomCode() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, '0');
}

function randomToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getCookie(request, name) {
  const cookies = request.headers.get('cookie') || '';
  return cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function requirePerson(ctx) {
  const token = getCookie(ctx.request, sessionCookieName);
  if (!token) throw new ApiError('UNAUTHORIZED', 'Log in with an email code first.', 401);
  const tokenHash = await sha256(token);
  const session = await ctx.env.DB.prepare(
    'SELECT person_id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?',
  )
    .bind(tokenHash, nowIso())
    .first();
  if (!session) throw new ApiError('UNAUTHORIZED', 'Log in with an email code first.', 401);
  const person = await ctx.env.DB.prepare('SELECT * FROM people WHERE id = ? AND is_active = 1')
    .bind(session.person_id)
    .first();
  if (!person) throw new ApiError('UNAUTHORIZED', 'This account is not active.', 401);
  return person;
}

function mapPerson(person) {
  return {
    id: person.id,
    email: person.email,
    f3Name: person.f3_name,
    isAdmin: Boolean(person.is_admin),
  };
}

async function requestLoginCode(ctx) {
  const input = await body(ctx);
  const email = normalizeEmail(input.email);
  const registered = await findOrProvisionPersonByEmail(ctx, email);
  if (isDevAuthBypass(ctx)) {
    return json({ ok: true, devAuthBypass: true, devLoginCode, provisionedFromSlack: registered.provisionedFromSlack === true });
  }

  const recent = await ctx.env.DB.prepare(
    'SELECT created_at FROM auth_login_codes WHERE email = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(email, new Date(Date.now() - 600_000).toISOString())
    .first();
  if (recent) throw new ApiError('RATE_LIMITED', 'You can only request one code every 10 minutes.', 429);

  const code = randomCode();
  const codeHash = await sha256(`${email}:${code}`);
  await ctx.env.DB.prepare('UPDATE auth_login_codes SET used_at = ? WHERE email = ? AND used_at IS NULL')
    .bind(nowIso(), email)
    .run();
  await ctx.env.DB.prepare(
    'INSERT INTO auth_login_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id(), email, codeHash, futureIso(loginCodeExpiresMs), nowIso())
    .run();

  await sendLoginEmail(ctx, email, code);
  return json({ ok: true, provisionedFromSlack: registered.provisionedFromSlack === true });
}

async function findOrProvisionPersonByEmail(ctx, email) {
  const existing = await ctx.env.DB.prepare('SELECT * FROM people WHERE email = ?').bind(email).first();
  if (existing && existing.is_active && !existing.needs_profile_update && existing.slack_user_id) return existing;
  return provisionPersonFromSlack(ctx, email, existing);
}

async function provisionPersonFromSlack(ctx, email, existing = null) {
  const slackUser = await lookupSlackUserByEmail(ctx, email);
  if (!slackUser) {
    throw new ApiError(
      'NOT_IN_SLACK',
      'You are not in the Slack space for F3 The Union. You cannot use this app. Contact Floppy Disk for help.',
      403,
    );
  }

  if (slackUser.deleted || slackUser.is_bot || slackUser.is_app_user) {
    throw new ApiError(
      'NOT_IN_SLACK',
      'You are not an active member of the F3 The Union Slack space. Contact Floppy Disk for help.',
      403,
    );
  }

  const displayName = String(slackUser.profile?.display_name || '').trim();
  const realName = String(slackUser.profile?.real_name || slackUser.real_name || '').trim();
  const slackUsername = String(slackUser.name || '').trim();

  if (!displayName) {
    await upsertSlackPerson(ctx, {
      existing,
      email,
      slackUserId: slackUser.id,
      slackUsername,
      f3Name: email,
      fullName: realName,
      isActive: 0,
      needsProfileUpdate: 1,
      slackDeleted: slackUser.deleted ? 1 : 0,
      slackBot: slackUser.is_bot || slackUser.is_app_user ? 1 : 0,
    });
    throw new ApiError(
      'SLACK_PROFILE_UPDATE_REQUIRED',
      'Your Slack display name is missing. Update your Slack display name to your F3 name, then try again.',
      403,
    );
  }

  await assertF3NameAvailable(ctx, displayName, email);
  const person = await upsertSlackPerson(ctx, {
    existing,
    email,
    slackUserId: slackUser.id,
    slackUsername,
    f3Name: displayName,
    fullName: realName,
    isActive: 1,
    needsProfileUpdate: 0,
    slackDeleted: 0,
    slackBot: 0,
  });
  person.provisionedFromSlack = !existing;
  return person;
}

async function lookupSlackUserByEmail(ctx, email) {
  if (!ctx.env.SLACK_BOT_TOKEN) {
    throw new ApiError('SLACK_NOT_CONFIGURED', 'Slack lookup is not configured yet.', 500);
  }

  const slackApiBaseUrl = ctx.env.SLACK_API_BASE_URL || 'https://slack.com/api';
  const url = new URL('/api/users.lookupByEmail', slackApiBaseUrl.endsWith('/api') ? `${slackApiBaseUrl}/` : slackApiBaseUrl);
  url.searchParams.set('email', email);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${ctx.env.SLACK_BOT_TOKEN}` },
  });

  if (!response.ok) {
    throw new ApiError('SLACK_ERROR', 'Slack lookup failed. Contact Floppy Disk for help.', 502);
  }

  const data = await response.json();
  if (data.ok) return data.user;
  if (data.error === 'users_not_found') return null;
  if (data.error === 'missing_scope') {
    throw new ApiError('SLACK_MISSING_SCOPE', 'Slack lookup needs the users:read.email scope.', 500);
  }
  if (data.error === 'invalid_auth' || data.error === 'not_authed') {
    throw new ApiError('SLACK_INVALID_AUTH', 'Slack lookup is not authorized. Contact Floppy Disk for help.', 500);
  }
  throw new ApiError('SLACK_ERROR', `Slack lookup failed: ${data.error || 'unknown error'}`, 502);
}

async function assertF3NameAvailable(ctx, f3Name, email) {
  const existing = await ctx.env.DB.prepare('SELECT email FROM people WHERE lower(f3_name) = lower(?) AND email != ? LIMIT 1')
    .bind(f3Name, email)
    .first();
  if (existing) {
    throw new ApiError(
      'F3_NAME_CONFLICT',
      'That Slack display name is already used by another account. Contact Floppy Disk for help.',
      409,
    );
  }
}

async function upsertSlackPerson(ctx, data) {
  if (data.existing) {
    await ctx.env.DB.prepare(
      `UPDATE people
       SET slack_user_id = ?, slack_username = ?, f3_name = ?, full_name = ?, is_active = ?,
           needs_profile_update = ?, slack_deleted = ?, slack_bot = ?, last_slack_sync_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE email = ?`,
    )
      .bind(
        data.slackUserId,
        data.slackUsername,
        data.f3Name,
        data.fullName,
        data.isActive,
        data.needsProfileUpdate,
        data.slackDeleted,
        data.slackBot,
        nowIso(),
        data.email,
      )
      .run();
  } else {
    await ctx.env.DB.prepare(
      `INSERT INTO people (
         id, email, f3_name, slack_user_id, slack_username, full_name, is_active,
         needs_profile_update, slack_deleted, slack_bot, last_slack_sync_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id(),
        data.email,
        data.f3Name,
        data.slackUserId,
        data.slackUsername,
        data.fullName,
        data.isActive,
        data.needsProfileUpdate,
        data.slackDeleted,
        data.slackBot,
        nowIso(),
      )
      .run();
  }

  return ctx.env.DB.prepare('SELECT * FROM people WHERE email = ?').bind(data.email).first();
}

async function verifyLoginCode(ctx) {
  const input = await body(ctx);
  const email = normalizeEmail(input.email);
  const code = requireLoginCode(input.code);
  if (isDevAuthBypass(ctx)) {
    if (code !== devLoginCode) throw new ApiError('UNAUTHORIZED', `Use ${devLoginCode} for local dev login.`, 401);
    const person = await findOrProvisionPersonByEmail(ctx, email);
    return createSessionResponse(ctx, person);
  }

  const codeHash = await sha256(`${email}:${code}`);
  const challenge = await ctx.env.DB.prepare(
    'SELECT id, attempt_count FROM auth_login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(email, nowIso())
    .first();
  if (!challenge) throw new ApiError('UNAUTHORIZED', 'Request a new login code.', 401);
  if (challenge.attempt_count >= maxLoginAttempts) {
    throw new ApiError('UNAUTHORIZED', 'Too many attempts. Request a new login code.', 401);
  }

  const matched = await ctx.env.DB.prepare('SELECT id FROM auth_login_codes WHERE id = ? AND code_hash = ?')
    .bind(challenge.id, codeHash)
    .first();
  if (!matched) {
    await ctx.env.DB.prepare('UPDATE auth_login_codes SET attempt_count = attempt_count + 1 WHERE id = ?')
      .bind(challenge.id)
      .run();
    throw new ApiError('UNAUTHORIZED', 'That code is not correct.', 401);
  }

  const person = await ctx.env.DB.prepare('SELECT * FROM people WHERE email = ? AND is_active = 1')
    .bind(email)
    .first();
  if (!person) throw new ApiError('UNAUTHORIZED', 'This email is not registered.', 401);

  await ctx.env.DB.prepare('UPDATE auth_login_codes SET used_at = ? WHERE id = ?').bind(nowIso(), challenge.id).run();
  return createSessionResponse(ctx, person);
}

async function createSessionResponse(ctx, person) {
  const token = randomToken();
  await ctx.env.DB.prepare(
    'INSERT INTO auth_sessions (id, person_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id(), person.id, await sha256(token), futureIso(sessionExpiresMs))
    .run();

  return json(
    { ok: true, person: mapPerson(person) },
    { headers: { 'set-cookie': sessionCookie(ctx.request, token, Math.floor(sessionExpiresMs / 1000)) } },
  );
}

function isDevAuthBypass(ctx) {
  return ['1', 'true', 'yes'].includes(String(ctx.env.DEV_AUTH_BYPASS || '').trim().toLowerCase());
}

async function sendLoginEmail(ctx, email, code) {
  const from = ctx.env.RESEND_FROM || 'F3 The Union <login@f3theunion.com>';
  const resendApiBaseUrl = ctx.env.RESEND_API_BASE_URL || 'https://api.resend.com';
  const response = await fetch(new URL('/emails', resendApiBaseUrl).toString(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ctx.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Your F3 The Union login code',
      text: `Your F3 The Union login code is ${code}. It expires in 10 minutes.`,
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222;">
  <h2 style="color:#1f3b6d;margin-bottom:8px;">F3 The Union Login</h2>
  <p style="margin-bottom:24px;">Your login code is:</p>
  <div style="font-size:52px;font-weight:900;letter-spacing:12px;text-align:center;background:#f0f4ff;border:2px solid #1f3b6d;border-radius:10px;padding:20px 0;color:#1f3b6d;">${code}</div>
  <p style="margin-top:24px;color:#666;font-size:0.9em;">Expires in 10 minutes. If you didn't request this, ignore it.</p>
</body>
</html>`,
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new ApiError('EMAIL_ERROR', message || 'Unable to send login email.', 502);
  }
}

async function logout(ctx) {
  const token = getCookie(ctx.request, sessionCookieName);
  if (token) {
    await ctx.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(nowIso(), await sha256(token))
      .run();
  }
  return json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } });
}

function formatDow(value) {
  return String(value || '')
    .split(',')
    .map((part) => DOW_LABELS[Number(part.trim())])
    .filter(Boolean)
    .join(', ');
}

async function listAos(ctx) {
  const result = await ctx.env.DB.prepare(
    `SELECT id, slug, name, region, site_q AS siteQ, dow, start_time AS startTime,
            duration, address, notes
     FROM aos
     WHERE is_active = 1
     ORDER BY region, lower(name)`,
  ).all();

  const regions = {};
  result.results.forEach((ao) => {
    (regions[ao.region] ||= []).push({
      id: ao.id,
      slug: ao.slug,
      name: ao.name,
      region: ao.region,
      siteQ: ao.siteQ,
      dow: ao.dow,
      days: formatDow(ao.dow),
      startTime: ao.startTime,
      duration: ao.duration,
      address: ao.address || null,
      notes: ao.notes || null,
    });
  });

  return json({ ok: true, regions });
}

async function contactSubmit(ctx) {
  const input = await body(ctx);
  if (input.website) return json({ ok: true }); // honeypot — silently discard
  const name = requireStr(input.name, 'Name');
  const email = normalizeEmail(input.email);
  const message = requireStr(input.message, 'Message');
  const regions = Array.isArray(input.regions)
    ? input.regions.map((r) => String(r || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  if (message.length > 3000) throw new ApiError('VALIDATION_ERROR', 'Message is too long.', 400);

  await postContactToSlack(ctx, { name, email, regions, message });
  return json({ ok: true });
}

async function postContactToSlack(ctx, entry) {
  if (!ctx.env.SLACK_BOT_TOKEN) return;
  const slackApiBase = ctx.env.SLACK_API_BASE_URL || 'https://slack.com/api';
  const sendToDebugging = ['1', 'true', 'yes'].includes(String(ctx.env.SEND_POSTS_TO_DEBUGGING || '').trim().toLowerCase());
  const channel = sendToDebugging
    ? DEBUGGING_CHANNEL_ID
    : (ctx.env.CONTACT_SLACK_CHANNEL_ID || SITE_Q_CHANNEL_ID);

  const text = [
    '*New public website contact*',
    `*Name:* ${entry.name}`,
    `*Email:* ${entry.email}`,
    `*Region(s):* ${entry.regions.length ? entry.regions.join(', ') : 'Not specified'}`,
    `*Message:* ${entry.message}`,
  ].join('\n');

  const response = await fetch(`${slackApiBase}/chat.postMessage`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ctx.env.SLACK_BOT_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      username: 'F3 The Union Site',
      icon_emoji: ':mailbox_with_mail:',
      mrkdwn: true,
      text,
    }),
  });

  if (!response.ok) {
    throw new ApiError('SLACK_ERROR', 'Unable to send message.', 502);
  }
}

function assertAdmin(person) {
  if (!person.is_admin) throw new ApiError('FORBIDDEN', 'Admins only.', 403);
}

function requireReminderFrequency(value) {
  const frequency = String(value || '').trim().toLowerCase();
  if (!['once', 'annual', 'monthly'].includes(frequency)) {
    throw new ApiError('VALIDATION_ERROR', 'Choose once, annual, or monthly.');
  }
  return frequency;
}

function reminderInput(input) {
  const remindDaysBefore = Number(input.remindDaysBefore ?? 7);
  if (!Number.isInteger(remindDaysBefore) || remindDaysBefore < 0 || remindDaysBefore > 365) {
    throw new ApiError('VALIDATION_ERROR', 'Reminder window must be between 0 and 365 days.');
  }

  return {
    title: requireStr(input.title, 'Title'),
    eventDate: requireDate(input.eventDate, 'Event date'),
    frequency: requireReminderFrequency(input.frequency),
    remindDaysBefore,
    slackChannelId: optStr(input.slackChannelId),
    notes: optStr(input.notes),
    isActive: input.isActive === false ? 0 : 1,
  };
}

function mapReminder(row) {
  return {
    id: row.id,
    title: row.title,
    eventDate: row.eventDate,
    frequency: row.frequency,
    remindDaysBefore: Number(row.remindDaysBefore || 0),
    slackChannelId: row.slackChannelId || '',
    notes: row.notes || '',
    isActive: Boolean(row.isActive),
    lastNotifiedFor: row.lastNotifiedFor || null,
    nextOccurrence: nextReminderOccurrence(row, todayYmd()),
  };
}

async function listReminders(ctx) {
  const result = await ctx.env.DB.prepare(
    `SELECT id, title, event_date AS eventDate, frequency, remind_days_before AS remindDaysBefore,
            slack_channel_id AS slackChannelId, notes, is_active AS isActive,
            last_notified_for AS lastNotifiedFor
     FROM calendar_reminders
     ORDER BY is_active DESC, event_date`,
  ).all();
  return json({ ok: true, reminders: result.results.map(mapReminder) });
}

async function createReminder(ctx, actor) {
  assertAdmin(actor);
  const data = reminderInput(await body(ctx));
  const reminderId = id();
  await ctx.env.DB.prepare(
    `INSERT INTO calendar_reminders
       (id, title, event_date, frequency, remind_days_before, slack_channel_id, notes,
        is_active, created_by_person_id, updated_by_person_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    reminderId,
    data.title,
    data.eventDate,
    data.frequency,
    data.remindDaysBefore,
    data.slackChannelId,
    data.notes,
    data.isActive,
    actor.id,
    actor.id,
  ).run();
  return json({ ok: true, reminder: await getReminder(ctx, reminderId) });
}

async function updateReminder(ctx, actor, reminderId) {
  assertAdmin(actor);
  await getReminder(ctx, reminderId);
  const data = reminderInput(await body(ctx));
  await ctx.env.DB.prepare(
    `UPDATE calendar_reminders
     SET title = ?, event_date = ?, frequency = ?, remind_days_before = ?, slack_channel_id = ?,
         notes = ?, is_active = ?, updated_by_person_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).bind(
    data.title,
    data.eventDate,
    data.frequency,
    data.remindDaysBefore,
    data.slackChannelId,
    data.notes,
    data.isActive,
    actor.id,
    reminderId,
  ).run();
  return json({ ok: true, reminder: await getReminder(ctx, reminderId) });
}

async function deleteReminder(ctx, actor, reminderId) {
  assertAdmin(actor);
  await ctx.env.DB.prepare('DELETE FROM calendar_reminders WHERE id = ?').bind(reminderId).run();
  return json({ ok: true });
}

async function getReminder(ctx, reminderId) {
  const row = await ctx.env.DB.prepare(
    `SELECT id, title, event_date AS eventDate, frequency, remind_days_before AS remindDaysBefore,
            slack_channel_id AS slackChannelId, notes, is_active AS isActive,
            last_notified_for AS lastNotifiedFor
     FROM calendar_reminders
     WHERE id = ?`,
  ).bind(reminderId).first();
  if (!row) throw new ApiError('NOT_FOUND', 'Reminder not found.', 404);
  return mapReminder(row);
}

function nextReminderOccurrence(reminder, baseDate) {
  const frequency = reminder.frequency;
  const eventDate = reminder.eventDate;
  if (frequency === 'once') return eventDate >= baseDate ? eventDate : null;

  const base = parseYmd(baseDate);
  const event = parseYmd(eventDate);
  if (frequency === 'annual') {
    let occurrence = validYmd(base.year, event.month, event.day);
    if (occurrence < baseDate) occurrence = validYmd(base.year + 1, event.month, event.day);
    return occurrence;
  }

  let occurrence = validYmd(base.year, base.month, event.day);
  if (occurrence < baseDate) {
    const nextMonth = base.month === 12 ? 1 : base.month + 1;
    const nextYear = base.month === 12 ? base.year + 1 : base.year;
    occurrence = validYmd(nextYear, nextMonth, event.day);
  }
  return occurrence;
}

function validYmd(year, month, day) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function remindersDue(rows, baseDate) {
  return rows
    .map((row) => {
      const occurrence = nextReminderOccurrence(row, baseDate);
      if (!occurrence) return null;
      const notifyStart = addDaysYmd(occurrence, -Number(row.remindDaysBefore || 0));
      if (baseDate < notifyStart || baseDate > occurrence) return null;
      if (row.lastNotifiedFor === occurrence) return null;
      return { ...row, occurrence };
    })
    .filter(Boolean);
}

async function runReminderNotifications(ctx) {
  const baseDate = todayYmd();
  const result = await ctx.env.DB.prepare(
    `SELECT id, title, event_date AS eventDate, frequency, remind_days_before AS remindDaysBefore,
            slack_channel_id AS slackChannelId, notes, last_notified_for AS lastNotifiedFor
     FROM calendar_reminders
     WHERE is_active = 1
     ORDER BY event_date`,
  ).all();
  const due = remindersDue(result.results, baseDate);

  for (const reminder of due) {
    await postReminderToSlack(ctx, reminder, baseDate);
    await ctx.env.DB.prepare(
      'UPDATE calendar_reminders SET last_notified_for = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(reminder.occurrence, reminder.id).run();
  }

  return json({ ok: true, checked: result.results.length, sent: due.length });
}

async function postReminderToSlack(ctx, reminder, baseDate) {
  if (!ctx.env.SLACK_BOT_TOKEN) return;
  const slackApiBase = ctx.env.SLACK_API_BASE_URL || 'https://slack.com/api';
  const sendToDebugging = ['1', 'true', 'yes'].includes(String(ctx.env.SEND_POSTS_TO_DEBUGGING || '').trim().toLowerCase());
  const channel = sendToDebugging
    ? DEBUGGING_CHANNEL_ID
    : (reminder.slackChannelId || ctx.env.REMINDERS_SLACK_CHANNEL_ID || SITE_Q_CHANNEL_ID);
  const daysUntil = Math.max(0, Math.round((new Date(`${reminder.occurrence}T00:00:00Z`) - new Date(`${baseDate}T00:00:00Z`)) / DAY_MS));
  const when = daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
  const text = [
    `*Calendar reminder:* ${reminder.title}`,
    `Date: ${reminder.occurrence} (${when})`,
    reminder.notes ? `Notes: ${reminder.notes}` : null,
  ].filter(Boolean).join('\n');

  const response = await fetch(`${slackApiBase}/chat.postMessage`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ctx.env.SLACK_BOT_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      username: 'F3 The Union Reminders',
      icon_emoji: ':calendar:',
      mrkdwn: true,
      text,
    }),
  });

  if (!response.ok) throw new ApiError('SLACK_ERROR', 'Unable to send reminder.', 502);
}

function isReminderAutomationAuthorized(ctx, url) {
  const secret = String(ctx.env.REMINDER_RUN_SECRET || '').trim();
  if (!secret) return false;
  const header = ctx.request.headers.get('x-reminder-secret') || '';
  return header === secret || url.searchParams.get('secret') === secret;
}

function isFngSlackRecheckAuthorized(ctx, url) {
  const secret = String(ctx.env.FNG_SLACK_RECHECK_SECRET || '').trim();
  if (!secret) return false;
  const header = ctx.request.headers.get('x-fng-slack-recheck-secret') || '';
  return header === secret || url.searchParams.get('secret') === secret;
}

async function listPeople(ctx) {
  const result = await ctx.env.DB.prepare(
    'SELECT id, email, f3_name, is_admin FROM people WHERE is_active = 1 ORDER BY lower(f3_name)',
  ).all();
  return json({ ok: true, people: result.results.map(mapPerson) });
}

async function getActivePerson(ctx, personId) {
  const person = await ctx.env.DB.prepare('SELECT * FROM people WHERE id = ? AND is_active = 1').bind(personId).first();
  if (!person) throw new ApiError('VALIDATION_ERROR', 'Choose an active PAX.');
  return person;
}

function entryInput(input, defaultPersonId) {
  return {
    personId: typeof input.personId === 'string' && input.personId ? input.personId : defaultPersonId,
    activityDate: requireDate(input.activityDate, 'Activity date'),
    category: requireCategory(input.category),
    miles: requireMiles(input.miles),
    confirmSameDayActivity: input.confirmSameDayActivity === true,
  };
}

async function createMilesEntry(ctx, actor) {
  const data = entryInput(await body(ctx), actor.id);
  await getActivePerson(ctx, data.personId);
  const sameDayEntries = await sameDayActivityEntries(ctx, data.personId, data.activityDate, data.category);
  if (sameDayEntries.length && !data.confirmSameDayActivity) {
    return error(
      'SAME_DAY_ACTIVITY_CONFIRMATION_REQUIRED',
      sameDayActivityMessage(data.category),
      409,
      { entries: sameDayEntries },
    );
  }
  const entryId = id();
  await ctx.env.DB.prepare(
    `INSERT INTO miles_entries (id, person_id, submitted_by_person_id, activity_date, category, miles, same_day_activity_confirmed)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(entryId, data.personId, actor.id, data.activityDate, data.category, data.miles, sameDayEntries.length && data.confirmSameDayActivity ? 1 : 0)
    .run();
  return json({ ok: true, entry: await getEntry(ctx, entryId) });
}

async function updateMilesEntry(ctx, actor, entryId) {
  const current = await getEntry(ctx, entryId);
  assertCanEdit(actor, current);
  const data = entryInput(await body(ctx), current.personId);
  await getActivePerson(ctx, data.personId);
  const sameDayEntries = await sameDayActivityEntries(ctx, data.personId, data.activityDate, data.category, entryId);
  if (sameDayEntries.length && !data.confirmSameDayActivity) {
    return error(
      'SAME_DAY_ACTIVITY_CONFIRMATION_REQUIRED',
      sameDayActivityMessage(data.category),
      409,
      { entries: sameDayEntries },
    );
  }
  await ctx.env.DB.prepare(
    `UPDATE miles_entries
     SET person_id = ?, activity_date = ?, category = ?, miles = ?, same_day_activity_confirmed = ?, updated_by_person_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(data.personId, data.activityDate, data.category, data.miles, sameDayEntries.length && data.confirmSameDayActivity ? 1 : 0, actor.id, entryId)
    .run();
  return json({ ok: true, entry: await getEntry(ctx, entryId) });
}

async function deleteMilesEntry(ctx, actor, entryId) {
  const current = await getEntry(ctx, entryId);
  assertCanEdit(actor, current);
  await ctx.env.DB.prepare(
    'UPDATE miles_entries SET deleted_at = CURRENT_TIMESTAMP, updated_by_person_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(actor.id, entryId)
    .run();
  return json({ ok: true });
}

function assertCanEdit(actor, entry) {
  if (actor.is_admin || entry.personId === actor.id || entry.submittedByPersonId === actor.id) return;
  throw new ApiError('FORBIDDEN', 'You can only edit entries for you or entries you submitted.', 403);
}

async function getEntry(ctx, entryId) {
  const entry = await ctx.env.DB.prepare(
    `SELECT e.id, e.person_id AS personId, p.f3_name AS name, e.submitted_by_person_id AS submittedByPersonId,
            s.f3_name AS submittedByName, e.updated_by_person_id AS updatedByPersonId,
            e.activity_date AS date, e.category, e.miles, e.source_row_number AS rowNumber,
            e.created_at AS timestamp, e.updated_at AS updatedAt
     FROM miles_entries e
     JOIN people p ON p.id = e.person_id
     JOIN people s ON s.id = e.submitted_by_person_id
     WHERE e.id = ? AND e.deleted_at IS NULL`,
  )
    .bind(entryId)
    .first();
  if (!entry) throw new ApiError('NOT_FOUND', 'Entry not found.', 404);
  return entry;
}

async function sameDayActivityEntries(ctx, personId, activityDate, category, excludeEntryId = null) {
  const result = await ctx.env.DB.prepare(
    `SELECT e.id, p.f3_name AS name, e.activity_date AS date, e.category, e.miles, e.created_at AS timestamp
     FROM miles_entries e
     JOIN people p ON p.id = e.person_id
     WHERE e.deleted_at IS NULL
       AND e.person_id = ?
       AND e.activity_date = ?
       AND e.category = ?
       AND (? IS NULL OR e.id != ?)
     ORDER BY e.created_at`,
  )
    .bind(personId, activityDate, category, excludeEntryId, excludeEntryId)
    .all();
  return result.results;
}

function sameDayActivityMessage(category) {
  const label = category === 'ruck' ? 'rucks' : `${category}s`;
  return `You already entered ${label} for that date. Confirm if this is a separate activity.`;
}

function expandEntry(row, index = 0) {
  const expanded = {
    id: row.id,
    rowNumber: row.rowNumber || index + 1,
    timestamp: row.timestamp,
    name: row.name,
    date: row.date,
    run: 0,
    walk: 0,
    ruck: 0,
    bike: 0,
    swim: 0,
    submittedByName: row.submittedByName,
  };
  expanded[row.category] = Number(row.miles || 0);
  return expanded;
}

async function rawMiles(ctx) {
  const result = await ctx.env.DB.prepare(
    `SELECT e.id, e.source_row_number AS rowNumber, e.created_at AS timestamp, p.f3_name AS name,
            e.activity_date AS date, e.category, e.miles, s.f3_name AS submittedByName
     FROM miles_entries e
     JOIN people p ON p.id = e.person_id
     JOIN people s ON s.id = e.submitted_by_person_id
     WHERE e.deleted_at IS NULL
     ORDER BY e.created_at`,
  ).all();
  return json({ generatedAt: nowIso(), rows: result.results.map(expandEntry) });
}

async function milesSummary(ctx, url) {
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const result = await ctx.env.DB.prepare(
    `SELECT p.f3_name AS name,
            SUM(CASE WHEN e.category = 'run' THEN e.miles ELSE 0 END) AS run,
            SUM(CASE WHEN e.category = 'walk' THEN e.miles ELSE 0 END) AS walk,
            SUM(CASE WHEN e.category = 'ruck' THEN e.miles ELSE 0 END) AS ruck,
            SUM(CASE WHEN e.category = 'bike' THEN e.miles / 3 ELSE 0 END) AS bike,
            SUM(CASE WHEN e.category = 'swim' THEN e.miles * 4 ELSE 0 END) AS swim
     FROM miles_entries e
     JOIN people p ON p.id = e.person_id
     WHERE e.deleted_at IS NULL AND e.activity_date BETWEEN ? AND ?
     GROUP BY e.person_id
     ORDER BY lower(p.f3_name)`,
  )
    .bind(start, end)
    .all();
  const people = result.results.map((row) => {
    const person = {
      name: row.name,
      run: round2(row.run),
      walk: round2(row.walk),
      ruck: round2(row.ruck),
      bike: round2(row.bike),
      swim: round2(row.swim),
    };
    person.total = round2(person.run + person.walk + person.ruck + person.bike + person.swim);
    return person;
  });
  return json({ year, people });
}

async function milesExceptions(ctx) {
  const result = await ctx.env.DB.prepare(
    `SELECT p.f3_name AS name, e.person_id AS personId, e.activity_date AS date, e.category,
            COUNT(*) AS count, GROUP_CONCAT(COALESCE(e.source_row_number, '')) AS rowNumbers,
            GROUP_CONCAT(e.miles) AS milesValues
     FROM miles_entries e
     JOIN people p ON p.id = e.person_id
     WHERE e.deleted_at IS NULL AND e.same_day_activity_confirmed = 0
     GROUP BY e.person_id, e.activity_date, e.category
     HAVING COUNT(*) > 1
     ORDER BY e.activity_date DESC, lower(p.f3_name), e.category`,
  ).all();
  const exceptions = result.results.map((entry) => {
    const rowNumbers = String(entry.rowNumbers || '').split(',');
    const milesValues = String(entry.milesValues || '').split(',');
    return {
      type: 'duplicate entry',
      name: entry.name,
      date: entry.date,
      category: entry.category,
      rows: milesValues.map((miles, index) => ({
        row: Number(rowNumbers[index]) || index + 1,
        miles: Number(miles) || 0,
      })),
    };
  });
  return json({ exceptions });
}

async function milesMeta(ctx) {
  const meta = await ctx.env.DB.prepare(
    'SELECT COALESCE(MAX(updated_at), MAX(created_at)) AS lastRefresh FROM miles_entries WHERE deleted_at IS NULL',
  ).first();
  return json({ lastRefresh: meta?.lastRefresh || nowIso() });
}

async function myMilesEntries(ctx, person, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const result = await ctx.env.DB.prepare(
    `SELECT e.id, e.person_id AS personId, p.f3_name AS name, e.submitted_by_person_id AS submittedByPersonId,
            s.f3_name AS submittedByName, e.activity_date AS date, e.category, e.miles,
            e.source_row_number AS rowNumber, e.created_at AS timestamp, e.updated_at AS updatedAt
     FROM miles_entries e
     JOIN people p ON p.id = e.person_id
     JOIN people s ON s.id = e.submitted_by_person_id
     WHERE e.deleted_at IS NULL AND (e.person_id = ? OR e.submitted_by_person_id = ? OR ? = 1)
     ORDER BY e.activity_date DESC, e.created_at DESC
     LIMIT ?`,
  )
    .bind(person.id, person.id, person.is_admin ? 1 : 0, limit)
    .all();
  return json({ ok: true, entries: result.results });
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function listChallenges(ctx) {
  const challengesResult = await ctx.env.DB.prepare(
    'SELECT id, slug, name, start_date, end_date, goal_miles, image_url FROM challenges WHERE is_active = 1 ORDER BY start_date',
  ).all();

  if (!challengesResult.results.length) return json({ challenges: [] });

  const ids = challengesResult.results.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(',');
  const enrollmentsResult = await ctx.env.DB.prepare(
    `SELECT ce.challenge_id, p.f3_name AS name
     FROM challenge_enrollments ce
     JOIN people p ON p.id = ce.person_id
     WHERE ce.challenge_id IN (${placeholders}) AND p.is_active = 1
     ORDER BY lower(p.f3_name)`,
  ).bind(...ids).all();

  const byChallenge = {};
  enrollmentsResult.results.forEach((e) => {
    (byChallenge[e.challenge_id] ||= []).push(e.name);
  });

  return json({
    challenges: challengesResult.results.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      startDate: c.start_date,
      endDate: c.end_date,
      goalMiles: c.goal_miles,
      imageUrl: c.image_url || null,
      participants: byChallenge[c.id] || [],
    })),
  });
}

async function setChallengeEnrollment(ctx, person, challengeId) {
  const input = await body(ctx);
  const enrolled = input.enrolled === true;

  const challenge = await ctx.env.DB.prepare(
    'SELECT id FROM challenges WHERE id = ? AND is_active = 1',
  ).bind(challengeId).first();
  if (!challenge) throw new ApiError('NOT_FOUND', 'Challenge not found.', 404);

  if (enrolled) {
    await ctx.env.DB.prepare(
      'INSERT OR IGNORE INTO challenge_enrollments (challenge_id, person_id) VALUES (?, ?)',
    ).bind(challengeId, person.id).run();
  } else {
    await ctx.env.DB.prepare(
      'DELETE FROM challenge_enrollments WHERE challenge_id = ? AND person_id = ?',
    ).bind(challengeId, person.id).run();
  }

  return json({ ok: true, enrolled });
}

// ─── FNG ────────────────────────────────────────────────────────────────────

async function runFngSlackRecheck(ctx) {
  const limit = fngSlackRecheckLimit(ctx);
  const checkedBefore = new Date(Date.now() - DAY_MS).toISOString();
  const result = await ctx.env.DB.prepare(
    `SELECT id, email
     FROM fng_entries
     WHERE joined_slack = 0
       AND email IS NOT NULL
       AND trim(email) != ''
       AND (last_slack_recheck_at IS NULL OR last_slack_recheck_at < ?)
     ORDER BY
       last_slack_recheck_at IS NOT NULL,
       last_slack_recheck_at,
       COALESCE(source_timestamp, created_at) DESC
     LIMIT ${limit}`,
  ).bind(checkedBefore).all();

  let joined = 0;
  let notFound = 0;
  let inactive = 0;
  let invalidEmail = 0;

  for (const entry of result.results) {
    const email = String(entry.email || '').trim().toLowerCase();
    const checkedAt = nowIso();

    if (!isLikelyEmail(email)) {
      invalidEmail += 1;
      await updateFngSlackRecheckResult(ctx, entry.id, checkedAt, 'invalid_email', false);
      continue;
    }

    const slackUser = await lookupSlackUserByEmail(ctx, email);
    if (slackUser && !slackUser.deleted && !slackUser.is_bot && !slackUser.is_app_user) {
      joined += 1;
      await updateFngSlackRecheckResult(ctx, entry.id, checkedAt, 'joined', true);
    } else if (slackUser) {
      inactive += 1;
      await updateFngSlackRecheckResult(ctx, entry.id, checkedAt, 'inactive', false);
    } else {
      notFound += 1;
      await updateFngSlackRecheckResult(ctx, entry.id, checkedAt, 'not_found', false);
    }
  }

  return json({
    ok: true,
    checked: result.results.length,
    joined,
    notFound,
    inactive,
    invalidEmail,
  });
}

function fngSlackRecheckLimit(ctx) {
  const parsed = Number.parseInt(String(ctx.env.FNG_SLACK_RECHECK_LIMIT || ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 20);
  return 20;
}

function isLikelyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function updateFngSlackRecheckResult(ctx, entryId, checkedAt, result, joinedSlack) {
  await ctx.env.DB.prepare(
    `UPDATE fng_entries
     SET joined_slack = CASE WHEN ? THEN 1 ELSE joined_slack END,
         last_slack_recheck_at = ?,
         slack_recheck_result = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).bind(joinedSlack ? 1 : 0, checkedAt, result, entryId).run();
}

async function fngPaxList(ctx) {
  const result = await ctx.env.DB.prepare(
    'SELECT f3_name AS f3Name FROM people WHERE is_active = 1 ORDER BY lower(f3_name)',
  ).all();
  return json({ ok: true, pax: result.results.map((r) => r.f3Name) });
}

async function fngSubmit(ctx) {
  const input = await body(ctx);

  // Honeypot — bots fill this, humans don't
  if (input.website) return json({ ok: true });

  // IP-based rate limit: 3 submissions per hour
  const ip = ctx.request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `fng:${ip}`;
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentCount = await ctx.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM fng_entries WHERE json_extract(notes, '$.submitter_ip') = ? AND created_at > ?",
  ).bind(ip, windowStart).first();
  if ((recentCount?.n || 0) >= 3) {
    throw new ApiError('RATE_LIMITED', 'Too many submissions. Try again later.', 429);
  }

  const legalName = requireStr(input.legalName, 'Legal name');
  const location = requireStr(input.location, 'Location');
  if (!FNG_LOCATION_NAMES.has(location)) {
    throw new ApiError('VALIDATION_ERROR', 'Choose a valid location.');
  }

  const f3Name = optStr(input.f3Name);
  const phone = optStr(input.phone);
  const emergencyContact = optStr(input.emergencyContact);
  const email = optEmail(input.email);
  const ehedByRaw = optStr(input.ehedBy);
  const joinedSlack = input.joinedSlack ? 1 : 0;
  const secondPost = optStr(input.secondPost);
  const notes = optStr(input.notes);

  // Try to match EH'd by to a person in the DB
  let ehedByPersonId = null;
  if (ehedByRaw) {
    const match = await ctx.env.DB.prepare(
      'SELECT id FROM people WHERE lower(f3_name) = lower(?) AND is_active = 1 LIMIT 1',
    ).bind(ehedByRaw).first();
    ehedByPersonId = match?.id || null;
  }

  const entryId = id();
  // Store submitter IP in notes as JSON for rate limiting — appended to any user notes
  const notesJson = JSON.stringify({ text: notes || '', submitter_ip: ip });

  await ctx.env.DB.prepare(
    `INSERT INTO fng_entries
       (id, legal_name, f3_name, phone, emergency_contact, email, location,
        ehed_by_person_id, ehed_by_raw, joined_slack, second_post, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(entryId, legalName, f3Name, phone, emergencyContact, email, location,
      ehedByPersonId, ehedByRaw, joinedSlack, secondPost, notesJson)
    .run();

  const entry = await getFngEntry(ctx, entryId);

  // Fire-and-forget side effects — don't let failures break the submission response
  ctx.waitUntil(Promise.allSettled([
    postFngToSlack(ctx, entry),
    sendFngWelcomeEmail(ctx, entry),
  ]));

  return json({ ok: true, entry: mapFngEntry(entry) });
}

function requireStr(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError('VALIDATION_ERROR', `${label} is required.`);
  }
  return value.trim();
}

function optStr(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function optEmail(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const e = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

async function getFngEntry(ctx, entryId) {
  return ctx.env.DB.prepare(
    `SELECT f.id, f.legal_name, f.f3_name, f.phone, f.emergency_contact, f.email,
            f.location, f.ehed_by_raw, f.ehed_by_person_id,
            p.f3_name AS ehed_by_f3_name,
            f.joined_slack, f.second_post, f.notes,
            f.submitted_by_person_id, s.f3_name AS submitted_by_f3_name,
            f.slack_notified_at, f.welcome_email_sent_at,
            f.source_timestamp, f.created_at, f.updated_at
     FROM fng_entries f
     LEFT JOIN people p ON p.id = f.ehed_by_person_id
     LEFT JOIN people s ON s.id = f.submitted_by_person_id
     WHERE f.id = ?`,
  ).bind(entryId).first();
}

function mapFngEntry(row) {
  const notesData = (() => { try { return JSON.parse(row.notes || '{}'); } catch { return {}; } })();
  return {
    id: row.id,
    legalName: row.legal_name,
    f3Name: row.f3_name,
    phone: row.phone,
    emergencyContact: row.emergency_contact,
    email: row.email,
    location: row.location,
    ehedBy: row.ehed_by_f3_name || row.ehed_by_raw || null,
    joinedSlack: Boolean(row.joined_slack),
    secondPost: row.second_post,
    notes: notesData.text || null,
    submittedBy: row.submitted_by_f3_name || null,
    sourceTimestamp: row.source_timestamp,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listFngEntries(ctx, person) {
  const result = await ctx.env.DB.prepare(
    `SELECT f.id, f.legal_name, f.f3_name, f.phone, f.emergency_contact, f.email,
            f.location, f.ehed_by_raw, f.ehed_by_person_id,
            p.f3_name AS ehed_by_f3_name,
            f.joined_slack, f.second_post, f.notes,
            f.submitted_by_person_id, s.f3_name AS submitted_by_f3_name,
            f.slack_notified_at, f.welcome_email_sent_at,
            f.source_timestamp, f.created_at, f.updated_at
     FROM fng_entries f
     LEFT JOIN people p ON p.id = f.ehed_by_person_id
     LEFT JOIN people s ON s.id = f.submitted_by_person_id
     ORDER BY f.created_at DESC`,
  ).all();
  return json({ ok: true, entries: result.results.map(mapFngEntry) });
}

async function updateFngEntry(ctx, person, entryId) {
  if (!person.is_admin) throw new ApiError('FORBIDDEN', 'Admins only.', 403);
  const entry = await getFngEntry(ctx, entryId);
  if (!entry) throw new ApiError('NOT_FOUND', 'FNG entry not found.', 404);

  const input = await body(ctx);
  const legalName = requireStr(input.legalName, 'Legal name');
  const location = requireStr(input.location, 'Location');
  if (!FNG_LOCATION_NAMES.has(location)) throw new ApiError('VALIDATION_ERROR', 'Choose a valid location.');

  const f3Name = optStr(input.f3Name);
  const phone = optStr(input.phone);
  const emergencyContact = optStr(input.emergencyContact);
  const email = optEmail(input.email);
  const ehedByRaw = optStr(input.ehedBy);
  const joinedSlack = input.joinedSlack ? 1 : 0;
  const secondPost = optStr(input.secondPost);

  let ehedByPersonId = null;
  if (ehedByRaw) {
    const match = await ctx.env.DB.prepare(
      'SELECT id FROM people WHERE lower(f3_name) = lower(?) AND is_active = 1 LIMIT 1',
    ).bind(ehedByRaw).first();
    ehedByPersonId = match?.id || null;
  }

  // Preserve existing notes text, update only editable fields
  const existingNotes = (() => { try { return JSON.parse(entry.notes || '{}'); } catch { return {}; } })();
  const newNotesText = optStr(input.notes);
  const notesJson = JSON.stringify({ ...existingNotes, text: newNotesText || '' });

  await ctx.env.DB.prepare(
    `UPDATE fng_entries
     SET legal_name = ?, f3_name = ?, phone = ?, emergency_contact = ?, email = ?,
         location = ?, ehed_by_person_id = ?, ehed_by_raw = ?, joined_slack = ?,
         second_post = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(legalName, f3Name, phone, emergencyContact, email, location,
      ehedByPersonId, ehedByRaw, joinedSlack, secondPost, notesJson, entryId)
    .run();

  return json({ ok: true, entry: mapFngEntry(await getFngEntry(ctx, entryId)) });
}

async function deleteFngEntry(ctx, person, entryId) {
  if (!person.is_admin) throw new ApiError('FORBIDDEN', 'Admins only.', 403);
  const entry = await getFngEntry(ctx, entryId);
  if (!entry) throw new ApiError('NOT_FOUND', 'FNG entry not found.', 404);
  await ctx.env.DB.prepare('DELETE FROM fng_entries WHERE id = ?').bind(entryId).run();
  return json({ ok: true });
}

async function postFngToSlack(ctx, entry) {
  if (!ctx.env.SLACK_BOT_TOKEN) return;
  const slackApiBase = ctx.env.SLACK_API_BASE_URL || 'https://slack.com/api';

  const fields = [
    { title: 'Legal Name', value: entry.legal_name, short: true },
    { title: 'F3 Name', value: entry.f3_name || '—', short: true },
    { title: 'Location', value: entry.location, short: true },
    { title: "EH'd By", value: entry.ehed_by_f3_name || entry.ehed_by_raw || '—', short: true },
    { title: 'Phone', value: entry.phone || '—', short: true },
    { title: 'Email', value: entry.email || '—', short: true },
    { title: 'Emergency Contact', value: entry.emergency_contact || '—', short: false },
    { title: 'Joined Slack?', value: entry.joined_slack ? 'Yes' : 'No', short: true },
    { title: '2nd Post', value: entry.second_post || '—', short: true },
  ];

  const notesData = (() => { try { return JSON.parse(entry.notes || '{}'); } catch { return {}; } })();
  if (notesData.text) fields.push({ title: 'Notes', value: notesData.text, short: false });

  const attachment = {
    fallback: `New FNG: ${entry.legal_name} at ${entry.location}`,
    pretext: ':new: *New FNG Notification*',
    mrkdwn_in: ['pretext'],
    color: '#0000DD',
    fields,
  };

  const sendToDebugging = ['1', 'true', 'yes'].includes(String(ctx.env.SEND_POSTS_TO_DEBUGGING || '').trim().toLowerCase());
  const channelIds = sendToDebugging
    ? [DEBUGGING_CHANNEL_ID]               // #debugging
    : ['C03SEV33M1A', SITE_Q_CHANNEL_ID];  // #leadership, #site-q

  const postPromises = [...new Set(channelIds)].map((channel) =>
    fetch(`${slackApiBase}/chat.postMessage`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ctx.env.SLACK_BOT_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        username: 'FNG Form',
        icon_emoji: ':mailbox_with_mail:',
        link_names: 1,
        attachments: [attachment],
      }),
    })
  );

  await Promise.allSettled(postPromises);

  await ctx.env.DB.prepare('UPDATE fng_entries SET slack_notified_at = ? WHERE id = ?')
    .bind(nowIso(), entry.id)
    .run();
}

async function sendFngWelcomeEmail(ctx, entry) {
  if (!ctx.env.RESEND_API_KEY || !entry.email) return;

  const toEmail = ctx.env.DEV_EMAIL_OVERRIDE || entry.email;
  const from = ctx.env.RESEND_FROM || 'F3 The Union <login@f3theunion.com>';
  const resendApiBase = ctx.env.RESEND_API_BASE_URL || 'https://api.resend.com';

  const f3Name = entry.f3_name || 'FNG';
  const ehedBy = entry.ehed_by_f3_name || entry.ehed_by_raw || null;

  const textBody = [
    `${entry.legal_name},`,
    '',
    `Welcome to F3 The Union! We are fired up to have you join us. Getting started is simple — just keep showing up. The second post is always the hardest, but it gets easier from there.`,
    '',
    'Here is a recap of what you submitted:',
    `  F3 Name:   ${f3Name}`,
    `  Home AO:   ${entry.location}`,
    ehedBy ? `  EH'd by:   ${ehedBy}` : null,
    entry.phone ? `  Phone:     ${entry.phone}` : null,
    '',
    '─────────────────────────────────',
    'JOIN OUR SLACK WORKSPACE',
    '─────────────────────────────────',
    '',
    `Click this link to join the F3 The Union Slack:`,
    SLACK_INVITE_URL,
    '',
    'When you set up your profile, please use:',
    `  Display Name → your F3 name (${f3Name})`,
    `  Full Name    → your legal name (${entry.legal_name})`,
    '',
    'This keeps our roster clean and makes it easy for the pax to find you.',
    '',
    '─────────────────────────────────',
    '',
    'F3 is free, peer-led, and always outdoors. We are glad you found us.',
    'See you at the gloom!',
    '',
    '— F3 The Union',
  ].filter((line) => line !== null).join('\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222;">
  <h2 style="color:#1f3b6d;">Welcome to F3 The Union, ${f3Name}!</h2>
  <p>We are fired up to have you join us. Getting started is simple — just keep showing up. The second post is always the hardest, but it gets easier from there.</p>

  <h3 style="color:#1f3b6d;border-bottom:1px solid #ddd;padding-bottom:4px;">Your Registration</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:6px 8px;font-weight:bold;width:40%;">F3 Name</td><td style="padding:6px 8px;">${f3Name}</td></tr>
    <tr style="background:#f5f5f5;"><td style="padding:6px 8px;font-weight:bold;">Home AO</td><td style="padding:6px 8px;">${entry.location}</td></tr>
    ${ehedBy ? `<tr><td style="padding:6px 8px;font-weight:bold;">EH'd by</td><td style="padding:6px 8px;">${ehedBy}</td></tr>` : ''}
  </table>

  <h3 style="color:#1f3b6d;border-bottom:1px solid #ddd;padding-bottom:4px;">Join Our Slack Workspace</h3>
  <p>Slack is where the pax connect, share workouts, and stay in touch. Click the button below to join:</p>
  <p style="text-align:center;margin:20px 0;">
    <a href="${SLACK_INVITE_URL}"
       style="background:#1f3b6d;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
      Join F3 The Union on Slack
    </a>
  </p>
  <p>When you set up your Slack profile, please use:</p>
  <ul>
    <li><strong>Display Name</strong> → your F3 name: <strong>${f3Name}</strong></li>
    <li><strong>Full Name</strong> → your legal name: <strong>${entry.legal_name}</strong></li>
  </ul>
  <p style="color:#666;font-size:0.9em;">This keeps our roster clean and makes it easy for the pax to find you.</p>

  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />
  <p>F3 is free, peer-led, and always outdoors. We are glad you found us.</p>
  <p><strong>See you at the gloom!</strong><br />— F3 The Union</p>
</body>
</html>`;

  const response = await fetch(new URL('/emails', resendApiBase).toString(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ctx.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: toEmail,
      subject: `Welcome to F3 The Union, ${f3Name}!`,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (response.ok) {
    await ctx.env.DB.prepare('UPDATE fng_entries SET welcome_email_sent_at = ? WHERE id = ?')
      .bind(nowIso(), entry.id)
      .run();
  }
}
