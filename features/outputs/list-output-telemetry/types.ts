import type { OperationResult } from "@venore/plugin-sdk";
import type { OutputBeaconSummary } from "../../../runtime/output-beacon";

// Mapa "token da saída" → telemetria das TVs que reportaram nos últimos ~90s (viewport/navegador/
// status/uptime). Lido de um Map em memória (runtime/output-beacon), sem I/O.
export type ListOutputTelemetryResult = OperationResult<Record<string, OutputBeaconSummary[]>>;
