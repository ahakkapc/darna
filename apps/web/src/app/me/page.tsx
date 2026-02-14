'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { api } from '../../lib/api';

interface OrgInfo {
  orgId: string;
  name: string;
  role: string;
}

interface MeResponse {
  user: { id: string; email: string; name: string | null; phone?: string | null; phoneVerifiedAt?: string | null };
  orgs: OrgInfo[];
}

export default function MePage() {
  const router = useRouter();
  const [data, setData] = useState<MeResponse | null>(null);
  const [activeOrg, setActiveOrg] = useState<string | null>(null);

  useEffect(() => {
    setActiveOrg(localStorage.getItem('activeOrgId'));
    api<MeResponse>('/auth/me')
      .then(setData)
      .catch(() => router.push('/login'));
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

  if (!data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: 'var(--bg-0)' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--bg-0)', p: 'var(--space-24)' }}>
      <Box sx={{ maxWidth: 520, mx: 'auto' }}>
        <Typography variant="h1" sx={{ mb: 'var(--space-24)' }}>Mon profil</Typography>

        <Card sx={{ mb: 'var(--space-24)' }}>
          <CardContent>
            <Typography sx={{ color: 'var(--muted)', fontSize: '12px', mb: 'var(--space-4)' }}>Email</Typography>
            <Typography sx={{ mb: 'var(--space-12)' }}>{data.user.email}</Typography>
            <Typography sx={{ color: 'var(--muted)', fontSize: '12px', mb: 'var(--space-4)' }}>Nom</Typography>
            <Typography sx={{ mb: 'var(--space-12)' }}>{data.user.name || '—'}</Typography>
            <Typography sx={{ color: 'var(--muted)', fontSize: '12px', mb: 'var(--space-4)' }}>Téléphone</Typography>
            <Typography>{data.user.phone || '—'}</Typography>
          </CardContent>
        </Card>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 'var(--space-12)' }}>
          <Typography variant="h2">Mes organisations</Typography>
          <Button variant="outlined" size="small" onClick={() => router.push('/orgs/new')}>
            + Créer
          </Button>
        </Box>

        {data.orgs.length === 0 && (
          <Card>
            <CardContent>
              <Typography sx={{ color: 'var(--muted)', textAlign: 'center' }}>
                Aucune organisation.
              </Typography>
            </CardContent>
          </Card>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {data.orgs.map((org) => {
            const isActive = activeOrg === org.orgId;
            return (
              <Card
                key={org.orgId}
                sx={{
                  cursor: 'pointer',
                  border: isActive ? '1px solid var(--brand-copper)' : undefined,
                  '&:hover': { borderColor: 'var(--brand-copper)' },
                }}
                onClick={() => selectOrg(org.orgId)}
              >
                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 'var(--space-12) !important' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>{org.name}</Typography>
                    <Chip label={org.role} size="small" sx={{ mt: 'var(--space-4)' }} />
                  </Box>
                  {isActive && (
                    <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(216,162,74,0.15)', color: 'var(--brand-copper)', fontWeight: 600 }} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', gap: 'var(--space-12)', mt: 'var(--space-24)' }}>
          <Button variant="outlined" size="small" onClick={() => router.push('/app/settings/notifications')}>
            Notifications
          </Button>
          <Button variant="outlined" size="small" color="error" onClick={handleLogout}>
            Déconnexion
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
