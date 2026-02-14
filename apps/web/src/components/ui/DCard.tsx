'use client';

import { ReactNode } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface DCardProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  hoverable?: boolean;
}

export default function DCard({ title, actions, children, hoverable = false }: DCardProps) {
  return (
    <Card
      sx={{
        transition: 'transform 0.15s, border-color 0.15s',
        ...(hoverable && {
          cursor: 'pointer',
          '&:hover': {
            transform: 'translateY(-1px)',
            borderColor: 'rgba(216,162,74,0.35)',
          },
        }),
      }}
    >
      <CardContent sx={{ p: 'var(--space-24)', '&:last-child': { pb: 'var(--space-24)' } }}>
        {(title || actions) && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 'var(--space-16)',
            }}
          >
            {title && <Typography variant="h2">{title}</Typography>}
            {actions && <Box sx={{ display: 'flex', gap: 'var(--space-8)' }}>{actions}</Box>}
          </Box>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
