'use client';

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Image from 'next/image';
import CloseIcon from '@mui/icons-material/Close';
import type { Candidate, CommunicationMessage } from '@/types/candidate';
import emptyHistory from '@/images/Interview.png';
import { candidateService } from '@/services/candidateService';
import { formatDate } from '@/lib/format';
import StatusChip from './StatusChip';

interface Props {
  candidate: Candidate | null;
  onClose: () => void;
}

function formatTime(sentAt: string): string {
  const date = new Date(sentAt);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function HistoryEntry({ message }: { message: CommunicationMessage }) {
  const date = formatDate(message.sentAt);
  const time = formatTime(message.sentAt);

  return (
    <Box sx={{ py: 1.75, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <Typography variant="caption" color="text.secondary">
          {date} {time && ` | ${time}`}
        </Typography>
        <StatusChip status={message.status} />
      </Box>
      <Typography variant="body2" sx={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {message.content}
      </Typography>
    </Box>
  );
}

export default function CommunicationHistoryDrawer({ candidate, onClose }: Props) {
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!candidate) return;

    let active = true;
    setLoading(true);
    setError(null);
    void candidateService
      .communicationHistory(candidate.id)
      .then((history) => {
        if (active) setMessages([...history].sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt)));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load communication history');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [candidate, retry]);

  return (
    <Drawer
      anchor="right"
      open={candidate !== null}
      onClose={onClose}
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.12)', backdropFilter: 'blur(2px)' } },
        paper: {
          sx: {
            width: { xs: '100%', sm: '46vw' },
            maxWidth: 440,
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
      aria-labelledby="communication-history-title"
    >
      {candidate && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 1.5 }}>
            <Typography id="communication-history-title" component="h2" variant="body2" fontWeight={700}>
              Communication history
            </Typography>
            <IconButton size="small" aria-label="Close communication history" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ px: 3, pb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              Candidate ID: {candidate.id}
            </Typography>
            <Typography component="h3" sx={{ mt: 0.5, fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>
              {candidate.fullName}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25, fontSize: 12.5 }}>
              {candidate.mobile}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, fontSize: 12 }}>
              {candidate.email}
            </Typography>
          </Box>

          <Box sx={{ mx: 3, borderTop: '1px solid', borderColor: 'divider' }} />

          <Box sx={{ flex: 1, overflowY: 'auto', px: 3 }}>
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={22} />
              </Box>
            )}
            {error && (
              <Alert
                severity="error"
                sx={{ mt: 2 }}
                action={
                  <IconButton
                    color="inherit"
                    size="small"
                    aria-label="Retry loading history"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    <Typography variant="caption">Retry</Typography>
                  </IconButton>
                }
              >
                {error}
              </Alert>
            )}
            {!loading && !error && messages.length === 0 && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  height: '100%',
                  minHeight: 280,
                  px: 2,
                }}
              >
                <Image src={emptyHistory} alt="" width={160} height={120} />
                <Typography variant="body2" fontWeight={700} sx={{ mt: 2 }}>
                  No communication history
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, maxWidth: 300, lineHeight: 1.4 }}>
                  You have not communicated with this candidate yet.
                  <br />
                  When you send them a message, it will appear here.
                </Typography>
              </Box>
            )}
            {!loading && !error && messages.map((message) => <HistoryEntry key={message.id} message={message} />)}
          </Box>
        </>
      )}
    </Drawer>
  );
}
