-- =====================================================================
-- 09_posters.sql : MOVIE.Poster_URL (nullable) + default posters
-- Safe to re-run: the column is only added if it doesn't exist yet.
-- Run:  mysql -u root -p movie_ticket_booking < 09_posters.sql
--  or inside mysql:  SOURCE /Users/nikitamankani/Downloads/movie_ticket_booking/sql/09_posters.sql;
-- =====================================================================
USE movie_ticket_booking;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MOVIE' AND COLUMN_NAME = 'Poster_URL');
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE MOVIE ADD COLUMN Poster_URL VARCHAR(255) NULL AFTER Release_Date',
  'SELECT ''Poster_URL already exists'' AS info');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- default artwork shipped in web/public/posters/ (only where no poster set yet)
UPDATE MOVIE m
JOIN (SELECT 'Interstellar' AS Title, '/posters/interstellar.svg' AS Url UNION ALL
      SELECT '3 Idiots',           '/posters/3-idiots.svg'          UNION ALL
      SELECT 'Kantara',            '/posters/kantara.svg'           UNION ALL
      SELECT 'Inception',          '/posters/inception.svg'         UNION ALL
      SELECT 'RRR',                '/posters/rrr.svg'               UNION ALL
      SELECT 'Lost in Bengaluru',  '/posters/lost-in-bengaluru.svg' UNION ALL
      SELECT 'Oppenheimer',        '/posters/oppenheimer.svg'       UNION ALL
      SELECT 'Dune: Part Two',     '/posters/dune-part-two.svg'     UNION ALL
      SELECT 'Inside Out 2',       '/posters/inside-out-2.svg'      UNION ALL
      SELECT 'Jawan',              '/posters/jawan.svg'             UNION ALL
      SELECT 'Laapataa Ladies',    '/posters/laapataa-ladies.svg'   UNION ALL
      SELECT 'Kalki 2898 AD',      '/posters/kalki-2898-ad.svg'     UNION ALL
      SELECT 'Manjummel Boys',     '/posters/manjummel-boys.svg') p ON p.Title = m.Title
SET m.Poster_URL = p.Url
WHERE m.Poster_URL IS NULL;

SELECT Movie_ID, Title, Poster_URL FROM MOVIE ORDER BY Movie_ID;
