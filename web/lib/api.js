import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// MySQL error numbers we translate into friendly HTTP codes
const BAD_REQUEST = new Set([1062, 1451, 1452, 3819, 1048, 1406, 1054]); // dup, FK, CHECK, NOT NULL, too long
const FORBIDDEN = new Set([1142, 1143, 1370]);                     // privilege denied

// wraps a route handler: any thrown error becomes a JSON {error} response
export function route(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      let status = e.status || 500;
      if (!e.status) {
        if (e.sqlState === '45000' || BAD_REQUEST.has(e.errno)) status = 400;
        else if (FORBIDDEN.has(e.errno)) status = 403;
      }
      // business-rule messages (HttpError / SIGNAL 45000) are already user-friendly
      let message = e.status || e.sqlState === '45000' ? e.sqlMessage || e.message : friendly(e);
      if (status === 500) {
        console.error(e);
        message = 'Something went wrong. Please try again.';
      }
      return NextResponse.json({ error: message }, { status });
    }
  };
}

export const ok = (data, status = 200) => NextResponse.json(data, { status });

// translate low-level database errors into plain-language messages for the UI
function friendly(e) {
  const raw = e.sqlMessage || '';
  switch (e.errno) {
    case 1062:
      if (raw.includes('uq_seat_per_show')) return 'Sorry – one of those seats was just booked by someone else. Please pick again.';
      if (raw.includes('uq_users_email')) return 'An account with this email already exists.';
      if (raw.includes('uq_movie_title_lang')) return 'This movie already exists in that language.';
      if (raw.includes('uq_show_slot')) return 'A show is already scheduled on this screen at that time.';
      return 'This record already exists.';
    case 1451: return 'This item cannot be deleted because it is linked to existing shows or bookings.';
    case 1452: return 'The selected item no longer exists. Please refresh and try again.';
    case 3819:
      if (raw.includes('chk_movie_duration')) return 'Duration must be between 30 and 300 minutes.';
      if (raw.includes('chk_show_price')) return 'Price must be greater than zero.';
      if (raw.includes('chk_users_email')) return 'Please enter a valid email address.';
      return 'One of the values entered is not allowed. Please check the form and try again.';
    case 1054:
      if (raw.includes('Poster_URL')) return 'Posters are not set up in the database yet. Run sql/09_posters.sql once, then try again.';
      return 'The database is missing a column this page needs. Please re-run the SQL setup scripts.';
    case 1048: return 'Please fill in all required fields.';
    case 1406: return 'One of the values entered is too long.';
    case 1142: case 1143: case 1370: return 'You do not have permission to perform this action.';
    default: return e.message || 'Something went wrong. Please try again.';
  }
}
