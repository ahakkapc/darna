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

export interface DTableColumn<T> {
  key: string;
  label: string;
  width?: number | string;
  render: (row: T) => ReactNode;
}

interface DTableProps<T> {
  columns: DTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: { title: string; desc?: string; cta?: { label: string; onClick: () => void } };
}

export default function DTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
}: DTableProps<T>) {
  if (!loading && rows.length === 0 && empty) {
    return (
      <Box sx={{ textAlign: 'center', py: 'var(--space-32)' }}>
        <Typography variant="h2" sx={{ mb: 'var(--space-8)' }}>
          {empty.title}
        </Typography>
        {empty.desc && (
          <Typography sx={{ color: 'var(--muted)', mb: 'var(--space-16)' }}>
            {empty.desc}
          </Typography>
        )}
        {empty.cta && (
          <Button variant="contained" color="primary" onClick={empty.cta.onClick}>
            {empty.cta.label}
          </Button>
        )}
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow
            sx={{
              '& th': {
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--bg-1)',
                borderBottom: '1px solid var(--line)',
                color: 'var(--muted)',
                fontSize: '12px',
                fontWeight: 600,
                lineHeight: '16px',
                py: 'var(--space-12)',
                whiteSpace: 'nowrap',
              },
            }}
          >
            {columns.map((col) => (
              <TableCell key={col.key} sx={{ width: col.width }}>
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`skel-${i}`}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton variant="text" sx={{ bgcolor: 'var(--line)' }} />
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
                    '& td': {
                      borderBottom: '1px solid var(--line)',
                      py: 'var(--space-12)',
                      fontSize: '14px',
                    },
                  }}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key}>{col.render(row)}</TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
