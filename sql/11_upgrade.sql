-- =====================================================================
--  File 11 : UPGRADE (2 Nov 2026)                              MySQL 8.0
--  Brings an existing database up to date.  Safe to re-run.
--    1. THEATRE.Address           (Browse by Cinemas)
--    2. 3 roles: ADMIN (platform) / THEATRE_ADMIN (one theatre) / CUSTOMER
--       + platform admin login  admin@cine.com / admin123
--    3. sp_cancel_booking  -> TRANSACTION + SELECT ... FOR UPDATE (no race)
--    4. trg_shows_before_delete -> past shows cannot be deleted
--    5. DB role role_theatre / user cine_theatre (Theatre@123)
--    6. Shows for the next 5 days (recursive CTE generator)
--
--  Run as root, inside mysql:
--    SOURCE /Users/nikitamankani/Downloads/movie_ticket_booking/sql/11_upgrade.sql;
-- =====================================================================
USE movie_ticket_booking;

-- helper: run a DDL statement only when a condition holds (keeps the file re-runnable)
DROP PROCEDURE IF EXISTS tmp_exec_if;
DELIMITER $$
CREATE PROCEDURE tmp_exec_if(IN p_cond BOOLEAN, IN p_sql TEXT)
BEGIN
  IF p_cond THEN
    SET @ddl = p_sql;
    PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

-- ---------------- 1. THEATRE.Address ----------------
CALL tmp_exec_if((SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'THEATRE' AND COLUMN_NAME = 'Address'),
                 'ALTER TABLE THEATRE ADD COLUMN Address VARCHAR(200) NULL AFTER City');
UPDATE THEATRE SET Address = '3rd Floor, Galaxy Mall, 80 Feet Road, Koramangala 6th Block, Bengaluru 560095'
 WHERE Name = 'Galaxy Cinemas Koramangala' AND Address IS NULL;
UPDATE THEATRE SET Address = 'Level 4, Starlight Square, ITPL Main Road, Whitefield, Bengaluru 560066'
 WHERE Name = 'Starlight Multiplex Whitefield' AND Address IS NULL;
UPDATE THEATRE SET Address = '2nd Floor, Regal Arcade, 11th Main, 4th Block, Jayanagar, Bengaluru 560011'
 WHERE Name = 'Regal Screens Jayanagar' AND Address IS NULL;

