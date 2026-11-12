// =====================================================================
//  CineBook – concurrency & load test  (proof for "real-world viability")
//
//  Run from the project folder AFTER the database + Redis are set up:
//      node scripts/concurrency_test.js
//  (uses mysql2 + redis from web/node_modules – run `npm install` in web/ once)
//
//  What it proves
//   T1  50 customers click "Pay" for the SAME seat at the SAME moment
//       -> exactly 1 booking succeeds, 49 are rejected, and no half-made
//          booking / payment is left behind (transaction rollback).
//   T2  50 customers try to HOLD the same seat in Redis at the same moment
//       -> exactly 1 hold is granted (SET NX is atomic).
//   T3  Throughput: 500 real bookings (different seats, 10 shows) through
//       sp_book_seats on a 10-connection pool -> bookings/second.
//   T4  Two cancels of the SAME booking at the same moment
//       -> 1 refund only (SELECT ... FOR UPDATE row lock).
//
//  Everything the test creates is deleted at the end (DB is left as before).
//  Connects as cine_customer (same DB account the web app uses for customers)
//  and cine_admin (only for set-up / clean-up).
// =====================================================================
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(__dirname, '..', 'web', 'package.json'));
const mysql = req('mysql2/promise');
const { createClient } = req('redis');

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'movie_ticket_booking',
};
const CUSTOMER = { ...DB, user: 'cine_customer', password: process.env.DB_CUSTOMER_PASS || 'Customer@123' };
const ADMIN = { ...DB, user: 'cine_admin', password: process.env.DB_ADMIN_PASS || 'Admin@123' };

const line = (s = '') => console.log(s);
const head = (s) => { line(); line('='.repeat(68)); line(' ' + s); line('='.repeat(68)); };

