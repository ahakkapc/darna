'use client';

import { ReactNode } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { colors, spacing, radius, shadows } from '../tokens';

interface DSCardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  hoverable?: boolean;
  elevated?: boolean;
  className?: string;
  noPadding?: boolean;
}

export default function DSCard({ title, subtitle, actions, children, hoverable, elevated, className, noPadding }: DSCardProps) {
  return (
    <Card
      className={className}
      sx={{
        transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
        ...(elevated && { boxShadow: shadows.md, border: `1px solid ${colors.border[1]}` }),
        ...(hoverable && {
          cursor: 'pointer',
          '&:hover': {
            transform: 'translateY(-1px)',
            borderColor: `${colors.brand.primary}59`,
            boxShadow: shadows.md,
          },
        }),
      }}
    >
      <CardContent sx={{ p: noPadding ? 0 : spacing[6], '&:last-child': { pb: noPadding ? 0 : spacing[6] } }}>
        {(title || actions) && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: spacing[4],
              ...(noPadding && { px: spacing[6], pt: spacing[6] }),
            }}
          >
            <Box>
              {title && <Typography variant="h2">{title}</Typography>}
              {subtitle && <Typography variant="body2" sx={{ color: colors.text[2], mt: spacing[1] }}>{subtitle}</Typography>}
            </Box>
            {actions && <Box sx={{ display: 'flex', gap: spacing[2], flexShrink: 0 }}>{actions}</Box>}
          </Box>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
