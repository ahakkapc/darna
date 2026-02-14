'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import { DEmptyState, DErrorState } from '@/components/ui/DStates';
import { useToast } from '@/components/ui/DToast';
import { ApiError } from '@/lib/http';
import {
  metaLeadgenApi,
  MetaLeadSource,
  CreateMetaLeadSourceInput,
  UpdateMetaLeadSourceInput,
} from '@/lib/metaLeadgen';

const ROUTING_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Tour par tour',
  MANAGER_ASSIGN: 'Attribution manager',
  NONE: 'Non attribué',
};

const CRM_FIELDS = [
  'fullName', 'phone', 'email', 'wilaya', 'commune', 'quartier',
  'budgetMin', 'budgetMax', 'notes', 'propertyType', 'surfaceMin',
];

export default function MetaLeadgenSourcesPage() {
  const { toast } = useToast();
  const [sources, setSources] = useState<MetaLeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSource, setEditSource] = useState<MetaLeadSource | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    integrationId: '',
    pageId: '',
    pageName: '',
    formId: '',
    formName: '',
    routingStrategy: 'ROUND_ROBIN' as string,
    isActive: true,
  });
  const [mapping, setMapping] = useState<Array<{ metaField: string; crmField: string }>>([]);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await metaLeadgenApi.listSources();
      setSources(data.items);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const openCreate = () => {
    setEditSource(null);
    setForm({ integrationId: '', pageId: '', pageName: '', formId: '', formName: '', routingStrategy: 'ROUND_ROBIN', isActive: true });
    setMapping([]);
    setDialogOpen(true);
  };

  const openEdit = (source: MetaLeadSource) => {
    setEditSource(source);
    setForm({
      integrationId: source.integrationId,
      pageId: source.pageId,
      pageName: source.pageName ?? '',
      formId: source.formId,
      formName: source.formName ?? '',
      routingStrategy: source.routingStrategy,
      isActive: source.isActive,
    });
    const m = source.fieldMappingJson ?? {};
    setMapping(Object.entries(m).map(([metaField, crmField]) => ({ metaField, crmField })));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fieldMappingJson: Record<string, string> = {};
      for (const row of mapping) {
        if (row.metaField.trim() && row.crmField.trim()) {
          fieldMappingJson[row.metaField.trim()] = row.crmField.trim();
        }
      }

      if (editSource) {
        const updateData: UpdateMetaLeadSourceInput = {
          pageName: form.pageName || undefined,
          formName: form.formName || undefined,
          routingStrategy: form.routingStrategy as any,
          isActive: form.isActive,
          fieldMappingJson: Object.keys(fieldMappingJson).length > 0 ? fieldMappingJson : undefined,
        };
        await metaLeadgenApi.updateSource(editSource.id, updateData);
        toast('Source mise à jour', 'success');
      } else {
        const createData: CreateMetaLeadSourceInput = {
          integrationId: form.integrationId,
          pageId: form.pageId,
          pageName: form.pageName || undefined,
          formId: form.formId,
          formName: form.formName || undefined,
          routingStrategy: form.routingStrategy as any,
          fieldMappingJson: Object.keys(fieldMappingJson).length > 0 ? fieldMappingJson : undefined,
        };
        await metaLeadgenApi.createSource(createData);
        toast('Source créée', 'success');
      }
      setDialogOpen(false);
      fetchSources();
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBackfill = async (sourceId: string) => {
    try {
      await metaLeadgenApi.triggerBackfill(sourceId);
      toast('Backfill 72h lancé', 'success');
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'error');
    }
  };

  const addMappingRow = () => setMapping((m) => [...m, { metaField: '', crmField: '' }]);
  const removeMappingRow = (i: number) => setMapping((m) => m.filter((_, idx) => idx !== i));
  const updateMappingRow = (i: number, field: 'metaField' | 'crmField', value: string) => {
    setMapping((m) => m.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 'var(--space-32)' }}><CircularProgress /></Box>;
  if (error) return <DErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: fetchSources }} />;

  return (
    <DPage
      title="Sources Meta Lead Ads"
      subtitle="Configurez vos pages et formulaires Facebook pour recevoir des leads automatiquement"
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}
          sx={{ bgcolor: 'var(--brand-copper)', '&:hover': { bgcolor: 'var(--brand-copper-dark)' } }}>
          Ajouter une source
        </Button>
      }
    >
      {sources.length === 0 ? (
        <DEmptyState
          title="Aucune source configurée"
          desc="Ajoutez une source Meta Lead Ads pour commencer à recevoir des leads automatiquement."
          cta={{ label: 'Ajouter une source', onClick: openCreate }}
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
          {sources.map((source) => (
            <DCard key={source.id}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', mb: 'var(--space-4)' }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '16px' }}>
                      {source.pageName || source.pageId}
                    </Typography>
                    <Chip
                      label={source.isActive ? 'Actif' : 'Inactif'}
                      size="small"
                      sx={{
                        bgcolor: source.isActive ? 'var(--success-bg)' : 'var(--neutral-bg)',
                        color: source.isActive ? 'var(--success)' : 'var(--muted)',
                        fontWeight: 600, fontSize: '11px',
                      }}
                    />
                  </Box>
                  <Typography sx={{ fontSize: '13px', color: 'var(--muted)' }}>
                    Formulaire: {source.formName || source.formId}
                  </Typography>
                  <Typography sx={{ fontSize: '12px', color: 'var(--muted)', mt: 'var(--space-4)' }}>
                    Routing: {ROUTING_LABELS[source.routingStrategy] ?? source.routingStrategy}
                    {source.fieldMappingJson && Object.keys(source.fieldMappingJson).length > 0 &&
                      ` · ${Object.keys(source.fieldMappingJson).length} champ(s) mappé(s)`}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 'var(--space-4)' }}>
                  <Tooltip title="Backfill 72h">
                    <IconButton size="small" onClick={() => handleBackfill(source.id)}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Modifier">
                    <IconButton size="small" onClick={() => openEdit(source)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </DCard>
          ))}
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editSource ? 'Modifier la source' : 'Nouvelle source Meta Lead Ads'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)', pt: 'var(--space-12) !important' }}>
          {!editSource && (
            <TextField label="ID Intégration" size="small" value={form.integrationId}
              onChange={(e) => setForm({ ...form, integrationId: e.target.value })} required />
          )}
          {!editSource && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)' }}>
              <TextField label="Page ID" size="small" value={form.pageId}
                onChange={(e) => setForm({ ...form, pageId: e.target.value })} required />
              <TextField label="Nom de la page" size="small" value={form.pageName}
                onChange={(e) => setForm({ ...form, pageName: e.target.value })} />
            </Box>
          )}
          {!editSource && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)' }}>
              <TextField label="Form ID" size="small" value={form.formId}
                onChange={(e) => setForm({ ...form, formId: e.target.value })} required />
              <TextField label="Nom du formulaire" size="small" value={form.formName}
                onChange={(e) => setForm({ ...form, formName: e.target.value })} />
            </Box>
          )}
          {editSource && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)' }}>
              <TextField label="Nom de la page" size="small" value={form.pageName}
                onChange={(e) => setForm({ ...form, pageName: e.target.value })} />
              <TextField label="Nom du formulaire" size="small" value={form.formName}
                onChange={(e) => setForm({ ...form, formName: e.target.value })} />
            </Box>
          )}
          <TextField select label="Stratégie de routing" size="small" value={form.routingStrategy}
            onChange={(e) => setForm({ ...form, routingStrategy: e.target.value })}>
            <MenuItem value="ROUND_ROBIN">Tour par tour</MenuItem>
            <MenuItem value="MANAGER_ASSIGN">Attribution manager</MenuItem>
            <MenuItem value="NONE">Non attribué</MenuItem>
          </TextField>
          {editSource && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
              <Typography sx={{ fontSize: '14px' }}>Source active</Typography>
              <Switch size="small" checked={form.isActive}
                onChange={(_, v) => setForm({ ...form, isActive: v })}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--brand-copper)' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--brand-copper)' },
                }}
              />
            </Box>
          )}

          {/* Field mapping editor */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 'var(--space-8)' }}>
              <Typography sx={{ fontSize: '14px', fontWeight: 600 }}>Mapping des champs</Typography>
              <Button size="small" onClick={addMappingRow}>+ Ajouter</Button>
            </Box>
            {mapping.length === 0 && (
              <Typography sx={{ fontSize: '12px', color: 'var(--muted)' }}>
                Aucun mapping personnalisé — les champs seront associés par nom automatiquement
              </Typography>
            )}
            {mapping.map((row, i) => (
              <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 'var(--space-8)', mb: 'var(--space-4)' }}>
                <TextField size="small" placeholder="Champ Meta (ex: full_name)" value={row.metaField}
                  onChange={(e) => updateMappingRow(i, 'metaField', e.target.value)} />
                <TextField select size="small" value={row.crmField}
                  onChange={(e) => updateMappingRow(i, 'crmField', e.target.value)}>
                  {CRM_FIELDS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </TextField>
                <Button size="small" color="error" onClick={() => removeMappingRow(i)}>×</Button>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}
            sx={{ bgcolor: 'var(--brand-copper)', '&:hover': { bgcolor: 'var(--brand-copper-dark)' } }}>
            {saving ? <CircularProgress size={20} /> : editSource ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>
    </DPage>
  );
}
