'use client';

import { ReactNode, useEffect } from 'react';
import MuiDrawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { X } from '@phosphor-icons/react';
import { colors, spacing, iconSize } from '../tokens';

interface DSDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  closeOnOverlay?: boolean;
}

export default function DSDrawer({
  open,
  onClose,
  title,
  width = 420,
  children,
  actions,
  className,
  closeOnOverlay = true,
}: DSDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <MuiDrawer
      anchor="right"
      open={open}
      onClose={closeOnOverlay ? onClose : undefined}
      className={className}
      PaperProps={{ sx: { width: { xs: '100%', sm: width } } }}
    >
      {title && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: spacing[6], py: spacing[4], borderBottom: `1px solid ${colors.border[0]}` }}>
          <Typography variant="h2">{title}</Typography>
          <IconButton size="small" onClick={onClose}><X size={iconSize.action} /></IconButton>
        </Box>
      )}
      <Box sx={{ flex: 1, overflow: 'auto', p: spacing[6] }}>{children}</Box>
      {actions && (
        <Box sx={{ display: 'flex', gap: spacing[2], justifyContent: 'flex-end', px: spacing[6], py: spacing[4], borderTop: `1px solid ${colors.border[0]}` }}>
          {actions}
        </Box>
      )}
    </MuiDrawer>
  );
}
