'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import Flash from '@/components/Flash';
import Poster from '@/components/Poster';
import SeatMap from '@/components/SeatMap';
import Filters from '@/components/customer/Filters';
import MovieDetail from '@/components/customer/MovieDetail';
import { CinemaList, CinemaDetail } from '@/components/customer/Cinemas';
import MyBookings from '@/components/customer/MyBookings';
import Profile from '@/components/customer/Profile';
import { api, inr } from '@/lib/client';

const TABS = ['Movies', 'Cinemas', 'My Bookings', 'Profile'];
const NO_FILTERS = { languages: [], genres: [], theatres: [] };

export default function CustomerPage() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState(TABS[0]);
  const [view, setView] = useState(null);         // { kind: 'movie' | 'cinema', id }
  const [msg, setMsg] = useState(null);
  const [shows, setShows] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [active, setActive] = useState(null);      // show being booked (seat map)
  const flash = useCallback((text, type = 'ok') => { setMsg({ text, type }); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

  const loadShows = useCallback(() => api('/api/shows').then(setShows).catch((e) => flash(e.message, 'error')), [flash]);
  useEffect(() => {
    api('/api/auth/me').then((r) => setUser(r.user));
    api('/api/theatres').then(setTheatres).catch(() => {});
    loadShows();
  }, [loadShows]);

  const go = (t) => { setTab(t); setView(null); setMsg(null); };
  const openMovie = (id) => { setTab('Movies'); setView({ kind: 'movie', id }); };
  const openCinema = (id) => { setTab('Cinemas'); setView({ kind: 'cinema', id }); };

  async function book(seats, method) {
    try {
      const b = await api('/api/bookings', { method: 'POST', body: { showId: active.Show_ID, seats, method } });
      setActive(null);
      loadShows();
      go('My Bookings');
      flash(`Booking #${b.Booking_ID} confirmed – ${seats.join(', ')} – paid ${inr(b.Total_Amount)}`);
    } catch (e) {
      flash(e.message, 'error');
    }
  }

  let body;
  if (tab === 'Movies' && view?.kind === 'movie')
    body = <MovieDetail movieId={view.id} shows={shows} theatres={theatres} flash={flash}
      onBook={setActive} onBack={() => setView(null)} onOpenMovie={openMovie} />;
  else if (tab === 'Movies')
    body = <NowShowing shows={shows} theatres={theatres} onOpenMovie={openMovie} onBrowseCinemas={() => go('Cinemas')} />;
  else if (tab === 'Cinemas' && view?.kind === 'cinema') {
    const t = theatres.find((x) => x.Theatre_ID === view.id);
    body = t && <CinemaDetail theatre={t} shows={shows} onBook={setActive} onBack={() => setView(null)} onOpenMovie={openMovie} />;
  } else if (tab === 'Cinemas')
    body = <CinemaList theatres={theatres} onOpen={openCinema} />;
  else if (tab === 'My Bookings')
    body = <MyBookings flash={flash} onOpenMovie={openMovie} />;
  else
    body = <Profile flash={flash} onOpenMovie={openMovie} />;

  return (
    <Shell user={user} roleLabel="CUSTOMER" tabs={TABS} tab={tab} setTab={go}>
      <Flash msg={msg} onClose={() => setMsg(null)} />
      {body}
      {active && <SeatMap show={active} onBook={book} onClose={() => { setActive(null); loadShows(); }} />}
    </Shell>
  );
}

// ---------------------------------------------------------------- movie grid + filters
function NowShowing({ shows, theatres, onOpenMovie, onBrowseCinemas }) {
  const [filters, setFilters] = useState(NO_FILTERS);
  const [movieId, setMovieId] = useState('');

  // one entry per movie that has upcoming shows
  const movies = useMemo(() => {
    const m = new Map();
    shows.forEach((s) => {
      if (!m.has(s.Movie_ID)) m.set(s.Movie_ID, { ...s, genreList: (s.Genres || '').split(', ').filter(Boolean), theatreIds: new Set(), count: 0 });
      const x = m.get(s.Movie_ID);
      x.theatreIds.add(s.Theatre_ID);
      x.count += 1;
    });
    return [...m.values()].sort((a, b) => (b.Rating || 0) - (a.Rating || 0) || a.Title.localeCompare(b.Title));
  }, [shows]);

  const languages = useMemo(() => [...new Set(movies.map((m) => m.Language))].sort(), [movies]);
  const genres = useMemo(() => [...new Set(movies.flatMap((m) => m.genreList))].sort(), [movies]);

  const visible = movies.filter((m) =>
    (!movieId || String(m.Movie_ID) === movieId)
    && (!filters.languages.length || filters.languages.includes(m.Language))
    && (!filters.genres.length || m.genreList.some((g) => filters.genres.includes(g)))
    && (!filters.theatres.length || filters.theatres.some((t) => m.theatreIds.has(t))));

  const anyFilter = movieId || filters.languages.length || filters.genres.length || filters.theatres.length;

  return (
    <div className="browse">
      <Filters languages={languages} genres={genres} theatres={theatres}
        value={filters} onChange={setFilters} onBrowseCinemas={onBrowseCinemas} />
      <section>
        <div className="section-head">
          <h2>Movies in Bengaluru</h2>
          <select value={movieId} onChange={(e) => setMovieId(e.target.value)} aria-label="Movie">
            <option value="">All movies</option>
            {movies.map((m) => <option key={m.Movie_ID} value={m.Movie_ID}>{m.Title}</option>)}
          </select>
        </div>
        <div className="lang-bar">
          {languages.map((l) => (
            <button key={l} type="button" className={'chip' + (filters.languages.includes(l) ? ' on' : '')}
              onClick={() => setFilters({ ...filters, languages: filters.languages.includes(l)
                ? filters.languages.filter((x) => x !== l) : [...filters.languages, l] })}>{l}</button>
          ))}
          {anyFilter ? <button type="button" className="link small" onClick={() => { setFilters(NO_FILTERS); setMovieId(''); }}>Clear all</button> : null}
        </div>
        {!visible.length && <p className="muted">No movies match these filters.</p>}
        <div className="movie-grid">
          {visible.map((m) => (
            <button type="button" key={m.Movie_ID} className="movie-card" onClick={() => onOpenMovie(m.Movie_ID)}>
              <div className="poster-wrap">
                <Poster src={m.Poster_URL} title={m.Title} className="poster-fill" />
                <span className="poster-rating">{m.Rating ? <>★ {m.Rating}/5</> : 'New'}</span>
              </div>
              <b>{m.Title}</b>
              <span className="muted small">{m.Language} · {m.genreList.join('/')}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
