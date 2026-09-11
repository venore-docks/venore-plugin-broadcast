import type { OperationResult } from "@venore/plugin-sdk";
import type {
  AgendaRotationEntry,
  AgendaRotationEvent,
  BroadcastLayerRecord,
  BroadcastSceneRecord,
  PlaylistItemSummary,
  RegionNewsArticle,
  RegionWeather,
} from "../../../contracts/types";
import type { BroadcastAgendaAnimationStyle, BroadcastAgendaViewSize } from "../../../shared/settings";

export type GetOutputStateQuery = { token: string };

export type { AgendaRotationEntry, AgendaRotationEvent, PlaylistItemSummary };

// Estado completo e autossuficiente pra renderizar a view de saída sem nenhuma outra chamada
// autenticada: playlistItemsByPlaylistId resolve o "o que uma layer de vídeo toca" (a layer só
// guarda config.playlistId), já classificado por kind e sem os itens escondidos;
// resolvedAssetUrlByLayerId resolve config.mediaAssetId de uma layer "image" (a de vídeo já
// resolve por si via app/api/broadcast/stream); regionWeather/regionNews/agendas/activeAlert só
// são preenchidos quando a cena atual de fato tem a layer correspondente — evita chamada externa
// (ou consulta) desnecessária quando a cena não usa esse tipo. activeAlert é a única exceção
// "sempre resolvida se a cena tem layer 'alert'" que ignora currentSceneId pra decidir o que
// mostrar — o aviso em si é global (não por cena).
export type BroadcastOutputState = {
  outputId: string;
  drawerOpen: boolean;
  footerOpen: boolean;
  // Tela de espera branded ligada de propósito pelo admin (Fase 11) — quando true, output-canvas.tsx
  // renderiza a StandbyScreen no lugar do conteúdo. brandLogoUrl/brandColor são resolvidos mesmo
  // com o footer fechado quando isto é true (ver needsBrandLogo/needsBrandColor no service).
  // effectiveOffline: toggle manual OU fora do horário de funcionamento da tela (ver service).
  offline: boolean;
  // "Congelar" — a playlist para de avançar (PlaylistLayer desliga timer + onEnded).
  frozen: boolean;
  // Ticker de agenda no rodapé — opt-in, ver components/output/output-canvas.tsx
  // (effectiveTickerOpen) e AgendaTickerBar.
  tickerEnabled: boolean;
  // Há pelo menos um item de vídeo tocável na playlist da camada de vídeo. Quando false E a saída
  // tem fallback configurado, a view mostra o fallback no lugar da tela de espera genérica.
  hasPlayableContent: boolean;
  // Fallback de conteúdo desta saída (ver database/schema/index.ts) — imagem/vídeo já resolvido
  // pra URL + mensagem livre. null/null = tela de espera padrão.
  fallbackUrl: string | null;
  fallbackMessage: string | null;
  scene: BroadcastSceneRecord | null;
  layers: BroadcastLayerRecord[];
  playlistItemsByPlaylistId: Record<string, PlaylistItemSummary[]>;
  resolvedAssetUrlByLayerId: Record<string, string>;
  regionWeather: RegionWeather | null;
  regionNews: RegionNewsArticle[];
  agendaRotation: AgendaRotationEntry[];
  activeAlertMessage: string | null;
  // Vencimento do aviso ativo (ISO). O client esconde a faixa localmente nesse instante e refaz o
  // fetch de estado, em vez de deixá-la na tela até o próximo poll de 15s — sem isso um aviso de
  // 10s ficava ~15-25s visível.
  activeAlertExpiresAt: string | null;
  // Takeover de urgência (global) — cobre TUDO em tela cheia enquanto ativo. null quando não há.
  takeoverMessage: string | null;
  takeoverMediaUrl: string | null;
  takeoverExpiresAt: string | null;
  brandLogoUrl: string | null;
  // Cor da barra de marca (logo+relógio+temperatura) no rodapé da camada "video" — sempre um hex
  // válido (default de BROADCAST_SETTINGS.brandColor quando o operador não configurou nada).
  brandColor: string;
  // "fade" (default) ou "cascade" — ver BROADCAST_SETTINGS.agendaAnimationStyle.
  agendaAnimationStyle: BroadcastAgendaAnimationStyle;
  // "padrao" | "grande" (default) | "extra-grande" — ver BROADCAST_SETTINGS.agendaViewSize.
  agendaViewSize: BroadcastAgendaViewSize;
  // Fuso da instituição (BROADCAST_SETTINGS.timezone) — o client formata data/hora e calcula
  // "hoje"/"agora"/dia da semana NELE, nunca no fuso do browser da TV. Sempre um id IANA válido
  // (default "America/Sao_Paulo").
  timeZone: string;
  // Ciclo fixo de abrir/pausar a coluna lateral — qualquer um null/0 desliga o ciclo, rodízio
  // contínuo. Consumidos pelo scheduler client em output-canvas.tsx, nunca pelo server.
  agendaOpenSeconds: number | null;
  agendaPauseSeconds: number | null;
  // Reprodução sincronizada (v1.8, sempre ligada desde v1.8.4) — preenchido sempre que esta tela
  // toca uma playlist de vídeo com itens, independente de grupo. A view
  // mostra o item `itemIndex` e dá seek no <video> pra bater `elapsedMs` (há quanto tempo o item
  // começou, medido no SERVIDOR — a view usa um relógio monotônico local a partir daí, sem
  // comparar relógios de máquinas). Ao terminar o item, faz POST em
  // /api/broadcast/output/:token/sync-advance em vez de avançar sozinha. null = sem sincronização.
  sync: { playlistId: string; itemIndex: number; itemId: string; elapsedMs: number } | null;
};

export type GetOutputStateResult = OperationResult<BroadcastOutputState>;
