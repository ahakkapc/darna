'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import {
  Trash, PencilSimple, Trophy, XCircle, UserPlus,
  Note, Phone, MapPin, Clock, CaretDown,
  File as FileIcon, UploadSimple, CheckCircle,
} from '@phosphor-icons/react';
import {
  PageBody, PageHeader,
  DSButton, DSCard, DSBadge, DSStatusBadge, DSTabs, DSModal,
  DSErrorState, DSNotFoundState, DataListLoadMore,
  colors, spacing, iconSize,
} from '@/design-system';
import DDateTimePicker from '@/components/ui/DDateTimePicker';
import { useToast } from '@/components/ui/DToast';
import { http, ApiError } from '@/lib/http';

interface Lead {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  priority: string;
  type: string;
  ownerUserId: string | null;
  wilaya: string | null;
  commune: string | null;
  quartier: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  propertyType: string | null;
  surfaceMin: number | null;
  notes: string | null;
  tagsJson: string[] | null;
  nextActionAt: string | null;
  sourceType: string | null;
  externalProvider: string | null;
  sourceMetaJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  relations?: { id: string; type: string; targetLeadId: string }[];
}

interface Activity {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  createdAt: string;
  createdByUserId: string;
  happenedAt: string | null;
  payloadJson: Record<string, unknown> | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  assigneeUserId: string | null;
  completedAt: string | null;
}

interface Doc {
  id: string;
  title: string;
  kind: string;
  createdAt: string;
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchLead = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get<Lead>(`/crm/leads/${id}`);
      setLead(res);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchLead(); }, [fetchLead]);

  const handleMarkWon = async () => {
    try {
      await http.post(`/crm/leads/${id}/mark-won`, {});
      toast('Lead marqué comme gagné', 'success');
      fetchLead();
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  const handleMarkLost = async () => {
    try {
      await http.post(`/crm/leads/${id}/mark-lost`, { lostReason: 'Perdu' });
      toast('Lead marqué comme perdu', 'info');
      fetchLead();
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  const handleDelete = async () => {
    try {
      await http.delete(`/crm/leads/${id}`);
      toast('Lead supprimé', 'info');
      router.push('/app/crm/leads');
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: spacing[8] }}><CircularProgress /></Box>;
  if (error?.status === 404 || !lead) return <DSNotFoundState cta={{ label: 'Retour', onClick: () => router.push('/app/crm/leads') }} />;
  if (error?.status === 403) return <PageBody><PageHeader title="Lead" /><Typography>Accès interdit</Typography></PageBody>;
  if (error) return <DSErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: fetchLead }} />;

  return (
    <PageBody>
      <PageHeader
        title={lead.fullName}
        breadcrumbs={[{ label: 'CRM', href: '/app/crm/leads' }, { label: 'Leads', href: '/app/crm/leads' }, { label: lead.fullName }]}
        actions={
          <Box sx={{ display: 'flex', gap: spacing[2], flexWrap: 'wrap', alignItems: 'center' }}>
            <DSStatusBadge status={lead.status} />
            <DSBadge variant={lead.priority === 'HIGH' ? 'warn' : lead.priority === 'URGENT' ? 'danger' : 'neutral'} label={lead.priority} />
            <DSButton variant="secondary" size="sm" leftIcon={<Trophy size={iconSize.action} />} onClick={handleMarkWon}>Gagné</DSButton>
            <DSButton variant="secondary" size="sm" leftIcon={<XCircle size={iconSize.action} />} onClick={handleMarkLost}>Perdu</DSButton>
            <DSButton variant="danger" size="sm" confirm={{ title: 'Supprimer ce lead ?', body: 'Cette action est irréversible.', confirmLabel: 'Supprimer' }} onClick={handleDelete}>
              <Trash size={iconSize.action} />
            </DSButton>
          </Box>
        }
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 380px' }, gap: spacing[6] }}>
        {/* Main */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: spacing[6] }}>
          <TimelineSection leadId={id} />
          <PlanningSection leadId={id} />
          <RelancesSection leadId={id} />
          <TasksSection leadId={id} />
          <DocumentsSection leadId={id} />
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
          <ContactCard lead={lead} />
          <CriteriaCard lead={lead} />
          <TagsCard tags={lead.tagsJson ?? []} />
          <NextActionCard leadId={id} value={lead.nextActionAt} onUpdate={fetchLead} />
        </Box>
      </Box>
    </PageBody>
  );
}

