'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import FilterListIcon from '@mui/icons-material/FilterList';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function ColumnFilter({ label, value, onChange }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const active = value.trim().length > 0;

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Filter ${label}`}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ color: active ? 'primary.main' : 'text.secondary' }}
      >
        <FilterListIcon fontSize="small" />
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            autoFocus
            size="small"
            placeholder={`Filter ${label.toLowerCase()}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <Button onClick={() => onChange('')} disabled={!active}>
            Clear
          </Button>
        </Box>
      </Popover>
    </>
  );
}
