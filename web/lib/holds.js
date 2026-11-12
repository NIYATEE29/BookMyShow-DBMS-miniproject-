// Temporary seat holds in Redis (NoSQL use case #2).
// While customer A is picking seats, each picked seat is "held" for 5 minutes,
// so customer B sees it as ON HOLD and cannot pick it.
//   cine:hold:<showId>:<seat>   STRING  value = userId   TTL = 300 s
// SET ... NX makes the hold atomic (only one user can win a seat);
// the TTL frees seats automatically if A closes the tab or never pays.
// The final guarantee against double booking is still MySQL's
// UNIQUE(Show_ID, Screen_ID, Row_No, Seat_No) on BOOKING_SEAT.
import { redis } from './reviews';

export const HOLD_SECONDS = 300;
const key = (showId, seat) => `cine:hold:${showId}:${seat}`;

// release only if the hold belongs to this user (compare-and-delete, atomic in Redis)
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

// returns true if this user now holds the seat
export async function holdSeat(showId, seat, uid) {
  const r = await redis();
  const k = key(showId, seat);
  for (let i = 0; i < 2; i++) {
    if (await r.set(k, String(uid), { NX: true, EX: HOLD_SECONDS })) return true;
    const owner = await r.get(k);
    if (owner === String(uid)) { await r.expire(k, HOLD_SECONDS); return true; }
    if (owner) return false; // someone else has it
    // key expired between SET and GET -> try once more
  }
  return false;
}

export async function releaseSeats(showId, seats, uid) {
  const r = await redis();
  await Promise.all(seats.map((s) => r.eval(RELEASE, { keys: [key(showId, s)], arguments: [String(uid)] })));
}

// { 'A1': '12', 'A2': null, ... } -> who holds each seat (null = free)
export async function holdOwners(showId, seats) {
  if (!seats.length) return {};
  const r = await redis();
  const vals = await r.mGet(seats.map((s) => key(showId, s)));
  return Object.fromEntries(seats.map((s, i) => [s, vals[i]]));
}

// seconds left on this user's holds for a show (for the countdown in the seat map)
export async function holdTtl(showId, seat) {
  const r = await redis();
  return r.ttl(key(showId, seat));
}
