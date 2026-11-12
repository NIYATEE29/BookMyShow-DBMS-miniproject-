// MySQL connection pools.
// THREE pools = THREE database accounts (created in sql/06_roles.sql).
// Every request runs with the DB account that matches the logged-in user's role,
// so even if the UI had a bug, MySQL itself would refuse an action the role may not do.
//   ADMIN          -> cine_admin     (platform admin, full control)
//   THEATRE_ADMIN  -> cine_theatre   (one theatre: read + schedule/delete shows)
//   CUSTOMER       -> cine_customer  (read catalogue, book/cancel via procedures)
import mysql from 'mysql2/promise';

const g = globalThis;

function makePool(user, password) {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'movie_ticket_booking',
    user,
    password,
    connectionLimit: 5,
    dateStrings: true,
    decimalNumbers: true,
  });
}

export function db(role) {
  if (!g.__pools) {
    g.__pools = {
      ADMIN: makePool(process.env.DB_ADMIN_USER || 'cine_admin', process.env.DB_ADMIN_PASS || 'Admin@123'),
      THEATRE_ADMIN: makePool(process.env.DB_THEATRE_USER || 'cine_theatre', process.env.DB_THEATRE_PASS || 'Theatre@123'),
      CUSTOMER: makePool(process.env.DB_CUSTOMER_USER || 'cine_customer', process.env.DB_CUSTOMER_PASS || 'Customer@123'),
    };
  }
  return g.__pools[role] || g.__pools.CUSTOMER;
}

// run a query and return just the rows
export async function q(role, sql, params = []) {
  const [rows] = await db(role).query(sql, params);
  return rows;
}
