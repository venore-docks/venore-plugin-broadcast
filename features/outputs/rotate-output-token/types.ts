import type { OperationResult } from "@venore/plugin-sdk";

// Gera um token novo pra tela — o link antigo para de funcionar na hora. Pra quando um link vaza
// ou some o controle de quem tem acesso. As TVs que estavam no link antigo recebem um "reload"
// (vão bater no 404 e cair na tela de espera) — reconfigure elas com o link novo.
export type RotateOutputTokenCommand = { outputId: string; actorId: string };
export type RotateOutputTokenInput = Omit<RotateOutputTokenCommand, "actorId">;
export type RotateOutputTokenResult = OperationResult<{ outputId: string; token: string }>;
