'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

interface OrgInfo {
  orgId: string;
  name: string;
  role: string;
}

interface MeResponse {
  user: { id: string; email: string; name: string | null };
  orgs: OrgInfo[];
}

export default function SelectOrgPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [activeOrg, setActiveOrg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveOrg(localStorage.getItem('activeOrgId'));
    api<MeResponse>('/auth/me')
      .then((data) => {
        setOrgs(data.orgs);
        setLoading(false);
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  function select(orgId: string) {
    localStorage.setItem('activeOrgId', orgId);
    setActiveOrg(orgId);
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading...</p>;

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Select Active Organisation</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', maxWidth: '400px', textAlign: 'center' }}>
        The selected org will be sent as <code>x-org-id</code> header on tenant-scoped API calls.
      </p>

      {orgs.length === 0 && (
        <p>No organisations. <a href="/orgs/new" style={{ color: '#0070f3' }}>Create one</a></p>
      )}

      <div style={styles.list}>
        {orgs.map((org) => (
          <div
            key={org.orgId}
            style={{
              ...styles.row,
              border: activeOrg === org.orgId ? '2px solid #0070f3' : '1px solid #ddd',
              background: activeOrg === org.orgId ? '#eef6ff' : '#fff',
            }}
          >
            <div>
              <strong>{org.name}</strong>
              <span style={styles.badge}>{org.role}</span>
              <br />
              <code style={{ fontSize: '0.75rem', color: '#888' }}>{org.orgId}</code>
            </div>
            <button
              onClick={() => select(org.orgId)}
              style={activeOrg === org.orgId ? styles.activeBtn : styles.btn}
            >
              {activeOrg === org.orgId ? 'Active' : 'Select'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
        <a href="/me" style={{ color: '#0070f3', textDecoration: 'none' }}>Profile</a>
        <a href="/orgs/new" style={{ color: '#0070f3', textDecoration: 'none' }}>+ New Org</a>
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', width: '100%' },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
  },
  badge: {
    marginLeft: '0.5rem',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    background: '#eee',
    fontSize: '0.8rem',
  },
  btn: {
    padding: '0.4rem 1rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
  },
  activeBtn: {
    padding: '0.4rem 1rem',
    borderRadius: '6px',
    border: '1px solid #0070f3',
    background: '#0070f3',
    color: '#fff',
    cursor: 'pointer',
  },
};
