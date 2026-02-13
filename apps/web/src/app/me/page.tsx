'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface OrgInfo {
  orgId: string;
  name: string;
  role: string;
}

interface MeResponse {
  user: { id: string; email: string; name: string | null };
  orgs: OrgInfo[];
}

export default function MePage() {
  const router = useRouter();
  const [data, setData] = useState<MeResponse | null>(null);
  const [error, setError] = useState('');
  const [activeOrg, setActiveOrg] = useState<string | null>(null);

  useEffect(() => {
    setActiveOrg(localStorage.getItem('activeOrgId'));
    api<MeResponse>('/auth/me')
      .then(setData)
      .catch(() => {
        setError('Not authenticated');
        router.push('/login');
      });
  }, [router]);

  function selectOrg(orgId: string) {
    localStorage.setItem('activeOrgId', orgId);
    setActiveOrg(orgId);
  }

  async function handleLogout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('activeOrgId');
    router.push('/login');
  }

  if (error) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading...</p>;

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>My Profile</h1>

      <div style={styles.card}>
        <p><strong>Email:</strong> {data.user.email}</p>
        <p><strong>Name:</strong> {data.user.name || '—'}</p>
        <p><strong>ID:</strong> <code>{data.user.id}</code></p>
      </div>

      <h2 style={{ marginTop: '1.5rem' }}>My Organisations</h2>

      {data.orgs.length === 0 && (
        <p style={{ color: '#888' }}>
          No organisations yet.{' '}
          <a href="/orgs/new" style={{ color: '#0070f3' }}>Create one</a>
        </p>
      )}

      <div style={styles.list}>
        {data.orgs.map((org) => (
          <div
            key={org.orgId}
            style={{
              ...styles.orgRow,
              border: activeOrg === org.orgId ? '2px solid #0070f3' : '1px solid #ddd',
            }}
          >
            <div>
              <strong>{org.name}</strong>
              <span style={styles.badge}>{org.role}</span>
            </div>
            <button
              onClick={() => selectOrg(org.orgId)}
              style={activeOrg === org.orgId ? styles.selectedBtn : styles.selectBtn}
            >
              {activeOrg === org.orgId ? 'Active' : 'Select'}
            </button>
          </div>
        ))}
      </div>

      <div style={styles.actions}>
        <a href="/orgs/new" style={styles.link}>+ Create Org</a>
        <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: '500px',
    margin: '2rem auto',
    fontFamily: 'system-ui, sans-serif',
    padding: '0 1rem',
  },
  title: { fontSize: '1.5rem', fontWeight: 700 },
  card: {
    padding: '1rem',
    background: '#f9f9f9',
    borderRadius: '8px',
    border: '1px solid #eee',
    marginTop: '0.5rem',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' },
  orgRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    background: '#fff',
  },
  badge: {
    marginLeft: '0.5rem',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    background: '#eee',
    fontSize: '0.8rem',
  },
  selectBtn: {
    padding: '0.4rem 1rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
  },
  selectedBtn: {
    padding: '0.4rem 1rem',
    borderRadius: '6px',
    border: '1px solid #0070f3',
    background: '#0070f3',
    color: '#fff',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem',
    alignItems: 'center',
  },
  link: { color: '#0070f3', textDecoration: 'none', fontWeight: 600 },
  logoutBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: '1px solid #cc0000',
    background: '#fff',
    color: '#cc0000',
    cursor: 'pointer',
  },
};
