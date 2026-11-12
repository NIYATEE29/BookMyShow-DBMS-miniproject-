// JWT session stored in an httpOnly cookie
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { HttpError } from './api';

// staff roles that may open /admin
export const STAFF = ['ADMIN', 'THEATRE_ADMIN'];

const secret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me-please-123456');

export async function createSession(user) {
  const token = await new SignJWT({
    uid: user.User_ID,
    role: user.Role,
    name: user.First_Name,
    theatreId: user.Theatre_ID ?? null,
    theatreName: user.Theatre_Name ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());

  cookies().set('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
}

export async function getSession() {
  const token = cookies().get('session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

export function clearSession() {
  cookies().delete('session');
}

// throws 401 if not logged in, 403 if the role is not allowed.
// role: undefined (any logged-in user), 'ADMIN', or an array like ['ADMIN','THEATRE_ADMIN']
export async function requireRole(role) {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Please log in first');
  const allowed = Array.isArray(role) ? role : role ? [role] : null;
  if (allowed && !allowed.includes(s.role)) throw new HttpError(403, 'You do not have access to this page');
  return s;
}

// home page for a role
export const homeFor = (role) => (role === 'CUSTOMER' ? '/customer' : '/admin');
