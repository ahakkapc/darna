'use client';

import { useState, KeyboardEvent } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

const TAG_REGEX = /^[a-z0-9_-]{1,20}$/;
const MAX_TAGS = 10;

interface DTagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export default function DTagInput({ value, onChange, placeholder }: DTagInputProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const addTag = (raw: string) => {
    const tag = raw.toLowerCase().trim();
    if (!tag) return;
    if (!TAG_REGEX.test(tag)) {
      setError('Format: a-z, 0-9, _, - (max 20 car.)');
      return;
    }
    if (value.includes(tag)) {
      setError('Tag déjà ajouté');
      return;
    }
    if (value.length >= MAX_TAGS) {
      setError(`Maximum ${MAX_TAGS} tags`);
      return;
    }
    setError('');
    onChange([...value, tag]);
    setInput('');
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          mb: value.length > 0 ? 'var(--space-8)' : 0,
        }}
      >
        {value.map((tag) => (
          <Chip key={tag} label={tag} size="small" onDelete={() => removeTag(tag)} />
        ))}
      </Box>
      <TextField
        size="small"
        fullWidth
        placeholder={placeholder ?? 'Ajouter un tag…'}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError('');
        }}
        onKeyDown={handleKey}
        onBlur={() => { if (input) addTag(input); }}
        error={!!error}
        helperText={error || `${value.length}/${MAX_TAGS}`}
      />
    </Box>
  );
}
