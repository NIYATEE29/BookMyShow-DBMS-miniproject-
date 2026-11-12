-- =====================================================================
--  File 12 : FUTURE SHOWS + UPCOMING BOOKINGS                MySQL 8.0
--  CineBook – Online Movie Ticket Booking & Theatre Management System
--
--  Run (after 01 → 11):
--     mysql -u root -p movie_ticket_booking < sql/12_future_shows.sql
--
--  1. Schedules shows on every screen from TODAY up to 19 Nov 2026
--     (or 5 days ahead, whichever is later – so the demo never runs dry):
--     4 slots per screen per day, clash-checked exactly like sp_add_show.
--  2. Books seats on about two thirds of those shows THROUGH sp_book_seats
--     (so triggers fill Total_Amount and a PAYMENT row is created), giving
--     a realistic mix: empty / available / fast filling / a few sold out.
--     Every third show (Show_ID % 3 = 0) is left EMPTY on purpose – the
--     demo notepad and the concurrency test need empty future shows.
--
--  Safe to run again: existing shows are skipped (INSERT IGNORE + clash
--  check) and a show that already has bookings is never booked again.
-- =====================================================================
USE movie_ticket_booking;

SET @end_day = GREATEST(DATE '2026-11-19', CURDATE() + INTERVAL 5 DAY);
SET @days    = DATEDIFF(@end_day, CURDATE());
SET SESSION cte_max_recursion_depth = 1000;

-- ---------------------------------------------------------------------
-- 1. SHOWS : today .. @end_day, 4 slots per screen, rotating line-up
-- ---------------------------------------------------------------------
INSERT IGNORE INTO SHOWS (Movie_ID, Screen_ID, Show_Time, Base_Price)
WITH RECURSIVE
  days  AS (SELECT 0 AS d UNION ALL SELECT d + 1 FROM days WHERE d < @days),
  slots AS (SELECT 0 AS k, '10:00:00' AS t UNION ALL SELECT 1, '13:45:00'
            UNION ALL SELECT 2, '17:30:00' UNION ALL SELECT 3, '21:15:00'),
  lineup AS (SELECT 0 AS n, 'Interstellar' AS Title UNION ALL SELECT 1, 'Jawan'
             UNION ALL SELECT 2, 'Kantara'       UNION ALL SELECT 3, 'Dune: Part Two'
             UNION ALL SELECT 4, '3 Idiots'      UNION ALL SELECT 5, 'Kalki 2898 AD'
             UNION ALL SELECT 6, 'Inside Out 2'  UNION ALL SELECT 7, 'RRR'
             UNION ALL SELECT 8, 'Oppenheimer'   UNION ALL SELECT 9, 'Laapataa Ladies'
             UNION ALL SELECT 10, 'Inception'    UNION ALL SELECT 11, 'Manjummel Boys'
             UNION ALL SELECT 12, 'The Matrix'),
  cand AS (
    SELECT m.Movie_ID, m.Duration_Min, sc.Screen_ID,
           TIMESTAMP(CURDATE() + INTERVAL days.d DAY, slots.t)
             + INTERVAL IF(sc.Screen_No = 2, 30, 0) MINUTE              AS Show_Time,
           ELT(slots.k + 1, 180, 220, 260, 300) + IF(sc.Screen_No = 1, 20, 0) AS Base_Price
      FROM days
     CROSS JOIN slots
     CROSS JOIN SCREEN sc
      JOIN lineup l ON l.n = (days.d * 3 + sc.Theatre_ID * 4
                              + IF(sc.Screen_No = 1, slots.k, (slots.k + 4) % 5)) % 13
      JOIN MOVIE m  ON m.Title = l.Title)
SELECT c.Movie_ID, c.Screen_ID, c.Show_Time, c.Base_Price
  FROM cand c
 WHERE c.Show_Time > NOW() + INTERVAL 1 HOUR            -- nothing in the past
   -- same clash rule as sp_add_show: movie length + 20 min cleaning
   AND NOT EXISTS (
        SELECT 1 FROM SHOWS s2 JOIN MOVIE m2 ON m2.Movie_ID = s2.Movie_ID
         WHERE s2.Screen_ID = c.Screen_ID
           AND s2.Show_Time < c.Show_Time + INTERVAL (c.Duration_Min + 20) MINUTE
           AND c.Show_Time  < s2.Show_Time + INTERVAL (m2.Duration_Min + 20) MINUTE);

-- ---------------------------------------------------------------------
-- 2. UPCOMING BOOKINGS through the real booking procedure
-- ---------------------------------------------------------------------
-- customers to book for: named demo customers (nikita@, rahul@ …) and the 4,200 bulk ones
DROP TEMPORARY TABLE IF EXISTS tmp_named;
DROP TEMPORARY TABLE IF EXISTS tmp_bulk;
CREATE TEMPORARY TABLE tmp_named (rn INT PRIMARY KEY, uid INT NOT NULL);
CREATE TEMPORARY TABLE tmp_bulk  (rn INT PRIMARY KEY, uid INT NOT NULL);
INSERT INTO tmp_named (rn, uid)
SELECT ROW_NUMBER() OVER (ORDER BY User_ID), User_ID FROM USERS
 WHERE Role = 'CUSTOMER' AND Email NOT REGEXP '^customer[0-9]+@';      -- nikita@, rahul@ …
INSERT INTO tmp_bulk (rn, uid)
SELECT ROW_NUMBER() OVER (ORDER BY User_ID), User_ID FROM USERS
 WHERE Role = 'CUSTOMER' AND Email REGEXP '^customer[0-9]+@';          -- the 4,200 bulk customers
