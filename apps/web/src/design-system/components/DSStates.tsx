'use client';

import { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { SmileySad, ShieldWarning, MagnifyingGlass, Warning } from '@phosphor-icons/react';
import { colors, spacing, iconSize } from '../tokens';
import DSButton from './DSButton';

interface StateBaseProps {
  title: string;
  desc?: string;
  cta?: { label: string; onClick: () => void };
  icon?: ReactNode;
  requestId?: string;
}

function StateBase({ icon, title, desc, cta, requestId }: StateBaseProps) {
  return (
    <Box sx={{ textAlign: 'center', py: spacing[8], px: spacing[4] }}>
      {icon && <Box sx={{ mb: spacing[4], color: colors.text[2] }}>{icon}</Box>}
      <Typography variant="h2" sx={{ mb: spacing[2] }}>{title}</Typography>
      {desc && <Typography sx={{ color: colors.text[1], mb: spacing[4] }}>{desc}</Typography>}
      {requestId && (
        <Typography sx={{ color: colors.text[2], fontSize: '12px', fontFamily: 'monospace', mb: spacing[4] }}>
          Request ID: {requestId}
        </Typography>
      )}
      {cta && <DSButton variant="primary" onClick={cta.onClick}>{cta.label}</DSButton>}
    </Box>
  );
}

export function DSEmptyState(props: Omit<StateBaseProps, 'icon'> & { icon?: ReactNode }) {
  return <StateBase icon={props.icon ?? <MagnifyingGlass size={iconSize.xxl} weight="duotone" />} {...props} />;
}

export function DSErrorState({ requestId, ...props }: Partial<Omit<StateBaseProps, 'icon'>> & { requestId?: string }) {
  return (
    <StateBase
      icon={<Warning size={iconSize.xxl} weight="duotone" />}
      title={props.title ?? 'Une erreur est survenue'}
      desc={props.desc ?? 'Veuillez réessayer.'}
      cta={props.cta}
      requestId={requestId}
    />
  );
}

export function DSForbiddenState(props?: Partial<Omit<StateBaseProps, 'icon'>>) {
  return (
    <StateBase
      icon={<ShieldWarning size={iconSize.xxl} weight="duotone" />}
      title={props?.title ?? 'Accès interdit'}
      desc={props?.desc ?? "Vous n'avez pas les droits pour accéder à cette ressource."}
    />
  );
}

export function DSNotFoundState(props?: Partial<Omit<StateBaseProps, 'icon'>>) {
  return (
    <StateBase
      icon={<SmileySad size={iconSize.xxl} weight="duotone" />}
      title={props?.title ?? 'Introuvable'}
      desc={props?.desc ?? 'La ressource demandée est introuvable.'}
      cta={props?.cta}
    />
  );
}

export function DSSkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} sx={{ display: 'flex', gap: spacing[4] }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} variant="text" sx={{ flex: 1, bgcolor: colors.border[0] }} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function DSSkeletonCard() {
  return (
    <Box sx={{ p: spacing[6], border: `1px solid ${colors.border[0]}`, borderRadius: '16px' }}>
      <Skeleton variant="text" width="40%" sx={{ bgcolor: colors.border[0], mb: spacing[2] }} />
      <Skeleton variant="text" sx={{ bgcolor: colors.border[0], mb: spacing[1] }} />
      <Skeleton variant="text" width="60%" sx={{ bgcolor: colors.border[0] }} />
    </Box>
  );
}
