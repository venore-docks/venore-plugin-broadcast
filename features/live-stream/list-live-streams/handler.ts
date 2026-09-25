import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listLiveStreams } from "./service";
import type { ListLiveStreamsResult } from "./types";

export async function listLiveStreamsHandler(): Promise<ListLiveStreamsResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return listLiveStreams();
}
