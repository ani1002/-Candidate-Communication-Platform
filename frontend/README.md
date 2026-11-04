# Candidate communication: frontend

Next.js (App Router) + React + TypeScript + Material UI. Backend: Python / Django.

## Run

```bash
cp .env.local.example .env.local
npm install
npm run dev        # http://localhost:3000
```

By default the frontend uses the Django API. Set `NEXT_PUBLIC_API_URL` to the backend origin
(for example `http://127.0.0.1:8000`). Set `NEXT_PUBLIC_USE_MOCK=true` to use in-memory
demo data instead. These `NEXT_PUBLIC_` values are compiled into the browser bundle, so restart
the frontend after changing `.env.local`.

## Folder layout

```
frontend/
├── package.json, tsconfig.json, next.config.mjs, .env.local.example
└── src/
    ├── app/                      # Routes (App Router)
    │   ├── layout.tsx            # Root layout: font, MUI and Redux providers
    │   └── page.tsx              # "/" -> Candidate communication screen
    ├── store/                    # Redux Toolkit store, candidate slice and typed hooks
    ├── components/
    │   └── candidates/           # Feature components
    │       ├── CandidateCommunication.tsx   # Screen: wires state, dialogs, toasts
    │       ├── CandidateToolbar.tsx         # Title, Add / Delete / Send, search
    │       ├── CandidateTable.tsx           # Table, selection, filters, pagination
    │       ├── ColumnFilter.tsx             # Per-column filter popover
    │       ├── StatusChip.tsx               # Delivered / Failed / Sent / NA
    │       ├── EmptyState.tsx               # "No candidates added"
    │       ├── AddCandidateDialog.tsx
    │       └── DeleteCandidateDialog.tsx
    ├── hooks/useCandidates.ts    # Data + mutations
    ├── services/
    │   ├── candidateService.ts   # Mock <-> Django switch, snake_case mapping
    │   └── mockData.ts
    ├── lib/                      # format.ts (dates), validation.ts (mobile, email)
    ├── theme/theme.ts            # MUI theme
    └── types/candidate.ts
```

Rule of thumb: `app/` only holds routes and layouts. UI goes in `components/<feature>/`,
data access in `services/`, state logic in `hooks/`. Add new screens as `app/<route>/page.tsx`.

## Django API integration

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/candidates/?page_size=200&page=1` | | paginated `{count, results}` |
| POST | `/api/candidates/` | `name`, `phone`, optional `email` | created candidate |
| DELETE | `/api/candidates/<id>/` | | `204` for one candidate |
| POST | `/api/candidates/bulk-delete/` | `candidate_ids: number[]` | `{deleted: number[], not_found: number[]}` |
| POST | `/api/messages/bulk/` | `candidate_ids: number[]`, `body: string` | batch `{id, total, summary, messages}` |

The API returns candidates as `{id, name, phone, email, created_at, last_message, status}`.
`last_message` and `status` describe the newest message and are `null` when the candidate has
no message history. Redux Toolkit stores
the loaded candidate list and handles list/create request and error states. The list loader
follows all pages up to the API's configured page-size limit; newly created candidates are
added to the Redux list from the API response. Server validation errors are displayed in the
add-candidate dialog.

The selection-based delete action uses the single-delete route for one candidate and the
bulk-delete route for multiple candidates. Missing IDs are reported without blocking successful
deletions. Bulk message sending uses the backend route `/api/messages/bulk/` with numeric
candidate IDs and a `body` field. The API responds with a batch that is queued for delivery;
the interface reports the batch ID and recipient count. Candidate-history controls also remain
available in the interface.
