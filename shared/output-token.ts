// Token de saída = a parte da URL que o operador digita na TV (/ext/broadcast/out/<token>) — precisa
// ser curto e fácil de digitar num controle remoto, não um UUID. Gerado a partir do nome da saída
// ("TV da recepção" -> "tv-da-recepcao"); sufixo numérico só entra se já existir uma saída com o
// mesmo slug (ver create-output/store.ts).
export function slugifyOutputName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "saida";
}
