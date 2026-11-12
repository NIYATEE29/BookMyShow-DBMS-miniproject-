// GET /api/me/profile – customer profile: details, spend stats, watched movies, own reviews
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { getUserReviews } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole('CUSTOMER');
  const C = (sql, p) => q('CUSTOMER', sql, p);

  // self-join on USERS (recursive relationship) for "referred by"
  const [user] = await C(
    `SELECT u.User_ID, u.First_Name, u.Last_Name, u.Email, u.Created_At,
            r.First_Name AS Referrer_First, r.Last_Name AS Referrer_Last,
            (SELECT COUNT(*) FROM USERS x WHERE x.Referred_By = u.User_ID) AS Referrals
       FROM USERS u LEFT JOIN USERS r ON r.User_ID = u.Referred_By
      WHERE u.User_ID = ?`, [s.uid]);

  // conditional aggregation over my bookings
  const [stats] = await C(
    `SELECT COUNT(*) AS Bookings,
            COALESCE(SUM(CASE WHEN b.Status = 'CONFIRMED' THEN b.Total_Amount END), 0) AS Spent,
            COALESCE(SUM(CASE WHEN p.Status = 'REFUNDED' THEN p.Amount END), 0) AS Refunded,
            SUM(b.Status = 'CANCELLED') AS Cancelled,
            (SELECT COUNT(*) FROM BOOKING_SEAT bs JOIN BOOKING b2 ON b2.Booking_ID = bs.Booking_ID
              WHERE b2.User_ID = ?) AS Tickets,
            (SELECT COUNT(DISTINCT sh.Movie_ID) FROM BOOKING b3 JOIN SHOWS sh ON sh.Show_ID = b3.Show_ID
              WHERE b3.User_ID = ? AND b3.Status = 'CONFIRMED' AND sh.Show_Time <= NOW()) AS Movies_Watched
       FROM BOOKING b LEFT JOIN PAYMENT p ON p.Booking_ID = b.Booking_ID
      WHERE b.User_ID = ?`, [s.uid, s.uid, s.uid]);

  // favourite genre: GROUP BY over the multivalued attribute
  const [fav] = await C(
    `SELECT g.Genre, COUNT(*) AS n
       FROM BOOKING b JOIN SHOWS sh ON sh.Show_ID = b.Show_ID
       JOIN MOVIE_GENRE g ON g.Movie_ID = sh.Movie_ID
      WHERE b.User_ID = ? AND b.Status = 'CONFIRMED'
      GROUP BY g.Genre ORDER BY n DESC, g.Genre LIMIT 1`, [s.uid]);

  // movies I have watched (past, confirmed)
  const watched = await C(
    `SELECT m.Movie_ID, m.Title, m.Language, m.Poster_URL,
            MAX(sh.Show_Time) AS Last_Watched, COUNT(DISTINCT b.Booking_ID) AS Times
       FROM BOOKING b JOIN SHOWS sh ON sh.Show_ID = b.Show_ID
       JOIN MOVIE m ON m.Movie_ID = sh.Movie_ID
      WHERE b.User_ID = ? AND b.Status = 'CONFIRMED' AND sh.Show_Time <= NOW()
      GROUP BY m.Movie_ID, m.Title, m.Language, m.Poster_URL
      ORDER BY Last_Watched DESC`, [s.uid]);

  let reviews = [];
  try {
    const titles = Object.fromEntries((await C('SELECT Movie_ID, Title, Poster_URL FROM MOVIE')).map((m) => [m.Movie_ID, m]));
    reviews = (await getUserReviews(s.uid)).map((r) => ({
      ...r, title: titles[r.movie_id]?.Title || `#${r.movie_id}`, poster: titles[r.movie_id]?.Poster_URL || null,
    }));
  } catch {}

  return ok({ user, stats: { ...stats, Favourite_Genre: fav?.Genre || null }, watched, reviews });
});
