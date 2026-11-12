-- =====================================================================
--  File 03 : Sample data (DML – INSERT)                        MySQL 8.0
--  Run as root:   mysql -u root -p movie_ticket_booking < sql/03_seed.sql
--
--  How much data and why
--   THEATRE        3    (3 multiplexes)
--   SCREEN         6    (each theatre has ONLY Screen 1 and Screen 2)
--   SEAT         300    (5 rows A-E x 10 seats per screen; row E = PREMIUM)
--   MOVIE          6
--   MOVIE_GENRE   13    (multivalued – some movies have 2-3 genres)
--   SHOWS         12    (2 shows per screen, dated relative to today)
--   USERS         13    (1 platform admin + 3 theatre admins + 9 customers)
--                       + 4,200 bulk customers in file 04 (> 4k rows)
--   BOOKING/BOOKING_SEAT/PAYMENT  created through sp_book_seats so the
--                       trigger computes every Total_Amount
--
--  Demo logins (bcrypt hashed):  admins -> admin123   customers -> user123
-- =====================================================================
USE movie_ticket_booking;

SET @admin_pw = '$2a$10$cQ3pzScmmGRoyK9qMb01eeEJrLhHXAWNN4B4bnNXCXWjgutiLy5Xm';  -- admin123
SET @user_pw  = '$2a$10$z7GIe.Y8QejCvG6krT0yvu/fnCpHSluVvJ/1oGgKpcb60aIFVL3qy';  -- user123

-- ---------------- THEATRE ----------------
INSERT INTO THEATRE (Name, City, Address) VALUES
 ('Galaxy Cinemas Koramangala', 'Bengaluru', '3rd Floor, Galaxy Mall, 80 Feet Road, Koramangala 6th Block, Bengaluru 560095'),
 ('Starlight Multiplex Whitefield', 'Bengaluru', 'Level 4, Starlight Square, ITPL Main Road, Whitefield, Bengaluru 560066'),
 ('Regal Screens Jayanagar', DEFAULT, '2nd Floor, Regal Arcade, 11th Main, 4th Block, Jayanagar, Bengaluru 560011');   -- DEFAULT -> 'Bengaluru'

-- ---------------- SCREEN (only Screen 1 & 2) ----------------
INSERT INTO SCREEN (Theatre_ID, Screen_No) VALUES
 (1,1),(1,2),(2,1),(2,2),(3,1),(3,2);

-- ---------------- SEAT (weak entity) : 6 screens x 5 rows x 10 seats ----------------
INSERT INTO SEAT (Screen_ID, Row_No, Seat_No, Seat_Type)
SELECT sc.Screen_ID, r.Row_No, n.Seat_No,
       IF(r.Row_No = 'E', 'PREMIUM', 'REGULAR')
FROM SCREEN sc
CROSS JOIN (SELECT 'A' AS Row_No UNION ALL SELECT 'B' UNION ALL SELECT 'C'
            UNION ALL SELECT 'D' UNION ALL SELECT 'E') r
CROSS JOIN (SELECT 1 AS Seat_No UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
            UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
            UNION ALL SELECT 9 UNION ALL SELECT 10) n;

-- ---------------- MOVIE ----------------
INSERT INTO MOVIE (Title, Language, Duration_Min, Release_Date) VALUES
 ('Interstellar',     'English', 169, '2014-11-07'),
 ('3 Idiots',         'Hindi',   170, '2009-12-25'),
 ('Kantara',          'Kannada', 148, '2022-09-30'),
 ('Inception',        'English', 148, '2010-07-16'),
 ('RRR',              'Telugu',  187, '2022-03-25'),
 ('Lost in Bengaluru','Kannada', 120, NULL);       -- upcoming: release date unknown (NULL)

-- ---------------- MOVIE_GENRE (multivalued attribute) ----------------
INSERT INTO MOVIE_GENRE (Movie_ID, Genre) VALUES
 (1,'Sci-Fi'),(1,'Drama'),
 (2,'Comedy'),(2,'Drama'),
 (3,'Action'),(3,'Thriller'),(3,'Drama'),
 (4,'Sci-Fi'),(4,'Thriller'),
 (5,'Action'),(5,'Drama'),
 (6,'Comedy'),(6,'Romance');

-- ---------------- SHOWS (relative to today so the demo never expires) ----------------
INSERT INTO SHOWS (Movie_ID, Screen_ID, Show_Time, Base_Price) VALUES
 (1, 1, TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '10:00:00'), 250),
 (4, 1, TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '18:30:00'), 300),
 (2, 2, TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '11:00:00'), 200),
 (3, 2, TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '19:00:00'), 220),
 (5, 3, TIMESTAMP(CURDATE() + INTERVAL 2 DAY, '12:00:00'), 280),
 (1, 3, TIMESTAMP(CURDATE() + INTERVAL 2 DAY, '20:00:00'), 320),
 (3, 4, TIMESTAMP(CURDATE() + INTERVAL 2 DAY, '15:00:00'), 180),
 (2, 4, TIMESTAMP(CURDATE() + INTERVAL 3 DAY, '21:00:00'), 200),
 (4, 5, TIMESTAMP(CURDATE() + INTERVAL 3 DAY, '13:00:00'), 240),
 (5, 5, TIMESTAMP(CURDATE() + INTERVAL 3 DAY, '19:30:00'), 260),
 (1, 6, TIMESTAMP(CURDATE() + INTERVAL 4 DAY, '16:00:00'), 230),
 (3, 6, TIMESTAMP(CURDATE() + INTERVAL 4 DAY, '20:30:00'), 210);
