import { listArticles } from "@venore/plugin-sdk/content-feed";
import { getSetting } from "@venore/plugin-sdk/settings";
import { BROADCAST_SETTINGS } from "../shared/settings";
import type { RegionNewsArticle } from "../contracts/types";

// Fonte da layer "news" (v1.9.1) — feed sincronizado de OUTRAS plataformas Venore Docks, não mais
// uma API externa genérica. Decisão explícita do usuário: "nenhum conteúdo da internet pode tocar
// nas TVs, com exceção do conteúdo que vai vir via o blog de outras plataformas Venore Docks".
//
// O admin do host assina os feeds em /admin/content-feed (fora deste plugin — o plugin não pode
// criar/gerenciar conexões, só ler o que já foi sincronizado). @venore/plugin-sdk/content-feed
// expõe listArticles: uma leitura LOCAL do cache já sincronizado, sem chamada de rede daqui — o
// plugin nunca faz fetch pra internet, quem sincroniza é o host, num job próprio dele.
//
// Nome do arquivo/função mudou (era runtime/region-news.ts / resolveRegionNews — puxava uma API
// de notícia por cidade); RegionNewsArticle e o campo `regionNews` no estado da saída mantiveram o
// nome pra não precisar renomear em cascata client-side (layer-renderer.tsx) por uma troca que é só
// de FONTE, não de forma. Sem fonte assinada (nenhum "source" cadastrado) = [] — mesmo
// comportamento "vazio, nunca quebra a página" de antes.
export async function resolveBroadcastNews(): Promise<RegionNewsArticle[]> {
  const [articlesResult, excludeKeywordsSetting] = await Promise.all([
    listArticles({}),
    getSetting({ key: BROADCAST_SETTINGS.newsExcludeKeywords.key }),
  ]);
  if (!articlesResult.success) return [];

  const excludeKeywords = (
    excludeKeywordsSetting.success && typeof excludeKeywordsSetting.data?.value === "string" ? excludeKeywordsSetting.data.value : ""
  )
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 0);

  const articles: RegionNewsArticle[] = articlesResult.data.map((article) => ({
    title: article.title,
    description: article.excerptText,
    // readMoreUrl é null quando o artigo não tem categorySlug (ver content-feed/list-articles/
    // service.ts) — cai no id do artigo, só usado como React key (NewsCardRotator), nunca
    // renderizado como link clicável na TV.
    link: article.readMoreUrl ?? `content-feed:${article.id}`,
    imageUrl: article.coverImageUrl,
    sourceName: article.sourceName,
  }));

  return filterExcludedArticles(articles, excludeKeywords);
}

// Curadoria simples (broadcast.newsExcludeKeywords, tela de Configurações) — qualquer manchete
// cujo título contenha uma das palavras-chave (case-insensitive) é descartada. Continua valendo
// mesmo com a fonte trocada: é uma segunda camada de controle sobre o que aparece na TV, por cima
// do que quer que os feeds assinados tragam.
function filterExcludedArticles(articles: RegionNewsArticle[], excludeKeywords: string[]): RegionNewsArticle[] {
  if (excludeKeywords.length === 0) return articles;
  return articles.filter((article) => !excludeKeywords.some((keyword) => article.title.toLowerCase().includes(keyword)));
}
