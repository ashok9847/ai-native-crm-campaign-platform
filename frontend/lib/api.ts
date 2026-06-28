/**
 * Typed fetch wrappers for all Nudge backend API endpoints.
 * All functions throw on non-2xx responses with a typed ErrorResponse.
 * @see specs/001-chat-campaign-copilot/contracts/
 */

import type {
  CampaignDetailResponse,
  CampaignListItem,
  CampaignResponse,
  CampaignResultsResponse,
  CustomerResponse,
  ErrorResponse,
  ImportResult,
  MessagePreview,
  PaginatedResponse,
  SeedResult,
  UserProfileResponse,
  CRMFieldResponse,
  DashboardStatsResponse,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

/** Extract a human-readable message from any FastAPI error response shape. */
function extractDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const b = body as Record<string, unknown>;
  const detail = b["detail"];
  // Plain string detail (503, 409, 404 etc.)
  if (typeof detail === "string") return detail;
  // Array detail from 422 validation errors
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as Record<string, unknown>;
    return typeof first["msg"] === "string" ? first["msg"] : JSON.stringify(detail);
  }
  return fallback;
}

function getAuthHeader(): Record<string, string> {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("nudge_token");
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 
      "Content-Type": "application/json", 
      ...getAuthHeader(),
      ...init?.headers 
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = extractDetail(
      body,
      response.status === 503
        ? "AI is temporarily unavailable — please retry in a moment."
        : response.status === 409
        ? "A campaign is already running. Wait for it to complete before launching another."
        : response.statusText || "Something went wrong."
    );
    const code: string = (body as Record<string, unknown>)?.["code"] as string ?? "UNKNOWN_ERROR";
    throw Object.assign(new Error(message), { code, status: response.status });
  }

  return response.json() as Promise<T>;
}

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Log in a user and save their JWT token to localStorage.
 */
export async function login(
  email: string,
  password: string
): Promise<{ access_token: string; token_type: string }> {
  const params = new URLSearchParams();
  params.append("username", email);
  params.append("password", password);

  const response = await fetch(`${BASE_URL}/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = extractDetail(body, "Authentication failed. Check your email and password.");
    throw Object.assign(new Error(message), { status: response.status });
  }

  const result = await response.json();
  if (typeof window !== "undefined") {
    localStorage.setItem("nudge_token", result.access_token);
  }
  return result;
}

/**
 * Register a new tenant workspace and admin user.
 */
export async function register(
  tenantName: string,
  email: string,
  password: string
): Promise<{ access_token: string; token_type: string }> {
  const response = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tenant_name: tenantName,
      email,
      password,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = extractDetail(body, "Registration failed. Please check details and try again.");
    throw Object.assign(new Error(message), { status: response.status });
  }

  const result = await response.json();
  if (typeof window !== "undefined") {
    localStorage.setItem("nudge_token", result.access_token);
  }
  return result;
}

/**
 * Remove JWT token from localStorage.
 */
export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("nudge_token");
  }
}

/**
 * Check if the user is authenticated (token present in localStorage).
 */
export function isAuthenticated(): boolean {
  if (typeof window !== "undefined") {
    return !!localStorage.getItem("nudge_token");
  }
  return false;
}

/**
 * Fetch current logged-in user profile details and active workspace name.
 */
export async function getProfile(): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>("/auth/me");
}

// ── Customers ─────────────────────────────────────────────────────────────────

/**
 * Pre-load 42 realistic BrewMate customer records.
 * Idempotent — safe to call multiple times.
 */
export async function seedCustomers(): Promise<SeedResult> {
  return apiFetch<SeedResult>("/api/v1/customers/seed", { method: "POST" });
}

/**
 * Bulk-import customers from a CSV file.
 * Returns per-row validation results.
 */
export async function importCustomers(file: File): Promise<ImportResult> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE_URL}/api/v1/customers/import`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body,
    // Do NOT set Content-Type — browser sets multipart boundary automatically
  });
  if (!response.ok) {
    const error: ErrorResponse = await response.json().catch(() => ({
      detail: response.statusText,
      code: "UNKNOWN_ERROR",
    }));
    throw Object.assign(new Error(error.detail), { code: error.code, status: response.status });
  }
  return response.json() as Promise<ImportResult>;
}

/**
 * Upload customer CSV, import rows, and infer schemas automatically.
 */
