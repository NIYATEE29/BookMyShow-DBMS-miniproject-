#!/bin/bash
# CineBook – one-shot setup + run (macOS)
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/mysql/bin:/usr/local/mysql/bin:$PATH"

echo "== Starting MySQL & Redis =="
brew services start mysql >/dev/null 2>&1 || true
brew services start redis >/dev/null 2>&1 || true

for i in 1 2 3; do
  read -s -p "MySQL root password (press Enter if none): " MYSQL_PWD; echo
  export MYSQL_PWD
  if mysql -u root -e "SELECT 1" >/dev/null 2>&1; then echo "Login OK"; break; fi
  echo "Wrong password, try again."; [ $i = 3 ] && { echo "Giving up. See: reset MySQL root password."; exit 1; }
done

echo "== Loading SQL =="
mysql -u root < sql/01_schema.sql                          && echo "01 schema    OK"
mysql -u root movie_ticket_booking < sql/02_programs.sql   && echo "02 programs  OK"
mysql -u root movie_ticket_booking < sql/03_seed.sql       && echo "03 seed      OK"
mysql -u root movie_ticket_booking < sql/04_bulk_and_index.sql && echo "04 bulk+idx  OK"
mysql -u root movie_ticket_booking < sql/08_today_shows.sql >/dev/null && echo "08 today     OK"
mysql -u root movie_ticket_booking < sql/09_posters.sql >/dev/null    && echo "09 posters   OK"
mysql -u root movie_ticket_booking < sql/10_real_posters.sql >/dev/null && echo "10 posters   OK"
mysql -u root < sql/06_roles.sql                           && echo "06 roles     OK"
mysql -u root movie_ticket_booking < sql/11_upgrade.sql >/dev/null   && echo "11 upgrade   OK"
mysql -u root movie_ticket_booking < sql/12_future_shows.sql >/dev/null && echo "12 future    OK"
mysql -u root movie_ticket_booking -e "SELECT COUNT(*) AS users FROM USERS; SELECT COUNT(*) AS shows FROM SHOWS;"

echo "== Seeding Redis =="
bash redis/seed_reviews.sh

echo "== Starting web app =="
cd web
[ -f .env.local ] || cp .env.example .env.local
[ -d node_modules ] || npm install
echo ">> Open http://localhost:3000  (admin@cine.com / admin123 · admin.galaxy@cine.com / admin123 · nikita@demo.com / user123)"
npm run dev
