'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Alert from '@mui/material/Alert';
import { api } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      if (tab === 'register') {
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        setSuccess('Compte créé ! Connectez-vous.');
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
      setError(e?.error?.message || 'Une erreur est survenue');
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
      <Card
        sx={{
          width: '100%',
          maxWidth: 420,
          p: 'var(--space-32)',
        }}
      >
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Typography
            variant="h1"
            sx={{
              textAlign: 'center',
              mb: 'var(--space-4)',
              background: 'var(--grad-brand)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Darna
          </Typography>
          <Typography
            sx={{
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '14px',
              mb: 'var(--space-24)',
            }}
          >
            Gestion immobilière
          </Typography>

          <ToggleButtonGroup
            value={tab}
            exclusive
            onChange={(_, v) => v && setTab(v)}
            fullWidth
            sx={{ mb: 'var(--space-24)' }}
          >
            <ToggleButton
              value="login"
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                '&.Mui-selected': {
                  bgcolor: 'rgba(216,162,74,0.15)',
                  color: 'var(--brand-copper)',
                  borderColor: 'var(--brand-copper)',
                },
              }}
            >
              Connexion
            </ToggleButton>
            <ToggleButton
              value="register"
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                '&.Mui-selected': {
                  bgcolor: 'rgba(216,162,74,0.15)',
                  color: 'var(--brand-copper)',
                  borderColor: 'var(--brand-copper)',
                },
              }}
            >
              Inscription
            </ToggleButton>
          </ToggleButtonGroup>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            {tab === 'register' && (
              <TextField
                placeholder="Nom"
                value={name}
                onChange={(e) => setName(e.target.value)}
                size="small"
                fullWidth
              />
            )}
            <TextField
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              type="password"
              placeholder="Mot de passe (min 10 car.)"
              required
              inputProps={{ minLength: 10 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              size="small"
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting}
              sx={{ mt: 'var(--space-8)' }}
            >
              {tab === 'login' ? 'Se connecter' : 'Créer un compte'}
            </Button>
          </Box>

          {error && <Alert severity="error" sx={{ mt: 'var(--space-16)' }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mt: 'var(--space-16)' }}>{success}</Alert>}
        </CardContent>
      </Card>
    </Box>
  );
}
