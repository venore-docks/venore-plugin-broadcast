"use client";

import { createContext } from "react";

// Ponte entre PlaylistLayer (fundo do layer-renderer, sabe qual item toca agora) e OutputCanvas
// (manda o beacon de telemetria). Context em vez de prop threading — o valor atravessaria
// LayerRenderer + renderLayerContent (função de args posicionais) só pra chegar no PlaylistLayer.
// Módulo próprio pra não criar import circular entre output-canvas.tsx e layer-renderer.tsx.
export type NowPlayingInfo = { index: number; count: number; label: string; itemId: string };

export const NowPlayingContext = createContext<((info: NowPlayingInfo | null) => void) | null>(null);
