'use client';

import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { http, ApiError } from '@/lib/http';
import { useToast } from '@/components/ui/DToast';

interface CalendarEvent {
  id: string;
  type: string;
  status: string;
  title: string;
  startAt: string;
  endAt: string;
  assigneeUserId: string;
  leadId: string | null;
  wilaya: string | null;
  commune: string | null;
  quartier: string | null;
}

interface Props {
  open: boolean;
  event: CalendarEvent | null;
  leadId?: string;
  onClose: (refresh?: boolean) => void;
}

const EVENT_TYPES = [
  { value: 'VISIT', label: 'Visite' },
  { value: 'SIGNING', label: 'Signature' },
  { value: 'CALL_SLOT', label: 'Créneau appels' },
  { value: 'MEETING', label: 'Rendez-vous' },
  { value: 'OTHER', label: 'Autre' },
];

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Planifié',
  COMPLETED: 'Terminé',
  CANCELED: 'Annulé',
  NO_SHOW: 'Absent',
};

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStartAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalDatetimeValue(d.toISOString());
}

function defaultEndAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  return toLocalDatetimeValue(d.toISOString());
}

export default function EventFormModal({ open, event, leadId, onClose }: Props) {
  const { toast } = useToast();
  const isEdit = !!event;

  const [type, setType] = useState('VISIT');
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState(defaultStartAt());
  const [endAt, setEndAt] = useState(defaultEndAt());
  const [wilaya, setWilaya] = useState('');
  const [commune, setCommune] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [resultNote, setResultNote] = useState('');
  const [completeStatus, setCompleteStatus] = useState<'COMPLETED' | 'NO_SHOW'>('COMPLETED');

  useEffect(() => {
    if (open && event) {
      setType(event.type);
      setTitle(event.title);
      setStartAt(toLocalDatetimeValue(event.startAt));
      setEndAt(toLocalDatetimeValue(event.endAt));
      setWilaya(event.wilaya ?? '');
      setCommune(event.commune ?? '');
      setDescription('');
      setShowCancel(false);
      setShowComplete(false);
    } else if (open && !event) {
      setType('VISIT');
      setTitle('');
      setStartAt(defaultStartAt());
      setEndAt(defaultEndAt());
      setWilaya('');
      setCommune('');
      setDescription('');
      setShowCancel(false);
      setShowComplete(false);
    }
  }, [open, event]);

  const handleSubmit = async () => {
    if (!title.trim() || title.trim().length < 2) {
      toast('Le titre doit faire au moins 2 caractères', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await http.patch(`/planning/events/${event!.id}`, {
          title: title.trim(),
          type,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          wilaya: wilaya || undefined,
          commune: commune || undefined,
        });
        toast('Événement mis à jour', 'success');
      } else {
        const me = await http.get<{ user: { id: string } }>('/auth/me');
        await http.post('/planning/events', {
          type,
          title: title.trim(),
          assigneeUserId: me.user.id,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          wilaya: wilaya || undefined,
          commune: commune || undefined,
          description: description || undefined,
          leadId: leadId || undefined,
          autoTask: { enabled: type === 'VISIT' || type === 'SIGNING', remindMinutesBefore: 60 },
        });
        toast('Événement créé', 'success');
      }
      onClose(true);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'EVENT_TIME_CONFLICT') {
          toast('Conflit horaire avec un événement existant', 'error');
        } else {
          toast(e.message, 'error');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim() || cancelReason.trim().length < 2) {
      toast('Veuillez indiquer la raison', 'error');
      return;
    }
    setSaving(true);
    try {
      await http.post(`/planning/events/${event!.id}/cancel`, { reason: cancelReason.trim() });
      toast('Événement annulé', 'success');
      onClose(true);
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await http.post(`/planning/events/${event!.id}/complete`, {
        status: completeStatus,
        resultNote: resultNote || undefined,
      });
      toast(completeStatus === 'COMPLETED' ? 'Événement terminé' : 'Marqué absent', 'success');
      onClose(true);
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await http.delete(`/planning/events/${event!.id}`);
      toast('Événement supprimé', 'success');
      onClose(true);
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const isCanceled = event?.status === 'CANCELED';
  const isCompleted = event?.status === 'COMPLETED' || event?.status === 'NO_SHOW';
  const isReadonly = isCanceled || isCompleted;

  return (
    <Dialog open={open} onClose={() => onClose()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, borderBottom: '1px solid var(--line)', pb: 'var(--space-12)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
          {isEdit ? 'Détail événement' : 'Nouvel événement'}
          {isEdit && event && (
            <Chip
              size="small"
              label={STATUS_LABEL[event.status] ?? event.status}
              sx={{
                height: 22,
                fontSize: '11px',
                backgroundColor: event.status === 'CANCELED' ? 'rgba(220,38,38,0.1)' : event.status === 'COMPLETED' ? 'rgba(22,163,74,0.1)' : 'rgba(216,162,74,0.1)',
                color: event.status === 'CANCELED' ? 'var(--danger)' : event.status === 'COMPLETED' ? 'var(--success)' : 'var(--brand-copper)',
              }}
            />
          )}
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 'var(--space-16) !important' }}>
        {showCancel ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            <Typography sx={{ fontWeight: 500 }}>Raison de l'annulation</Typography>
            <TextField
              fullWidth size="small" multiline rows={2}
              value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Expliquez la raison…"
            />
          </Box>
        ) : showComplete ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Résultat</InputLabel>
              <Select value={completeStatus} onChange={(e) => setCompleteStatus(e.target.value as 'COMPLETED' | 'NO_SHOW')} label="Résultat">
                <MenuItem value="COMPLETED">Terminé</MenuItem>
                <MenuItem value="NO_SHOW">Absent / No-show</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth size="small" multiline rows={2}
              value={resultNote} onChange={(e) => setResultNote(e.target.value)}
              label="Notes (optionnel)" placeholder="Compte-rendu…"
            />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={type} onChange={(e) => setType(e.target.value)} label="Type" disabled={isReadonly}>
                {EVENT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              fullWidth size="small" label="Titre" value={title}
              onChange={(e) => setTitle(e.target.value)}
              inputProps={{ maxLength: 120 }}
              disabled={isReadonly}
            />
            <Box sx={{ display: 'flex', gap: 'var(--space-8)' }}>
              <TextField
                fullWidth size="small" label="Début" type="datetime-local"
                value={startAt} onChange={(e) => setStartAt(e.target.value)}
                InputLabelProps={{ shrink: true }}
                disabled={isReadonly}
              />
              <TextField
                fullWidth size="small" label="Fin" type="datetime-local"
                value={endAt} onChange={(e) => setEndAt(e.target.value)}
                InputLabelProps={{ shrink: true }}
                disabled={isReadonly}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 'var(--space-8)' }}>
              <TextField
                fullWidth size="small" label="Wilaya" value={wilaya}
                onChange={(e) => setWilaya(e.target.value)}
                disabled={isReadonly}
              />
              <TextField
                fullWidth size="small" label="Commune" value={commune}
                onChange={(e) => setCommune(e.target.value)}
                disabled={isReadonly}
              />
            </Box>
            {!isEdit && (
              <TextField
                fullWidth size="small" label="Description (optionnel)" multiline rows={2}
                value={description} onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 'var(--space-16)', pb: 'var(--space-16)', borderTop: '1px solid var(--line)', pt: 'var(--space-12)', justifyContent: 'space-between' }}>
        <Box>
          {isEdit && !isReadonly && !showCancel && !showComplete && (
            <Box sx={{ display: 'flex', gap: 'var(--space-4)' }}>
              <Button size="small" color="error" onClick={() => setShowCancel(true)} sx={{ textTransform: 'none', fontSize: '12px' }}>
                Annuler l'événement
              </Button>
              <Button size="small" onClick={() => setShowComplete(true)} sx={{ textTransform: 'none', fontSize: '12px', color: 'var(--success)' }}>
                Terminer
              </Button>
              <Button size="small" color="error" onClick={handleDelete} disabled={saving} sx={{ textTransform: 'none', fontSize: '12px' }}>
                Supprimer
              </Button>
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 'var(--space-8)' }}>
          {(showCancel || showComplete) && (
            <Button onClick={() => { setShowCancel(false); setShowComplete(false); }} sx={{ textTransform: 'none' }}>
              Retour
            </Button>
          )}
          <Button onClick={() => onClose()} sx={{ textTransform: 'none' }}>
            Fermer
          </Button>
          {showCancel ? (
            <Button variant="contained" color="error" onClick={handleCancel} disabled={saving} sx={{ textTransform: 'none' }}>
              Confirmer l'annulation
            </Button>
          ) : showComplete ? (
            <Button
              variant="contained"
              onClick={handleComplete}
              disabled={saving}
              sx={{ textTransform: 'none', backgroundColor: 'var(--success)', '&:hover': { backgroundColor: '#15803d' } }}
            >
              Confirmer
            </Button>
          ) : !isReadonly ? (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={saving}
              sx={{ textTransform: 'none', backgroundColor: 'var(--brand-copper)', '&:hover': { backgroundColor: 'var(--brand-copper-dark)' } }}
            >
              {isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          ) : null}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
