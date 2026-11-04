'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';

interface Props {
  selectedCount: number;
  sending: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onSend: () => void;
}

export default function CandidateToolbar({
  selectedCount,
  sending,
  search,
  onSearchChange,
  onAdd,
  onDelete,
  onSend,
}: Props) {
  const hasSelection = selectedCount > 0;

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        px: 3,
        py: 2,
      }}
    >
      <Typography component="h1" variant="h6" fontWeight={700}>
        Candidate communication
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={onAdd}>
          Add candidate
        </Button>
        <Button variant="contained" startIcon={<DeleteIcon />} disabled={!hasSelection} onClick={onDelete}>
          Delete candidate
        </Button>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          disabled={!hasSelection || sending}
          onClick={onSend}
        >
          Send message
        </Button>
        <TextField
          size="small"
          placeholder="Search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { 'aria-label': 'Search candidates' },
          }}
          sx={{ width: 170, '& .MuiInputBase-root': { height: 32, fontSize: 12 } }}
        />
      </Box>
    </Box>
  );
}
