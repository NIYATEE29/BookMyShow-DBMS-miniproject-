'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';

export default function Register() {
  const router = useRouter();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '', referrerEmail: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/api/auth/register', { method: 'POST', body: f });
      router.replace('/customer');
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Create account</h1>
        <div className="row2">
          <label>First name<input value={f.firstName} onChange={set('firstName')} required /></label>
          <label>Last name<input value={f.lastName} onChange={set('lastName')} /></label>
        </div>
        <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>
        <label>Password<input type="password" minLength={6} value={f.password} onChange={set('password')} required /></label>
        <label>Referred by (friend&apos;s email, optional)
          <input type="email" value={f.referrerEmail} onChange={set('referrerEmail')} />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="btn">Sign up</button>
        <p className="muted small">Already registered? <Link href="/login">Log in</Link></p>
      </form>
    </div>
  );
}
