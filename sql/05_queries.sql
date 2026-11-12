-- =====================================================================
--  File 05 : DML operations + complex queries                  MySQL 8.0
--  Run as root:   mysql -u root -p movie_ticket_booking < sql/05_queries.sql
--  (or paste query-by-query in the terminal during the demo)
-- =====================================================================
USE movie_ticket_booking;

-- #####################################################################
--  PART A : DML OPERATIONS  (INSERT / UPDATE / DELETE / SELECT)
-- #####################################################################

-- A1. INSERT : a new movie with two genres
INSERT INTO MOVIE (Title, Language, Duration_Min, Release_Date)
VALUES ('Stree 2', 'Hindi', 150, '2024-08-15');
INSERT INTO MOVIE_GENRE (Movie_ID, Genre)
VALUES (LAST_INSERT_ID(), 'Comedy'), (LAST_INSERT_ID(), 'Horror');

-- A2. UPDATE : raise the base price of every evening show (after 6 PM) by 10%
UPDATE SHOWS
   SET Base_Price = ROUND(Base_Price * 1.10, 2)
 WHERE HOUR(Show_Time) >= 18;

-- A3. UPDATE : customer changes their last name
UPDATE USERS SET Last_Name = 'Kumar' WHERE Email = 'rohan@demo.com';

-- A4. DELETE : remove a genre tag that was added by mistake
DELETE FROM MOVIE_GENRE WHERE Movie_ID = 6 AND Genre = 'Romance';

-- A5. DELETE : delete the movie we just inserted (cascades to MOVIE_GENRE)
DELETE FROM MOVIE WHERE Title = 'Stree 2';

-- A6. Constraint demo (each of these FAILS on purpose – uncomment to show)
-- INSERT INTO SCREEN (Theatre_ID, Screen_No) VALUES (1, 3);           -- CHECK: only screen 1/2
-- INSERT INTO USERS (First_Name, Email, Password_Hash) VALUES ('X','nikita@demo.com','x'); -- UNIQUE email
-- INSERT INTO PAYMENT (Booking_ID, Amount) VALUES (1, 100);            -- UNIQUE: 1:1 booking-payment
-- INSERT INTO SHOWS (Movie_ID, Screen_ID, Show_Time, Base_Price) VALUES (99, 1, NOW(), 100); -- FK
-- CALL sp_book_seats(5, 1, 'C5', 'UPI', @x);                           -- seat already sold


-- #####################################################################
--  PART B : COMPLEX QUERIES
-- #####################################################################

-- ---------------------------------------------------------------------
-- Q1. JOIN (4 tables) : full show listing with theatre, screen and
--     seats left (uses stored function fn_seats_left)
-- ---------------------------------------------------------------------
SELECT sh.Show_ID,
       m.Title,
       t.Name              AS Theatre,
       CONCAT('Screen ', sc.Screen_No) AS Screen,
       DATE_FORMAT(sh.Show_Time, '%d-%b %H:%i') AS Show_Time,
       sh.Base_Price,
       fn_seats_left(sh.Show_ID) AS Seats_Left
FROM SHOWS sh
JOIN MOVIE   m  ON m.Movie_ID   = sh.Movie_ID
JOIN SCREEN  sc ON sc.Screen_ID = sh.Screen_ID
JOIN THEATRE t  ON t.Theatre_ID = sc.Theatre_ID
ORDER BY sh.Show_Time;

-- ---------------------------------------------------------------------
-- Q2. GROUP BY + HAVING + aggregation : theatres whose confirmed
--     revenue is above the average theatre's revenue, with booking count and average booking value
-- ---------------------------------------------------------------------
SELECT t.Name                     AS Theatre,
       COUNT(b.Booking_ID)        AS Bookings,
       SUM(b.Total_Amount)        AS Revenue,
       ROUND(AVG(b.Total_Amount), 2) AS Avg_Booking_Value
FROM THEATRE t
JOIN SCREEN  sc ON sc.Theatre_ID = t.Theatre_ID
JOIN SHOWS   sh ON sh.Screen_ID  = sc.Screen_ID
JOIN BOOKING b  ON b.Show_ID     = sh.Show_ID
WHERE b.Status = 'CONFIRMED'
GROUP BY t.Theatre_ID, t.Name
HAVING SUM(b.Total_Amount) >                       -- above the AVERAGE theatre's revenue
       (SELECT AVG(t_rev) FROM
          (SELECT SUM(b2.Total_Amount) AS t_rev
             FROM BOOKING b2
             JOIN SHOWS  s2  ON s2.Show_ID    = b2.Show_ID
             JOIN SCREEN sc2 ON sc2.Screen_ID = s2.Screen_ID
            WHERE b2.Status = 'CONFIRMED'
            GROUP BY sc2.Theatre_ID) x)
