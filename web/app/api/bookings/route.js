// GET  /api/bookings  – my bookings
// POST /api/bookings  {showId, seats:['A1','A2'], method} – calls sp_book_seats
import { db, q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { holdOwners, releaseSeats } from '@/lib/holds';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole('CUSTOMER');
  const rows = await q('CUSTOMER',
    `SELECT b.Booking_ID, b.Status, b.Total_Amount, b.Booked_At,
            v.Movie_ID, v.Title, v.Theatre, v.Screen_No, v.Show_Time,
            (v.Show_Time <= NOW()) AS Is_Past,
            m.Poster_URL,
            p.Method, p.Status AS Payment_Status,
            (SELECT GROUP_CONCAT(CONCAT(Row_No, Seat_No) ORDER BY Row_No, Seat_No)
               FROM BOOKING_SEAT bs WHERE bs.Booking_ID = b.Booking_ID) AS Seats
       FROM BOOKING b
       JOIN v_show_details v ON v.Show_ID = b.Show_ID
       JOIN MOVIE m          ON m.Movie_ID = v.Movie_ID
       LEFT JOIN PAYMENT p   ON p.Booking_ID = b.Booking_ID
      WHERE b.User_ID = ?
      ORDER BY v.Show_Time DESC, b.Booking_ID DESC`, [s.uid]);
  return ok(rows.map((r) => ({ ...r, Is_Past: !!r.Is_Past })));
});

export const POST = route(async (req) => {
  const s = await requireRole('CUSTOMER');
  const { showId, seats, method } = await req.json();
  if (!showId || !Array.isArray(seats) || seats.length === 0) throw new HttpError(400, 'Pick at least one seat');
  if (seats.length > 10) throw new HttpError(400, 'Maximum 10 seats per booking');

  // a seat someone else is holding (Redis) cannot be bought from under them
  let owners = {};
  try { owners = await holdOwners(showId, seats); } catch {}
  const taken = seats.filter((x) => owners[x] && owners[x] !== String(s.uid));
  if (taken.length) throw new HttpError(409, `${taken.join(', ')} ${taken.length > 1 ? 'are' : 'is'} on hold for another customer. Please pick other seats.`);

  // session variable @b needs the SAME connection for CALL and SELECT
  const conn = await db('CUSTOMER').getConnection();
  try {
    await conn.query('CALL sp_book_seats(?, ?, ?, ?, @b)', [s.uid, showId, seats.join(','), method || 'UPI']);
    const [[{ id }]] = await conn.query('SELECT @b AS id');
    const [[b]] = await conn.query('SELECT Booking_ID, Total_Amount FROM BOOKING WHERE Booking_ID = ?', [id]);
    try { await releaseSeats(showId, seats, s.uid); } catch {}
    return ok(b, 201);
  } finally {
    conn.release();
  }
});
