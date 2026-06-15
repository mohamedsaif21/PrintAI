# PrintAI - Production Planning with AI

**PrintAI** is an AI-powered production scheduling system for printing factories. It intelligently schedules print orders across multiple machines using machine learning and provides real-time SLA compliance tracking with automatic failure recovery.

## 🎯 Features

- **AI-Powered Scheduling**: Uses Google Gemini AI to explain scheduling decisions
- **Multi-Machine Allocation**: Proportional workload distribution based on machine speed and capacity
- **Paper Type Matching**: Intelligent filtering of machines by supported paper types
- **SLA Compliance**: Real-time deadline tracking with risk alerts
- **Failure Recovery**: Automatic rescheduling when machines break down
- **Real-time Dashboard**: Live metrics on orders, machines, and SLA status
- **Dark Mode Support**: Optimized UI for day and night work
- **Supabase Backend**: Persistent data storage with real-time synchronization

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier available)
- Google Gemini API key

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/mohamedsaif21/PrintAI.git
   cd PrintAI
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

4. **Configure your `.env.local`**

   **Supabase Setup:**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `Anon Key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Run the SQL schema below

   **Gemini API Setup:**
   - Go to [ai.google.dev](https://ai.google.dev)
   - Create an API key
   - Set `GEMINI_API_KEY` in `.env.local`

5. **Set up Supabase Database**

   Run this SQL in your Supabase SQL Editor (`Project → SQL Editor → New Query`):

   ```sql
   -- Orders table
   create table if not exists orders (
     id           text primary key,
     customer     text not null,
     product      text not null,
     quantity     integer not null,
     paper_type   text not null,
     priority     text not null,
     deadline     timestamptz not null,
     status       text not null default 'Pending',
     created_at   timestamptz not null default now()
   );

   -- Machines table
   create table if not exists machines (
     id           text primary key,
     speed        integer not null,
     capacity     integer not null,
     status       text not null default 'available',
     paper_types  text[] not null default '{}',
     utilisation  integer not null default 0
   );

   -- Schedules table
   create table if not exists schedules (
     id           uuid primary key default gen_random_uuid(),
     order_id     text references orders(id) on delete cascade,
     tasks        jsonb not null,
     overall_finish timestamptz not null,
     sla_status   text not null,
     sla_diff     integer not null,
     explanation  text,
     created_at   timestamptz not null default now()
   );

   -- Seed machines
   insert into machines (id, speed, capacity, status, paper_types, utilisation) values
     ('M1', 500, 10000, 'available', array['Coated','Glossy','Matte','Uncoated'], 0),
     ('M2', 400,  8000, 'busy',      array['Coated','Uncoated'],                   100),
     ('M3', 600, 12000, 'available', array['Coated','Glossy','Matte','Uncoated'], 0),
     ('M4', 450,  9000, 'available', array['Coated','Matte','Uncoated'],           0),
     ('M5', 300,  6000, 'backup',    array['Coated','Uncoated'],                   0)
   on conflict (id) do nothing;
   ```

6. **Run the development server**

   ```bash
   npm run dev
   ```

7. **Open [http://localhost:3000](http://localhost:3000) in your browser**

## 🔐 Security Setup

### Row Level Security (RLS) - Production Recommended

Enable RLS on all tables for data isolation:

```sql
alter table orders enable row level security;
alter table schedules enable row level security;
alter table machines enable row level security;
```

### Error Monitoring (Optional)

Integrated logger in `lib/logger.ts` ready for Sentry integration:

```typescript
import { logError, logWarn, logInfo } from "@/lib/logger";

logError(error, { userId: "user123" });
```

## 📊 API Endpoints

- `POST /api/schedule` - Create order with validation
- `GET /api/orders` - Fetch orders
- `PATCH /api/orders` - Update order status
- `GET /api/machines` - Fetch machines
- `PATCH /api/machines` - Update machine status

## 🏗️ Architecture

- `app/api/` - Validated API routes with error handling
- `components/` - React components with ErrorBoundary
- `lib/` - Business logic (scheduler, AI, validation, logging)
- `types/` - TypeScript type definitions

## 🧪 Testing

```bash
npm run lint
npm run build
npm start
```

## 📝 Environment Variables

See `.env.example` for all required variables.

## 🚀 Deployment

Deploy on Vercel with automatic environment variable configuration.

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Gemini API](https://ai.google.dev)
- [Tailwind CSS](https://tailwindcss.com)