export async function uploadCustomers(file: File): Promise<{
  status: string;
  records_imported: number;
  new_fields_inferred: Array<{
    field_name: string;
    field_type: string;
    description: string;
    allowed_enums: string[];
  }>;
}> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE_URL}/api/v1/customers/upload`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body,
  });
  if (!response.ok) {
    const error: ErrorResponse = await response.json().catch(() => ({
      detail: response.statusText,
      code: "UNKNOWN_ERROR",
    }));
    throw Object.assign(new Error(error.detail), { code: error.code, status: response.status });
  }
  return response.json() as Promise<{
    status: string;
    records_imported: number;
    new_fields_inferred: Array<{
      field_name: string;
      field_type: string;
      description: string;
      allowed_enums: string[];
    }>;
  }>;
}

/**
 * Paginated list of all customers.
 */
export async function listCustomers(
  page = 1,
  pageSize = 20
): Promise<PaginatedResponse<CustomerResponse>> {
  return apiFetch<PaginatedResponse<CustomerResponse>>(
    `/api/v1/customers?page=${page}&page_size=${pageSize}`
  );
}

/**
 * Fetch list of custom CRM fields inferred for the tenant.
 */
export async function listCrmFields(): Promise<CRMFieldResponse[]> {
  return apiFetch<CRMFieldResponse[]>("/api/v1/customers/crm-fields");
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

/**
 * Create a new campaign from a plain-English intent.
 * Kicks off AI segmentation immediately; returns campaign in REVIEWING state.
 *
 * @param customerIds - Optional explicit customer ID list. When provided, AI segmentation
 *   is bypassed and those exact customers are used (follow-up campaigns targeting clickers).
 */
export async function createCampaign(
  intent: string,
  name?: string,
  customerIds?: number[],
  audienceId?: number
): Promise<CampaignDetailResponse> {
  return apiFetch<CampaignDetailResponse>("/api/v1/campaigns", {
    method: "POST",
    body: JSON.stringify({
      intent,
      name,
      customer_ids: customerIds?.length ? customerIds : undefined,
      audience_id: audienceId,
    }),
  });
}

/**
 * Update campaign details and criteria. Only valid while campaign is in REVIEWING state.
 */
export async function updateCampaign(
  id: number,
  body: {
    name?: string;
    channel?: string;
    scheduled_at?: string;
    audience_id?: number | null;
    filter_criteria?: import("./types").FilterCriterion[];
  }
): Promise<CampaignDetailResponse> {
  return apiFetch<CampaignDetailResponse>(`/api/v1/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}


/**
 * Fetch full campaign detail including segment and message previews.
 */
export async function getCampaign(id: number): Promise<CampaignDetailResponse> {
  return apiFetch<CampaignDetailResponse>(`/api/v1/campaigns/${id}`);
}

/**
 * Inline-edit a generated message. Only valid while campaign is in REVIEWING state.
 */
