// Redis (NoSQL) data-access for movie reviews.
// Key design – identical to redis/seed_reviews.sh:
//   cine:review:<movieId>:<userId>  HASH
//   cine:movie:<movieId>:reviews    SET  (review keys)
//   cine:user:<userId>:reviews      SET  (review keys)
//   cine:top_rated                  ZSET (movieId -> average rating)
import { createClient } from 'redis';

const g = globalThis;

export async function redis() {
  if (!g.__redis) {
    const c = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
    c.on('error', (e) => console.error('Redis error', e.message));
    g.__redis = c.connect().then(() => c);
  }
  return g.__redis;
}

const reviewKey = (m, u) => `cine:review:${m}:${u}`;

// Lua script: recompute a movie's average atomically inside Redis
const RECALC = `
local ks = redis.call('SMEMBERS', KEYS[1])
local s = 0
for _, k in ipairs(ks) do s = s + tonumber(redis.call('HGET', k, 'rating')) end
if #ks == 0 then redis.call('ZREM', 'cine:top_rated', ARGV[1]) return '0' end
local avg = s / #ks
redis.call('ZADD', 'cine:top_rated', avg, ARGV[1])
return tostring(avg)`;

async function recalc(r, movieId) {
  return r.eval(RECALC, { keys: [`cine:movie:${movieId}:reviews`], arguments: [String(movieId)] });
}

// READ – all reviews of one movie
export async function getMovieReviews(movieId) {
  const r = await redis();
  const keys = await r.sMembers(`cine:movie:${movieId}:reviews`);
  const rows = await Promise.all(keys.map((k) => r.hGetAll(k)));
  return rows
    .filter((x) => x && x.movie_id)
    .map((x) => ({ ...x, rating: Number(x.rating), user_id: Number(x.user_id) }))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

// READ – all reviews written by one user (customer profile)
export async function getUserReviews(userId) {
  const r = await redis();
  const keys = await r.sMembers(`cine:user:${userId}:reviews`);
  const rows = await Promise.all(keys.map((k) => r.hGetAll(k)));
  return rows
    .filter((x) => x && x.movie_id)
    .map((x) => ({ ...x, rating: Number(x.rating), user_id: Number(x.user_id), movie_id: Number(x.movie_id) }))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

// READ – every review (admin moderation)
export async function getAllReviews() {
  const r = await redis();
  const out = [];
  for await (const k of r.scanIterator({ MATCH: 'cine:review:*', COUNT: 100 })) {
    const h = await r.hGetAll(k);
    if (h.movie_id) out.push({ ...h, rating: Number(h.rating), user_id: Number(h.user_id) });
  }
  return out.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

// CREATE / UPDATE – one review per (movie, user); writing again updates it
export async function upsertReview({ movieId, userId, userName, rating, comment }) {
  const r = await redis();
  const key = reviewKey(movieId, userId);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const exists = await r.exists(key);
  await r
    .multi()
    .hSet(key, {
      movie_id: String(movieId),
      user_id: String(userId),
      user_name: userName,
      rating: String(rating),
      comment,
      updated_at: now,
      ...(exists ? {} : { created_at: now }),
    })
    .sAdd(`cine:movie:${movieId}:reviews`, key)
    .sAdd(`cine:user:${userId}:reviews`, key)
    .exec();
  const avg = await recalc(r, movieId);
  return { updated: !!exists, average: Number(avg) };
}

// DELETE
export async function deleteReview(movieId, userId) {
  const r = await redis();
  const key = reviewKey(movieId, userId);
  const [deleted] = await r
    .multi()
    .del(key)
    .sRem(`cine:movie:${movieId}:reviews`, key)
    .sRem(`cine:user:${userId}:reviews`, key)
    .exec();
  await recalc(r, movieId);
  return Number(deleted) > 0;
}

// map movieId -> average rating, from the sorted set
export async function ratingMap() {
  const r = await redis();
  const rows = await r.zRangeWithScores('cine:top_rated', 0, -1);
  return Object.fromEntries(rows.map((x) => [x.value, Math.round(x.score * 10) / 10]));
}

export async function topRated(n = 5) {
  const r = await redis();
  return r.zRangeWithScores('cine:top_rated', 0, n - 1, { REV: true });
}
