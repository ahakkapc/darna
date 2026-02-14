'use client';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { List as MenuIcon } from '@phosphor-icons/react';

interface TopbarProps {
  onMenuClick: () => void;
  showMenu: boolean;
  children?: React.ReactNode;
}

export default function Topbar({ onMenuClick, showMenu, children }: TopbarProps) {
  return (
    <Box
      component="header"
      sx={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        px: 'var(--space-16)',
        borderBottom: '1px solid var(--line)',
        backgroundColor: 'var(--bg-1)',
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        gap: 'var(--space-12)',
      }}
    >
      {showMenu && (
        <IconButton onClick={onMenuClick} sx={{ color: 'var(--muted)' }}>
          <MenuIcon size={22} weight="bold" />
        </IconButton>
      )}
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: '16px',
          background: 'var(--grad-brand)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          display: { xs: 'block', md: 'none' },
        }}
      >
        Darna
      </Typography>
      <Box sx={{ flex: 1 }} />
      {children}
    </Box>
  );
}
