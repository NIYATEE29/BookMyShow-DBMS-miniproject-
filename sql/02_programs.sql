-- =====================================================================
--  File 02 : Stored FUNCTIONS, TRIGGERS, PROCEDURES, VIEW      MySQL 8.0
--  Run as root:   mysql -u root -p movie_ticket_booking < sql/02_programs.sql
-- =====================================================================
USE movie_ticket_booking;

DROP VIEW      IF EXISTS v_show_details;
DROP PROCEDURE IF EXISTS sp_book_seats;
DROP PROCEDURE IF EXISTS sp_cancel_booking;
DROP PROCEDURE IF EXISTS sp_add_show;
DROP TRIGGER   IF EXISTS trg_bs_before_insert;
DROP TRIGGER   IF EXISTS trg_bs_after_insert;
DROP TRIGGER   IF EXISTS trg_booking_after_cancel;
DROP TRIGGER   IF EXISTS trg_shows_before_delete;
DROP FUNCTION  IF EXISTS fn_seat_price;
DROP FUNCTION  IF EXISTS fn_seats_left;

DELIMITER $$

-- ---------------------------------------------------------------------
-- FUNCTION 1 : price of one seat for one show
--   PREMIUM seats cost 1.5 x the show's base price
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_seat_price(p_show INT, p_screen INT, p_row CHAR(1), p_seat TINYINT)
RETURNS DECIMAL(7,2)
READS SQL DATA
BEGIN
  DECLARE v_base DECIMAL(7,2);
  DECLARE v_type VARCHAR(10);
  SELECT Base_Price INTO v_base FROM SHOWS WHERE Show_ID = p_show;
  SELECT Seat_Type  INTO v_type FROM SEAT
   WHERE Screen_ID = p_screen AND Row_No = p_row AND Seat_No = p_seat;
  RETURN IF(v_type = 'PREMIUM', ROUND(v_base * 1.5, 2), v_base);
END$$

-- ---------------------------------------------------------------------
-- FUNCTION 2 : how many seats are still free for a show
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_seats_left(p_show INT)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE v_total INT;
  DECLARE v_sold  INT;
  SELECT COUNT(*) INTO v_total
    FROM SEAT st JOIN SHOWS sh ON sh.Screen_ID = st.Screen_ID
   WHERE sh.Show_ID = p_show;
  SELECT COUNT(*) INTO v_sold FROM BOOKING_SEAT WHERE Show_ID = p_show;
  RETURN v_total - v_sold;
END$$

-- ---------------------------------------------------------------------
-- TRIGGER 1 (BEFORE INSERT) : validate a booked seat
--   - seat must belong to the screen the show runs on
--   - seat row must match the booking's show
--   - cannot add seats to a CANCELLED booking
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_bs_before_insert
BEFORE INSERT ON BOOKING_SEAT
FOR EACH ROW
BEGIN
  DECLARE v_show_screen INT;
  DECLARE v_booking_show INT;
  DECLARE v_status VARCHAR(10);

  SELECT Screen_ID INTO v_show_screen FROM SHOWS WHERE Show_ID = NEW.Show_ID;
  SELECT Show_ID, Status INTO v_booking_show, v_status
    FROM BOOKING WHERE Booking_ID = NEW.Booking_ID;

  IF v_show_screen <> NEW.Screen_ID THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seat does not belong to the screen of this show';
  END IF;
  IF v_booking_show <> NEW.Show_ID THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seat show does not match booking show';
  END IF;
  IF v_status = 'CANCELLED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot add seats to a cancelled booking';
  END IF;
END$$

-- ---------------------------------------------------------------------
-- TRIGGER 2 (AFTER INSERT) : maintain DERIVED attribute BOOKING.Total_Amount
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_bs_after_insert
AFTER INSERT ON BOOKING_SEAT
FOR EACH ROW
BEGIN
  UPDATE BOOKING
     SET Total_Amount = Total_Amount
                      + fn_seat_price(NEW.Show_ID, NEW.Screen_ID, NEW.Row_No, NEW.Seat_No)
   WHERE Booking_ID = NEW.Booking_ID;
END$$

-- ---------------------------------------------------------------------
-- TRIGGER 3 (AFTER UPDATE) : on cancellation
--   - mark the payment REFUNDED
--   - release the seats so they can be sold again
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_booking_after_cancel
AFTER UPDATE ON BOOKING
FOR EACH ROW
BEGIN
  IF NEW.Status = 'CANCELLED' AND OLD.Status <> 'CANCELLED' THEN
    UPDATE PAYMENT SET Status = 'REFUNDED' WHERE Booking_ID = NEW.Booking_ID;
    DELETE FROM BOOKING_SEAT WHERE Booking_ID = NEW.Booking_ID;
  END IF;
END$$

