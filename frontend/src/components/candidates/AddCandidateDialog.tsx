'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import CloseIcon from '@mui/icons-material/Close';
import type { NewCandidateInput } from '@/types/candidate';
import { isValidEmail, normalizeMobile } from '@/lib/validation';

type FieldKey = keyof NewCandidateInput;

const FIELDS: { key: FieldKey; label: string; type?: string }[] = [
  { key: 'fullName', label: 'Candidate Name' },
  { key: 'mobile', label: 'Mobile Number', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
];

const EMPTY: NewCandidateInput = { fullName: '', mobile: '', email: '' };

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: NewCandidateInput) => Promise<void>;
}

export default function AddCandidateDialog({ open, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<NewCandidateInput>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setTouched({});
      setError(null);
    }
  }, [open]);

  const mobile = normalizeMobile(values.mobile);
  const errors: Record<FieldKey, string> = {
    fullName: values.fullName.trim() ? '' : 'Candidate name is required',
    mobile: mobile ? '' : 'Enter a valid 10-digit mobile number',
    email: isValidEmail(values.email) ? '' : 'Enter a valid email address',
  };
  const isValid = !errors.fullName && !errors.mobile && !errors.email;

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting || !mobile) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ fullName: values.fullName.trim(), mobile, email: values.email.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : typeof err === 'string' ? err : 'Could not add candidate');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      sx={{ '& .MuiDialog-paper': { maxWidth: 440 } }}
      aria-labelledby="add-candidate-title"
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle
          id="add-candidate-title"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}
        >
          Add Candidate
          <IconButton size="small" aria-label="Close" onClick={handleClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: '12px !important', pb: 3 }}>
          <Stack spacing={1}>
            {error && <Alert severity="error">{error}</Alert>}
            {FIELDS.map(({ key, label, type }) => (
              <TextField
                key={key}
                required
                fullWidth
                label={label}
                type={type}
                value={values[key]}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
                error={Boolean(touched[key] && errors[key])}
                helperText={touched[key] && errors[key] ? errors[key] : ' '}
                sx={{ '& .MuiFormLabel-asterisk': { color: 'error.main' } }}
              />
            ))}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button variant="outlined" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!isValid || submitting}>
            Add candidate
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
