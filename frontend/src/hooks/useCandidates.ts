'use client';

import { useCallback, useEffect } from 'react';
import type { Candidate, NewCandidateInput } from '@/types/candidate';
import { candidateService, supportsMockActions } from '@/services/candidateService';
import { createCandidate, fetchCandidates, removeCandidates, updateCandidates } from '@/store/candidates/candidateSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export function useCandidates() {
  const dispatch = useAppDispatch();
  const candidates = useAppSelector((state) => state.candidates.items);
  const loading = useAppSelector((state) => state.candidates.loading);
  const error = useAppSelector((state) => state.candidates.error);

  const refresh = useCallback(async () => {
    await dispatch(fetchCandidates());
  }, [dispatch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Mutations throw on failure so the calling dialog can show the error. */
  const addCandidate = useCallback(async (input: NewCandidateInput) => {
    await dispatch(createCandidate(input)).unwrap();
  }, [dispatch]);

  const deleteCandidates = useCallback(async (ids: string[]) => {
    const result = await candidateService.remove(ids);
    dispatch(removeCandidates(ids));
    return result;
  }, [dispatch]);

  const sendMessage = useCallback(async (ids: string[], message: string) => {
    const result = await candidateService.sendMessage(ids, message);
    dispatch(updateCandidates(result.updatedCandidates));
    return result;
  }, [dispatch]);

  const waitForBatchCompletion = useCallback((batchId: string) => {
    return candidateService.waitForBatchCompletion(batchId);
  }, []);

  return {
    candidates,
    loading,
    error,
    refresh,
    addCandidate,
    deleteCandidates,
    sendMessage,
    waitForBatchCompletion,
    supportsMockActions,
  };
}
