# PrintAI — Full Technical & Architectural Documentation

> Last updated after: 3-pass high-priority scheduler with preemption, live machine queue engine, dynamic simulation clock, approval workflow, raw materials inventory tracking, automatic database fallbacks, self-healing startup reconciliation, and Excel report export.
> 
> PrintAI is an AI-powered production scheduling system designed for print factories. It dynamically schedules orders, handles machine breakdowns, executes high-priority preemption, and calculates deterministic SLA risks with AI-enhanced insights.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Setup](#4-environment-setup)
5. [Database Schema](#5-database-schema)
6. [Role Segregation](#6-role-segregation)
7. [Architecture & Data Flow](#7-architecture--data-flow)
8. [State Management & Reconciliation](#8-state-management--reconciliation)
9. [Core Scheduling Engines](#9-core-scheduling-engines)
10. [API Reference](#10-api-reference)
11. [Primary UI Components](#11-primary-ui-components)
12. [Core Library](#12-core-library)
13. [AI Integration](#13-ai-integration)
14. [Bugs Fixed & Why](#14-bugs-fixed--why)
15. [Known Incomplete Features](#15-known-incomplete-features)
16. [Running the Project](#16-running-the-project)
17. [Deployment](#17-deployment)

---

## 1. Project Overview

PrintAI is a production planning and monitoring dashboard for a print factory managing multiple machines — printers for brochures, flyers, catalogues, posters, and other print products.

The application operates across two primary layers:
* **Planning Layer:** Submit orders → auto-schedule across machines → track SLA.
* **Monitoring Layer:** Real-time machine status, dynamic utilisation progress, breakdown simulator, and AI risk scoring.

---

## 2. Tech Stack

| Layer         | Technology                         |
| ------------- | ---------------------------------- |
| Framework     | Next.js 16 (App Router, Turbopack) |
| Language      | TypeScript 5                       |
| Styling       | Tailwind CSS v4                    |
| Database      | Supabase (PostgreSQL)              |
| AI            | Google Gemini 2.5 Flash            |
| Charts        | Recharts                           |
| Icons         | Lucide React                       |
| Validation    | Zod                                |
| Date handling | date-fns                           |
| Excel Export  | SheetJS (xlsx)                     |
| Deployment    | Vercel                             |

---

## 3. Project Structure

```
PrintAI/
│
├── app/
│   ├── api/
│   │   ├── analyse-risk/
│   │   │   └── route.ts          # POST — standalone Gemini SLA risk + anomaly analysis
│   │   ├── materials/
│   │   │   ├── route.ts          # GET — raw material inventory data (with defaults fallback)
│   │   │   └── [id]/
│   │   │       └── route.ts      # GET / PATCH — material detail / updates
│   │   ├── inventory/
│   │   │   └── route.ts          # GET — material stock status + auto-seed BOM
│   │   ├── machines/
│   │   │   └── route.ts          # GET / PATCH — machine data (with ID sorting)
│   │   ├── orders/
│   │   │   ├── route.ts          # GET / PATCH — order data (with database sync)
│   │   │   └── [id]/
│   │   │       └── route.ts      # DELETE / PATCH — order manipulation
│   │   ├── planned-jobs/
│   │   │   ├── route.ts          # GET / PATCH — reads schedules+orders, maps to PlannedJob
│   │   │   └── optimise/
│   │   │       └── route.ts      # POST — Gemini AI optimise at-risk jobs
│   │   ├── schedule/
│   │   │   └── route.ts          # POST — create order + run scheduler + Gemini
│   │   └── simulate-failure/
│   │       └── route.ts          # POST — machine breakdown + reassignment
│   ├── globals.css
│   ├── layout.tsx                # Root layout with hydration warnings suppressed
│   └── page.tsx                  # Root — all global state, page routing, and reconciliation
│
├── components/
│   ├── ui/
│   │   └── Badge.tsx             # Reusable badge: safe/risk/warn/info/gray/high/medium/low
│   ├── DashboardPage.tsx         # [Planner] metrics, notifications, recent orders, utilisation
│   ├── ErrorBoundary.tsx         # React error boundary wrapper
│   ├── MachinesPage.tsx          # [Admin] machine cards + breakdown simulator
│   ├── OrdersPage.tsx            # [Planner] order form + order list
│   ├── PlannedJobsPage.tsx       # [Planner] job table with filters, search, AI optimise
│   ├── ReportsPage.tsx           # [Admin] charts + SLA compliance table + Excel Export
│   ├── SchedulePage.tsx          # [Admin] AI schedule result + risk analysis panel
│   └── Sidebar.tsx               # Navigation sidebar
│
├── lib/
│   ├── env.ts                    # Startup env variable validation
│   ├── gemini.ts                 # All Gemini AI functions
│   ├── logger.ts                 # Structured logger (Sentry-ready)
│   ├── scheduler.ts              # Core scheduling algorithm + breakdown simulation
│   ├── supabase.ts               # Supabase lazy singleton client
│   ├── bomService.ts             # BOM lookup service (with database fallback)
│   ├── inventoryService.ts       # Inventory stock checks/RPCs (with database fallback)
│   ├── utils.ts                  # cn() class merger
│   └── validation.ts             # Zod schemas for all API inputs
│
├── types/
│   ├── index.ts                  # Machine, Order, ScheduleResult, RiskAnalysis etc.
│   └── planned-jobs.ts           # PlannedJob, PlannedJobsStats, BulkOptimiseResult
│
├── public/
├── .env.local                    # Secrets — gitignored
├── .env.example                  # Template
├── supabase-schema.sql           # Core database schema
├── inventory-schema.sql          # Materials and stock procedures
├── planned-jobs-schema.sql       # Planned jobs seed definitions
├── next.config.ts
├── tsconfig.json
├── package.json
└── vercel.json
```

---

## 4. Environment Setup

Configure your `.env.local` file inside the `PrintAI` project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
GEMINI_API_KEY=AIzaSy...
```

* **Next.js Workspace Root Warning:** Next.js can sometimes misidentify parent folders as the workspace root if they contain a stray lockfile (e.g. `package-lock.json`). Ensure parent folders do not contain locking files so Next.js correctly reads `.env.local` from the `PrintAI` folder.
* **Supabase Connection Fallback:** If `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set or if the database is unreachable, the system automatically enters **Offline/Mock Fallback Mode**, allowing the app to run locally with default memory seeds without crashing.

---

## 5. Database Schema

The system uses Supabase to persist data. If you enable Supabase, ensure **Row Level Security (RLS)** is disabled for these tables (or select policies are defined), otherwise queries will silently return empty lists.

### orders
| Column     | Type        | Notes                                                                      |
| ---------- | ----------- | -------------------------------------------------------------------------- |
| id         | text PK     | e.g. `ORD-A1B2C3`                                                          |
| customer   | text        | Customer Name                                                              |
| product    | text        | Brochure, Flyer, etc.                                                      |
| quantity   | integer     | Total print run quantity                                                   |
| paper_type | text        | Coated / Glossy / Matte / Uncoated                                         |
| priority   | text        | High / Medium / Low                                                        |
| deadline   | timestamptz | Absolute date and time limit                                               |
| status     | text        | Pending / Pending Approval / Scheduled / In Progress / Completed / At Risk |
| created_at | timestamptz | Timestamp created                                                          |

### machines
| Column      | Type    | Notes                                 |
| ----------- | ------- | ------------------------------------- |
| id          | text PK | M1–M5                                 |
| speed       | integer | sheets/hour                           |
| capacity    | integer | sheets/day                            |
| status      | text    | available / busy / backup / breakdown |
| paper_types | text[]  | supported paper types                 |
| utilisation | integer | 0–100 (represented as live progress)  |

### schedules
| Column         | Type        | Notes                                  |
| -------------- | ----------- | -------------------------------------- |
| id             | uuid PK     | Auto generated                         |
| order_id       | text FK     | → orders.id                            |
| tasks          | jsonb       | Array of ScheduledTask                 |
| overall_finish | timestamptz | Projected end timestamp                |
| sla_status     | text        | SAFE / RISK                            |
| sla_diff       | integer     | minutes ahead(+) or behind(-) deadline |
| explanation    | text        | Gemini-generated explanation           |
| created_at     | timestamptz | Timestamp created                      |

### materials
| Column          | Type        | Notes                                       |
| --------------- | ----------- | ------------------------------------------- |
| id              | serial PK   | Auto increment                              |
| name            | text        | e.g. `Coated Sheet`                         |
| unit            | text        | e.g. `sheets`                               |
| total_stock     | integer     | Total stock capacity                        |
| available_stock | integer     | Available unreserved stock                  |
| threshold_level | integer     | Level triggering a Low Stock alert          |
| created_at      | timestamptz | Timestamp created                      |

### bom (Bill of Materials)
| Column            | Type      | Notes                               |
| ----------------- | --------- | ----------------------------------- |
| id                | serial PK | Auto increment                      |
| product_id        | text      | e.g. `brochure_coated`              |
| material_id       | integer   | FK → materials.id                   |
| quantity_per_unit | integer   | Amount of raw materials per unit qty|

### material_usage
| Column       | Type      | Notes                                             |
| ------------ | --------- | ------------------------------------------------- |
| id           | serial PK | Auto increment                                    |
| order_id     | text      | ID of the order                                   |
| material_id  | integer   | FK → materials.id                                 |
| required_qty | integer   | Quantity required                                 |
| consumed_qty | integer   | Quantity consumed                                 |
| status       | text      | Status: `reserved`, `consuming`, `completed`, `released` |

---

## 6. Role Segregation

| Page         | Planner | Admin |
| ------------ | ------- | ----- |
| Dashboard    | ✅      | —     |
| Orders       | ✅      | —     |
| Planned Jobs | ✅      | —     |
| Machines     | —       | ✅    |
| AI Schedule  | —       | ✅    |
| Reports      | —       | ✅    |

> Role routing is managed via sidebar tab visibility. In production environments, access control can be enforced using Supabase Auth and Next.js middleware routing.

---

## 7. Architecture & Data Flow

### A. Order Submission & Scheduling Flow
1. User submits the order form (`OrdersPage`).
2. Client posts to `/api/schedule` with order parameters and `currentMachines` queue.
3. `/api/schedule` validates data via Zod, calculates deadlines, and retrieves active machines.
4. If priority is **High**, it uses the `scheduleHighPriorityOrder` escalation scheduler. Otherwise, it uses the standard `runScheduler`.
5. Gemini model generates plain-text schedule explanations and SLA risk assessments.
6. Order and Schedule metadata are saved in Supabase (if configured). Raw materials are reserved via `reserveMaterial` RPC.
7. Client state is updated, navigating the user to the `AI Schedule` tab.

### B. Machine Simulation Clock (`tickMachines` loop)
* The client runs `tickMachines()` every 3 seconds (simulating 6 minutes of factory time).
* It checks if the currently running job has completed (`now >= realFinishAt`).
* When completed, the job is popped, the order status changes to `Completed` (if all assigned tasks finish), and materials are deducted.
* If a paused or preempted job is next in the queue, the clock recalculates its remaining finish time from its frozen state and resumes execution automatically.

### C. Browser Extension Hydration Mismatch Fix
* Web browsers running extensions (like Bilibili theme checkers) inject utility attributes (`bis_skin_checked`, `bis_register`) into components dynamically.
* To prevent React client-side rendering mismatches from warning in the browser console, `suppressHydrationWarning` is configured on the `<html>` and `<body>` layout elements.

---

## 8. State Management & Reconciliation

All global states reside in [page.tsx](file:///c:/Users/sidha/OneDrive/Desktop/projects/attest_p1/New%20folder/PrintAI/app/page.tsx) (`orders`, `machines`, `lastSchedule`, `lastOrder`, `notifications`, `scheduleMap`).

### A. State Healing Reconciliation Hook
An automatic `useEffect` reconciliation hook in `app/page.tsx` runs whenever orders or machines load. If a machine's database status is loaded as `busy` but the corresponding order does not exist or has been deleted, the application automatically heals the state, sets the machine back to `available` (or `backup` for `M5`), resets its utilization to `0%`, and patches the Supabase database in the background to sync the states.

### B. Dynamic Utilisation Calculation
Instead of displaying a static, flat database percentage, the simulation ticker calculates the precise in-progress completion percentage of currently running jobs on every simulation tick (`now - startedAt` divided by the total duration). This ensures progress bars on both the **Machines** and **Dashboard** pages update and animate in real-time.

---

## 9. Core Scheduling Engines

### A. Normal Scheduler (`lib/scheduler.ts`)
Used for **Low** and **Medium** priority orders:
* Filters eligible machines by required `paperType`.
* Excludes backup machine `M5` (reserved for standby breakdowns) and broken down machines.
* Spreads workload proportionally according to machine speed.
* If a machine is busy, the workload is queued at the end of the machine's in-memory queue.

### B. High-Priority 3-Pass Scheduler (`lib/highPriorityScheduler.ts`)
Used for **High** priority orders. Escolates workload placement through three distinct passes:
1. **Pass 1 (Normal):** Tries to schedule on primary machines. If completion is safe within the SLA buffer, it assigns.
2. **Pass 2 (Backup):** Routes the workload to the standby backup machine `M5` if it is available and can complete within SLA.
3. **Pass 3 (Preemption):** Scans compatible busy machines running Low/Medium jobs. Pauses the running job, splits its remaining quantity, creates a `paused` job task, and places the High-priority job first to start running immediately.

---

## 10. API Reference

### POST /api/schedule
* **Body:** `{ customer, product, quantity, paperType, priority, deadlineHours, currentMachines }`
* **Response:** `{ order, schedule: ScheduleResult, machines: Machine[], preemptionEvents: PreemptionEvent[] }`

### GET /api/materials
* **Response:** Array of `Material` objects. Automatically falls back to 4 mock sheets if Supabase is unconfigured.

### GET /api/orders
* **Response:** `{ orders: Order[] }`

### PATCH /api/orders
* **Body:** `{ id, status }`
* **Action:** Updates order status. If set to `Completed`, calls BOM inventory subtraction services.

### GET /api/machines
* **Response:** `{ machines: Machine[] }`. Returns machines sorted strictly by ID (`M1`, `M2`, `M3`, `M4`, `M5`). Sanitizes startup statuses of machines with empty queues.

### POST /api/simulate-failure
* **Body:** `{ failedMachineId, orderId, tasks, completedFraction }`
* **Response:** `{ newTasks, result, failedMachineId, backupMachineId, remainingQty }`

---

## 11. Primary UI Components

* **`DashboardPage.tsx`:** Displays KPIs, recent orders, raw materials stock, and machine utilisation bars. Features a greeting banner that contextually guides the user to add orders if the dashboard is empty.
* **`OrdersPage.tsx`:** Provides the order creation form with strict client-side validation alongside the detailed order log.
* **`PlannedJobsPage.tsx`:** Tracks active work stages (Pre-press, Press, Post-press) with filters, search, and pagination. Features an "AI Optimise" helper triggering Gemini recommendations.
* **`SchedulePage.tsx`:** Visualises workload distribution, AI decision schedules, SLA risk gauges, and Gemini explanations. Allows Supervisors to approve or reject pending schedules.
* **`MachinesPage.tsx`:** Displays machine details, shift runtime timelines, downtime logs, and hosts the manual breakdown simulator.
* **`ReportsPage.tsx`:** Displays historical charts, status distributions, and houses the Excel Export button (generating multi-tab sheets via SheetJS).

---

## 12. Core Library

* **`lib/scheduler.ts`:** Handles routing configurations (M1=Coated, M2=Glossy, M3=Matte, M4=Uncoated, M5=Standby Backup). Sets up simulation clocks.
* **`lib/timeEngine.ts`:** Converts factory hours to simulation time (1 factory hour = 30 real seconds).
* **`lib/gemini.ts`:** Direct integration with Google GenAI SDK. Sets up deterministic fallbacks if Gemini API keys are invalid.
* **`lib/supabase.ts`:** Lazy singleton client Proxy. Returns safety checkers (`isSupabaseConfigured()`) instead of throwing server-side errors on launch.
* **`lib/bomService.ts` / `lib/inventoryService.ts`:** Performs inventory checks, material reservations, and deductions. Gracefully supports database-free mock operations.

---

## 13. AI Integration

The Gemini AI acts as an advisor, narrator, and risk analyst. Core scheduling decisions are computed mathematically and deterministically by the scheduling library to guarantee system safety.

1. **Schedule Explanation:** Summarises how the scheduler allocated quantities and what safety buffers look like in 2-3 concise sentences.
2. **SLA Risk Analysis:** Identifies anomalies in machine queues and provides actions (e.g. "Preempt medium jobs on M2") to avoid SLA breaches.
3. **Simulation Failure/Breakdown Alert:** Explains to supervisors why a breakdown occurred and where quantities were reassigned.
4. **Planned Job Optimisation:** Scans delayed or at-risk jobs on the Planned Jobs page to recommend speed-optimizing machine reallocations.

---

## 14. Bugs Fixed & Why

* **Next.js Workspace Root Misidentification:** Stray lockfiles in parent folders caused Next.js dev server to load environment variables from the wrong directory. Fixed by removing parent-level lockfiles.
* **Browser Extension Hydration Mismatch:** Custom browser extensions (e.g. Bilibili) dynamically injected properties onto layout tags. Fixed by configuring `suppressHydrationWarning` on root components.
* **Supabase Disconnection Crash:** Missing Supabase API credentials caused server-side crashes in raw material routes, BOM lookups, and inventory checks. Fixed by wrapping database queries in `isSupabaseConfigured()` calls to activate mock fallback datasets.
* **Startup Machine "Busy" Glitch:** Machines loaded as "busy" from Supabase but having empty active queues at startup stayed busy until the first simulation tick or reset. Fixed by auto-sanitizing machine statuses during initialization.
* **Static 0% Machine Utilisation:** Machine card percentages stayed static at 0% during order execution. Fixed by calculating dynamic, tick-based progress percentages.
* **Risk Analysis NaN Scores:** An invalid overall finish date (e.g. `invalid-date`) caused mathematical calculations to yield `NaN` risk scores. Fixed by checking for `isNaN` values and defaulting safely.

---

## 15. Known Incomplete Features

| Feature                      | Location          | Status                                                  |
| ---------------------------- | ----------------- | ------------------------------------------------------- |
| "Assign to" button           | `PlannedJobsPage` | UI only, no handler                                     |
| Filter icon button           | `PlannedJobsPage` | UI only, no handler                                     |
| Layout toggle (grid view)    | `PlannedJobsPage` | UI only, always list view                               |
| "Today" date picker          | `PlannedJobsPage` | UI only, no handler                                     |
| Bulk action on selected jobs | `PlannedJobsPage` | Checkboxes work, no bulk operation                      |
| Operator filter              | `PlannedJobsPage` | Sends to API but API ignores it (no operator column)    |
| Role-based auth              | Sidebar           | All pages visible to all users — no login/auth yet      |

---

## 16. Running the Project

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Run TypeScript edge-case test suites
npm run test:edge
```

---

## 17. Deployment

The project is pre-configured for Vercel:
1. Connect repository on [vercel.com](https://vercel.com).
2. Configure Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `GEMINI_API_KEY`.
3. Deploy! Vercel automatically runs Next.js builds on pushes to the main branch.


## required modules to be corrected
    - admin