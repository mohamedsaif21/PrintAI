# PrintAI — AI-Powered Production Planning

<p align="center">
  <img src="printai attest.png" alt="PrintAI Production Planning Dashboard" width="100%">
</p>

<p align="center">
  <strong>AI-powered production scheduling and planning for printing factories.</strong>
</p>

<p align="center">
  Next.js • TypeScript • Supabase • Google Gemini AI • Tailwind CSS
</p>

<p align="center">

<a href="YOUR_LIVE_APPLICATION_URL">
  <img src="https://img.shields.io/badge/🌐%20Live%20Application-Open%20PrintAI-blue?style=for-the-badge" alt="Live Application" />
</a>

---

# 📌 About PrintAI

**PrintAI** is an AI-powered production planning and scheduling application designed for printing factories.

In a printing environment, multiple orders need to be assigned to different machines while considering factors such as:

* Machine availability
* Machine speed
* Production capacity
* Paper type
* Order priority
* Production workload
* Delivery deadlines
* SLA requirements
* Machine failures

Managing these factors manually can be difficult and time-consuming.

PrintAI helps automate this process by intelligently planning production schedules, monitoring SLA compliance, and providing recommendations when production risks occur.

---

# 🎯 Project Objective

The main goal of PrintAI is to make production planning more **automated, intelligent, and easier to monitor**.

The system helps production teams:

* Plan print orders
* Allocate orders across machines
* Match machines with paper types
* Track production deadlines
* Monitor SLA compliance
* Identify production risks
* Recover from machine failures
* Optimize planned production jobs

---

# ✨ Key Features

## 🤖 AI-Powered Scheduling

PrintAI uses **Google Gemini AI** to provide intelligent scheduling explanations and recommendations.

The system can explain why a particular machine or scheduling decision was selected.

---

## 🏭 Multi-Machine Allocation

Production orders can be distributed across multiple machines based on:

* Machine speed
* Machine capacity
* Current workload
* Machine availability
* Paper compatibility

This helps distribute production more efficiently.

---

## 📋 Smart Queue Management

The system considers existing machine schedules before assigning new work.

This helps prevent:

* Overlapping jobs
* Conflicting schedules
* Unrealistic machine assignments

---

## 📄 Paper Type Matching

Machines are filtered according to the paper types they support.

For example:

```text
Order
Paper Type: Coated

        ↓

Available Compatible Machines

M1 → Coated ✓
M2 → Glossy ✕
M3 → Matte ✕
M4 → Uncoated ✕
M5 → Coated ✓
```

This helps ensure that jobs are assigned only to suitable machines.

---

## ⏱️ SLA Compliance

PrintAI continuously evaluates production schedules against order deadlines.

The dashboard can identify:

* On-time jobs
* At-risk jobs
* Delayed jobs
* SLA differences

This helps production teams identify potential delivery problems earlier.

---

## 🔄 Failure Recovery

If a machine becomes unavailable or breaks down, PrintAI can reassess the affected production schedule and recommend alternative machine assignments.

This reduces the impact of unexpected machine failures.

---

## 📊 Real-Time Dashboard

The dashboard provides a centralized view of production activity.

It can display:

* Total orders
* Machine status
* Production workload
* SLA status
* Planned jobs
* At-risk production
* Machine utilization

---

## 🗓️ Planned Jobs

A dedicated **Planned Jobs** module provides a structured view of production plans.

Jobs can be tracked across different production stages:

```text
Pre-Press
    ↓
Press
    ↓
Post-Press
```

This gives production teams better visibility into the current stage of each job.

---

## ⚡ Bulk AI Optimization

At-risk production jobs can be reassessed using AI.

The optimization process can:

1. Identify jobs at risk
2. Analyze available machines
3. Evaluate production constraints
4. Suggest alternative assignments
5. Provide an AI-generated recommendation

---

## 🌙 Dark Mode

The application supports both:

* Light Mode
* Dark Mode

This makes the dashboard suitable for different working environments.

---

# 🔄 How PrintAI Works

The overall workflow can be represented as:

```text
Production Order
       ↓
Order Validation
       ↓
Check Machine Availability
       ↓
Match Paper Type
       ↓
Evaluate Machine Capacity
       ↓
Calculate Production Schedule
       ↓
Check SLA Deadline
       ↓
Generate Schedule
       ↓
Monitor Production
       ↓
Detect Risk / Failure
       ↓
AI Optimization & Recovery
```

---

# 🧠 AI Integration

Google Gemini AI is integrated into the application to support intelligent production planning.

AI is used for:

* Scheduling explanations
* Production recommendations
* At-risk job reassessment
* Machine reassignment suggestions
* Production optimization

The AI layer works alongside the application's scheduling and business logic rather than replacing the underlying production constraints.

---

# 🏗️ Application Architecture

```text
                         ┌───────────────┐
                         │     User      │
                         └───────┬───────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │  PrintAI Dashboard│
                       └─────────┬────────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │   API Layer      │
                       └─────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
            ┌───────────────┐        ┌────────────────┐
            │ Scheduling    │        │ Google Gemini  │
            │ Engine        │        │ AI             │
            └───────┬───────┘        └───────┬────────┘
                    │                         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │     Supabase     │
                       │    Database      │
                       └──────────────────┘
```

---

# 🛠️ Technology Stack

| Technology           | Purpose                                     |
| -------------------- | ------------------------------------------- |
| **Next.js**          | Full-stack web application framework        |
| **React**            | User interface development                  |
| **TypeScript**       | Type-safe application development           |
| **Tailwind CSS**     | Responsive UI styling                       |
| **Supabase**         | Database and real-time data synchronization |
| **Google Gemini AI** | AI-powered recommendations and explanations |
| **Vercel**           | Application deployment                      |
| **Git & GitHub**     | Version control                             |

