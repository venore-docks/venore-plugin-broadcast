// Nunca variou na prática (sempre a mesma pasta do projeto) e virou um segundo campo pra configurar
// à toa — feedback direto: "Item Pasta raiz de vídeos no servidor também é desnecessário, porque
// sempre vai ser public/broadcast". Virou constante fixa (não mais uma entrada de
// contexts/settings/tela admin); relativo, não absoluto — resolveWithinRoot faz
// path.resolve(BROADCAST_ROOT_FOLDER), que usa process.cwd() como base quando o valor não é
// absoluto, e process.cwd() é a raiz do projeto tanto em `next dev` quanto em `next start`.
// Aponta pra public/broadcast/{videos,playlists} (ver public/broadcast/*/.gitkeep).
import { DEFAULT_BROADCAST_TIMEZONE } from "./timezone";

export const BROADCAST_ROOT_FOLDER = "public/broadcast";

// Mesmo racional de BROADCAST_ROOT_FOLDER acima — toda playlist local aponta pra esta MESMA
// subpasta compartilhada (public/broadcast/videos); o operador escolhe, por playlist, quais
// arquivos dessa pasta única entram (ver scan-playlist-folder/add-scanned-playlist-items), não
// mais uma subpasta própria por playlist. Feedback direto: "Item Pasta de vídeos... é
// desnecessário, a pasta sempre vai ser public/broadcast/videos".
export const BROADCAST_VIDEOS_FOLDER_PATH = "videos";

// Pasta irmã de BROADCAST_VIDEOS_FOLDER_PATH, mesmo racional — pedido explícito: "Vídeos da pasta,
// vamos fazer algo similar para 'Imagens na pasta', porque aí eu só jogo na pasta a imagem".
// Diferente de vídeo, NÃO é lida de playlist.folderPath (essa coluna só existe pro caso vídeo,
// sempre "videos") — o scan de imagem (kind: "image" em scan-playlist-folder/add-scanned-
// playlist-items) usa esta constante direto. Igual public/broadcast/videos, esta pasta não é
// versionada neste repo — o operador cria public/broadcast/images/ manualmente no disco do
// servidor e joga as imagens lá.
export const BROADCAST_IMAGES_FOLDER_PATH = "images";

// Chave/default de contexts/settings pro plugin — única fonte de verdade, usada tanto por
// manifest.ts (registro do default via registerDefaultSetting, ver register-plugins.ts) quanto
// pela tela admin de configuração. Mesmo padrão de shared/appearance.ts do birthdays.
export const BROADCAST_SETTINGS = {
  // Cidade usada pelas layers "info" (clima) e "news" (notícias) — texto livre em formato de
  // busca de geocoding ("Curitiba" ou "Curitiba, PR, Brasil"), não um código IBGE/ISO.
  region: {
    key: "broadcast.region",
    defaultValue: "",
    label: "Região (cidade) pra clima e notícias",
  },
  // Fuso horário da sede — usado tanto pra interpretar a hora de parede que o operador digita nos
  // eventos de agenda (parse do <input datetime-local> em components/admin/actions.ts) quanto pra
  // formatar data/hora e calcular "hoje"/"agora"/dia da semana na view de saída, que pode estar
  // rodando numa TV em qualquer fuso. Id IANA ("America/Sao_Paulo"); o seletor da tela admin
  // (BROADCAST_TIMEZONE_OPTIONS em shared/timezone.ts) mostra rótulo por cidade, nunca o id cru.
  timezone: {
    key: "broadcast.timezone",
    defaultValue: DEFAULT_BROADCAST_TIMEZONE,
    label: "Fuso horário da instituição",
  },
  // Cor de fundo da barra inferior da view principal (camada "video") — logo + relógio +
  // temperatura ficam nela, hex escolhido pelo operador via <input type="color">.
  brandColor: {
    key: "broadcast.brandColor",
    defaultValue: "#111",
    label: "Cor da barra de marca (view principal)",
  },
  // Lista de palavras separadas por vírgula — qualquer manchete cujo título contenha uma delas
  // (case-insensitive) é descartada antes de chegar na TV. Curadoria simples pedida direto:
  // "precisamos de mais opções para notícias (como escolher quais são mostradas)" — sem precisar
  // de uma tela de aprovar/rejeitar manchete por manchete, que exigiria guardar estado por artigo
  // (a API não dá um id estável entre chamadas) — bloqueio por palavra-chave é o que dá pra fazer
  // sem esse estado extra.
  newsExcludeKeywords: {
    key: "broadcast.newsExcludeKeywords",
    defaultValue: "",
    label: "Palavras-chave pra excluir das notícias (separadas por vírgula)",
  },
  // Como os cards de evento entram na tela ao trocar de agenda no rodízio — "fade" é o bloco
  // inteiro (nome + lista) surgindo junto (comportamento original); "cascade" anima cada card de
  // evento em sequência, um depois do outro, deslizando da direita. Pedido explícito: "quero ter
  // a opção no sistema de colocar o fade atual ou essa animação".
  agendaAnimationStyle: {
    key: "broadcast.agendaAnimationStyle",
    defaultValue: "fade",
    label: "Estilo de animação da agenda",
  },
  // Escala conjunta da largura da coluna de agenda + altura da BrandFooterBar (ver
  // BROADCAST_AGENDA_VIEW_SIZE_SCALE abaixo) — as duas crescem juntas de propósito: uma agenda
  // mais larga ao lado de uma barra de marca pequena ficava desproporcional. Default já em
  // "grande" (não "padrao") — pedido explícito: "Quero que a Agenda seja maior... Pode aumentar
  // Agenda em 1/2".
  agendaViewSize: {
    key: "broadcast.agendaViewSize",
    defaultValue: "grande",
    label: "Tamanho da coluna de agenda e da barra de marca",
  },
  // Chave compartilhada que o script scripts/broadcast-diag-agent.ps1 manda no header
  // X-Diagnostics-Key de cada report — autentica o agent (não tem sessão/login, roda solto num PC
  // de TV), não confundir com o token de saída (esse identifica QUAL tela, a chave prova que quem
  // está mandando dado de PC é de fato um agent autorizado). Vazia por padrão: report-agent-
  // diagnostics rejeita todo POST enquanto a chave não for gerada na tela de diagnóstico
  // ("Gerar nova chave" -> crypto.randomUUID()).
  diagnosticsAgentKey: {
    key: "broadcast.diagnosticsAgentKey",
    defaultValue: "",
    label: "Chave do agent de diagnóstico (PowerShell)",
  },
  // Nomes de grupo (JSON array) cuja reprodução é sincronizada — todas as telas do grupo que
  // tocam a mesma playlist mostram o mesmo item, com seek pra bater o tempo (v1.8). O servidor
  // mantém um cursor por playlist (runtime/sync-cursor.ts). Toggle por grupo no diálogo "Grupos".
  syncedGroups: {
    key: "broadcast.syncedGroups",
    defaultValue: "[]",
    label: "Grupos com reprodução sincronizada",
  },
} as const;

