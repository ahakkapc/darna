'use client';

import { ReactNode, useState } from 'react';
import MuiButton, { ButtonProps as MuiButtonProps } from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Popover from '@mui/material/Popover';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { colors, typography } from '../tokens';

type DSVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type DSSize = 'sm' | 'md' | 'lg';

interface ConfirmConfig {
  title: string;
  body?: string;
  confirmLabel?: string;
}

interface DSButtonProps {
  variant?: DSVariant;
  size?: DSSize;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  confirm?: ConfirmConfig;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
}

const VARIANT_MAP: Record<DSVariant, Pick<MuiButtonProps, 'variant' | 'color'>> = {
  primary: { variant: 'contained', color: 'primary' },
  secondary: { variant: 'outlined', color: 'primary' },
  ghost: { variant: 'text', color: 'primary' },
  danger: { variant: 'contained', color: 'error' },
};

const SIZE_MAP: Record<DSSize, MuiButtonProps['size']> = {
  sm: 'small',
  md: 'medium',
  lg: 'large',
};

export default function DSButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  confirm,
  onClick,
  children,
  className,
  fullWidth,
  type = 'button',
}: DSButtonProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const muiProps = VARIANT_MAP[variant];
  const muiSize = SIZE_MAP[size];

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (confirm) {
      setAnchorEl(e.currentTarget);
    } else {
      onClick?.();
    }
  };

  const handleConfirm = () => {
    setAnchorEl(null);
    onClick?.();
  };

  const dangerSx = variant === 'danger' ? {
    backgroundColor: colors.state.error,
    '&:hover': { backgroundColor: `${colors.state.error}CC` },
  } : {};

  return (
    <>
      <MuiButton
        {...muiProps}
        size={muiSize}
        disabled={disabled || loading}
        onClick={handleClick}
        className={className}
        fullWidth={fullWidth}
        type={type}
        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : leftIcon}
        endIcon={rightIcon}
        sx={dangerSx}
      >
        {children}
      </MuiButton>
      {confirm && (
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Box sx={{ p: 2, maxWidth: 280 }}>
            <Typography sx={{ fontWeight: typography.weight.semibold, mb: 0.5 }}>{confirm.title}</Typography>
            {confirm.body && <Typography variant="body2" sx={{ color: colors.text[1], mb: 1.5 }}>{confirm.body}</Typography>}
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <MuiButton size="small" onClick={() => setAnchorEl(null)}>Annuler</MuiButton>
              <MuiButton size="small" variant="contained" color="error" onClick={handleConfirm}>
                {confirm.confirmLabel ?? 'Confirmer'}
              </MuiButton>
            </Box>
          </Box>
        </Popover>
      )}
    </>
  );
}
