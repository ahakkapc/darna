'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import DFiltersBar from '@/components/ui/DFiltersBar';
import DTable from '@/components/ui/DTable';
import type { DTableColumn } from '@/components/ui/DTable';
import DCursorLoadMore from '@/components/ui/DCursorLoadMore';
import { DEmptyState, DErrorState, DForbiddenState, DNotFoundState } from '@/components/ui/DStates';
import DTagInput from '@/components/ui/DTagInput';
import DDateTimePicker from '@/components/ui/DDateTimePicker';
import { useToast } from '@/components/ui/DToast';

interface SampleRow {
  id: string;
  name: string;
  status: string;
}

const SAMPLE_COLUMNS: DTableColumn<SampleRow>[] = [
  { key: 'name', label: 'Nom', render: (r) => <strong>{r.name}</strong> },
  { key: 'status', label: 'Statut', render: (r) => <Chip size="small" label={r.status} /> },
];

const SAMPLE_ROWS: SampleRow[] = [
  { id: '1', name: 'Alice Dupont', status: 'Active' },
  { id: '2', name: 'Bob Martin', status: 'Pending' },
  { id: '3', name: 'Claire Duval', status: 'Inactive' },
];

export default function UIKitPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<string[]>(['demo', 'tag']);
  const [dateVal, setDateVal] = useState('');

  return (
    <DPage title="UI Kit" subtitle="Tous les composants Darna Design System">
      {/* Tokens */}
      <Section title="Tokens — Couleurs">
        <Box sx={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
          {[
            { name: 'bg-0', color: 'var(--bg-0)' },
            { name: 'bg-1', color: 'var(--bg-1)' },
            { name: 'bg-2', color: 'var(--bg-2)' },
            { name: 'brand-copper', color: 'var(--brand-copper)' },
            { name: 'brand-blue', color: 'var(--brand-blue)' },
            { name: 'success', color: 'var(--success)' },
            { name: 'warning', color: 'var(--warning)' },
            { name: 'danger', color: 'var(--danger)' },
            { name: 'info', color: 'var(--info)' },
          ].map((t) => (
            <Box key={t.name} sx={{ textAlign: 'center' }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-input)',
                  backgroundColor: t.color,
                  border: '1px solid var(--line)',
                  mb: 'var(--space-4)',
                }}
              />
              <Typography sx={{ fontSize: '10px', color: 'var(--muted-2)' }}>{t.name}</Typography>
            </Box>
          ))}
        </Box>
      </Section>

      {/* Typography */}
      <Section title="Typographie">
        <Typography variant="h1">H1 — 22/30 700</Typography>
        <Typography variant="h2" sx={{ mt: 'var(--space-8)' }}>H2 — 16/24 700</Typography>
        <Typography variant="body1" sx={{ mt: 'var(--space-8)' }}>Body — 14/20 400</Typography>
        <Typography variant="body2" sx={{ mt: 'var(--space-8)' }}>Label — 12/16 600</Typography>
        <Typography sx={{ mt: 'var(--space-8)', color: 'var(--muted)' }}>Muted text</Typography>
        <Typography sx={{ mt: 'var(--space-4)', color: 'var(--muted-2)' }}>Muted-2 text</Typography>
        <Typography sx={{ mt: 'var(--space-8)', fontVariantNumeric: 'tabular-nums' }}>
          Budget: 12 500 000 DA
        </Typography>
      </Section>

      {/* Buttons */}
      <Section title="Buttons">
        <Box sx={{ display: 'flex', gap: 'var(--space-12)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="contained" color="primary">Primary</Button>
          <Button variant="outlined">Secondary</Button>
          <Button variant="text" sx={{ color: 'var(--muted)' }}>Text</Button>
          <Button variant="contained" color="primary" disabled>Disabled</Button>
          <Button variant="contained" color="error">Danger</Button>
        </Box>
      </Section>

      {/* Inputs */}
      <Section title="Inputs">
        <Box sx={{ display: 'flex', gap: 'var(--space-16)', flexWrap: 'wrap' }}>
          <TextField size="small" label="Default" placeholder="Placeholder…" sx={{ width: 240 }} />
          <TextField size="small" label="Focused" placeholder="Focus me" sx={{ width: 240 }} />
          <TextField size="small" label="Error" error helperText="Champ requis" sx={{ width: 240 }} />
        </Box>
      </Section>

      {/* Chips */}
      <Section title="Chips">
        <Box sx={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
          <Chip label="Default" />
          <Chip label="Deletable" onDelete={() => {}} />
          <Chip label="Active" sx={{ backgroundColor: 'rgba(216,162,74,0.15)', borderColor: 'var(--brand-copper)' }} />
        </Box>
      </Section>

      {/* DCard */}
      <Section title="DCard">
        <Box sx={{ display: 'flex', gap: 'var(--space-16)', flexWrap: 'wrap' }}>
          <Box sx={{ flex: '1 1 300px' }}>
            <DCard title="Card standard">
              <Typography sx={{ color: 'var(--muted)' }}>Contenu de la card avec titre.</Typography>
            </DCard>
          </Box>
          <Box sx={{ flex: '1 1 300px' }}>
            <DCard title="Card hoverable" hoverable actions={<Button size="small" variant="outlined">Action</Button>}>
              <Typography sx={{ color: 'var(--muted)' }}>Hover pour effet.</Typography>
            </DCard>
          </Box>
        </Box>
      </Section>

      {/* DFiltersBar */}
      <Section title="DFiltersBar">
        <DFiltersBar
          search={{ value: search, onChange: setSearch, placeholder: 'Rechercher leads…' }}
          onReset={() => setSearch('')}
        >
          <Chip label="Status: All" size="small" />
        </DFiltersBar>
      </Section>

      {/* DTable */}
      <Section title="DTable">
        <DCard>
          <DTable<SampleRow>
            columns={SAMPLE_COLUMNS}
            rows={SAMPLE_ROWS}
            rowKey={(r) => r.id}
            onRowClick={(r) => toast(`Clicked: ${r.name}`, 'info')}
          />
        </DCard>
      </Section>

      {/* DTable loading */}
      <Section title="DTable — Loading">
        <DCard>
          <DTable<SampleRow>
            columns={SAMPLE_COLUMNS}
            rows={[]}
            rowKey={(r) => r.id}
            loading
          />
        </DCard>
      </Section>

      {/* DCursorLoadMore */}
      <Section title="DCursorLoadMore">
        <DCursorLoadMore hasMore onLoadMore={() => toast('Load more clicked', 'info')} loading={false} />
        <DCursorLoadMore hasMore onLoadMore={() => {}} loading />
      </Section>

      {/* States */}
      <Section title="States">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 'var(--space-16)' }}>
          <DCard>
            <DEmptyState title="Aucun lead" desc="Créez votre premier lead." cta={{ label: 'Créer', onClick: () => toast('CTA clicked', 'info') }} />
          </DCard>
          <DCard>
            <DErrorState requestId="req_abc123" cta={{ label: 'Réessayer', onClick: () => toast('Retry', 'info') }} />
          </DCard>
          <DCard>
            <DForbiddenState />
          </DCard>
          <DCard>
            <DNotFoundState />
          </DCard>
        </Box>
      </Section>

      {/* DTagInput */}
      <Section title="DTagInput">
        <Box sx={{ maxWidth: 400 }}>
          <DTagInput value={tags} onChange={setTags} />
        </Box>
      </Section>

      {/* DDateTimePicker */}
      <Section title="DDateTimePicker">
        <Box sx={{ maxWidth: 300 }}>
          <DDateTimePicker value={dateVal} onChange={setDateVal} label="Échéance" />
          {dateVal && (
            <Typography sx={{ color: 'var(--muted)', mt: 'var(--space-8)', fontSize: '12px' }}>
              ISO: {dateVal}
            </Typography>
          )}
        </Box>
      </Section>

      {/* Toast */}
      <Section title="Toast">
        <Box sx={{ display: 'flex', gap: 'var(--space-8)' }}>
          <Button variant="contained" color="success" onClick={() => toast('Succès !', 'success')}>Success</Button>
          <Button variant="contained" color="error" onClick={() => toast('Erreur !', 'error')}>Error</Button>
          <Button variant="outlined" onClick={() => toast('Info !', 'info')}>Info</Button>
        </Box>
      </Section>
    </DPage>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 'var(--space-32)' }}>
      <Typography variant="h2" sx={{ mb: 'var(--space-16)' }}>{title}</Typography>
      {children}
      <Divider sx={{ mt: 'var(--space-24)' }} />
    </Box>
  );
}
