'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Checkbox from '@mui/material/Checkbox';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import DFiltersBar from '@/components/ui/DFiltersBar';
import DTable from '@/components/ui/DTable';
import type { DTableColumn } from '@/components/ui/DTable';
import DCursorLoadMore from '@/components/ui/DCursorLoadMore';
import { DErrorState } from '@/components/ui/DStates';
import DPriorityPill from '@/components/ui/DPriorityPill';
import { http, ApiError } from '@/lib/http';
import { useToast } from '@/components/ui/DToast';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  assigneeUserId: string | null;
  leadId: string;
  completedAt: string | null;
  updatedAt: string;
}

interface ListResponse {
  items: Task[];
  page: { hasMore: boolean; nextCursor?: string; limit: number };
}

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'];

function statusLabel(s: string) {
  const map: Record<string, string> = { OPEN: 'Ouvert', IN_PROGRESS: 'En cours', DONE: 'Terminé', CANCELED: 'Annulé' };
  return map[s] ?? s;
}

export default function TasksListPage() {
  return (
    <Suspense>
      <TasksListInner />
    </Suspense>
  );
}

function TasksListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [priority, setPriority] = useState(searchParams.get('priority') ?? '');
  const [scope, setScope] = useState(searchParams.get('scope') ?? 'my');

  const [items, setItems] = useState<Task[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchTasks = useCallback(async (resetCursor?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      params.set('scope', scope);
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (!resetCursor && cursor) params.set('cursor', cursor);
      const res = await http.get<ListResponse>(`/crm/tasks?${params}`);
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
  }, [q, status, priority, scope, cursor]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursor(undefined);
      fetchTasks(true);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, priority, scope]);

  const handleReset = () => {
    setQ('');
    setStatus('');
    setPriority('');
    setScope('my');
  };

  const toggleDone = async (task: Task) => {
    try {
      const newStatus = task.status === 'DONE' ? 'OPEN' : 'DONE';
      await http.patch(`/crm/tasks/${task.id}`, { status: newStatus });
      setCursor(undefined);
      fetchTasks(true);
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  const columns: DTableColumn<Task>[] = [
    {
      key: 'done',
      label: '',
      width: 40,
      render: (r) => (
        <Checkbox
          size="small"
          checked={r.status === 'DONE'}
          onChange={() => toggleDone(r)}
          sx={{ p: 0, color: 'var(--muted)', '&.Mui-checked': { color: 'var(--success)' } }}
        />
      ),
    },
    {
      key: 'title',
      label: 'Tâche',
      render: (r) => {
        const overdue = r.dueAt && new Date(r.dueAt) < new Date() && r.status !== 'DONE';
        return (
          <Box>
            <Typography sx={{
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: r.status === 'DONE' ? 'line-through' : 'none',
              color: r.status === 'DONE' ? 'var(--muted-2)' : 'var(--text)',
            }}>
              {r.title}
            </Typography>
            {r.dueAt && (
              <Typography sx={{ fontSize: '11px', color: overdue ? 'var(--danger)' : 'var(--muted-2)' }}>
                {new Date(r.dueAt).toLocaleString('fr-FR')}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      key: 'status',
      label: 'Statut',
      width: 100,
      render: (r) => <Chip label={statusLabel(r.status)} size="small" sx={{ height: 22, fontSize: '11px' }} />,
    },
    { key: 'priority', label: 'Priorité', width: 90, render: (r) => <DPriorityPill priority={r.priority} /> },
    {
      key: 'updatedAt',
      label: 'MAJ',
      width: 80,
      render: (r) => (
        <Typography sx={{ fontSize: '12px', color: 'var(--muted-2)' }}>
          {new Date(r.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
        </Typography>
      ),
    },
  ];

  return (
    <DPage title="Tâches">
      <DFiltersBar
        search={{ value: q, onChange: setQ, placeholder: 'Rechercher tâches…' }}
        onReset={handleReset}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={scope}
          onChange={(_, v) => { if (v) setScope(v); }}
          sx={{
            '& .MuiToggleButton-root': {
              fontSize: '12px', textTransform: 'none', px: 'var(--space-12)',
              color: 'var(--muted)', borderColor: 'var(--line)',
              '&.Mui-selected': { backgroundColor: 'rgba(216,162,74,0.10)', color: 'var(--brand-copper)', borderColor: 'rgba(216,162,74,0.25)' },
            },
          }}
        >
          <ToggleButton value="my">Mes tâches</ToggleButton>
          <ToggleButton value="team">Équipe</ToggleButton>
        </ToggleButtonGroup>
        <Select
          size="small"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          displayEmpty
          sx={{ minWidth: 110, fontSize: '13px' }}
        >
          <MenuItem value="">Statut</MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s} sx={{ fontSize: '13px' }}>{statusLabel(s)}</MenuItem>
          ))}
        </Select>
      </DFiltersBar>

      {error ? (
        <DErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: () => fetchTasks(true) }} />
      ) : (
        <DCard>
          <DTable<Task>
            columns={columns}
            rows={items}
            rowKey={(r) => r.id}
            loading={loading && items.length === 0}
            empty={{ title: 'Aucune tâche', desc: 'Les tâches apparaîtront ici.' }}
          />
          <DCursorLoadMore hasMore={hasMore} loading={loading} onLoadMore={() => fetchTasks()} />
        </DCard>
      )}
    </DPage>
  );
}
