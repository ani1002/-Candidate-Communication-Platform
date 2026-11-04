export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Candidate {
  /** Candidate ID shown in the table (e.g. "A1B2C3") */
  id: string;
  fullName: string;
  /** Normalised as "+91 XXXXXXXXXX" */
  mobile: string;
  email: string;
  /** ISO date (YYYY-MM-DD) or null when no message has been sent */
  lastMessage: string | null;
  status: MessageStatus | null;
}

export interface CommunicationMessage {
  id: string;
  sentAt: string;
  content: string;
  status: MessageStatus;
}

export interface NewCandidateInput {
  fullName: string;
  mobile: string;
  email: string;
}
