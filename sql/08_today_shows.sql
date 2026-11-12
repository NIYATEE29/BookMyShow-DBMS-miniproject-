-- =====================================================================
-- 08_today_shows.sql : extra movies + shows for TODAY (UI testing)
-- Safe to re-run (INSERT IGNORE skips duplicates).
-- Run:  mysql -u root -p movie_ticket_booking < 08_today_shows.sql
-- =====================================================================
USE movie_ticket_booking;

-- ---------- 7 new movies ----------
INSERT IGNORE INTO MOVIE (Title, Language, Duration_Min, Release_Date) VALUES
 ('Oppenheimer',      'English',   180, '2023-07-21'),
 ('Dune: Part Two',   'English',   166, '2024-03-01'),
 ('Inside Out 2',     'English',    96, '2024-06-14'),
 ('Jawan',            'Hindi',     169, '2023-09-07'),
 ('Laapataa Ladies',  'Hindi',     124, '2024-03-01'),
 ('Kalki 2898 AD',    'Telugu',    181, '2024-06-27'),
 ('Manjummel Boys',   'Malayalam', 135, '2024-02-22');

-- ---------- genres (multivalued attribute) ----------
INSERT IGNORE INTO MOVIE_GENRE (Movie_ID, Genre)
SELECT m.Movie_ID, g.Genre
FROM (SELECT 'Oppenheimer' AS Title, 'Drama' AS Genre UNION ALL
      SELECT 'Oppenheimer','History'      UNION ALL
      SELECT 'Dune: Part Two','Sci-Fi'    UNION ALL
      SELECT 'Dune: Part Two','Action'    UNION ALL
      SELECT 'Inside Out 2','Animation'   UNION ALL
      SELECT 'Inside Out 2','Comedy'      UNION ALL
      SELECT 'Jawan','Action'             UNION ALL
      SELECT 'Jawan','Thriller'           UNION ALL
      SELECT 'Laapataa Ladies','Comedy'   UNION ALL
      SELECT 'Laapataa Ladies','Drama'    UNION ALL
      SELECT 'Kalki 2898 AD','Sci-Fi'     UNION ALL
      SELECT 'Kalki 2898 AD','Action'     UNION ALL
      SELECT 'Manjummel Boys','Thriller'  UNION ALL
      SELECT 'Manjummel Boys','Drama') g
JOIN MOVIE m ON m.Title = g.Title;

-- ---------- TODAY's shows: all 6 screens, no overlaps (duration + 20 min gap) ----------
-- Screen 1,2 = Galaxy Koramangala | 3,4 = Starlight Whitefield | 5,6 = Regal Jayanagar
INSERT IGNORE INTO SHOWS (Movie_ID, Screen_ID, Show_Time, Base_Price)
SELECT m.Movie_ID, x.Scr, TIMESTAMP(CURDATE(), x.T), x.Price
FROM (SELECT 'Oppenheimer' AS Title, 1 AS Scr, '13:00:00' AS T, 280 AS Price UNION ALL
      SELECT 'Inside Out 2',      1, '17:00:00', 220 UNION ALL
      SELECT 'Dune: Part Two',    1, '19:30:00', 350 UNION ALL
      SELECT 'Jawan',             2, '12:30:00', 240 UNION ALL
      SELECT 'Laapataa Ladies',   2, '16:15:00', 200 UNION ALL
      SELECT 'Interstellar',      2, '19:00:00', 320 UNION ALL
      SELECT 'Kalki 2898 AD',     3, '12:00:00', 260 UNION ALL
      SELECT 'Manjummel Boys',    3, '16:00:00', 210 UNION ALL
      SELECT 'Oppenheimer',       3, '19:15:00', 340 UNION ALL
      SELECT 'Dune: Part Two',    4, '13:30:00', 280 UNION ALL
      SELECT 'Jawan',             4, '17:15:00', 260 UNION ALL
      SELECT 'Inside Out 2',      4, '21:00:00', 250 UNION ALL
      SELECT 'Laapataa Ladies',   5, '12:15:00', 180 UNION ALL
      SELECT 'Kantara',           5, '15:00:00', 200 UNION ALL
      SELECT 'Kalki 2898 AD',     5, '18:30:00', 300 UNION ALL
      SELECT 'Manjummel Boys',    6, '14:00:00', 190 UNION ALL
      SELECT 'RRR',               6, '17:00:00', 260 UNION ALL
      SELECT 'Laapataa Ladies',   6, '21:15:00', 220) x
JOIN MOVIE m ON m.Title = x.Title;

-- ---------- check ----------
SELECT Show_ID, Title, Language, Theatre, Screen_No,
       TIME_FORMAT(Show_Time, '%h:%i %p') AS Starts, Base_Price, Seats_Left
FROM v_show_details
WHERE DATE(Show_Time) = CURDATE()
ORDER BY Theatre, Screen_No, Show_Time;
