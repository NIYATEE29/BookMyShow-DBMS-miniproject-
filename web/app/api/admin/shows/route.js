// GET  /api/admin/shows – shows (platform: all theatres · theatre admin: own theatre)
// POST /api/admin/shows {movieId, screenId, showTime, price} – sp_add_show (clash check)
import { db, q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole, STAFF } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole(STAFF);
  const T = s.role === 'THEATRE_ADMIN' ? s.theatreId : null;
  const rows = await q(s.role,
    `SELECT v.*, (v.Show_Time <= NOW()) AS Is_Past,
            (SELECT COUNT(*) FROM BOOKING b WHERE b.Show_ID = v.Show_ID AND b.Status = 'CONFIRMED') AS Bookings
       FROM v_show_details v
      WHERE (? IS NULL OR v.Theatre_ID = ?)
      ORDER BY v.Show_Time`, [T, T]);
  return ok(rows.map((r) => ({ ...r, Is_Past: !!r.Is_Past })));
});

export const POST = route(async (req) => {
  const s = await requireRole(STAFF);
  const { movieId, screenId, showTime, price } = await req.json();
  if (!movieId || !screenId || !showTime || !price) throw new HttpError(400, 'All fields are required');
  const when = showTime.replace('T', ' ') + (showTime.length === 16 ? ':00' : '');
  if (new Date(when.replace(' ', 'T')) <= new Date()) throw new HttpError(400, 'Pick a date and time in the future');

  // a theatre admin may schedule shows only in the theatre they manage
  const [scr] = await q(s.role, 'SELECT Theatre_ID FROM SCREEN WHERE Screen_ID = ?', [screenId]);
  if (!scr) throw new HttpError(400, 'Screen not found');
  if (s.role === 'THEATRE_ADMIN' && scr.Theatre_ID !== s.theatreId)
    throw new HttpError(403, 'You can only add shows to your own theatre');

  const conn = await db(s.role).getConnection();
  try {
    await conn.query('CALL sp_add_show(?, ?, ?, ?, @s)', [movieId, screenId, when, price]);
    const [[{ id }]] = await conn.query('SELECT @s AS id');
    return ok({ Show_ID: id }, 201);
  } finally {
    conn.release();
  }
});