export type BroadcastSettingField = keyof typeof BROADCAST_SETTINGS;

// O valor de broadcast.syncedGroups pode voltar do settings-store como string JSON ('["A"]') OU
// como array já parseado (['A']) dependendo de como o jsonb foi gravado/lido — aceita os dois e
// sempre devolve string[]. Usado pelo admin (getBroadcastSyncedGroups) e pela view (get-output-state).
export function parseSyncedGroups(value: unknown): string[] {
  let arr: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      arr = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(arr) ? arr.filter((entry): entry is string => typeof entry === "string") : [];
}

export type BroadcastAgendaAnimationStyle = "fade" | "cascade";

export type BroadcastAgendaViewSize = "padrao" | "grande" | "extra-grande";

// agendaWidthPercent: TETO da largura da coluna de agenda quando aberta (o vídeo ocupa o resto,
// 100 menos esse valor) — ver applyAgendaViewSizeOverride em layer-renderer.tsx, que ignora o
// x/width cru gravado por output na criação (create-output/store.ts) e recalcula os dois a partir
// daqui, pra um ajuste de tamanho valer pra saídas já existentes também, não só pras criadas
// depois. Deixou de ser só um teto fixo: useZeroBarAgendaWidthPercent (layer-renderer.tsx) mede a
// tela real e ajusta a agenda entre um piso de ~1/4 da tela (pedido explícito: "a barra da agenda
// deve ter no mínimo aproximadamente 1/4 da tela") e este teto por tier — nenhum tier pode ficar
// abaixo de 25 (o piso venceria de qualquer forma, mas evita a inconsistência de um tier "menor
// que o mínimo global"). Na prática, com o piso de 25% bem acima do que fecha 16:9 exato (~10-15%
// com os footers atuais), a agenda normalmente fica no piso e alguma barra preta residual volta a
// aparecer na view do vídeo — trade-off explícito, tamanho da agenda tem prioridade.
// footerHeightClassName/footerHeightPx: mesma altura, dois formatos — className pro primeiro
// render (SSR-safe, sem depender de medir a janela) e px pro cálculo de
// useZeroBarAgendaWidthPercent (a altura do footer, fixa, é o outro lado da mesma conta: quanto
// mais alto o footer, mais largura sobra pra agenda sem gerar barra preta). Reduzida levemente
// (pedido explícito: "diminua levemente o height").
export const BROADCAST_AGENDA_VIEW_SIZE_SCALE: Record<
  BroadcastAgendaViewSize,
  { agendaWidthPercent: number; footerHeightClassName: string; footerHeightPx: number; footerLogoHeightClassName: string }
> = {
  padrao: { agendaWidthPercent: 25, footerHeightClassName: "h-20", footerHeightPx: 80, footerLogoHeightClassName: "h-20" },
  grande: { agendaWidthPercent: 30, footerHeightClassName: "h-32", footerHeightPx: 128, footerLogoHeightClassName: "h-20" },
  "extra-grande": {
    agendaWidthPercent: 30,
    footerHeightClassName: "h-20",
    footerHeightPx: 160,
    footerLogoHeightClassName: "h-12",
  },
};
