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
      .catch(() => router.push('/login'));
  }, [router]);

  function select(orgId: string) {
    localStorage.setItem('activeOrgId', orgId);
    setActiveOrg(orgId);
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: 'var(--bg-0)' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--bg-0)', p: 'var(--space-24)' }}>
      <Box sx={{ maxWidth: 520, mx: 'auto' }}>
        <Typography variant="h1" sx={{ textAlign: 'center', mb: 'var(--space-8)' }}>
          Sélectionner une organisation
        </Typography>
        <Typography sx={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px', mb: 'var(--space-24)' }}>
          L&apos;organisation sélectionnée sera utilisée pour toutes les opérations.
        </Typography>

        {orgs.length === 0 && (
          <Card sx={{ mb: 'var(--space-16)' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: 'var(--muted)', mb: 'var(--space-12)' }}>Aucune organisation.</Typography>
              <Button variant="contained" size="small" onClick={() => router.push('/orgs/new')}>
                Créer une organisation
              </Button>
            </CardContent>
          </Card>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 'var(--space-12)' }}>
          {orgs.map((org) => {
            const isActive = activeOrg === org.orgId;
            return (
              <Card
                key={org.orgId}
                sx={{
                  cursor: 'pointer',
                  border: isActive ? '1px solid var(--brand-copper)' : undefined,
                  '&:hover': { borderColor: 'var(--brand-copper)' },
                  transition: 'border-color 0.2s',
                }}
                onClick={() => select(org.orgId)}
              >
                <CardContent>
                  <Typography sx={{ fontWeight: 600, mb: 'var(--space-4)' }}>{org.name}</Typography>
                  <Box sx={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center' }}>
                    <Chip label={org.role} size="small" />
                    {isActive && (
                      <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(216,162,74,0.15)', color: 'var(--brand-copper)', fontWeight: 600 }} />
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', gap: 'var(--space-12)', mt: 'var(--space-24)', justifyContent: 'center' }}>
          <Button variant="outlined" size="small" onClick={() => router.push('/me')}>Profil</Button>
          <Button variant="outlined" size="small" onClick={() => router.push('/orgs/new')}>+ Nouvelle org</Button>
        </Box>
      </Box>
    </Box>
  );
}
