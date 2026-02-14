'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { Plus } from '@phosphor-icons/react';
import {
  PageBody,
  PageHeader,
  DataListFilters,
  DataListLoadMore,
  DSButton,
  DSCard,
  DSTable,
  DSStatusBadge,
  DSBadge,
  DSErrorState,
  colors,
  spacing,
  iconSize,
} from '@/design-system';
import type { DSTableColumn } from '@/design-system';
import { http, ApiError } from '@/lib/http';

interface Lead {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  priority: string;
  ownerUserId: string | null;
  wilaya: string | null;
  quartier: string | null;
  nextActionAt: string | null;
  updatedAt: string;
}

interface ListResponse {
  items: Lead[];
  page: { hasMore: boolean; nextCursor?: string; limit: number };
}

const STATUS_OPTIONS = ['NEW', 'TO_CONTACT', 'VISIT_SCHEDULED', 'OFFER_IN_PROGRESS', 'WON', 'LOST'];
const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nouveau',
  TO_CONTACT: 'À contacter',
  VISIT_SCHEDULED: 'Visite planifiée',
  OFFER_IN_PROGRESS: 'Offre en cours',
  WON: 'Gagné',
  LOST: 'Perdu',
};
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH'];

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.round(diff / 86400000);
  if (days < -1) return `il y a ${Math.abs(days)}j`;
  if (days === -1) return 'hier';
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  return `dans ${days}j`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function LeadsListPage() {
  return (
    <Suspense>
      <LeadsListInner />
    </Suspense>
  );
}

function LeadsListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [priority, setPriority] = useState(searchParams.get('priority') ?? '');
  const [owner, setOwner] = useState(searchParams.get('owner') ?? '');
  const [nextAction, setNextAction] = useState(searchParams.get('nextAction') ?? '');

  const [items, setItems] = useState<Lead[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (owner) params.set('owner', owner);
    if (nextAction) params.set('nextAction', nextAction);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [q, status, priority, owner, nextAction]);

  const fetchLeads = useCallback(async (resetCursor?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (owner) params.set('owner', owner);
      if (nextAction) {
        if (nextAction === 'overdue') params.set('nextActionBefore', new Date().toISOString());
        if (nextAction === 'today') {
          const end = new Date();
          end.setHours(23, 59, 59, 999);
          params.set('nextActionBefore', end.toISOString());
        }
        if (nextAction === 'week') {
          const end = new Date();
          end.setDate(end.getDate() + 7);
          params.set('nextActionBefore', end.toISOString());
        }
      }
      if (!resetCursor && cursor) params.set('cursor', cursor);
      const res = await http.get<ListResponse>(`/crm/leads?${params}`);
      if (resetCursor) {
        setItems(res.items);
      } else {
        setItems((prev) => [...prev, ...res.items]);
      }
      setCursor(res.page.nextCursor);
      setHasMore(res.page.hasMore);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, [q, status, priority, owner, nextAction, cursor]);

  // Sync URL on filter change
  useEffect(() => {
    const url = `/app/crm/leads${buildUrl()}`;
    window.history.replaceState(null, '', url);
  }, [buildUrl]);

  // Debounced fetch on filter change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursor(undefined);
      fetchLeads(true);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, priority, owner, nextAction]);

  const handleReset = () => {
    setQ('');
    setStatus('');
    setPriority('');
    setOwner('');
    setNextAction('');
  };

  const PRIORITY_VARIANT: Record<string, 'neutral' | 'info' | 'warn' | 'danger'> = {
    LOW: 'neutral', MEDIUM: 'info', HIGH: 'warn', URGENT: 'danger',
  };
  const PRIORITY_LABEL: Record<string, string> = { LOW: 'Faible', MEDIUM: 'Moyen', HIGH: 'Élevé', URGENT: 'Urgent' };

  const columns: DSTableColumn<Lead>[] = [
    {
      key: 'name',
      label: 'Nom',
      render: (r) => (
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: '14px' }}>{r.fullName}</Typography>
          <Typography sx={{ color: colors.text[2], fontSize: '12px' }}>
            {r.phone ?? r.email ?? '—'}
          </Typography>
        </Box>
      ),
    },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <DSStatusBadge status={r.status} label={STATUS_LABELS[r.status] ?? r.status} /> },
    { key: 'priority', label: 'Priorité', width: 100, render: (r) => <DSBadge variant={PRIORITY_VARIANT[r.priority] ?? 'neutral'} label={PRIORITY_LABEL[r.priority] ?? r.priority} /> },
    {
      key: 'owner',
      label: 'Owner',
      width: 100,
      hideOnMobile: true,
      render: (r) =>
        r.ownerUserId ? (
          <DSBadge variant="brand" label="Assigné" />
        ) : (
          <Typography sx={{ color: colors.text[2], fontSize: '12px' }}>Non assigné</Typography>
        ),
    },
    {
      key: 'location',
      label: 'Localisation',
      width: 150,
      hideOnMobile: true,
      render: (r) => (
        <Typography sx={{ fontSize: '13px', color: colors.text[1] }}>
          {[r.wilaya, r.quartier].filter(Boolean).join(' · ') || '—'}
        </Typography>
      ),
    },
    {
      key: 'nextAction',
      label: 'Prochaine action',
      width: 130,
      hideOnMobile: true,
      render: (r) => (
        <Tooltip title={r.nextActionAt ? new Date(r.nextActionAt).toLocaleString('fr-FR') : ''} arrow>
          <Typography
            sx={{
              fontSize: '13px',
              color: r.nextActionAt && new Date(r.nextActionAt) < new Date() ? colors.state.error : colors.text[1],
            }}
          >
            {relativeDate(r.nextActionAt)}
          </Typography>
        </Tooltip>
      ),
    },
    {
      key: 'updatedAt',
      label: 'MAJ',
      width: 80,
      hideOnMobile: true,
      render: (r) => (
        <Typography sx={{ fontSize: '12px', color: colors.text[2] }}>{shortDate(r.updatedAt)}</Typography>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title="Leads"
        actions={
          <DSButton leftIcon={<Plus size={iconSize.action} weight="bold" />} onClick={() => router.push('/app/crm/leads/new')}>
            Nouveau lead
          </DSButton>
        }
      />
      <DataListFilters
        search={{ value: q, onChange: setQ, placeholder: 'Rechercher…' }}
        onReset={handleReset}
      >
        <Select
          size="small"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          displayEmpty
          sx={{ minWidth: 120, fontSize: '13px' }}
        >
          <MenuItem value="">Statut</MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s} sx={{ fontSize: '13px' }}>{STATUS_LABELS[s] ?? s}</MenuItem>
          ))}
        </Select>
        <Select
          size="small"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          displayEmpty
          sx={{ minWidth: 100, fontSize: '13px' }}
        >
          <MenuItem value="">Priorité</MenuItem>
          {PRIORITY_OPTIONS.map((p) => (
            <MenuItem key={p} value={p} sx={{ fontSize: '13px' }}>{p}</MenuItem>
          ))}
        </Select>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={nextAction}
          onChange={(_, v) => setNextAction(v ?? '')}
          sx={{
            '& .MuiToggleButton-root': {
              fontSize: '12px', textTransform: 'none', px: spacing[3],
              color: colors.text[1], borderColor: colors.border[0],
              '&.Mui-selected': { backgroundColor: `${colors.brand.primary}1A`, color: colors.brand.primary, borderColor: `${colors.brand.primary}40` },
            },
          }}
        >
          <ToggleButton value="">Tous</ToggleButton>
          <ToggleButton value="overdue">En retard</ToggleButton>
          <ToggleButton value="today">Aujourd&apos;hui</ToggleButton>
          <ToggleButton value="week">Semaine</ToggleButton>
        </ToggleButtonGroup>
      </DataListFilters>

      {error ? (
        <DSErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: () => fetchLeads(true) }} />
      ) : (
        <DSCard>
          <DSTable<Lead>
            columns={columns}
            rows={items}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/app/crm/leads/${r.id}`)}
            loading={loading && items.length === 0}
            empty={{
              title: 'Aucun lead',
              desc: 'Commencez par créer un premier lead.',
              cta: { label: 'Créer un lead', onClick: () => router.push('/app/crm/leads/new') },
            }}
          />
          <DataListLoadMore hasMore={hasMore} loading={loading} onLoadMore={() => fetchLeads()} />
        </DSCard>
      )}
    </PageBody>
  );
}
