#!/usr/bin/env bash
# =====================================================================
#  Redis SEAT-HOLD demo  (8th mark – NoSQL used for a real job)
#  Run:  bash redis/holds_demo.sh
#
#  Same key design the web app uses (web/lib/holds.js):
#     cine:hold:<showId>:<seat>   STRING   value = userId   TTL = 300 s
#  Each step prints the exact redis-cli command, so you can also type
#  them by hand inside `redis-cli` during the demo.
# =====================================================================
R="redis-cli -n 0"
run () { echo; echo "redis> $*"; $R "$@"; }
KEY="cine:hold:1:C5"
RELEASE_LUA="if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end"

$R DEL "$KEY" >/dev/null

echo "========== 1. Nikita (user 4) taps seat C5 -> hold it for 5 minutes =========="
run SET "$KEY" 4 NX EX 300            # OK  -> hold granted

echo; echo "========== 2. Rahul (user 5) taps the SAME seat a moment later =========="
run SET "$KEY" 5 NX EX 300            # (nil) -> NX = only if not exists -> refused
run GET "$KEY"                        # still 4 -> Nikita owns it

echo; echo "========== 3. Hold expires on its own (TTL) =========="
run TTL "$KEY"                        # ~300 seconds left
sleep 2
run TTL "$KEY"                        # counting down – if Nikita closes the tab, seat frees itself

echo; echo "========== 4. Safe release (Lua compare-and-delete) =========="
echo; echo "redis> EVAL <release-lua> 1 $KEY 5      # Rahul tries to release Nikita's hold"
$R EVAL "$RELEASE_LUA" 1 "$KEY" 5     # 0 -> not his, nothing deleted
echo; echo "redis> EVAL <release-lua> 1 $KEY 4      # Nikita pays / closes the seat map"
$R EVAL "$RELEASE_LUA" 1 "$KEY" 4     # 1 -> released
run EXISTS "$KEY"                     # 0 -> seat free again

echo; echo "========== 5. What the seat map reads every 4 seconds =========="
$R SET cine:hold:1:A1 4 NX EX 300 >/dev/null
$R SET cine:hold:1:A2 4 NX EX 300 >/dev/null
run MGET cine:hold:1:A1 cine:hold:1:A2 cine:hold:1:A3   # 4, 4, (nil) -> A1/A2 held, A3 free
run KEYS "cine:hold:1:*"
$R DEL cine:hold:1:A1 cine:hold:1:A2 >/dev/null
echo; echo "(demo keys cleaned up)"
