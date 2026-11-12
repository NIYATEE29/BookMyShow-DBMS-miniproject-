'use client';
import { useEffect, useState } from 'react';
import Poster from '@/components/Poster';
import ReviewModal from './ReviewModal';
import { api, inr, when } from '@/lib/client';

// My Bookings: upcoming (cancel) · watched (rate & review) · cancelled
export default function MyBookings({ flash, onOpenMovie }) {
  const [rows, setRows] = useState(null);
  const [reviews, setReviews] = useState({});
  const [reviewing, setReviewing] = useState(null);

  const load = () => {
    api('/api/bookings').then(setRows).catch((e) => flash(e.message, 'error'));
    api('/api/me/profile').then((p) => setReviews(Object.fromEntries(p.reviews.map((r) => [r.movie_id, r])))).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function cancel(b) {
    if (!confirm(`Cancel booking #${b.Booking_ID} (${b.Title})? ${inr(b.Total_Amount)} will be refunded.`)) return;
    try {
      await api(`/api/bookings/${b.Booking_ID}/cancel`, { method: 'POST' });
      flash(`Booking #${b.Booking_ID} cancelled – refund of ${inr(b.Total_Amount)} initiated`);
      load();
    } catch (e) { flash(e.message, 'error'); }
  }

  if (!rows) return <p className="muted">Loading…</p>;
  const upcoming = rows.filter((r) => r.Status === 'CONFIRMED' && !r.Is_Past).reverse();
  const watched = rows.filter((r) => r.Status === 'CONFIRMED' && r.Is_Past);
  const cancelled = rows.filter((r) => r.Status === 'CANCELLED');

  const Card = ({ b, children }) => (
    <div className="card booking-card">
      <button type="button" className="poster-btn" onClick={() => onOpenMovie(b.Movie_ID)} aria-label={`Open ${b.Title}`}>
        <Poster src={b.Poster_URL} title={b.Title} className="poster-sm" />
      </button>
      <div className="booking-info">
        <div className="show-top">
          <h3>{b.Title}</h3>
          <span className={'pill ' + (b.Status === 'CANCELLED' ? 'cancelled' : b.Is_Past ? 'past' : 'confirmed')}>
            {b.Status === 'CANCELLED' ? 'CANCELLED' : b.Is_Past ? 'WATCHED' : 'CONFIRMED'}
          </span>
        </div>
        <p>{b.Theatre} · Screen {b.Screen_No}</p>
        <p className="muted">{when(b.Show_Time)} · Seats {b.Seats || '—'}</p>
        <p className="muted small">Booking #{b.Booking_ID} · {inr(b.Total_Amount)} · {b.Method} {b.Payment_Status}</p>
        <div className="actions">{children}</div>
      </div>
    </div>
  );

  return (
    <>
      <h2>My Bookings</h2>
      {!rows.length && <p className="muted">You have no bookings yet. Pick a movie and grab some seats!</p>}

      {upcoming.length > 0 && <h3 className="group-title">Upcoming</h3>}
      <div className="booking-grid">
        {upcoming.map((b) => (
          <Card key={b.Booking_ID} b={b}>
            <button className="btn danger small" onClick={() => cancel(b)}>Cancel booking</button>
          </Card>
        ))}
      </div>

      {watched.length > 0 && <h3 className="group-title">Watched</h3>}
      <div className="booking-grid">
        {watched.map((b) => {
          const mine = reviews[b.Movie_ID];
          return (
            <Card key={b.Booking_ID} b={b}>
              {mine && <span className="rating">Your rating ★ {mine.rating}/5</span>}
              <button className="btn small" onClick={() => setReviewing({ b, mine })}>{mine ? 'Edit review' : 'Rate & review'}</button>
            </Card>
          );
        })}
      </div>

      {cancelled.length > 0 && <h3 className="group-title">Cancelled</h3>}
      <div className="booking-grid">
        {cancelled.map((b) => <Card key={b.Booking_ID} b={b} />)}
      </div>

      {reviewing && (
        <ReviewModal movie={reviewing.b} existing={reviewing.mine} flash={flash}
          onClose={() => setReviewing(null)} onSaved={load} />
      )}
    </>
  );
}
