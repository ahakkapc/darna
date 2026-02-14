'use client';

import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';

export default function Home() {
  const router = useRouter();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'var(--bg-0)',
        p: 'var(--space-24)',
        gap: 'var(--space-32)',
      }}
    >
      <Box sx={{ textAlign: 'center' }}>
        <Typography
          sx={{
            fontSize: '48px',
            fontWeight: 700,
            lineHeight: 1.1,
            mb: 'var(--space-12)',
            background: 'var(--grad-brand)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Darna
        </Typography>
        <Typography sx={{ color: 'var(--muted)', fontSize: '16px', maxWidth: 440, mx: 'auto' }}>
          Plateforme de gestion immobilière — CRM, documents, annonces et plus.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 'var(--space-12)' }}>
        <Button variant="contained" size="large" onClick={() => router.push('/app/crm/leads')}>
          Accéder au CRM
        </Button>
        <Button variant="outlined" size="large" onClick={() => router.push('/login')}>
          Se connecter
        </Button>
      </Box>

      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Typography variant="h2" sx={{ mb: 'var(--space-8)' }}>
            Sprint 3.1
          </Typography>
          <Typography sx={{ color: 'var(--muted)', fontSize: '13px' }}>
            Notifications réelles (email + WhatsApp) — Charte premium globale — Stabilisation
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
