// GET /api/admin/reports – dashboard figures
//   platform ADMIN  -> every theatre
//   THEATRE_ADMIN   -> only their own theatre (same queries, filtered by a CTE)
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole, STAFF } from '@/lib/session';
import { topRated } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

// CTE that limits every query to "my" shows: all shows for the platform admin,
// only the theatre's shows for a theatre admin.   params: [theatreId, theatreId]
const MY_SHOWS = `my_shows AS (
  SELECT sh.Show_ID FROM SHOWS sh JOIN SCREEN sc ON sc.Screen_ID = sh.Screen_ID
   WHERE (? IS NULL OR sc.Theatre_ID = ?))`;

export const GET = route(async () => {
  const s = await requireRole(STAFF);
  const T = s.role === 'THEATRE_ADMIN' ? s.theatreId : null;
  const A = (sql, p = []) => q(s.role, sql, p);
  const P = [T, T];

  const [totals] = await A(
    `WITH ${MY_SHOWS}
     SELECT (SELECT COUNT(*) FROM BOOKING
              WHERE Status = 'CONFIRMED' AND Show_ID IN (SELECT Show_ID FROM my_shows)) AS Bookings,
            (SELECT COUNT(*) FROM BOOKING_SEAT WHERE Show_ID IN (SELECT Show_ID FROM my_shows)) AS Tickets,
            (SELECT COALESCE(SUM(p.Amount), 0) FROM PAYMENT p JOIN BOOKING b ON b.Booking_ID = p.Booking_ID
              WHERE p.Status = 'PAID' AND b.Show_ID IN (SELECT Show_ID FROM my_shows)) AS Revenue,
            (SELECT COALESCE(SUM(p.Amount), 0) FROM PAYMENT p JOIN BOOKING b ON b.Booking_ID = p.Booking_ID
              WHERE p.Status = 'REFUNDED' AND b.Show_ID IN (SELECT Show_ID FROM my_shows)) AS Refunds,
            (SELECT COUNT(DISTINCT User_ID) FROM BOOKING WHERE Show_ID IN (SELECT Show_ID FROM my_shows)) AS Buyers,
            (SELECT COUNT(*) FROM SHOWS WHERE Show_Time > NOW()
                AND Show_ID IN (SELECT Show_ID FROM my_shows)) AS Upcoming_Shows`, P);
  if (!T) {
    const [c] = await A(`SELECT COUNT(*) AS n FROM USERS WHERE Role = 'CUSTOMER'`);
    totals.Customers = c.n;
  }

  // JOIN + GROUP BY + HAVING  (platform: per theatre · theatre: per movie)
  const revenue = T
    ? await A(
      `SELECT m.Title AS Name, COUNT(b.Booking_ID) AS Bookings,
              SUM(b.Total_Amount) AS Revenue, ROUND(AVG(b.Total_Amount), 2) AS Avg_Booking
         FROM BOOKING b
         JOIN SHOWS  sh ON sh.Show_ID   = b.Show_ID
         JOIN SCREEN sc ON sc.Screen_ID = sh.Screen_ID
         JOIN MOVIE  m  ON m.Movie_ID   = sh.Movie_ID
        WHERE b.Status = 'CONFIRMED' AND sc.Theatre_ID = ?
        GROUP BY m.Movie_ID, m.Title
       HAVING SUM(b.Total_Amount) > 0
        ORDER BY Revenue DESC`, [T])
    : await A(
      `SELECT t.Name AS Name, COUNT(b.Booking_ID) AS Bookings,
              SUM(b.Total_Amount) AS Revenue, ROUND(AVG(b.Total_Amount), 2) AS Avg_Booking
         FROM THEATRE t
         JOIN SCREEN sc ON sc.Theatre_ID = t.Theatre_ID
         JOIN SHOWS  sh ON sh.Screen_ID  = sc.Screen_ID
         JOIN BOOKING b ON b.Show_ID     = sh.Show_ID
        WHERE b.Status = 'CONFIRMED'
        GROUP BY t.Theatre_ID, t.Name
       HAVING SUM(b.Total_Amount) > 0
        ORDER BY Revenue DESC`);

  // LEFT JOIN + aggregation: occupancy of the busiest shows
  const occupancy = await A(
    `WITH ${MY_SHOWS}
     SELECT sh.Show_ID, m.Title, sh.Show_Time, t.Name AS Theatre, COUNT(bs.Seat_No) AS Sold,
            (SELECT COUNT(*) FROM SEAT s WHERE s.Screen_ID = sh.Screen_ID) AS Capacity
       FROM SHOWS sh
       JOIN MOVIE m    ON m.Movie_ID    = sh.Movie_ID
       JOIN SCREEN sc  ON sc.Screen_ID  = sh.Screen_ID
       JOIN THEATRE t  ON t.Theatre_ID  = sc.Theatre_ID
       LEFT JOIN BOOKING_SEAT bs ON bs.Show_ID = sh.Show_ID
      WHERE sh.Show_ID IN (SELECT Show_ID FROM my_shows)
      GROUP BY sh.Show_ID, m.Title, sh.Show_Time, sh.Screen_ID, t.Name
      ORDER BY Sold DESC, sh.Show_Time
      LIMIT 12`, P);

  // CTE + window function: best seller(s) per theatre
  const bestSellers = await A(
    `WITH ${MY_SHOWS},
     tickets AS (
        SELECT t.Name AS Theatre, m.Title, COUNT(*) AS Tickets
          FROM BOOKING_SEAT bs
          JOIN SHOWS sh   ON sh.Show_ID   = bs.Show_ID
          JOIN MOVIE m    ON m.Movie_ID   = sh.Movie_ID
          JOIN SCREEN sc  ON sc.Screen_ID = sh.Screen_ID
          JOIN THEATRE t  ON t.Theatre_ID = sc.Theatre_ID
         WHERE bs.Show_ID IN (SELECT Show_ID FROM my_shows)
         GROUP BY t.Name, m.Title),
     ranked AS (
        SELECT *, RANK() OVER (PARTITION BY Theatre ORDER BY Tickets DESC) AS rnk FROM tickets)
     SELECT Theatre, Title, Tickets, rnk AS \`Rank\` FROM ranked WHERE rnk <= ? ORDER BY Theatre, rnk`,
    [...P, T ? 5 : 1]);

  // correlated subquery: above-average spenders (platform only – customer data)
  const topCustomers = T ? [] : await A(
    `SELECT u.User_ID, u.First_Name, u.Last_Name,
            (SELECT SUM(b.Total_Amount) FROM BOOKING b
              WHERE b.User_ID = u.User_ID AND b.Status = 'CONFIRMED') AS Spent
       FROM USERS u
      WHERE (SELECT SUM(b.Total_Amount) FROM BOOKING b
              WHERE b.User_ID = u.User_ID AND b.Status = 'CONFIRMED')
            > (SELECT AVG(x.s) FROM (SELECT SUM(Total_Amount) AS s FROM BOOKING
                                      WHERE Status = 'CONFIRMED' GROUP BY User_ID) x)
      ORDER BY Spent DESC`);

  // conditional aggregation (CASE) per payment method
  const payments = await A(
    `WITH ${MY_SHOWS}
     SELECT p.Method, COUNT(*) AS Payments,
            SUM(CASE WHEN p.Status = 'PAID' THEN p.Amount ELSE 0 END) AS Collected,
            SUM(CASE WHEN p.Status = 'REFUNDED' THEN p.Amount ELSE 0 END) AS Refunded
       FROM PAYMENT p JOIN BOOKING b ON b.Booking_ID = p.Booking_ID
      WHERE b.Show_ID IN (SELECT Show_ID FROM my_shows)
      GROUP BY p.Method`, P);

  let rated = [];
  try {
    const top = await topRated(5);
    const titles = Object.fromEntries((await A('SELECT Movie_ID, Title FROM MOVIE')).map((m) => [m.Movie_ID, m.Title]));
    rated = top.map((t) => ({ Title: titles[t.value] || `#${t.value}`, Rating: Math.round(t.score * 10) / 10 }));
  } catch {}

  return ok({
    scope: T ? 'THEATRE' : 'PLATFORM',
    theatreName: s.theatreName || null,
    totals, revenue, occupancy, bestSellers, topCustomers, payments, topRated: rated,
  });
});
