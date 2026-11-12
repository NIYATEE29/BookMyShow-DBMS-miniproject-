// GET /api/admin/users/:id/referrals – RECURSIVE CTE over USERS.Referred_By
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, { params }) => {
  await requireRole('ADMIN');
  return ok(await q('ADMIN',
    `WITH RECURSIVE referral_tree AS (
        SELECT User_ID, First_Name, Referred_By, 0 AS Level, CAST(First_Name AS CHAR(300)) AS Path
          FROM USERS WHERE User_ID = ?
        UNION ALL
        SELECT u.User_ID, u.First_Name, u.Referred_By, rt.Level + 1, CONCAT(rt.Path, ' -> ', u.First_Name)
          FROM USERS u JOIN referral_tree rt ON u.Referred_By = rt.User_ID)
     SELECT * FROM referral_tree ORDER BY Path`, [params.id]));
});
