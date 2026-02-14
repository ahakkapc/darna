'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import { DErrorState, DEmptyState, DForbiddenState } from '@/components/ui/DStates';
import { ApiError } from '@/lib/http';
import { dashboardApi, CollaboratorsData, DashboardQuery } from '@/lib/dashboard';

const PERIOD_OPTIONS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'quarter', label: 'Ce trimestre' },
] as const;

const ROLE_COLORS: Record<string, 'primary' | 'secondary' | 'default' | 'success' | 'warning'> = {
  OWNER: 'primary',
  MANAGER: 'secondary',
  AGENT: 'default',
  VIEWER: 'warning',
};

export default function TeamPage() {
  const [period, setPeriod] = useState<string>('month');
  const [data, setData] = useState<CollaboratorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const q: DashboardQuery = { period: period as DashboardQuery['period'] };
      const result = await dashboardApi.collaborators(q);
      setData(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ROLE_FORBIDDEN') {
        setForbidden(true);
      } else {
        setError(e instanceof ApiError ? e : new ApiError(500, 'UNKNOWN', String(e)));
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const periodSelector = (
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
  );

  if (forbidden) {
    return (
      <DPage title="Équipe" actions={periodSelector}>
        <DForbiddenState title="Accès réservé aux managers" desc="Seuls les propriétaires et managers peuvent voir les performances de l'équipe." />
      </DPage>
    );
  }

  if (error) {
    return (
      <DPage title="Équipe" actions={periodSelector}>
        <DErrorState title="Erreur" desc={error.message} requestId={error.requestId} cta={{ label: 'Réessayer', onClick: load }} />
      </DPage>
    );
  }

  return (
    <DPage title="Équipe" subtitle="Performance des collaborateurs" actions={periodSelector}>
      {loading || !data ? (
        <Skeleton variant="rounded" height={300} />
      ) : data.items.length === 0 ? (
        <DEmptyState title="Aucun collaborateur" desc="Invitez des membres pour voir leurs performances." />
      ) : (
        <DCard>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Collaborateur</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Rôle</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Leads</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Gagnés</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Perdus</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Tâches en retard</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Activités</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.userId} hover>
                    <TableCell>
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{item.userName}</Typography>
                        <Typography sx={{ fontSize: 11, color: 'var(--muted)' }}>{item.userEmail}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={item.role} size="small" color={ROLE_COLORS[item.role] ?? 'default'} />
                    </TableCell>
                    <TableCell align="right">{item.kpis.leadsOwned}</TableCell>
                    <TableCell align="right">
                      <Typography sx={{ color: 'var(--success)', fontWeight: 600, fontSize: 13 }}>
                        {item.kpis.leadsWon}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography sx={{ color: 'var(--error)', fontWeight: 600, fontSize: 13 }}>
                        {item.kpis.leadsLost}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography sx={{ color: item.kpis.tasksOverdue > 0 ? 'var(--warning)' : 'inherit', fontWeight: item.kpis.tasksOverdue > 0 ? 600 : 400, fontSize: 13 }}>
                        {item.kpis.tasksOverdue}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{item.kpis.activitiesCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DCard>
      )}
    </DPage>
  );
}
