<h1 align="center">ejobtrack</h1>

<p align="center">
  <b>There is no server.</b><br>
  A job tracker that runs entirely in your browser.
</p>

<p align="center">
  <a href="https://ejobtrack.ralphabejuela.com">→ Live Demo</a>
  &nbsp;·&nbsp;
  <a href="#features">Features</a>
  &nbsp;·&nbsp;
  <a href="#quick-start">Quick Start</a>
  &nbsp;·&nbsp;
  <a href="#how-it-works">How It Works</a>
</p>

<p align="center">
  <a href="https://github.com/Ralph-Abejuela/ejobtrack/stargazers">
    <img src="https://img.shields.io/github/stars/Ralph-Abejuela/ejobtrack?style=flat&label=Stars&color=181717" alt="Stars">
  </a>
  <a href="https://ejobtrack.ralphabejuela.com">
    <img src="https://img.shields.io/badge/Live-Cloudflare_Pages-2ea44f" alt="Live">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  </a>
  <a href="https://github.com/Ralph-Abejuela/ejobtrack/issues">
    <img src="https://img.shields.io/github/issues/Ralph-Abejuela/ejobtrack" alt="Issues">
  </a>
</p>

## What this is

ejobtrack reads your Gmail inbox and builds a complete job-search timeline automatically.

**There is no server.** Your Gmail tokens, your emails, and your job data never leave your browser. The app is a static React bundle. The ML model runs on-device via Transformers.js. Everything stores in IndexedDB. You can open DevTools and verify this yourself.

> **Zero infrastructure. Zero server cost. Zero data leaves your machine.**  
> This is an architectural guarantee, not a privacy policy.

---

## Why this exists

Every tracker I tried was a spreadsheet with extra steps: company, role, date, status. All manual.

Worse, every tracker had a backend. That means someone else holds the keys to my inbox. Every privacy breach starts with "we trusted the server."

ejobtrack removes the server entirely. Gmail API calls go direct from your browser. Classification happens locally. Storage is local. There is nothing to hack, nothing to leak, and no subscription to pay for.

---

## Features

| Feature | How | Benefit |
|---|---|---|
| **Architectural privacy** | No backend, no database, data never leaves your browser | Your emails stay on your device. Nothing to leak. |
| **Gmail auto-sync** | One OAuth sign-in triggers automatic inbox scan | No typing, no CSV imports, no manual entry |
| **Multi-platform parsing** | Dedicated parsers for JobStreet, LinkedIn, Indeed. Generic parser for 50+ ATS | Works with any platform out of the box |
| **On-device ML** | Transformers.js classifies unknown senders locally with keyword fallback | No API calls to OpenAI. No data sent for analysis. Free and private. |
| **Status timeline** | Every status change tracked with source email ID and timestamp | See Applied → Viewed → Interview → Offer/Rejected with one click |
| **Duplicate merge** | Normalized title matching with fuzzy company comparison | Same role from multiple platforms merged with full undo |
| **Offline-first** | All data in IndexedDB with compound indexes | Works without a network after first sync |
| **Fully auditable** | Open source static build with no server-side code | Inspect the network tab. Zero unexpected requests. |

Only network calls: Gmail API (read-only) + optional PostHog (anonymized event names, opt-in, proxied).
Open DevTools and verify yourself.

---

## Screenshots

| Dashboard                                 | Timeline                                    |
| ----------------------------------------- | ------------------------------------------- |
| ![Dashboard](screenshots/dashboard.png)   | ![Timeline](screenshots/timeline.png)       |
| **Duplicates**                            | **Hidden Jobs**                             |
| ![Duplicates](screenshots/duplicates.png) | ![Hidden Jobs](screenshots/hidden-jobs.png) |

---

## How It Works

```
Sign in with Google
  → OAuth popup (gmail.readonly scope)
  → Scan inbox (paginated Gmail API, 429-aware)
  → Parse pipeline:
       Known sender? → Platform parser (JobStreet/LinkedIn/Indeed)
       Unknown?       → ML gate (Transformers.js) → Generic parser
  → Duplicate detection (normalized title + fuzzy company)
  → Store in IndexedDB (Dexie.js)
  → Update dashboard
```

