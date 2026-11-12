// GET /api/theatres – cinemas with address + number of upcoming shows (Browse by Cinemas)
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole();
  return ok(await q(s.role,
    `SELECT t.Theatre_ID, t.Name, t.City, t.Address,
            COUNT(sh.Show_ID) AS Upcoming_Shows,
            COUNT(DISTINCT sh.Movie_ID) AS Movies
       FROM THEATRE t
       LEFT JOIN SCREEN sc ON sc.Theatre_ID = t.Theatre_ID
       LEFT JOIN SHOWS  sh ON sh.Screen_ID  = sc.Screen_ID AND sh.Show_Time > NOW()
      GROUP BY t.Theatre_ID, t.Name, t.City, t.Address
      ORDER BY t.Name`));
});