async function main() {
  const admin = await mysql.createConnection(ADMIN);
  const created = [];          // booking ids to clean up
  const redis = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
  await redis.connect();

  // empty future shows + bulk customers to use as test users
  const [shows] = await admin.query(
    `SELECT Show_ID FROM SHOWS
      WHERE Show_Time > NOW() + INTERVAL 2 HOUR AND fn_seats_left(Show_ID) = 50
      ORDER BY Show_ID LIMIT 11`);
  if (shows.length < 11) throw new Error('Need 11 empty future shows – run sql/11_upgrade.sql first');
  const [users] = await admin.query(
    `SELECT User_ID FROM USERS WHERE Role = 'CUSTOMER' ORDER BY User_ID DESC LIMIT 500`);
  const [[before]] = await admin.query(
    'SELECT (SELECT COUNT(*) FROM BOOKING) b, (SELECT COUNT(*) FROM PAYMENT) p, (SELECT COUNT(*) FROM BOOKING_SEAT) s');

  // ------------------------------------------------------------------ T1
  head('T1  50 customers book the SAME seat at the SAME time (MySQL)');
  const show1 = shows[0].Show_ID;
  const conns = await Promise.all(Array.from({ length: 50 }, () => mysql.createConnection(CUSTOMER)));
  const t1 = Date.now();
  const res1 = await Promise.allSettled(conns.map((c, i) =>
    c.query('CALL sp_book_seats(?, ?, ?, ?, @b)', [users[i].User_ID, show1, 'C5', 'UPI'])
     .then(() => c.query('SELECT @b AS id')).then(([[r]]) => r.id)));
  const ms1 = Date.now() - t1;
  await Promise.all(conns.map((c) => c.end()));
  const ok1 = res1.filter((r) => r.status === 'fulfilled');
  const errs = {};
  res1.filter((r) => r.status === 'rejected').forEach((r) => {
    const k = r.reason.code || r.reason.message; errs[k] = (errs[k] || 0) + 1; });
  ok1.forEach((r) => created.push(r.value));
  const [[c1]] = await admin.query(
    `SELECT (SELECT COUNT(*) FROM BOOKING WHERE Show_ID = ?) bookings,
            (SELECT COUNT(*) FROM BOOKING_SEAT WHERE Show_ID = ? AND Row_No='C' AND Seat_No=5) seat_rows,
            (SELECT COUNT(*) FROM PAYMENT p JOIN BOOKING b ON b.Booking_ID = p.Booking_ID WHERE b.Show_ID = ?) payments`,
    [show1, show1, show1]);
  line(`  attempts            : 50   (show ${show1}, seat C5)`);
  line(`  succeeded           : ${ok1.length}`);
  line(`  rejected            : ${50 - ok1.length}   ${JSON.stringify(errs)}`);
  line(`  rows left in DB     : BOOKING=${c1.bookings}  BOOKING_SEAT=${c1.seat_rows}  PAYMENT=${c1.payments}`);
  line(`  time                : ${ms1} ms`);
  line(`  RESULT              : ${ok1.length === 1 && c1.bookings === 1 && c1.payments === 1 ? 'PASS – no double booking, failed attempts fully rolled back' : 'FAIL'}`);

  // ------------------------------------------------------------------ T2
  head('T2  50 customers HOLD the same seat at the same time (Redis)');
  const hk = `cine:hold:${shows[1].Show_ID}:D7`;
  await redis.del(hk);
  const t2 = Date.now();
  const res2 = await Promise.all(users.slice(0, 50).map((u) =>
    redis.set(hk, String(u.User_ID), { NX: true, EX: 300 })));
  const ms2 = Date.now() - t2;
  const winners = res2.filter((r) => r === 'OK').length;
  line(`  attempts            : 50   (key ${hk})`);
  line(`  holds granted       : ${winners}`);
  line(`  holder / TTL        : user ${await redis.get(hk)} / ${await redis.ttl(hk)} s`);
  line(`  time                : ${ms2} ms`);
  line(`  RESULT              : ${winners === 1 ? 'PASS – SET NX is atomic, one winner' : 'FAIL'}`);
  await redis.del(hk);

  // ------------------------------------------------------------------ T3
  head('T3  Throughput – 500 bookings (10 shows x 50 seats) on a 10-connection pool');
  const pool = mysql.createPool({ ...CUSTOMER, connectionLimit: 10 });
  const seatIds = [];
  for (const r of 'ABCDE') for (let n = 1; n <= 10; n++) seatIds.push(r + n);
  const jobs = [];
  shows.slice(1, 11).forEach((s, si) => seatIds.forEach((seat, k) =>
    jobs.push({ show: s.Show_ID, seat, user: users[(si * 50 + k) % users.length].User_ID })));
  const t3 = Date.now();
  const res3 = await Promise.allSettled(jobs.map(async (j) => {
    const c = await pool.getConnection();
    try {
      await c.query('CALL sp_book_seats(?, ?, ?, ?, @b)', [j.user, j.show, j.seat, 'UPI']);
      const [[r]] = await c.query('SELECT @b AS id');
      return r.id;
    } finally { c.release(); }
  }));
  const ms3 = Date.now() - t3;
  await pool.end();
  const ok3 = res3.filter((r) => r.status === 'fulfilled');
  ok3.forEach((r) => created.push(r.value));
  const [[c3]] = await admin.query(
    `SELECT COUNT(*) n, SUM(fn_seats_left(Show_ID) = 0) full_shows FROM SHOWS WHERE Show_ID IN (?)`,
    [shows.slice(1, 11).map((s) => s.Show_ID)]);
  line(`  bookings requested  : ${jobs.length}`);
  line(`  bookings committed  : ${ok3.length}   (failed: ${jobs.length - ok3.length})`);
  line(`  shows now sold out  : ${c3.full_shows} / ${c3.n}`);
  line(`  total time          : ${ms3} ms`);
  line(`  throughput          : ${(ok3.length / (ms3 / 1000)).toFixed(0)} bookings/second  (each = 1 transaction: BOOKING + seat + PAYMENT + 2 triggers)`);

  // ------------------------------------------------------------------ T4
  head('T4  Two cancels of the SAME booking at the same time (row lock)');
  const target = ok3[0].value;
  const [[owner]] = await admin.query('SELECT User_ID FROM BOOKING WHERE Booking_ID = ?', [target]);
  const a = await mysql.createConnection(CUSTOMER);
  const b = await mysql.createConnection(CUSTOMER);
  const res4 = await Promise.allSettled([
    a.query('CALL sp_cancel_booking(?, ?)', [target, owner.User_ID]),
    b.query('CALL sp_cancel_booking(?, ?)', [target, owner.User_ID]),
  ]);
  await a.end(); await b.end();
  const [[c4]] = await admin.query(
    `SELECT b.Status, p.Status AS Payment FROM BOOKING b JOIN PAYMENT p ON p.Booking_ID = b.Booking_ID WHERE b.Booking_ID = ?`, [target]);
  line(`  booking             : ${target}`);
  res4.forEach((r, i) => line(`  cancel #${i + 1}           : ${r.status === 'fulfilled' ? 'OK' : 'REJECTED – ' + r.reason.message}`));
  line(`  final state         : Booking ${c4.Status}, Payment ${c4.Payment}`);
  line(`  RESULT              : ${res4.filter((r) => r.status === 'fulfilled').length === 1 ? 'PASS – refunded exactly once' : 'FAIL'}`);

  // ------------------------------------------------------------------ clean-up
  if (created.length) await admin.query('DELETE FROM BOOKING WHERE Booking_ID IN (?)', [created]); // cascades to seats + payment
  const [[after]] = await admin.query(
    'SELECT (SELECT COUNT(*) FROM BOOKING) b, (SELECT COUNT(*) FROM PAYMENT) p, (SELECT COUNT(*) FROM BOOKING_SEAT) s');
  head('Clean-up');
  line(`  test bookings removed : ${created.length}`);
  line(`  DB back to original   : ${before.b === after.b && before.p === after.p && before.s === after.s ? 'yes' : 'NO'} (BOOKING ${after.b}, PAYMENT ${after.p}, BOOKING_SEAT ${after.s})`);
  line();
  await admin.end();
  await redis.quit();
}

main().catch((e) => { console.error('Test aborted:', e.message); process.exit(1); });