SET @n_named = (SELECT COUNT(*) FROM tmp_named);
SET @n_bulk  = (SELECT COUNT(*) FROM tmp_bulk);

DROP PROCEDURE IF EXISTS tmp_seed_future_bookings;
DELIMITER $$
CREATE PROCEDURE tmp_seed_future_bookings()
BEGIN
  DECLARE done    INT DEFAULT 0;
  DECLARE v_show  INT;
  DECLARE v_scr   INT;
  DECLARE v_n     INT;      -- bookings to make on this show
  DECLARE v_i     INT;
  DECLARE v_k     INT;      -- seats in one booking
  DECLARE v_user  INT;
  DECLARE v_seats VARCHAR(255);
  DECLARE v_b     INT;
  DECLARE cur CURSOR FOR
    SELECT s.Show_ID, s.Screen_ID
      FROM SHOWS s
     WHERE s.Show_Time > NOW() + INTERVAL 1 HOUR
       AND s.Show_Time < @end_day + INTERVAL 1 DAY
       AND s.Show_ID % 3 <> 0                             -- every 3rd show stays empty
       AND NOT EXISTS (SELECT 1 FROM BOOKING b WHERE b.Show_ID = s.Show_ID)
     ORDER BY s.Show_ID;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  shows_loop: LOOP
    FETCH cur INTO v_show, v_scr;
    IF done THEN LEAVE shows_loop; END IF;

    -- demand mix: most shows a few bookings, some busy, ~1 in 17 sold out
    SET v_n = CASE
                WHEN v_show % 17 = 1 THEN 99                   -- fill to sold out
                WHEN v_show % 5  = 1 THEN 15 + v_show % 4      -- fast filling (35+ seats)
                ELSE 1 + v_show % 4                            -- 1–4 bookings
              END;
    SET v_i = 0;
    WHILE v_i < v_n AND fn_seats_left(v_show) > 0 DO
      SET v_k    = LEAST(1 + (v_show + v_i) % 4, fn_seats_left(v_show));   -- 1–4 seats
      -- mostly the 4,200 registered customers, every 5th booking by a named demo customer
      -- (picked from real, existing customer rows – User_IDs differ between databases)
      IF (v_show + v_i) % 5 = 0 THEN
        SELECT uid INTO v_user FROM tmp_named WHERE rn = 1 + (v_show * 7 + v_i * 5) % @n_named;
      ELSE
        SELECT uid INTO v_user FROM tmp_bulk  WHERE rn = 1 + (v_show * 37 + v_i * 101) % @n_bulk;
      END IF;
      -- next free seats in a show-specific shuffled order
      SELECT GROUP_CONCAT(CONCAT(st.Row_No, st.Seat_No)
                          ORDER BY MOD(ASCII(st.Row_No) * 7 + st.Seat_No * 13 + v_show * 5, 50),
                                   st.Row_No, st.Seat_No)
        INTO v_seats
        FROM (SELECT se.Row_No, se.Seat_No
                FROM SEAT se
               WHERE se.Screen_ID = v_scr
                 AND NOT EXISTS (SELECT 1 FROM BOOKING_SEAT bs
                                  WHERE bs.Show_ID = v_show
                                    AND bs.Row_No = se.Row_No AND bs.Seat_No = se.Seat_No)
               ORDER BY MOD(ASCII(se.Row_No) * 7 + se.Seat_No * 13 + v_show * 5, 50),
                        se.Row_No, se.Seat_No
               LIMIT 4) st;
      SET v_seats = SUBSTRING_INDEX(v_seats, ',', v_k);
      CALL sp_book_seats(v_user, v_show, v_seats, ELT(1 + (v_show + v_i) % 3, 'UPI', 'CARD', 'CASH'), v_b);
      SET v_i = v_i + 1;
    END WHILE;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

CALL tmp_seed_future_bookings();
DROP PROCEDURE tmp_seed_future_bookings;
DROP TEMPORARY TABLE tmp_named;
DROP TEMPORARY TABLE tmp_bulk;

-- ---------------------------------------------------------------------
-- check
-- ---------------------------------------------------------------------
SELECT DATE(x.Show_Time)              AS Day,
       COUNT(*)                         AS Shows,
       SUM(x.Seats_Left = 50)           AS Empty_Shows,
       SUM(x.Seats_Left BETWEEN 1 AND 15) AS Fast_Filling,
       SUM(x.Seats_Left = 0)            AS Sold_Out,
       SUM(x.Bookings)                  AS Bookings
  FROM (SELECT sh.Show_ID, sh.Show_Time, fn_seats_left(sh.Show_ID) AS Seats_Left,
               (SELECT COUNT(*) FROM BOOKING b
                 WHERE b.Show_ID = sh.Show_ID AND b.Status = 'CONFIRMED') AS Bookings
          FROM SHOWS sh WHERE sh.Show_Time >= CURDATE()) x
 GROUP BY DATE(x.Show_Time)
 ORDER BY Day;

SELECT u.First_Name, COUNT(*) AS Upcoming_Bookings
  FROM BOOKING b JOIN USERS u ON u.User_ID = b.User_ID JOIN SHOWS s ON s.Show_ID = b.Show_ID
 WHERE s.Show_Time > NOW() AND b.Status = 'CONFIRMED' AND u.Email NOT REGEXP '^customer[0-9]+@'   -- named demo customers
 GROUP BY u.User_ID, u.First_Name ORDER BY u.User_ID;
