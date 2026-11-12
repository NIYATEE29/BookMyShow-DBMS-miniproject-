#!/usr/bin/env bash
# =====================================================================
#  NoSQL part (Redis) : Movie reviews & ratings
#  Run:   bash redis/seed_reviews.sh          (redis-server must be running)
#
#  Why Redis for reviews?
#   * reviews are free-text, schema-less & read-heavy -> key-value/hash fits
#   * "top rated movies" leaderboard = Redis SORTED SET (O(log n) ranking)
#   * keeps the transactional MySQL schema small (faculty: reduce entities)
#   * Movie_ID / User_ID link back to MySQL MOVIE / USERS (polyglot persistence)
#
#  Key design (namespace "cine:")
#   cine:review:<movieId>:<userId>  HASH  movie_id,user_id,user_name,rating,comment,created_at,updated_at
#   cine:movie:<movieId>:reviews    SET   keys of all reviews of that movie
#   cine:user:<userId>:reviews      SET   keys of all reviews written by a user
#   cine:top_rated                  ZSET  member = movieId, score = average rating
# =====================================================================
R="redis-cli -n 0"

echo "== clearing old cine:* keys"
for k in $($R --scan --pattern 'cine:*'); do $R DEL "$k" > /dev/null; done

add_review () {   # movieId userId userName rating comment
  local key="cine:review:$1:$2"
  local now; now=$(date '+%Y-%m-%d %H:%M:%S')
  $R HSET "$key" movie_id "$1" user_id "$2" user_name "$3" rating "$4" \
                 comment "$5" created_at "$now" updated_at "$now" > /dev/null
  $R SADD "cine:movie:$1:reviews" "$key" > /dev/null
  $R SADD "cine:user:$2:reviews"  "$key" > /dev/null
}

# recompute a movie's average rating with a Lua script (runs atomically inside Redis)
recalc () {
  $R EVAL "local ks = redis.call('SMEMBERS', KEYS[1])
           local s = 0
           for _, k in ipairs(ks) do s = s + tonumber(redis.call('HGET', k, 'rating')) end
           if #ks == 0 then redis.call('ZREM', 'cine:top_rated', ARGV[1]) return '0' end
           local avg = s / #ks
           redis.call('ZADD', 'cine:top_rated', avg, ARGV[1])
           return tostring(avg)" 1 "cine:movie:$1:reviews" "$1" > /dev/null
}

echo "== CREATE : inserting reviews"
add_review 1 4  "Nikita"  5 "Mind-bending visuals, the docking scene is unreal."
add_review 1 5  "Rahul"   4 "Long but worth it. Watch on the biggest screen."
add_review 1 7  "Arjun"   5 "Hans Zimmer score gave me chills."
add_review 2 8  "Kavya"   5 "Rewatched for the 10th time, still laugh out loud."
add_review 2 11 "Divya"   4 "Feel-good classic."
add_review 3 6  "Sneha"   5 "That climax! Rishab Shetty is incredible."
add_review 3 12 "Karan"   4 "Great folklore storytelling."
add_review 4 9  "Priya"   4 "Need to watch it twice to get it."
add_review 4 5  "Rahul"   3 "Confusing ending but great action."
add_review 5 10 "Rohan"   5 "Naatu Naatu in a theatre is a festival."
add_review 5 6  "Sneha"   4 "Over the top in the best way."

for m in 1 2 3 4 5; do recalc $m; done

echo "== done. Summary:"
echo -n "total review hashes : "; $R --scan --pattern 'cine:review:*' | wc -l
echo "top rated (movieId, avg):"
$R ZREVRANGE cine:top_rated 0 -1 WITHSCORES