ORDER BY Revenue DESC;

-- ---------------------------------------------------------------------
-- Q3. GROUP BY + HAVING : genres that appear in more than one movie
-- ---------------------------------------------------------------------
SELECT g.Genre,
       COUNT(*)                                   AS Movies,
       GROUP_CONCAT(m.Title ORDER BY m.Title SEPARATOR ', ') AS Titles
FROM MOVIE_GENRE g
JOIN MOVIE m ON m.Movie_ID = g.Movie_ID
GROUP BY g.Genre
HAVING COUNT(*) > 1
ORDER BY Movies DESC;

-- ---------------------------------------------------------------------
-- Q4. NESTED (non-correlated) subquery : movies that have never been
--     scheduled in any show
-- ---------------------------------------------------------------------
SELECT Movie_ID, Title, Language
FROM MOVIE
WHERE Movie_ID NOT IN (SELECT DISTINCT Movie_ID FROM SHOWS);

-- ---------------------------------------------------------------------
-- Q5. NESTED subquery (2 levels) : customers who booked the most
--     expensive show(s)
-- ---------------------------------------------------------------------
SELECT DISTINCT u.First_Name, u.Last_Name, u.Email
FROM USERS u
JOIN BOOKING b ON b.User_ID = u.User_ID
WHERE b.Show_ID IN (SELECT Show_ID FROM SHOWS
                    WHERE Base_Price = (SELECT MAX(Base_Price) FROM SHOWS));

-- ---------------------------------------------------------------------
-- Q6. CORRELATED subquery : customers whose spend is above the average
--     spend of all paying customers (inner query re-runs per user)
-- ---------------------------------------------------------------------
SELECT u.User_ID, u.First_Name, u.Last_Name,
       (SELECT SUM(b.Total_Amount) FROM BOOKING b
         WHERE b.User_ID = u.User_ID AND b.Status = 'CONFIRMED') AS Total_Spent
FROM USERS u
WHERE (SELECT SUM(b.Total_Amount) FROM BOOKING b
        WHERE b.User_ID = u.User_ID AND b.Status = 'CONFIRMED')
      >
      (SELECT AVG(x.spent) FROM
         (SELECT SUM(Total_Amount) AS spent FROM BOOKING
           WHERE Status = 'CONFIRMED' GROUP BY User_ID) x)
ORDER BY Total_Spent DESC;

-- ---------------------------------------------------------------------
-- Q7. CORRELATED + EXISTS : shows where at least one PREMIUM seat is sold
-- ---------------------------------------------------------------------
SELECT sh.Show_ID, m.Title, sh.Show_Time
FROM SHOWS sh
JOIN MOVIE m ON m.Movie_ID = sh.Movie_ID
WHERE EXISTS (SELECT 1
                FROM BOOKING_SEAT bs
                JOIN SEAT s ON s.Screen_ID = bs.Screen_ID
                           AND s.Row_No    = bs.Row_No
                           AND s.Seat_No   = bs.Seat_No
               WHERE bs.Show_ID = sh.Show_ID
                 AND s.Seat_Type = 'PREMIUM');

-- ---------------------------------------------------------------------
-- Q8. RECURSIVE CTE : referral chain starting from Nikita
--     (uses the recursive relationship USERS.Referred_By -> USERS)
-- ---------------------------------------------------------------------
WITH RECURSIVE referral_tree AS (
    SELECT User_ID, First_Name, Referred_By, 0 AS Level,
           CAST(First_Name AS CHAR(200)) AS Path
    FROM USERS
    WHERE Email = 'nikita@demo.com'
  UNION ALL
    SELECT u.User_ID, u.First_Name, u.Referred_By, rt.Level + 1,
           CONCAT(rt.Path, ' -> ', u.First_Name)
    FROM USERS u
    JOIN referral_tree rt ON u.Referred_By = rt.User_ID
)
SELECT User_ID, First_Name, Level, Path
FROM referral_tree
ORDER BY Level, User_ID;

