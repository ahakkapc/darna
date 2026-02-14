'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ReplayIcon from '@mui/icons-material/Replay';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import { DEmptyState, DErrorState } from '@/components/ui/DStates';
import { useToast } from '@/components/ui/DToast';
import { ApiError } from '@/lib/http';
import { metaLeadgenApi, InboundEvent } from '@/lib/metaLeadgen';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  RECEIVED: { bg: 'var(--info-bg)', fg: 'var(--info)' },
  PROCESSING: { bg: 'var(--warning-bg)', fg: 'var(--warning)' },
  PROCESSED: { bg: 'var(--success-bg)', fg: 'var(--success)' },
  ERROR: { bg: 'var(--error-bg)', fg: 'var(--error)' },
  DEAD: { bg: 'var(--neutral-bg)', fg: 'var(--muted)' },
};

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Reçu',
  PROCESSING: 'En cours',
  PROCESSED: 'Traité',
  ERROR: 'Erreur',
  DEAD: 'Abandonné',
};

export default function MetaLeadgenInboxPage() {
  const { toast } = useToast();
  const [events, setEvents] = useState<InboundEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<InboundEvent | null>(null);

  const fetchEvents = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await metaLeadgenApi.listInboundEvents({
        sourceType: 'META_LEADGEN',
        cursor,
        limit: 20,
      });
      if (cursor) {
        setEvents((prev) => [...prev, ...data.items]);
      } else {
        setEvents(data.items);
      }
      setHasMore(data.page.hasMore);
      setNextCursor(data.page.nextCursor);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleRetry = async (id: string) => {
    try {
      await metaLeadgenApi.retryInboundEvent(id);
      toast('Événement relancé', 'success');
      fetchEvents();
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'error');
    }
  };

  const loadMore = () => {
    if (nextCursor) fetchEvents(nextCursor);
  };

  if (loading && events.length === 0) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 'var(--space-32)' }}><CircularProgress /></Box>;
  }
  if (error && events.length === 0) {
    return <DErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: () => fetchEvents() }} />;
  }

  return (
    <DPage
      title="Inbox Meta Leads"
      subtitle="Événements reçus depuis Meta Lead Ads"
      actions={
        <Button variant="outlined" onClick={() => fetchEvents()} size="small">
          Actualiser
        </Button>
      }
    >
      {events.length === 0 ? (
        <DEmptyState
          title="Aucun événement"
          desc="Les événements Meta Lead Ads apparaîtront ici une fois que vos webhooks seront configurés."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {events.map((ev) => {
            const statusStyle = STATUS_COLORS[ev.status] ?? STATUS_COLORS.RECEIVED;
            const payload = ev.payloadJson ?? {};
            return (
              <DCard key={ev.id}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', mb: 'var(--space-2)' }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '14px', fontFamily: 'monospace' }}>
                        {ev.externalId ? `#${ev.externalId.slice(-8)}` : ev.id.slice(0, 8)}
                      </Typography>
                      <Chip
                        label={STATUS_LABELS[ev.status] ?? ev.status}
                        size="small"
                        sx={{
                          bgcolor: statusStyle.bg,
                          color: statusStyle.fg,
                          fontWeight: 600,
                          fontSize: '11px',
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Page: {(payload as any).pageId ?? '—'}
                      {' · '}Form: {(payload as any).formId ?? '—'}
                      {' · '}
                      {new Date(ev.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </Typography>
                    {ev.lastErrorCode && (
                      <Typography sx={{ fontSize: '12px', color: 'var(--error)', mt: 'var(--space-2)' }}>
                        Erreur: {ev.lastErrorCode} — {ev.lastErrorMsg}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 'var(--space-4)', flexShrink: 0 }}>
                    <Tooltip title="Détails">
                      <IconButton size="small" onClick={() => setDetailEvent(ev)}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {(ev.status === 'ERROR' || ev.status === 'DEAD') && (
                      <Tooltip title="Réessayer">
                        <IconButton size="small" onClick={() => handleRetry(ev.id)}>
                          <ReplayIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              </DCard>
            );
          })}

          {hasMore && (
            <Box sx={{ textAlign: 'center', py: 'var(--space-12)' }}>
              <Button onClick={loadMore} disabled={loading} size="small">
                {loading ? <CircularProgress size={16} /> : 'Charger plus'}
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailEvent} onClose={() => setDetailEvent(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Détails de l&apos;événement</DialogTitle>
        <DialogContent>
          {detailEvent && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
              <DetailRow label="ID" value={detailEvent.id} />
              <DetailRow label="External ID" value={detailEvent.externalId ?? '—'} />
              <DetailRow label="Statut" value={STATUS_LABELS[detailEvent.status] ?? detailEvent.status} />
              <DetailRow label="Tentatives" value={String(detailEvent.attemptCount)} />
              <DetailRow label="Reçu le" value={new Date(detailEvent.createdAt).toLocaleString('fr-FR')} />
              {detailEvent.processedAt && (
                <DetailRow label="Traité le" value={new Date(detailEvent.processedAt).toLocaleString('fr-FR')} />
              )}
              {detailEvent.lastErrorCode && (
                <DetailRow label="Dernière erreur" value={`${detailEvent.lastErrorCode}: ${detailEvent.lastErrorMsg}`} />
              )}
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', mt: 'var(--space-8)' }}>
                Payload
              </Typography>
              <Box sx={{ bgcolor: 'var(--neutral-bg)', p: 'var(--space-8)', borderRadius: '4px', overflow: 'auto', maxHeight: 200 }}>
                <pre style={{ fontSize: '11px', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(detailEvent.payloadJson, null, 2)}
                </pre>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailEvent(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </DPage>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 'var(--space-8)' }}>
      <Typography sx={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', minWidth: 120 }}>{label}</Typography>
      <Typography sx={{ fontSize: '13px', wordBreak: 'break-all' }}>{value}</Typography>
    </Box>
  );
}
