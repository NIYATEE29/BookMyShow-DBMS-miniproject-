'use client';
import { useEffect, useMemo, useState } from 'react';
import DateStrip from './DateStrip';
import { ShowtimeChips, AvailabilityLegend } from './Showtimes';
import { dayKey, dayPart, duration } from '@/lib/client';

// "Browse by Cinemas": searchable list of theatres
export function CinemaList({ theatres, onOpen }) {
  const [term, setTerm] = useState('');
  const list = theatres.filter((t) =>
    `${t.Name} ${t.Address || ''} ${t.City}`.toLowerCase().includes(term.trim().toLowerCase()));
  return (
    <>
      <div className="section-head">
        <h2>Cinemas in Bengaluru</h2>
        <input className="search" type="search" placeholder="🔍  Search by cinema or area"
          value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      <div className="cinema-grid">
        {list.map((t) => (
          <button type="button" key={t.Theatre_ID} className="card cinema-card" onClick={() => onOpen(t.Theatre_ID)}>
            <b>{t.Name}</b>
            <span className="muted">{t.Address || t.City}</span>
            <span className="small accent">{t.Movies} movies · {t.Upcoming_Shows} upcoming shows</span>
          </button>
        ))}
        {!list.length && <p className="muted">No cinema matches “{term}”.</p>}
      </div>
    </>
  );
}

const PRICE = { '': 'Any price', low: 'Up to ₹200', mid: '₹201 – ₹300', high: 'Above ₹300' };
const inPrice = (p, r) => !r || (r === 'low' ? p <= 200 : r === 'mid' ? p > 200 && p <= 300 : p > 300);

// one cinema: date strip + price / show-timing filters + every movie's showtimes
export function CinemaDetail({ theatre, shows, onBook, onBack, onOpenMovie }) {
  const mine = useMemo(() => shows.filter((s) => s.Theatre_ID === theatre.Theatre_ID), [shows, theatre]);
  const days = useMemo(() => [...new Set(mine.map((s) => dayKey(s.Show_Time)))].sort(), [mine]);
  const [day, setDay] = useState(null);
  const [price, setPrice] = useState('');
  const [part, setPart] = useState('');
  useEffect(() => { if (!day || !days.includes(day)) setDay(days[0] || null); }, [days, day]);

  const movies = useMemo(() => {
    const m = new Map();
    mine.filter((s) => dayKey(s.Show_Time) === day && inPrice(Number(s.Base_Price), price) && (!part || dayPart(s.Show_Time) === part))
      .forEach((s) => { if (!m.has(s.Movie_ID)) m.set(s.Movie_ID, []); m.get(s.Movie_ID).push(s); });
    return [...m.values()];
  }, [mine, day, price, part]);

  return (
    <div>
      <button className="link back" onClick={onBack}>← All cinemas</button>
      <div className="card cinema-head">
        <h1>{theatre.Name}</h1>
        <p className="muted">📍 {theatre.Address || theatre.City}</p>
      </div>
      <div className="card toolbar">
        <DateStrip days={days} value={day} onChange={setDay} />
        <div className="toolbar-right">
          <select value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price range">
            {Object.entries(PRICE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={part} onChange={(e) => setPart(e.target.value)} aria-label="Show timings">
            <option value="">All show timings</option>
            {['Morning', 'Afternoon', 'Evening', 'Night'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="list-head">
        <span className="muted small">Cancellation available until the show starts</span>
        <AvailabilityLegend />
      </div>
      <div className="card">
        {!movies.length && <p className="muted">No shows match these filters.</p>}
        {movies.map((list) => (
          <div className="venue-row" key={list[0].Movie_ID}>
            <div className="venue">
              <button type="button" className="link strong" onClick={() => onOpenMovie(list[0].Movie_ID)}>{list[0].Title}</button>
              <span className="small"><span className="accent">{list[0].Language}</span>
                <span className="muted"> · {duration(list[0].Duration_Min)}</span></span>
            </div>
            <ShowtimeChips shows={list} onPick={onBook} />
          </div>
        ))}
      </div>
    </div>
  );
}
