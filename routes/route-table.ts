import { asPluginApiHandler, asPluginPage, type PluginRouteTable } from "@venore/plugin-sdk";
import AdminPage from "./admin/page";
import OutPage from "./out/page";
import SetupPage from "./setup/page";
import { GET as streamGET } from "./api/stream/route";
import { POST as uploadPOST } from "./api/upload/route";
import { POST as beaconPOST } from "./api/beacon/route";
import { GET as outputEventsGET } from "./api/output-events/route";
import { GET as outputStateGET } from "./api/output-state/route";

// A view de saída foge por completo da shell do (platform) — área `standalone` (caminho após
// /ext/), casada pelo dispatcher genérico src/app/ext/[...slug]/ do core. URL: /ext/broadcast/out/:token.
export const broadcastRouteTable: PluginRouteTable = {
  admin: [{ pattern: "", Component: asPluginPage(AdminPage) }],
  standalone: [
    { pattern: "broadcast/out/:token", Component: asPluginPage(OutPage) },
    // Guia imprimível pra ligar uma TV. URL: /ext/broadcast/setup.
    { pattern: "broadcast/setup", Component: asPluginPage(SetupPage) },
  ],
  api: [
    { pattern: "stream/:itemId", handlers: { GET: asPluginApiHandler(streamGET) } },
    // Upload de vídeo pra pasta compartilhada — corpo cru, playlistId/filename por querystring
    // (ver routes/api/upload/route.ts). URL: /api/broadcast/upload.
    { pattern: "upload", handlers: { POST: asPluginApiHandler(uploadPOST) } },
    { pattern: "output/:token/events", handlers: { GET: asPluginApiHandler(outputEventsGET) } },
    { pattern: "output/:token/state", handlers: { GET: asPluginApiHandler(outputStateGET) } },
    // Telemetria da TV de volta pro servidor (viewport/navegador/status) — ver routes/api/beacon.
    { pattern: "output/:token/beacon", handlers: { POST: asPluginApiHandler(beaconPOST) } },
  ],
};
