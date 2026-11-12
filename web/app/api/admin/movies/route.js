// POST /api/admin/movies {title, language, durationMin, releaseDate, genres:[]}
import { db } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  await requireRole('ADMIN');
  const { title, language, durationMin, releaseDate, genres = [] } = await req.json();
  if (!title || !durationMin) throw new HttpError(400, 'Title and duration are required');

  const conn = await db('ADMIN').getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query(
      'INSERT INTO MOVIE (Title, Language, Duration_Min, Release_Date) VALUES (?, ?, ?, ?)',
      [title.trim(), language || 'English', Number(durationMin), releaseDate || null]);
    for (const g of [...new Set(genres.map((x) => x.trim()).filter(Boolean))])
      await conn.query('INSERT INTO MOVIE_GENRE (Movie_ID, Genre) VALUES (?, ?)', [res.insertId, g]);
    await conn.commit();
    return ok({ Movie_ID: res.insertId }, 201);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});