Email sync checks every 15 minutes and on tab focus. Rate limits handled with retry-after queuing.

---

## Supported Platforms

| Platform | Type | Scope |
|---|---|---|
| **JobStreet** | Dedicated | Bulk weekly summaries, multi-job emails |
| **LinkedIn** | Dedicated | Applications, views, rejections, interviews |
| **Indeed** | Dedicated | Application updates |
| **50+ ATS** | Generic | Workday, Lever, Greenhouse, SmartRecruiters, Ashby, BambooHR, iCIMS, Jobvite, Workable |

---

## Tech Stack

| Layer     | What                      | Why                             |
| --------- | ------------------------- | ------------------------------- |
| UI        | React 19 + TypeScript     | Stable, large ecosystem         |
| Routing   | TanStack Router + Zod     | Type-safe search params         |
| Styling   | shadcn/ui + coss          | Zero-runtime, dark mode         |
| Build     | Vite                      | Fast                            |
| Storage   | Dexie.js (IndexedDB)      | Offline-first, compound indexes |
| Auth      | Google Identity Services  | OAuth 2.0, no backend tokens    |
| Email     | Gmail REST API            | `gmail.readonly`, paginated     |
| ML        | @xenova/transformers      | On-device, free, private        |
| Host      | Cloudflare Pages          | Static deploy, zero config      |
| Analytics | PostHog (opt-in, proxied) | Anonymized events only          |

---

## Design Decisions

These are intentional constraints that keep your data inside your browser.

| Decision                  | Why we chose it                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| **No push notifications** | Requires a server to hold your tokens and relay Google Pub/Sub events. We don't hold tokens. |
| **No cross-device sync**  | Would require a central database. Your data stays on one machine by design.                  |
| **Gmail only**            | Focused scope, well-documented API, and we can guarantee the direct-client flow.             |
| **IndexedDB limits**      | For typical job hunts, local storage is sufficient. Export/import is planned for backups.    |
| **On-device ML accuracy** | Free, private, offline. Degrades gracefully to keyword matching when the model is uncertain. |

---

## Roadmap

| Feature | What | Status |
|---|---|---|
| **Data export/import** | JSON backup and restore so your data is never locked in | 🚧 In progress |
| **Saved filter presets** | Bookmark combos like "Interview stage + this week" | 📋 Planned |
| **Analytics dashboard** | Applications per week, interview conversion rate, response time distribution | 📋 Planned |
| **Calendar view** | Interview dates extracted from emails with one-click Google Calendar add | 📋 Planned |
| **Custom status labels** | Define your own pipeline stages like Phone Screen, Take-home, or Final Round | 📋 Planned |
| **Outlook / Microsoft Graph API** | Same read-only OAuth flow and parser pipeline with zero-server architecture | 📋 Planned |
| **PWA install** | Manifest and service worker. Already offline, just needs the install layer | 📋 Planned |
| **In-app changelog** | Release notes shown on first load after update | 📋 Planned |

**Architectural non-goals:** Push notifications, cross-device sync, and server-side ML will never ship. Any feature that requires a backend is out of scope.

---

## Quick Start

```bash
git clone https://github.com/Ralph-Abejuela/ejobtrack.git
cd ejobtrack
pnpm install
```

Copy `.env.example` to `.env`, add your Google Client ID, then:

```bash
pnpm dev     # local dev at localhost:5173
pnpm build   # static dist/ for any host
```

**Prerequisites:** Node.js 22+, pnpm, a Google Cloud Project with Gmail API enabled.

---

## Contributing

PRs welcome. Add your platform parser as one file in `src/lib/jobs/`. See `generic.ts` for the pattern.

---

## License

MIT. See [LICENSE](LICENSE).

---

<p align="center">
  <a href="https://ejobtrack.ralphabejuela.com">ejobtrack.ralphabejuela.com</a>
</p>
