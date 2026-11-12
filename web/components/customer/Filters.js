'use client';
import { useState } from 'react';

// collapsible filter section with multi-select chips (Languages / Genres / Cinemas)
function Section({ title, options, selected, onChange, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="filter-box">
      <div className="filter-head">
        <button type="button" className={'filter-title' + (selected.length ? ' active' : '')}
          onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="chev">{open ? '⌃' : '⌄'}</span> {title}
          {selected.length > 0 && <span className="count">{selected.length}</span>}
        </button>
        <button type="button" className="link small" onClick={() => onChange([])} disabled={!selected.length}>Clear</button>
      </div>
      {open && (
        <div className="chips">
          {options.map((o) => (
            <button type="button" key={o.value} className={'chip' + (selected.includes(o.value) ? ' on' : '')}
              onClick={() => toggle(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Filters({ languages, genres, theatres, value, onChange, onBrowseCinemas }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <aside className="filters">
      <h2>Filters</h2>
      <Section title="Languages" defaultOpen options={languages.map((l) => ({ value: l, label: l }))}
        selected={value.languages} onChange={set('languages')} />
      <Section title="Genres" options={genres.map((g) => ({ value: g, label: g }))}
        selected={value.genres} onChange={set('genres')} />
      <Section title="Cinemas" options={theatres.map((t) => ({ value: t.Theatre_ID, label: t.Name }))}
        selected={value.theatres} onChange={set('theatres')} />
      <button type="button" className="btn outline wide" onClick={onBrowseCinemas}>Browse by Cinemas</button>
    </aside>
  );
}
