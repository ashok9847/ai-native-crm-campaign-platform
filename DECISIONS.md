# Nudge Architectural Decisions Log (DECISIONS.md)

This document outlines the key architectural decisions, rationale, and design tradeoffs made during the development of Nudge (AI-Native Marketing CRM).

---

## 1. Chat-First Campaign Creation
### Context
Traditional marketing CRMs require marketers to build complex logic flows, query builders, and manually draft multiple templates for different channels.
### Decision
Implement a natural language prompt interface ("Chat-First") where a marketer describes their intent in plain English, and the system automatically infers:
1. The appropriate customer target segment.
2. The core message copy personalized per customer.
### Rationale
- **Friction Reduction**: By allowing a marketer to express intent naturally (e.g., "re-engage users who bought light roast coffee"), we bypass complex query builders.
- **AI-Native Differentiation**: Moving the AI from a side-helper ("write a copy snippet") to the orchestrator of the entire lifecycle.

---

## 2. Split Microservice Architecture (CRM vs. Channel Service)
### Context
Sending outreach messages involves interacting with external delivery networks (SMS gateways, WhatsApp business API, SMTP relays) which introduce significant network latency, rate limits, and failure modes.
### Decision
Decouple the core CRM from delivery by placing delivery logic in a separate, stubbed microservice (`channel-service/`) that communicates with the core CRM exclusively via asynchronous HTTP callbacks.
### Rationale
- **Performance Isolation**: The main CRM remains fast and responsive. Heavy or slow network retries to delivery channels do not block CRM backend workers or request threads.
- **Realistic Simulation**: The channel service acts as a realistic mock gateway, simulating network drops, retry mechanisms, and customer behavior (open, read, click, purchase events) via random drop-offs.
- **Loose Coupling**: Conforms to standard enterprise architecture where marketing orchestrators (CRMs) do not directly host SMTP sockets or SMS gateway protocol drivers.

---

## 3. Server-Sent Events (SSE) over WebSockets
### Context
During campaign execution, the frontend must display live delivery status changes (sent, delivered, opened, read, clicked, purchased) in real-time as callbacks arrive.
### Decision
Use Server-Sent Events (SSE) via FastAPI's `StreamingResponse` rather than two-way WebSockets.
### Rationale
- **Unidirectional Needs**: The execution tracker is strictly read-only for the frontend; the frontend does not need to send message events back to the server over the same socket. SSE is simpler to scale and deploy than stateful bidirectional WebSockets.
- **HTTP/2 & Proxy Compatibility**: SSE operates over standard HTTP/1.1 or HTTP/2, making it highly compatible with reverse proxies, API gateways, and corporate firewalls without special WebSocket configuration.
- **Auto-Reconnect**: Browsers natively support automatic reconnection and event mapping via the `EventSource` API, simplifying client-side connection recovery.

---

## 4. What Was Skipped / Time Constraints
Due to the time constraints of this engineering assignment, the following scope items were skipped or stubbed:
1. **Real Delivery Integration**: No real SMTP or SMS connections are established. The channel service simulates all network dispatches.
2. **User Authentication MFA**: Basic token-based JWT authentication is used; multifactor authentication and session revocation tables are skipped.
3. **Advanced Segment Analytics**: Simple open/click rates and order attribution are tracked, but complex historical cohort comparisons or multi-touch attribution models are not built.
4. **Rich Email Template Builder**: We focus on personalized plain-text/marketing-copy messaging rather than drag-and-drop HTML visual editors (Principle V).

---

## 5. Architectural Changes at Production Scale
To run this architecture at production scale, we would recommend the following changes:
- **Message Broker (Celery / RabbitMQ / Kafka)**: Instead of FastAPI background tasks (which run in-process and can lose state if a container restarts), use an external task queue for dispatching and processing callback events.
- **Database Connection Pooler (PgBouncer/Supabase Supavisor)**: RLS requires setting session variables (`set_config`). In production transaction pooling mode, session state is not preserved across queries. We solved this with SQLAlchemy sync listeners on begin (`set_tenant_on_begin`), but at scale, a secure serverless JWT token mapping or custom Postgres function claims check (e.g. `auth.uid()`) is preferred.
- **Read Replicas**: Separate reporting/campaign results queries from transactional writes.
- **Attribution Window Caching**: Caching customer clicks and order events in Redis to calculate real-time attribution indicators without running expensive PostgreSQL joins repeatedly.
