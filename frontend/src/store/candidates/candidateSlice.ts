import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Candidate, NewCandidateInput } from '@/types/candidate';
import { candidateService } from '@/services/candidateService';

interface CandidateState {
  items: Candidate[];
  loading: boolean;
  creating: boolean;
  error: string | null;
}

const initialState: CandidateState = {
  items: [],
  loading: false,
  creating: false,
  error: null,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export const fetchCandidates = createAsyncThunk<
  Candidate[],
  void,
  { rejectValue: string }
>('candidates/fetchAll', async (_, { rejectWithValue, signal }) => {
  try {
    return await candidateService.list(signal);
  } catch (error) {
    return rejectWithValue(getErrorMessage(error));
  }
});

export const createCandidate = createAsyncThunk<
  Candidate,
  NewCandidateInput,
  { rejectValue: string }
>('candidates/create', async (input, { rejectWithValue, signal }) => {
  try {
    return await candidateService.create(input, signal);
  } catch (error) {
    return rejectWithValue(getErrorMessage(error));
  }
});

const candidateSlice = createSlice({
  name: 'candidates',
  initialState,
  reducers: {
    removeCandidates(state, action: PayloadAction<string[]>) {
      const ids = new Set(action.payload);
      state.items = state.items.filter((candidate) => !ids.has(candidate.id));
    },
    updateCandidates(state, action: PayloadAction<Candidate[]>) {
      const updates = new Map(action.payload.map((candidate) => [candidate.id, candidate]));
      state.items = state.items.map((candidate) => updates.get(candidate.id) ?? candidate);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchCandidates.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCandidates.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
      })
      .addCase(fetchCandidates.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error.message ?? 'Could not load candidates.';
      })
      .addCase(createCandidate.pending, (state) => {
        state.creating = true;
        state.error = null;
      })
      .addCase(createCandidate.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        state.creating = false;
      })
      .addCase(createCandidate.rejected, (state, action) => {
        state.creating = false;
        state.error = action.payload ?? action.error.message ?? 'Could not add candidate.';
      });
  },
});

export const { removeCandidates, updateCandidates } = candidateSlice.actions;
export default candidateSlice.reducer;
