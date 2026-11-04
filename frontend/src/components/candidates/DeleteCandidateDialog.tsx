'use client';

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import type { Candidate } from '@/types/candidate';

interface Props {
  open: boolean;
  candidates: Candidate[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteCandidateDialog({ open, candidates, onClose, onConfirm }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const single = candidates.length === 1;
  const count = candidates.length;

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete candidate');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          width: 'calc(100% - 32px)',
          maxWidth: 440,
          minHeight: 260,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      aria-labelledby="delete-candidate-title"
    >
      <DialogTitle
        id="delete-candidate-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3.5,
          pt: 2.5,
          pb: 2,
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        Delete Candidate
        <IconButton size="small" aria-label="Close" onClick={handleClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3.5, pb: 3, flex: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          {single
            ? 'Are you sure you want to delete this Candidate?'
            : `Are you sure you want to delete ${count} Candidates?`}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          This action cannot be undone, and you&rsquo;ll lose all communication history with{' '}
          {single ? candidates[0]?.fullName : 'these candidates'}.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3.5, py: 2, gap: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button variant="outlined" onClick={handleClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" color="error" onClick={handleConfirm} disabled={pending || count === 0}>
          {single ? 'Delete candidate' : `Delete ${count} candidates`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
