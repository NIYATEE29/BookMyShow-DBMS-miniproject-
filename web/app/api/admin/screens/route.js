// GET /api/admin/screens – screens the admin may schedule on
//   platform admin: every screen · theatre admin: own theatre's screens
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole, STAFF } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole(STAFF);
  const T = s.role === 'THEATRE_ADMIN' ? s.theatreId : null;
  return ok(await q(s.role,
    `SELECT sc.Screen_ID, sc.Screen_No, t.Theatre_ID, t.Name AS Theatre
       FROM SCREEN sc JOIN THEATRE t ON t.Theatre_ID = sc.Theatre_ID
      WHERE (? IS NULL OR sc.Theatre_ID = ?)
      ORDER BY t.Name, sc.Screen_No`, [T, T]));
});
