'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import type { Candidate } from '@/types/candidate';

interface Props {
  open: boolean;
  candidates: Candidate[];
  sending: boolean;
  onClose: () => void;
  onSend: (message: string) => Promise<void>;
}

const RECIPIENT_GAP = 6;
const MAX_VISIBLE_RECIPIENTS = 7;

function RecipientChips({ candidates }: { candidates: Candidate[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [visibleCount, setVisibleCount] = useState(() => Math.min(candidates.length, MAX_VISIBLE_RECIPIENTS));

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateVisibleCount = () => {
      const availableWidth = container.clientWidth;
      if (!availableWidth) return;

      const chipWidths = candidates.map((_, index) => chipRefs.current[index]?.getBoundingClientRect().width ?? 0);
      let nextVisibleCount = Math.min(candidates.length, MAX_VISIBLE_RECIPIENTS);

      const fitsInTwoRows = (count: number) => {
        let row = 1;
        let rowWidth = 0;
        const hiddenCount = candidates.length - count;
        const widths = chipWidths.slice(0, count);
        if (hiddenCount > 0) widths.push(10 + String(hiddenCount).length * 7);

        for (const width of widths) {
          if (rowWidth > 0 && rowWidth + RECIPIENT_GAP + width > availableWidth) {
            row += 1;
            rowWidth = 0;
          }
          if (row > 2) return false;
          rowWidth += (rowWidth > 0 ? RECIPIENT_GAP : 0) + width;
        }
        return true;
      };

      while (nextVisibleCount > 0 && !fitsInTwoRows(nextVisibleCount)) {
        nextVisibleCount -= 1;
      }

      setVisibleCount((current) => (current === nextVisibleCount ? current : nextVisibleCount));
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(container);
    return () => observer.disconnect();
  }, [candidates]);

  const visibleCandidates = candidates.slice(0, visibleCount);
  const hiddenCount = candidates.length - visibleCandidates.length;

  return (
    <>
      <Box
        ref={containerRef}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          gap: `${RECIPIENT_GAP}px`,
          maxHeight: 54,
          overflow: 'hidden',
        }}
      >
        {visibleCandidates.map((candidate) => (
          <Chip
            key={candidate.id}
            label={candidate.fullName}
            size="small"
            sx={{
              height: 24,
              maxWidth: '100%',
              bgcolor: '#f1f3f5',
              '& .MuiChip-label': { px: 1, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis' },
            }}
          />
        ))}
        {hiddenCount > 0 && (
          <Typography variant="caption" sx={{ alignSelf: 'center', pl: 0.25, whiteSpace: 'nowrap' }}>
            + {hiddenCount}
          </Typography>
        )}
      </Box>
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          left: -10000,
          top: 0,
          display: 'flex',
          gap: `${RECIPIENT_GAP}px`,
          visibility: 'hidden',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {candidates.map((candidate, index) => (
          <Chip
            key={candidate.id}
            ref={(element: HTMLDivElement | null) => {
              chipRefs.current[index] = element;
            }}
            label={candidate.fullName}
            size="small"
            sx={{
              height: 24,
              bgcolor: '#f1f3f5',
              '& .MuiChip-label': { px: 1, fontSize: 10.5 },
            }}
          />
        ))}
      </Box>
    </>
  );
}

export default function SendMessageDrawer({ open, candidates, sending, onClose, onSend }: Props) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMessage('');
      setError(null);
    }
  }, [open]);

  const handleClose = () => {
    if (!sending) onClose();
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text || sending) return;

    setError(null);
    try {
      await onSend(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message');
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.12)', backdropFilter: 'blur(2px)' } },
        paper: {
          sx: {
            width: { xs: '100%', sm: '46vw' },
            maxWidth: 440,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        },
      }}
      aria-labelledby="send-message-title"
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          pt: 2.5,
          pb: 2,
        }}
      >
        <Typography id="send-message-title" component="h2" variant="body2" fontWeight={700}>
          Send Message
        </Typography>
        <IconButton size="small" aria-label="Close" onClick={handleClose} disabled={sending}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ px: 3, pb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
          {candidates.length} {candidates.length === 1 ? 'Recipient' : 'Recipients'}
        </Typography>
        <RecipientChips candidates={candidates} />
      </Box>

      <Box sx={{ px: 3, pt: 1 }}>
        <Typography component="label" htmlFor="send-message-content" variant="caption" fontWeight={700}>
          Message <Box component="span" sx={{ color: 'error.main' }}>*</Box>
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, fontSize: 10.5 }}>
          Type, or paste the message you want to send.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        <TextField
          id="send-message-content"
          fullWidth
          multiline
          minRows={6}
          placeholder="Type or paste here..."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={sending}
          inputProps={{ 'aria-label': 'Message' }}
          sx={{
            '& .MuiOutlinedInput-root': { alignItems: 'flex-start', fontSize: 12, lineHeight: 1.5 },
            '& .MuiInputBase-input': { p: 0 },
          }}
        />
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          mt: 'auto',
          px: 3,
          py: 2.5,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Button variant="outlined" onClick={handleClose} disabled={sending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleSend()} disabled={!message.trim() || sending}>
          Send Message
        </Button>
      </Box>
    </Drawer>
  );
}
