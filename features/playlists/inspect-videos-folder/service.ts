import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { BROADCAST_ROOT_FOLDER, BROADCAST_VIDEOS_FOLDER_PATH } from "../../../shared/settings";
import { resolveWithinRoot } from "../../../shared/sandboxed-path";
import { isVideoExtension } from "../../../shared/video-extensions";
import type { InspectVideosFolderResult, VideosFolderHealth } from "./types";

const EMPTY: VideosFolderHealth = { exists: false, videoCount: 0, totalBytes: 0, lastModifiedAt: null, otherFileCount: 0 };

async function walk(dir: string, acc: VideosFolderHealth): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isVideoExtension(path.extname(entry.name))) {
      acc.otherFileCount += 1;
      continue;
    }
    try {
      const info = await stat(entryPath);
      acc.videoCount += 1;
      acc.totalBytes += info.size;
      const mtime = info.mtime.toISOString();
      if (!acc.lastModifiedAt || mtime > acc.lastModifiedAt) acc.lastModifiedAt = mtime;
    } catch {
      // arquivo sumiu no meio da varredura — ignora
    }
  }
}

export async function inspectVideosFolder(): Promise<InspectVideosFolderResult> {
  const dir = resolveWithinRoot(BROADCAST_ROOT_FOLDER, BROADCAST_VIDEOS_FOLDER_PATH);
  if (!dir) {
    return { success: true, data: { ...EMPTY } };
  }

  const health: VideosFolderHealth = { ...EMPTY, exists: true };
  try {
    await walk(dir, health);
  } catch {
    return { success: true, data: { ...EMPTY } };
  }
  return { success: true, data: health };
}
