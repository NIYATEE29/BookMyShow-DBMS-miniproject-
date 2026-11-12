'use client';
import { useEffect, useState } from 'react';
import Poster from '@/components/Poster';
import ReviewModal from './ReviewModal';
import { api, ago, inr, longDate } from '@/lib/client';

// customer profile: details, spend stats, watched movies, my reviews
export default function Profile({ flash, onOpenMovie }) {
  const [p, setP] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const load = () => api('/api/me/profile').then(setP).catch((e) => flash(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line

  if (!p) return <p className="muted">Loading…</p>;
  const u = p.user, s = p.stats;
  const reviewOf = Object.fromEntries(p.reviews.map((r) => [r.movie_id, r]));
  const initials = `${u.First_Name?.[0] || ''}${u.Last_Name?.[0] || ''}`.toUpperCase();

  const tiles = [
    ['Total spent', inr(s.Spent)],
    ['Bookings', s.Bookings],
    ['Tickets bought', s.Tickets],
    ['Movies watched', s.Movies_Watched],
    ['Refunds received', inr(s.Refunded)],
    ['Favourite genre', s.Favourite_Genre || '—'],
  ];

  return (
    <>
      <div className="card profile-head">
        <div className="avatar xl">{initials || '?'}</div>
        <div>
          <h2>{u.First_Name} {u.Last_Name || ''}</h2>
          <p className="muted">{u.Email}</p>
          <p className="muted small">
            Member since {longDate(u.Created_At)}
            {u.Referrer_First && <> · Referred by {u.Referrer_First} {u.Referrer_Last || ''}</>}
            {u.Referrals > 0 && <> · You referred {u.Referrals} friend{u.Referrals > 1 ? 's' : ''}</>}
          </p>
        </div>
      </div>

      <div className="stats">
        {tiles.map(([k, v]) => <div className="card stat" key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>

      <h3 className="group-title">Movies you&apos;ve watched</h3>
      {!p.watched.length && <p className="muted">Nothing yet – your watched movies will show up here after the show.</p>}
      <div className="mini-grid">
        {p.watched.map((m) => {
          const r = reviewOf[m.Movie_ID];
          return (
            <div key={m.Movie_ID} className="mini-card">
              <button type="button" className="poster-btn" onClick={() => onOpenMovie(m.Movie_ID)} aria-label={`Open ${m.Title}`}>
                <Poster src={m.Poster_URL} title={m.Title} className="poster-fill" />
              </button>
              <b>{m.Title}</b>
              <span className="muted small">Watched {ago(m.Last_Watched).toLowerCase()}{m.Times > 1 ? ` · ${m.Times}×` : ''}</span>
              <button className="btn small" onClick={() => setReviewing({ movie: m, existing: r })}>
                {r ? `★ ${r.rating} · Edit` : 'Rate & review'}
              </button>
            </div>
          );
        })}
      </div>

      <h3 className="group-title">Your reviews</h3>
      {!p.reviews.length && <p className="muted">You haven&apos;t reviewed anything yet.</p>}
      <div className="review-grid">
        {p.reviews.map((r) => (
          <div className="card review" key={r.movie_id}>
            <div className="show-top">
              <button type="button" className="link strong" onClick={() => onOpenMovie(r.movie_id)}>{r.title}</button>
              <span className="rating">★ {r.rating}/5</span>
            </div>
            <p>{r.comment}</p>
            <div className="show-top">
              <span className="muted small">{ago(r.updated_at)}</span>
              <button className="btn ghost small"
                onClick={() => setReviewing({ movie: { Movie_ID: r.movie_id, Title: r.title }, existing: r })}>Edit</button>
            </div>
          </div>
        ))}
      </div>

      {reviewing && (
        <ReviewModal movie={reviewing.movie} existing={reviewing.existing} flash={flash}
          onClose={() => setReviewing(null)} onSaved={load} />
      )}
    </>
  );
}
