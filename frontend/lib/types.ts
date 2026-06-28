/**
 * TypeScript interfaces matching the Nudge backend API contracts.
 * Single source of truth for all frontend type usage.
 * @see specs/001-chat-campaign-copilot/contracts/
 */

// ── Shared enums / union types ────────────────────────────────────────────────

export type CampaignState =
  | "DRAFT"
  | "SEGMENTING"
  | "GENERATING"
  | "REVIEWING"
  | "EXECUTING"
  | "COMPLETE"
  | "CANCELLED";

export type DeliveryStatus =
  | "sent"
  | "delivered"
  | "opened"
  | "read"
  | "clicked"
  | "failed"
  | "purchased";

export type SubscriptionTier = "starter" | "premium" | "elite";

// ── Error / pagination ────────────────────────────────────────────────────────

export interface ErrorResponse {
  detail: string;
  code: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface CustomerResponse {
  id: number;
  name: string;
  email: string;
  subscription_tier: SubscriptionTier;
  roast_preference: string;
  last_order_date: string; // ISO date "YYYY-MM-DD"
  lifetime_value: number;
  city: string;
  metadata?: Record<string, any>;
}

export interface SeedResult {
  seeded: number;
  skipped: number;
}

export interface ImportRowError {
  row: number;
  email: string;
  reason: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
  new_fields_inferred?: any[];
}

// ── Campaign ──────────────────────────────────────────────────────────────────

export interface FilterCriterion {
  field: string;
  operator: string;
  value: string | number | string[];
}

export interface CustomerSummary {
  id: number;
  name: string;
  email: string;
}

export interface SegmentDetail {
  id: number;
  customer_count: number;
  filter_criteria: FilterCriterion[];
  sample_customers: CustomerSummary[];
  large_segment_warning: boolean;
}

export interface MessagePreview {
  id: number;
  customer_id: number;
  customer_name: string;
  body: string;
  edited: boolean;
  edited_body: string | null;
  effective_body: string;
}

export interface CampaignResponse {
  id: number;
  name: string;
  intent: string;
  state: CampaignState;
  created_at: string; // ISO 8601 UTC
  state_updated_at: string;
  completed_at: string | null;
  stalled_at: string | null;
  ai_summary: string | null;
  audience_id: number | null;
  audience_name: string | null;
  channel: string;
  scheduled_at: string | null;
}

export interface CampaignDetailResponse extends CampaignResponse {
  segment: SegmentDetail | null;
  messages: MessagePreview[];
}

export interface CampaignListItem {
  id: number;
  name: string;
  state: CampaignState;
  created_at: string;
  completed_at: string | null;
  segment_size: number;
  open_rate: number; // 0.0–1.0
  click_rate: number; // 0.0–1.0
  stalled_at: string | null;
  scheduled_at: string | null;
  channel: string;
  audience_id: number | null;
}

// ── Results ───────────────────────────────────────────────────────────────────

export interface CampaignMetrics {
  total_recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  purchased: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
  attributed_revenue: number;
}

export interface InsightCard {
  clicked_no_purchase_count: number;
  clicked_count: number;
  purchased_count: number;
  suggested_followup_intent: string;
  /** Exact customer IDs of clickers — used to bypass AI segmentation in follow-up campaigns. */
  clicked_customer_ids: number[];
}

export interface CampaignResultsResponse {
  campaign_id: number;
  ai_summary: string;
  metrics: CampaignMetrics;
  insight_card: InsightCard | null;
  clicked_customers: CustomerSummary[];
  purchased_customers: CustomerSummary[];
}

export interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

export interface OrderResponse {
  id: number;
  customer_id: number;
  order_date: string;
  total_amount: number;
  items: OrderItem[];
  source_channel: string;
}

// ── SSE events ────────────────────────────────────────────────────────────────

export interface StatusUpdateEvent {
  type: "status_update";
  campaign_message_id: number;
  customer_id: number;
  customer_name: string;
  status: DeliveryStatus;
  timestamp: string;
  is_retry: boolean;
}

export interface CampaignCompleteEvent {
  type: "campaign_complete";
  campaign_id: number;
  completed_at: string;
}

export interface CampaignStalledEvent {
  type: "campaign_stalled";
  campaign_id: number;
  stalled_at: string;
}

export interface CampaignCancelledEvent {
  type: "campaign_cancelled";
  campaign_id: number;
  cancelled_at: string;
}

export type SSEEvent =
  | StatusUpdateEvent
  | CampaignCompleteEvent
  | CampaignCancelledEvent
  | CampaignStalledEvent;

// ── Multi-Tenant Security & Schema ────────────────────────────────────────────

export interface UserProfileResponse {
  id: number;
  tenant_id: number;
  email: string;
  tenant_name: string;
}

export interface CRMFieldResponse {
  id: number;
  tenant_id: number;
  entity_type: string;
  field_name: string;
  field_type: string;
  description: string | null;
  allowed_enums: string[] | null;
  created_at: string;
}

export interface DashboardStatsResponse {
  total_campaigns: number;
  total_customers: number;
  total_orders: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
}

// ── Rich Dashboard (T017) ────────────────────────────────────────────────────

export interface DashboardMetrics {
  total_customers: number;
  total_orders: number;
  total_campaigns: number;
  attributed_revenue: number;
  organic_revenue: number;
  avg_delivery_rate: number;
  avg_open_rate: number;
  avg_click_rate: number;
}

export interface CampaignReachItem {
  name: string;
  sent: number;
  delivered: number;
  converted: number;
}

export interface ChannelUsedItem {
  name: string;
  count: number;
}

export interface CustomerTierItem {
  name: string;
  value: number;
}

export interface RecentCampaignItem {
  id: number;
  name: string;
  channel: string;
  state: string;
  reach: number;
  revenue: number;
  created_at: string;
}

export interface DashboardResponse {
  metrics: DashboardMetrics;
  campaign_reach: CampaignReachItem[];
  channels_used: ChannelUsedItem[];
  customer_tiers: CustomerTierItem[];
  recent_campaigns: RecentCampaignItem[];
  churn_alert_count: number;
}

// ── Analytics (T017) ─────────────────────────────────────────────────────────

export interface AnalyticsKPIs {
  total_revenue: number;
  total_orders: number;
  aov: number;
  global_conversion_rate: number;
  attributed_revenue: number;
  organic_revenue: number;
}

export interface RevenueTimePoint {
  date: string;
  revenue: number;
}

export interface ChannelPerformanceItem {
  name: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  revenue: number;
  conversion_rate: number;
}

export interface TopCampaignItem {
  id: number;
  name: string;
  channel: string;
  target: number;
  converted: number;
  revenue: number;
}

export interface FunnelStage {
  name: string;
  value: number;
}

export interface AnalyticsResponse {
  kpis: AnalyticsKPIs;
  revenue_over_time: RevenueTimePoint[];
  channel_performance: ChannelPerformanceItem[];
  top_campaigns: TopCampaignItem[];
  funnel: FunnelStage[];
}

// ── Health Scores (T017) ─────────────────────────────────────────────────────

export interface SignalBreakdown {
  score: number;
  weight: number;
  detail: string;
}

export interface HealthBreakdown {
  recency: SignalBreakdown;
  engagement: SignalBreakdown;
  spend: SignalBreakdown;
  frequency: SignalBreakdown;
}

export interface HealthScoreResponse {
  customer_id: number;
  score: number;
  zone: "healthy" | "at_risk" | "churning";
  breakdown: HealthBreakdown;
  recommended_action: string | null;
  computed_at: string;
}

export interface ChurnAlertCustomerHealth {
  score: number;
  zone: string;
  weakest_signal: string;
  recommended_action: string | null;
}

export interface ChurnAlertItem {
  id: number;
  name: string;
  email: string;
  membership_tier: string;
  health: ChurnAlertCustomerHealth;
}

export interface ChurnAlertResponse {
  alerts: ChurnAlertItem[];
  total_at_risk: number;
  total_churning: number;
}

// ── Customer Profile (T017) ──────────────────────────────────────────────────

export interface CustomerProfileOrder {
  id: number;
  order_date: string;
  total_amount: number;
  items: OrderItem[];
  communication_id: number | null;
}

export interface CustomerProfileCommunication {
  id: number;
  campaign_id: number;
  campaign_name: string;
  channel: string;
  body: string;
  status: string;
  queued_at: string;
}

export interface CustomerProfileResponse {
  customer: CustomerResponse;
  orders: CustomerProfileOrder[];
  communications: CustomerProfileCommunication[];
  health: HealthScoreResponse | null;
}

// ── Communications Feed (T017) ───────────────────────────────────────────────

export interface CommunicationItem {
  id: number;
  customer_name: string;
  customer_id: number;
  campaign_name: string;
  campaign_id: number;
  campaign_state: CampaignState;
  channel: string;
  body: string;
  status: string;
  queued_at: string;
  delivered_at: string | null;
}

export interface CommunicationsResponse {
  items: CommunicationItem[];
  total: number;
  page: number;
  page_size: number;
}

// ── AI Chat Assistant ──────────────────────────────────────────────────────────

export interface AIChatMessage {
  role: "user" | "agent";
  content: string;
}

export interface AIChatAction {
  name: string;
  description: string;
  args: Record<string, any>;
}

export interface AIChatStructuredData {
  type: "datagrid" | "chart" | "prediction" | "draft";
  data: any;
}

export interface AIChatResponse {
  reply: string;
  actions: AIChatAction[];
  structured?: AIChatStructuredData | null;
}

// ── Reusable Audiences ─────────────────────────────────────────────────────────

export interface AudienceResponse {
  id: number;
  name: string;
  description: string | null;
  customer_count: number;
  filter_criteria: FilterCriterion[];
  created_at: string;
  updated_at: string;
}

export interface AudiencePreviewResponse {
  customer_count: number;
  sample_customers: CustomerSummary[];
}

// ── Dead Letter Callbacks ──────────────────────────────────────────────────────

export interface DeadLetterCallbackItem {
  id: number;
  callback_url: string;
  event_payload: any;
  failed_at: string;
  reason: string;
}

export interface DeadLetterCallbackResponse {
  total: number;
  items: DeadLetterCallbackItem[];
}


