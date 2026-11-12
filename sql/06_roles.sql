-- =====================================================================
--  File 06 : ROLES & ROLE-BASED ACCESS CONTROL inside MySQL      MySQL 8.0
--  Run as root:   mysql -u root -p < sql/06_roles.sql
--
--  Three database roles  ->  three database users
--     role_admin     -> cine_admin     (platform admin: full control)
--     role_theatre   -> cine_theatre   (theatre admin: read + schedule /
--                                       delete shows via sp_add_show only)
--     role_customer  -> cine_customer  (read catalogue, book/cancel ONLY
--                                       through stored procedures)
--  The web app connects with the account that matches the logged-in user's
--  role, so RBAC is enforced by the DATABASE, not just the UI.
-- =====================================================================
USE movie_ticket_booking;

DROP USER IF EXISTS 'cine_admin'@'localhost',    'cine_admin'@'127.0.0.1',
                    'cine_theatre'@'localhost',  'cine_theatre'@'127.0.0.1',
                    'cine_customer'@'localhost', 'cine_customer'@'127.0.0.1';
DROP ROLE IF EXISTS 'role_admin', 'role_theatre', 'role_customer';

CREATE ROLE 'role_admin', 'role_theatre', 'role_customer';

-- ---------------- ADMIN : everything on this database ----------------
GRANT ALL PRIVILEGES ON movie_ticket_booking.* TO 'role_admin';

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

-- ---------------- CUSTOMER : least privilege ----------------
-- read the catalogue
GRANT SELECT ON movie_ticket_booking.THEATRE        TO 'role_customer';
GRANT SELECT ON movie_ticket_booking.SCREEN         TO 'role_customer';
GRANT SELECT ON movie_ticket_booking.SEAT           TO 'role_customer';
GRANT SELECT ON movie_ticket_booking.MOVIE          TO 'role_customer';
GRANT SELECT ON movie_ticket_booking.MOVIE_GENRE    TO 'role_customer';
GRANT SELECT ON movie_ticket_booking.SHOWS          TO 'role_customer';
GRANT SELECT ON movie_ticket_booking.v_show_details TO 'role_customer';
-- see bookings / payments (the app shows only the logged-in user's rows)
GRANT SELECT ON movie_ticket_booking.BOOKING        TO 'role_customer';
GRANT SELECT ON movie_ticket_booking.BOOKING_SEAT   TO 'role_customer';
GRANT SELECT ON movie_ticket_booking.PAYMENT        TO 'role_customer';
-- sign-up + login: column-level privileges on USERS (cannot change Role!)
GRANT SELECT (User_ID, First_Name, Last_Name, Email, Password_Hash, Role, Theatre_ID, Created_At, Referred_By)
      ON movie_ticket_booking.USERS TO 'role_customer';
GRANT INSERT (First_Name, Last_Name, Email, Password_Hash, Referred_By)
      ON movie_ticket_booking.USERS TO 'role_customer';
-- book / cancel ONLY via procedures (no direct INSERT/UPDATE on BOOKING)
GRANT EXECUTE ON PROCEDURE movie_ticket_booking.sp_book_seats     TO 'role_customer';
GRANT EXECUTE ON PROCEDURE movie_ticket_booking.sp_cancel_booking TO 'role_customer';
GRANT EXECUTE ON FUNCTION  movie_ticket_booking.fn_seats_left     TO 'role_customer';
GRANT EXECUTE ON FUNCTION  movie_ticket_booking.fn_seat_price     TO 'role_customer';

-- ---------------- the three login accounts ----------------
CREATE USER 'cine_admin'@'localhost'    IDENTIFIED BY 'Admin@123';
CREATE USER 'cine_admin'@'127.0.0.1'    IDENTIFIED BY 'Admin@123';
CREATE USER 'cine_theatre'@'localhost'  IDENTIFIED BY 'Theatre@123';
CREATE USER 'cine_theatre'@'127.0.0.1'  IDENTIFIED BY 'Theatre@123';
CREATE USER 'cine_customer'@'localhost' IDENTIFIED BY 'Customer@123';
CREATE USER 'cine_customer'@'127.0.0.1' IDENTIFIED BY 'Customer@123';

GRANT 'role_admin'    TO 'cine_admin'@'localhost',    'cine_admin'@'127.0.0.1';
GRANT 'role_theatre'  TO 'cine_theatre'@'localhost',  'cine_theatre'@'127.0.0.1';
GRANT 'role_customer' TO 'cine_customer'@'localhost', 'cine_customer'@'127.0.0.1';

SET DEFAULT ROLE 'role_admin'    TO 'cine_admin'@'localhost',    'cine_admin'@'127.0.0.1';
SET DEFAULT ROLE 'role_theatre'  TO 'cine_theatre'@'localhost',  'cine_theatre'@'127.0.0.1';
SET DEFAULT ROLE 'role_customer' TO 'cine_customer'@'localhost', 'cine_customer'@'127.0.0.1';

FLUSH PRIVILEGES;

SHOW GRANTS FOR 'role_admin';
SHOW GRANTS FOR 'role_theatre';
SHOW GRANTS FOR 'role_customer';

-- =====================================================================
--  DEMO : open TWO terminal tabs
-- ---------------------------------------------------------------------
--  TAB 1 (admin)     mysql -u cine_admin -p movie_ticket_booking        (Admin@123)
--     SELECT CURRENT_ROLE();
--     INSERT INTO MOVIE (Title, Language, Duration_Min) VALUES ('Admin Test', 'English', 100);  -- OK
--     UPDATE SHOWS SET Base_Price = 260 WHERE Show_ID = 1;                                     -- OK
--     DELETE FROM MOVIE WHERE Title = 'Admin Test';                                            -- OK
--
--  TAB 3 (theatre)   mysql -u cine_theatre -p movie_ticket_booking      (Theatre@123)
--     CALL sp_add_show(3, 1, NOW() + INTERVAL 7 DAY, 250, @s);         -- OK (via procedure)
--     INSERT INTO MOVIE (Title, Language, Duration_Min) VALUES ('X', 'English', 100);
--         -> ERROR 1142: INSERT command denied to user 'cine_theatre'
--     SELECT Password_Hash FROM USERS;
--         -> ERROR 1143: SELECT command denied ... for column 'Password_Hash'
--
--  TAB 2 (customer)  mysql -u cine_customer -p movie_ticket_booking     (Customer@123)
--     SELECT CURRENT_ROLE();
--     SELECT * FROM v_show_details;                                   -- OK
--     CALL sp_book_seats(10, 4, 'C9', 'UPI', @b); SELECT @b;          -- OK (via procedure)
--     INSERT INTO MOVIE (Title, Language, Duration_Min) VALUES ('Hack', 'English', 100);
--         -> ERROR 1142: INSERT command denied to user 'cine_customer'
--     UPDATE BOOKING SET Total_Amount = 0 WHERE Booking_ID = 1;
--         -> ERROR 1142: UPDATE command denied
--     UPDATE USERS SET Role = 'ADMIN' WHERE User_ID = 10;
--         -> ERROR 1142: UPDATE command denied
--     DROP TABLE PAYMENT;
--         -> ERROR 1142: DROP command denied
-- =====================================================================
