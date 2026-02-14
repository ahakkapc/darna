'use client';

import Chip from '@mui/material/Chip';

const PRIORITY_MAP: Record<string, { label: string; bg: string; border: string }> = {
  LOW: { label: 'Faible', bg: 'rgba(234,240,246,0.08)', border: 'var(--line)' },
  MEDIUM: { label: 'Moyen', bg: 'rgba(77,163,255,0.10)', border: 'rgba(77,163,255,0.25)' },
  HIGH: { label: 'Élevé', bg: 'rgba(245,165,36,0.10)', border: 'rgba(245,165,36,0.25)' },
  URGENT: { label: 'Urgent', bg: 'rgba(255,77,79,0.12)', border: 'rgba(255,77,79,0.30)' },
};

export default function DPriorityPill({ priority }: { priority: string }) {
  const p = PRIORITY_MAP[priority] ?? { label: priority, bg: 'var(--line)', border: 'var(--line)' };
  return (
    <Chip
      label={p.label}
      size="small"
      sx={{
        backgroundColor: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 'var(--radius-pill)',
        fontSize: '12px',
        fontWeight: 600,
        height: 24,
      }}
    />
  );
}
