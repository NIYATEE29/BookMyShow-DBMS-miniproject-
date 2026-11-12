'use client';
import { availability, inr, timeOnly } from '@/lib/client';

// time "chips" for a list of shows; colour = availability
export function ShowtimeChips({ shows, onPick }) {
  return (
    <div className="time-chips">
      {shows.map((s) => {
        const a = availability(s.Seats_Left);
        return (
          <button key={s.Show_ID} type="button" className={'time-chip ' + a} disabled={a === 'sold'}
            title={`${inr(s.Base_Price)} onwards · ${s.Seats_Left} seats left`} onClick={() => onPick(s)}>
            <b>{timeOnly(s.Show_Time)}</b>
            <small>{a === 'sold' ? 'SOLD OUT' : `SCREEN ${s.Screen_No}`}</small>
          </button>
        );
      })}
    </div>
  );
}

export function AvailabilityLegend() {
  return (
    <div className="avail-legend">
      <span><i className="dot available" /> Available</span>
      <span><i className="dot filling" /> Fast filling</span>
      <span><i className="dot sold" /> Sold out</span>
    </div>
  );
}