export async function patchMessage(
  campaignId: number,
  messageId: number,
  editedBody: string
): Promise<MessagePreview> {
  return apiFetch<MessagePreview>(
    `/api/v1/campaigns/${campaignId}/messages/${messageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ edited_body: editedBody }),
    }
  );
}

/**
 * Confirm and launch a campaign. Transitions REVIEWING → EXECUTING.
 * This is the mandatory human-confirmation gate.
 */
export async function launchCampaign(id: number): Promise<CampaignResponse> {
  return apiFetch<CampaignResponse>(`/api/v1/campaigns/${id}/launch`, {
    method: "POST",
  });
}

/**
 * Paginated list of all campaigns (history view).
 */
export async function listCampaigns(
  page = 1,
  pageSize = 20
): Promise<PaginatedResponse<CampaignListItem>> {
  return apiFetch<PaginatedResponse<CampaignListItem>>(
    `/api/v1/campaigns?page=${page}&page_size=${pageSize}`
  );
}

/**
 * Full results for a COMPLETE campaign — AI summary, metrics, insight card.
 */
export async function getCampaignResults(
  id: number
): Promise<CampaignResultsResponse> {
  return apiFetch<CampaignResultsResponse>(`/api/v1/campaigns/${id}/results`);
}

/**
 * Cancel a campaign. Transitions REVIEWING or EXECUTING to CANCELLED.
 */
export async function cancelCampaign(id: number): Promise<CampaignResponse> {
  return apiFetch<CampaignResponse>(`/api/v1/campaigns/${id}/cancel`, {
    method: "POST",
  });
}

// ── SSE stream URL helper ─────────────────────────────────────────────────────

/**
 * Returns the SSE stream URL for a campaign's live execution tracker.
 * Pass to EventSource or the useEventSource hook.
 */
export function getCampaignStreamUrl(campaignId: number): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("nudge_token") : "";
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${BASE_URL}/api/v1/campaigns/${campaignId}/stream${query}`;
}

// ── Workspace Seeding & Custom Data Import ────────────────────────────────────

/**
 * Seed the active tenant's workspace with standard mock coffee-shop data.
 */
export async function seedMock(): Promise<{
  seeded: boolean;
  customers_count: number;
  orders_count: number;
  crm_fields_count: number;
}> {
  return apiFetch<{
    seeded: boolean;
    customers_count: number;
    orders_count: number;
    crm_fields_count: number;
  }>("/api/v1/tenants/seed-mock", { method: "POST" });
}

/**
 * Upload custom orders history via CSV.
 */
export async function uploadOrders(file: File): Promise<{
  uploaded: boolean;
  orders_count: number;
  skipped_count: number;
  skipped_emails?: string[];
}> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE_URL}/api/v1/orders/upload`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body,
  });
  if (!response.ok) {
    const error: ErrorResponse = await response.json().catch(() => ({
      detail: response.statusText,
      code: "UNKNOWN_ERROR",
    }));
    throw Object.assign(new Error(error.detail), { code: error.code, status: response.status });
  }
  return response.json() as Promise<{
    uploaded: boolean;
    orders_count: number;
    skipped_count: number;
    skipped_emails?: string[];
  }>;
}

/**
 * Fetch aggregated dashboard statistics for the logged-in tenant.
 */
export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  return apiFetch<DashboardStatsResponse>("/api/v1/tenants/dashboard-stats");
}

// ── Rich Dashboard & Analytics (T018) ─────────────────────────────────────────

/**
 * Fetch the rich dashboard data (KPIs, charts, churn alerts).
 */
export async function getDashboard(): Promise<import("./types").DashboardResponse> {
  return apiFetch<import("./types").DashboardResponse>("/api/v1/dashboard");
}

/**
 * Fetch analytics data (revenue over time, channel perf, funnel, top campaigns).
 */
export async function getAnalytics(days = 30): Promise<import("./types").AnalyticsResponse> {
  return apiFetch<import("./types").AnalyticsResponse>(`/api/v1/analytics?days=${days}`);
}

/**
 * Fetch health score for a specific customer (triggers lazy recompute if stale).
 */
export async function getHealthScore(customerId: number): Promise<import("./types").HealthScoreResponse> {
  return apiFetch<import("./types").HealthScoreResponse>(`/api/v1/health/customer/${customerId}`);
}

/**
 * Fetch churn alerts — customers in at_risk or churning zones.
 */
export async function getChurnAlerts(limit = 20, offset = 0): Promise<import("./types").ChurnAlertResponse> {
  return apiFetch<import("./types").ChurnAlertResponse>(`/api/v1/health/alerts?limit=${limit}&offset=${offset}`);
}

/**
 * Fetch full customer profile (details, orders, comms, health).
 */
export async function getCustomerProfile(customerId: number): Promise<import("./types").CustomerProfileResponse> {
  return apiFetch<import("./types").CustomerProfileResponse>(`/api/v1/customers/${customerId}/profile`);
}

/**
 * Fetch paginated communications feed.
 */
export async function getCommunications(
  page = 1,
  pageSize = 50,
  status?: string,
  campaignId?: number
): Promise<import("./types").CommunicationsResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (status) params.set("status", status);
  if (campaignId) params.set("campaign_id", String(campaignId));
  return apiFetch<import("./types").CommunicationsResponse>(`/api/v1/communications?${params}`);
}

/**
 * SSE stream URL for real-time communications feed updates.
 */
export function getCommunicationsStreamUrl(): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("nudge_token") : "";
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${BASE_URL}/api/v1/communications/stream${query}`;
}

// ── AI Chat Assistant ──────────────────────────────────────────────────────────

export async function sendAIChat(
  prompt: string,
  history: import("./types").AIChatMessage[]
): Promise<import("./types").AIChatResponse> {
  return apiFetch<import("./types").AIChatResponse>("/api/v1/ai/chat", {
    method: "POST",
    body: JSON.stringify({ prompt, history }),
  });
}

// ── Reusable Audiences ─────────────────────────────────────────────────────────

export async function getAudiences(): Promise<PaginatedResponse<import("./types").AudienceResponse>> {
  return apiFetch<PaginatedResponse<import("./types").AudienceResponse>>("/api/v1/audiences");
}

export async function previewAudience(
  filterCriteria: import("./types").FilterCriterion[]
): Promise<import("./types").AudiencePreviewResponse> {
  return apiFetch<import("./types").AudiencePreviewResponse>("/api/v1/audiences/preview", {
    method: "POST",
    body: JSON.stringify({ filter_criteria: filterCriteria }),
  });
}

export async function createAudience(
  name: string,
  description: string,
  filterCriteria: import("./types").FilterCriterion[]
): Promise<import("./types").AudienceResponse> {
  return apiFetch<import("./types").AudienceResponse>("/api/v1/audiences", {
    method: "POST",
    body: JSON.stringify({ name, description, filter_criteria: filterCriteria }),
  });
}

// ── Dead-Letter Queue Auditing ──────────────────────────────────────────────────

export async function getDeadLetterCallbacks(): Promise<import("./types").DeadLetterCallbackResponse> {
  return apiFetch<import("./types").DeadLetterCallbackResponse>("/api/v1/delivery/dead-letter");
}

