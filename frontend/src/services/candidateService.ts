import type { Candidate, CommunicationMessage, MessageStatus, NewCandidateInput } from '@/types/candidate';
import { todayISO } from '@/lib/format';
import { MOCK_CANDIDATES, MOCK_COMMUNICATION_HISTORY } from './mockData';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const supportsMockActions = USE_MOCK;

/* Django API contract: GET returns a paginated {count, results} response. */

interface CandidateDTO {
  id: number;
  name: string;
  phone: string;
  email: string;
  created_at: string;
  last_message?: string | null;
  status?: MessageStatus | null;
}

interface CommunicationMessageDTO {
  id: number;
  body: string;
  status: MessageStatus;
  failure_reason?: string | null;
  created_at: string;
  sent_at: string | null;
}

interface CandidateHistoryDTO {
  candidate: CandidateDTO;
  messages: CommunicationMessageDTO[];
}

interface BatchStatusDTO {
  total: number;
  messages: { status: MessageStatus }[];
}

export interface CandidateRemovalResult {
  deleted: string[];
  notFound: string[];
}

export interface SendMessageResult {
  recipientCount: number;
  batchId: string | null;
  queued: boolean;
  updatedCandidates: Candidate[];
}

interface CandidateService {
  list(signal?: AbortSignal): Promise<Candidate[]>;
  communicationHistory(candidateId: string): Promise<CommunicationMessage[]>;
  create(input: NewCandidateInput, signal?: AbortSignal): Promise<Candidate>;
  remove(ids: string[]): Promise<CandidateRemovalResult>;
  sendMessage(ids: string[], message: string): Promise<SendMessageResult>;
  waitForBatchCompletion(batchId: string): Promise<void>;
}

