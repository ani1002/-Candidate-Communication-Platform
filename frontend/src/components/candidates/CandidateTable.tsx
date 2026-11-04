'use client';

import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Candidate } from '@/types/candidate';
import { formatDate } from '@/lib/format';
import ColumnFilter from './ColumnFilter';
import EmptyState from './EmptyState';
import StatusChip from './StatusChip';

type ColumnKey = 'fullName' | 'mobile' | 'lastMessage' | 'status' | 'id';

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'fullName', label: 'Full name' },
  { key: 'mobile', label: 'Mobile number' },
  { key: 'lastMessage', label: 'Last message' },
  { key: 'status', label: 'Status' },
  { key: 'id', label: 'Candidate ID' },
];

/** Blank ruled rows drawn under the data so the grid always looks filled. */
const MIN_ROWS = 10;

function getText(c: Candidate, key: ColumnKey): string {
  switch (key) {
    case 'fullName':
      return c.fullName;
    case 'mobile':
      return c.mobile;
    case 'lastMessage':
      return formatDate(c.lastMessage);
    case 'status':
      return c.status ?? 'NA';
    case 'id':
      return c.id;
  }
}

interface Props {
  candidates: Candidate[];
  search: string;
  loading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onCandidateClick: (candidate: Candidate) => void;
}

export default function CandidateTable({
  candidates,
  search,
  loading,
  selectedIds,
  onSelectionChange,
  onCandidateClick,
}: Props) {
  const [filters, setFilters] = useState<Partial<Record<ColumnKey, string>>>({});
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (q && ![c.fullName, c.mobile, c.id, c.email].some((v) => v.toLowerCase().includes(q))) return false;
      return COLUMNS.every(({ key }) => {
        const f = filters[key]?.trim().toLowerCase();
        return !f || getText(c, key).toLowerCase().includes(f);
      });
    });
  }, [candidates, search, filters]);

  useEffect(() => setPage(0), [search]);

  // Never keep a row selected once it is filtered out of view.
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const visible = new Set(visibleRows.map((r) => r.id));
    const next = selectedIds.filter((id) => visible.has(id));
    if (next.length !== selectedIds.length) onSelectionChange(next);
  }, [visibleRows, selectedIds, onSelectionChange]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const maxPage = Math.max(0, Math.ceil(visibleRows.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const pageRows = visibleRows.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  const noCandidates = !loading && candidates.length === 0;
  const noMatches = !loading && candidates.length > 0 && visibleRows.length === 0;
  const fillerCount = noCandidates || noMatches ? 0 : Math.max(0, MIN_ROWS - pageRows.length);

  const toggleAll = () => onSelectionChange(allSelected ? [] : visibleRows.map((r) => r.id));
  const toggleOne = (id: string) =>
    onSelectionChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <TableContainer sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Table size="small" stickyHeader aria-label="Candidates">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ width: 48 }}>
                <Checkbox
                  size="small"
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={visibleRows.length === 0}
                  onChange={toggleAll}
                  inputProps={{ 'aria-label': 'Select all candidates' }}
                />
              </TableCell>
              {COLUMNS.map(({ key, label }) => (
                <TableCell key={key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{label}</span>
                    <ColumnFilter
                      label={label}
                      value={filters[key] ?? ''}
                      onChange={(value) => {
                        setFilters((prev) => ({ ...prev, [key]: value }));
                        setPage(0);
                      }}
                    />
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {pageRows.map((c) => {
              const isSelected = selected.has(c.id);
              return (
                <TableRow
                  key={c.id}
                  hover
                  selected={isSelected}
                  sx={{ '&.Mui-selected, &.Mui-selected:hover': { bgcolor: '#e3f0fd' } }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={() => toggleOne(c.id)}
                      inputProps={{ 'aria-label': `Select ${c.fullName}` }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="button"
                      type="button"
                      variant="body2"
                      color="primary"
                      noWrap
                      onClick={() => onCandidateClick(c)}
                      sx={{
                        border: 0,
                        p: 0,
                        bgcolor: 'transparent',
                        font: 'inherit',
                        textAlign: 'left',
                        cursor: 'pointer',
                        '&:hover': { textDecoration: 'underline' },
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                      }}
                    >
                      {c.fullName}
                    </Typography>
                  </TableCell>
                  <TableCell>{c.mobile}</TableCell>
                  <TableCell>
                    {c.lastMessage ? (
                      formatDate(c.lastMessage)
                    ) : (
                      <Typography component="span" variant="body2" color="text.disabled">
                        NA
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={c.status} />
                  </TableCell>
                  <TableCell>{c.id}</TableCell>
                </TableRow>
              );
            })}
            {Array.from({ length: fillerCount }, (_, i) => (
              <TableRow key={`filler-${i}`} sx={{ height: 33 }}>
                <TableCell colSpan={COLUMNS.length + 1} />
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {noCandidates && (
          <EmptyState title="No candidates added" description="When you add a candidate, they will appear here." />
        )}
        {noMatches && (
          <EmptyState
            title="No matching candidates"
            description="Try a different search or clear the column filters."
          />
        )}
      </TableContainer>

      {!noCandidates && (
        <TablePagination
          component="div"
          count={visibleRows.length}
          page={safePage}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
          showFirstButton
          showLastButton
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count}`}
          sx={{ borderTop: '1px solid', borderColor: 'divider', '& .MuiToolbar-root': { minHeight: 48 } }}
        />
      )}
    </Box>
  );
}