-- (posters column, in case 09/10 were skipped)
CALL tmp_exec_if((SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MOVIE' AND COLUMN_NAME = 'Poster_URL'),
                 'ALTER TABLE MOVIE ADD COLUMN Poster_URL VARCHAR(255) NULL AFTER Release_Date');

-- ---------------- 2. three application roles ----------------
CALL tmp_exec_if((SELECT COUNT(*) > 0 FROM information_schema.TABLE_CONSTRAINTS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USERS' AND CONSTRAINT_NAME = 'chk_admin_theatre'),
                 'ALTER TABLE USERS DROP CHECK chk_admin_theatre');
CALL tmp_exec_if((SELECT COUNT(*) > 0 FROM information_schema.TABLE_CONSTRAINTS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USERS' AND CONSTRAINT_NAME = 'chk_users_role'),
                 'ALTER TABLE USERS DROP CHECK chk_users_role');
ALTER TABLE USERS MODIFY Role VARCHAR(15) NOT NULL DEFAULT 'CUSTOMER';

-- the three existing theatre-bound admins become THEATRE_ADMINs
UPDATE USERS SET Role = 'THEATRE_ADMIN' WHERE Role = 'ADMIN' AND Theatre_ID IS NOT NULL;

ALTER TABLE USERS
  ADD CONSTRAINT chk_users_role    CHECK (Role IN ('ADMIN','THEATRE_ADMIN','CUSTOMER')),
  ADD CONSTRAINT chk_admin_theatre CHECK ((Role = 'THEATRE_ADMIN' AND Theatre_ID IS NOT NULL)
                                       OR (Role <> 'THEATRE_ADMIN' AND Theatre_ID IS NULL));

-- platform admin (password admin123, same bcrypt hash as the seed file)
INSERT IGNORE INTO USERS (First_Name, Last_Name, Email, Password_Hash, Role)
VALUES ('Platform', 'Admin', 'admin@cine.com',
        '$2a$10$cQ3pzScmmGRoyK9qMb01eeEJrLhHXAWNN4B4bnNXCXWjgutiLy5Xm', 'ADMIN');

DROP PROCEDURE tmp_exec_if;

-- ---------------- 3 + 4. procedure + trigger ----------------
DROP PROCEDURE IF EXISTS sp_cancel_booking;
DROP TRIGGER   IF EXISTS trg_shows_before_delete;
DELIMITER $$
CREATE PROCEDURE sp_cancel_booking(IN p_booking INT, IN p_user INT)
BEGIN
  DECLARE v_owner  INT;
  DECLARE v_status VARCHAR(10);
  DECLARE v_role   VARCHAR(15);
  DECLARE v_time   DATETIME;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT Role INTO v_role FROM USERS WHERE User_ID = p_user;

  START TRANSACTION;
    -- row lock: a second cancel / refund of the SAME booking (another tab,
    -- or the admin at the same moment) waits here until we COMMIT, then
    -- reads Status = 'CANCELLED' and is rejected -> no double refund
    SELECT User_ID, Status INTO v_owner, v_status
      FROM BOOKING WHERE Booking_ID = p_booking
       FOR UPDATE;

    IF v_owner IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking not found';
    ELSEIF v_owner <> p_user AND v_role <> 'ADMIN' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can cancel only your own booking';
    ELSEIF v_status = 'CANCELLED' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking already cancelled';
    END IF;

    SELECT sh.Show_Time INTO v_time
      FROM BOOKING b JOIN SHOWS sh ON sh.Show_ID = b.Show_ID
     WHERE b.Booking_ID = p_booking;
    IF v_time <= NOW() AND v_role <> 'ADMIN' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This show has already started, so it can no longer be cancelled';
    END IF;

    UPDATE BOOKING SET Status = 'CANCELLED' WHERE Booking_ID = p_booking;   -- fires trigger 3
  COMMIT;
END$$

CREATE TRIGGER trg_shows_before_delete
BEFORE DELETE ON SHOWS
FOR EACH ROW
BEGIN
  IF OLD.Show_Time <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This show has already been screened and cannot be deleted';
  END IF;
END$$
DELIMITER ;

-- ---------------- 5. database roles ----------------
-- (dropping a procedure also drops its EXECUTE grants, so re-grant)
GRANT EXECUTE ON PROCEDURE movie_ticket_booking.sp_cancel_booking TO 'role_customer';
-- customer profile page: member-since + referred-by
GRANT SELECT (Created_At, Referred_By) ON movie_ticket_booking.USERS TO 'role_customer';

DROP USER IF EXISTS 'cine_theatre'@'localhost', 'cine_theatre'@'127.0.0.1';
DROP ROLE IF EXISTS 'role_theatre';
CREATE ROLE 'role_theatre';
-- ---------------- THEATRE ADMIN : one theatre's operations ----------------
-- read catalogue + own operations; schedule shows only through sp_add_show;
-- may delete a show (trigger 4 blocks past shows); NO movie edits, NO users,
-- NO payments changes. (Which theatre = enforced by the app via USERS.Theatre_ID)
GRANT SELECT ON movie_ticket_booking.THEATRE        TO 'role_theatre';
GRANT SELECT ON movie_ticket_booking.SCREEN         TO 'role_theatre';
GRANT SELECT ON movie_ticket_booking.SEAT           TO 'role_theatre';
GRANT SELECT ON movie_ticket_booking.MOVIE          TO 'role_theatre';
GRANT SELECT ON movie_ticket_booking.MOVIE_GENRE    TO 'role_theatre';
GRANT SELECT, DELETE ON movie_ticket_booking.SHOWS  TO 'role_theatre';
GRANT SELECT ON movie_ticket_booking.v_show_details TO 'role_theatre';
GRANT SELECT ON movie_ticket_booking.BOOKING        TO 'role_theatre';
GRANT SELECT ON movie_ticket_booking.BOOKING_SEAT   TO 'role_theatre';
GRANT SELECT ON movie_ticket_booking.PAYMENT        TO 'role_theatre';
GRANT SELECT (User_ID, First_Name, Last_Name, Email) ON movie_ticket_booking.USERS TO 'role_theatre';
GRANT EXECUTE ON PROCEDURE movie_ticket_booking.sp_add_show   TO 'role_theatre';
GRANT EXECUTE ON FUNCTION  movie_ticket_booking.fn_seats_left TO 'role_theatre';
GRANT EXECUTE ON FUNCTION  movie_ticket_booking.fn_seat_price TO 'role_theatre';
CREATE USER 'cine_theatre'@'localhost' IDENTIFIED BY 'Theatre@123';
CREATE USER 'cine_theatre'@'127.0.0.1' IDENTIFIED BY 'Theatre@123';
GRANT 'role_theatre' TO 'cine_theatre'@'localhost', 'cine_theatre'@'127.0.0.1';
SET DEFAULT ROLE 'role_theatre' TO 'cine_theatre'@'localhost', 'cine_theatre'@'127.0.0.1';
FLUSH PRIVILEGES;

-- ---------------- 6. shows for the next 5 days ----------------
-- every screen gets 4 shows a day (gaps of 3h45 > longest film + cleaning);
-- each theatre shows 5 different films a day, rotating day to day.
-- INSERT IGNORE + fixed slots => re-running never duplicates a slot.
INSERT IGNORE INTO SHOWS (Movie_ID, Screen_ID, Show_Time, Base_Price)
WITH RECURSIVE
  days  AS (SELECT 1 AS d UNION ALL SELECT d + 1 FROM days WHERE d < 5),
  slots AS (SELECT 0 AS k, '10:00:00' AS t UNION ALL SELECT 1, '13:45:00'
            UNION ALL SELECT 2, '17:30:00' UNION ALL SELECT 3, '21:15:00'),
  lineup AS (SELECT 0 AS n, 'Interstellar' AS Title UNION ALL SELECT 1, 'Jawan'
             UNION ALL SELECT 2, 'Kantara'       UNION ALL SELECT 3, 'Dune: Part Two'
             UNION ALL SELECT 4, '3 Idiots'      UNION ALL SELECT 5, 'Kalki 2898 AD'
             UNION ALL SELECT 6, 'Inside Out 2'  UNION ALL SELECT 7, 'RRR'
             UNION ALL SELECT 8, 'Oppenheimer'   UNION ALL SELECT 9, 'Laapataa Ladies'
             UNION ALL SELECT 10, 'Inception'    UNION ALL SELECT 11, 'Manjummel Boys'
             UNION ALL SELECT 12, 'The Matrix')
SELECT m.Movie_ID,
       sc.Screen_ID,
       TIMESTAMP(CURDATE() + INTERVAL days.d DAY, slots.t) + INTERVAL IF(sc.Screen_No = 2, 30, 0) MINUTE,
       ELT(slots.k + 1, 180, 220, 260, 300) + IF(sc.Screen_No = 1, 20, 0)
  FROM days
 CROSS JOIN slots
 CROSS JOIN SCREEN sc
  JOIN lineup l ON l.n = (days.d * 3 + sc.Theatre_ID * 4
                          + IF(sc.Screen_No = 1, slots.k, (slots.k + 4) % 5)) % 13
  JOIN MOVIE m  ON m.Title = l.Title
 -- same clash rule as sp_add_show: skip a slot that overlaps an existing show
 WHERE NOT EXISTS (
        SELECT 1 FROM SHOWS s2 JOIN MOVIE m2 ON m2.Movie_ID = s2.Movie_ID
         WHERE s2.Screen_ID = sc.Screen_ID
           AND s2.Show_Time < TIMESTAMP(CURDATE() + INTERVAL days.d DAY, slots.t)
                              + INTERVAL (IF(sc.Screen_No = 2, 30, 0) + m.Duration_Min + 20) MINUTE
           AND TIMESTAMP(CURDATE() + INTERVAL days.d DAY, slots.t) + INTERVAL IF(sc.Screen_No = 2, 30, 0) MINUTE
               < s2.Show_Time + INTERVAL (m2.Duration_Min + 20) MINUTE);

-- ---------------- check ----------------
SELECT Role, COUNT(*) AS Users FROM USERS GROUP BY Role;
SELECT DATE(Show_Time) AS Day, COUNT(*) AS Shows, COUNT(DISTINCT Movie_ID) AS Movies
  FROM SHOWS WHERE Show_Time >= CURDATE() GROUP BY DATE(Show_Time) ORDER BY Day;
