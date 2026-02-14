'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import DTagInput from '@/components/ui/DTagInput';
import { useToast } from '@/components/ui/DToast';
import { http, ApiError } from '@/lib/http';

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  type: string;
  priority: string;
  budgetMin: string;
  budgetMax: string;
  wilaya: string;
  commune: string;
  quartier: string;
  propertyType: string;
  surfaceMin: string;
  tags: string[];
  notes: string;
}

const INITIAL: FormState = {
  fullName: '',
  phone: '',
  email: '',
  type: 'BUYER',
  priority: 'MEDIUM',
  budgetMin: '',
  budgetMax: '',
  wilaya: '',
  commune: '',
  quartier: '',
  propertyType: '',
  surfaceMin: '',
  tags: [],
  notes: '',
};

export default function CreateLeadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof FormState, value: string | string[]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Nom requis';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email invalide';
    if (form.budgetMin && form.budgetMax && Number(form.budgetMin) > Number(form.budgetMax))
      e.budgetMax = 'Budget max doit être ≥ budget min';
    if (!form.wilaya.trim()) e.wilaya = 'Wilaya requise';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        fullName: form.fullName,
        type: form.type,
        priority: form.priority,
        wilaya: form.wilaya,
      };
      if (form.phone) body.phone = form.phone;
      if (form.email) body.email = form.email;
      if (form.budgetMin) body.budgetMin = Number(form.budgetMin);
      if (form.budgetMax) body.budgetMax = Number(form.budgetMax);
      if (form.commune) body.commune = form.commune;
      if (form.quartier) body.quartier = form.quartier;
      if (form.propertyType) body.propertyType = form.propertyType;
      if (form.surfaceMin) body.surfaceMin = Number(form.surfaceMin);
      if (form.tags.length > 0) body.tags = form.tags;
      if (form.notes) body.notes = form.notes;

      const res = await http.post<{ id: string }>('/crm/leads', body);
      toast('Lead créé avec succès', 'success');
      router.push(`/app/crm/leads/${res.id}`);
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DPage title="Nouveau lead" subtitle="Renseignez les informations du lead">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)', maxWidth: 800 }}>
        {/* Card 1: Identity */}
        <DCard title="Identité">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 'var(--space-16)' }}>
            <TextField
              size="small"
              label="Nom complet"
              required
              fullWidth
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              error={!!errors.fullName}
              helperText={errors.fullName}
            />
            <TextField
              size="small"
              label="Téléphone"
              fullWidth
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
            <TextField
              size="small"
              label="Email"
              fullWidth
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              error={!!errors.email}
              helperText={errors.email}
            />
          </Box>
        </DCard>

        {/* Card 2: Pipeline */}
        <DCard title="Pipeline">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 'var(--space-16)' }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={form.type} label="Type" onChange={(e) => set('type', e.target.value)}>
                <MenuItem value="BUYER">Acheteur</MenuItem>
                <MenuItem value="TENANT">Locataire</MenuItem>
                <MenuItem value="SELLER">Vendeur</MenuItem>
                <MenuItem value="LANDLORD">Bailleur</MenuItem>
                <MenuItem value="INVESTOR">Investisseur</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Priorité</InputLabel>
              <Select value={form.priority} label="Priorité" onChange={(e) => set('priority', e.target.value)}>
                <MenuItem value="LOW">Faible</MenuItem>
                <MenuItem value="MEDIUM">Moyen</MenuItem>
                <MenuItem value="HIGH">Élevé</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DCard>

        {/* Card 3: Criteria & Notes */}
        <DCard title="Critères & notes">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 'var(--space-16)' }}>
            <TextField
              size="small"
              label="Budget min (DA)"
              type="number"
              fullWidth
              value={form.budgetMin}
              onChange={(e) => set('budgetMin', e.target.value)}
            />
            <TextField
              size="small"
              label="Budget max (DA)"
              type="number"
              fullWidth
              value={form.budgetMax}
              onChange={(e) => set('budgetMax', e.target.value)}
              error={!!errors.budgetMax}
              helperText={errors.budgetMax}
            />
            <TextField
              size="small"
              label="Wilaya"
              required
              fullWidth
              value={form.wilaya}
              onChange={(e) => set('wilaya', e.target.value)}
              error={!!errors.wilaya}
              helperText={errors.wilaya}
            />
            <TextField
              size="small"
              label="Commune"
              fullWidth
              value={form.commune}
              onChange={(e) => set('commune', e.target.value)}
            />
            <TextField
              size="small"
              label="Quartier"
              fullWidth
              value={form.quartier}
              onChange={(e) => set('quartier', e.target.value)}
            />
            <TextField
              size="small"
              label="Type de bien"
              fullWidth
              value={form.propertyType}
              onChange={(e) => set('propertyType', e.target.value)}
            />
            <TextField
              size="small"
              label="Surface min (m²)"
              type="number"
              fullWidth
              value={form.surfaceMin}
              onChange={(e) => set('surfaceMin', e.target.value)}
            />
          </Box>
          <Box sx={{ mt: 'var(--space-16)' }}>
            <DTagInput value={form.tags} onChange={(tags) => set('tags', tags)} />
          </Box>
          <Box sx={{ mt: 'var(--space-16)' }}>
            <TextField
              size="small"
              label="Notes"
              multiline
              rows={3}
              fullWidth
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Box>
        </DCard>

        {/* Footer */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-12)' }}>
          <Button variant="outlined" onClick={() => router.push('/app/crm/leads')}>
            Annuler
          </Button>
          <Button variant="contained" color="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Création…' : 'Créer le lead'}
          </Button>
        </Box>
      </Box>
    </DPage>
  );
}
