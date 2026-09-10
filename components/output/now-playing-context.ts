"use client";

import { createContext } from "react";

// Ponte entre PlaylistLayer (fundo do layer-renderer, sabe qual item toca agora) e OutputCanvas
// (manda o beacon de telemetria). Context em vez de prop threading — o valor atravessaria
// LayerRenderer + renderLayerContent (função de args posicionais) só pra chegar no PlaylistLayer.
// Módulo próprio pra não criar import circular entre output-canvas.tsx e layer-renderer.tsx.
export type NowPlayingInfo = { index: number; count: number; label: string; itemId: string };

export const NowPlayingContext = createContext<((info: NowPlayingInfo | null) => void) | null>(null);

// "Congelar" — mesma ponte canvas ↔ layer. Quando true, o PlaylistLayer desliga o timer de avanço
// e o onEnded do <video>, deixando o item atual fixo.
export const FreezeContext = createContext(false);

// Reprodução sincronizada de grupo (v1.8). Quando não-null, o PlaylistLayer NÃO controla o índice
// nem avança sozinho: mostra `itemIndex`, dá seek no <video> pra bater `startedAtMs`, e ao terminar
// o item faz POST em /api/broadcast/output/<token>/sync-advance. O servidor (get-output-state)
// preenche isso só pras telas de grupo sincronizado.
export type SyncInfo = { token: string; playlistId: string; itemIndex: number; itemId: string; startedAtMs: number };

export const SyncContext = createContext<SyncInfo | null>(null);
