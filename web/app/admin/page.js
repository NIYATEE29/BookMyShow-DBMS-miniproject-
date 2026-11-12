'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import Flash from '@/components/Flash';
import Table from '@/components/Table';
import Poster from '@/components/Poster';
import { api, dayKey, inr, when } from '@/lib/client';

// platform admin (CineBook head office) vs theatre admin (one cinema partner)
const TABS = {
  ADMIN: ['Dashboard', 'Movies', 'Shows', 'Bookings', 'Customers', 'Reviews'],
  THEATRE_ADMIN: ['Dashboard', 'Shows', 'Bookings'],
};

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('Dashboard');
  const [msg, setMsg] = useState(null);
  const flash = (text, type = 'ok') => setMsg({ text, type });
  useEffect(() => { api('/api/auth/me').then((r) => setUser(r.user)); }, []);
  if (!user) return null;

  const platform = user.role === 'ADMIN';
  const tabs = TABS[user.role] || TABS.THEATRE_ADMIN;
  const go = (t) => { setTab(t); setMsg(null); };
  return (
    <Shell user={user} roleLabel={platform ? 'ADMIN' : 'THEATRE ADMIN'} subtitle={platform ? 'All theatres' : user.theatreName}
      tabs={tabs} tab={tab} setTab={go}>
      <Flash msg={msg} onClose={() => setMsg(null)} />
      {tab === 'Dashboard' && <Dashboard flash={flash} />}
      {tab === 'Movies' && platform && <Movies flash={flash} />}
      {tab === 'Shows' && <Shows flash={flash} platform={platform} />}
      {tab === 'Bookings' && <Bookings flash={flash} platform={platform} />}
      {tab === 'Customers' && platform && <Customers flash={flash} />}
      {tab === 'Reviews' && platform && <ReviewMod flash={flash} />}
    </Shell>
  );
}

