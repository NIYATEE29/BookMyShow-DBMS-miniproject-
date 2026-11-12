'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

// write / edit / delete my review of one movie (stored in Redis)
export function ReviewForm({ movieId, existing, onSaved, flash, compact = false }) {
  const [form, setForm] = useState({ rating: existing?.rating || 5, comment: existing?.comment || '' });
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/reviews', { method: 'POST', body: { movieId: Number(movieId), ...form } });
      flash(r.updated ? 'Review updated' : 'Thanks! Your review is live');
      onSaved?.();
    } catch (e) { flash(e.message, 'error'); }
    setBusy(false);
  }
  async function remove() {
    if (!confirm('Delete your review?')) return;
    try {
      await api(`/api/reviews?movieId=${movieId}`, { method: 'DELETE' });
      flash('Review deleted');
      onSaved?.();
    } catch (e) { flash(e.message, 'error'); }
  }

  return (
    <form className={compact ? 'review-form' : 'card review-form'} onSubmit={save}>
      {!compact && <h3>{existing ? 'Edit your review' : 'Rate this movie'}</h3>}
      <div className="stars" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= form.rating ? 'star on' : 'star'} onClick={() => setForm({ ...form, rating: n })}>★</button>
        ))}
        <span className="muted small">{form.rating}/5</span>
      </div>
      <textarea rows={3} maxLength={500} placeholder="What did you think of the movie?"
        value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} required />
      <div className="actions">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : existing ? 'Update review' : 'Post review'}</button>
        {existing && <button type="button" className="btn danger" onClick={remove}>Delete</button>}
      </div>
    </form>
  );
}

export default function ReviewModal({ movie, existing, onClose, onSaved, flash }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{existing ? 'Edit review' : 'Rate & review'}</h2>
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </div>
        <p className="muted">{movie.Title}</p>
        <ReviewForm movieId={movie.Movie_ID} existing={existing} flash={flash} compact
          onSaved={() => { onSaved?.(); onClose(); }} />
      </div>
    </div>
  );
}
