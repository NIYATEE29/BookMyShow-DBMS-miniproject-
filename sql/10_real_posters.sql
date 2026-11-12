-- =====================================================================
-- 10_real_posters.sql : use the downloaded poster images (web/public/posters/*.jpg)
-- Also adds The Matrix to the catalogue. Safe to re-run.
-- Inside mysql:  SOURCE /Users/nikitamankani/Downloads/movie_ticket_booking/sql/10_real_posters.sql;
-- =====================================================================
USE movie_ticket_booking;

-- make sure MOVIE.Poster_URL exists (same guard as 09_posters.sql)
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MOVIE' AND COLUMN_NAME = 'Poster_URL');
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE MOVIE ADD COLUMN Poster_URL VARCHAR(255) NULL AFTER Release_Date',
  'SELECT ''Poster_URL already exists'' AS info');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- new movie (no shows yet -> schedule one from the admin Shows tab)
INSERT IGNORE INTO MOVIE (Title, Language, Duration_Min, Release_Date)
VALUES ('The Matrix', 'English', 136, '1999-03-31');
INSERT IGNORE INTO MOVIE_GENRE (Movie_ID, Genre)
SELECT Movie_ID, g.Genre FROM MOVIE
CROSS JOIN (SELECT 'Sci-Fi' AS Genre UNION ALL SELECT 'Action') g
WHERE Title = 'The Matrix';

-- point every movie at its real poster
UPDATE MOVIE m
JOIN (SELECT 'Interstellar' AS Title, '/posters/interstellar.jpg' AS Url UNION ALL
      SELECT '3 Idiots',         '/posters/3-idiots.jpg'        UNION ALL
      SELECT 'Kantara',          '/posters/kantara.jpg'         UNION ALL
      SELECT 'Inception',        '/posters/inception.jpg'       UNION ALL
      SELECT 'RRR',              '/posters/rrr.jpg'             UNION ALL
      SELECT 'Oppenheimer',      '/posters/oppenheimer.jpg'     UNION ALL
      SELECT 'Dune: Part Two',   '/posters/dune-part-two.jpg'   UNION ALL
      SELECT 'Inside Out 2',     '/posters/inside-out-2.jpg'    UNION ALL
      SELECT 'Jawan',            '/posters/jawan.jpg'           UNION ALL
      SELECT 'Laapataa Ladies',  '/posters/laapataa-ladies.jpg' UNION ALL
      SELECT 'Kalki 2898 AD',    '/posters/kalki-2898-ad.jpg'   UNION ALL
      SELECT 'Manjummel Boys',   '/posters/manjummel-boys.jpg'  UNION ALL
      SELECT 'The Matrix',       '/posters/the-matrix.jpg') p ON p.Title = m.Title
SET m.Poster_URL = p.Url;

SELECT Movie_ID, Title, Poster_URL FROM MOVIE ORDER BY Title;
