# BookMyShow-DBMS-miniproject-
# BookMyShow — Online Movie Ticket Booking & Theatre Management System

DBMS Mini-Project · PES University · Dept. of CSE · Aug–Dec 2026

**Stack:** MySQL 8.0 (relational core) · Redis 7 (NoSQL – reviews & ratings) · Next.js 14 (web UI + API routes)

Customers browse shows, pick seats on a live seat map, pay, cancel (auto-refund) and review movies.
Theatre admins manage movies, schedule shows (with clash detection), see revenue/occupancy reports,
search customers and moderate reviews. **Role-based access is enforced inside MySQL** with two DB roles.

---

## 1. Project structure

```
movie_ticket_booking/
├── sql/
│   ├── 01_schema.sql           DDL – 10 tables, PK/FK/UNIQUE/CHECK/DEFAULT/NULL/NOT NULL
│   ├── 02_programs.sql         2 functions, 3 triggers, 3 procedures, 1 view
│   ├── 03_seed.sql             sample data (bookings made via the procedure)
│   ├── 04_bulk_and_index.sql   4,200 rows into USERS + index + EXPLAIN before/after
│   ├── 05_queries.sql          DML + 11 complex queries (join/nested/correlated/recursive/CTE/having)
│   └── 06_roles.sql            MySQL roles role_admin / role_customer + 2 login users
├── redis/
│   ├── seed_reviews.sh         creates the Redis review "database" (hashes, sets, sorted set)
│   └── rud_demo.sh             Read / Update / Delete demo (+ Lua script)
├── web/                        Next.js 14 app (App Router, JS)
│   ├── app/login, app/register          auth pages
│   ├── app/customer/page.js             customer dashboard (3 tabs)
│   ├── app/admin/page.js                admin dashboard (6 tabs)
│   ├── app/api/**                       REST API routes → MySQL / Redis
│   ├── lib/db.js                        2 MySQL pools (admin / customer DB accounts)
│   ├── lib/reviews.js                   Redis data-access layer
│   ├── lib/session.js, middleware.js    JWT auth + route protection
│   └── .env.example
└── docs/
    ├── er/er_diagram.png               Chen ER diagram (+ .svg, generator script)
    ├── er/relational_schema.png        relational schema with keys & constraints
    ├── PROJECT_REPORT.md / .pdf        full report (rubric-wise)
    ├── VIVA_PREP.md                    2 live modifications + viva Q&A
    ├── GIT_GUIDE.md                    how to push + commit plan for 2 members
    └── screenshots/                    UI screenshots
```

## 2. Prerequisites (macOS)

```bash
brew install mysql redis node      # skip any you already have (MySQL 8.0.x is fine)
brew services start mysql
brew services start redis
```

## 3. Database setup (run from the project folder)

```bash
cd ~/Downloads/movie_ticket_booking          # wherever you unzipped it

mysql -u root -p < sql/01_schema.sql
mysql -u root -p movie_ticket_booking < sql/02_programs.sql
mysql -u root -p movie_ticket_booking < sql/03_seed.sql
mysql -u root -p movie_ticket_booking < sql/04_bulk_and_index.sql
mysql -u root -p < sql/06_roles.sql
# optional – runs every demo query (it also inserts/updates a few rows):
mysql -u root -p movie_ticket_booking < sql/05_queries.sql
```

> Re-running `01_schema.sql` drops and recreates everything, so you can always reset to a clean state
> by running files 01 → 02 → 03 → 04 → 06 again.

## 4. Redis setup

```bash
bash redis/seed_reviews.sh     # CREATE
bash redis/rud_demo.sh         # READ / UPDATE / DELETE demo
```

## 5. Run the web app

```bash
cd web
cp .env.example .env.local     # edit only if your MySQL/Redis settings differ
npm install
npm run dev                    # http://localhost:3000
```

| Role | Email | Password |
|---|---|---|
| Admin (Galaxy Cinemas) | admin.galaxy@cine.com | admin123 |
| Admin (Starlight) | admin.starlight@cine.com | admin123 |
| Admin (Regal) | admin.regal@cine.com | admin123 |
| Customer | nikita@demo.com (also rahul@, sneha@, arjun@, kavya@, priya@ …) | user123 |

Database logins (for the two-terminal RBAC demo): `cine_admin / Admin@123`, `cine_customer / Customer@123`.

## 6. Rubric → where to find it

| # | Rubric item | Marks | Where |
|---|---|---|---|
| 1 | ER diagram | 2 | `docs/er/er_diagram.png` |
| 2 | Relational schema with keys, relationships, constraints | 3 | `docs/er/relational_schema.png`, report §3 |
| 3 | SQL DDL with constraints | 4 | `sql/01_schema.sql` |
| 4 | NoSQL database creation | 4 | `redis/seed_reviews.sh`, `web/lib/reviews.js` |
| 5 | Technology justification | 1 | report §2 |
| 6 | DML operations | 4 | `sql/03_seed.sql`, `sql/05_queries.sql` Part A, all web forms |
| 7 | Nested / correlated / recursive / join queries | 4 | `sql/05_queries.sql` Q1–Q11, admin dashboard |
| 8 | Procedure / function / trigger / CTE | 6 | `sql/02_programs.sql`, Q8–Q9 |
| 9 | NoSQL feature – Read, Update, Delete | 7 | `redis/rud_demo.sh`, Reviews tabs (customer + admin) |
| 10 | Next.js interface | 3 | `web/app/**` |
| 11 | Backend / API + DB integration | 2 | `web/app/api/**`, `web/lib/db.js` |
| 12 | Auth (front-end) + ≥2 roles + RBAC in DB | 4 | login/register, `middleware.js`, `sql/06_roles.sql` |
| 13 | Documentation, Git/GitHub | 2 | this README, `docs/`, `docs/GIT_GUIDE.md` |
| 14 | Originality, contribution, modification/viva | 4 | `docs/VIVA_PREP.md`, report §10 |

Faculty-specific requirements: **>4,000 rows** in `USERS` + **index on non-PK column** `Last_Name`
(`04_bulk_and_index.sql`, with EXPLAIN before/after); **only Screen 1 and Screen 2** per theatre
(`CHECK (Screen_No IN (1,2))`); **admin vs user in two terminals** (`06_roles.sql` bottom).
