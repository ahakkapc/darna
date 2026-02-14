'use client';

import { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from 'next/link';
import { colors, spacing } from '../tokens';

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <Box sx={{ mb: spacing[6] }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs sx={{ mb: spacing[2], '& .MuiBreadcrumbs-separator': { color: colors.text[2] } }}>
          {breadcrumbs.map((c, i) =>
            c.href ? (
              <Link key={i} href={c.href} style={{ color: colors.text[2], textDecoration: 'none', fontSize: 13 }}>
                {c.label}
              </Link>
            ) : (
              <Typography key={i} sx={{ color: colors.text[0], fontSize: 13 }}>{c.label}</Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing[4], flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h1">{title}</Typography>
          {subtitle && <Typography sx={{ color: colors.text[1], mt: spacing[1] }}>{subtitle}</Typography>}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: spacing[2], flexShrink: 0 }}>{actions}</Box>}
      </Box>
    </Box>
  );
}

interface PageBodyProps {
  children: ReactNode;
  maxWidth?: number;
  className?: string;
}

export function PageBody({ children, maxWidth = 1200, className }: PageBodyProps) {
  return (
    <Box
      className={className}
      sx={{
        maxWidth,
        mx: 'auto',
        px: { xs: spacing[3], sm: spacing[4], md: spacing[6] },
        py: spacing[6],
      }}
    >
      {children}
    </Box>
  );
}

interface PageSectionProps {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  gap?: string;
}

export function PageSection({ children, columns = 1, gap = spacing[6] }: PageSectionProps) {
  const gridCols = columns === 1 ? '1fr' : columns === 2 ? { xs: '1fr', lg: '1fr 1fr' } : { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' };
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, gap, mb: spacing[6] }}>
      {children}
    </Box>
  );
}
