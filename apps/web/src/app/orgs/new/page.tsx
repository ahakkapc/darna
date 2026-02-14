'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { api } from '../../../lib/api';

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api<{ orgId: string; name: string }>('/orgs', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      localStorage.setItem('activeOrgId', res.orgId);
      router.push('/orgs/select');
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message || 'Impossible de créer l\'organisation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'var(--bg-0)',
        p: 'var(--space-16)',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 480, p: 'var(--space-32)' }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Typography variant="h1" sx={{ mb: 'var(--space-4)' }}>
            Créer une organisation
          </Typography>
          <Typography sx={{ color: 'var(--muted)', fontSize: '13px', mb: 'var(--space-24)' }}>
            Donnez un nom à votre agence ou structure.
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
            <TextField
              placeholder="Nom de l'organisation"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="small"
              fullWidth
            />
            <Button type="submit" variant="contained" fullWidth disabled={submitting}>
              Créer
            </Button>
          </Box>

          {error && <Alert severity="error" sx={{ mt: 'var(--space-16)' }}>{error}</Alert>}

          <Button
            variant="text"
            size="small"
            onClick={() => router.push('/me')}
            sx={{ mt: 'var(--space-16)', color: 'var(--muted)' }}
          >
            Retour au profil
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
