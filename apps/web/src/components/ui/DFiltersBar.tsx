'use client';

import { ReactNode } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import { MagnifyingGlass } from '@phosphor-icons/react';

interface DFiltersBarProps {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  children?: ReactNode;
  onReset?: () => void;
}

export default function DFiltersBar({ search, children, onReset }: DFiltersBarProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-12)',
        flexWrap: 'wrap',
        mb: 'var(--space-16)',
        position: 'sticky',
        top: 64,
        zIndex: 10,
        py: 'var(--space-12)',
        backgroundColor: 'var(--bg-0)',
      }}
    >
      {search && (
        <TextField
          size="small"
          placeholder={search.placeholder ?? 'Rechercher…'}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          sx={{ width: { xs: '100%', md: 360 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <MagnifyingGlass size={18} weight="duotone" style={{ color: 'var(--muted-2)' }} />
              </InputAdornment>
            ),
          }}
        />
      )}
      {children}
      <Box sx={{ ml: 'auto', flexShrink: 0 }}>
        {onReset && (
          <Button variant="text" size="small" onClick={onReset} sx={{ color: 'var(--muted)' }}>
            Réinitialiser
          </Button>
        )}
      </Box>
    </Box>
  );
}
