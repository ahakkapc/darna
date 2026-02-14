'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

interface DCursorLoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export default function DCursorLoadMore({ hasMore, loading, onLoadMore }: DCursorLoadMoreProps) {
  if (!hasMore) return null;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 'var(--space-24)' }}>
      <Button
        variant="outlined"
        onClick={onLoadMore}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={16} /> : undefined}
      >
        {loading ? 'Chargement…' : 'Charger plus'}
      </Button>
    </Box>
  );
}
