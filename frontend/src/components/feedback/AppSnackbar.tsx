'use client';

import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CloseIcon from '@mui/icons-material/Close';
import type { ReactNode } from 'react';

export type NotificationSeverity = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
  message: string;
  severity: NotificationSeverity;
}

interface Props {
  notification: AppNotification | null;
  onClose: () => void;
  action?: ReactNode;
}

const STYLES: Record<
  NotificationSeverity,
  { background: string; color: string; iconColor: string; icon: ReactNode }
> = {
  success: {
    background: '#edf7ed',
    color: '#1e4620',
    iconColor: '#2e7d32',
    icon: <CheckCircleOutlineIcon fontSize="small" />,
  },
  error: {
    background: '#fdeded',
    color: '#5f2120',
    iconColor: '#d32f2f',
    icon: <ErrorOutlineIcon fontSize="small" />,
  },
  warning: {
    background: '#fff4e5',
    color: '#663c00',
    iconColor: '#ed6c02',
    icon: <WarningAmberOutlinedIcon fontSize="small" />,
  },
  info: {
    background: '#e5f6fd',
    color: '#014361',
    iconColor: '#0288d1',
    icon: <InfoOutlinedIcon fontSize="small" />,
  },
};

export default function AppSnackbar({ notification, onClose, action }: Props) {
  const style = notification ? STYLES[notification.severity] : STYLES.success;

  return (
    <Snackbar
      open={notification !== null}
      autoHideDuration={3500}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onClose();
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      sx={{ mb: { xs: 1, sm: 0 }, mr: { xs: 1, sm: 1.5 } }}
    >
      <Box
        role={notification?.severity === 'error' ? 'alert' : 'status'}
        aria-live={notification?.severity === 'error' ? 'assertive' : 'polite'}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          minHeight: 40,
          maxWidth: { xs: 'calc(100vw - 24px)', sm: 420 },
          px: 1.5,
          py: 1,
          borderRadius: 1,
          backgroundColor: style.background,
          color: style.color,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
        }}
      >
        <Box sx={{ display: 'flex', color: style.iconColor, flex: '0 0 auto' }}>{style.icon}</Box>
        <Typography variant="body2" sx={{ fontSize: 12, flex: 1 }}>
          {notification?.message}
        </Typography>
        {action}
        <IconButton
          size="small"
          aria-label="Dismiss notification"
          onClick={onClose}
          sx={{ color: style.color, p: 0.25 }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Snackbar>
  );
}