---

# 📂 Project Structure

```text
PrintAI/
│
├── app/
│   ├── api/
│   │   ├── schedule/
│   │   ├── orders/
│   │   ├── machines/
│   │   └── planned-jobs/
│   │
│   └── ...                     # Application pages
│
├── components/
│   └── ...                     # Reusable React components
│
├── lib/
│   ├── scheduler/              # Scheduling logic
│   ├── ai/                     # AI integration
│   ├── validation/             # Validation logic
│   └── logger.ts               # Application logging
│
├── types/
│   └── ...                     # TypeScript definitions
│
├── docs/
│   ├── dashboard.png           # Dashboard screenshot
│   └── internship-certificate.pdf
│
├── .env.example
├── package.json
├── next.config.*
├── tailwind.config.*
└── README.md
```

---

# 📊 Main Application Modules

### Orders

Manage and monitor production orders including:

* Customer
* Product
* Quantity
* Paper type
* Priority
* Deadline
* Status

### Machines

Monitor machine information such as:

* Machine speed
* Capacity
* Availability
* Supported paper types
* Utilization

### Scheduling

Create production schedules while considering:

* Machine availability
* Existing schedules
* Paper compatibility
* Production capacity
* SLA deadlines

### Planned Jobs

Track production jobs across:

* Pre-Press
* Press
* Post-Press

### AI Optimization

Analyze at-risk jobs and provide machine reassignment recommendations.

---

# 🔌 API Endpoints

| Method  | Endpoint                     | Purpose                          |
| ------- | ---------------------------- | -------------------------------- |
| `POST`  | `/api/schedule`              | Create and schedule an order     |
| `GET`   | `/api/orders`                | Retrieve orders                  |
| `PATCH` | `/api/orders`                | Update order status              |
| `GET`   | `/api/machines`              | Retrieve machine information     |
| `PATCH` | `/api/machines`              | Update machine status            |
| `GET`   | `/api/planned-jobs`          | Retrieve planned jobs            |
| `PATCH` | `/api/planned-jobs`          | Update planned job details       |
| `POST`  | `/api/planned-jobs/optimise` | AI optimization for at-risk jobs |

---

# 🗄️ Database

PrintAI uses **Supabase** for persistent application data and real-time synchronization.

The main database entities include:

```text
Orders
   │
   ├── Schedules
   │
   └── Planned Jobs

Machines
   │
   └── Machine Availability
```

### Main Tables

* `orders`
* `machines`
* `schedules`
* `planned_jobs`

---

# 🔐 Security

Production deployments should use appropriate security controls, including:

* Supabase Row Level Security (RLS)
* Environment variables for API keys
* Secure authentication
* Protected database access
* Secure deployment secrets

Sensitive credentials should never be committed to the repository.

---

# 🚀 Getting Started

## Prerequisites

Make sure you have:

* Node.js 18+
* npm or Yarn
* A Supabase account
* A Google Gemini API key

---

## 1. Clone the Repository

```bash
git clone https://github.com/mohamedsaif21/PrintAI.git
cd PrintAI
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment Variables

Create a local environment file:

```bash
cp .env.example .env.local
```

Configure the required values:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_gemini_api_key
```

---

## 4. Configure Supabase

Create a Supabase project and configure the required database tables.

The application uses Supabase for:

* Data storage
* Database operations
* Real-time synchronization

---

## 5. Start the Development Server

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

---

# 🧪 Testing & Validation

The project can be checked using the following commands:

```bash
npm run lint
```

```bash
npm run build
```

```bash
npm start
```

These commands help verify code quality and production readiness.

---

# ☁️ Deployment

PrintAI can be deployed using **Vercel**.

Basic deployment process:

```text
GitHub Repository
       ↓
Connect to Vercel
       ↓
Configure Environment Variables
       ↓
Build Application
       ↓
Deploy
       ↓
Live PrintAI Application
```

Make sure the required Supabase and Gemini environment variables are configured in the deployment environment.

---

# 📈 Benefits

PrintAI provides several benefits for production planning:

* Reduces manual scheduling effort
* Improves machine utilization
* Prevents scheduling conflicts
* Matches jobs with suitable machines
* Provides early SLA risk visibility
* Supports machine failure recovery
* Centralizes production information
* Enables AI-assisted decision making
* Provides real-time production visibility

---

# 🔮 Future Enhancements

Potential future improvements include:

* Advanced production forecasting
* Predictive machine maintenance
* Historical production analytics
* More advanced AI scheduling
* Production cost optimization
* Machine performance scoring
* Automated notifications
* Email and report generation
* Advanced KPI dashboards
* AI-based demand forecasting

---

# 📜 Internship Certificate

This project was developed as part of my **internship experience**.

The internship certificate is included in this repository as supporting documentation.

### 📄 Internship Certificate

 <img src="Attest letter.jpg" alt="PrintAI Production Planning Dashboard" width="100%">Attest letter.jpg


# 👨‍💻 Author

## Mohamed Saif

**Frontend Developer | AI & Web Development**

Passionate about building modern web applications, AI-powered solutions, automation systems, and practical software products.

---

# ⭐ Project Summary

**PrintAI** brings together production scheduling, machine management, SLA monitoring, and AI-assisted optimization into a single platform.

The project demonstrates how AI and modern web technologies can be applied to solve practical production-planning challenges.

```text
PLAN
  ↓
SCHEDULE
  ↓
MONITOR
  ↓
OPTIMIZE
  ↓
RECOVER
```

> **Smarter Production Planning with AI.**
