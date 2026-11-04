import type { ReactElement } from 'react';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type { MessageStatus } from '@/types/candidate';

const CONFIG: Record<MessageStatus, { label: string; color: string; bg: string; icon?: ReactElement }> = {
  pending: { label: 'Pending', color: '#8a6d1d', bg: '#fff4d6' },
  failed: { label: 'Failed', color: '#c62828', bg: '#fdecea', icon: <ErrorOutlineIcon /> },
  delivered: { label: 'Delivered', color: '#2e7d32', bg: '#e6f4ea', icon: <CheckIcon /> },
  sent: { label: 'Sent', color: '#1d5fa8', bg: '#e3f0fb' },
};

export default function StatusChip({ status }: { status: MessageStatus | null }) {
  if (!status) {
    return (
      <Typography component="span" variant="body2" color="text.disabled">
        NA
      </Typography>
    );
  }
  const { label, color, bg, icon } = CONFIG[status];
  return (
    <Chip
      size="small"
      label={label}
      icon={icon}
      sx={{
        height: 20,
        fontSize: 11,
        fontWeight: 500,
        color,
        bgcolor: bg,
        '& .MuiChip-icon': { color: 'inherit', fontSize: 14, ml: '6px' },
      }}
    />
  );
}
