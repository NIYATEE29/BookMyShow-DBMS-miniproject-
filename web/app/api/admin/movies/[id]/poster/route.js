// POST   /api/admin/movies/:id/poster  (multipart, field "poster") – upload / replace poster
// DELETE /api/admin/movies/:id/poster                               – remove poster
import { q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { savePoster, removePoster } from '@/lib/posters';

export const dynamic = 'force-dynamic';

async function currentPoster(id) {
  const rows = await q('ADMIN', 'SELECT Poster_URL FROM MOVIE WHERE Movie_ID = ?', [id]);
  if (!rows.length) throw new HttpError(404, 'Movie not found');
  return rows[0].Poster_URL;
}

export const POST = route(async (req, { params }) => {
  await requireRole('ADMIN');
  const old = await currentPoster(params.id);
  const form = await req.formData().catch(() => null);
  const url = await savePoster(params.id, form?.get('poster'));
  await q('ADMIN', 'UPDATE MOVIE SET Poster_URL = ? WHERE Movie_ID = ?', [url, params.id]);
  await removePoster(old);
  return ok({ Poster_URL: url });
});

export const DELETE = route(async (_req, { params }) => {
  await requireRole('ADMIN');
  const old = await currentPoster(params.id);
  await q('ADMIN', 'UPDATE MOVIE SET Poster_URL = NULL WHERE Movie_ID = ?', [params.id]);
  await removePoster(old);
  return ok({ removed: true });
});
