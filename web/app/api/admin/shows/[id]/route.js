// DELETE /api/admin/shows/:id
//   only upcoming shows with no bookings; a theatre admin only in their own theatre.
//   (trigger trg_shows_before_delete also blocks past shows inside MySQL)
import { q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole, STAFF } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (_req, { params }) => {
  const s = await requireRole(STAFF);
  const [own] = await q(s.role,
    `SELECT sc.Theatre_ID, (sh.Show_Time <= NOW()) AS Is_Past
       FROM SHOWS sh JOIN SCREEN sc ON sc.Screen_ID = sh.Screen_ID WHERE sh.Show_ID = ?`, [params.id]);
  if (!own) throw new HttpError(404, 'Show not found');
  if (s.role === 'THEATRE_ADMIN' && own.Theatre_ID !== s.theatreId)
    throw new HttpError(403, 'You can only delete shows of your own theatre');
  if (own.Is_Past) throw new HttpError(400, 'This show has already been screened and cannot be deleted');
  const [b] = await q(s.role, 'SELECT COUNT(*) AS n FROM BOOKING WHERE Show_ID = ?', [params.id]);
  if (b.n > 0) throw new HttpError(400, 'This show already has bookings – cancel them first');
  const res = await q(s.role, 'DELETE FROM SHOWS WHERE Show_ID = ?', [params.id]);
  if (!res.affectedRows) throw new HttpError(404, 'Show not found');
  return ok({ deleted: true });
});
