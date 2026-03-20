# ThreatLens 👁️

> Advanced SOC Threat Intelligence Platform

ThreatLens is a premium, full-stack security operations center (SOC) application for tracking, visualizing, and correlating Indicators of Compromise (IOCs) traversing the global threat landscape. It aggregates intelligence from AlienVault OTX, URLhaus, and AbuseIPDB, rendering powerful relationship graphs and scoring matrices inside a sleek dark-themed workspace tailored specifically for SOC analysts.

---

![Dashboard Preview Placeholder](/docs/dashboard-preview.png)
*(Screenshot Placeholder)*

## Features ✨

* **Multi-Source Ingestion Engine**: Background Celery and Async schedulers fetching intelligence every hour across 3 independent adaptors.
* **Weighted Confidence Scoring**: Dynamic evaluation merging base feed ratings with recency and multiplex source confirmations.
* **Analyst Workspace**: Personal workspace isolation allowing private custom tags, editable notebooks, and global Watchlists per analyst.
* **Interactive DAG Visualization**: Interactive topology maps generated through React Flow & Dagre computing relationships up to 3 hops deep natively in the browser.
* **Data Exports**: Instantaneous sanitized JSON and CSV blob generation of intel datasets.

---

## Tech Stack 🚀

**Frontend**:
- UI Library: React 18 / Next.js 14 (App Router)
- Language: TypeScript
- Data Visualization: `@xyflow/react` (React Flow), Dagre, Recharts
- Styling: Tailwind CSS, `shadcn/ui`, `lucide-react`
- Authentication: Supabase Auth SSR

**Backend**:
- API Framework: FastAPI (Python 3.12)
- Engine: PostgreSQL / SQLAlchemy (Async ORM) / Alembic
- Automation: APScheduler
- Security: Supabase JWT validation, IDOR protection logic

---

## Setup & Local Deployment 🛠️

### Prerequisites
- Python 3.10+
- Node.js 18+ / `bun` package manager
- PostgreSQL Database
- Supabase Project (for Authentication)

### 1. Backend Initialization

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and source a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Define your environment parameters in `backend/.env`:
   ```env
   DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/threatlens"
   SUPABASE_URL="https://your-project.supabase.co"
   SUPABASE_JWT_SECRET="your-jwt-secret"
   ```
5. Apply database migrations:
   ```bash
   alembic upgrade head
   ```
6. Run the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload
   ```

### 2. Frontend Initialization

1. Navigate to the `frontend/` directory (open a new terminal tab):
   ```bash
   cd frontend
   ```
2. Install Node dependencies (using bun for extreme speed, or npm):
   ```bash
   bun install
   ```
3. Define your environment parameters in `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
   ```
4. Run the Next.js development server:
   ```bash
   bun run dev
   ```

**The ThreatLens UI is now actively running on `http://localhost:3000`.** Any API calls fetching payload shapes not hitting `/auth` are seamlessly proxied through `next.config.mjs` resolving strictly to `http://127.0.0.1:8000`.

---

*Phase 6 Completed - Security Core 2026*
