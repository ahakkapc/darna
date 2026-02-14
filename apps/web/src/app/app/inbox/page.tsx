'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Avatar from '@mui/material/Avatar';
import CircularProgress from '@mui/material/CircularProgress';
import {
  ChatCircle,
  PaperPlaneRight,
  Check,
  Clock,
  X,
  UserPlus,
  LinkSimple,
  Plus,
  ArrowClockwise,
  Eye,
  Warning,
} from '@phosphor-icons/react';
import { inboxApi, InboxThread, InboxMessage, ThreadDetail } from '../../../lib/inbox';
import { useToast } from '../../../components/ui/DToast';
import {
  DSButton, DSBadge, DSCard, DSModal, DSInput, DSEmptyState,
  colors, spacing, radius, iconSize,
} from '@/design-system';

function useT() {
  const { toast } = useToast();
  return {
    success: (msg: string) => toast(msg, 'success'),
    error: (msg: string) => toast(msg, 'error'),
    info: (msg: string) => toast(msg, 'info'),
  };
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  PENDING: 'En attente',
  CLOSED: 'Clôturé',
};

/* ──────────────────────────────────────────────────────── */
/* Main Page                                               */
/* ──────────────────────────────────────────────────────── */

export default function InboxPage() {
  const toast = useT();

  // Thread list state
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Selected thread state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Composer
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  // Dialogs
  const [linkLeadOpen, setLinkLeadOpen] = useState(false);
  const [linkLeadId, setLinkLeadId] = useState('');
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ─── Load threads ──────────────────────────────────── */

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (assignedFilter !== 'all') params.assigned = assignedFilter;
      if (search) params.q = search;
      const res = await inboxApi.listThreads(params);
      setThreads(res.items);
    } catch {
      toast.error('Erreur chargement threads');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, assignedFilter, search, toast]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  /* ─── Load thread detail ────────────────────────────── */

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await inboxApi.getThread(id);
      setDetail(res);
      // Mark read
      inboxApi.markRead(id).catch(() => {});
    } catch {
      toast.error('Erreur chargement conversation');
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages]);

  /* ─── Send message ──────────────────────────────────── */

  const handleSend = async () => {
    if (!selectedId || !composerText.trim()) return;
    setSending(true);
    try {
      await inboxApi.sendMessage(selectedId, composerText.trim());
      setComposerText('');
      await loadDetail(selectedId);
      await loadThreads();
      toast.success('Message envoyé');
    } catch {
      toast.error('Erreur envoi message');
    } finally {
      setSending(false);
    }
  };

  /* ─── Actions ───────────────────────────────────────── */

  const handleStatusChange = async (status: string) => {
    if (!selectedId) return;
    try {
      await inboxApi.changeStatus(selectedId, status);
      await loadDetail(selectedId);
      await loadThreads();
      toast.success(`Statut → ${STATUS_LABELS[status] ?? status}`);
    } catch {
      toast.error('Erreur changement statut');
    }
  };

  const handleClaim = async () => {
    if (!selectedId) return;
    try {
      await inboxApi.claim(selectedId);
      await loadDetail(selectedId);
      await loadThreads();
      toast.success('Thread réclamé');
    } catch (e: any) {
      toast.error(e?.code === 'INBOX_THREAD_ALREADY_ASSIGNED' ? 'Déjà assigné' : 'Erreur');
    }
  };

  const handleLinkLead = async () => {
    if (!selectedId || !linkLeadId.trim()) return;
    try {
      await inboxApi.linkLead(selectedId, linkLeadId.trim());
      setLinkLeadOpen(false);
      setLinkLeadId('');
      await loadDetail(selectedId);
      toast.success('Lead lié');
    } catch {
      toast.error('Erreur liaison lead');
    }
  };

  const handleCreateLead = async () => {
    if (!selectedId || !newLeadName.trim()) return;
    try {
      await inboxApi.createLead(selectedId, {
        fullName: newLeadName.trim(),
        email: newLeadEmail.trim() || undefined,
      });
      setCreateLeadOpen(false);
      setNewLeadName('');
      setNewLeadEmail('');
      await loadDetail(selectedId);
      toast.success('Lead créé et lié');
    } catch {
      toast.error('Erreur création lead');
    }
  };

  /* ──────────────────────────────────────────────────── */
  /* Render                                               */
  /* ──────────────────────────────────────────────────── */

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* ─── Column 1: Thread List ──────────────────────── */}
      <Box
        sx={{
          width: 340,
          minWidth: 340,
          borderRight: `1px solid ${colors.border[0]}`,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: colors.bg[1],
        }}
      >
        {/* Header */}
        <Box sx={{ p: spacing[4], borderBottom: `1px solid ${colors.border[0]}` }}>
          <Typography sx={{ fontWeight: 700, fontSize: '18px', mb: spacing[2] }}>
            Inbox WhatsApp
          </Typography>
          <TextField
            size="small"
            placeholder="Rechercher…"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: spacing[2] }}
          />
          <Box sx={{ display: 'flex', gap: spacing[1], flexWrap: 'wrap' }}>
            {['OPEN', 'PENDING', 'CLOSED', 'all'].map((s) => (
              <Box key={s} onClick={() => setStatusFilter(s)} sx={{ cursor: 'pointer' }}>
                <DSBadge
                  variant={statusFilter === s ? 'brand' : 'neutral'}
                  label={s === 'all' ? 'Tous' : (STATUS_LABELS[s] ?? s)}
                />
              </Box>
            ))}
          </Box>
        </Box>

        {/* Thread list */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: spacing[6] }}>
              <CircularProgress size={24} />
            </Box>
          ) : threads.length === 0 ? (
            <DSEmptyState title="Aucun thread" desc="Aucune conversation trouvée." />
          ) : (
            threads.map((t) => (
              <Box
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                sx={{
                  p: `${spacing[3]} ${spacing[4]}`,
                  cursor: 'pointer',
                  borderBottom: `1px solid ${colors.border[0]}`,
                  bgcolor: selectedId === t.id ? `${colors.brand.primary}14` : 'transparent',
                  '&:hover': { bgcolor: `${colors.brand.primary}0A` },
                  transition: 'background-color 0.1s ease',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: spacing[2], mb: spacing[1] }}>
                  <Avatar sx={{ width: 32, height: 32, bgcolor: colors.brand.primary, color: colors.bg[0], fontSize: '13px' }}>
                    {(t.displayName ?? '?')[0].toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.displayName ?? t.phoneHash?.slice(0, 8) ?? 'Unknown'}
                    </Typography>
                  </Box>
                  <Badge badgeContent={t.unreadCount} color="error" max={99}>
                    <Box />
                  </Badge>
                </Box>
                <Typography sx={{ fontSize: '12px', color: colors.text[1], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.lastMessagePreview ?? '—'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: spacing[1], mt: spacing[1] }}>
                  <DSBadge
                    variant={t.status === 'OPEN' ? 'success' : t.status === 'PENDING' ? 'warn' : 'neutral'}
                    label={STATUS_LABELS[t.status] ?? t.status}
                    size="sm"
                  />
                  {t.unreplied && <DSBadge variant="danger" label="Sans réponse" size="sm" />}
                  {t.slaBreachedAt && <DSBadge variant="danger" label="SLA" size="sm" icon={<Warning size={10} />} />}
                  {t.lastMessageAt && (
                    <Typography sx={{ fontSize: '10px', color: colors.text[2], ml: 'auto' }}>
                      {new Date(t.lastMessageAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* ─── Column 2: Conversation ───────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: colors.bg[0] }}>
        {!selectedId ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ textAlign: 'center' }}>
              <ChatCircle size={iconSize.xxl} weight="duotone" color={colors.text[2]} />
              <Typography sx={{ color: colors.text[1], mt: spacing[2] }}>
                Sélectionnez une conversation
              </Typography>
            </Box>
          </Box>
        ) : detailLoading ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={32} />
          </Box>
        ) : detail ? (
          <>
            {/* Thread header */}
            <Box sx={{ p: `${spacing[3]} ${spacing[4]}`, borderBottom: `1px solid ${colors.border[0]}`, display: 'flex', alignItems: 'center', gap: spacing[2] }}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: colors.brand.primary, color: colors.bg[0] }}>
                {(detail.thread.displayName ?? '?')[0].toUpperCase()}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '14px' }}>
                  {detail.thread.displayName ?? 'Unknown'}
                </Typography>
                <Typography sx={{ fontSize: '11px', color: colors.text[1] }}>
                  {detail.thread.phoneE164 ? `${detail.thread.phoneE164.slice(0, 4)}****${detail.thread.phoneE164.slice(-3)}` : '—'}
                </Typography>
              </Box>
              {/* Quick actions */}
              <IconButton size="small" title="Marquer en attente" onClick={() => handleStatusChange('PENDING')}>
                <Clock size={iconSize.action} />
              </IconButton>
              <IconButton size="small" title="Clôturer" onClick={() => handleStatusChange('CLOSED')}>
                <X size={iconSize.action} />
              </IconButton>
              <IconButton size="small" title="Réouvrir" onClick={() => handleStatusChange('OPEN')}>
                <ArrowClockwise size={iconSize.action} />
              </IconButton>
              {!detail.thread.assignedToUserId && (
                <DSButton variant="secondary" size="sm" leftIcon={<UserPlus size={iconSize.action} />} onClick={handleClaim}>
                  Réclamer
                </DSButton>
              )}
            </Box>

            {/* Messages */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: spacing[4], display: 'flex', flexDirection: 'column', gap: spacing[2] }}>
              {detail.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </Box>

            {/* Composer */}
            {detail.thread.status !== 'CLOSED' && (
              <Box sx={{ p: `${spacing[3]} ${spacing[4]}`, borderTop: `1px solid ${colors.border[0]}`, display: 'flex', gap: spacing[2] }}>
                <TextField
                  size="small"
                  placeholder="Écrire un message…"
                  fullWidth
                  multiline
                  maxRows={4}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <IconButton
                  onClick={handleSend}
                  disabled={sending || !composerText.trim()}
                  sx={{ color: colors.brand.primary }}
                >
                  <PaperPlaneRight size={iconSize.nav} weight="fill" />
                </IconButton>
              </Box>
            )}
          </>
        ) : null}
      </Box>

      {/* ─── Column 3: Lead Panel ───────────────────────── */}
      <Box
        sx={{
          width: 320,
          minWidth: 320,
          borderLeft: `1px solid ${colors.border[0]}`,
          bgcolor: colors.bg[1],
          overflowY: 'auto',
          p: spacing[4],
        }}
      >
        {detail ? (
          detail.leadSummary ? (
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '14px', mb: spacing[3] }}>
                Lead lié
              </Typography>
              <DSCard>
                <Typography sx={{ fontWeight: 600, fontSize: '14px' }}>
                  {detail.leadSummary.fullName}
                </Typography>
                <Box sx={{ mt: spacing[1], display: 'flex', alignItems: 'center', gap: spacing[2] }}>
                  <DSBadge variant={detail.leadSummary.status === 'WON' ? 'success' : detail.leadSummary.status === 'LOST' ? 'danger' : 'info'} label={detail.leadSummary.status} size="sm" />
                </Box>
                {detail.leadSummary.phone && (
                  <Typography sx={{ fontSize: '12px', color: colors.text[1], mt: spacing[1] }}>
                    Tél: {detail.leadSummary.phone.slice(0, 4)}****
                  </Typography>
                )}
              </DSCard>
              <Box sx={{ mt: spacing[3] }}>
                <DSButton variant="secondary" size="sm" fullWidth leftIcon={<Eye size={iconSize.action} />} onClick={() => window.location.href = `/app/crm/leads/${detail.leadSummary!.id}`}>
                  Ouvrir fiche lead
                </DSButton>
              </Box>
            </Box>
          ) : (
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '14px', mb: spacing[3] }}>
                Aucun lead lié
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: spacing[2] }}>
                <DSButton variant="secondary" size="sm" fullWidth leftIcon={<Plus size={iconSize.action} />} onClick={() => setCreateLeadOpen(true)}>
                  Créer un lead
                </DSButton>
                <DSButton variant="secondary" size="sm" fullWidth leftIcon={<LinkSimple size={iconSize.action} />} onClick={() => setLinkLeadOpen(true)}>
                  Lier un lead existant
                </DSButton>
              </Box>
            </Box>
          )
        ) : (
          <Box sx={{ textAlign: 'center', mt: spacing[6] }}>
            <Typography sx={{ color: colors.text[1], fontSize: '13px' }}>
              Sélectionnez un thread
            </Typography>
          </Box>
        )}
      </Box>

      {/* ─── Link Lead Dialog ───────────────────────── */}
      <DSModal open={linkLeadOpen} onClose={() => setLinkLeadOpen(false)} title="Lier un lead existant" maxWidth="xs" actions={
        <>
          <DSButton variant="ghost" onClick={() => setLinkLeadOpen(false)}>Annuler</DSButton>
          <DSButton onClick={handleLinkLead} disabled={!linkLeadId.trim()}>Lier</DSButton>
        </>
      }>
        <DSInput label="Lead ID" value={linkLeadId} onChange={setLinkLeadId} placeholder="UUID du lead" />
      </DSModal>

      {/* ─── Create Lead Dialog ─────────────────────── */}
      <DSModal open={createLeadOpen} onClose={() => setCreateLeadOpen(false)} title="Créer un lead depuis ce thread" maxWidth="xs" actions={
        <>
          <DSButton variant="ghost" onClick={() => setCreateLeadOpen(false)}>Annuler</DSButton>
          <DSButton onClick={handleCreateLead} disabled={!newLeadName.trim()}>Créer et lier</DSButton>
        </>
      }>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
          <DSInput label="Nom complet" value={newLeadName} onChange={setNewLeadName} />
          <DSInput label="Email (optionnel)" value={newLeadEmail} onChange={setNewLeadEmail} />
        </Box>
      </DSModal>
    </Box>
  );
}

