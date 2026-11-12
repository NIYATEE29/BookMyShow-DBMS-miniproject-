// PUT    /api/admin/movies/:id  – update movie + replace genres
// DELETE /api/admin/movies/:id  – delete (blocked by FK if it has shows)
import { db, q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { removePoster } from '@/lib/posters';

export const dynamic = 'force-dynamic';

export const PUT = route(async (req, { params }) => {
  await requireRole('ADMIN');
  const { title, language, durationMin, releaseDate, genres = [] } = await req.json();
  const conn = await db('ADMIN').getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query(
      'UPDATE MOVIE SET Title = ?, Language = ?, Duration_Min = ?, Release_Date = ? WHERE Movie_ID = ?',
      [title, language, Number(durationMin), releaseDate || null, params.id]);
    if (!res.affectedRows) throw new HttpError(404, 'Movie not found');
    await conn.query('DELETE FROM MOVIE_GENRE WHERE Movie_ID = ?', [params.id]);
    for (const g of [...new Set(genres.map((x) => x.trim()).filter(Boolean))])
      await conn.query('INSERT INTO MOVIE_GENRE (Movie_ID, Genre) VALUES (?, ?)', [params.id, g]);
    await conn.commit();
    return ok({ updated: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

export const DELETE = route(async (_req, { params }) => {
  await requireRole('ADMIN');
  // look up the poster first so its file can be cleaned up (never block the delete over it)
  const [old] = await q('ADMIN', 'SELECT Poster_URL FROM MOVIE WHERE Movie_ID = ?', [params.id]).catch(() => []);
  const res = await q('ADMIN', 'DELETE FROM MOVIE WHERE Movie_ID = ?', [params.id]);
  if (!res.affectedRows) throw new HttpError(404, 'Movie not found');
  await removePoster(old?.Poster_URL);
  return ok({ deleted: true });
});
