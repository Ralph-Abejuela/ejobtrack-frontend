# ejobtrack

Track your job applications automatically from your Gmail inbox — no backend, no data leaves your browser.

ejobtrack is a client-side SPA that connects to Gmail via OAuth, scans your inbox for job application emails from JobStreet, LinkedIn, and Indeed, and organizes them into a searchable, filterable dashboard with status timelines, duplicate detection, and progress tracking.

## Features

- **Gmail auto-sync** — Sign in with Google, grant read-only Gmail access, and ejobtrack automatically polls your inbox for job-related emails.
- **Multi-platform parsers** — Dedicated parsers for JobStreet, LinkedIn, and Indeed emails, plus a generic confidence-scored parser for unknown senders.
- **AI email classification** — Uses an on-device Transformer ML model (via Xenova) to distinguish job application emails from newsletters and other noise.
- **Duplicate detection** — Automatically groups duplicate job listings by title with fuzzy company matching. Merge duplicates or merge into a new combined entry — with full undo history.
- **Status timeline** — Every status change is tracked with the source email. View the full history for each job: Applied → Viewed → Interview → Offer → Rejected.
- **Offline-first storage** — All job data is stored locally in IndexedDB via Dexie.js. Your email content never leaves your browser.
- **Privacy focused** — No backend server. Your Gmail data stays in your browser's IndexedDB. The app has no database, no API server, and no data collection (aside from anonymous usage analytics you opt into).
- **Dark mode** — Theme toggle via next-themes, respects system preference.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 6 |
| Routing | TanStack Router v1 |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI primitives) |
| Build | Vite 8 + Rolldown |
| State | React Context + useCallback |
| Storage | Dexie.js (IndexedDB) |
| Auth | Google Identity Services (GSI) + OAuth 2.0 |
| Email API | Gmail API (read-only) |
| ML | @xenova/transformers (on-device) |
| Analytics | PostHog (opt-in, proxied via Cloudflare Worker) |

## Architecture

```
Browser (SPA)
  ├── Google Sign-In (GSI) → ID token
  ├── OAuth Token Client → Gmail API access token
  ├── Gmail API → fetch email metadata + bodies
  ├── Email Cache (IndexedDB) → local email storage
  ├── ML Classifier (on-device) → job vs non-job filter
  ├── Platform Parsers → extract job data from emails
  ├── Job Database (IndexedDB) → store job applications
  └── Status Dashboard → filter, group, search, update
```

All data processing happens in the browser. The only external calls are:

1. Google OAuth + Gmail API (read-only)
2. PostHog analytics (opt-in, anonymized)

## Supported Email Platforms

- **JobStreet** — Application status updates, bulk weekly activity summaries
- **LinkedIn** — Application confirmations, status changes, rejection/acceptance emails
- **Indeed** — Application updates and status changes
- **Generic** — Confidence-scored keyword matching for any job-related email (covers platforms like Workday, Lever, Greenhouse, etc.)

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- A Google Cloud Project with Gmail API enabled
- (Optional) A PostHog account for analytics

### Setup

```bash
git clone https://github.com/Ralph-Abejuela/ejobtrack.git
cd ejobtrack
```

1. Install dependencies:

```bash
pnpm install
```

1. Create `.env` in the project root:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_POSTHOG_KEY=your_posthog_key  # optional
```

1. Start dev server:

```bash
pnpm dev
```

1. Build for production:

```bash
pnpm build
```

### Google Cloud Setup

1. Create a project at [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Gmail API**
3. Under **Credentials**, create an OAuth 2.0 Client ID (Web application)
4. Add `http://localhost:5173` to authorized JavaScript origins
5. Add your production domain to authorized JavaScript origins
6. Copy the Client ID to `VITE_GOOGLE_CLIENT_ID`

## Deployment

ejobtrack is deployed on [Cloudflare Pages](https://ejobtrack.ralphabejuela.com).

```bash
pnpm build
```

The `dist/` folder is ready for any static host. No server-side configuration needed.

## Analytics (Optional)

Usage analytics are collected via PostHog and proxied through a Cloudflare Worker to avoid ad blockers:

- `user_signed_in` — User signs in with Google
- `gmail_authorized` — User grants Gmail read-only scope
- `emails_fetched` — Batch of emails pulled from Gmail API
- `batch_processed` — Batch of emails fully scanned and parsed

Analytics are opt-out by disabling the `VITE_POSTHOG_KEY` env var. No email content or personal data is transmitted to PostHog — only anonymous event names and counts.

## License

MIT
