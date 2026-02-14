'use client';

import { ReactNode } from 'react';
import Chip from '@mui/material/Chip';
import { colors, radius, typography } from '../tokens';

export type BadgeVariant = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'brand';

const VARIANT_MAP: Record<BadgeVariant, { bg: string; border: string; color: string }> = {
  neutral: { bg: 'rgba(234,240,246,0.08)', border: colors.border[0], color: colors.text[1] },
  success: { bg: `${colors.state.success}1F`, border: `${colors.state.success}4D`, color: colors.state.success },
  warn: { bg: `${colors.state.warn}1F`, border: `${colors.state.warn}4D`, color: colors.state.warn },
  danger: { bg: `${colors.state.error}1F`, border: `${colors.state.error}4D`, color: colors.state.error },
  info: { bg: `${colors.state.info}1F`, border: `${colors.state.info}4D`, color: colors.state.info },
  brand: { bg: `${colors.brand.primary}1A`, border: `${colors.brand.primary}40`, color: colors.brand.primary },
};

interface DSBadgeProps {
  variant?: BadgeVariant;
  label: string;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

export default function DSBadge({ variant = 'neutral', label, icon, size = 'sm', className }: DSBadgeProps) {
  const v = VARIANT_MAP[variant];
  return (
    <Chip
      label={label}
      icon={icon ? <>{icon}</> : undefined}
      size="small"
      className={className}
      sx={{
        backgroundColor: v.bg,
        border: `1px solid ${v.border}`,
        color: v.color,
        borderRadius: radius.pill,
        fontSize: size === 'sm' ? typography.scale.xs.fontSize : typography.scale.sm.fontSize,
        fontWeight: typography.weight.semibold,
        height: size === 'sm' ? 22 : 26,
        '& .MuiChip-icon': { fontSize: 14, color: 'inherit', ml: '6px' },
      }}
    />
  );
}

export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  NEW: 'info',
  TO_CONTACT: 'info',
  VISIT_SCHEDULED: 'brand',
  OFFER_IN_PROGRESS: 'warn',
  WON: 'success',
  LOST: 'danger',
  OPEN: 'success',
  PENDING: 'warn',
  CLOSED: 'neutral',
  RUNNING: 'success',
  COMPLETED: 'info',
  CANCELED: 'neutral',
  FAILED: 'danger',
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warn',
  ARCHIVED: 'neutral',
  SENT: 'success',
  DELIVERED: 'success',
  QUEUED: 'info',
  SKIPPED: 'warn',
  SCHEDULED: 'info',
  READ: 'success',
  RECEIVED: 'info',
};

export function DSStatusBadge({ status, label }: { status: string; label?: string }) {
  return <DSBadge variant={STATUS_VARIANT[status] ?? 'neutral'} label={label ?? status} />;
}
