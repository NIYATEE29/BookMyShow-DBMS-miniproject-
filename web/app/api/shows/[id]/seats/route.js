// GET /api/shows/:id/seats – seat map with price, booked flag and live holds
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { holdOwners } from '@/lib/holds';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, { params }) => {
  const s = await requireRole();
  const rows = await q(s.role,
    `SELECT st.Row_No, st.Seat_No, st.Seat_Type,
            fn_seat_price(sh.Show_ID, st.Screen_ID, st.Row_No, st.Seat_No) AS Price,
            (bs.Booking_ID IS NOT NULL) AS Booked
       FROM SHOWS sh
       JOIN SEAT st ON st.Screen_ID = sh.Screen_ID
       LEFT JOIN BOOKING_SEAT bs
              ON bs.Show_ID = sh.Show_ID AND bs.Screen_ID = st.Screen_ID
             AND bs.Row_No = st.Row_No AND bs.Seat_No = st.Seat_No
      WHERE sh.Show_ID = ?
      ORDER BY st.Row_No, st.Seat_No`, [params.id]);

  // live holds from Redis (if Redis is down, the seat map still works without them)
  let owners = {};
  try { owners = await holdOwners(params.id, rows.map((r) => r.Row_No + r.Seat_No)); } catch {}
  const me = String(s.uid);
  return ok(rows.map((r) => {
    const owner = owners[r.Row_No + r.Seat_No];
    return { ...r, Booked: !!r.Booked, Held: !r.Booked && owner ? (owner === me ? 'ME' : 'OTHER') : null };
  }));
});