-- ---------------------------------------------------------------------
-- Q9. NON-RECURSIVE CTE + window function : best-selling movie in
--     every theatre (by tickets sold)
-- ---------------------------------------------------------------------
WITH tickets AS (
    SELECT t.Name AS Theatre, m.Title, COUNT(*) AS Tickets
    FROM BOOKING_SEAT bs
    JOIN SHOWS   sh ON sh.Show_ID    = bs.Show_ID
    JOIN MOVIE   m  ON m.Movie_ID    = sh.Movie_ID
    JOIN SCREEN  sc ON sc.Screen_ID  = sh.Screen_ID
    JOIN THEATRE t  ON t.Theatre_ID  = sc.Theatre_ID
    GROUP BY t.Name, m.Title
),
ranked AS (
    SELECT *, RANK() OVER (PARTITION BY Theatre ORDER BY Tickets DESC) AS rnk
    FROM tickets
)
SELECT Theatre, Title, Tickets FROM ranked WHERE rnk = 1;

-- ---------------------------------------------------------------------
-- Q10. LEFT JOIN + aggregation : occupancy % of every show
--      (shows with zero bookings still appear thanks to LEFT JOIN)
-- ---------------------------------------------------------------------
SELECT sh.Show_ID, m.Title,
       COUNT(bs.Seat_No)                                   AS Sold,
       (SELECT COUNT(*) FROM SEAT s WHERE s.Screen_ID = sh.Screen_ID) AS Capacity,
       ROUND(100 * COUNT(bs.Seat_No) /
             (SELECT COUNT(*) FROM SEAT s WHERE s.Screen_ID = sh.Screen_ID), 1) AS Occupancy_Pct
FROM SHOWS sh
JOIN MOVIE m ON m.Movie_ID = sh.Movie_ID
LEFT JOIN BOOKING_SEAT bs ON bs.Show_ID = sh.Show_ID
GROUP BY sh.Show_ID, m.Title, sh.Screen_ID
ORDER BY Occupancy_Pct DESC;

-- ---------------------------------------------------------------------
-- Q11. Payment summary by method (GROUP BY + conditional aggregation)
-- ---------------------------------------------------------------------
SELECT Method,
       COUNT(*)                                   AS Payments,
       SUM(CASE WHEN Status = 'PAID'     THEN Amount ELSE 0 END) AS Collected,
       SUM(CASE WHEN Status = 'REFUNDED' THEN Amount ELSE 0 END) AS Refunded
FROM PAYMENT
GROUP BY Method;


-- #####################################################################
--  PART C : CALLING THE PROGRAMS (procedure / function / trigger demo)
-- #####################################################################

-- C1. Function
SELECT fn_seats_left(1) AS seats_left_show_1,
       fn_seat_price(1, 1, 'E', 1) AS premium_price,
       fn_seat_price(1, 1, 'A', 1) AS regular_price;

-- C2. Procedure: Priya books 2 seats (1 regular + 1 premium) for show 3
--     (any upcoming show that is still empty, so the demo works on any date)
SET @demo_show = (SELECT MIN(Show_ID) FROM SHOWS
                   WHERE Show_Time > NOW() + INTERVAL 1 HOUR AND fn_seats_left(Show_ID) = 50);
CALL sp_book_seats(9, @demo_show, 'A1,E1', 'UPI', @new_booking);
SELECT @new_booking AS booking_id;
-- Trigger 2 computed Total_Amount automatically: base price + 1.5 x base (premium E1)
SELECT * FROM BOOKING WHERE Booking_ID = @new_booking;
SELECT * FROM PAYMENT WHERE Booking_ID = @new_booking;

-- C3. Procedure + Trigger 3: cancel it -> payment REFUNDED, seats freed
CALL sp_cancel_booking(@new_booking, 9);
SELECT b.Booking_ID, b.Status, p.Status AS Payment_Status,
       (SELECT COUNT(*) FROM BOOKING_SEAT WHERE Booking_ID = b.Booking_ID) AS Seats_Held
FROM BOOKING b JOIN PAYMENT p ON p.Booking_ID = b.Booking_ID
WHERE b.Booking_ID = @new_booking;

-- C4. Procedure: admin adds a show; second call clashes and is rejected
--     (the day after the last show on Screen 2, so it never clashes with existing shows)
SET @t = (SELECT TIMESTAMP(DATE(GREATEST(COALESCE(MAX(Show_Time), NOW()), NOW())) + INTERVAL 1 DAY, '10:00:00')
            FROM SHOWS WHERE Screen_ID = 2);
CALL sp_add_show(6, 2, @t, 199, @s);
SELECT @s AS new_show_id, @t AS show_time;
-- CALL sp_add_show(1, 2, @t + INTERVAL 1 HOUR, 199, @s);   -- ERROR: Screen is busy