/* ──────────────────────────────────────────────────────── */
/* Message Bubble                                           */
/* ──────────────────────────────────────────────────────── */

function MessageBubble({ message }: { message: InboxMessage }) {
  const isInbound = message.direction === 'INBOUND';

  return (
    <Box sx={{ display: 'flex', justifyContent: isInbound ? 'flex-start' : 'flex-end' }}>
      <Box
        sx={{
          maxWidth: '70%',
          p: `${spacing[2]} ${spacing[3]}`,
          borderRadius: radius.md,
          bgcolor: isInbound ? colors.bg[2] : `${colors.brand.primary}26`,
          border: `1px solid ${isInbound ? colors.border[0] : `${colors.brand.primary}4D`}`,
        }}
      >
        <Typography sx={{ fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {message.bodyText ?? ''}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: spacing[1], mt: spacing[1], justifyContent: 'flex-end' }}>
          <Typography sx={{ fontSize: '10px', color: colors.text[2] }}>
            {new Date(message.occurredAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </Typography>
          {!isInbound && <DeliveryChip status={message.status} />}
        </Box>
      </Box>
    </Box>
  );
}

function DeliveryChip({ status }: { status: string }) {
  if (status === 'DELIVERED') return <Check size={12} color={colors.state.success} weight="bold" />;
  if (status === 'SENT') return <Check size={12} color={colors.state.success} />;
  if (status === 'READ') return <Eye size={12} color={colors.brand.secondary} />;
  if (status === 'FAILED') return <X size={12} color={colors.state.error} />;
  return <Clock size={12} color={colors.text[2]} />;
}
