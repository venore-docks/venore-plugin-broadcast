import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { clearTakeover } from "./service";
import type { ClearTakeoverResult } from "./types";

export async function clearTakeoverHandler(): Promise<ClearTakeoverResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return clearTakeover();
}
