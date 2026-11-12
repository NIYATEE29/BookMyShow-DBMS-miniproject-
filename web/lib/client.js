'use client';
// tiny fetch helper + formatting helpers for client components
export async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// MySQL DATETIME strings ('2026-11-03 10:00:00') -> Date in local time
export const toDate = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null);

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const when = (s) =>
  s ? toDate(s).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
export const timeOnly = (s) =>
  s ? toDate(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase() : '';
export const longDate = (s) =>
  s ? toDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// 'YYYY-MM-DD' key of a DATETIME string / Date
export const dayKey = (s) => {
  const d = s instanceof Date ? s : toDate(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const duration = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${m ? m + 'm' : ''}`.trim() : `${m}m`;
};

export const ago = (s) => {
  const d = toDate(s);
  if (!d) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return longDate(s);
};

// availability colour like the big ticketing apps
export const availability = (seatsLeft, capacity = 50) =>
  seatsLeft <= 0 ? 'sold' : seatsLeft <= capacity * 0.3 ? 'filling' : 'available';

// part of the day, used by the "show timings" filter
export const dayPart = (s) => {
  const h = toDate(s).getHours();
  return h < 12 ? 'Morning' : h < 16 ? 'Afternoon' : h < 20 ? 'Evening' : 'Night';
};
