import jwt from 'jsonwebtoken';

export function signUser(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'development-secret-change-this-now',
    { expiresIn: '7d' }
  );
}

export function readUser(req) {
  const token = req.cookies?.warungfit_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET || 'development-secret-change-this-now'); }
  catch { return null; }
}

export function requireAuth(req, res, next) {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  const user = readUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Akses admin diperlukan.' });
  req.user = user;
  next();
}
