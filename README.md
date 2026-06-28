# Nudge — AI Campaign Copilot 🚀

> An AI-native mini CRM that turns plain-English marketing intent into segmented,
> personalised campaigns — dispatched and tracked in real time.

---

## Table Of Contents

- [What Is Nudge](#what-is-nudge)
- [Feature Groups](#feature-groups)
- [System Architecture](#system-architecture)
- [LLM Architecture](#llm-architecture)
- [Database Schema](#database-schema)
- [Campaign State Machine](#campaign-state-machine)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [Local Setup](#local-setup)
- [Project Structure](#project-structure)
- [Rubric Self-Assessment](#rubric-self-assessment)

---

## What Is Nudge

Nudge is an AI-native campaign CRM built to solve a key product problem: most campaign tools force marketers to think in complex query builders, manual segmentation, templates, and delivery plumbing before they can launch outreach. 

Nudge lets the marketer start with simple natural-language intent:
> *"Re-engage premium customers who have not ordered in 30 days with a personalized coffee discount."*

The platform converts this intent into structured database filters, queries the customer base, drafts highly personalized message copy for each match, enforces a mandatory human review and launch gate, and visualizes delivery funnel performance and ROI attribution in real time.

---

## Feature Groups

| Feature Group | Component & Implementation | Key Logic |
|---|---|---|
| **AI Campaign Loop** | `backend/app/services/ai_service.py` | Intent parsing to JSON criteria -> Message copy generation -> Final results summary |
| **Audience Workspace** | `backend/app/services/audience_service.py` | Preview estimated customer matches & save reusable segment rules |
| **State Machine** | `backend/app/routers/campaigns.py` | Strict forward-only campaign state progression; inline edits during review |
| **Delivery Simulation** | `channel-service/app/services/` | Asynchronous sent -> delivered -> opened -> clicked -> purchased callback loop |
| **Operations & DLQ** | `channel-service/app/services/retry_service.py` | 3 callback retry attempts with backoff (5s/15s/45s); Dead-Letter Queue logging |
| **Attribution & Reports** | `backend/app/services/analytics_service.py` | Direct conversion-to-communication linking; Attributed vs. Organic KPI reporting |
| **Security & Auditing** | `backend/app/core/database.py` | Strict Row-Level Security (RLS) tenant isolation; credentials log sanitization |
| **Contract Safety** | `backend/scripts/check_contracts.py` | JSON Schema export vs. Frontend TypeScript comparison script |

---

## System Architecture

Nudge uses a Next.js App Router frontend, a FastAPI backend, and an independent FastAPI channel simulator microservice.

![System Architecture Diagram](system_architecture%20%281%29.png)


## LLM Architecture

Nudge implements a **Dual-AI Layer Architecture** utilizing Google Gemini / Nebius (Kimi) as primary models and supporting a secondary GitHub Models backup failover.

![AI Agent Architecture Diagram](agent_architecture%20%282%29.png)

### 1. The Core Campaign Pipeline (Deterministic Rules)
1. **Intent Parsing (`extract_segment_filters`)**: Extracts structured customer rules (e.g., city, spending threshold, last order date) as a JSON array using temperature `0.0` to prevent database syntax errors.
2. **Message Copy Generation (`generate_messages`)**: Generates customized promotions for customer batches under temperature `0.7` to maintain creative variety while matching customer metadata fields.
3. **Summary Analysis (`summarize_campaign`)**: Computes a precise 2-sentence campaign summary using actual delivery stats (temperature `0.5`).

### 2. Conversational NudgeAI Widget (Floating Agent)
A globally available, localStorage-persistent floating chat widget. It uses tool calling to compare campaigns, fetch analytical tables, build charts, predict campaign outcome rates based on historical tenant averages, and trigger redirects to the campaign builder. The assistant operates fully within the active tenant's context, maintaining strict data isolation.

---

## Database Schema

Nudge uses a PostgreSQL schema hosted on Supabase alongside an operational SQLite database in the channel service. Row-Level Security (RLS) is applied on all core tables to enforce tenant isolation.

### Core Models (PostgreSQL):
- **`tenants`**: Represents the workspace boundary.
- **`users`**: Tenant administrative users (credentials checked via JWT).
- **`customers`**: The customer directory containing name, email, roast preferences, lifetime value, and custom metadata.
- **`crm_fields`**: Stores dynamically inferred CSV schemas for custom field filters.
- **`campaigns`**: Tracks name, intent, state, scheduled time, channel, and final AI summaries.
- **`audiences`**: Reusable customer filters, estimated match counts, and usage stats.
- **`segments`**: Historical JSON criteria snapshots mapping customers targeted in a campaign.
- **`campaign_messages`**: Personalized message copy generated for customers, supporting human edits.
- **`delivery_events`**: Funnel metrics tracking delivery events (sent, delivered, opened, clicked, purchased) with unique `event_id` keys to ensure idempotency.
- **`orders`**: Tracks purchases. Campaign orders explicitly link `campaign_id` and `communication_id` for revenue attribution.
- **`campaign_stats`**: Atomic denormalized reporting statistics for campaigns.

### Channel Models (SQLite):
- **`callback_retries`**: Queue storing event payloads, current retry count, and error strings.
- **`dead_letter_callbacks`**: Archive storing permanently failed callbacks for operator diagnostics.

---

## Campaign State Machine

Campaigns advance strictly through the following sequence:

```text
DRAFT → SEGMENTING → GENERATING → REVIEWING → EXECUTING → COMPLETE
                                       │              │
                                       ▼              ▼
                                   CANCELLED      STALLED / CANCELLED
```

### Transition Operations:
- **DRAFT**: Created via the UI or pre-filled by the AI Assistant chat.
- **SEGMENTING / GENERATING**: Triggered synchronously; queries segment counts and drafts personalized copies.
- **REVIEWING**: Enforces the mandatory human review gate. Marketers can edit message copies, campaign names, channels, or targeted audiences. Updates to filters regenerate segments and copy while keeping the campaign in the `REVIEWING` state.
- **EXECUTING**: Triggered by the marketer clicking "Launch". Backend submits messages to the channel service.
- **COMPLETE / CANCELLED**: Campaign concludes once all delivery events settle or when manual cancellation is requested. A background service marks executing campaigns stalled for >300s.

---

## API Reference

### 1. Authentication & Tenant Workspace
- `POST /auth/register` - Create tenant workspace and credentials
- `POST /auth/token` - OAuth2 password authentication (returns JWT)
- `GET /auth/me` - Retrieve current user/tenant context
- `POST /api/v1/tenants/seed-mock` - Seed mock customers and orders

### 2. Customer Directory
- `POST /api/v1/customers/seed` - Seed 42 BrewMate customers idempotently
- `POST /api/v1/customers/import` - Bulk CSV customer import
- `POST /api/v1/customers/upload` - CSV schema parser for custom fields
- `GET /api/v1/customers` - Paginated customer lookup
- `GET /api/v1/customers/{id}/profile` - Customer details, order log, and churn health alerts

### 3. Campaign & Message Management
- `POST /api/v1/campaigns` - Compile campaign synchronously
- `GET /api/v1/campaigns` - List tenant campaigns
- `GET /api/v1/campaigns/{id}` - Get segment criteria and message logs
- `PATCH /api/v1/campaigns/{id}` - Modify campaign parameters during review
- `PATCH /api/v1/campaigns/{id}/messages/{mid}` - Edit generated message copy
- `POST /api/v1/campaigns/{id}/launch` - Human launch execution gate
- `GET /api/v1/campaigns/{id}/stream` - Server-Sent Events (SSE) live campaign progress tracker
- `GET /api/v1/campaigns/{id}/results` - Visual campaign analytics and AI performance summaries

### 4. Audience Workspace & AI Assistant
- `GET /api/v1/audiences` - List saved reusable audiences
- `POST /api/v1/audiences` - Save filter criteria as a reusable audience
- `POST /api/v1/audiences/preview` - Preview match count and customer sample list
- `POST /api/v1/ai/chat` - Floating NudgeAI widget conversation endpoint

### 5. Delivery & Channel Operations
- `POST /api/v1/campaigns/callback` - Callback event webhook (X-Channel-Secret verified)
- `GET /api/v1/delivery/dead-letter` - Proxied endpoint to view permanently failed callbacks
- `POST /api/v1/dispatch` - Channel service endpoint to queue simulator callbacks

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| **Backend API** | FastAPI (Python 3.12, async), Pydantic, Uvicorn |
| **Database & ORM** | PostgreSQL (Supabase) direct via asyncpg, SQLAlchemy (async), Alembic |
| **Channel DB** | SQLite (operational queue in channel-service) |
| **AI Integration** | Google Gemini / Nebius API (Kimi k2.5) |

---

## Local Setup

### 1 — Clone & Install Dependencies
```bash
git clone https://github.com/ashok9847/nudge.git
cd nudge

# Install backend dependencies
cd backend && uv sync

# Install channel service dependencies
cd ../channel-service && uv sync

# Install frontend UI dependencies
cd ../frontend && npm install
```

### 2 — Configure Environment Variables
Create `.env` files in the respective app directories:

**Backend (`backend/.env`)**:
```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/nudge
NEBIUS_API_KEY=your-api-key
NEBIUS_BASE_URL=https://api.tokenfactory.us-central1.nebius.com/v1/
KIMI_MODEL=openai/gpt-oss-120b-fast
CHANNEL_SERVICE_URL=http://localhost:8001
CHANNEL_WEBHOOK_SECRET=dev-secret-key-matching-channel-service
BACKEND_URL=http://localhost:8000
SECRET_KEY=secure-token-signing-key
ALGORITHM=HS256
```

**Channel Service (`channel-service/.env`)**:
```env
CHANNEL_WEBHOOK_SECRET=dev-secret-key-matching-backend
CALLBACK_MIN_DELAY_MS=1000
CALLBACK_MAX_DELAY_MS=5000
DELIVERY_RATE=0.95
OPEN_RATE=0.60
CLICK_RATE=0.30
FAILURE_RATE=0.10
```

**Frontend (`frontend/.env.local`)**:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3 — Run Migrations & Start Services
```bash
# Run database migrations
cd backend && uv run alembic upgrade head

# Start Backend (Terminal 1)
uv run uvicorn app.main:app --reload --port 8000

# Start Channel Service (Terminal 2)
cd channel-service && uv run uvicorn app.main:app --reload --port 8001

# Start Frontend App (Terminal 3)
cd frontend && npm run dev
```

Navigate to **http://localhost:3000** to access the app. Create a tenant workspace via `/register`, then seed customer data via `/setup` or by running the BrewMate customer seed command:
```bash
curl -X POST http://localhost:8000/api/v1/customers/seed -H "Authorization: Bearer <JWT_TOKEN>"
```

---

## Project Structure

```text
nudge/
├── backend/                  # FastAPI Backend API
│   ├── app/
│   │   ├── core/             # Configuration, DB connection, RLS policies, logging sanitizer
│   │   ├── models/           # SQLAlchemy ORM models (Campaign, Customer, Audience, Order)
│   │   ├── routers/          # API Route Controllers (Campaigns, Audiences, AI Chat)
│   │   ├── schemas/          # Pydantic Schemas (Request/Response validation)
│   │   └── services/         # Business logic (AI Chat, Audience, Campaign, Segment)
│   └── migrations/           # Alembic Database Migration scripts
│
├── channel-service/          # Delivery Channel Simulator
│   ├── app/
│   │   ├── core/             # Configuration & SQLite connection
│   │   ├── models/           # SQLite ORM models (Retry, Dead-Letter)
│   │   ├── routers/          # Callback Dispatch Controller
│   │   └── services/         # Background Retry execution worker
│
├── frontend/                 # Next.js 16 Web Frontend
│   ├── app/                  # App Router Workspace Pages (/audiences, /agent)
│   ├── components/           # UI Components (campaign cards, drawer widgets, chart utilities)
│   └── lib/                  # Backend API Client (fetch wrappers, types)
│
└── specs/                    # Specification & System Design documents
```

---

## Rubric Self-Assessment

| Criterion | Nudge Implementation Details |
|---|---|
| **Data Ingestion** | CSV customer/order bulk import, mock/BrewMate tenant seed endpoints, dynamic CRM field mapping. |
| **Campaign Segmentation** | AI intent-to-filter criteria compilation, saved audience previews, JSONB segment criteria snapshots. |
| **AI Message Generation** | Per-customer personalized message generation via Nebius/Gemini primary model. |
| **Human Review Gate** | REVIEWING state, inline message body edits, campaign parameter modifications, launch gate execution. |
| **Omnichannel Dispatch** | Asynchronous message dispatch, simulated delivery callbacks (sent -> delivered -> opened -> read -> clicked -> purchased). |
| **Receipt Idempotency** | Event deduplication using PostgreSQL unique indexes on `event_id` via `ON CONFLICT DO NOTHING`. |
| **Analytical Reporting** | Full campaign KPI statistics, AI-generated performance summary, Recharts visualizations. |
| **Revenue Attribution** | Conversions map `campaign_id` and `communication_id` to orders, separating organic and campaign revenues. |
| **Audience Workspace** | `/audiences` workspace page supporting filter previews and reusable audience definitions. |
| **AI Assistant Chat** | Global floating chat agent widget with campaign comparison tool calling and chart rendering. |
| **Scalability & Resiliency** | SQLite-backed async callback retry queue with exponential backoffs and Dead-Letter Queue (DLQ). |
| **Security & Auditing** | Strict PostgreSQL Row-Level Security (RLS), JWT tokens, and credentials-redacting logging sanitizer. |