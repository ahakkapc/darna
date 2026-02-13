'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await api<{ orgId: string; name: string }>('/orgs', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      localStorage.setItem('activeOrgId', res.orgId);
      router.push('/me');
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message || 'Failed to create org');
    }
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Create Organisation</h1>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          placeholder="Organisation name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.button}>Create</button>
      </form>

      {error && <p style={styles.error}>{error}</p>}

      <a href="/me" style={styles.link}>Back to profile</a>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: 'system-ui, sans-serif',
    gap: '1rem',
    background: '#f5f5f5',
  },
  title: { fontSize: '1.5rem', fontWeight: 700 },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '320px',
  },
  input: {
    padding: '0.6rem 0.8rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '1rem',
  },
  button: {
    padding: '0.7rem',
    borderRadius: '6px',
    border: 'none',
    background: '#0070f3',
    color: '#fff',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  error: { color: 'red' },
  link: { color: '#0070f3', textDecoration: 'none', marginTop: '0.5rem' },
};
