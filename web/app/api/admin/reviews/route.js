// Admin moderation of Redis reviews
// GET    /api/admin/reviews                       – read all
// DELETE /api/admin/reviews?movieId=1&userId=4    – delete any review
import { route, ok, HttpError } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { getAllReviews, deleteReview } from '@/lib/reviews';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireRole('ADMIN');
  const titles = Object.fromEntries((await q('ADMIN', 'SELECT Movie_ID, Title FROM MOVIE')).map((m) => [m.Movie_ID, m.Title]));
  const rows = await getAllReviews();
  return ok(rows.map((r) => ({ ...r, title: titles[r.movie_id] || `#${r.movie_id}` })));
});

export const DELETE = route(async (req) => {
  await requireRole('ADMIN');
  const p = new URL(req.url).searchParams;
  const ok_ = await deleteReview(Number(p.get('movieId')), Number(p.get('userId')));
  if (!ok_) throw new HttpError(404, 'Review not found');
  return ok({ deleted: true });
});
