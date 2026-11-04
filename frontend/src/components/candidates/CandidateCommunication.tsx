'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import type { Candidate, NewCandidateInput } from '@/types/candidate';
import AppSnackbar, { type AppNotification } from '@/components/feedback/AppSnackbar';
import { useCandidates } from '@/hooks/useCandidates';
import AddCandidateDialog from './AddCandidateDialog';
import CandidateTable from './CandidateTable';
import CandidateToolbar from './CandidateToolbar';
import DeleteCandidateDialog from './DeleteCandidateDialog';
import SendMessageDrawer from './SendMessageDrawer';
import CommunicationHistoryDrawer from './CommunicationHistoryDrawer';

export default function CandidateCommunication() {
  const {
    candidates,
    loading,
    error,
    refresh,
    addCandidate,
    deleteCandidates,
    sendMessage,
  } = useCandidates();

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [historyCandidate, setHistoryCandidate] = useState<Candidate | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<Candidate[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);

  const handleAdd = async (input: NewCandidateInput) => {
    await addCandidate(input);
    setAddOpen(false);
    setToast({ message: 'Candidate added successfully', severity: 'success' });
  };

  const openDelete = () => {
    setDeleteTargets(candidates.filter((c) => selectedIds.includes(c.id)));
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    const ids = deleteTargets.map((c) => c.id);
    const result = await deleteCandidates(ids);
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    setDeleteOpen(false);
    const deletedCount = result.deleted.length;
    const deletedMessage = deletedCount === 1
      ? 'Candidate deleted successfully'
      : `${deletedCount} Candidates deleted successfully`;
    const missingMessage =
      result.notFound.length > 0
        ? ` ${result.notFound.length} ${result.notFound.length === 1 ? 'candidate was' : 'candidates were'} already missing.`
        : '';
    setToast({
      message: `${deletedMessage}${missingMessage}`,
      severity: result.deleted.length === 0 && result.notFound.length > 0 ? 'warning' : 'success',
    });
  };

  const handleSend = async (message: string) => {
    setSending(true);
    try {
      const result = await sendMessage(selectedIds, message);
      setToast({
        message: result.queued
          ? `Message queued for ${result.recipientCount} ${result.recipientCount === 1 ? 'candidate' : 'candidates'}${result.batchId ? ` (batch #${result.batchId})` : ''}.`
          : result.recipientCount === 1
            ? 'Message sent'
            : `Message sent to ${result.recipientCount} candidates`,
        severity: 'success',
      });
      setSelectedIds([]);
      setSendOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box component="main" sx={{ height: '100vh', p: { xs: 1, md: 2 }, display: 'flex' }}>
      <Paper variant="outlined" sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <CandidateToolbar
          selectedCount={selectedIds.length}
          sending={sending}
          search={search}
          onSearchChange={setSearch}
          onAdd={() => setAddOpen(true)}
          onDelete={openDelete}
          onSend={() => setSendOpen(true)}
        />

        <Box sx={{ height: 3 }}>{loading && <LinearProgress />}</Box>

        {error && (
          <Alert
            severity="error"
            sx={{ mx: 3, mb: 1 }}
            action={
              <Button color="inherit" onClick={() => void refresh()}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        <CandidateTable
          candidates={candidates}
          search={search}
          loading={loading}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onCandidateClick={setHistoryCandidate}
        />
      </Paper>

      <AddCandidateDialog open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      <DeleteCandidateDialog
        open={deleteOpen}
        candidates={deleteTargets}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
      <SendMessageDrawer
        open={sendOpen}
        candidates={candidates.filter((candidate) => selectedIds.includes(candidate.id))}
        sending={sending}
        onClose={() => setSendOpen(false)}
        onSend={handleSend}
      />
      <CommunicationHistoryDrawer candidate={historyCandidate} onClose={() => setHistoryCandidate(null)} />

      <AppSnackbar notification={toast} onClose={() => setToast(null)} />
    </Box>
  );
}