/* ─── TIMELINE ─────────────────────────────────────── */
function TimelineSection({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<Activity[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const typeFilter = ['', 'NOTE', 'CALL', 'VISIT'][tab] ?? '';

  const fetchActivities = useCallback(async (reset?: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '10');
      if (typeFilter) params.set('type', typeFilter);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await http.get<{ items: Activity[]; page: { hasMore: boolean; nextCursor?: string } }>(
        `/crm/leads/${leadId}/activities?${params}`,
      );
      setItems(reset ? res.items : (p) => [...p, ...res.items]);
      setCursor(res.page.nextCursor);
      setHasMore(res.page.hasMore);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [leadId, typeFilter, cursor]);

  useEffect(() => { setCursor(undefined); fetchActivities(true); }, [leadId, typeFilter]);

  const [noteText, setNoteText] = useState('');
  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await http.post(`/crm/leads/${leadId}/activities`, { type: 'NOTE', body: noteText });
      setNoteText('');
      toast('Note ajoutée', 'success');
      setCursor(undefined);
      fetchActivities(true);
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  return (
    <DSCard title="Timeline">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 'var(--space-16)', minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '13px', textTransform: 'none' } }}>
        <Tab label="Tous" />
        <Tab label="Notes" />
        <Tab label="Appels" />
        <Tab label="Visites" />
      </Tabs>

      {/* Composer: Note */}
      <Box sx={{ display: 'flex', gap: 'var(--space-8)', mb: 'var(--space-16)' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Ajouter une note…"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
        />
        <Button variant="contained" size="small" onClick={handleAddNote} disabled={!noteText.trim()}>
          <Note size={16} />
        </Button>
      </Box>

      {/* Items */}
      {items.map((a) => (
        <Box key={a.id} sx={{ display: 'flex', gap: 'var(--space-12)', py: 'var(--space-12)', borderBottom: '1px solid var(--line)' }}>
          <Box sx={{ color: 'var(--muted)', mt: '2px' }}>
            {a.type === 'CALL' ? <Phone size={18} weight="duotone" /> :
             a.type === 'VISIT' ? <MapPin size={18} weight="duotone" /> :
             a.type === 'SYSTEM_EVENT' ? <Clock size={18} weight="duotone" /> :
             <Note size={18} weight="duotone" />}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '13px', fontWeight: 600 }}>
              {a.title ?? a.type}
              <Typography component="span" sx={{ color: 'var(--muted-2)', fontSize: '11px', ml: 'var(--space-8)' }}>
                {new Date(a.createdAt).toLocaleString('fr-FR')}
              </Typography>
            </Typography>
            {a.body && <Typography sx={{ color: 'var(--muted)', fontSize: '13px', mt: '2px' }}>{a.body}</Typography>}
          </Box>
        </Box>
      ))}
      {!loading && items.length === 0 && (
        <Typography sx={{ color: 'var(--muted-2)', py: 'var(--space-16)', textAlign: 'center', fontSize: '13px' }}>
          Aucune activité
        </Typography>
      )}
      <DataListLoadMore hasMore={hasMore} loading={loading} onLoadMore={() => fetchActivities()} />
    </DSCard>
  );
}

