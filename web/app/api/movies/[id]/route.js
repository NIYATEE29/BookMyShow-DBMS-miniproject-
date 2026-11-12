// GET /api/movies/:id – movie page: details + genres + reviews (Redis) + can I review?
import { q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { getMovieReviews } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, { params }) => {
  const s = await requireRole();
  const [movie] = await q(s.role,
    `SELECT m.*, GROUP_CONCAT(g.Genre ORDER BY g.Genre SEPARATOR ', ') AS Genres
       FROM MOVIE m LEFT JOIN MOVIE_GENRE g ON g.Movie_ID = m.Movie_ID
      WHERE m.Movie_ID = ?
      GROUP BY m.Movie_ID`, [params.id]);
  if (!movie) throw new HttpError(404, 'Movie not found');

  // EXISTS: a customer may review only a movie they have actually watched
  let watched = false;
  if (s.role === 'CUSTOMER') {
    const [w] = await q('CUSTOMER',
      `SELECT EXISTS (SELECT 1 FROM BOOKING b JOIN SHOWS sh ON sh.Show_ID = b.Show_ID
                       WHERE b.User_ID = ? AND sh.Movie_ID = ? AND b.Status = 'CONFIRMED'
                         AND sh.Show_Time <= NOW()) AS Watched`, [s.uid, params.id]);
    watched = !!w.Watched;
  }

  let reviews = [];
  try { reviews = await getMovieReviews(params.id); } catch {}
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  return ok({
    movie,
    reviews,
    average: avg && Math.round(avg * 10) / 10,
    canReview: watched,
    myReview: reviews.find((r) => r.user_id === s.uid) || null,
  });
});
