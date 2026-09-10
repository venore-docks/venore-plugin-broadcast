import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

// "Quero outra TV igual a essa" — clona a tela: cena + 3 camadas, a playlist dedicada (com os
// itens copiados) e os ajustes de exibição (agenda/rodapé/faixa/espera/ciclo da agenda). NÃO
// copia: token (gera um novo), PIN, responsáveis, vínculos de agenda, programação por horário.
export type DuplicateOutputCommand = { outputId: string; actorId: string };
export type DuplicateOutputInput = Omit<DuplicateOutputCommand, "actorId">;
export type DuplicateOutputResult = OperationResult<BroadcastOutputRecord>;
