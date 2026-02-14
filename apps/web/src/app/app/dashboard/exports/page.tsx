'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { DownloadSimple } from '@phosphor-icons/react';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import { dashboardApi, DashboardQuery } from '@/lib/dashboard';

const PERIOD_OPTIONS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'quarter', label: 'Ce trimestre' },
] as const;

export default function ExportsPage() {
  const [period, setPeriod] = useState<string>('month');

  const handleDownload = () => {
    const q: DashboardQuery = { period: period as DashboardQuery['period'], scope: 'org' };
    const url = dashboardApi.exportCsvUrl(q);
    const orgId = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null;
    const fullUrl = orgId ? `${url}&_orgId=${orgId}` : url;
    window.open(fullUrl, '_blank');
  };

  return (
    <DPage title="Exports" subtitle="Télécharger les données du tableau de bord">
      <DCard title="Export CSV des leads">
        <Typography sx={{ color: 'var(--muted)', fontSize: 13, mb: 'var(--space-16)' }}>
          Exportez la liste des leads avec leurs informations principales (nom, statut, source, date de création, date de gain/perte) au format CSV.
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-16)', flexWrap: 'wrap' }}>
          <Select
            size="small"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            {PERIOD_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>

          <Button
            variant="contained"
            startIcon={<DownloadSimple size={18} />}
            onClick={handleDownload}
          >
            Télécharger CSV
          </Button>
        </Box>

        <Typography sx={{ color: 'var(--muted-2)', fontSize: 11, mt: 'var(--space-12)' }}>
          Réservé aux propriétaires et managers. Le fichier inclut uniquement les leads de votre organisation.
        </Typography>
      </DCard>
    </DPage>
  );
}
