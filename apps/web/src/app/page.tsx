'use client';

import { useEffect, useState } from 'react';

interface HealthResponse {
  ok: boolean;
  db: boolean;
}

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: HealthResponse) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        gap: '1rem',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Darna</h1>

      {loading && <p>Checking API…</p>}

      {error && (
        <p style={{ color: 'red' }}>
          API Error: {error}
        </p>
      )}

      {health && (
        <div
          style={{
            padding: '1.5rem 2rem',
            borderRadius: '8px',
            background: health.ok ? '#e6ffe6' : '#ffe6e6',
            border: `1px solid ${health.ok ? '#00cc00' : '#cc0000'}`,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            {health.ok ? '✅ API OK' : '❌ API Down'}
          </p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: '#555' }}>
            DB: {health.db ? 'Connected' : 'Disconnected'}
          </p>
        </div>
      )}
    </main>
  );
}
