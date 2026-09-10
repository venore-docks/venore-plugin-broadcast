import { Check } from "lucide-react";

// Primeiros passos — mostrado no topo do admin enquanto o setup básico não está completo. Puro
// (sem estado): os dois primeiros passos são auto-detectados; o terceiro é instrução (não dá pra
// saber com segurança que uma TV abriu o link).
export function OnboardingChecklist({ hasScreen, hasContent }: { hasScreen: boolean; hasContent: boolean }) {
  const steps = [
    { done: hasScreen, label: "Crie uma tela", hint: "Aba Telas → Nova tela. A playlist dela é criada junto." },
    { done: hasContent, label: "Adicione vídeos à playlist", hint: 'Aba Playlists → "Enviar vídeo" ou "Vídeos da pasta".' },
    {
      done: false,
      label: "Abra o link na TV",
      hint: 'No card da tela: "Copiar link da TV" ou o QR code. Guia completo em /ext/broadcast/setup.',
    },
  ];

  return (
    <div className="space-y-2 rounded-panel border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium text-foreground">Primeiros passos</p>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                step.done ? "border-success-border bg-success-soft text-success" : "border-border text-muted-foreground"
              }`}
            >
              {step.done ? <Check className="size-3" aria-hidden="true" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {step.label}
              </span>
              <span className="block text-xs text-muted-foreground">{step.hint}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
