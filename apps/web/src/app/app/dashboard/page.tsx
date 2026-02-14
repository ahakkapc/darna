'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import { DErrorState, DEmptyState } from '@/components/ui/DStates';
import { ApiError } from '@/lib/http';
import {
  dashboardApi,
  OverviewData,
  FocusData,
  DashboardQuery,
} from '@/lib/dashboard';

const PERIOD_OPTIONS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'quarter', label: 'Ce trimestre' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nouveau', CONTACTED: 'Contacté', QUALIFIED: 'Qualifié',
  PROPOSAL: 'Proposition', NEGOTIATION: 'Négociation', VISIT_SCHEDULED: 'Visite planifiée',
  VISIT_DONE: 'Visite faite', WON: 'Gagné', LOST: 'Perdu',
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manuel', WEBSITE: 'Site web', REFERRAL: 'Parrainage',
  SOCIAL: 'Réseaux sociaux', PHONE: 'Téléphone', OTHER: 'Autre',
};

interface KpiCardProps {
  label: string;
  value: number;
  color?: string;
}

function KpiCard({ label, value, color }: KpiCardProps) {
  return (
    <Box
      sx={{
        p: 'var(--space-16)',
        borderRadius: 'var(--radius-lg)',
        bgcolor: 'var(--surface)',
        border: '1px solid var(--border)',
        minWidth: 140,
        flex: '1 1 140px',
      }}
    >
      <Typography sx={{ color: 'var(--muted)', fontSize: 13, mb: 'var(--space-4)' }}>
        {label}
      </Typography>
      <Typography
        variant="h2"
        sx={{ color: color ?? 'var(--foreground)', fontWeight: 700, fontSize: 28 }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function KpiSkeleton() {
  return (
    <Box sx={{ display: 'flex', gap: 'var(--space-12)', flexWrap: 'wrap' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" width={160} height={80} />
      ))}
    </Box>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<string>('month');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [focus, setFocus] = useState<FocusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q: DashboardQuery = { period: period as DashboardQuery['period'], scope: 'org' };
      const [ov, fc] = await Promise.all([
        dashboardApi.overview(q),
        dashboardApi.focus({ scope: 'org' }),
      ]);
      setOverview(ov);
      setFocus(fc);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ROLE_FORBIDDEN') {
        const q: DashboardQuery = { period: period as DashboardQuery['period'], scope: 'me' };
        try {
          const [ov, fc] = await Promise.all([
            dashboardApi.overview(q),
            dashboardApi.focus({ scope: 'me' }),
          ]);
          setOverview(ov);
          setFocus(fc);
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
      <DPage title="Tableau de bord" actions={periodSelector}>
        <DErrorState
          title="Erreur de chargement"
          desc={error.message}
          requestId={error.requestId}
          cta={{ label: 'Réessayer', onClick: load }}
        />
      </DPage>
    );
  }

  return (
    <DPage title="Tableau de bord" subtitle="Vue d'ensemble de votre activité" actions={periodSelector}>
      {loading || !overview ? (
        <KpiSkeleton />
      ) : (
        <>
          {/* KPI Cards */}
          <Box sx={{ display: 'flex', gap: 'var(--space-12)', flexWrap: 'wrap', mb: 'var(--space-24)' }}>
            <KpiCard label="Nouveaux leads" value={overview.kpis.leadsNew} color="var(--brand-copper)" />
            <KpiCard label="Leads gagnés" value={overview.kpis.leadsWon} color="var(--success)" />
            <KpiCard label="Leads perdus" value={overview.kpis.leadsLost} color="var(--error)" />
            <KpiCard label="Visites planifiées" value={overview.kpis.visitsScheduled} />
            <KpiCard label="Tâches en retard" value={overview.kpis.tasksOverdue} color="var(--warning)" />
            <KpiCard label="Activités / jour" value={overview.kpis.activitiesPerDay} />
            <KpiCard label="Appels enregistrés" value={overview.kpis.callsLogged} />
            <KpiCard label="Annonces publiées" value={overview.kpis.listingsPublished} />
          </Box>

          {/* Charts Row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 'var(--space-16)', mb: 'var(--space-24)' }}>
            <DCard title="Leads créés par jour">
              {overview.series.leadsPerDay.length === 0 ? (
                <DEmptyState title="Aucune donnée" desc="Pas de leads sur cette période." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={overview.series.leadsPerDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      fontSize={11}
                      stroke="var(--muted)"
                    />
                    <YAxis fontSize={11} stroke="var(--muted)" allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(d) => new Date(String(d)).toLocaleDateString('fr-FR')}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                    />
                    <Bar dataKey="count" name="Leads" fill="var(--brand-copper)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DCard>

            <DCard title="Activités par jour">
              {overview.series.activitiesPerDay.length === 0 ? (
                <DEmptyState title="Aucune donnée" desc="Pas d'activités sur cette période." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={overview.series.activitiesPerDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      fontSize={11}
                      stroke="var(--muted)"
                    />
                    <YAxis fontSize={11} stroke="var(--muted)" allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(d) => new Date(String(d)).toLocaleDateString('fr-FR')}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                    />
                    <Bar dataKey="count" name="Activités" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DCard>
          </Box>

          {/* Breakdowns Row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 'var(--space-16)', mb: 'var(--space-24)' }}>
            <DCard title="Répartition par statut">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)' }}>
                {overview.breakdowns.byStatus.map((b) => (
                  <Chip
                    key={b.key}
                    label={`${STATUS_LABELS[b.key] ?? b.key}: ${b.count}`}
                    variant="outlined"
                    size="small"
                  />
                ))}
                {overview.breakdowns.byStatus.length === 0 && (
                  <Typography sx={{ color: 'var(--muted)', fontSize: 13 }}>Aucune donnée</Typography>
                )}
              </Box>
            </DCard>

            <DCard title="Répartition par source">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)' }}>
                {overview.breakdowns.bySource.map((b) => (
                  <Chip
                    key={b.key}
                    label={`${SOURCE_LABELS[b.key] ?? b.key}: ${b.count}`}
                    variant="outlined"
                    size="small"
                  />
                ))}
                {overview.breakdowns.bySource.length === 0 && (
                  <Typography sx={{ color: 'var(--muted)', fontSize: 13 }}>Aucune donnée</Typography>
                )}
              </Box>
            </DCard>
          </Box>

          {/* Focus Section */}
          {focus && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 'var(--space-16)' }}>
              <DCard title="Leads à relancer">
                {focus.needsFollowUpLeads.length === 0 ? (
                  <Typography sx={{ color: 'var(--muted)', fontSize: 13 }}>Aucun lead à relancer</Typography>
                ) : (
                  <List dense disablePadding>
                    {focus.needsFollowUpLeads.slice(0, 5).map((l) => (
                      <ListItem key={l.id} disableGutters>
                        <ListItemText
                          primary={l.fullName}
                          secondary={STATUS_LABELS[l.status] ?? l.status}
                          primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }}
                          secondaryTypographyProps={{ fontSize: 11 }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </DCard>

              <DCard title="Prochaines visites">
                {focus.upcomingVisits.length === 0 ? (
                  <Typography sx={{ color: 'var(--muted)', fontSize: 13 }}>Aucune visite à venir</Typography>
                ) : (
                  <List dense disablePadding>
                    {focus.upcomingVisits.slice(0, 5).map((v) => (
                      <ListItem key={v.id} disableGutters>
                        <ListItemText
                          primary={v.title}
                          secondary={new Date(v.startAt).toLocaleDateString('fr-FR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                          primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }}
                          secondaryTypographyProps={{ fontSize: 11 }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </DCard>

              <DCard title="Annonces prêtes">
                {focus.readyToPublishListings.length === 0 ? (
                  <Typography sx={{ color: 'var(--muted)', fontSize: 13 }}>Aucune annonce prête</Typography>
                ) : (
                  <List dense disablePadding>
                    {focus.readyToPublishListings.slice(0, 5).map((li) => (
                      <ListItem key={li.id} disableGutters>
                        <ListItemText
                          primary={li.title}
                          secondary={li.status}
                          primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }}
                          secondaryTypographyProps={{ fontSize: 11 }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </DCard>
            </Box>
          )}
        </>
      )}
    </DPage>
  );
}
