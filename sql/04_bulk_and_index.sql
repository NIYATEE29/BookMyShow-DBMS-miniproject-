-- =====================================================================
--  File 04 : > 4,000 rows in one table + INDEX on a non-PK column
--  Run as root:   mysql -u root -p movie_ticket_booking < sql/04_bulk_and_index.sql
--
--  Table chosen : USERS  (bulk "registered but not yet booked" customers).
--  Why USERS    : it is the least-used table in day-to-day transactions,
--                 so 4,200 extra rows don't distort any booking/revenue
--                 numbers; and searching customers by surname is a real
--                 admin use case, which makes a good case for an index.
--  Index        : idx_users_last_name ON USERS(Last_Name)   (non-PK column)
-- =====================================================================
USE movie_ticket_booking;

-- the generator below uses a RECURSIVE CTE, default depth limit is 1000
SET SESSION cte_max_recursion_depth = 5000;

INSERT INTO USERS (First_Name, Last_Name, Email, Password_Hash, Role)
WITH RECURSIVE seq (n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 4200
)
SELECT ELT(1 + (n % 12), 'Aarav','Ishita','Kabir','Tanvi','Dev','Ananya',
                         'Yash','Riya','Aditya','Pooja','Neel','Sanya'),
       ELT(1 + (n % 15), 'Patel','Sharma','Iyer','Reddy','Nair','Gupta','Rao',
                         'Das','Joshi','Kapoor','Menon','Bose','Shetty','Khan','Singh'),
       CONCAT('customer', LPAD(n, 4, '0'), '@demo.com'),
       '$2a$10$z7GIe.Y8QejCvG6krT0yvu/fnCpHSluVvJ/1oGgKpcb60aIFVL3qy',   -- user123
       'CUSTOMER'
FROM seq;

SELECT COUNT(*) AS total_users FROM USERS;            -- 4,212

-- ------------------- BEFORE index : full table scan -------------------
EXPLAIN SELECT User_ID, First_Name, Last_Name, Email
        FROM USERS WHERE Last_Name = 'Patel';
-- type = ALL, rows ~ 4,200  (every row is read)

-- ------------------- create the index -------------------
CREATE INDEX idx_users_last_name ON USERS (Last_Name);

-- ------------------- AFTER index : index lookup -------------------
EXPLAIN SELECT User_ID, First_Name, Last_Name, Email
        FROM USERS WHERE Last_Name = 'Patel';
-- type = ref, key = idx_users_last_name, rows ~ 280  (only matching rows)

-- a second useful index: shows are always searched by date/time
CREATE INDEX idx_shows_time ON SHOWS (Show_Time);

SHOW INDEX FROM USERS;
