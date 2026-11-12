'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Poster from '@/components/Poster';
import DateStrip from './DateStrip';
import { ShowtimeChips, AvailabilityLegend } from './Showtimes';
import { ReviewForm } from './ReviewModal';
import { api, ago, dayKey, duration, longDate } from '@/lib/client';

// one movie: details, showtimes by date & cinema, reviews (Redis), write a review
export default function MovieDetail({ movieId, shows, theatres, onBook, onBack, onOpenMovie, flash }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => api(`/api/movies/${movieId}`).then(setData).catch((e) => flash(e.message, 'error')), [movieId, flash]);
  useEffect(() => { setData(null); load(); window.scrollTo({ top: 0 }); }, [load]);

  const mine = useMemo(() => shows.filter((s) => s.Movie_ID === movieId), [shows, movieId]);
  const days = useMemo(() => [...new Set(mine.map((s) => dayKey(s.Show_Time)))].sort(), [mine]);
  const [day, setDay] = useState(null);
  useEffect(() => { if (!day || !days.includes(day)) setDay(days[0] || null); }, [days, day]);

  const byTheatre = useMemo(() => {
    const m = new Map();
    mine.filter((s) => dayKey(s.Show_Time) === day).forEach((s) => {
      if (!m.has(s.Theatre_ID)) m.set(s.Theatre_ID, []);
      m.get(s.Theatre_ID).push(s);
    });
    return [...m.entries()];
  }, [mine, day]);

  // "You might also like": other movies now showing that share a genre
  const similar = useMemo(() => {
    if (!data) return [];
    const g = new Set((data.movie.Genres || '').split(', ').filter(Boolean));
    const seen = new Map();
    shows.forEach((s) => {
      if (s.Movie_ID !== movieId && !seen.has(s.Movie_ID) && (s.Genres || '').split(', ').some((x) => g.has(x)))
        seen.set(s.Movie_ID, s);
    });
    return [...seen.values()].slice(0, 5);
  }, [data, shows, movieId]);

  if (!data) return <p className="muted">Loading…</p>;
  const m = data.movie;
  const tName = (id) => theatres.find((t) => t.Theatre_ID === id);

  return (
    <div className="movie-page">
      <button className="link back" onClick={onBack}>← All movies</button>

      <section className="hero" style={m.Poster_URL ? { '--hero-img': `url("${m.Poster_URL}")` } : undefined}>
        <Poster src={m.Poster_URL} title={m.Title} className="poster-hero" />
        <div className="hero-info">
          <h1>{m.Title}</h1>
          <div className="rating-box">
            {data.average
              ? <><span className="big-star">★</span> <b>{data.average}/5</b> <span className="muted">· {data.reviews.length} review{data.reviews.length === 1 ? '' : 's'}</span></>
              : <span className="muted">No ratings yet</span>}
          </div>
          <div className="tags">
            <span className="tag-pill">{m.Language}</span>
            {(m.Genres || '').split(', ').filter(Boolean).map((g) => <span key={g} className="tag-pill ghost">{g}</span>)}
          </div>
          <p className="muted">
            {duration(m.Duration_Min)} · {m.Release_Date ? `Released ${longDate(m.Release_Date)}` : 'Release date to be announced'}
          </p>
          {mine.length > 0
            ? <a className="btn big" href="#showtimes">Book tickets</a>
            : <p className="muted">No shows scheduled right now.</p>}
        </div>
      </section>

      {mine.length > 0 && (
        <section id="showtimes" className="card section">
          <div className="section-head">
            <h2>Showtimes</h2>
            <AvailabilityLegend />
          </div>
          <DateStrip days={days} value={day} onChange={setDay} />
          {byTheatre.map(([tid, list]) => (
            <div className="venue-row" key={tid}>
              <div className="venue">
                <b>{list[0].Theatre}</b>
                <span className="muted small">{tName(tid)?.Address || list[0].City}</span>
              </div>
              <ShowtimeChips shows={list} onPick={onBook} />
            </div>
          ))}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Reviews</h2>
          {data.average && <span className="muted">★ {data.average}/5 from {data.reviews.length} viewer{data.reviews.length === 1 ? '' : 's'}</span>}
        </div>
        {data.canReview
          ? <ReviewForm key={data.myReview?.updated_at || 'new'} movieId={m.Movie_ID} existing={data.myReview} flash={flash} onSaved={load} />
          : <p className="muted small hint">Watched {m.Title}? You can rate it here after your show.</p>}
        <div className="review-grid">
          {data.reviews.length === 0 && <p className="muted">Be the first to review this movie.</p>}
          {data.reviews.map((r) => (
            <div className="card review" key={r.user_id}>
              <div className="show-top">
                <span className="reviewer"><span className="avatar">{(r.user_name || '?')[0]}</span>
                  <b>{r.user_name}{data.myReview && r.user_id === data.myReview.user_id ? ' (you)' : ''}</b></span>
                <span className="rating">★ {r.rating}/5</span>
              </div>
              <p>{r.comment}</p>
              <p className="muted small">{ago(r.updated_at)}</p>
            </div>
          ))}
        </div>
      </section>

      {similar.length > 0 && (
        <section className="section">
          <h2>You might also like</h2>
          <div className="mini-grid">
            {similar.map((s) => (
              <button type="button" key={s.Movie_ID} className="mini-card" onClick={() => onOpenMovie(s.Movie_ID)}>
                <Poster src={s.Poster_URL} title={s.Title} className="poster-fill" />
                <b>{s.Title}</b>
                <span className="muted small">{s.Language}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