-- ---------------------------------------------------------------------
-- TRIGGER 4 (BEFORE DELETE) : a show that has already started is history
--   (its bookings/revenue must stay) -> refuse to delete it
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_shows_before_delete
BEFORE DELETE ON SHOWS
FOR EACH ROW
BEGIN
  IF OLD.Show_Time <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This show has already been screened and cannot be deleted';
  END IF;
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE 1 : book one or more seats in ONE transaction
--   CALL sp_book_seats(user, show, 'A1,A2,E5', 'UPI', @id);
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_book_seats(
  IN  p_user    INT,
  IN  p_show    INT,
  IN  p_seats   VARCHAR(255),
  IN  p_method  VARCHAR(10),
  OUT p_booking INT)
BEGIN
  DECLARE v_screen  INT;
  DECLARE v_time    DATETIME;
  DECLARE v_list    VARCHAR(255);
  DECLARE v_token   VARCHAR(10);
  DECLARE v_total   DECIMAL(8,2);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;            -- pass the real error back to the caller / web app
  END;

  SELECT Screen_ID, Show_Time INTO v_screen, v_time FROM SHOWS WHERE Show_ID = p_show;
  IF v_screen IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Show does not exist';
  END IF;
  IF v_time < NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Show has already started';
  END IF;
  IF p_seats IS NULL OR TRIM(p_seats) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No seats selected';
  END IF;

  START TRANSACTION;
    INSERT INTO BOOKING (User_ID, Show_ID) VALUES (p_user, p_show);
    SET p_booking = LAST_INSERT_ID();

    SET v_list = CONCAT(REPLACE(p_seats, ' ', ''), ',');
    WHILE v_list <> '' DO
      SET v_token = SUBSTRING_INDEX(v_list, ',', 1);
      SET v_list  = SUBSTRING(v_list, LENGTH(v_token) + 2);
      IF v_token <> '' THEN
        INSERT INTO BOOKING_SEAT (Booking_ID, Show_ID, Screen_ID, Row_No, Seat_No)
        VALUES (p_booking, p_show, v_screen,
                UPPER(LEFT(v_token, 1)), CAST(SUBSTRING(v_token, 2) AS UNSIGNED));
      END IF;
    END WHILE;

    SELECT Total_Amount INTO v_total FROM BOOKING WHERE Booking_ID = p_booking;
    INSERT INTO PAYMENT (Booking_ID, Amount, Method) VALUES (p_booking, v_total, p_method);
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE 2 : cancel a booking  (TRANSACTION + SELECT ... FOR UPDATE)
--   customer may cancel only their own booking, and only before the show;
--   the platform ADMIN may cancel any booking
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- PROCEDURE 3 : admin adds a show, rejecting time clashes on the screen
--   (a show occupies the screen for movie duration + 20 min cleaning)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_add_show(
  IN  p_movie  INT,
  IN  p_screen INT,
  IN  p_time   DATETIME,
  IN  p_price  DECIMAL(7,2),
  OUT p_show   INT)
BEGIN
  DECLARE v_dur   INT;
  DECLARE v_clash INT;

  SELECT Duration_Min INTO v_dur FROM MOVIE WHERE Movie_ID = p_movie;
  IF v_dur IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Movie does not exist';
  END IF;

  SELECT COUNT(*) INTO v_clash
    FROM SHOWS s JOIN MOVIE m ON m.Movie_ID = s.Movie_ID
   WHERE s.Screen_ID = p_screen
     AND p_time < s.Show_Time + INTERVAL (m.Duration_Min + 20) MINUTE
     AND s.Show_Time < p_time + INTERVAL (v_dur + 20) MINUTE;

  IF v_clash > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Screen is busy at that time';
  END IF;

  INSERT INTO SHOWS (Movie_ID, Screen_ID, Show_Time, Base_Price)
  VALUES (p_movie, p_screen, p_time, p_price);
  SET p_show = LAST_INSERT_ID();
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- VIEW : one row per show with everything the UI needs
-- ---------------------------------------------------------------------
CREATE VIEW v_show_details AS
SELECT sh.Show_ID, sh.Show_Time, sh.Base_Price,
       m.Movie_ID, m.Title, m.Language, m.Duration_Min,
       t.Theatre_ID, t.Name AS Theatre, t.City,
       sc.Screen_ID, sc.Screen_No,
       fn_seats_left(sh.Show_ID) AS Seats_Left
FROM SHOWS sh
JOIN MOVIE   m  ON m.Movie_ID   = sh.Movie_ID
JOIN SCREEN  sc ON sc.Screen_ID = sh.Screen_ID
JOIN THEATRE t  ON t.Theatre_ID = sc.Theatre_ID;

SHOW FUNCTION STATUS  WHERE Db = 'movie_ticket_booking';
SHOW PROCEDURE STATUS WHERE Db = 'movie_ticket_booking';
SHOW TRIGGERS;
