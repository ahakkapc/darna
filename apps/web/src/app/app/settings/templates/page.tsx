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
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Plus, PencilSimple, Archive, CheckCircle } from '@phosphor-icons/react';
import { templatesApi, type MessageTemplate } from '@/lib/sequences';

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning'> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  ARCHIVED: 'warning',
};

export default function TemplatesPage() {
  const [items, setItems] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [form, setForm] = useState({ channel: 'WHATSAPP', name: '', subject: '', body: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await templatesApi.list({ channel: channelFilter || undefined });
      setItems(res.items);
    } catch { /* empty */ }
    setLoading(false);
  }, [channelFilter]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ channel: 'WHATSAPP', name: '', subject: '', body: '' });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (t: MessageTemplate) => {
    setEditing(t);
    setForm({ channel: t.channel, name: t.name, subject: t.subject ?? '', body: t.body });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await templatesApi.update(editing.id, { name: form.name, subject: form.subject || undefined, body: form.body });
      } else {
        await templatesApi.create({ channel: form.channel, name: form.name, subject: form.channel === 'EMAIL' ? form.subject : undefined, body: form.body });
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Erreur');
    }
    setSaving(false);
  };

  const handleActivate = async (id: string) => {
    await templatesApi.activate(id);
    await load();
  };

  const handleArchive = async (id: string) => {
    await templatesApi.archive(id);
    await load();
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Templates Messages</Typography>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={openCreate}>
          Nouveau template
        </Button>
      </Box>

      <ToggleButtonGroup
        value={channelFilter}
        exclusive
        onChange={(_, v) => setChannelFilter(v ?? '')}
        sx={{ mb: 3 }}
        size="small"
      >
        <ToggleButton value="">Tous</ToggleButton>
        <ToggleButton value="WHATSAPP">WhatsApp</ToggleButton>
        <ToggleButton value="EMAIL">Email</ToggleButton>
      </ToggleButtonGroup>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Typography color="text.secondary" textAlign="center" py={6}>Aucun template trouvé</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((t) => (
            <Card key={t.id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography fontWeight={600}>{t.name}</Typography>
                  <Chip label={t.channel} size="small" variant="outlined" />
                  <Chip label={t.status} size="small" color={STATUS_COLORS[t.status] ?? 'default'} />
                </Box>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 500 }}>
                  {t.body.slice(0, 100)}{t.body.length > 100 ? '…' : ''}
                </Typography>
                {t.variablesJson?.used?.length ? (
                  <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {t.variablesJson.used.map((v) => (
                      <Chip key={v} label={`{{${v}}}`} size="small" sx={{ fontSize: 11 }} />
                    ))}
                  </Box>
                ) : null}
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title="Modifier"><IconButton size="small" onClick={() => openEdit(t)}><PencilSimple size={18} /></IconButton></Tooltip>
                {t.status !== 'ACTIVE' && (
                  <Tooltip title="Activer"><IconButton size="small" color="success" onClick={() => handleActivate(t.id)}><CheckCircle size={18} /></IconButton></Tooltip>
                )}
                {t.status !== 'ARCHIVED' && (
                  <Tooltip title="Archiver"><IconButton size="small" color="warning" onClick={() => handleArchive(t.id)}><Archive size={18} /></IconButton></Tooltip>
                )}
              </Box>
            </Card>
          ))}
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Modifier le template' : 'Nouveau template'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          {!editing && (
            <ToggleButtonGroup value={form.channel} exclusive onChange={(_, v) => v && setForm({ ...form, channel: v })} size="small">
              <ToggleButton value="WHATSAPP">WhatsApp</ToggleButton>
              <ToggleButton value="EMAIL">Email</ToggleButton>
            </ToggleButtonGroup>
          )}
          <TextField label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size="small" fullWidth />
          {form.channel === 'EMAIL' && (
            <TextField label="Sujet" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} size="small" fullWidth />
          )}
          <TextField
            label="Corps du message"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            multiline
            rows={6}
            size="small"
            fullWidth
            helperText="Variables disponibles : {{leadFirstName}}, {{leadFullName}}, {{leadPhone}}, {{agentName}}, {{companyName}}, etc."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.name || !form.body}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
