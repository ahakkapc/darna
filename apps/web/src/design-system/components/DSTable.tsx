'use client';

import { ReactNode } from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Skeleton from '@mui/material/Skeleton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { colors, spacing, typography } from '../tokens';

export interface DSTableColumn<T> {
  key: string;
  label: string;
  width?: number | string;
  render: (row: T) => ReactNode;
  hideOnMobile?: boolean;
}

interface DSTableProps<T> {
  columns: DSTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  skeletonRows?: number;
  empty?: { title: string; desc?: string; cta?: { label: string; onClick: () => void } };
  stickyHeader?: boolean;
  className?: string;
  footer?: ReactNode;
}

export default function DSTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  skeletonRows = 8,
  empty,
  stickyHeader = true,
  className,
  footer,
}: DSTableProps<T>) {
  if (!loading && rows.length === 0 && empty) {
    return (
      <Box sx={{ textAlign: 'center', py: spacing[8] }}>
        <Typography variant="h2" sx={{ mb: spacing[2] }}>{empty.title}</Typography>
        {empty.desc && <Typography sx={{ color: colors.text[2], mb: spacing[4] }}>{empty.desc}</Typography>}
        {empty.cta && (
          <Button variant="contained" color="primary" onClick={empty.cta.onClick}>{empty.cta.label}</Button>
        )}
      </Box>
    );
  }

  return (
    <Box className={className}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow
              sx={{
                '& th': {
                  ...(stickyHeader && { position: 'sticky', top: 0, zIndex: 2 }),
                  backgroundColor: colors.bg[1],
                  borderBottom: `1px solid ${colors.border[0]}`,
                  color: colors.text[2],
                  fontSize: typography.scale.sm.fontSize,
                  fontWeight: typography.weight.semibold,
                  lineHeight: typography.scale.sm.lineHeight,
                  py: spacing[3],
                  whiteSpace: 'nowrap',
                },
              }}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  sx={{
                    width: col.width,
                    ...(col.hideOnMobile && { display: { xs: 'none', md: 'table-cell' } }),
                  }}
                >
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    {columns.map((col) => (
                      <TableCell key={col.key} sx={{ ...(col.hideOnMobile && { display: { xs: 'none', md: 'table-cell' } }) }}>
                        <Skeleton variant="text" sx={{ bgcolor: colors.border[0] }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    onClick={() => onRowClick?.(row)}
                    sx={{
                      cursor: onRowClick ? 'pointer' : 'default',
                      '& td': { borderBottom: `1px solid ${colors.border[0]}`, py: spacing[3], fontSize: typography.scale.md.fontSize },
                    }}
                  >
                    {columns.map((col) => (
                      <TableCell key={col.key} sx={{ ...(col.hideOnMobile && { display: { xs: 'none', md: 'table-cell' } }) }}>
                        {col.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </TableContainer>
      {footer && <Box sx={{ py: spacing[3], px: spacing[4], borderTop: `1px solid ${colors.border[0]}` }}>{footer}</Box>}
    </Box>
  );
}
