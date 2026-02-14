'use client';

import { ReactNode } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import { X } from '@phosphor-icons/react';
import { colors, spacing, iconSize } from '../tokens';
import DSButton from './DSButton';

interface DSModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  closeOnOverlay?: boolean;
}

export default function DSModal({
  open,
  onClose,
  title,
  children,
  actions,
  maxWidth = 'sm',
  className,
  closeOnOverlay = true,
}: DSModalProps) {
  return (
    <Dialog
      open={open}
      onClose={closeOnOverlay ? onClose : undefined}
      maxWidth={maxWidth}
      fullWidth
      className={className}
    >
      {title && (
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: spacing[2] }}>
          {title}
          <IconButton size="small" onClick={onClose}><X size={iconSize.action} /></IconButton>
        </DialogTitle>
      )}
      <DialogContent sx={{ pt: title ? `${spacing[2]} !important` : undefined }}>
        {children}
      </DialogContent>
      {actions && <DialogActions sx={{ px: spacing[6], pb: spacing[4] }}>{actions}</DialogActions>}
    </Dialog>
  );
}

interface DSConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  confirmLabel?: string;
  loading?: boolean;
  variant?: 'danger' | 'primary';
}

export function DSConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirmer', loading, variant = 'danger' }: DSConfirmModalProps) {
  return (
    <DSModal open={open} onClose={onClose} title={title} maxWidth="xs" actions={
      <>
        <DSButton variant="ghost" onClick={onClose}>Annuler</DSButton>
        <DSButton variant={variant} loading={loading} onClick={onConfirm}>{confirmLabel}</DSButton>
      </>
    }>
      {body && <Box sx={{ color: colors.text[1] }}>{body}</Box>}
    </DSModal>
  );
}
