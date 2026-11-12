// GET /api/shows  – upcoming shows (view v_show_details, uses fn_seats_left)
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { ratingMap } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole();
  const shows = await q(s.role,
    `SELECT v.*,
            (SELECT GROUP_CONCAT(Genre ORDER BY Genre SEPARATOR ', ')
               FROM MOVIE_GENRE g WHERE g.Movie_ID = v.Movie_ID) AS Genres,
            mv.Poster_URL, mv.Release_Date
       FROM v_show_details v
       JOIN MOVIE mv ON mv.Movie_ID = v.Movie_ID
      WHERE v.Show_Time > NOW()
      ORDER BY v.Show_Time`);
  let ratings = {};
  try { ratings = await ratingMap(); } catch {}
  return ok(shows.map((x) => ({ ...x, Rating: ratings[x.Movie_ID] ?? null })));
});
