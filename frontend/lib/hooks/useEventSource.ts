/**
 * useEventSource — T058: SSE hook for the Live Execution Tracker (US6).
 *
 * Opens an EventSource to the campaign stream URL, merges status updates
 * by campaign_message_id, and signals completion/stall.
 *
 * Returns:
 *   statuses   — map of campaign_message_id → StatusUpdateEvent (latest per recipient)
 *   isComplete — true once campaign_complete event received
 *   isStalled  — true once campaign_stalled event received
 *   error      — set if EventSource fails to connect
 */

import { useEffect, useRef, useState } from "react";
import type {
  StatusUpdateEvent,
} from "@/lib/types";

export interface UseEventSourceResult {
  statuses: Record<number, StatusUpdateEvent>; // keyed by campaign_message_id
  isComplete: boolean;
  isCancelled: boolean;
  isStalled: boolean;
  error: string | null;
}

export function useEventSource(url: string): UseEventSourceResult {
  const [statuses, setStatuses] = useState<Record<number, StatusUpdateEvent>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isStalled, setIsStalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;

    // Clean up any previous connection
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(url);
    esRef.current = es;

    es.onerror = () => {
      setError("Connection to live stream lost. Retrying…");
      // EventSource auto-reconnects; clear error when next message arrives
    };

    es.addEventListener("status_update", (e: MessageEvent) => {
      setError(null); // clear stale error on successful receive
      try {
        const update: StatusUpdateEvent = JSON.parse(e.data);
        setStatuses((prev) => ({
          ...prev,
          [update.campaign_message_id]: update,
        }));
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener("campaign_complete", () => {
      setIsComplete(true);
      es.close();
    });

    es.addEventListener("campaign_cancelled", () => {
      setIsCancelled(true);
      es.close();
    });

    es.addEventListener("campaign_stalled", () => {
      setIsStalled(true);
      es.close();
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url]);

  return { statuses, isComplete, isCancelled, isStalled, error };
}
