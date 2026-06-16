# PrintAI — Full Project Documentation

> Last updated after: machine queue engine, compressed demo clock, approval workflow, report export, and dedicated paper-to-machine routing

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Setup](#4-environment-setup)
5. [Database Schema](#5-database-schema)
6. [Role Segregation](#6-role-segregation)
7. [Architecture & Data Flow](#7-architecture--data-flow)
8. [State Management](#8-state-management)
9. [API Reference](#9-api-reference)
10. [Components](#10-components)
11. [Core Library](#11-core-library)
12. [AI Integration](#12-ai-integration)
13. [Bugs Fixed & Why](#13-bugs-fixed--why)
14. [Known Incomplete Features](#14-known-incomplete-features)
15. [Running the Project](#15-running-the-project)
16. [Deployment](#16-deployment)

---

## 1. Project Overview

PrintAI is a production planning and monitoring dashboard for a print factory managing multiple machines — printers for dress tags, labels, and other print products.

**Two user roles:**
- **Planner** — submits orders, views dashboard and planned jobs
- **Admin** — manages machines, views AI schedule, reports, and AI optimisation

**Two layers:**
- **Planning** — submit orders → auto-schedule across machines → track SLA
- **Monitoring** — real-time machine status, utilisation, breakdown recovery, AI risk scoring

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| AI | Google Gemini 1.5 Flash |
| Charts | Recharts |
| Icons | Lucide React |
| Validation | Zod |
| Date handling | date-fns |
| Deployment | Vercel |

---

## 3. Project Structure

```
PrintAI/
│
├── app/
│   ├── api/
│   │   ├── analyse-risk/
│   │   │   └── route.ts          # POST — standalone Gemini SLA risk + anomaly analysis
│   │   ├── machines/
│   │   │   └── route.ts          # GET / PATCH — machine data
│   │   ├── orders/
│   │   │   └── route.ts          # GET / PATCH — order data (with seed fallback)
│   │   ├── planned-jobs/
│   │   │   ├── route.ts          # GET / PATCH — reads schedules+orders, maps to PlannedJob
│   │   │   └── optimise/
│   │   │       └── route.ts      # POST — Gemini AI optimise at-risk jobs
│   │   ├── schedule/
│   │   │   └── route.ts          # POST — create order + run scheduler + Gemini
│   │   └── simulate-failure/
│   │       └── route.ts          # POST — machine breakdown + reassignment
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # Root — all global state + page routing
│
├── components/
│   ├── ui/
│   │   └── Badge.tsx             # Reusable badge: safe/risk/warn/info/gray/high/medium/low
│   ├── DashboardPage.tsx         # [Planner] metrics, notifications, recent orders, utilisation
│   ├── ErrorBoundary.tsx         # React error boundary wrapper
│   ├── MachinesPage.tsx          # [Admin] machine cards + breakdown simulator
│   ├── OrdersPage.tsx            # [Planner] order form + order list
│   ├── PlannedJobsPage.tsx       # [Planner] job table with filters, search, AI optimise
│   ├── ReportsPage.tsx           # [Admin] charts + SLA compliance table
│   ├── SchedulePage.tsx          # [Admin] AI schedule result + risk analysis panel
│   └── Sidebar.tsx               # Navigation sidebar (6 pages)
│
├── lib/
│   ├── env.ts                    # Startup env variable validation
│   ├── gemini.ts                 # All Gemini AI functions
│   ├── logger.ts                 # Structured logger (Sentry-ready)
│   ├── scheduler.ts              # Core scheduling algorithm + breakdown simulation
│   ├── supabase.ts               # Supabase lazy singleton client
│   ├── utils.ts                  # cn() tailwind class merger
│   └── validation.ts             # Zod schemas for all API inputs
│
├── types/
│   ├── index.ts                  # Machine, Order, ScheduleResult, RiskAnalysis etc.
│   └── planned-jobs.ts           # PlannedJob, PlannedJobsStats, BulkOptimiseResult
│
├── public/
├── .env.local                    # Secrets — gitignored
├── .env.example                  # Template
├── supabase-schema.sql           # DB setup script
├── next.config.ts
├── tsconfig.json
├── package.json
└── vercel.json
```

---

## 4. Environment Setup

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
GEMINI_API_KEY=AIzaSy...
```

- Supabase keys: project dashboard → Settings → API
- Gemini key: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — key must start with `AIza`

---

## 5. Database Schema

Run `supabase-schema.sql` in Supabase SQL Editor.

### orders
| Column | Type | Notes |
|---|---|---|
| id | text PK | e.g. `ORD-A1B2C3` |
| customer | text | |
| product | text | Brochure, Flyer, etc. |
| quantity | integer | sheets |
| paper_type | text | Coated / Glossy / Matte / Uncoated |
| priority | text | High / Medium / Low |
| deadline | timestamptz | |
| status | text | Pending / Pending Approval / Scheduled / In Progress / Completed / At Risk |
| created_at | timestamptz | |

### machines
| Column | Type | Notes |
|---|---|---|
| id | text PK | M1–M5 |
| speed | integer | sheets/hour |
| capacity | integer | sheets/day |
| status | text | available / busy / backup / breakdown |
| paper_types | text[] | supported paper types |
| utilisation | integer | 0–100 |

### schedules
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto |
| order_id | text FK | → orders.id |
| tasks | jsonb | array of ScheduledTask |
| overall_finish | timestamptz | |
| sla_status | text | SAFE / RISK |
| sla_diff | integer | minutes ahead(+) or behind(-) deadline |
| explanation | text | Gemini-generated |
| created_at | timestamptz | |

> There is NO separate `planned_jobs` table. The Planned Jobs page reads from `schedules` joined with `orders` and maps each schedule task into a job row.

> Runtime queue state is kept in React state for the prototype. Supabase stores machine master data; the live queue is not persisted as a database column in the current build.

### Seed Machines

| ID | Speed | Capacity | Status | Papers |
|---|---|---|---|---|
| M1 | 500/hr | 10,000/day | available | Coated |
| M2 | 400/hr | 8,000/day | busy | Glossy |
| M3 | 600/hr | 12,000/day | available | Matte |
| M4 | 450/hr | 9,000/day | available | Uncoated |
| M5 | 300/hr | 6,000/day | backup | Coated, Glossy, Matte, Uncoated |

**Routing rule:** primary machines are single-paper machines. Coated work goes to M1, Glossy to M2, Matte to M3, and Uncoated to M4. M5 supports all paper types but remains a backup machine until breakdown recovery needs it.

---

## 6. Role Segregation

| Page | Planner | Admin |
|---|---|---|
| Dashboard | ✅ | — |
| Orders | ✅ | — |
| Planned Jobs | ✅ | — |
| Machines | — | ✅ |
| AI Schedule | — | ✅ |
| Reports | — | ✅ |

> Role routing is currently handled via sidebar visibility only. Authentication and enforced route protection can be added using Supabase Auth + Next.js middleware when needed.

---

## 7. Architecture & Data Flow

### Order → Schedule → Planned Jobs flow

```
User fills order form (OrdersPage)
        ↓
POST /api/schedule
        ├── 1. Zod validation (CreateOrderSchema)
        ├── 2. Past deadline check (isBefore guard)
        ├── 3. Fetch machines from Supabase (fallback: DEFAULT_MACHINES)
        ├── 4. runScheduler() — split workload by speed ratio
        ├── 5. generateScheduleExplanation() — Gemini narration
        ├── 6. analyseRisk() — Gemini risk score + anomalies
        └── 7. INSERT into orders + schedules tables in Supabase
                        ↓
        handleScheduled() in page.tsx
                ├── Prepend order to orders state
                ├── Update machines utilisation
                ├── Update scheduleMap + persist to sessionStorage
                ├── Push notification
                └── Navigate to AI Schedule tab
                        ↓
        PlannedJobsPage → GET /api/planned-jobs
                ├── Reads schedules JOIN orders from Supabase
                ├── Maps each task in a schedule → one PlannedJob row
                │     - stage: first task = pre-press, last = post-press, middle = press
                │     - printing_status: RISK schedule → "Error", else "Ongoing"
                └── Returns jobs[] + stats{}
```

**Current implementation note:** `/api/schedule` accepts the live `currentMachines` state from `OrdersPage`, normalises every machine to the dedicated paper routing, schedules onto free compatible machines first, queues behind compatible busy machines when needed, computes compressed real finish times, and returns updated machine queues to `page.tsx`. `handleScheduled()` stores those returned queues instead of only setting utilisation.

### Breakdown Simulation flow

```
User selects machine + clicks "Trigger breakdown" (MachinesPage)
        ↓
POST /api/simulate-failure
        ├── 1. Clamp completedFraction to 0–1
        ├── 2. Validate failedMachineId exists in tasks (400 if not)
        ├── 3. Fetch order from Supabase (fallback: demo order)
        ├── 4. simulateBreakdown() — reroute remaining qty to backup machine
        └── 5. generateFailureExplanation() — Gemini alert message
                        ↓
        handleFailure() in page.tsx
                ├── Mark failed machine as "breakdown", utilisation 0
                ├── Set backup machine utilisation to 50%
                ├── Update scheduleMap with new SLA (by result.orderId, not lastOrder)
                └── Push breakdown notification
```

**Current implementation note:** breakdown clears the failed machine queue and starts a real running queue job on M5 for the remaining quantity. M5 remains a backup machine until this recovery path is used.

### Queue ticker and completion sync

`app/page.tsx` runs `tickMachines()` every 3 seconds. The ticker checks each machine's running job against its compressed real finish time. When a job finishes:
- the machine becomes `available` if no more queued work exists
- the next queued job on that machine starts immediately if present
- an order is marked `Completed` only after all of its machine tasks have finished
- the seeded M2 demo job completes without creating a real order

### Dashboard order status sync

On mount, `loadOrders()` fetches both `/api/orders` and `/api/planned-jobs` in parallel.
It then derives order status from job states:
- Any job `printing_status === "Error"` → order `"At Risk"`
- Any job `printing_status === "Ongoing"` → order `"In Progress"`
- All jobs `printing_status === "Completed"` → order `"Completed"`
- Otherwise → `"Scheduled"`

**Current implementation correction:** the live app now fetches `/api/orders` on mount. New orders start as `"Pending Approval"`, Approve/Reject updates status from `SchedulePage`, and the queue ticker marks an order `"Completed"` only after every assigned machine task finishes.

---

## 8. State Management

All global state lives in `app/page.tsx`:

| State | Type | Purpose |
|---|---|---|
| `orders` | `Order[]` | All orders (loaded from Supabase + new ones) |
| `machines` | `Machine[]` | Machine status, utilisation, assigned order, and live job queue |
| `lastSchedule` | `ScheduleResult \| null` | Most recent schedule — shown on AI Schedule tab |
| `lastOrder` | `Order \| null` | Order belonging to lastSchedule |
| `notifications` | `Notif[]` | Toast messages, max 5, shown on Dashboard |
| `scheduleMap` | `Record<orderId, { slaStatus, slaDiff }>` | SLA status per order — source of truth for Reports |

**Important:** `scheduleMap` is persisted to `sessionStorage` so it survives page refresh.
On mount, it is rehydrated from `sessionStorage`.

**Type:** `Record<string, { slaStatus: string; slaDiff: number; machines?: string }>`
Access pattern: `scheduleMap[orderId]?.slaStatus === "RISK"`

> Do NOT access scheduleMap as `scheduleMap[id] === "RISK"` — it is an object, not a string. This was the cause of the `Cannot read properties of undefined` TypeError in ReportsPage.

`scheduleMap[orderId]?.machines` stores a comma-separated list of assigned machine IDs for Orders and Reports.

---

## 9. API Reference

### POST /api/schedule

Creates order, runs scheduler, generates AI analysis.

**Request:**
```json
{
  "customer": "Acme Corp",
  "product": "Brochure",
  "quantity": 10000,
  "paperType": "Coated",
  "priority": "High",
  "deadlineHour": 18,
  "currentMachines": []
}
```

`currentMachines` is optional but used by the live app. It allows the backend scheduler to respect the current machine queues instead of scheduling from static defaults.

**Validation:**
- `customer` — required, max 100 chars
- `quantity` — positive integer, min 100
- `priority` — High / Medium / Low only
- `deadlineHour` — integer 0–23, must be a future hour (checked with `isBefore`)

**Response:**
```json
{
  "order": { "id": "ORD-A1B2C3", "status": "Pending Approval", ... },
  "schedule": {
    "tasks": [{ "machineId": "M3", "assignedQty": 7826, "estimatedHours": 0.65 }],
    "overallFinish": "...",
    "slaStatus": "SAFE",
    "slaDiff": 208,
    "explanation": "Gemini text...",
    "risk": { "riskScore": 22, "riskLevel": "LOW", "anomalies": [], "recommendation": "..." }
  },
  "machines": [{ "id": "M1", "status": "busy", "queue": ["..."] }],
  "preemptionEvents": []
}
```

---

### GET /api/orders

Returns orders from Supabase. Falls back to 4 hardcoded seed orders if Supabase is unavailable.

### PATCH /api/orders

```json
{ "id": "ORD-A1B2C3", "status": "Completed" }
```

---

### GET /api/machines

Returns machines from Supabase. Falls back to DEFAULT_MACHINES.

### PATCH /api/machines

```json
{ "id": "M1", "status": "breakdown", "utilisation": 0 }
```

---

### POST /api/simulate-failure

**Request:**
```json
{
  "failedMachineId": "M1",
  "orderId": "ORD-A1B2C3",
  "tasks": [...],
  "completedFraction": 0.5
}
```

- `completedFraction` is clamped to 0–1 automatically
- `failedMachineId` must exist in `tasks` — returns 400 with message if not found

**Response:**
```json
{
  "newTasks": [...],
  "result": { "slaStatus": "RISK", "slaDiff": -23, "explanation": "M1 broke down..." },
  "failedMachineId": "M1",
  "backupMachineId": "M5",
  "remainingQty": 2500
}
```

---

### GET /api/planned-jobs

Reads `schedules` joined with `orders`. Maps each task in a schedule to one PlannedJob row.

**Query params:** `stage`, `shift`, `operator`

**Stage mapping:**
- Task index 0 → `pre-press`
- Task index last → `post-press`
- All others → `press`

**Status mapping:**
- Schedule `sla_status === "RISK"` → `printing_status: "Error"`
- Otherwise → `printing_status: "Ongoing"`

Returns empty `{ jobs: [], stats: {...zeros} }` if no schedules exist — does NOT throw error.

### PATCH /api/planned-jobs

Saves AI suggestion text back to the `schedules.explanation` column.

```json
{ "id": "ORD-A1B2C3-M1", "ai_suggestion": "Reassign to M3 — faster speed (saves 2h)" }
```

---

### POST /api/planned-jobs/optimise

Feeds at-risk jobs to Gemini and returns machine reassignment suggestions.

**Request:** `{ jobs: PlannedJob[] }`

**Response:**
```json
{
  "suggestions": [
    { "jobId": "ORD-A1B2C3-M1", "suggestedMachine": "M3", "reason": "Faster speed", "expectedImpact": "saves 2h" }
  ]
}
```

Has deterministic fallback if Gemini fails.

---

### POST /api/analyse-risk

Standalone risk analysis endpoint. Same logic as the risk analysis bundled in `/api/schedule`.

**Request:** `{ order, schedule }`

**Response:** `{ riskScore, riskLevel, anomalies[], recommendation }`

---

## 10. Components

### DashboardPage `[Planner]`
- 4 metric cards: total orders, active machines, SLA compliance %, total sheets scheduled
- Notification strip (up to 3 shown, max 5 stored)
- Recent orders list (last 5)
- Machine utilisation progress bars per machine

---

### OrdersPage `[Planner]`
- Order form with client-side validation:
  - customer required
  - quantity ≥ 100
  - deadlineHour must be greater than current hour
- Calls `POST /api/schedule` on submit
- Displays full order list with priority + status badges

---

### PlannedJobsPage `[Planner]`
- Fetches from `GET /api/planned-jobs` on mount and on filter change
- Filters: stage (pre-press / press / post-press), shift, operator, search
- Stage cards are clickable filters — click same stage again to clear
- AI Optimise button → `POST /api/planned-jobs/optimise` → annotates at-risk jobs with amber sparkle icon
- Pagination: 10 items per page, Prev/Next buttons
- Select all / individual checkboxes (selection state only — no bulk action implemented yet)
- Silent fail on load error — does NOT push notification to Dashboard

**Buttons with no action yet (UI only):**
- "Today" date picker button
- "Assign to" button
- Filter icon button
- Layout toggle (list/grid)

---

### SchedulePage `[Admin]`
- Shows `lastSchedule` + `lastOrder` from global state
- Empty state: bot icon + message if no schedule exists yet
- Summary card: estimated finish, deadline, machines used, SLA badge
- AI decision steps: 6-step walkthrough with inline details on steps 4 and 5
- Workload distribution bar chart (Recharts) + per-machine progress bars
- Risk analysis panel: colour-coded LOW(green) / MEDIUM(amber) / HIGH(red), risk score, anomalies list, recommendation
- Gemini explanation panel

---

### MachinesPage `[Admin]`
- Machine cards: ID, speed, capacity, dedicated paper type, live queue countdown/progress, queued-job depth, status badge
- Breakdown simulator:
  - Dropdown shows `available` AND `busy` machines (not just available)
  - Calls `POST /api/simulate-failure`
  - Shows 3 alert messages after: detection, reassignment, new SLA + explanation
- Reset button: restores DEFAULT_MACHINES and seeds M2 with a running demo queue job

---

### ReportsPage `[Admin]`
- Props: `orders`, `machines`, `scheduleMap: Record<string, { slaStatus: string; slaDiff: number; machines?: string }>`
- SLA risk count: reads `scheduleMap[orderId]?.slaStatus === "RISK"` (must use `?.` — can be undefined)
- 4 summary cards: total qty, completed orders, SLA compliance %, active machines
- Order status pie chart
- Machine utilisation bar chart
- SLA performance table: SLA badge reads from scheduleMap first, falls back to order.status
- Download Excel button exports Summary, Orders, and Machines sheets via SheetJS

---

### Sidebar
- 6 nav items: Dashboard, Orders, Planned Jobs, Machines, AI Schedule, Reports
- Active page highlighted in blue

---

### Badge
Variants: `safe`(green) `risk`(red) `warn`(amber) `info`(blue) `gray` `high`(red) `medium`(amber) `low`(gray)

---

## 11. Core Library

### lib/scheduler.ts

**Current implementation**
- `normaliseMachine()` enforces fixed paper routing: M1 = Coated, M2 = Glossy, M3 = Matte, M4 = Uncoated, M5 = all paper types as backup.
- `runScheduler()` picks available compatible machines first; if none are free, it queues behind compatible busy machines.
- `dispatchScheduleToMachines()` pushes scheduled tasks onto machine queues.
- `tickMachines()` completes compressed-time jobs, frees machines, and starts the next queued job.
- `seedM2WithRunningJob()` starts M2 with one real demo queue job instead of a fake permanent busy state.

### lib/timeEngine.ts

- Compression rule: 4 factory hours = 2 real minutes.
- 1 factory hour = 30 real seconds.
- `computeRealFinish()` calculates the real wall-clock finish time used by live queue countdowns.

**`runScheduler(order, machines)`**
1. Filter production machines by fixed paper routing and current status (`available` or `busy`)
2. Exclude M5 from normal scheduling; M5 is used for backup recovery and same-priority overflow
3. Prefer available compatible machines, then compatible busy machines
4. If the new priority is higher than the running job, estimate from now because it can preempt
5. Otherwise estimate after the compatible machine's queued work
6. `overallFinish` = latest task finish time
7. `slaDiff` = deadline minus overallFinish in minutes
8. `slaStatus` = "SAFE" if diff is non-negative, else "RISK"

**`simulateBreakdown(failedMachineId, completedFraction, originalTasks, machines, order)`**
1. Find failed task, calculate `remainingQty = assignedQty × (1 − completedFraction)`
2. Find backup machine with `status === "backup"`
3. Replaces failed task with new backup task
4. Recalculates `overallFinish` and SLA

---

### lib/gemini.ts

| Function | Input | Output |
|---|---|---|
| `generateScheduleExplanation` | order, scheduleResult | 2–3 sentence plain-English explanation |
| `analyseRisk` | order, machines[], scheduleResult | `{ riskScore, riskLevel, anomalies[], recommendation }` |
| `generateFailureExplanation` | failedId, backupId, remainingQty, slaStatus | 2-sentence breakdown alert |

All three have deterministic fallbacks if Gemini API fails or returns invalid JSON.

`analyseRisk` prompt instructs Gemini to return raw JSON only (no markdown). Response is stripped of code fences before `JSON.parse`.

---

### lib/validation.ts

| Schema | Validates |
|---|---|
| `CreateOrderSchema` | Used in `POST /api/schedule` |
| `UpdateOrderSchema` | Used in `PATCH /api/orders` |
| `UpdateMachineSchema` | Used in `PATCH /api/machines` |

`validateData(schema, data)` returns `{ success: true, data }` or `{ success: false, error: string }`.

---

### lib/supabase.ts

Lazy singleton via Proxy. Client is created once on first property access. Throws if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing.

---

### lib/env.ts

Validates all 3 required env vars on server startup. In production, throws if any are missing. In development, logs warning only.

---

## 12. AI Integration

Gemini is used in 3 places. It is **never** the decision-maker — the scheduler algorithm makes all decisions. Gemini only narrates, scores, and suggests.

### 1. Schedule Explanation
After `runScheduler()` returns, the result is passed to Gemini with the order details. Gemini writes a 2–3 sentence explanation of why those machines were chosen and what the SLA status means. Shown in the blue panel at the bottom of AI Schedule page.

### 2. Risk Analysis
Also called after every schedule. Gemini receives:
- Full order details
- All machine states (status, speed, utilisation, paper types)
- Schedule result (tasks, finish time, slaDiff, slaStatus)

Returns structured JSON:
```json
{
  "riskScore": 0-100,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "anomalies": ["string", ...],
  "recommendation": "string"
}
```

Fallback: `riskScore = 75` if RISK, `25` if SAFE. `riskLevel` mirrors `slaStatus`.

### 3. Failure Explanation
After `simulateBreakdown()`, Gemini generates a 2-sentence alert for the supervisor explaining the breakdown and reassignment. Shown in the MachinesPage notification strip.

### 4. Planned Job Optimisation
`POST /api/planned-jobs/optimise` feeds at-risk jobs (high priority or ageing > 5 days) to Gemini. Returns machine reassignment suggestions with reason and expected impact. Jobs with suggestions show an amber sparkle icon in the table.

---

## 13. Bugs Fixed & Why

### Logic Errors

| # | Where | Bug | Fix |
|---|---|---|---|
| 1 | `scheduler.ts` | `Math.round` on each task caused total qty to drift | Last machine absorbs remainder |
| 2 | `scheduler.ts` | `simulateBreakdown` threw if no `backup` machine existed | Falls back to any `available` machine |
| 3 | `page.tsx` | `scheduleMap` not updated after breakdown | Updated in `handleFailure` by `result.orderId` |
| 4 | `MachinesPage` | Breakdown dropdown excluded `busy` machines | Added `busy` to filter |
| 5 | `OrdersPage` | Quantity `< 100` only blocked by HTML, not JS | Added JS guard before fetch |

### Edge Cases Fixed

| # | Where | Bug | Fix |
|---|---|---|---|
| 1 | `schedule/route.ts` + `OrdersPage` | Past deadline not rejected | `isBefore` check on API + client-side hour check |
| 2 | `simulate-failure/route.ts` | `completedFraction` outside 0–1 not guarded | `Math.min(1, Math.max(0, fraction))` |
| 3 | `schedule/route.ts` | Zod schema existed but was never used | `validateData(CreateOrderSchema, body)` added |
| 4 | `simulate-failure/route.ts` | `failedMachineId` not validated against tasks | Returns 400 if ID not found in tasks |
| 5 | `page.tsx` | `scheduleMap` lost on page refresh | Persisted to `sessionStorage`, rehydrated on mount |
| 6 | `page.tsx` | Breakdown only updated `lastOrder` | Now uses `data.result.orderId` to update correct order |
| 7 | `ReportsPage` | SLA compliance % used `order.status` only | Now reads from `scheduleMap` as source of truth |

### Runtime Errors Fixed

| Error | Cause | Fix |
|---|---|---|
| `Cannot read properties of undefined (reading 'ORD-1001')` | `ReportsPage` typed `scheduleMap` as `Record<string, "SAFE"\|"RISK">` but `page.tsx` stores `{ slaStatus, slaDiff }` objects | Updated `ReportsPage` prop type + all access to use `scheduleMap[id]?.slaStatus` |
| `"Failed to load planned jobs"` on Dashboard at startup | `/api/planned-jobs` route didn't exist → fetch threw → catch fired notification | Created the route; changed catch to silent fail |
| Planned Jobs showed nothing after scheduling | `PlannedJobsPage` called a non-existent separate `planned_jobs` table | Route now reads from `schedules` + `orders` tables |

---

## 14. Known Incomplete Features

| Feature | Location | Status |
|---|---|---|
| "Assign to" button | `PlannedJobsPage` | UI only, no handler |
| Filter icon button | `PlannedJobsPage` | UI only, no handler |
| Layout toggle (grid view) | `PlannedJobsPage` | UI only, always list view |
| "Today" date picker | `PlannedJobsPage` | UI only, no handler |
| Bulk action on selected jobs | `PlannedJobsPage` | Checkboxes work, no bulk operation |
| Operator filter | `PlannedJobsPage` | Sends to API but API ignores it (no operator column) |
| Role-based auth | Sidebar | All pages visible to all users — no login/auth yet |
| Order status sync back to Supabase | `page.tsx` | Status updated in React state only, not PATCHed to Supabase |

---

## 15. Running the Project

```bash
# Install dependencies
npm install

# Run dev server
npm run dev
# Open http://localhost:3000

# Build for production
npm run build
npm start

# Lint
npm run lint
```

---

## 16. Deployment

Pre-configured for Vercel via `vercel.json`.

1. Push to GitHub
2. Import on [vercel.com](https://vercel.com)
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
4. Deploy — Vercel runs `npm run build` on every push to main
