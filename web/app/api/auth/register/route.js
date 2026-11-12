// POST /api/auth/register  {firstName, lastName, email, password, referrerEmail?}
import bcrypt from 'bcryptjs';
import { q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { createSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const { firstName, lastName, email, password, referrerEmail } = await req.json();
  if (!firstName || !email || !password) throw new HttpError(400, 'First name, email and password are required');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');

  let referredBy = null;
  if (referrerEmail) {
    const r = await q('CUSTOMER', 'SELECT User_ID FROM USERS WHERE Email = ?', [referrerEmail.trim().toLowerCase()]);
    if (!r.length) throw new HttpError(400, 'Referrer email not found');
    referredBy = r[0].User_ID;
  }

  const hash = await bcrypt.hash(password, 10);
  // Role is NOT supplied -> DEFAULT 'CUSTOMER'. The customer DB account has no
  // INSERT privilege on the Role column, so nobody can self-register as ADMIN.
  const res = await q('CUSTOMER',
    'INSERT INTO USERS (First_Name, Last_Name, Email, Password_Hash, Referred_By) VALUES (?,?,?,?,?)',
    [firstName.trim(), lastName?.trim() || null, email.trim().toLowerCase(), hash, referredBy]);

  await createSession({ User_ID: res.insertId, Role: 'CUSTOMER', First_Name: firstName.trim(), Theatre_ID: null });
  return ok({ role: 'CUSTOMER' }, 201);
});
