'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (tab === 'register') {
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        setSuccess('Account created! You can now log in.');
        setTab('login');
        return;
      }

      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/me');
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message || 'Something went wrong');
    }
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Darna</h1>

      <div style={styles.tabs}>
        <button
          onClick={() => setTab('login')}
          style={tab === 'login' ? styles.tabActive : styles.tab}
        >
          Login
        </button>
        <button
          onClick={() => setTab('register')}
          style={tab === 'register' ? styles.tabActive : styles.tab}
        >
          Register
        </button>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {tab === 'register' && (
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />
        <input
          type="password"
          placeholder="Password (min 10 chars)"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.button}>
          {tab === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>

      {error && <p style={styles.error}>{error}</p>}
      {success && <p style={styles.success}>{success}</p>}
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
  title: { fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' },
  tabs: { display: 'flex', gap: '0.5rem' },
  tab: {
    padding: '0.5rem 1.5rem',
    border: '1px solid #ccc',
    background: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  tabActive: {
    padding: '0.5rem 1.5rem',
    border: '1px solid #0070f3',
    background: '#0070f3',
    color: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
  },
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
  error: { color: 'red', maxWidth: '320px', textAlign: 'center' },
  success: { color: 'green', maxWidth: '320px', textAlign: 'center' },
};
