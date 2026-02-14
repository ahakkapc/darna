'use client';

import { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import { Plus, Play, Pause, Archive, Trash, ArrowDown } from '@phosphor-icons/react';
import {
  sequencesApi,
  templatesApi,
  type MessageSequence,
  type MessageTemplate,
  type SequenceStep,
} from '@/lib/sequences';

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  PAUSED: 'info',
  ARCHIVED: 'warning',
};

function delayLabel(minutes: number): string {
  if (minutes === 0) return 'J+0 (immédiat)';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `J+${Math.round(minutes / 1440)}`;
}

export default function SequencesPage() {
  const [items, setItems] = useState<MessageSequence[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stepsDialogOpen, setStepsDialogOpen] = useState(false);
  const [activeSeq, setActiveSeq] = useState<MessageSequence | null>(null);
  const [form, setForm] = useState({ name: '', description: '', defaultStartDelayMinutes: 0, stopOnReply: true });
  const [stepsForm, setStepsForm] = useState<Array<{ channel: string; templateId: string; delayMinutes: number; conditions: Array<{ key: string }> }>>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [seqRes, tmplRes] = await Promise.all([sequencesApi.list(), templatesApi.list({ status: 'ACTIVE' })]);
      setItems(seqRes.items);
      setTemplates(tmplRes.items);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setActiveSeq(null);
    setForm({ name: '', description: '', defaultStartDelayMinutes: 0, stopOnReply: true });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (activeSeq) {
        await sequencesApi.update(activeSeq.id, form);
      } else {
        await sequencesApi.create(form);
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Erreur');
    }
    setSaving(false);
  };

  const openSteps = (seq: MessageSequence) => {
    setActiveSeq(seq);
    setStepsForm(
      (seq.steps ?? []).map((s) => ({
        channel: s.channel,
        templateId: s.templateId,
        delayMinutes: s.delayMinutes,
        conditions: (s.conditionsJson ?? []).map((c) => ({ key: c.key })),
      })),
    );
    setError('');
    setStepsDialogOpen(true);
  };

  const handleSaveSteps = async () => {
    if (!activeSeq) return;
    setSaving(true);
    setError('');
    try {
      await sequencesApi.replaceSteps(
        activeSeq.id,
        stepsForm.map((s, i) => ({
          orderIndex: i,
          channel: s.channel,
          templateId: s.templateId,
          delayMinutes: s.delayMinutes,
          conditions: s.conditions.length > 0 ? s.conditions : undefined,
        })),
      );
      setStepsDialogOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Erreur');
    }
    setSaving(false);
  };

  const addStep = () => {
    const lastDelay = stepsForm.length > 0 ? stepsForm[stepsForm.length - 1].delayMinutes : -1;
    setStepsForm([...stepsForm, { channel: 'WHATSAPP', templateId: '', delayMinutes: lastDelay + 1440, conditions: [] }]);
  };

  const removeStep = (idx: number) => {
    setStepsForm(stepsForm.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, field: string, value: unknown) => {
    setStepsForm(stepsForm.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Séquences</Typography>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={openCreate}>Nouvelle séquence</Button>
      </Box>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Typography color="text.secondary" textAlign="center" py={6}>Aucune séquence</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((seq) => (
            <Card key={seq.id} sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography fontWeight={600} sx={{ flex: 1 }}>{seq.name}</Typography>
                <Chip label={seq.status} size="small" color={STATUS_COLORS[seq.status] ?? 'default'} />
                {seq.stopOnReply && <Chip label="Stop on reply" size="small" variant="outlined" />}
              </Box>
              {seq.description && <Typography variant="body2" color="text.secondary" mb={1}>{seq.description}</Typography>}

              {(seq.steps ?? []).length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  {(seq.steps ?? []).map((step, i) => (
                    <Chip
                      key={step.id}
                      label={`${i + 1}. ${step.channel} — ${delayLabel(step.delayMinutes)}`}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button size="small" onClick={() => openSteps(seq)}>Étapes</Button>
                {seq.status === 'DRAFT' && (
                  <Button size="small" color="success" startIcon={<Play size={14} />} onClick={async () => { await sequencesApi.activate(seq.id); await load(); }}>
                    Activer
                  </Button>
                )}
                {seq.status === 'ACTIVE' && (
                  <Button size="small" color="info" startIcon={<Pause size={14} />} onClick={async () => { await sequencesApi.pause(seq.id); await load(); }}>
                    Pause
                  </Button>
                )}
                {seq.status !== 'ARCHIVED' && (
                  <Button size="small" color="warning" startIcon={<Archive size={14} />} onClick={async () => { await sequencesApi.archive(seq.id); await load(); }}>
                    Archiver
                  </Button>
                )}
              </Box>
            </Card>
          ))}
        </Box>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{activeSeq ? 'Modifier la séquence' : 'Nouvelle séquence'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size="small" fullWidth />
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} size="small" fullWidth multiline rows={2} />
          <TextField
            label="Délai démarrage (minutes)"
            type="number"
            value={form.defaultStartDelayMinutes}
            onChange={(e) => setForm({ ...form, defaultStartDelayMinutes: Number(e.target.value) })}
            size="small"
          />
          <FormControlLabel
            control={<Switch checked={form.stopOnReply} onChange={(e) => setForm({ ...form, stopOnReply: e.target.checked })} />}
            label="Arrêter si réponse reçue"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.name}>{saving ? '…' : 'Enregistrer'}</Button>
        </DialogActions>
      </Dialog>

      {/* Steps editor dialog */}
      <Dialog open={stepsDialogOpen} onClose={() => setStepsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Étapes — {activeSeq?.name}</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {activeSeq && activeSeq.status !== 'DRAFT' && activeSeq.status !== 'PAUSED' && (
            <Alert severity="warning" sx={{ mb: 2 }}>La séquence doit être en DRAFT ou PAUSED pour modifier les étapes.</Alert>
          )}
          {stepsForm.map((step, idx) => (
            <Box key={idx}>
              {idx > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                  <ArrowDown size={20} color="#999" />
                </Box>
              )}
              <Card variant="outlined" sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" sx={{ width: 30, pt: 1 }}>#{idx + 1}</Typography>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Canal</InputLabel>
                  <Select value={step.channel} label="Canal" onChange={(e) => updateStep(idx, 'channel', e.target.value)}>
                    <MenuItem value="WHATSAPP">WhatsApp</MenuItem>
                    <MenuItem value="EMAIL">Email</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Template</InputLabel>
                  <Select value={step.templateId} label="Template" onChange={(e) => updateStep(idx, 'templateId', e.target.value)}>
                    {templates.filter((t) => t.channel === step.channel).map((t) => (
                      <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Délai (min)"
                  type="number"
                  value={step.delayMinutes}
                  onChange={(e) => updateStep(idx, 'delayMinutes', Number(e.target.value))}
                  size="small"
                  sx={{ width: 120 }}
                  helperText={delayLabel(step.delayMinutes)}
                />
                <Tooltip title="Supprimer">
                  <IconButton size="small" color="error" onClick={() => removeStep(idx)}><Trash size={18} /></IconButton>
                </Tooltip>
              </Card>
            </Box>
          ))}
          <Button startIcon={<Plus size={16} />} sx={{ mt: 2 }} onClick={addStep}>Ajouter une étape</Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStepsDialogOpen(false)}>Fermer</Button>
          <Button
            variant="contained"
            onClick={handleSaveSteps}
            disabled={saving || stepsForm.length === 0 || stepsForm.some((s) => !s.templateId)}
          >
            {saving ? '…' : 'Sauvegarder les étapes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
