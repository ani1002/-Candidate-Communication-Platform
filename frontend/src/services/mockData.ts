import type { Candidate, CommunicationMessage } from '@/types/candidate';

export const MOCK_CANDIDATES: Candidate[] = [
  { id: 'A1B2C3', fullName: 'Krishna Khandelwal', mobile: '+91 9876543210', email: 'krishna.khandelwal@example.com', lastMessage: '2026-10-12', status: 'delivered' },
  { id: 'D4E5F6', fullName: 'Urvashi Soni', mobile: '+91 9123456789', email: 'urvashi.soni@example.com', lastMessage: '2026-10-15', status: 'failed' },
  { id: 'G7H8I9', fullName: 'Aditya Kumar', mobile: '+91 9988766554', email: 'aditya.kumar@example.com', lastMessage: '2026-10-18', status: 'delivered' },
  { id: 'J1K2L3', fullName: 'Ajit Srivastava', mobile: '+91 9234567890', email: 'ajit.srivastava@example.com', lastMessage: '2026-10-21', status: 'delivered' },
  { id: 'M4N5O6', fullName: 'Aniket Sawant', mobile: '+91 9876512345', email: 'aniket.sawant@example.com', lastMessage: '2026-10-24', status: 'sent' },
  { id: 'P7Q8R9', fullName: 'Ira Akbar', mobile: '+91 9456789012', email: 'ira.akbar@example.com', lastMessage: null, status: null },
  { id: 'S1T2U3', fullName: 'Amarjeet Kumar', mobile: '+91 9012345678', email: 'amarjeet.kumar@example.com', lastMessage: null, status: null },
];

export const MOCK_COMMUNICATION_HISTORY: Record<string, CommunicationMessage[]> = {
  A1B2C3: [
    {
      id: 'A1B2C3-5',
      sentAt: '2026-10-25T09:47:00',
      content: 'This is a test message.',
      status: 'sent',
    },
    {
      id: 'A1B2C3-4',
      sentAt: '2026-10-23T10:47:00',
      content:
        'Great ideas often begin with simple observations. Creativity grows when we explore new perspectives and challenge familiar ways of thinking. Every small step brings us closer to meaningful progress.',
      status: 'delivered',
    },
    {
      id: 'A1B2C3-3',
      sentAt: '2026-10-19T22:00:00',
      content:
        'The world is full of possibilities waiting to be explored. Every day brings new opportunities to learn, grow, and discover something unexpected.',
      status: 'delivered',
    },
    {
      id: 'A1B2C3-2',
      sentAt: '2026-10-12T10:00:00',
      content: 'Every new experience brings an opportunity to learn something valuable.',
      status: 'delivered',
    },
    {
      id: 'A1B2C3-1',
      sentAt: '2026-10-09T10:00:00',
      content: 'Thank you for your time. We look forward to speaking with you.',
      status: 'delivered',
    },
  ],
  D4E5F6: [
    {
      id: 'D4E5F6-1',
      sentAt: '2026-10-15T10:00:00',
      content: 'We were unable to deliver this message. Please verify the recipient details.',
      status: 'failed',
    },
  ],
  G7H8I9: [
    {
      id: 'G7H8I9-1',
      sentAt: '2026-10-18T10:00:00',
      content: 'Thank you for your interest. We will be in touch with the next steps.',
      status: 'delivered',
    },
  ],
  J1K2L3: [
    {
      id: 'J1K2L3-1',
      sentAt: '2026-10-21T10:00:00',
      content: 'Your application update is ready. Please let us know if you have any questions.',
      status: 'delivered',
    },
  ],
  M4N5O6: [
    {
      id: 'M4N5O6-1',
      sentAt: '2026-10-24T10:00:00',
      content: 'We have received your application and will share an update soon.',
      status: 'sent',
    },
  ],
};
