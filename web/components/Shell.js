'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

const BADGE = { ADMIN: 'badge-admin', 'THEATRE ADMIN': 'badge-theatre', CUSTOMER: 'badge-user' };

export default function Shell({ user, roleLabel, subtitle, tabs, tab, setTab, children }) {
  const router = useRouter();
  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">🎬 CineBook</div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className="who">
          <span className={'badge ' + (BADGE[roleLabel] || 'badge-user')}>{roleLabel}</span>
          <span className="who-name">{user?.name}{subtitle && <small className="muted"> · {subtitle}</small>}</span>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
