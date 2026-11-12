'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';

const DEMO = [
  { label: 'Platform admin', email: 'admin@cine.com', password: 'admin123' },
  { label: 'Theatre admin (Galaxy)', email: 'admin.galaxy@cine.com', password: 'admin123' },
  { label: 'Customer (Nikita)', email: 'nikita@demo.com', password: 'user123' },
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      router.replace(r.role === 'CUSTOMER' ? '/customer' : '/admin');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>🎬 CineBook</h1>
        <p className="muted">Movie Ticket Booking &amp; Theatre Management</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
        <p className="muted small">New here? <Link href="/register">Create a customer account</Link></p>
        <div className="demo">
          <span className="muted small">Demo logins:</span>
          {DEMO.map((d) => (
            <button type="button" key={d.email} className="btn ghost small"
              onClick={() => { setEmail(d.email); setPassword(d.password); }}>
              {d.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
