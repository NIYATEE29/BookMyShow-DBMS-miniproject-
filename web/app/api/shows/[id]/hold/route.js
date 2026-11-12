// POST /api/shows/:id/hold
//   {action:'hold', seat:'C5'}          – hold one seat for 5 minutes (Redis SET NX EX)
//   {action:'release', seats:['C5']}    – release my holds (closing the seat map)
import { q } from '@/lib/db';
import { route, ok, HttpError } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { holdSeat, releaseSeats, HOLD_SECONDS } from '@/lib/holds';

export const dynamic = 'force-dynamic';

const SEAT = /^[A-Z]\d{1,2}$/;

export const POST = route(async (req, { params }) => {
  const s = await requireRole('CUSTOMER');
  const { action, seat, seats = [] } = await req.json();

  if (action === 'release') {
    const list = seats.filter((x) => SEAT.test(x));
    try { await releaseSeats(params.id, list, s.uid); } catch {}
    return ok({ released: list.length });
  }

  if (!SEAT.test(seat || '')) throw new HttpError(400, 'Invalid seat');
  const [show] = await q('CUSTOMER', 'SELECT Show_Time > NOW() AS Upcoming FROM SHOWS WHERE Show_ID = ?', [params.id]);
  if (!show) throw new HttpError(404, 'Show not found');
  if (!show.Upcoming) throw new HttpError(400, 'This show has already started');

  const [sold] = await q('CUSTOMER',
    'SELECT COUNT(*) AS n FROM BOOKING_SEAT WHERE Show_ID = ? AND Row_No = ? AND Seat_No = ?',
    [params.id, seat[0], Number(seat.slice(1))]);
  if (sold.n) throw new HttpError(409, `Seat ${seat} has just been sold. Please pick another seat.`);

  let held;
  try { held = await holdSeat(params.id, seat, s.uid); } catch { return ok({ held: true, seconds: null }); }
  if (!held) throw new HttpError(409, `Seat ${seat} is on hold – someone else is booking it right now.`);
  return ok({ held: true, seconds: HOLD_SECONDS });
});
