'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import CircularProgress from '@mui/material/CircularProgress';
import { ArrowLeft, CheckCircle, CalendarBlank, User } from '@phosphor-icons/react';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import DPriorityPill from '@/components/ui/DPriorityPill';
import DDateTimePicker from '@/components/ui/DDateTimePicker';
import { DErrorState, DNotFoundState } from '@/components/ui/DStates';
import { useToast } from '@/components/ui/DToast';
import { http, ApiError } from '@/lib/http';

interface TaskDetail {
  id: string;
  leadId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  completedAt: string | null;
  assigneeUserId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lead?: { ownerUserId: string | null };
  reminders?: { id: string; remindAt: string; status: string }[];
}

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'];
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminé',
  CANCELED: 'Annulé',
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const [editingDueAt, setEditingDueAt] = useState(false);
  const [dueAtVal, setDueAtVal] = useState('');

  const fetchTask = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await http.get<TaskDetail>(`/crm/tasks/${id}`);
      setTask(res);
      setDueAtVal(res.dueAt ?? '');
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      await http.patch(`/crm/tasks/${id}`, { status: newStatus });
      toast(`Statut mis à jour : ${STATUS_LABELS[newStatus] ?? newStatus}`, 'success');
      fetchTask();
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  const handleSaveDueAt = async () => {
    try {
      await http.patch(`/crm/tasks/${id}`, { dueAt: dueAtVal || null });
      toast('Échéance mise à jour', 'success');
      setEditingDueAt(false);
      fetchTask();
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  const handleMarkDone = async () => {
    await handleStatusChange('DONE');
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 'var(--space-32)' }}><CircularProgress /></Box>;
  if (error?.status === 404 || !task) return <DNotFoundState cta={{ label: 'Retour aux tâches', onClick: () => router.push('/app/crm/tasks') }} />;
  if (error) return <DErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: fetchTask }} />;

  const overdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'DONE' && task.status !== 'CANCELED';

  return (
    <DPage
      title={task.title}
      actions={
        <Box sx={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            size="small"
            variant="text"
            startIcon={<ArrowLeft size={14} />}
            onClick={() => router.push('/app/crm/tasks')}
          >
            Retour
          </Button>
          {task.status !== 'DONE' && (
            <Button
              size="small"
              variant="contained"
              startIcon={<CheckCircle size={14} />}
              onClick={handleMarkDone}
            >
              Marquer terminé
            </Button>
          )}
        </Box>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 380px' }, gap: 'var(--space-24)' }}>
        {/* Main */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
          {/* Info card */}
          <DCard title="Détails">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
              <InfoRow label="Statut">
                <Select
                  size="small"
                  value={task.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  sx={{ minWidth: 140, fontSize: '13px' }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <MenuItem key={s} value={s} sx={{ fontSize: '13px' }}>{STATUS_LABELS[s] ?? s}</MenuItem>
                  ))}
                </Select>
              </InfoRow>
              <InfoRow label="Priorité">
                <DPriorityPill priority={task.priority} />
              </InfoRow>
              <InfoRow label="Échéance">
                {editingDueAt ? (
                  <Box sx={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center' }}>
                    <Box sx={{ width: 200 }}>
                      <DDateTimePicker value={dueAtVal} onChange={setDueAtVal} />
                    </Box>
                    <Button size="small" variant="contained" onClick={handleSaveDueAt}>Sauver</Button>
                    <Button size="small" variant="text" onClick={() => { setEditingDueAt(false); setDueAtVal(task.dueAt ?? ''); }}>Annuler</Button>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center' }}>
                    <Typography sx={{
                      fontSize: '13px',
                      color: overdue ? 'var(--danger)' : 'var(--text)',
                      fontWeight: overdue ? 600 : 400,
                    }}>
                      {task.dueAt ? new Date(task.dueAt).toLocaleString('fr-FR') : 'Non définie'}
                    </Typography>
                    <Button size="small" variant="text" onClick={() => setEditingDueAt(true)} sx={{ fontSize: '12px', minWidth: 0 }}>
                      <CalendarBlank size={14} />
                    </Button>
                  </Box>
                )}
              </InfoRow>
              {task.completedAt && (
                <InfoRow label="Terminé le">
                  <Typography sx={{ fontSize: '13px' }}>{new Date(task.completedAt).toLocaleString('fr-FR')}</Typography>
                </InfoRow>
              )}
              <InfoRow label="Créé le">
                <Typography sx={{ fontSize: '13px' }}>{new Date(task.createdAt).toLocaleString('fr-FR')}</Typography>
              </InfoRow>
            </Box>
          </DCard>

          {/* Description */}
          {task.description && (
            <DCard title="Description">
              <Typography sx={{ fontSize: '13px', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                {task.description}
              </Typography>
            </DCard>
          )}

          {/* Reminders */}
          {task.reminders && task.reminders.length > 0 && (
            <DCard title="Rappels planifiés">
              {task.reminders.map((r) => (
                <Box key={r.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 'var(--space-4)' }}>
                  <Typography sx={{ fontSize: '13px' }}>{new Date(r.remindAt).toLocaleString('fr-FR')}</Typography>
                  <Chip label={r.status} size="small" sx={{ height: 20, fontSize: '10px' }} />
                </Box>
              ))}
            </DCard>
          )}
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
          {/* Lead link */}
          <DCard title="Lead associé">
            <Button
              size="small"
              variant="outlined"
              fullWidth
              onClick={() => router.push(`/app/crm/leads/${task.leadId}`)}
            >
              Voir le lead
            </Button>
          </DCard>

          {/* Assignee info */}
          <DCard title="Assignation">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
              <User size={16} weight="duotone" style={{ color: 'var(--muted)' }} />
              <Typography sx={{ fontSize: '13px' }}>
                {task.assigneeUserId ? `Utilisateur ${task.assigneeUserId.slice(0, 8)}…` : 'Non assigné'}
              </Typography>
            </Box>
          </DCard>
        </Box>
      </Box>
    </DPage>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 'var(--space-4)' }}>
      <Typography sx={{ color: 'var(--muted)', fontSize: '13px', minWidth: 100 }}>{label}</Typography>
      <Box>{children}</Box>
    </Box>
  );
}
