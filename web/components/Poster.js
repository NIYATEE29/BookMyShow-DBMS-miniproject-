'use client';
import { useState } from 'react';

// movie poster with a graceful fallback (initials on a gradient) if missing or broken
export default function Poster({ src, title = '', className = '' }) {
  const [broken, setBroken] = useState(null);
  if (!src || broken === src) {
    const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return <div className={`poster poster-fallback ${className}`} aria-label={title}><span>{initials || '?'}</span></div>;
  }
  return <img className={`poster ${className}`} src={src} alt={`${title} poster`} loading="lazy" onError={() => setBroken(src)} />;
}
