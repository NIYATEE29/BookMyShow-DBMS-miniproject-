// GET /api/admin/users?lastName=Patel – customer search (uses idx_users_last_name)
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireRole('ADMIN');
  const lastName = new URL(req.url).searchParams.get('lastName')?.trim();
  const sql = `SELECT User_ID, First_Name, Last_Name, Email, Role, Created_At,
                      (SELECT COUNT(*) FROM BOOKING b WHERE b.User_ID = u.User_ID) AS Bookings
                 FROM USERS u ${lastName ? 'WHERE Last_Name = ?' : ''}
                ORDER BY User_ID LIMIT 50`;
  const rows = await q('ADMIN', sql, lastName ? [lastName] : []);
  const [plan] = lastName
    ? await q('ADMIN', 'EXPLAIN SELECT User_ID FROM USERS WHERE Last_Name = ?', [lastName])
    : [null];
  const [{ n }] = await q('ADMIN',
    `SELECT COUNT(*) AS n FROM USERS ${lastName ? 'WHERE Last_Name = ?' : ''}`, lastName ? [lastName] : []);
  return ok({ total: n, rows, plan: plan && { type: plan.type, key: plan.key, rows: plan.rows } });
});
