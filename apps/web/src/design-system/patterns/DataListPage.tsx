'use client';

import { ReactNode } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { colors, spacing, iconSize } from '../tokens';

interface SearchConfig {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

interface DataListFiltersProps {
  search?: SearchConfig;
  children?: ReactNode;
  onReset?: () => void;
}

export function DataListFilters({ search, children, onReset }: DataListFiltersProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing[3],
        flexWrap: 'wrap',
        mb: spacing[4],
        position: 'sticky',
        top: 64,
        zIndex: 10,
        py: spacing[3],
        backgroundColor: colors.bg[0],
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
                <MagnifyingGlass size={iconSize.action} weight="duotone" style={{ color: colors.text[2] }} />
              </InputAdornment>
            ),
          }}
        />
      )}
      {children}
      <Box sx={{ ml: 'auto', flexShrink: 0 }}>
        {onReset && (
          <Button variant="text" size="small" onClick={onReset} sx={{ color: colors.text[1] }}>
            Réinitialiser
          </Button>
        )}
      </Box>
    </Box>
  );
}

interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function DataListLoadMore({ hasMore, loading, onLoadMore }: LoadMoreProps) {
  if (!hasMore) return null;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: spacing[6] }}>
      <Button variant="outlined" onClick={onLoadMore} disabled={loading}>
        {loading ? 'Chargement…' : 'Charger plus'}
      </Button>
    </Box>
  );
}
