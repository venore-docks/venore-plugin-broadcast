import { isPluginActive } from "@venore/plugin-sdk";
import { notFound } from "next/navigation";

// Guia rápido pra quem vai ligar uma TV — página standalone (fora da shell do tema), pensada pra
// imprimir e deixar perto do equipamento. Sem dado nenhum: instruções fixas. URL:
// /ext/broadcast/setup.
export default async function BroadcastSetupPage() {
  if (!(await isPluginActive("broadcast"))) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8 text-sm leading-relaxed text-foreground">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Como ligar uma TV no Broadcast Studio</h1>
        <p className="text-muted-foreground">Passo a passo pra configurar uma televisão nova. Imprima e deixe perto do equipamento.</p>
      </header>

      <ol className="list-decimal space-y-3 pl-5">
        <li>
          Ligue a TV e abra o navegador dela (de preferência o <strong>Google Chrome</strong>). Em TVs sem navegador, use um
          computador pequeno, TV box ou Chromecast com Google TV ligado por HDMI.
        </li>
        <li>
          No admin, na aba <strong>Telas</strong>, encontre o card da tela e use <strong>&quot;Copiar link da TV&quot;</strong> ou o{" "}
          <strong>QR code</strong>. Digite o link no navegador da TV (o QR é mais rápido: aponte a câmera de um celular e envie o
          link, ou use um leitor de QR na própria TV).
        </li>
        <li>
          Quando a tela carregar, aperte <strong>F11</strong> (ou o botão de tela cheia do navegador) pra esconder a barra de
          endereço.
        </li>
        <li>
          Se a tela pedir um <strong>PIN</strong>, digite o PIN cadastrado nas opções daquela tela no admin. O PIN fica guardado no
          navegador da TV depois do primeiro acerto.
        </li>
        <li>
          Deixe a aba aberta. A tela se atualiza sozinha quando o conteúdo muda e se recupera sozinha de quedas de rede. Se algo
          travar, use <strong>&quot;Recarregar a TV agora&quot;</strong> no card da tela — não precisa ir até lá.
        </li>
      </ol>

      <section className="space-y-2 rounded-md border border-border p-4">
        <h2 className="font-semibold">Áudio automático (opcional)</h2>
        <p className="text-muted-foreground">
          Vídeos e páginas web tocam <strong>sem som</strong> por padrão (exigência dos navegadores). Pra tocar com som sem
          ninguém clicar, o navegador da TV precisa ser iniciado com a política de autoplay liberada. No Chrome:
        </p>
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">chrome --autoplay-policy=no-user-gesture-required --kiosk &quot;COLE_O_LINK_DA_TV_AQUI&quot;</pre>
        <p className="text-muted-foreground">
          O modo <code>--kiosk</code> já abre em tela cheia e sem barra nenhuma. Marque &quot;Tocar áudio na TV&quot; no item da
          playlist pra ele sair com som.
        </p>
      </section>

      <section className="space-y-2 rounded-md border border-border p-4">
        <h2 className="font-semibold">Problemas comuns</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong>Tela de espera com a marca do site</strong>: a tela está sem playlist, sem contato com o servidor, ou o admin
            colocou ela em &quot;Modo espera&quot;.
          </li>
          <li>
            <strong>Página web em branco</strong>: muitos sites (Google, redes sociais, bancos) bloqueiam ser exibidos dentro de
            outra página. Use o botão &quot;Verificar se carrega na TV&quot; no admin antes de adicionar.
          </li>
          <li>
            <strong>Vídeo não aparece</strong>: confira se o arquivo está na pasta de vídeos do servidor e foi adicionado à
            playlist (aba Playlists → &quot;Vídeos da pasta&quot; ou &quot;Enviar vídeo&quot;).
          </li>
        </ul>
      </section>
    </main>
  );
}
