// GET /api/admin/bookings – bookings with customer + show info
//   platform admin: all · theatre admin: own theatre only
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole, STAFF } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole(STAFF);
  const T = s.role === 'THEATRE_ADMIN' ? s.theatreId : null;
  const rows = await q(s.role,
    `SELECT b.Booking_ID, b.Status, b.Total_Amount, b.Booked_At,
            CONCAT(u.First_Name, ' ', COALESCE(u.Last_Name, '')) AS Customer, u.Email,
            v.Title, v.Theatre, v.Screen_No, v.Show_Time, (v.Show_Time <= NOW()) AS Is_Past,
            p.Method, p.Status AS Payment_Status,
            (SELECT GROUP_CONCAT(CONCAT(Row_No, Seat_No) ORDER BY Row_No, Seat_No)
               FROM BOOKING_SEAT bs WHERE bs.Booking_ID = b.Booking_ID) AS Seats
       FROM BOOKING b
       JOIN USERS u          ON u.User_ID   = b.User_ID
       JOIN v_show_details v ON v.Show_ID   = b.Show_ID
       LEFT JOIN PAYMENT p   ON p.Booking_ID = b.Booking_ID
      WHERE (? IS NULL OR v.Theatre_ID = ?)
      ORDER BY b.Booking_ID DESC`, [T, T]);
  return ok(rows.map((r) => ({ ...r, Is_Past: !!r.Is_Past })));
});