/* ─── TASKS ────────────────────────────────────────── */
function TasksSection({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState('MEDIUM');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get<{ items: Task[] }>(`/crm/tasks?scope=lead:${leadId}&limit=50`);
      setTasks(res.items);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleAdd = async () => {
    if (!title.trim()) return;
    try {
      const body: Record<string, unknown> = { title, priority };
      if (dueAt) body.dueAt = dueAt;
      await http.post(`/crm/leads/${leadId}/tasks`, body);
      setTitle('');
      setDueAt('');
      toast('Tâche créée', 'success');
      fetchTasks();
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  const toggleDone = async (task: Task) => {
    try {
      const newStatus = task.status === 'DONE' ? 'OPEN' : 'DONE';
      await http.patch(`/crm/tasks/${task.id}`, { status: newStatus });
      fetchTasks();
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  return (
    <DSCard title="Tâches">
      {/* Quick add */}
      <Box sx={{ display: 'flex', gap: 'var(--space-8)', mb: 'var(--space-16)', flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Nouvelle tâche…" value={title} onChange={(e) => setTitle(e.target.value)} sx={{ flex: 1, minWidth: 200 }} />
        <Box sx={{ width: 160 }}>
          <DDateTimePicker value={dueAt} onChange={setDueAt} label="Échéance" />
        </Box>
        <Select size="small" value={priority} onChange={(e) => setPriority(e.target.value)} sx={{ minWidth: 90, fontSize: '13px' }}>
          <MenuItem value="LOW">Low</MenuItem>
          <MenuItem value="MEDIUM">Medium</MenuItem>
          <MenuItem value="HIGH">High</MenuItem>
          <MenuItem value="URGENT">Urgent</MenuItem>
        </Select>
        <Button variant="contained" size="small" onClick={handleAdd} disabled={!title.trim()}>Ajouter</Button>
      </Box>

      {/* List */}
      {tasks.map((t) => {
        const overdue = t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'DONE';
        return (
          <Box
            key={t.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-8)',
              py: 'var(--space-8)',
              borderBottom: '1px solid var(--line)',
              ...(overdue ? { backgroundColor: 'rgba(255,77,79,0.04)' } : {}),
            }}
          >
            <Checkbox
              size="small"
              checked={t.status === 'DONE'}
              onChange={() => toggleDone(t)}
              sx={{ color: 'var(--muted)', '&.Mui-checked': { color: 'var(--success)' } }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: '13px', textDecoration: t.status === 'DONE' ? 'line-through' : 'none', color: t.status === 'DONE' ? 'var(--muted-2)' : 'var(--text)' }}>
                {t.title}
              </Typography>
              {t.dueAt && (
                <Typography sx={{ fontSize: '11px', color: overdue ? 'var(--danger)' : 'var(--muted-2)' }}>
                  {new Date(t.dueAt).toLocaleString('fr-FR')}
                </Typography>
              )}
            </Box>
            <DSBadge variant={t.priority === 'HIGH' ? 'warn' : t.priority === 'URGENT' ? 'danger' : 'neutral'} label={t.priority} />
          </Box>
        );
      })}
      {!loading && tasks.length === 0 && (
        <Typography sx={{ color: 'var(--muted-2)', py: 'var(--space-16)', textAlign: 'center', fontSize: '13px' }}>
          Aucune tâche
        </Typography>
      )}
    </DSCard>
  );
}

/* ─── DOCUMENTS ────────────────────────────────────── */
interface DocLink {
  id: string;
  document: { id: string; title: string; kind: string; status: string };
  createdAt: string;
}

function DocumentsSection({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<ApiError | null>(null);

  const fetchDocs = useCallback(async () => {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const links = await http.get<DocLink[]>(`/crm/leads/${leadId}/documents`);
      setDocs(
        links
          .filter((l) => l.document.status === 'ACTIVE')
          .map((l) => ({
            id: l.document.id,
            title: l.document.title,
            kind: l.document.kind,
            createdAt: l.createdAt,
          })),
      );
    } catch (e) {
      if (e instanceof ApiError) setDocsError(e);
    } finally {
      setDocsLoading(false);
    }
  }, [leadId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      // Step 1: Presign
      const presign = await http.post<{ sessionId: string; url: string; storageKey: string }>('/storage/upload/presign', {
        mimeType: file.type,
        sizeBytes: file.size,
        originalFilename: file.name,
      });

      // Step 2: Upload to presigned URL
      await fetch(presign.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });

      // Step 3: Confirm
      await http.post('/storage/upload/confirm', {
        sessionId: presign.sessionId,
        document: { title: file.name },
        link: { targetType: 'LEAD', targetId: leadId },
      });

      toast('Document uploadé', 'success');
      setUploadOpen(false);
      fetchDocs();
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'error');
      else toast('Erreur upload', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <DSCard title="Documents" actions={
      <Button size="small" variant="outlined" startIcon={<UploadSimple size={14} />} onClick={() => setUploadOpen(true)}>
        Upload
      </Button>
    }>
      {docsLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 'var(--space-16)' }}><CircularProgress size={24} /></Box>}
      {docsError && <DSErrorState requestId={docsError.requestId} cta={{ label: 'Réessayer', onClick: fetchDocs }} />}
      {!docsLoading && !docsError && docs.length === 0 && (
        <Typography sx={{ color: 'var(--muted-2)', py: 'var(--space-16)', textAlign: 'center', fontSize: '13px' }}>
          Aucun document attaché
        </Typography>
      )}
      {docs.map((d) => (
        <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)', py: 'var(--space-8)', borderBottom: '1px solid var(--line)' }}>
          <FileIcon size={20} weight="duotone" style={{ color: 'var(--muted)' }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '13px' }}>{d.title}</Typography>
            <Typography sx={{ fontSize: '11px', color: 'var(--muted-2)' }}>{d.kind} · {new Date(d.createdAt).toLocaleDateString('fr-FR')}</Typography>
          </Box>
        </Box>
      ))}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload un document</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              border: '2px dashed var(--line)',
              borderRadius: 'var(--radius-card)',
              p: 'var(--space-32)',
              textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
            }}
            onClick={() => {
              if (uploading) return;
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*,.pdf';
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) handleUpload(f);
              };
              input.click();
            }}
          >
            {uploading ? (
              <CircularProgress size={32} />
            ) : (
              <>
                <UploadSimple size={32} weight="duotone" style={{ color: 'var(--muted)' }} />
                <Typography sx={{ color: 'var(--muted)', mt: 'var(--space-8)' }}>
                  Cliquez pour sélectionner un fichier
                </Typography>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadOpen(false)} disabled={uploading}>Annuler</Button>
        </DialogActions>
      </Dialog>
    </DSCard>
  );
}

