// POST /api/auth/login  {email, password}
import bcrypt from 'bcryptjs';
import { q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { createSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const { email, password } = await req.json();
  if (!email || !password) throw new HttpError(400, 'Email and password are required');

  // login lookup uses the least-privileged CUSTOMER DB account (column-level SELECT on USERS)
  const rows = await q('CUSTOMER',
    `SELECT u.User_ID, u.First_Name, u.Password_Hash, u.Role, u.Theatre_ID, t.Name AS Theatre_Name
       FROM USERS u LEFT JOIN THEATRE t ON t.Theatre_ID = u.Theatre_ID
      WHERE u.Email = ?`,
    [email.trim().toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.Password_Hash)))
    throw new HttpError(401, 'Invalid email or password');

  await createSession(user);
  return ok({ role: user.Role, name: user.First_Name });
});
