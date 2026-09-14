// Slugs das 9 mutações gateadas (features/content-changes) — os MESMOS strings que
// beginOperation({ useCase: ... }) já usa nesses service.ts (broadcast.update-playlist-item etc.),
// uma única taxonomia em vez de duas. Chave do registry de appliers (./appliers.ts) e do que fica
// gravado em broadcast_content_changes.use_case.
export const CONTENT_CHANGE_USE_CASES = {
  updatePlaylistItem: "broadcast.update-playlist-item",
  deletePlaylistItem: "broadcast.delete-playlist-item",
  reorderPlaylistItems: "broadcast.reorder-playlist-items",
  togglePlaylistItemVisibility: "broadcast.toggle-playlist-item-visibility",
  addWebpagePlaylistItem: "broadcast.add-webpage-playlist-item",
  addMediaAssetPlaylistItem: "broadcast.add-media-asset-playlist-item",
  addNewsPlaylistItem: "broadcast.add-news-playlist-item",
  addAgendaEventPlaylistItem: "broadcast.add-agenda-event-playlist-item",
  addMetricsBoardPlaylistItem: "broadcast.add-metrics-board-playlist-item",
  addScannedPlaylistItems: "broadcast.add-scanned-playlist-items",
  publishAlert: "broadcast.publish-alert",
  publishTakeover: "broadcast.publish-takeover",
} as const;
