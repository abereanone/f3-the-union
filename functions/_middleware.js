const sessionCookieName = 'f3_union_session';

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.pathname !== '/pax' && !url.pathname.startsWith('/pax/')) return ctx.next();

  const token = getCookie(ctx.request, sessionCookieName);
  if (!token || !(await hasValidSession(ctx, token))) {
    const loginUrl = new URL('/login/', url.origin);
    loginUrl.searchParams.set('next', `${url.pathname}${url.search}`);
    return Response.redirect(loginUrl.toString(), 302);
  }

  return ctx.next();
}

function getCookie(request, name) {
  const cookies = request.headers.get('cookie') || '';
  return cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function hasValidSession(ctx, token) {
  if (!ctx.env.DB) return false;
  const tokenHash = await sha256(token);
  const session = await ctx.env.DB.prepare(
    'SELECT person_id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?',
  )
    .bind(tokenHash, new Date().toISOString())
    .first();
  return Boolean(session);
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