const fromDTO = (d: CandidateDTO): Candidate => ({
  id: String(d.id),
  fullName: d.name,
  mobile: d.phone.replace(/^\+91(?=[6-9]\d{9}$)/, '+91 '),
  email: d.email,
  lastMessage: d.last_message ?? null,
  status: d.status ?? null,
});

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Unable to reach the candidate API. Check the API URL and that the backend is running.');
  }

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object') {
        const errorBody = body as { error?: unknown; detail?: unknown; details?: unknown };
        if (typeof errorBody.error === 'string') detail = errorBody.error;
        else if (typeof errorBody.detail === 'string') detail = errorBody.detail;
        else if (typeof errorBody.details === 'string') detail = errorBody.details;
      }
    } catch {
      detail = undefined;
    }
    throw new Error(detail || `The API request failed (${res.status}).`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ------------------------------ mock ------------------------------- */

let mockDb: Candidate[] = MOCK_CANDIDATES.map((c) => ({ ...c }));
let mockHistory: Record<string, CommunicationMessage[]> = Object.fromEntries(
  Object.entries(MOCK_COMMUNICATION_HISTORY).map(([id, messages]) => [id, messages.map((message) => ({ ...message }))]),
);
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

function generateCandidateId(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  return Array.from({ length: 3 }, () => `${pick(letters)}${Math.floor(Math.random() * 10)}`).join('');
}

const mockService = {
  async list(): Promise<Candidate[]> {
    await wait();
    return mockDb.map((c) => ({ ...c }));
  },

  async communicationHistory(candidateId: string): Promise<CommunicationMessage[]> {
    await wait();
    return (mockHistory[candidateId] ?? []).map((message) => ({ ...message }));
  },

  async create(input: NewCandidateInput): Promise<Candidate> {
    await wait();
    if (mockDb.some((c) => c.mobile === input.mobile)) {
      throw new Error('A candidate with this mobile number already exists');
    }
    const candidate: Candidate = {
      id: generateCandidateId(),
      ...input,
      lastMessage: null,
      status: null,
    };
    mockDb = [...mockDb, candidate];
    return { ...candidate };
  },

  async remove(ids: string[]): Promise<CandidateRemovalResult> {
    await wait();
    const existing = new Set(mockDb.map((candidate) => candidate.id));
    const deleted = ids.filter((id) => existing.has(id));
    mockDb = mockDb.filter((c) => !ids.includes(c.id));
    mockHistory = Object.fromEntries(Object.entries(mockHistory).filter(([id]) => !ids.includes(id)));
    return {
      deleted,
      notFound: ids.filter((id) => !existing.has(id)),
    };
  },

  async sendMessage(ids: string[], message: string): Promise<SendMessageResult> {
    await wait(400);
    const today = todayISO();
    mockDb = mockDb.map((c) => (ids.includes(c.id) ? { ...c, lastMessage: today, status: 'sent' } : c));
    const sentAt = new Date().toISOString();
    mockHistory = {
      ...mockHistory,
      ...Object.fromEntries(
        ids.map((id) => {
          const entry: CommunicationMessage = {
            id: `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sentAt,
            content: message,
            status: 'sent',
          };
          return [id, [entry, ...(mockHistory[id] ?? [])]];
        }),
      ),
    };
    return {
      recipientCount: ids.length,
      batchId: null,
      queued: false,
      updatedCandidates: mockDb.filter((c) => ids.includes(c.id)).map((c) => ({ ...c })),
    };
  },

  waitForBatchCompletion(): Promise<void> {
    return Promise.resolve();
  },
};

/* ------------------------------- api -------------------------------- */

const apiService = {
  async list(signal?: AbortSignal): Promise<Candidate[]> {
    const pageSize = 200;
    const firstPage = await http<CandidateDTO[] | { count: number; results: CandidateDTO[] }>(
      `/api/candidates/?page_size=${pageSize}`,
      { signal },
    );
    if (Array.isArray(firstPage)) return firstPage.map(fromDTO);

    const rows = [...firstPage.results];
    const pageCount = Math.ceil(firstPage.count / pageSize);
    for (let page = 2; page <= pageCount; page += 1) {
      const data = await http<{ results: CandidateDTO[] }>(
        `/api/candidates/?page_size=${pageSize}&page=${page}`,
        { signal },
      );
      rows.push(...data.results);
    }
    return rows.map(fromDTO);
  },

  async communicationHistory(candidateId: string): Promise<CommunicationMessage[]> {
    const history = await http<CandidateHistoryDTO>(
      `/api/candidates/${encodeURIComponent(candidateId)}/messages/`,
    );
    if (!history || !Array.isArray(history.messages)) {
      throw new Error('The history API returned an invalid response. Expected a messages list.');
    }

    return history.messages.map((row) => ({
      id: String(row.id),
      sentAt: row.sent_at ?? row.created_at,
      content: row.body,
      status: row.status,
      failureReason: row.failure_reason ?? null,
    }));
  },

  async create(input: NewCandidateInput, signal?: AbortSignal): Promise<Candidate> {
    const dto = await http<CandidateDTO>('/api/candidates/', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        name: input.fullName,
        phone: input.mobile,
        email: input.email,
      }),
    });
    return fromDTO(dto);
  },

  async remove(ids: string[]): Promise<CandidateRemovalResult> {
    const numericIds = ids.map((id) => {
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
        throw new Error(`Cannot delete candidate "${id}": the API requires a numeric candidate ID.`);
      }
      return Number(id);
    });

    if (numericIds.length === 1) {
      await http<void>(`/api/candidates/${numericIds[0]}/`, { method: 'DELETE' });
      return { deleted: ids, notFound: [] };
    }

    const result = await http<{ deleted: number[]; not_found: number[] }>('/api/candidates/bulk-delete/', {
      method: 'POST',
      body: JSON.stringify({ candidate_ids: numericIds }),
    });
    if (!Array.isArray(result.deleted) || !Array.isArray(result.not_found)) {
      throw new Error('The bulk-delete API returned an invalid response.');
    }
    return {
      deleted: result.deleted.map(String),
      notFound: result.not_found.map(String),
    };
  },

  async sendMessage(ids: string[], message: string): Promise<SendMessageResult> {
    const candidateIds = ids.map((id) => {
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
        throw new Error(`Cannot send a message to candidate "${id}": the API requires a numeric candidate ID.`);
      }
      return Number(id);
    });

    const batch = await http<{ id: number; total: number }>('/api/messages/bulk/', {
      method: 'POST',
      body: JSON.stringify({ candidate_ids: candidateIds, body: message.trim() }),
    });

    if (!Number.isSafeInteger(batch.id) || !Number.isSafeInteger(batch.total) || batch.total < 1) {
      throw new Error('The bulk-message API returned an invalid batch response.');
    }

    return {
      recipientCount: batch.total,
      batchId: String(batch.id),
      queued: true,
      updatedCandidates: [],
    };
  },

  async waitForBatchCompletion(batchId: string): Promise<void> {
    while (true) {
      const batch = await http<BatchStatusDTO>(`/api/batches/${encodeURIComponent(batchId)}/`);
      if (
        !Number.isSafeInteger(batch.total) ||
        batch.total < 1 ||
        !Array.isArray(batch.messages) ||
        batch.messages.length !== batch.total
      ) {
        throw new Error('The batch-status API returned an invalid response.');
      }

      const statuses = batch.messages.map((message) => message.status);
      if (statuses.some((status) => !['pending', 'sent', 'delivered', 'failed'].includes(status))) {
        throw new Error('The batch-status API returned an unknown message status.');
      }
      if (statuses.every((status) => status === 'delivered' || status === 'failed')) return;

      await wait(2000);
    }
  },
};

export const candidateService: CandidateService = USE_MOCK ? mockService : apiService;
