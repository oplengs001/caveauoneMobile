/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * activityLogger — Warehouse App (client-side, REST API v2)
 *
 * Writes a single operation-level log entry to activity logs.
 * Fire-and-forget: errors are swallowed so they never break the
 * calling operation.
 */
import { apiFetch } from "@/lib/api";

export type ActivitySource = "admin" | "warehouse" | "store";
export type ActivityAction =
  // Onboarding / Intake
  | "ONBOARDING_BOTTLE_TAGGED"
  // Wine Requests
  | "WINE_REQUEST_CREATED"
  | "WINE_REQUEST_RECEIVING"
  | "WINE_REQUEST_INGRESS_COMPLETE"
  // Pullout
  | "PULLOUT_BOTTLE_SCANNED"
  | "PULLOUT_ITEM_SKIPPED"
  | "PULLOUT_COMPLETED"
  // Store / Receiving
  | "BOTTLE_RECEIVED"
  | "BOTTLE_SOLD"
  | "BOTTLE_TAGGED"
  // Deliveries
  | "DELIVERY_INGRESS_STARTED"
  | "DELIVERY_BOTTLE_RECEIVED"
  | "DELIVERY_INGRESS_COMPLETE"
  // Generic
  | string;

export interface LogActivityArgs {
  action: ActivityAction;
  entity: string;          // e.g. "pullout_requests"
  entityId: string;        // ID that was mutated
  summary: string;         // Human-readable one-liner
  details?: Record<string, any>; // Optional extra payload
  performedBy: string;     // email or uid
  performedByRole: string; // "admin" | "store" | "warehouse"
  source: ActivitySource;
}

export async function logActivity(args: LogActivityArgs): Promise<void> {
  try {
    await apiFetch("/activity-logs", {
      method: "POST",
      body: JSON.stringify(args),
    });
  } catch (err) {
    // Never throw — logging must never break the calling flow
    console.warn("[activityLogger] Failed to write activity log:", err);
  }
}