// ------------------------------------------------------------- dashboard
function Dashboard({ flash }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/api/admin/reports').then(setD).catch((e) => flash(e.message, 'error')); }, []); // eslint-disable-line
  if (!d) return <p className="muted">Loading…</p>;
  const t = d.totals;
  const platform = d.scope === 'PLATFORM';
  const n = (x) => Number(x || 0).toLocaleString('en-IN');
  return (
    <>
      <div className="section-head">
        <h2>{platform ? 'Overview – all theatres' : `Overview – ${d.theatreName || 'your theatre'}`}</h2>
      </div>
      <div className="stats">
        <div className="card stat"><span>{platform ? 'Total Revenue' : 'Theatre Revenue'}</span><b>{inr(t.Revenue)}</b></div>
        <div className="card stat"><span>Bookings</span><b>{n(t.Bookings)}</b></div>
        <div className="card stat"><span>Tickets Sold</span><b>{n(t.Tickets)}</b></div>
        <div className="card stat"><span>Refunds</span><b>{inr(t.Refunds)}</b></div>
        {platform
          ? <div className="card stat"><span>Registered Customers</span><b>{n(t.Customers)}</b></div>
          : <div className="card stat"><span>Customers Served</span><b>{n(t.Buyers)}</b></div>}
        <div className="card stat"><span>Upcoming Shows</span><b>{n(t.Upcoming_Shows)}</b></div>
      </div>
      <div className="two-col">
        <div className="card">
          <h3>{platform ? 'Revenue by Theatre' : 'Revenue by Movie'}</h3>
          <Table rows={d.revenue} cols={[
            { key: 'Name', label: platform ? 'Theatre' : 'Movie' }, { key: 'Bookings', label: 'Bookings' },
            { label: 'Revenue', render: (r) => inr(r.Revenue) }, { label: 'Avg. Booking Value', render: (r) => inr(r.Avg_Booking) }]} />
        </div>
        <div className="card">
          <h3>{platform ? 'Top-Selling Movie per Theatre' : 'Top-Selling Movies'}</h3>
          <Table rows={d.bestSellers} empty="No tickets sold yet" cols={platform
            ? [{ key: 'Theatre', label: 'Theatre' }, { key: 'Title', label: 'Movie' }, { key: 'Tickets', label: 'Tickets Sold' }]
            : [{ key: 'Rank', label: 'Rank' }, { key: 'Title', label: 'Movie' }, { key: 'Tickets', label: 'Tickets Sold' }]} />
        </div>
        {platform && (
          <div className="card">
            <h3>Top-Spending Customers</h3>
            <Table rows={d.topCustomers} cols={[
              { label: 'Customer', render: (r) => `${r.First_Name} ${r.Last_Name || ''}` },
              { label: 'Total Spent', render: (r) => inr(r.Spent) }]} />
          </div>
        )}
        <div className="card">
          <h3>Payment Summary</h3>
          <Table rows={d.payments} empty="No payments yet" cols={[
            { key: 'Method', label: 'Payment Method' }, { key: 'Payments', label: 'Transactions' },
            { label: 'Collected', render: (r) => inr(r.Collected) }, { label: 'Refunded', render: (r) => inr(r.Refunded) }]} />
        </div>
        <div className="card">
          <h3>Top-Rated Movies</h3>
          <Table rows={d.topRated} empty="No ratings yet" cols={[{ key: 'Title', label: 'Movie' }, { label: 'Average Rating', render: (r) => '★ ' + r.Rating }]} />
        </div>
        <div className="card">
          <h3>Busiest Shows</h3>
          <Table rows={d.occupancy} cols={[
            { key: 'Title', label: 'Movie' }, ...(platform ? [{ key: 'Theatre', label: 'Theatre' }] : []),
            { label: 'Show', render: (r) => when(r.Show_Time) },
            { label: 'Seats Sold', render: (r) => `${r.Sold}/${r.Capacity}` },
            { label: 'Occupancy', render: (r) => (
              <div className="bar"><i style={{ width: `${(100 * r.Sold) / r.Capacity}%` }} /></div>) }]} />
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------- movies (CRUD)
const EMPTY_MOVIE = { title: '', language: 'English', durationMin: 120, releaseDate: '', genres: '' };
const POSTER_TYPES = 'image/jpeg,image/png,image/webp';

async function uploadPoster(movieId, file) {
  const fd = new FormData();
  fd.append('poster', file);
  const res = await fetch(`/api/admin/movies/${movieId}/poster`, { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Poster upload failed');
  return data;
}

function Movies({ flash }) {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(EMPTY_MOVIE);
  const [editing, setEditing] = useState(null);
  const [current, setCurrent] = useState(null);   // poster already saved for the movie being edited
  const [file, setFile] = useState(null);         // newly chosen file (not uploaded yet)
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const load = () => api('/api/movies').then(setRows);
  useEffect(() => { load(); }, []);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function pick(e) {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    if (!POSTER_TYPES.split(',').includes(chosen.type)) { flash('Poster must be a JPG, PNG or WebP image.', 'error'); e.target.value = ''; return; }
    if (chosen.size > 3 * 1024 * 1024) { flash('Poster must be 3 MB or smaller.', 'error'); e.target.value = ''; return; }
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }
  function clearFile() {
    setFile(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }
  function reset() {
    setF(EMPTY_MOVIE); setEditing(null); setCurrent(null); clearFile();
  }

  async function save(e) {
    e.preventDefault();
    const body = { ...f, genres: f.genres.split(',') };
    setSaving(true);
    let id = editing;
    try {
      if (editing) await api(`/api/admin/movies/${editing}`, { method: 'PUT', body });
      else id = (await api('/api/admin/movies', { method: 'POST', body })).Movie_ID;
    } catch (e) { setSaving(false); flash(e.message, 'error'); return; }
    try {
      if (file) await uploadPoster(id, file);
      flash(editing ? 'Movie updated' : 'Movie added');
      reset();
    } catch (e) {
      flash(`${editing ? 'Movie updated' : 'Movie added'}, but the poster could not be uploaded: ${e.message}`, 'error');
    }
    setSaving(false);
    load();
  }
  async function removeCurrent() {
    if (!editing || !confirm('Remove this poster?')) return;
    try {
      await api(`/api/admin/movies/${editing}/poster`, { method: 'DELETE' });
      setCurrent(null); flash('Poster removed'); load();
    } catch (e) { flash(e.message, 'error'); }
  }
  function edit(m) {
    clearFile();
    setEditing(m.Movie_ID);
    setCurrent(m.Poster_URL || null);
    setF({ title: m.Title, language: m.Language, durationMin: m.Duration_Min,
      releaseDate: m.Release_Date || '', genres: m.Genres || '' });
  }
  async function del(m) {
    if (!confirm(`Delete "${m.Title}"?`)) return;
    try { await api(`/api/admin/movies/${m.Movie_ID}`, { method: 'DELETE' }); flash('Movie deleted'); if (editing === m.Movie_ID) reset(); load(); }
    catch (e) { flash(e.message, 'error'); }
  }

  const shown = preview || current;
  return (
    <div className="two-col wide-right">
      <form className="card" onSubmit={save}>
        <h3>{editing ? `Edit movie #${editing}` : 'Add movie'}</h3>
        <label>Title<input value={f.title} onChange={set('title')} required /></label>
        <div className="row2">
          <label>Language<input value={f.language} onChange={set('language')} required /></label>
          <label>Duration (min)<input type="number" min={30} max={300} value={f.durationMin} onChange={set('durationMin')} required /></label>
        </div>
        <label>Release date<input type="date" value={f.releaseDate} onChange={set('releaseDate')} /></label>
        <label>Genres (comma separated)<input value={f.genres} onChange={set('genres')} placeholder="Action, Drama" /></label>
        <div className="field">
          <span className="field-label">Poster</span>
          <div className="poster-picker">
            <Poster src={shown} title={f.title || 'New movie'} className="poster-md" />
            <div className="poster-picker-side">
              <input ref={fileRef} id="poster-file" type="file" accept={POSTER_TYPES} onChange={pick} hidden />
              <label htmlFor="poster-file" className="btn ghost small file-btn">{shown ? 'Change image' : 'Upload image'}</label>
              {file && <button type="button" className="btn ghost small" onClick={clearFile}>Undo</button>}
              {!file && current && <button type="button" className="btn danger small" onClick={removeCurrent}>Remove</button>}
              <span className="muted small">{file ? file.name : 'JPG, PNG or WebP · up to 3 MB · portrait (2:3) looks best'}</span>
            </div>
          </div>
        </div>
        <div className="actions">
          <button className="btn" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add movie'}</button>
          {editing && <button type="button" className="btn ghost" onClick={reset}>Cancel</button>}
        </div>
      </form>
      <Table rows={rows} cols={[
        { label: '', render: (r) => <Poster src={r.Poster_URL} title={r.Title} className="poster-xs" /> },
        { key: 'Movie_ID', label: '#' }, { key: 'Title', label: 'Title' }, { key: 'Language', label: 'Lang' },
        { key: 'Duration_Min', label: 'Min' }, { key: 'Genres', label: 'Genres' }, { key: 'Show_Count', label: 'Shows' },
        { label: 'Rating', render: (r) => (r.Rating ? '★ ' + r.Rating : '—') },
        { label: 'Actions', render: (r) => (
          <span className="actions">
            <button className="btn ghost small" onClick={() => edit(r)}>Edit</button>
            <button className="btn danger small" onClick={() => del(r)}>Delete</button>
          </span>) }]} />
    </div>
  );
}

// ------------------------------------------------------------- shows
function Shows({ flash, platform }) {
  const [rows, setRows] = useState([]);
  const [movies, setMovies] = useState([]);
  const [screens, setScreens] = useState([]);
  const [f, setF] = useState({ movieId: '', screenId: '', showTime: '', price: 200 });
  const [when_, setWhen] = useState('upcoming');
  const [theatre, setTheatre] = useState('');
  const [day, setDay] = useState('');
  const load = () => api('/api/admin/shows').then(setRows).catch((e) => flash(e.message, 'error'));
  useEffect(() => {
    load();
    api('/api/movies').then(setMovies);
    api('/api/admin/screens').then(setScreens);
  }, []); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function add(e) {
    e.preventDefault();
    try {
      const r = await api('/api/admin/shows', { method: 'POST', body: { ...f, movieId: Number(f.movieId), screenId: Number(f.screenId) } });
      flash(`Show #${r.Show_ID} scheduled`); load();
    } catch (e) { flash(e.message, 'error'); }
  }
  async function del(r) {
    if (!confirm(`Delete show #${r.Show_ID} (${r.Title}, ${when(r.Show_Time)})?`)) return;
    try { await api(`/api/admin/shows/${r.Show_ID}`, { method: 'DELETE' }); flash('Show deleted'); load(); }
    catch (e) { flash(e.message, 'error'); }
  }

  const theatres = [...new Map(screens.map((s) => [s.Theatre_ID, s.Theatre])).entries()];
  const days = useMemo(() => [...new Set(rows.filter((r) => !r.Is_Past).map((r) => dayKey(r.Show_Time)))].sort(), [rows]);
  const visible = rows
    .filter((r) => when_ === 'all' || (when_ === 'past' ? r.Is_Past : !r.Is_Past))
    .filter((r) => !theatre || String(r.Theatre_ID) === theatre)
    .filter((r) => !day || dayKey(r.Show_Time) === day);
  if (when_ === 'past') visible.reverse();
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <div className="two-col wide-right">
      <form className="card" onSubmit={add}>
        <h3>Schedule a Show</h3>
        <p className="muted small">
          {platform ? 'You can schedule shows on any theatre’s screens.'
            : `${screens[0]?.Theatre || 'Your theatre'} – shows can be scheduled on your theatre’s screens.`}
          {' '}A screen needs the movie’s running time + 20 minutes of cleaning before the next show.
        </p>
        <label>Movie
          <select value={f.movieId} onChange={set('movieId')} required>
            <option value="">Select…</option>
            {movies.map((m) => <option key={m.Movie_ID} value={m.Movie_ID}>{m.Title} ({m.Duration_Min} min)</option>)}
          </select>
        </label>
        <label>Screen
          <select value={f.screenId} onChange={set('screenId')} required>
            <option value="">Select…</option>
            {screens.map((s) => <option key={s.Screen_ID} value={s.Screen_ID}>{platform ? `${s.Theatre} · ` : ''}Screen {s.Screen_No}</option>)}
          </select>
        </label>
        <div className="row2">
          <label>Date &amp; time<input type="datetime-local" min={nowLocal} value={f.showTime} onChange={set('showTime')} required /></label>
          <label>Base price ₹<input type="number" min={1} value={f.price} onChange={set('price')} required /></label>
        </div>
        <button className="btn">Add show</button>
      </form>
      <div>
        <div className="section-head">
          <div className="seg">
            {[['upcoming', 'Upcoming'], ['past', 'Completed'], ['all', 'All']].map(([k, l]) => (
              <button key={k} type="button" className={when_ === k ? 'on' : ''} onClick={() => { setWhen(k); if (k !== 'upcoming') setDay(''); }}>{l}</button>
            ))}
          </div>
          {when_ === 'upcoming' && (
            <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day">
              <option value="">All days</option>
              {days.map((d) => <option key={d} value={d}>{new Date(d + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}
            </select>
          )}
          {platform && (
            <select value={theatre} onChange={(e) => setTheatre(e.target.value)} aria-label="Theatre">
              <option value="">All theatres</option>
              {theatres.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          <span className="muted small">{visible.length} show{visible.length === 1 ? '' : 's'}</span>
        </div>
        <Table rows={visible} empty="No shows here" cols={[
          { key: 'Show_ID', label: '#' }, { key: 'Title', label: 'Movie' },
          platform ? { label: 'Theatre', render: (r) => `${r.Theatre} · S${r.Screen_No}` } : { label: 'Screen', render: (r) => `Screen ${r.Screen_No}` },
          { label: 'Time', render: (r) => when(r.Show_Time) }, { label: 'Price', render: (r) => inr(r.Base_Price) },
          { key: 'Seats_Left', label: 'Seats Left' },
          { label: 'Actions', render: (r) => {
              if (r.Is_Past) return <span className="pill past">COMPLETED</span>;
              const mine = screens.some((x) => x.Screen_ID === r.Screen_ID);
              if (!mine) return <span className="muted small">Other theatre</span>;
              if (r.Bookings > 0) return <span className="muted small" title="Shows with bookings cannot be deleted">{r.Bookings} booking{r.Bookings > 1 ? 's' : ''}</span>;
              return <button className="btn danger small" onClick={() => del(r)}>Delete</button>;
            } }]} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------- bookings
function Bookings({ flash, platform }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const load = () => api('/api/admin/bookings').then(setRows).catch((e) => flash(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line
  async function cancel(r) {
    if (!confirm(`Cancel booking #${r.Booking_ID} and refund ${inr(r.Total_Amount)} to ${r.Customer.trim()}?`)) return;
    try { await api(`/api/bookings/${r.Booking_ID}/cancel`, { method: 'POST' }); flash(`Booking #${r.Booking_ID} cancelled & refunded`); load(); }
    catch (e) { flash(e.message, 'error'); }
  }
  const visible = rows.filter((r) => !status || r.Status === status);
  return (
    <>
      <div className="section-head">
        <h2>{platform ? 'All Bookings' : 'Bookings at your theatre'}</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option><option value="CONFIRMED">Confirmed</option><option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <Table rows={visible} cols={[
        { key: 'Booking_ID', label: '#' }, { key: 'Customer', label: 'Customer' }, { key: 'Title', label: 'Movie' },
        ...(platform ? [{ label: 'Theatre', render: (r) => `${r.Theatre} · S${r.Screen_No}` }] : [{ label: 'Screen', render: (r) => `Screen ${r.Screen_No}` }]),
        { label: 'Show', render: (r) => when(r.Show_Time) },
        { key: 'Seats', label: 'Seats' }, { label: 'Amount', render: (r) => inr(r.Total_Amount) },
        { label: 'Payment', render: (r) => `${r.Method} · ${r.Payment_Status}` },
        { label: 'Status', render: (r) => <span className={'pill ' + (r.Status === 'CONFIRMED' && r.Is_Past ? 'past' : r.Status.toLowerCase())}>
            {r.Status === 'CONFIRMED' && r.Is_Past ? 'COMPLETED' : r.Status}</span> },
        ...(platform ? [{ label: 'Actions', render: (r) => r.Status === 'CONFIRMED' && !r.Is_Past &&
            <button className="btn danger small" onClick={() => cancel(r)}>Cancel &amp; refund</button> }] : [])]} />
    </>
  );
}

// ------------------------------------------------------------- customers (index + recursive CTE)
function Customers({ flash }) {
  const [last, setLast] = useState('');
  const [res, setRes] = useState(null);
  const [tree, setTree] = useState(null);
  async function search(e) {
    e?.preventDefault();
    try { setRes(await api(`/api/admin/users?lastName=${encodeURIComponent(last)}`)); }
    catch (e) { flash(e.message, 'error'); }
  }
  useEffect(() => { search(); }, []); // eslint-disable-line
  async function referrals(id) {
    try { setTree(await api(`/api/admin/users/${id}/referrals`)); } catch (e) { flash(e.message, 'error'); }
  }
  return (
    <>
      <form className="section-head" onSubmit={search}>
        <h2>Customers</h2>
        <input placeholder="Search by last name" value={last} onChange={(e) => setLast(e.target.value)} />
        <button className="btn">Search</button>
      </form>
      {res && (
        <p className="muted">
          {Number(res.total).toLocaleString('en-IN')} customer(s) found{res.total > 50 ? ' · showing first 50' : ''}.
        </p>
      )}
      <div className="two-col wide-left">
        <Table rows={res?.rows} cols={[
          { key: 'User_ID', label: '#' }, { label: 'Name', render: (r) => `${r.First_Name} ${r.Last_Name || ''}` },
          { key: 'Email', label: 'Email' }, { key: 'Role', label: 'Role' }, { key: 'Bookings', label: 'Bookings' },
          { label: '', render: (r) => <button className="btn ghost small" onClick={() => referrals(r.User_ID)}>Referrals</button> }]} />
        <div className="card">
          <h3>Referral Network</h3>
          {!tree && <p className="muted small">Select “Referrals” on a customer to view everyone they have referred.</p>}
          {tree && tree.map((n) => (
            <div key={n.User_ID} style={{ paddingLeft: n.Level * 18 }} className="tree-node">
              {n.Level ? '↳ ' : ''}{n.First_Name} <span className="muted small">(level {n.Level})</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------- reviews moderation (Redis)
function ReviewMod({ flash }) {
  const [rows, setRows] = useState([]);
  const load = () => api('/api/admin/reviews').then(setRows);
  useEffect(() => { load(); }, []);
  async function del(r) {
    if (!confirm('Delete this review?')) return;
    try { await api(`/api/admin/reviews?movieId=${r.movie_id}&userId=${r.user_id}`, { method: 'DELETE' }); flash('Review removed'); load(); }
    catch (e) { flash(e.message, 'error'); }
  }
  return (
    <>
      <h2>Review Moderation</h2>
      <Table rows={rows} empty="No reviews" cols={[
        { key: 'title', label: 'Movie' }, { key: 'user_name', label: 'User' },
        { label: 'Rating', render: (r) => '★'.repeat(r.rating) }, { key: 'comment', label: 'Comment' },
        { key: 'updated_at', label: 'Updated' },
        { label: '', render: (r) => <button className="btn danger small" onClick={() => del(r)}>Delete</button> }]} />
    </>
  );
}
