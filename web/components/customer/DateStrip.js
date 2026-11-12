'use client';
// horizontal date picker: MON 02 NOV · TUE 03 NOV ...
export default function DateStrip({ days, value, onChange }) {
  if (!days.length) return null;
  return (
    <div className="date-strip" role="tablist">
      {days.map((d) => {
        const dt = new Date(d + 'T00:00:00');
        return (
          <button key={d} type="button" role="tab" aria-selected={d === value}
            className={'date-chip' + (d === value ? ' active' : '')} onClick={() => onChange(d)}>
            <small>{dt.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()}</small>
            <b>{String(dt.getDate()).padStart(2, '0')}</b>
            <small>{dt.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</small>
          </button>
        );
      })}
    </div>
  );
}