/* ─── SIDEBAR CARDS ────────────────────────────────── */
function ContactCard({ lead }: { lead: Lead }) {
  const meta = lead.sourceMetaJson as Record<string, unknown> | null;
  const isMetaLead = lead.sourceType === 'META_LEAD_ADS';
  return (
    <DSCard title="Contact">
      {isMetaLead && (
        <Box sx={{ mb: 'var(--space-8)' }}>
          <Chip
            label="Meta Lead Ads"
            size="small"
            sx={{
              bgcolor: '#1877F2',
              color: '#fff',
              fontWeight: 600,
              fontSize: '11px',
            }}
          />
          {meta?.campaignName ? (
            <Typography sx={{ fontSize: '11px', color: 'var(--muted)', mt: 'var(--space-4)' }}>
              Campagne: {String(meta.campaignName)}
            </Typography>
          ) : null}
          {meta?.formId ? (
            <Typography sx={{ fontSize: '11px', color: 'var(--muted)' }}>
              Formulaire: {meta.formName ? String(meta.formName) : String(meta.formId)}
            </Typography>
          ) : null}
        </Box>
      )}
      <InfoRow label="Téléphone" value={lead.phone ?? '—'} />
      <InfoRow label="Email" value={lead.email ?? '—'} />
      <InfoRow label="Type" value={lead.type} />
      <InfoRow label="Créé le" value={new Date(lead.createdAt).toLocaleDateString('fr-FR')} />
    </DSCard>
  );
}

function CriteriaCard({ lead }: { lead: Lead }) {
  const fmt = (n: number | null) => n != null ? `${n.toLocaleString('fr-FR')} DA` : '—';
  return (
    <DSCard title="Critères">
      <InfoRow label="Budget" value={`${fmt(lead.budgetMin)} — ${fmt(lead.budgetMax)}`} />
      <InfoRow label="Wilaya" value={lead.wilaya ?? '—'} />
      <InfoRow label="Commune" value={lead.commune ?? '—'} />
      <InfoRow label="Quartier" value={lead.quartier ?? '—'} />
      <InfoRow label="Type de bien" value={lead.propertyType ?? '—'} />
      <InfoRow label="Surface min" value={lead.surfaceMin ? `${lead.surfaceMin} m²` : '—'} />
    </DSCard>
  );
}

function TagsCard({ tags }: { tags: string[] }) {
  return (
    <DSCard title="Tags">
      {tags.length === 0 ? (
        <Typography sx={{ color: 'var(--muted-2)', fontSize: '13px' }}>Aucun tag</Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {tags.map((t) => <Chip key={t} label={t} size="small" />)}
        </Box>
      )}
    </DSCard>
  );
}

