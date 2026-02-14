'use client';

import { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface DPageProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function DPage({ title, subtitle, actions, children }: DPageProps) {
  return (
    <Box
      sx={{
        maxWidth: 1200,
        mx: 'auto',
        px: { xs: 'var(--space-12)', sm: 'var(--space-16)', md: 'var(--space-24)' },
        py: 'var(--space-24)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          mb: 'var(--space-24)',
          gap: 'var(--space-16)',
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h1" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ color: 'var(--muted)', mt: 'var(--space-4)' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 'var(--space-8)', flexShrink: 0 }}>{actions}</Box>}
      </Box>
      {children}
    </Box>
  );
}
