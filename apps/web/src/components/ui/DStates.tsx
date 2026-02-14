'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { SmileySad, ShieldWarning, MagnifyingGlass, Warning } from '@phosphor-icons/react';

interface StateBaseProps {
  title: string;
  desc?: string;
  cta?: { label: string; onClick: () => void };
}

function StateBase({
  icon,
  title,
  desc,
  cta,
  requestId,
}: StateBaseProps & { icon: React.ReactNode; requestId?: string }) {
  return (
    <Box sx={{ textAlign: 'center', py: 'var(--space-32)', px: 'var(--space-16)' }}>
      <Box sx={{ mb: 'var(--space-16)', color: 'var(--muted-2)' }}>{icon}</Box>
      <Typography variant="h2" sx={{ mb: 'var(--space-8)' }}>
        {title}
      </Typography>
      {desc && (
        <Typography sx={{ color: 'var(--muted)', mb: 'var(--space-16)' }}>{desc}</Typography>
      )}
      {requestId && (
        <Typography
          sx={{
            color: 'var(--muted-2)',
            fontSize: '12px',
            fontFamily: 'monospace',
            mb: 'var(--space-16)',
          }}
        >
          Request ID: {requestId}
        </Typography>
      )}
      {cta && (
        <Button variant="contained" color="primary" onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </Box>
  );
}

export function DEmptyState(props: StateBaseProps) {
  return <StateBase icon={<MagnifyingGlass size={48} weight="duotone" />} {...props} />;
}

export function DErrorState({
  requestId,
  ...props
}: Partial<StateBaseProps> & { requestId?: string }) {
  return (
    <StateBase
      icon={<Warning size={48} weight="duotone" />}
      title={props.title ?? 'Une erreur est survenue'}
      desc={props.desc ?? 'Veuillez réessayer.'}
      cta={props.cta}
      requestId={requestId}
    />
  );
}

export function DForbiddenState(props?: Partial<StateBaseProps>) {
  return (
    <StateBase
      icon={<ShieldWarning size={48} weight="duotone" />}
      title={props?.title ?? 'Accès interdit'}
      desc={props?.desc ?? "Vous n'avez pas les droits pour accéder à cette ressource."}
    />
  );
}

export function DNotFoundState(props?: Partial<StateBaseProps>) {
  return (
    <StateBase
      icon={<SmileySad size={48} weight="duotone" />}
      title={props?.title ?? 'Introuvable'}
      desc={props?.desc ?? 'La ressource demandée est introuvable.'}
      cta={props?.cta}
    />
  );
}