/* ─── RELANCES (Séquences) ─────────────────────────── */
function RelancesSection({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<Array<{ id: string; sequenceId: string; status: string; startedAt: string; stoppedAt: string | null; nextStepIndex: number; nextStepAt: string | null; sequence?: { id: string; name: string }; runSteps?: Array<{ id: string; orderIndex: number; status: string; scheduledAt: string | null; sentAt: string | null; lastErrorCode: string | null }> }>>([]);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [selectedSeqId, setSelectedSeqId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, seqRes] = await Promise.all([
        http.get<{ items: typeof runs }>(`/crm/leads/${leadId}/sequences`),
        http.get<{ items: typeof sequences }>('/sequences?status=ACTIVE'),
      ]);
      setRuns(runsRes.items);
      setSequences(seqRes.items);
    } catch { /* silent */ }
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const handleStart = async () => {
    try {
      await http.post(`/crm/leads/${leadId}/sequences/start`, { sequenceId: selectedSeqId });
      toast('Séquence démarrée', 'success');
      setStartOpen(false);
      setSelectedSeqId('');
      await load();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast(err.message ?? 'Erreur', 'error');
    }
  };

  const handleStop = async (runId: string) => {
    try {
      await http.post(`/crm/leads/${leadId}/sequences/stop`, { sequenceRunId: runId });
      toast('Séquence arrêtée', 'info');
      await load();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast(err.message ?? 'Erreur', 'error');
    }
  };

  const STATUS_COLOR: Record<string, string> = { RUNNING: 'var(--success)', COMPLETED: 'var(--info)', CANCELED: 'var(--muted)', FAILED: 'var(--danger)' };
  const STEP_COLOR: Record<string, string> = { PENDING: '#999', SCHEDULED: '#2196f3', SENT: '#4caf50', FAILED: '#f44336', SKIPPED: '#ff9800', CANCELED: '#999' };

  return (
    <DSCard
      title="Relances"
      actions={
        <Button size="small" variant="contained" onClick={() => setStartOpen(true)}
          sx={{ textTransform: 'none', fontSize: '12px', backgroundColor: 'var(--brand-copper)', '&:hover': { backgroundColor: 'var(--brand-copper-dark)' } }}>
          Démarrer une séquence
        </Button>
      }
    >
      {loading ? (
        <Typography sx={{ color: 'var(--muted-2)', fontSize: '13px' }}>Chargement…</Typography>
      ) : runs.length === 0 ? (
        <Typography sx={{ color: 'var(--muted-2)', fontSize: '13px' }}>Aucune séquence en cours.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
          {runs.map((run) => (
            <Box key={run.id} sx={{ p: 'var(--space-8)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 'var(--space-4)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: STATUS_COLOR[run.status] ?? 'var(--muted)' }} />
                  <Typography sx={{ fontSize: '13px', fontWeight: 600 }}>{run.sequence?.name ?? 'Séquence'}</Typography>
                  <Chip label={run.status} size="small" sx={{ fontSize: '10px', height: 20 }} />
                </Box>
                {run.status === 'RUNNING' && (
                  <Button size="small" color="error" onClick={() => handleStop(run.id)} sx={{ fontSize: '11px', textTransform: 'none' }}>Stop</Button>
                )}
              </Box>
              <Typography sx={{ fontSize: '11px', color: 'var(--muted-2)' }}>
                Démarré {new Date(run.startedAt).toLocaleString('fr-FR')}
                {run.nextStepAt && run.status === 'RUNNING' ? ` · Prochaine étape: ${new Date(run.nextStepAt).toLocaleString('fr-FR')}` : ''}
              </Typography>
              {run.runSteps && run.runSteps.length > 0 && (
                <Box sx={{ display: 'flex', gap: 'var(--space-4)', mt: 'var(--space-4)', flexWrap: 'wrap' }}>
                  {run.runSteps.map((s) => (
                    <Tooltip key={s.id} title={`Étape ${s.orderIndex + 1}: ${s.status}${s.lastErrorCode ? ` (${s.lastErrorCode})` : ''}`}>
                      <Box sx={{ width: 20, height: 6, borderRadius: 3, backgroundColor: STEP_COLOR[s.status] ?? '#999' }} />
                    </Tooltip>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Dialog open={startOpen} onClose={() => setStartOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Démarrer une séquence</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Select value={selectedSeqId} onChange={(e) => setSelectedSeqId(e.target.value)} fullWidth size="small" displayEmpty>
            <MenuItem value="" disabled>Choisir une séquence…</MenuItem>
            {sequences.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </Select>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStartOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleStart} disabled={!selectedSeqId}>Démarrer</Button>
        </DialogActions>
      </Dialog>
    </DSCard>
  );
}

/* ─── PLANNING ─────────────────────────────────────── */
function PlanningSection({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<{ id: string; type: string; status: string; title: string; startAt: string; endAt: string; assigneeUserId: string; wilaya: string | null; commune: string | null; quartier: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get<{ items: typeof items }>(`/planning/leads/${leadId}/events`);
      setItems(res.items);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const TYPE_LABEL: Record<string, string> = { VISIT: 'Visite', SIGNING: 'Signature', CALL_SLOT: 'Appels', MEETING: 'RDV', OTHER: 'Autre' };
  const TYPE_COLOR: Record<string, string> = { VISIT: 'var(--brand-copper)', SIGNING: 'var(--success)', CALL_SLOT: 'var(--info)', MEETING: '#7C3AED', OTHER: 'var(--muted)' };

  return (
    <DSCard
      title="Planning"
      actions={
        <Button
          size="small"
          variant="contained"
          onClick={() => setModalOpen(true)}
          sx={{ textTransform: 'none', fontSize: '12px', backgroundColor: 'var(--brand-copper)', '&:hover': { backgroundColor: 'var(--brand-copper-dark)' } }}
        >
          Planifier une visite
        </Button>
      }
    >
      {loading ? (
        <Typography sx={{ color: 'var(--muted-2)', fontSize: '13px' }}>Chargement…</Typography>
      ) : items.length === 0 ? (
        <Typography sx={{ color: 'var(--muted-2)', fontSize: '13px' }}>Aucun événement planifié.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {items.map((ev) => (
            <Box
              key={ev.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-8)',
                p: 'var(--space-8)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)', '&:hover': { borderColor: 'var(--brand-copper)' },
              }}
            >
              <Box sx={{ width: 4, height: 32, borderRadius: 2, backgroundColor: TYPE_COLOR[ev.type] ?? 'var(--muted)', flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </Typography>
                <Typography sx={{ fontSize: '11px', color: 'var(--muted-2)' }}>
                  {TYPE_LABEL[ev.type] ?? ev.type} · {new Date(ev.startAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {ev.wilaya ? ` · ${ev.wilaya}` : ''}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {modalOpen && (
        <PlanningModalWrapper leadId={leadId} open={modalOpen} onClose={(refresh) => { setModalOpen(false); if (refresh) fetchEvents(); }} />
      )}
    </DSCard>
  );
}

function PlanningModalWrapper({ leadId, open, onClose }: { leadId: string; open: boolean; onClose: (refresh?: boolean) => void }) {
  const [EventFormModal, setMod] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import('@/app/app/planning/EventFormModal').then((m) => setMod(() => m.default));
  }, []);
  if (!EventFormModal) return null;
  return <EventFormModal open={open} event={null} leadId={leadId} onClose={onClose} />;
}

function NextActionCard({ leadId, value, onUpdate }: { leadId: string; value: string | null; onUpdate: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [dateVal, setDateVal] = useState(value ?? '');

  const save = async () => {
    try {
      await http.patch(`/crm/leads/${leadId}`, { nextActionAt: dateVal || null });
      toast('Prochaine action mise à jour', 'success');
      setEditing(false);
      onUpdate();
    } catch (e) { if (e instanceof ApiError) toast(e.message, 'error'); }
  };

  return (
    <DSCard title="Prochaine action" actions={!editing ? <Button size="small" onClick={() => setEditing(true)} sx={{ fontSize: '12px' }}>Modifier</Button> : undefined}>
      {editing ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          <DDateTimePicker value={dateVal} onChange={setDateVal} />
          <Box sx={{ display: 'flex', gap: 'var(--space-8)' }}>
            <Button size="small" variant="contained" onClick={save}>Sauver</Button>
            <Button size="small" variant="text" onClick={() => setEditing(false)}>Annuler</Button>
          </Box>
        </Box>
      ) : (
        <Typography sx={{ color: value ? 'var(--text)' : 'var(--muted-2)', fontSize: '14px' }}>
          {value ? new Date(value).toLocaleString('fr-FR') : 'Non définie'}
        </Typography>
      )}
    </DSCard>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 'var(--space-4)' }}>
      <Typography sx={{ color: 'var(--muted)', fontSize: '13px' }}>{label}</Typography>
      <Typography sx={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );
}
