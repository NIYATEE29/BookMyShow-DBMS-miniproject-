'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, inr, when } from '@/lib/client';

const REFRESH_MS = 4000;

// seat picker for one show; calls onBook(seats, method).
// Every seat you pick is HELD for you in Redis for 5 minutes, so other
// customers see it as "On hold" and cannot pick it while you pay.
export default function SeatMap({ show, onBook, onClose }) {
  const [seats, setSeats] = useState([]);
  const [picked, setPicked] = useState([]);
  const [method, setMethod] = useState('UPI');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState(null);
  const [left, setLeft] = useState(null);
  const pickedRef = useRef([]);
  pickedRef.current = picked;
  const heldAt = useRef({});        // seat -> time my hold was confirmed
  const holdsOn = useRef(true);     // false if Redis is unavailable

  const load = useCallback(() => {
    const started = Date.now();
    return api(`/api/shows/${show.Show_ID}/seats`).then((rows) => {
      setSeats(rows);
      // if one of my seats got sold or my hold expired, drop it from my selection
      const sold = new Set(rows.filter((r) => r.Booked).map((r) => r.Row_No + r.Seat_No));
      const mine = new Set(rows.filter((r) => r.Held === 'ME').map((r) => r.Row_No + r.Seat_No));
      setPicked((p) => p.filter((x) => !sold.has(x)
        && (!holdsOn.current || mine.has(x) || (heldAt.current[x] || 0) >= started)));
    }).catch((e) => setErr(e.message));
  }, [show.Show_ID]);

  // live refresh so holds/sales by other customers appear while you choose
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // release my holds if the seat map is closed / unmounted without booking
  useEffect(() => () => {
    if (pickedRef.current.length)
      fetch(`/api/shows/${show.Show_ID}/hold`, {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release', seats: pickedRef.current }),
      }).catch(() => {});
  }, [show.Show_ID]);

  // countdown for the hold
  useEffect(() => {
    if (!deadline) { setLeft(null); return; }
    const tick = () => {
      const s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        setPicked([]); setDeadline(null);
        setErr('Your seat hold expired. Please pick your seats again.');
        load();
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline, load]);

  useEffect(() => { if (!picked.length) setDeadline(null); }, [picked.length]);

  const rows = [...new Set(seats.map((s) => s.Row_No))];
  const id = (s) => s.Row_No + s.Seat_No;

  async function toggle(s) {
    if (s.Booked || s.Held === 'OTHER' || busy) return;
    const seat = id(s);
    setErr('');
    if (picked.includes(seat)) {
      setPicked((p) => p.filter((x) => x !== seat));
      api(`/api/shows/${show.Show_ID}/hold`, { method: 'POST', body: { action: 'release', seats: [seat] } }).catch(() => {});
      return;
    }
    if (picked.length >= 10) { setErr('You can book up to 10 seats at a time.'); return; }
    setBusy(true);
    try {
      const r = await api(`/api/shows/${show.Show_ID}/hold`, { method: 'POST', body: { action: 'hold', seat } });
      heldAt.current[seat] = Date.now();
      holdsOn.current = r.seconds != null;
      setPicked((p) => [...p, seat]);
      if (r.seconds && !deadline) setDeadline(Date.now() + r.seconds * 1000);
    } catch (e) {
      setErr(e.message);
      load();
    }
    setBusy(false);
  }

  async function pay() {
    setBusy(true);
    await onBook(picked, method);
    setBusy(false);
  }

  const total = seats.filter((s) => picked.includes(id(s))).reduce((a, s) => a + Number(s.Price), 0);
  const cls = (s) => 'seat ' + (s.Booked ? 'booked' : picked.includes(id(s)) ? 'picked'
    : s.Held === 'OTHER' ? 'held' : s.Seat_Type === 'PREMIUM' ? 'premium' : '');
  const mmss = left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : null;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{show.Title}</h2>
            <p className="muted">{show.Theatre} · Screen {show.Screen_No} · {when(show.Show_Time)}</p>
          </div>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="screen-bar">SCREEN THIS WAY</div>
        <div className="seat-grid">
          {rows.map((r) => (
            <div className="seat-row" key={r}>
              <span className="row-label">{r}</span>
              {seats.filter((s) => s.Row_No === r).map((s) => (
                <button key={id(s)} className={cls(s)} onClick={() => toggle(s)}
                  disabled={s.Booked || s.Held === 'OTHER'}
                  title={s.Booked ? `${id(s)} · sold` : s.Held === 'OTHER' ? `${id(s)} · on hold for another customer`
                    : `${id(s)} · ${s.Seat_Type} · ${inr(s.Price)}`}>
                  {s.Seat_No}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="legend">
          <span><i className="seat" /> Regular</span>
          <span><i className="seat premium" /> Premium (1.5×)</span>
          <span><i className="seat picked" /> Selected</span>
          <span><i className="seat held" /> On hold</span>
          <span><i className="seat booked" /> Sold</span>
        </div>
        {mmss && <p className="hold-timer">Seats held for you · <b>{mmss}</b></p>}
        {err && <div className="error">{err}</div>}
        <div className="book-bar">
          <div>
            <b>{picked.length ? picked.join(', ') : 'No seats selected'}</b>
            <div className="muted">Total {inr(total)}</div>
          </div>
          <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
            <option>UPI</option><option>CARD</option><option>CASH</option>
          </select>
          <button className="btn" disabled={!picked.length || busy} onClick={pay}>Pay &amp; Book</button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
