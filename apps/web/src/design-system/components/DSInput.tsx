'use client';

import { ReactNode, KeyboardEvent } from 'react';
import TextField, { TextFieldProps } from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { colors, typography } from '../tokens';

interface DSInputProps {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  onEnter?: () => void;
  disabled?: boolean;
  className?: string;
  multiline?: boolean;
  rows?: number;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  autoFocus?: boolean;
}

export default function DSInput({
  label,
  hint,
  error,
  prefix,
  suffix,
  onEnter,
  disabled,
  className,
  multiline,
  rows,
  value,
  onChange,
  placeholder,
  type,
  size = 'md',
  fullWidth = true,
  autoFocus,
}: DSInputProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };

  const inputProps: Partial<TextFieldProps['InputProps']> = {};
  if (prefix) inputProps.startAdornment = <InputAdornment position="start">{prefix}</InputAdornment>;
  if (suffix) inputProps.endAdornment = <InputAdornment position="end">{suffix}</InputAdornment>;

  return (
    <TextField
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={onEnter ? handleKeyDown : undefined}
      error={!!error}
      helperText={error || hint}
      disabled={disabled}
      className={className}
      multiline={multiline}
      rows={rows}
      type={type}
      size={size === 'sm' ? 'small' : 'medium'}
      fullWidth={fullWidth}
      autoFocus={autoFocus}
      InputProps={inputProps}
      FormHelperTextProps={{
        sx: { color: error ? colors.state.error : colors.text[2], fontSize: typography.scale.xs.fontSize },
      }}
    />
  );
}

export function DSTextarea(props: Omit<DSInputProps, 'multiline' | 'rows'> & { rows?: number }) {
  return <DSInput {...props} multiline rows={props.rows ?? 4} />;
}
