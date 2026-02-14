'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import LinearProgress from '@mui/material/LinearProgress';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import { DErrorState, DEmptyState } from '@/components/ui/DStates';
import { ApiError } from '@/lib/http';
import { dashboardApi, PipelineData, DashboardQuery } from '@/lib/dashboard';

const PERIOD_OPTIONS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'quarter', label: 'Ce trimestre' },
] as const;

const STEP_LABELS: Record<string, string> = {
  LEADS_CREATED: 'Leads créés',
  VISITS_SCHEDULED: 'Visites planifiées',
  VISITS_DONE: 'Visites réalisées',
  WON: 'Gagnés',
};

const STEP_COLORS = ['var(--brand-copper)', '#7C3AED', '#2563EB', 'var(--success)'];

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function PipelinePage() {
  const [period, setPeriod] = useState<string>('month');
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q: DashboardQuery = { period: period as DashboardQuery['period'], scope: 'org' };
      const result = await dashboardApi.pipeline(q);
      setData(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ROLE_FORBIDDEN') {
        try {
          const q: DashboardQuery = { period: period as DashboardQuery['period'], scope: 'me' };
          const result = await dashboardApi.pipeline(q);
          setData(result);
        } catch (e2) {
          setError(e2 instanceof ApiError ? e2 : new ApiError(500, 'UNKNOWN', String(e2)));
        }
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

  if (error) {
    return (
      <DPage title="Pipeline" actions={periodSelector}>
        <DErrorState title="Erreur" desc={error.message} requestId={error.requestId} cta={{ label: 'Réessayer', onClick: load }} />
      </DPage>
    );
  }

  const maxCount = data ? Math.max(...data.funnel.map((f) => f.count), 1) : 1;

  return (
    <DPage title="Pipeline" subtitle="Entonnoir de conversion" actions={periodSelector}>
      {loading || !data ? (
        <Skeleton variant="rounded" height={400} />
      ) : (
        <>
          {/* Funnel visualization */}
          <DCard title="Entonnoir">
            {data.funnel.every((f) => f.count === 0) ? (
              <DEmptyState title="Aucune donnée" desc="Pas de données de pipeline sur cette période." />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
                {data.funnel.map((step, i) => (
                  <Box key={step.step}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 'var(--space-4)' }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                        {STEP_LABELS[step.step] ?? step.step}
                      </Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: STEP_COLORS[i] }}>
                        {step.count}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={(step.count / maxCount) * 100}
                      sx={{
                        height: 24,
                        borderRadius: 'var(--radius-md)',
                        bgcolor: 'var(--border)',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: STEP_COLORS[i],
                          borderRadius: 'var(--radius-md)',
                        },
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </DCard>

          {/* Conversion rates */}
          <Box sx={{ display: 'flex', gap: 'var(--space-16)', mt: 'var(--space-16)', flexWrap: 'wrap' }}>
            <Box
              sx={{
                flex: '1 1 200px',
                p: 'var(--space-16)',
                borderRadius: 'var(--radius-lg)',
                bgcolor: 'var(--surface)',
                border: '1px solid var(--border)',
                textAlign: 'center',
              }}
            >
              <Typography sx={{ color: 'var(--muted)', fontSize: 12, mb: 'var(--space-4)' }}>
                Lead → Visite
              </Typography>
              <Typography variant="h2" sx={{ fontWeight: 700, color: '#7C3AED' }}>
                {pct(data.rates.leadToVisit)}
              </Typography>
            </Box>
            <Box
              sx={{
                flex: '1 1 200px',
                p: 'var(--space-16)',
                borderRadius: 'var(--radius-lg)',
                bgcolor: 'var(--surface)',
                border: '1px solid var(--border)',
                textAlign: 'center',
              }}
            >
              <Typography sx={{ color: 'var(--muted)', fontSize: 12, mb: 'var(--space-4)' }}>
                Visite → Gagné
              </Typography>
              <Typography variant="h2" sx={{ fontWeight: 700, color: 'var(--success)' }}>
                {pct(data.rates.visitToWon)}
              </Typography>
            </Box>
            <Box
              sx={{
                flex: '1 1 200px',
                p: 'var(--space-16)',
                borderRadius: 'var(--radius-lg)',
                bgcolor: 'var(--surface)',
                border: '1px solid var(--border)',
                textAlign: 'center',
              }}
            >
              <Typography sx={{ color: 'var(--muted)', fontSize: 12, mb: 'var(--space-4)' }}>
                Lead → Gagné
              </Typography>
              <Typography variant="h2" sx={{ fontWeight: 700, color: 'var(--brand-copper)' }}>
                {pct(data.rates.leadToWon)}
              </Typography>
            </Box>
          </Box>

          {/* Bar Chart of funnel */}
          <Box sx={{ mt: 'var(--space-24)' }}>
            <DCard title="Vue graphique">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.funnel.map((f, i) => ({ ...f, label: STEP_LABELS[f.step] ?? f.step, fill: STEP_COLORS[i] }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" fontSize={11} stroke="var(--muted)" />
                  <YAxis fontSize={11} stroke="var(--muted)" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Bar dataKey="count" name="Total" radius={[4, 4, 0, 0]}>
                    {data.funnel.map((_, i) => (
                      <Cell key={i} fill={STEP_COLORS[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </DCard>
          </Box>
        </>
      )}
    </DPage>
  );
}
