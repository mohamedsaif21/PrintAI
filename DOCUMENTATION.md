# PrintAI — Full Project Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Setup](#4-environment-setup)
5. [Database Schema](#5-database-schema)
6. [Architecture & Data Flow](#6-architecture--data-flow)
7. [API Reference](#7-api-reference)
8. [Modules & Components](#8-modules--components)
9. [Core Library](#9-core-library)
10. [AI Integration](#10-ai-integration)
11. [Role Segregation](#11-role-segregation)
12. [Running the Project](#12-running-the-project)
13. [Deployment](#13-deployment)

---

## 1. Project Overview

PrintAI is a production planning and monitoring dashboard built for a print factory managing multiple machines (printers for dress tags, labels, and other print products).

It provides two layers:

- **Planning** — Submit orders, auto-schedule across machines, track SLA deadlines
- **Monitoring** — Real-time machine status, utilisation, breakdown simulation, AI risk analysis

AI is used in two ways:

- **Rule-based scheduler** — deterministic workload split by machine speed/availability
- **Gemini 1.5 Flash** — natural language explanation of decisions + SLA risk scoring + anomaly detection

---

## 2. Tech Stack

| Layer         | Technology              |
| ------------- | ----------------------- |
| Framework     | Next.js 16 (App Router) |
| Language      | TypeScript 5            |
| Styling       | Tailwind CSS v4         |
| Database      | Supabase (PostgreSQL)   |
| AI            | Google Gemini 1.5 Flash |
| Charts        | Recharts                |
| Icons         | Lucide React            |
| Validation    | Zod                     |
| Date handling | date-fns                |
| Deployment    | Vercel                  |

---

## 3. Project Structure

```
PrintAI/
│
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── analyse-risk/
│   │   │   └── route.ts          # POST — standalone risk analysis
│   │   ├── machines/
│   │   │   └── route.ts          # GET / PATCH — machine data
│   │   ├── orders/
│   │   │   └── route.ts          # GET / PATCH — order data
│   │   ├── schedule/
│   │   │   └── route.ts          # POST — create order + schedule + AI
│   │   └── simulate-failure/
│   │       └── route.ts          # POST — breakdown simulation
│   ├── globals.css
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Root — global state + page routing
│
├── components/
│   ├── ui/
│   │   └── Badge.tsx             # Reusable status badge
│   ├── DashboardPage.tsx         # Planner view — metrics + notifications
│   ├── ErrorBoundary.tsx         # React error boundary
│   ├── MachinesPage.tsx          # Admin view — machine cards + simulator
│   ├── OrdersPage.tsx            # Planner view — order form + list
│   ├── ReportsPage.tsx           # Admin view — charts + SLA table
│   ├── SchedulePage.tsx          # Admin view — AI schedule + risk panel
│   └── Sidebar.tsx               # Navigation
│
├── lib/
│   ├── env.ts                    # Startup env validation
│   ├── gemini.ts                 # All Gemini AI functions
│   ├── logger.ts                 # Structured logger
│   ├── scheduler.ts              # Core scheduling algorithm
│   ├── supabase.ts               # Supabase client
│   ├── utils.ts                  # cn() utility
│   └── validation.ts             # Zod schemas
│
├── types/
│   └── index.ts                  # All shared TypeScript types
│
├── public/                       # Static assets
├── .env.local                    # Secrets (gitignored)
├── .env.example                  # Env template
├── supabase-schema.sql           # DB setup script
├── next.config.ts
├── tsconfig.json
├── package.json
└── vercel.json
```

---

## 4. Environment Setup

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
GEMINI_API_KEY=AIzaSy...
```

**Getting Supabase keys:**

1. Go to [supabase.com](https://supabase.com) → your project
2. Settings → API → copy Project URL and anon key

**Getting Gemini key:**

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create API key (must start with `AIza`)

---

## 5. Database Schema

Run `supabase-schema.sql` in your Supabase SQL Editor.

### orders

| Column     | Type        | Description                                             |
| ---------- | ----------- | ------------------------------------------------------- |
| id         | text (PK)   | e.g. `ORD-A1B2C3`                                       |
| customer   | text        | Customer name                                           |
| product    | text        | Product type (Brochure, Flyer etc.)                     |
| quantity   | integer     | Number of sheets                                        |
| paper_type | text        | Coated / Glossy / Matte / Uncoated                      |
| priority   | text        | High / Medium / Low                                     |
| deadline   | timestamptz | Deadline time                                           |
| status     | text        | Pending / Scheduled / In Progress / Completed / At Risk |
| created_at | timestamptz | Creation timestamp                                      |

### machines

| Column      | Type      | Description                           |
| ----------- | --------- | ------------------------------------- |
| id          | text (PK) | M1–M5                                 |
| speed       | integer   | Sheets per hour                       |
| capacity    | integer   | Max sheets per day                    |
| status      | text      | available / busy / backup / breakdown |
| paper_types | text[]    | Supported paper types                 |
| utilisation | integer   | 0–100%                                |

### schedules

| Column         | Type        | Description                              |
| -------------- | ----------- | ---------------------------------------- |
| id             | uuid (PK)   | Auto-generated                           |
| order_id       | text (FK)   | References orders.id                     |
| tasks          | jsonb       | Array of ScheduledTask objects           |
| overall_finish | timestamptz | Estimated completion time                |
| sla_status     | text        | SAFE / RISK                              |
| sla_diff       | integer     | Minutes ahead (+) or behind (-) deadline |
| explanation    | text        | Gemini-generated explanation             |
| created_at     | timestamptz | Schedule creation time                   |

### Seed Data (5 machines)

| ID  | Speed  | Capacity   | Status    | Paper Types                     |
| --- | ------ | ---------- | --------- | ------------------------------- |
| M1  | 500/hr | 10,000/day | available | Coated, Glossy, Matte, Uncoated |
| M2  | 400/hr | 8,000/day  | busy      | Coated, Uncoated                |
| M3  | 600/hr | 12,000/day | available | Coated, Glossy, Matte, Uncoated |
| M4  | 450/hr | 9,000/day  | available | Coated, Matte, Uncoated         |
| M5  | 300/hr | 6,000/day  | backup    | Coated, Uncoated                |

---

## 6. Architecture & Data Flow

### Order Scheduling Flow

```
User fills order form (OrdersPage)
        ↓
POST /api/schedule
        ├── 1. Zod validation (CreateOrderSchema)
        ├── 2. Past deadline check
        ├── 3. Fetch machines from Supabase (fallback to defaults)
        ├── 4. Fetch existing schedules from Supabase (queueing lookup)
        ├── 5. runScheduler() — workload split by speed + queueing
        ├── 6. generateScheduleExplanation() — Gemini narration
        ├── 7. analyseRisk() — Gemini risk score + anomalies
        └── 8. Persist order + schedule to Supabase
                ↓
        handleScheduled() in page.tsx
                ├── Add order to orders state
                ├── Update machine utilisations
                ├── Update scheduleMap (+ sessionStorage)
                └── Navigate to AI Schedule tab
```

### Breakdown Simulation Flow

```
User selects machine + clicks "Trigger breakdown" (MachinesPage)
        ↓
POST /api/simulate-failure
        ├── 1. Clamp completedFraction to 0–1
        ├── 2. Validate failedMachineId exists in tasks
        ├── 3. Fetch order from Supabase
        ├── 4. simulateBreakdown() — reroute to backup machine
        └── 5. generateFailureExplanation() — Gemini alert
                ↓
        handleFailure() in page.tsx
                ├── Mark failed machine as "breakdown"
                ├── Update backup machine utilisation
                ├── Update scheduleMap with new SLA status
                └── Update order status to "At Risk" if RISK
```

### State Management

All global state lives in `app/page.tsx`:

| State         | Type                 | Purpose                                            |
| ------------- | -------------------- | -------------------------------------------------- |
| orders        | Order[]              | All orders                                         |
| machines      | Machine[]            | Machine statuses + utilisations                    |
| lastSchedule  | ScheduleResult       | Most recent schedule result                        |
| lastOrder     | Order                | Most recent scheduled order                        |
| scheduleMap   | Record<orderId, SLA> | SLA status per order (persisted to sessionStorage) |
| notifications | Notif[]              | Toast notifications (max 5)                        |

---

## 7. API Reference

### POST /api/schedule

Creates an order, runs the scheduler, and generates AI analysis.

**Request body:**

```json
{
  "customer": "Acme Corp",
  "product": "Brochure",
  "quantity": 10000,
  "paperType": "Coated",
  "priority": "High",
  "deadlineHour": 18
}
```

**Validation rules:**

- `customer` — required, max 100 chars
- `product` — required, max 100 chars
- `quantity` — positive number, min 100
- `paperType` — required
- `priority` — High / Medium / Low
- `deadlineHour` — integer 0–23, must be in the future

**Response:**

```json
{
  "order": { "id": "ORD-A1B2C3", "status": "Scheduled", ... },
  "schedule": {
    "orderId": "ORD-A1B2C3",
    "tasks": [{ "machineId": "M3", "assignedQty": 7826, "estimatedHours": 0.65, ... }],
    "overallFinish": "2024-01-15T14:32:00.000Z",
    "slaStatus": "SAFE",
    "slaDiff": 208,
    "explanation": "M3 and M1 were selected as the fastest available...",
    "risk": {
      "riskScore": 22,
      "riskLevel": "LOW",
      "anomalies": [],
      "recommendation": "Schedule is on track, no action needed."
    }
  }
}
```

---

### GET /api/orders

Returns all orders from Supabase. Falls back to 4 seed orders if Supabase is unavailable.

### PATCH /api/orders

Updates an order's status.

**Request body:**

```json
{ "id": "ORD-A1B2C3", "status": "Completed" }
```

---

### GET /api/machines

Returns all machines from Supabase. Falls back to DEFAULT_MACHINES if unavailable.

### PATCH /api/machines

Updates a machine's status or utilisation.

**Request body:**

```json
{ "id": "M1", "status": "breakdown", "utilisation": 0 }
```

---

### POST /api/simulate-failure

Simulates a mid-run machine breakdown and reassigns work.

**Request body:**

```json
{
  "failedMachineId": "M1",
  "orderId": "ORD-A1B2C3",
  "tasks": [...],
  "completedFraction": 0.5
}
```

- `completedFraction` — how much the machine had completed (0–1, clamped automatically)
- `failedMachineId` — must exist in the provided tasks array

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

### POST /api/analyse-risk

Standalone endpoint for Gemini risk analysis.

**Request body:**

```json
{ "order": { ... }, "schedule": { ... } }
```

**Response:**

```json
{
  "riskScore": 68,
  "riskLevel": "MEDIUM",
  "anomalies": [
    "Only 1 machine supports Glossy paper",
    "M2 is busy and unavailable"
  ],
  "recommendation": "Consider pre-assigning M3 as primary to reduce single-machine dependency."
}
```

---

## 8. Modules & Components

### page.tsx — Root

Central hub. Owns all state and passes data + callbacks to child pages.

Key functions:

- `handleScheduled(order, schedule)` — called after successful scheduling
- `handleFailure(data)` — called after breakdown simulation
- `handleReset()` — resets machines to defaults
- `loadOrders()` — fetches orders from Supabase on mount

---

### DashboardPage

**Role: Planner**

Displays:

- 4 metric cards — total orders, active machines, SLA compliance %, sheets scheduled
- Up to 3 recent notifications (success / warn / info)
- Recent orders list (last 5)
- Machine utilisation progress bars

---

### OrdersPage

**Role: Planner**

- Order submission form with validation
- Calls `POST /api/schedule` on submit
- Client-side guards: customer required, quantity ≥ 100, deadline must be future hour
- Displays full order list with priority and status badges

---

### SchedulePage

**Role: Admin**

Displays the most recent schedule result:

- Summary card — estimated finish, deadline, machines used, SLA badge
- AI decision steps — 6-step walkthrough of scheduling logic
- Workload distribution bar chart per machine
- Risk analysis panel — colour-coded by LOW/MEDIUM/HIGH with anomalies list
- Gemini explanation panel

---

### MachinesPage

**Role: Admin**

- Machine cards showing status, speed, capacity, paper types, utilisation bar
- Breakdown simulator — select any available/busy machine, trigger failure
- Shows 3 notification alerts after breakdown: detection, reassignment, new SLA

---

### ReportsPage

**Role: Admin**

- 4 summary cards — total quantity, completed orders, SLA compliance %, active machines
- Order status pie chart
- Machine utilisation bar chart
- Full SLA performance table — reads from `scheduleMap` as source of truth

---

### Sidebar

Navigation between 5 pages. Active page highlighted in blue.

---

### Badge

Reusable pill component. Variants: `safe`, `risk`, `warn`, `info`, `gray`, `high`, `medium`, `low`.

---

## 9. Core Library

### lib/scheduler.ts

**`runScheduler(order, machines, machineAvailability)`**

1. Filter machines by `status === "available"` and paper type match
2. Sort by speed descending (fastest first)
3. Split quantity proportionally by speed ratio — last machine absorbs rounding remainder
4. Calculate task `startTime` based on `now` or `machineAvailability[m.id]` (to stack tasks in a queue)
5. Calculate `overallFinish` = latest task finish time
6. Compute `slaDiff` = deadline − overallFinish in minutes
7. Return `slaStatus: "SAFE"` if diff ≥ 0, else `"RISK"`

**`simulateBreakdown(failedMachineId, completedFraction, originalTasks, machines, order, machineAvailability)`**

1. Find failed machine's task, calculate `remainingQty = assignedQty × (1 − completedFraction)`
2. Find backup machine (status `"backup"` first, then any `"available"`)
3. Determine backup machine's `startTime` based on its existing queue
4. Replace failed task with new backup task
5. Recalculate `overallFinish` and SLA

---

### lib/gemini.ts

| Function                                                   | Purpose                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `generateScheduleExplanation(order, result)`               | 2–3 sentence explanation of why machines were chosen and SLA status       |
| `analyseRisk(order, machines, schedule)`                   | Returns `riskScore`, `riskLevel`, `anomalies[]`, `recommendation` as JSON |
| `generateFailureExplanation(failedId, backupId, qty, sla)` | 2-sentence breakdown alert for supervisor                                 |

All functions have deterministic fallbacks if Gemini API fails.

---

### lib/validation.ts

Zod schemas:

| Schema                | Used in               |
| --------------------- | --------------------- |
| `CreateOrderSchema`   | `POST /api/schedule`  |
| `UpdateOrderSchema`   | `PATCH /api/orders`   |
| `UpdateMachineSchema` | `PATCH /api/machines` |

Helper: `validateData(schema, data)` returns `{ success, data }` or `{ success: false, error }`.

---

### lib/supabase.ts

Lazy singleton Supabase client. Initialised once on first use via Proxy pattern. Throws if env vars are missing.

---

### lib/env.ts

Validates all required env vars on server startup. Throws in production if any are missing. Logs warning in development.

---

### lib/logger.ts

Structured logger with `logError`, `logWarn`, `logInfo`. Includes timestamp and context. Ready for Sentry integration.

---

## 10. AI Integration

### How Gemini is used

Gemini is **not** a decision-maker. The scheduler makes all decisions deterministically. Gemini is used for:

1. **Narration** — Explains scheduling decisions in plain English for supervisors
2. **Risk Scoring** — Analyses full context (machines, load, paper type, SLA margin) and returns a structured risk assessment
3. **Failure Alerts** — Generates factual breakdown notifications

### Risk Analysis Detail

Input to Gemini:

- Order details (quantity, product, paper type, priority, deadline)
- All machine states (status, speed, utilisation, supported papers)
- Schedule result (task assignments, finish time, SLA diff)

Output:

```json
{
  "riskScore": 0-100,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "anomalies": ["string", ...],
  "recommendation": "string"
}
```

Fallback (if Gemini unavailable): deterministic score based on `slaStatus`.

---

## 11. Role Segregation

| Module      | Planner | Admin |
| ----------- | ------- | ----- |
| Dashboard   | ✅      | —     |
| Orders      | ✅      | —     |
| AI Schedule | —       | ✅    |
| Machines    | —       | ✅    |
| Reports     | —       | ✅    |

> Role-based routing is currently managed via sidebar visibility. Authentication and enforced route protection can be added using Supabase Auth + Next.js middleware.

---

## 12. Running the Project

**Install dependencies:**

```bash
npm install
```

**Run development server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Build for production:**

```bash
npm run build
npm start
```

**Lint:**

```bash
npm run lint
```

---

## 13. Deployment

The project is pre-configured for Vercel via `vercel.json`.

**Steps:**

1. Push to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
4. Deploy

Vercel will run `npm run build` automatically on every push to main.
