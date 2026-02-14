'use client';

import TextField from '@mui/material/TextField';

interface DDateTimePickerProps {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  required?: boolean;
}

export default function DDateTimePicker({ value, onChange, label, required }: DDateTimePickerProps) {
  const localValue = value ? toLocalInput(value) : '';

  return (
    <TextField
      type="datetime-local"
      size="small"
      fullWidth
      label={label}
      required={required}
      value={localValue}
      onChange={(e) => {
        const val = e.target.value;
        if (val) {
          onChange(new Date(val).toISOString());
        } else {
          onChange('');
        }
      }}
      InputLabelProps={{ shrink: true }}
    />
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
