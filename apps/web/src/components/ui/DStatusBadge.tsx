'use client';

import Chip from '@mui/material/Chip';

const STATUS_MAP: Record<string, { label: string; bg: string; border: string }> = {
  NEW: { label: 'Nouveau', bg: 'rgba(77,163,255,0.12)', border: 'rgba(77,163,255,0.30)' },
  TO_CONTACT: { label: 'À contacter', bg: 'rgba(124,92,255,0.12)', border: 'rgba(124,92,255,0.30)' },
  VISIT_SCHEDULED: { label: 'Visite planifiée', bg: 'rgba(216,162,74,0.12)', border: 'rgba(216,162,74,0.30)' },
  OFFER_IN_PROGRESS: { label: 'Offre en cours', bg: 'rgba(245,165,36,0.12)', border: 'rgba(245,165,36,0.30)' },
  WON: { label: 'Gagné', bg: 'rgba(46,204,113,0.12)', border: 'rgba(46,204,113,0.30)' },
  LOST: { label: 'Perdu', bg: 'rgba(255,77,79,0.12)', border: 'rgba(255,77,79,0.30)' },
};

export default function DStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, bg: 'var(--line)', border: 'var(--line)' };
  return (
    <Chip
      label={s.label}
      size="small"
      sx={{
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 'var(--radius-pill)',
        fontSize: '12px',
        fontWeight: 600,
        height: 24,
      }}
    />
  );
}
