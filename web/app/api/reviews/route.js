// Redis reviews (NoSQL)
// GET    /api/reviews?movieId=1            read
// POST   /api/reviews {movieId,rating,comment}  create OR update own review (only after watching)
// DELETE /api/reviews?movieId=1            delete own review
import { q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { getMovieReviews, upsertReview, deleteReview } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireRole();
  const movieId = Number(new URL(req.url).searchParams.get('movieId'));
  if (!movieId) throw new HttpError(400, 'Please select a movie');
  const reviews = await getMovieReviews(movieId);
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  return ok({ reviews, average: avg && Math.round(avg * 10) / 10 });
});

export const POST = route(async (req) => {
  const s = await requireRole('CUSTOMER');
  const { movieId, rating, comment } = await req.json();
  const r = Number(rating);
  if (!movieId) throw new HttpError(400, 'Please select a movie');
  if (!(r >= 1 && r <= 5)) throw new HttpError(400, 'Rating must be 1-5');
  if (!comment?.trim() || comment.length > 500) throw new HttpError(400, 'Please write a comment (max 500 characters)');

  // verified reviews: only after the customer has watched the movie (EXISTS in MySQL)
  const [w] = await q('CUSTOMER',
    `SELECT EXISTS (SELECT 1 FROM BOOKING b JOIN SHOWS sh ON sh.Show_ID = b.Show_ID
                     WHERE b.User_ID = ? AND sh.Movie_ID = ? AND b.Status = 'CONFIRMED'
                       AND sh.Show_Time <= NOW()) AS Watched`, [s.uid, movieId]);
  if (!w.Watched) throw new HttpError(403, 'You can review a movie after you have watched it.');

  const res = await upsertReview({ movieId, userId: s.uid, userName: s.name, rating: r, comment: comment.trim() });
  return ok(res, res.updated ? 200 : 201);
});

export const DELETE = route(async (req) => {
  const s = await requireRole('CUSTOMER');
  const movieId = Number(new URL(req.url).searchParams.get('movieId'));
  const deleted = await deleteReview(movieId, s.uid);
  if (!deleted) throw new HttpError(404, 'Review not found');
  return ok({ deleted: true });
});
