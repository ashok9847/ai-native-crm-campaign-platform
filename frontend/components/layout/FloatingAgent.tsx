"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Sparkles,
  Send,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  TrendingUp,
  AlertTriangle,
  Grid,
  BarChart3,
  RefreshCw,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { sendAIChat, isAuthenticated } from "@/lib/api";
import type { AIChatMessage, AIChatResponse, AIChatAction, AIChatStructuredData } from "@/lib/types";

// Extended message structure to store actions and structured output inline in history
interface ExtendedChatMessage extends AIChatMessage {
  id: string;
  actions?: AIChatAction[];
  structured?: AIChatStructuredData | null;
  timestamp: string;
}

const PIE_COLORS = ["#09090B", "#71717A", "#D4D4D8", "#A1A1AA", "#E4E4E7"];

const SUGGESTIONS = [
  "Compare recent campaigns",
  "Generate a revenue report",
  "Predict RCS campaign results for Elite segment",
];

export default function FloatingAgent() {
  const router = useRouter();
  const pathname = usePathname();

  const [isMounted, setIsMounted] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Mark mounted on client
  useEffect(() => {
    setIsMounted(true);
    setIsAuth(isAuthenticated());
  }, [pathname]);

  // Load chat history and open state from localStorage on mount
  useEffect(() => {
    if (!isMounted) return;

    try {
      const savedHistory = localStorage.getItem("nudge_chat_history");
      if (savedHistory) {
        setMessages(JSON.parse(savedHistory));
      }

      const savedOpen = localStorage.getItem("nudge_chat_open");
      if (savedOpen === "open") {
        setIsOpen(true);
      } else if (savedOpen === "maximized") {
        setIsOpen(true);
        setIsMaximized(true);
      }
    } catch (err) {
      console.error("Error loading chat state from localStorage:", err);
    }
  }, [isMounted]);

  // Save chat state to localStorage when it changes
  useEffect(() => {
    if (!isMounted) return;

    try {
      localStorage.setItem("nudge_chat_history", JSON.stringify(messages));
    } catch (err) {
      console.error("Error saving chat history to localStorage:", err);
    }
  }, [messages, isMounted]);

  useEffect(() => {
    if (!isMounted) return;

    try {
      if (!isOpen) {
        localStorage.setItem("nudge_chat_open", "minimized");
      } else if (isMaximized) {
        localStorage.setItem("nudge_chat_open", "maximized");
      } else {
        localStorage.setItem("nudge_chat_open", "open");
      }
    } catch (err) {
      console.error("Error saving open state to localStorage:", err);
    }
  }, [isOpen, isMaximized, isMounted]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (!isMounted || !isAuth) return null;

  // Do not render on public/setup routes
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/setup"
  ) {
    return null;
  }

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ExtendedChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: "user",
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Extract history in api required format
      const apiHistory: AIChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendAIChat(trimmed, apiHistory);

      const agentMsg: ExtendedChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        role: "agent",
        content: res.reply,
        actions: res.actions,
        structured: res.structured,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, agentMsg]);

      // Check if we have redirection actions
      if (res.actions && res.actions.length > 0) {
        for (const action of res.actions) {
          if (
            action.name === "createDraftCampaign" ||
            action.name === "targetCustomers"
          ) {
            const channel = action.args.channel || "sms";
            let url = "";

            if (action.name === "createDraftCampaign") {
              const segmentId = action.args.segmentId;
              const intent = `Draft ${channel} campaign for segment ID ${segmentId}`;
              url = `/campaigns/new?intent=${encodeURIComponent(intent)}&audience_id=${segmentId}&channel=${channel}`;
            } else {
              const customerIds = action.args.customerIds;
              const customerNames = action.args.customerNames || "";
              const customer_ids_str = Array.isArray(customerIds)
                ? customerIds.join(",")
                : "";
              const intent = `Message targeted customers: ${customerNames}`;
              url = `/campaigns/new?intent=${encodeURIComponent(intent)}&customer_ids=${customer_ids_str}&channel=${channel}`;
            }

            // Perform client-side redirect after a small delay
            setTimeout(() => {
              setIsOpen(false); // Collapse widget on redirect
              router.push(url);
            }, 1500);
          }
        }
      }
    } catch (err: any) {
      console.error("AI Assistant error:", err);
      const errMsg: ExtendedChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        role: "agent",
        content: `Error: ${err.message || "Unable to reach the assistant. Please try again."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <>
      {/* ── FLOATING TRIGGER BUBBLE ─────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-accent text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 z-50 animate-float border-none"
          title="Open NudgeAI Assistant"
        >
          <Sparkles className="w-6 h-6 animate-pulse-slow" />
        </button>
      )}

      {/* ── CHAT INTERFACE PANEL ────────────────────────────────────────────── */}
      {isOpen && (
        <div
          ref={chatContainerRef}
          className={`fixed right-6 bottom-6 bg-white rounded-lg border border-border shadow-2xl flex flex-col z-50 overflow-hidden animate-scaleUp transition-all duration-300 ${
            isMaximized
              ? "w-[650px] h-[700px] max-w-[90vw] max-h-[85vh]"
              : "w-[380px] h-[540px]"
          }`}
        >
          {/* Header Row */}
          <div className="h-14 bg-accent text-white px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-xs font-black tracking-tight leading-none">NudgeAI</h3>
                <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider">Copilot Assistant</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleClearChat}
                className="p-1 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer border-none text-[10px] font-bold uppercase tracking-wider"
                title="Clear conversation history"
              >
                Clear
              </button>
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="p-1.5 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer border-none"
                title={isMaximized ? "Restore size" : "Maximize view"}
              >
                {isMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer border-none"
                title="Minimize assistant"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Flow Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-bg space-y-4 min-h-0">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center text-accent">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-text tracking-tight">Ask NudgeAI Assistant</h4>
                  <p className="text-[11px] text-text-muted mt-1 leading-relaxed max-w-[240px]">
                    I can compare campaigns, generate revenue reports, estimate outreach results, and help draft target audiences.
                  </p>
                </div>
                <div className="w-full max-w-[280px] space-y-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSend(suggestion)}
                      className="w-full text-left px-4 py-2.5 rounded-pill bg-white hover:bg-surface border border-border text-[11px] text-text-muted hover:text-text font-bold transition-all duration-150 cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const sanitizedContent = message.content.replace(/(?<!\\)\$(?=\d)/g, "\\$");
                return (
                  <div
                    key={message.id}
                    className={`flex flex-col ${
                      message.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-xs font-medium leading-relaxed ${
                        message.role === "user"
                          ? "bg-accent text-white rounded-tr-none shadow-sm"
                          : "bg-white text-text border border-border rounded-tl-none shadow-sm"
                      }`}
                    >
                      <div className="prose prose-sm dark:prose-invert break-words max-w-none text-inherit">
                        <ReactMarkdown
                          remarkPlugins={[remarkMath, remarkGfm]}
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            table: ({ node, ...props }) => (
                              <div className="overflow-x-auto my-2 border border-border rounded-[12px] bg-white">
                                <table className="min-w-full text-left border-collapse" {...props} />
                              </div>
                            ),
                            thead: ({ node, ...props }) => (
                              <thead className="bg-surface border-b border-border font-black" {...props} />
                            ),
                            th: ({ node, ...props }) => (
                              <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-text-muted border-none" {...props} />
                            ),
                            td: ({ node, ...props }) => (
                              <td className="px-3 py-2 text-[10px] font-bold text-text border-b border-border last:border-b-0" {...props} />
                            ),
                          }}
                        >
                          {sanitizedContent}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Actions Logs (Inline in chat) */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="mt-1.5 w-full max-w-[85%] space-y-1.5">
                        {message.actions.map((act, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-surface border border-border text-[10px] text-text-muted font-bold"
                          >
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{act.description}</span>
                            <span className="ml-auto bg-white border border-border text-[9px] px-1.5 py-0.5 rounded-pill shrink-0">
                              {act.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Structured Visualization Data Cards */}
                    {message.structured && (
                      <div className="mt-2.5 w-full max-w-[95%]">
                        <StructuredDataRenderer structured={message.structured} />
                      </div>
                    )}

                    <span className="text-[9px] text-text-faint font-bold mt-1 px-1">
                      {message.timestamp}
                    </span>
                  </div>
                );
              })
            )}

            {isLoading && (
              <div className="flex items-center gap-2 text-text-muted text-[11px] font-bold pl-2 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-accent animate-spin" />
                <span>NudgeAI is thinking…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Input Row */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(inputValue);
            }}
            className="h-16 border-t border-border bg-white px-4 flex items-center gap-2.5 shrink-0"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask NudgeAI..."
              disabled={isLoading}
              className="flex-1 bg-surface h-10 px-4 rounded-pill text-xs font-bold border-none outline-none focus:ring-1 focus:ring-accent-light"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border-none shrink-0 transition-all ${
                isLoading || !inputValue.trim()
                  ? "bg-surface text-text-faint cursor-not-allowed"
                  : "bg-accent text-white hover:bg-accent-dark"
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// ── INLINE STRUCTURED DATA DISPLAY RENDERER ──────────────────────────────────
function StructuredDataRenderer({ structured }: { structured: AIChatStructuredData }) {
  const { type, data } = structured;

  // Grid Table Inline View
  if (type === "datagrid") {
    const { title, columns = [], rows = [] } = data;
    return (
      <div className="rounded-[18px] bg-white border border-border shadow-sm overflow-hidden w-full">
        {title && (
          <div className="px-4 py-2.5 border-b border-border bg-surface flex items-center gap-1.5">
            <Grid className="w-3.5 h-3.5 text-text-muted" />
            <h4 className="text-[10px] font-black text-text uppercase tracking-wider">
              {title}
            </h4>
          </div>
        )}
        <div className="overflow-x-auto max-w-full">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface border-b border-border">
                {columns.map((col: string, idx: number) => (
                  <th
                    key={idx}
                    className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-text-muted border-none"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: string[], rowIdx: number) => (
                <tr
                  key={rowIdx}
                  className="border-b border-border hover:bg-surface-hover transition-colors"
                >
                  {row.map((cell: string, cellIdx: number) => (
                    <td
                      key={cellIdx}
                      className="px-3 py-2 text-[10px] font-bold text-text border-none truncate max-w-[150px]"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Live Chart Recharts Rendering
  if (type === "chart") {
    const { title, chartType, xAxisKey, series = [], data: chartData = [] } = data;

    if (!chartData || chartData.length === 0) {
      return (
        <div className="rounded-[18px] bg-white border border-border p-4 text-center text-[10px] text-text-muted font-bold">
          No chart data returned.
        </div>
      );
    }

    // Wrap in dynamic sizing
    return (
      <div className="rounded-[18px] bg-white border border-border p-4 shadow-sm w-full space-y-3">
        {title && (
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-text-muted" />
            <h4 className="text-[10px] font-black text-text uppercase tracking-wider">
              {title}
            </h4>
          </div>
        )}

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "line" ? (
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey={xAxisKey} tick={{ fill: "var(--text-muted)", fontSize: 9, fontWeight: "bold" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 9, fontWeight: "bold" }} axisLine={false} tickLine={false} />
                <Tooltip wrapperStyle={{ outline: "none", fontSize: "10px" }} />
                <Legend wrapperStyle={{ fontSize: "9px", fontWeight: "bold", textTransform: "uppercase" }} />
                {series.map((s: any, idx: number) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color || PIE_COLORS[idx % PIE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            ) : chartType === "pie" ? (
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={50}
                  fill="#8884d8"
                  dataKey={series[0]?.key || "value"}
                  nameKey={xAxisKey}
                  label={{ fontSize: 8, fontWeight: "bold", fill: "var(--text)" }}
                >
                  {chartData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip wrapperStyle={{ outline: "none", fontSize: "10px" }} />
              </PieChart>
            ) : chartType === "area" ? (
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey={xAxisKey} tick={{ fill: "var(--text-muted)", fontSize: 9, fontWeight: "bold" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 9, fontWeight: "bold" }} axisLine={false} tickLine={false} />
                <Tooltip wrapperStyle={{ outline: "none", fontSize: "10px" }} />
                {series.map((s: any, idx: number) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    fill={s.color || PIE_COLORS[idx % PIE_COLORS.length]}
                    stroke={s.color || PIE_COLORS[idx % PIE_COLORS.length]}
                    fillOpacity={0.15}
                  />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey={xAxisKey} tick={{ fill: "var(--text-muted)", fontSize: 9, fontWeight: "bold" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 9, fontWeight: "bold" }} axisLine={false} tickLine={false} />
                <Tooltip wrapperStyle={{ outline: "none", fontSize: "10px" }} />
                {series.map((s: any, idx: number) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.name}
                    fill={s.color || "#09090B"}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Outcome Prediction Rendering Card
  if (type === "prediction") {
    const { prediction = {} } = data;
    const {
      segment,
      audienceSize = 0,
      channel,
      basedOnCampaigns = 0,
      predicted = {},
    } = prediction;

    return (
      <div className="rounded-[18px] bg-white border border-border p-4 shadow-sm w-full space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-green" />
            <h4 className="text-[10px] font-black text-text uppercase tracking-wider">
              Campaign Forecast
            </h4>
          </div>
          <span
            className={`px-2 py-0.5 rounded-pill text-[8px] font-bold uppercase tracking-wider ${
              predicted.riskLevel === "Low"
                ? "bg-green-light text-green"
                : predicted.riskLevel === "Medium"
                ? "bg-amber-light text-amber"
                : "bg-red-light text-red"
            }`}
          >
            {predicted.riskLevel} Risk
          </span>
        </div>

        <div className="bg-surface rounded-xl p-3 text-[10px] space-y-1">
          <div className="flex justify-between">
            <span className="text-text-muted font-medium">Target Segment:</span>
            <span className="font-bold text-text truncate max-w-[180px]">{segment}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted font-medium">Audience Size:</span>
            <span className="font-bold text-text">{audienceSize.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted font-medium">Outreach Channel:</span>
            <span className="font-bold text-text uppercase">{channel}</span>
          </div>
        </div>

        {/* Prediction Metrics Funnel Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-[#F8F9FA] rounded-xl p-2 border border-border">
            <span className="block text-[8px] font-black text-text-muted uppercase tracking-wider">
              Open Rate
            </span>
            <span className="block text-xs font-black text-text mt-0.5">
              {predicted.openRate}
            </span>
            <span className="block text-[8px] text-text-faint font-bold">
              ~{predicted.opens?.toLocaleString()}
            </span>
          </div>
          <div className="bg-[#F8F9FA] rounded-xl p-2 border border-border">
            <span className="block text-[8px] font-black text-text-muted uppercase tracking-wider">
              Conversions
            </span>
            <span className="block text-xs font-black text-text mt-0.5">
              {predicted.conversionRate}
            </span>
            <span className="block text-[8px] text-text-faint font-bold">
              ~{predicted.conversions?.toLocaleString()}
            </span>
          </div>
          <div className="bg-green-light rounded-xl p-2 border border-green-light">
            <span className="block text-[8px] font-black text-[#166534] uppercase tracking-wider">
              Est. Revenue
            </span>
            <span className="block text-xs font-black text-[#166534] mt-0.5">
              ${predicted.estimatedRevenue?.toLocaleString()}
            </span>
            <span className="block text-[8px] text-[#166534]/70 font-bold">
              ${predicted.revenuePerSend}/send
            </span>
          </div>
        </div>

        <div className="flex items-start gap-1.5 bg-amber-light text-[#92400E] p-2.5 rounded-xl text-[9px] leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="font-bold">
            Based on {basedOnCampaigns || "0"} historical {channel} campaign(s). Expected ranges may vary based on message personalization.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
