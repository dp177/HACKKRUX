/**
 * Shared platform-admin basic auth (same scheme as the onboarding review routes).
 * Fails closed in production: ADMIN_BASIC_PASSWORD must be set explicitly -
 * the development default is never accepted in production.
 */
function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx === -1) return null;
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function adminBasicAuth(req, res, next) {
  const expectedUsername = String(process.env.ADMIN_BASIC_USER || 'admin').trim();
  const expectedPassword = String(process.env.ADMIN_BASIC_PASSWORD || '').trim()
    || (process.env.NODE_ENV === 'production' ? null : 'jeevaadmin123');

  if (!expectedPassword) {
    return res.status(503).json({ error: 'Admin access is not configured on this deployment' });
  }

  const parsed = parseBasicAuth(req.headers.authorization);
  const valid = parsed && parsed.username === expectedUsername && parsed.password === expectedPassword;

  if (!valid) {
    res.set('WWW-Authenticate', 'Basic realm="Jeeva Admin"');
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  return next();
}

module.exports = { adminBasicAuth, parseBasicAuth };
