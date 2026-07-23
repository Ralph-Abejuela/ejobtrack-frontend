# ejobtrack

**Track your job applications automatically from your Gmail inbox. No backend. No data leaves your browser.**

[![Live](https://img.shields.io/badge/%E2%86%97_Live-https://ejobtrack.ralphabejuela.com-blue)](https://ejobtrack.ralphabejuela.com)
[![GitHub](https://img.shields.io/github/stars/Ralph-Abejuela/ejobtrack?style=flat&label=GitHub&color=181717)](https://github.com/Ralph-Abejuela/ejobtrack)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Table of Contents

- [Screenshots](#screenshots)
- [Why Another Job Tracker?](#why-another-job-tracker)
- [Data Flow](#data-flow)
- [Features](#features)
- [Trade-offs and Limitations](#trade-offs-and-limitations)
- [Supported Email Platforms](#supported-email-platforms)
- [Tech Stack](#tech-stack)
- [Architecture Decisions](#architecture-decisions)
  - [No-Backend Architecture](#no-backend-architecture)
  - [Parser Pipeline Strategy](#parser-pipeline-strategy)
  - [ML Gate for Unknown Senders](#ml-gate-for-unknown-senders)
- [IndexedDB Schema](#indexeddb-schema)
  - [Tables](#tables)
  - [Schema Versions](#schema-versions)
  - [ID Composition](#id-composition)
  - [Resolution History](#resolution-history)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Google Cloud Setup](#google-cloud-setup)
  - [Deployment](#deployment)
  - [Analytics](#analytics-optional)
- [License](#license)

---

## Screenshots

<!-- Paste screenshots into screenshots/ at project root. Suggested captures:
  1. Dashboard: job list grouped by status with search/filter toolbar at top
  2. Expanded job card: timeline showing Applied -> Viewed -> Interview flow
  3. Duplicate detection panel: two matching jobs with merge/ignore buttons
  4. Hidden Jobs panel: soft-deleted jobs tab + dedup history tab with undo
  -->

| Dashboard                               | Timeline                              |
| --------------------------------------- | ------------------------------------- |
| ![Dashboard](screenshots/dashboard.png) | ![Timeline](screenshots/timeline.png) |

| Duplicates                                | Hidden Jobs                                 |
| ----------------------------------------- | ------------------------------------------- |
| ![Duplicates](screenshots/duplicates.png) | ![Hidden Jobs](screenshots/hidden-jobs.png) |

---

## Why Another Job Tracker?

Every existing tracker I found needed me to manually enter each application: company, role, date, status. That is just a spreadsheet with extra steps. I wanted something that reads my inbox and does the work for me.

The obvious path was a server that polls Gmail via webhooks, runs some NLP, and stores everything in Postgres. But that means I need to run and pay for a server, handle OAuth token storage, convince users their email data is safe on my infrastructure, and deal with compliance, data deletion requests, and all the operational overhead.

**Why not Supabase or Firebase?** They solve the server part but not the trust part. Your email content still goes through their network. I wanted a product where the privacy guarantee is architectural, not just a promise in a privacy policy. If the data never leaves your browser, there is nothing to leak or breach and no server to audit.

So I went the other direction: everything happens in the browser. Gmail API calls go directly from the client with OAuth tokens stored in sessionStorage. Email processing, ML classification, and data storage all happen on-device. The only external calls are the Gmail API (read-only) and PostHog analytics (opt-in, anonymized events only, proxied through a Cloudflare Worker to dodge ad blockers).

The trade-off is real: no push notifications, no cross-device sync, no server-side processing. But for a job tracker, those are nice-to-haves. The core problem ("I applied for 50 jobs and can't remember where each one stands") is solved without any of them.

---

## Data Flow

```
User clicks "Sign in with Google"
  |
  +-- 1. OAuth flow (one popup)
  |     +-- google.accounts.oauth2.initTokenClient({
  |           scope: "openid email profile gmail.readonly"
  |         })
  |     +-- On success: fetch user profile from UserInfo API
  |     +-- Store { user, accessToken } in sessionStorage
  |
  +-- 2. Email sync starts
  |     +-- Gmail API: GET /messages?q=after:{timestamp}
  |     +-- Paginated fetch (obeying 429 rate limits with retry-after)
  |     +-- For each new message: GET /messages/{id} (full format)
  |     +-- Parse email parts (multipart MIME -> text/plain + text/html)
  |
  +-- 3. Platform parsing pipeline
  |     +-- Skip known non-job senders (LinkedIn updates, JobStreet onboarding, etc.)
  |     +-- Match sender against fromAddresses:
  |     |     +-- JobStreet   --+
  |     |     +-- LinkedIn    --+-- dedicated parser
  |     |     +-- Indeed      --+
  |     +-- Match found? -> goto 5 (Duplicate detection)
  |     +-- No match?       -> goto 4 (ML gate)
  |
  +-- 4. ML gate (unknown senders only)
  |     +-- Model: mattohan/job-tracker-email-classifier (Transformer)
  |     +-- Pipeline: "text-classification" via @xenova/transformers
  |     +-- Labels: confirmation, rejection, interview, offer
  |     +-- Lazy-loaded on first sync, keyword fallback while loading
  |     +-- ML says job? -> run generic parser:
  |     |     +-- JOB_KEYWORDS array (~50 keywords) for job email detection
  |     |     +-- STATUS_PATTERNS (confidence-weighted regexes, weight 1-2)
  |     |     +-- Company extraction: "at {Company}" -> sender display -> domain
  |     |     +-- Job title extraction: subject/body regex patterns
  |     +-- ML says not job? -> skip (mark scanned)
  |
  +-- 5. Duplicate detection
  |     +-- Normalize job title (lowercase, strip whitespace, remove common suffixes)
  |     +-- Group by normalized title, fuzzy-match company names
  |     +-- Present in DuplicatesPanel with merge/ignore actions
  |     +-- Merge consolidates history into one record with full undo
  |
  +-- 6. Store in IndexedDB
        +-- Dexie.js with compound indexes:
              +-- [userEmail+status] for status-filtered queries
              +-- [userEmail+deleted] for soft-delete filtering
              +-- dupIndex: normalized title -> job IDs
```

---

## Features

**Gmail auto-sync.** Sign in with Google and ejobtrack scans your inbox automatically. No manual data entry, no spreadsheets, no CSV imports. It identifies job application emails across platforms, detects status changes from new emails as they arrive, and updates your dashboard without any clicks from you. The initial sync fetches the most recent 25 emails; older history loads progressively as you scroll. New emails are checked every 15 minutes and whenever you open the tab.

**Multi-platform parse pipeline.** Dedicated extractors for JobStreet (handles bulk weekly activity summaries with multiple jobs in a single email), LinkedIn (bodyClean html-to-text extraction, comm/ URL dedup, resume downloaded tracked as Viewed), and Indeed. For unknown senders, an on-device ML model decides whether the email is job-related, then a confidence-scored generic parser extracts company, title, status, and job URL. This covers Workday, Lever, Greenhouse, SmartRecruiters, Ashby, BambooHR, and any other ATS. Adding a new platform parser is one file with a `fromAddresses` array and a `parse` function.

**Confidence-scored status detection.** Each email is scored against weighted regex patterns: weight 1 for weak signals like "thank you for applying", weight 2 for strong signals like "interview invitation". The highest-scoring status wins: Applied, Viewed, Interview, Offer, Rejected, or Unknown. When a new email arrives for an existing job, its status and timeline update automatically. Your dashboard always reflects the latest email without manual status changes.

**Status timeline.** Every status change is tracked with the source email ID and timestamp. Each job card shows a horizontal timeline from Applied through Viewed and Interview to Offer or Rejected. Click any entry to highlight the email that triggered it. Manual status changes are tagged "set by user" and can be individually removed.

**Duplicate detection with merge and undo.** Jobs are grouped by normalized title with fuzzy company matching. When the same role appears from LinkedIn and the company's own ATS, they show up as a duplicate group. You can select which records to merge into one combined entry with all history consolidated, dismiss the group, merge into a new combined entry, or ignore individual records. Every merge is reversible with one click from the Dedup History tab.

**Offline-first and private by design.** All job data lives in your browser's IndexedDB. There is no backend server, no API, no database. Your email content never reaches another machine. The app works entirely offline after sync for reading, filtering, and managing jobs. The only network calls are to the Gmail API (read-only) and optional anonymized analytics via PostHog.

---

## Trade-offs and Limitations

| Trade-off                                                                                                                                                                                                             | What you get instead                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No push notifications.** Email sync runs every 15 minutes via setInterval and on tab focus. No server-side webhook.                                                                                                 | Zero operational cost, no server, no data leaves your browser. You do not need instant notification for job updates.                                                                                  |
| **No cross-device sync.** Data lives in IndexedDB on the browser where you signed in. No server means no cloud sync.                                                                                                  | Your email data never touches another machine. Clear privacy boundary. Open the same browser or export/import if you need access elsewhere.                                                           |
| **Gmail only.** Gmail API is the only email source. OAuth scope is `gmail.readonly`.                                                                                                                                  | Focused integration with a well-documented API. No IMAP/POP complexity. Outlook, Proton, and iCloud could be added with per-provider adapters using the same parser pipeline.                         |
| **IndexedDB limits.** Roughly 50-100 MB per origin before the browser starts evicting data. Large email caches and parsed jobs stay well under this for typical job hunts, but a multi-year history could hit limits. | The database is scoped to your active job hunt. Old data is rarely needed. A clear-old-data option could be added if needed.                                                                          |
| **Rate limits.** Gmail API allows 250 queries per 100 seconds per user. Initial sync fetches one page of 25 emails. Deeper history loads progressively on demand. Each email fetch is one API call.                   | Implemented RateLimitError with retry-after headers. Rate-limited fetches are queued and retried automatically by the retry loop. Emails are cached in IndexedDB so re-syncs only fetch new messages. |
| **ML model accuracy.** The on-device Transformer is smaller and less accurate than GPT-4 or a server-side model.                                                                                                      | It is free, private, works offline, has zero latency after first load, and degrades gracefully to keyword matching. The custom model is trained specifically on job emails, not general text.         |

---

## Supported Email Platforms

| Platform              | Parser            | Capabilities                                                                                                                                                                                                           |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JobStreet**         | Dedicated         | Application confirmations, status updates, bulk weekly activity summaries (multiple jobs per email)                                                                                                                    |
| **LinkedIn**          | Dedicated         | Application sent, viewed, resume downloaded, rejected, interview invite. Handles bodyClean html-to-text extraction, comm/ URL dedup, LinkedIn InMail                                                                   |
| **Indeed**            | Dedicated         | Application updates and status changes                                                                                                                                                                                 |
| **Generic (50+ ATS)** | Confidence-scored | Workday, Lever, Greenhouse, SmartRecruiters, Ashby, BambooHR, iCIMS, Jobvite, Workable, and any sender with job-related keywords. Company extraction from "at {Company}" then sender display name then domain fallback |

---

## Tech Stack

| Layer     | Technology                               | Why                                                                                                              |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Framework | React 19 + TypeScript                    | Latest stable releases with a large ecosystem                                                                    |
| Routing   | TanStack Router                          | Type-safe search params with Zod v4 schema validation. URL-persisted filter state avoids React state duplication |
| Styling   | shadcn/ui + coss ui (Base UI primitives) | Zero-runtime CSS, composable primitives, dark mode via class strategy                                            |
| Build     | Vite                                     | Fast dev server and fast production builds                                                                       |
| State     | React Context + useCallback              | Simple enough for this scope. No Redux or Zustand needed since auth and job state are shallow                    |
| Storage   | Dexie.js (IndexedDB)                     | Offline-first with compound indexes and a NoSQL schema for job records. No backend database needed by design     |
| Auth      | Google Identity Services (OAuth 2.0)     | Unified `initTokenClient` with combined scope. Silent refresh on 401. UserInfo API for profile                   |
| Email API | Gmail REST API (read-only)               | Well-documented, paginated, `gmail.readonly` scope. Rate-limited with retry-after handling                       |
| ML        | @xenova/transformers (on-device)         | Custom classification model. Lazy-loaded with keyword fallback. Zero server cost                                 |
| Analytics | PostHog (opt-in, proxied)                | Anonymized events via Cloudflare Worker proxy. No PII, no email content                                          |

---

## Architecture Decisions

### No-Backend Architecture (The Core Trade)

The entire app is static HTML and JavaScript served from Cloudflare Pages. There is no server, no database, and no API layer. All state lives in the browser.

```
Browser --- Gmail API (OAuth 2.0, read-only)
    |
    +-- IndexedDB (Dexie.js)
    |     +-- jobs table (compound indexes)
    |     +-- dupIndex table (normalized title -> job IDs)
    |     +-- email cache table
    |
    +-- ML pipeline (@xenova/transformers)
    |     +-- Keyword fallback while model loads
    |
    +-- PostHog (Cloudflare Worker proxy)
          +-- Opt-in, anonymized event names only
```

**Why this works for a job tracker.**

Job data is naturally single-user and single-session. You do not need to share your application list. Email processing is fetch-and-forget with no long-running operations. The data model is small (hundreds of applications, not millions of records). Privacy is a feature, not a compliance checkbox.

**Why not Supabase or Firebase.**

A hosted backend would add real-time sync, push notifications, and cross-device access. But it would also require OAuth token storage on the server, making me responsible for securing your Gmail tokens. It would introduce data egress costs for every email body fetched from Gmail and stored again on a server. It would require auth infrastructure with user accounts, session management, and token rotation. It would increase the compliance surface area with GDPR data deletion, breach notification, and audit logs.

For a side project tracking job applications, those costs outweigh the benefits. The privacy guarantee of "your data never leaves your browser" is stronger than any privacy policy I could write.

### Parser Pipeline Strategy

Platform-specific parsers run first, matched by sender email address. If none match, the generic parser uses confidence-scored keyword matching. This dual approach means known platforms get exact extraction with specific body patterns and known edge cases, unknown platforms still work via regex fallback, and adding a new parser is a single file with a `fromAddresses` array and a `parse` function with no pipeline changes needed.

### ML Gate for Unknown Senders

ML classification does not run on every email. It runs only for unknown senders whose `fromAddresses` do not match any dedicated parser (JobStreet, LinkedIn, Indeed). Known senders parse directly with platform-specific extractors and bypass ML entirely.

The Transformer model (`mattohan/job-tracker-email-classifier`) loads asynchronously on first sync. While loading, a lightweight keyword filter handles the gate using the same `JOB_KEYWORDS` array that the generic parser uses. Once the model is ready, all unknown-sender gates use it. If the model fails to load due to a Cloudflare WAF edge case or memory constraint, the keyword fallback continues permanently.

**Execution order per email:**

1. Match `fromAddresses` against the dedicated parser list.
2. Found a match? Run the platform parser and skip ML entirely.
3. No match? Run the ML gate. If the ML says it is a job, run the generic parser. If the ML says it is not a job, discard.

This means known senders are fast with no model inference needed. ML is a gate, not a parser. It only decides whether to try the generic parser. First sync is never blocked by model loading. The app works fully without the model. Users on slow connections or older machines still get accurate classification via the keyword fallback.

---

## IndexedDB Schema

Dexie.js wraps IndexedDB, providing compound indexes and async queries. The database is named `ejobtrack_jobs` with three schema versions and two tables.

### Tables

#### `jobs` (Primary data store)

```typescript
interface JobApplication {
  /** Primary key: `${userEmail}:${platform}:${normalizedCompany}:${normalizedJobTitle}` */
  id: string;
  userEmail: string;
  platform: string; // "jobstreet" | "linkedin" | "indeed" | sender domain (generic)
  jobTitle: string;
  company: string;
  status: JobStatus; // "applied" | "viewed" | "interview" | "offer" | "rejected" | "unknown"
  body: string; // Full email body (cached after first fetch)
  snippet: string;
  subject: string;
  from: string;
  url: string; // Job posting URL extracted from email
  date: string; // ISO date of latest email
  emailId: string; // Gmail message ID of latest email
  deleted?: boolean; // Soft-delete flag
  createdAt: number; // Epoch ms
  updatedAt: number; // Epoch ms
  history: JobStatusChange[]; // Array of { status, date, emailId }
}
```

**Indexes (version 4):**

| Index                 | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `id` (primary)        | Direct lookup by composite key                                       |
| `userEmail`           | List all jobs for a user                                             |
| `platform`            | Filter by platform (JobStreet/LinkedIn/Indeed/generic)               |
| `status`              | Filter by current status                                             |
| `company`             | Company filter and sort                                              |
| `jobTitle`            | Title filter and sort                                                |
| `date`                | Sort by latest activity date                                         |
| `createdAt`           | Sort by creation time                                                |
| `updatedAt`           | Sort by last update                                                  |
| `[platform+status]`   | Compound: jobs by platform and status                                |
| `[userEmail+status]`  | Compound: scoped status-filtered queries (used by `getJobsByStatus`) |
| `[userEmail+deleted]` | Compound: soft-delete isolation (used by `getDeletedJobs`)           |

#### `dupIndex` (Duplicate detection index)

```typescript
interface DupIndexEntry {
  /** Primary key: `${userEmail}:${normalizedTitle}` */
  title: string;
  userEmail: string;
  jobIds: string[];
}
```

Indexed on `&title` (unique) and `userEmail`. Groups are built incrementally: adding or removing a job updates the array in place. A full rebuild is available via `buildDuplicateIndex()`. Groups with at least 2 entries are returned as `DuplicateGroup` objects.

### Schema Versions

| Version | Changes                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**   | Initial schema. Single `jobs` table with `id`, `userEmail`, `platform`, `status`, `company`, `jobTitle`, `date`, `createdAt`, `updatedAt`, `[platform+status]`, `[userEmail+status]`. |
| **3**   | Added `[userEmail+deleted]` compound index for soft-delete isolation. Added `dupIndex` table with `&title` unique key.                                                                |
| **4**   | Added `userEmail` to `dupIndex` for multi-tenant isolation. Migration clears old entries without userEmail prefix. Index rebuilds lazily on first access.                             |

### ID Composition

```
${userEmail}:${platform}:${normalizedCompany}:${normalizedJobTitle}
```

This ensures uniqueness across users (the same job at the same company for different users produces different records), deterministic IDs (re-importing the same email produces the same record and `put` overwrites instead of duplicating), and cross-user isolation (all queries are scoped by `userEmail`).

### Resolution History

Merge and ignore actions are stored outside IndexedDB in `localStorage` keyed by `resolution_history_{email}`. This avoids circular dependencies since the data is small at a maximum of 20 entries and does not need indexing.

```typescript
interface ResolutionEntry {
  groupKey: string;
  action: 'merge' | 'ignore' | 'merge-undo' | 'ignore-undo';
  timestamp: number;
  keepId?: string;
  removeId?: string;
}
```

Pre-merge snapshots of both records are saved as `removed_job_{email}_{timestamp}` in localStorage, enabling full undo without database versioning overhead.

---

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

1. Start the dev server:

```bash
pnpm dev
```

1. Build for production:

```bash
pnpm build
```

### Google Cloud Setup

1. Create a project at [Google Cloud Console](https://console.cloud.google.com).
2. Enable the **Gmail API**.
3. Under **Credentials**, create an OAuth 2.0 Client ID (Web application).
4. Add `http://localhost:5173` to authorized JavaScript origins.
5. Add your production domain to authorized JavaScript origins.
6. Copy the Client ID to `VITE_GOOGLE_CLIENT_ID`.

### Deployment

ejobtrack is deployed on [Cloudflare Pages](https://ejobtrack.ralphabejuela.com). Static deploy with no server configuration needed.

```bash
pnpm build
```

The `dist/` folder is ready for any static host including Cloudflare Pages, Netlify, Vercel static, or S3.

### Analytics (Optional)

Usage analytics are collected via PostHog and proxied through a Cloudflare Worker to avoid ad blockers. Events captured:

- `user_signed_in` when the user signs in with Google
- `gmail_authorized` when the user grants Gmail read-only scope
- `emails_fetched` for each batch of emails pulled from the Gmail API
- `batch_processed` for each batch of emails fully scanned and parsed

Analytics are opt-out by disabling the `VITE_POSTHOG_KEY` environment variable. No email content or personal data is transmitted to PostHog. Only anonymous event names and counts are sent.

---

## License

MIT
