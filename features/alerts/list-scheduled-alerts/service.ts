import { findAllScheduledAlerts } from "./store";
import type { ListScheduledAlertsResult } from "./types";

export async function listScheduledAlerts(): Promise<ListScheduledAlertsResult> {
  return { success: true, data: await findAllScheduledAlerts() };
}
