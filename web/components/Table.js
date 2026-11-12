'use client';
// generic table: cols = [{key, label, render?}]
export default function Table({ cols, rows, empty = 'No rows' }) {
  if (!rows?.length) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c.key || c.label}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key || c.label}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
