#!/usr/bin/env bash
# =====================================================================
#  Redis R-U-D demo (Read, Update, Delete) on movie reviews
#  Run after seed_reviews.sh:   bash redis/rud_demo.sh
#  (each step prints the exact redis-cli command so you can also type
#   them by hand inside `redis-cli` during the viva)
# =====================================================================
R="redis-cli -n 0"
run () { echo; echo "redis> $*"; $R "$@"; }

RECALC_LUA="local ks = redis.call('SMEMBERS', KEYS[1])
local s = 0
for _, k in ipairs(ks) do s = s + tonumber(redis.call('HGET', k, 'rating')) end
if #ks == 0 then redis.call('ZREM', 'cine:top_rated', ARGV[1]) return '0' end
local avg = s / #ks
redis.call('ZADD', 'cine:top_rated', avg, ARGV[1])
return tostring(avg)"

echo "================ READ ================"
run HGETALL  cine:review:1:4                         # one review (Nikita on Interstellar)
run SMEMBERS cine:movie:1:reviews                    # all reviews of movie 1
run HMGET    cine:review:1:5 user_name rating comment
run SMEMBERS cine:user:5:reviews                     # everything Rahul reviewed
run ZREVRANGE cine:top_rated 0 2 WITHSCORES          # top-3 rated movies
run ZSCORE   cine:top_rated 4                        # avg rating of Inception

echo; echo "================ UPDATE ================"
run HSET cine:review:4:5 rating 5 comment "Second watch - finally understood it. Masterpiece." \
         updated_at "$(date '+%Y-%m-%d %H:%M:%S')"
run HGETALL cine:review:4:5
echo; echo "redis> EVAL <recalc-average lua> 1 cine:movie:4:reviews 4"
$R EVAL "$RECALC_LUA" 1 cine:movie:4:reviews 4
run ZSCORE cine:top_rated 4                          # 3.5 -> 4.5

echo; echo "================ DELETE ================"
run DEL  cine:review:2:11                            # Divya deletes her review
run SREM cine:movie:2:reviews cine:review:2:11
run SREM cine:user:11:reviews cine:review:2:11
echo; echo "redis> EVAL <recalc-average lua> 1 cine:movie:2:reviews 2"
$R EVAL "$RECALC_LUA" 1 cine:movie:2:reviews 2
run EXISTS cine:review:2:11                          # 0 -> gone
run ZREVRANGE cine:top_rated 0 -1 WITHSCORES
