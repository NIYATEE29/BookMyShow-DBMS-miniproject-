// GET /api/movies – catalogue with genres (multivalued attr) + avg rating from Redis
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { ratingMap } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole();
  const movies = await q(s.role,
    `SELECT m.*, GROUP_CONCAT(g.Genre ORDER BY g.Genre SEPARATOR ', ') AS Genres,
            (SELECT COUNT(*) FROM SHOWS sh WHERE sh.Movie_ID = m.Movie_ID) AS Show_Count
       FROM MOVIE m LEFT JOIN MOVIE_GENRE g ON g.Movie_ID = m.Movie_ID
      GROUP BY m.Movie_ID
      ORDER BY m.Title`);
  let ratings = {};
  try { ratings = await ratingMap(); } catch {}
  return ok(movies.map((m) => ({ ...m, Rating: ratings[m.Movie_ID] ?? null })));
});