-- Movie 6 (upcoming) has no show yet -> used by the "never shown" nested query

-- ---------------- USERS ----------------
-- Theatre admins: one per theatre (Theatre_ID set, Role = THEATRE_ADMIN)
INSERT INTO USERS (First_Name, Last_Name, Email, Password_Hash, Role, Theatre_ID) VALUES
 ('Anita',  'Rao',    'admin.galaxy@cine.com',    @admin_pw, 'THEATRE_ADMIN', 1),
 ('Vikram', 'Shetty', 'admin.starlight@cine.com', @admin_pw, 'THEATRE_ADMIN', 2),
 ('Meera',  'Iyer',   'admin.regal@cine.com',     @admin_pw, 'THEATRE_ADMIN', 3);

-- Customers with a referral chain (recursive relationship):
--   Nikita(4) -> Rahul(5) -> Sneha(6) -> Arjun(7) -> Kavya(8)
--   Nikita(4) -> Priya(9);  Rohan(10), Divya(11), Karan(12) joined on their own
INSERT INTO USERS (First_Name, Last_Name, Email, Password_Hash, Referred_By) VALUES
 ('Nikita', 'Mankani', 'nikita@demo.com', @user_pw, NULL);
INSERT INTO USERS (First_Name, Last_Name, Email, Password_Hash, Referred_By) VALUES
 ('Rahul',  'Verma',   'rahul@demo.com',  @user_pw, 4),
 ('Sneha',  'Kulkarni','sneha@demo.com',  @user_pw, 5),
 ('Arjun',  'Nair',    'arjun@demo.com',  @user_pw, 6),
 ('Kavya',  'Reddy',   'kavya@demo.com',  @user_pw, 7),
 ('Priya',  'Sharma',  'priya@demo.com',  @user_pw, 4),
 ('Rohan',  NULL,      'rohan@demo.com',  @user_pw, NULL),   -- Last_Name NULL allowed
 ('Divya',  'Menon',   'divya@demo.com',  @user_pw, NULL),
 ('Karan',  'Gupta',   'karan@demo.com',  @user_pw, NULL);

-- Platform admin (CineBook head office): sees every theatre, owns the movie catalogue
INSERT INTO USERS (First_Name, Last_Name, Email, Password_Hash, Role) VALUES
 ('Platform', 'Admin', 'admin@cine.com', @admin_pw, 'ADMIN');

-- ---------------- BOOKINGS (via procedure -> trigger fills Total_Amount, payment created) ----------------
CALL sp_book_seats(4,  1, 'C5,C6',        'UPI',  @b);
CALL sp_book_seats(5,  1, 'E1,E2,E3',     'CARD', @b);
CALL sp_book_seats(6,  2, 'A1',           'UPI',  @b);
CALL sp_book_seats(7,  2, 'E5,E6',        'UPI',  @b);
CALL sp_book_seats(8,  3, 'B1,B2,B3,B4',  'CASH', @b);
CALL sp_book_seats(9,  4, 'D7,D8',        'UPI',  @b);
CALL sp_book_seats(10, 5, 'E9,E10',       'CARD', @b);
CALL sp_book_seats(11, 5, 'A5',           'UPI',  @b);
CALL sp_book_seats(4,  6, 'C1,C2,C3',     'CARD', @b);
CALL sp_book_seats(12, 7, 'B5',           'UPI',  @b);
CALL sp_book_seats(5,  9, 'E4,E5',        'UPI',  @b);
CALL sp_book_seats(6, 10, 'A1,A2',        'CASH', @b);
CALL sp_book_seats(7, 11, 'D1,D2,D3',     'UPI',  @b);
CALL sp_book_seats(8, 12, 'E7',           'CARD', @b);
CALL sp_book_seats(9,  1, 'A9,A10',       'UPI',  @b);

-- one cancellation -> trigger marks payment REFUNDED and frees the seats
CALL sp_cancel_booking(@b, 9);

SELECT 'THEATRE' AS tbl, COUNT(*) AS n FROM THEATRE UNION ALL
SELECT 'SCREEN',       COUNT(*) FROM SCREEN       UNION ALL
SELECT 'SEAT',         COUNT(*) FROM SEAT         UNION ALL
SELECT 'MOVIE',        COUNT(*) FROM MOVIE        UNION ALL
SELECT 'MOVIE_GENRE',  COUNT(*) FROM MOVIE_GENRE  UNION ALL
SELECT 'SHOWS',        COUNT(*) FROM SHOWS        UNION ALL
SELECT 'USERS',        COUNT(*) FROM USERS        UNION ALL
SELECT 'BOOKING',      COUNT(*) FROM BOOKING      UNION ALL
SELECT 'BOOKING_SEAT', COUNT(*) FROM BOOKING_SEAT UNION ALL
SELECT 'PAYMENT',      COUNT(*) FROM PAYMENT;
