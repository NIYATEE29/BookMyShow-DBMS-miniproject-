-- =====================================================================
--  Online Movie Ticket Booking & Theatre Management System
--  File 01 : DDL  (tables + keys + constraints)          MySQL 8.0
--  Run as root:   mysql -u root -p < sql/01_schema.sql
-- =====================================================================
DROP DATABASE IF EXISTS movie_ticket_booking;
CREATE DATABASE movie_ticket_booking
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE movie_ticket_booking;

-- ---------------------------------------------------------------------
-- 1. THEATRE  (strong entity)
-- ---------------------------------------------------------------------
CREATE TABLE THEATRE (
  Theatre_ID   INT          AUTO_INCREMENT PRIMARY KEY,
  Name         VARCHAR(80)  NOT NULL,
  City         VARCHAR(40)  NOT NULL DEFAULT 'Bengaluru',
  Address      VARCHAR(200) NULL,                       -- shown on "Browse by Cinemas"
  CONSTRAINT uq_theatre_name_city UNIQUE (Name, City)
);

-- ---------------------------------------------------------------------
-- 2. USERS  (strong entity)
--    * composite attribute  Name -> First_Name + Last_Name
--    * recursive 1:N        Referred_By -> USERS
--    * Role: ADMIN (platform, all theatres) / THEATRE_ADMIN (one theatre)
--            / CUSTOMER.  Only a THEATRE_ADMIN has a Theatre_ID.
-- ---------------------------------------------------------------------
CREATE TABLE USERS (
  User_ID        INT          AUTO_INCREMENT PRIMARY KEY,
  First_Name     VARCHAR(40)  NOT NULL,
  Last_Name      VARCHAR(40)  NULL,                       -- optional (NULL allowed)
  Email          VARCHAR(100) NOT NULL,
  Password_Hash  VARCHAR(100) NOT NULL,
  Role           VARCHAR(15)  NOT NULL DEFAULT 'CUSTOMER',
  Theatre_ID     INT          NULL,                       -- only for THEATRE_ADMINs
  Referred_By    INT          NULL,                       -- recursive FK
  Created_At     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email    UNIQUE (Email),
  CONSTRAINT chk_users_role    CHECK (Role IN ('ADMIN','THEATRE_ADMIN','CUSTOMER')),
  CONSTRAINT chk_users_email   CHECK (Email LIKE '%_@_%._%'),
  CONSTRAINT chk_admin_theatre CHECK ((Role = 'THEATRE_ADMIN' AND Theatre_ID IS NOT NULL)
                                   OR (Role <> 'THEATRE_ADMIN' AND Theatre_ID IS NULL)),
  CONSTRAINT fk_users_theatre  FOREIGN KEY (Theatre_ID)  REFERENCES THEATRE(Theatre_ID),
  CONSTRAINT fk_users_referrer FOREIGN KEY (Referred_By) REFERENCES USERS(User_ID)
      ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- 3. SCREEN  (strong entity, THEATRE 1:N SCREEN)
--    every theatre has only Screen 1 and Screen 2
-- ---------------------------------------------------------------------
CREATE TABLE SCREEN (
  Screen_ID    INT      AUTO_INCREMENT PRIMARY KEY,
  Theatre_ID   INT      NOT NULL,
  Screen_No    TINYINT  NOT NULL,
  CONSTRAINT uq_screen        UNIQUE (Theatre_ID, Screen_No),
  CONSTRAINT chk_screen_no    CHECK (Screen_No IN (1, 2)),
  CONSTRAINT fk_screen_theatre FOREIGN KEY (Theatre_ID) REFERENCES THEATRE(Theatre_ID)
      ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 4. SEAT  (WEAK entity, owner = SCREEN, identifying rel. SCREEN-has-SEAT)
--    partial key = (Row_No, Seat_No)  ->  PK = (Screen_ID, Row_No, Seat_No)
-- ---------------------------------------------------------------------
CREATE TABLE SEAT (
  Screen_ID   INT          NOT NULL,
  Row_No      CHAR(1)      NOT NULL,
  Seat_No     TINYINT      NOT NULL,
  Seat_Type   VARCHAR(10)  NOT NULL DEFAULT 'REGULAR',
  PRIMARY KEY (Screen_ID, Row_No, Seat_No),
  CONSTRAINT chk_seat_type CHECK (Seat_Type IN ('REGULAR','PREMIUM')),
  CONSTRAINT chk_seat_row  CHECK (Row_No BETWEEN 'A' AND 'Z'),
  CONSTRAINT chk_seat_no   CHECK (Seat_No BETWEEN 1 AND 30),
  CONSTRAINT fk_seat_screen FOREIGN KEY (Screen_ID) REFERENCES SCREEN(Screen_ID)
      ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 5. MOVIE  (strong entity)
-- ---------------------------------------------------------------------
CREATE TABLE MOVIE (
  Movie_ID      INT          AUTO_INCREMENT PRIMARY KEY,
  Title         VARCHAR(100) NOT NULL,
  Language      VARCHAR(20)  NOT NULL DEFAULT 'English',
  Duration_Min  SMALLINT     NOT NULL,
  Release_Date  DATE         NULL,                        -- unknown for upcoming films
  Poster_URL    VARCHAR(255) NULL,                        -- image path; NULL = no poster yet
  CONSTRAINT uq_movie_title_lang UNIQUE (Title, Language),
  CONSTRAINT chk_movie_duration  CHECK (Duration_Min BETWEEN 30 AND 300)
);

-- ---------------------------------------------------------------------
-- 6. MOVIE_GENRE  (multivalued attribute Genre of MOVIE)
-- ---------------------------------------------------------------------
CREATE TABLE MOVIE_GENRE (
  Movie_ID  INT          NOT NULL,
  Genre     VARCHAR(20)  NOT NULL,
  PRIMARY KEY (Movie_ID, Genre),
  CONSTRAINT fk_genre_movie FOREIGN KEY (Movie_ID) REFERENCES MOVIE(Movie_ID)
      ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 7. SHOWS  (resolves MOVIE M:N SCREEN – a movie plays on many screens,
--            a screen plays many movies; each pairing has a time + price)
-- ---------------------------------------------------------------------
CREATE TABLE SHOWS (
  Show_ID     INT            AUTO_INCREMENT PRIMARY KEY,
  Movie_ID    INT            NOT NULL,
  Screen_ID   INT            NOT NULL,
  Show_Time   DATETIME       NOT NULL,
  Base_Price  DECIMAL(7,2)   NOT NULL DEFAULT 200.00,
  CONSTRAINT uq_show_slot    UNIQUE (Screen_ID, Show_Time),   -- one show per screen per slot
  CONSTRAINT chk_show_price  CHECK (Base_Price > 0),
  CONSTRAINT fk_show_movie   FOREIGN KEY (Movie_ID)  REFERENCES MOVIE(Movie_ID),
  CONSTRAINT fk_show_screen  FOREIGN KEY (Screen_ID) REFERENCES SCREEN(Screen_ID)
);

-- ---------------------------------------------------------------------
-- 8. BOOKING  (USERS 1:N BOOKING, SHOWS 1:N BOOKING)
--    Total_Amount is a DERIVED attribute (kept in sync by a trigger)
-- ---------------------------------------------------------------------
CREATE TABLE BOOKING (
  Booking_ID    INT           AUTO_INCREMENT PRIMARY KEY,
  User_ID       INT           NOT NULL,
  Show_ID       INT           NOT NULL,
  Booked_At     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Status        VARCHAR(10)   NOT NULL DEFAULT 'CONFIRMED',
  Total_Amount  DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
  CONSTRAINT chk_booking_status CHECK (Status IN ('CONFIRMED','CANCELLED')),
  CONSTRAINT chk_booking_amount CHECK (Total_Amount >= 0),
  CONSTRAINT fk_booking_user FOREIGN KEY (User_ID) REFERENCES USERS(User_ID),
  CONSTRAINT fk_booking_show FOREIGN KEY (Show_ID) REFERENCES SHOWS(Show_ID)
);

-- ---------------------------------------------------------------------
-- 9. BOOKING_SEAT  (resolves BOOKING M:N SEAT)
--    UNIQUE(Show_ID, seat) => a seat can be sold only once per show
-- ---------------------------------------------------------------------
CREATE TABLE BOOKING_SEAT (
  Booking_ID  INT      NOT NULL,
  Show_ID     INT      NOT NULL,
  Screen_ID   INT      NOT NULL,
  Row_No      CHAR(1)  NOT NULL,
  Seat_No     TINYINT  NOT NULL,
  PRIMARY KEY (Booking_ID, Screen_ID, Row_No, Seat_No),
  CONSTRAINT uq_seat_per_show UNIQUE (Show_ID, Screen_ID, Row_No, Seat_No),
  CONSTRAINT fk_bs_booking FOREIGN KEY (Booking_ID) REFERENCES BOOKING(Booking_ID)
      ON DELETE CASCADE,
  CONSTRAINT fk_bs_show    FOREIGN KEY (Show_ID)    REFERENCES SHOWS(Show_ID),
  CONSTRAINT fk_bs_seat    FOREIGN KEY (Screen_ID, Row_No, Seat_No)
      REFERENCES SEAT(Screen_ID, Row_No, Seat_No)
);

-- ---------------------------------------------------------------------
-- 10. PAYMENT  (BOOKING 1:1 PAYMENT — enforced by UNIQUE FK)
-- ---------------------------------------------------------------------
CREATE TABLE PAYMENT (
  Payment_ID  INT           AUTO_INCREMENT PRIMARY KEY,
  Booking_ID  INT           NOT NULL,
  Amount      DECIMAL(8,2)  NOT NULL,
  Method      VARCHAR(10)   NOT NULL DEFAULT 'UPI',
  Status      VARCHAR(10)   NOT NULL DEFAULT 'PAID',
  Paid_At     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_payment_booking UNIQUE (Booking_ID),
  CONSTRAINT chk_payment_amount CHECK (Amount >= 0),
  CONSTRAINT chk_payment_method CHECK (Method IN ('UPI','CARD','CASH')),
  CONSTRAINT chk_payment_status CHECK (Status IN ('PAID','REFUNDED')),
  CONSTRAINT fk_payment_booking FOREIGN KEY (Booking_ID) REFERENCES BOOKING(Booking_ID)
      ON DELETE CASCADE
);

SHOW TABLES;
