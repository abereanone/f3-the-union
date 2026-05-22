const sessionCookieName = 'f3_union_session';
const loginCodeExpiresMs = 10 * 60 * 1000;
const sessionExpiresMs = 30 * 24 * 60 * 60 * 1000;
const maxLoginAttempts = 5;
const devLoginCode = '000000';
const categories = ['run', 'walk', 'ruck', 'bike', 'swim'];
const categorySet = new Set(categories);

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

    if (method === 'GET' && path === '/miles/raw') return await rawMiles(ctx);
    if (method === 'GET' && path === '/miles/summary') return await milesSummary(ctx, url);
    if (method === 'GET' && path === '/miles/exceptions') return await milesExceptions(ctx);
    if (method === 'GET' && path === '/miles/meta') return await milesMeta(ctx);
    if (method === 'GET' && path === '/challenges') return await listChallenges(ctx);

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
