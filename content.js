// Remove posts patrocinados e sugeridos do feed do LinkedIn.
// Roda no contexto da página (world: "MAIN") para poder interceptar window.fetch.

(function () {
  "use strict";

  const PROMOTED_LABELS = ["promoted", "patrocinado", "patrocinada"];
  const SUGGESTED_LABELS = ["suggested", "suggested for you", "sugerido", "sugerida", "publicação sugerida"];
  const ALL_LABELS = new Set([...PROMOTED_LABELS, ...SUGGESTED_LABELS]);

  const stats = { promoted: 0, suggested: 0, hiddenCards: 0 };

  // ---------------------------------------------------------------------
  // 1. Rede: limpa as respostas da API do feed antes de renderizar
  // ---------------------------------------------------------------------
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : String(args[0]?.url ?? args[0] ?? "");

    if (!response.ok || !url.includes("/voyager/api/") || !/feed/i.test(url)) {
      return response;
    }

    try {
      if (!(response.headers.get("content-type") || "").includes("json")) return response;

      const data = await response.clone().json();
      if (!filterFeedPayload(data)) return response;

      const cleaned = new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      Object.defineProperty(cleaned, "url", { value: response.url });
      return cleaned;
    } catch {
      return response; // Na dúvida, entrega a resposta original
    }
  };

  // Compara só valores de texto exatos: `"promoted":false` é uma chave, e
  // "promoted to VP" é um post normal. Nenhum dos dois deve ser removido.
  function hasLabel(dump, labels) {
    return labels.some((label) => dump.includes(`:"${label}"`));
  }

  function classify(item) {
    const dump = JSON.stringify(item).toLowerCase();
    if (
      item.adContext != null ||
      item.sponsoredMetadata != null ||
      item.isSponsored === true ||
      hasLabel(dump, PROMOTED_LABELS)
    ) {
      return "promoted";
    }
    return hasLabel(dump, SUGGESTED_LABELS) ? "suggested" : null;
  }

  // Altera `data` no lugar. Retorna true se removeu alguma coisa.
  function filterFeedPayload(data) {
    if (!Array.isArray(data?.included)) return false;

    const badUrns = new Set();
    data.included = data.included.filter((item) => {
      const kind = classify(item);
      if (!kind) return true;
      stats[kind]++;
      if (item.entityUrn) badUrns.add(item.entityUrn);
      if (item.dashEntityUrn) badUrns.add(item.dashEntityUrn);
      return false;
    });

    if (badUrns.size === 0) return false;
    pruneReferences(data, badUrns);
    return true;
  }

  // Tira os URNs removidos de qualquer lista da resposta, em qualquer nível.
  function pruneReferences(node, badUrns) {
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        const el = node[i];
        const urn = typeof el === "string" ? el : el?.entityUrn || el?.dashEntityUrn || el?.targetUrn;
        if (badUrns.has(urn)) node.splice(i, 1);
        else pruneReferences(el, badUrns);
      }
    } else if (node && typeof node === "object") {
      for (const value of Object.values(node)) pruneReferences(value, badUrns);
    }
  }

  // ---------------------------------------------------------------------
  // 2. Página: esconde o que passar pela rede, inclusive no scroll infinito
  // ---------------------------------------------------------------------
  function findCard(el) {
    for (let cur = el; cur && cur !== document.body; cur = cur.parentElement) {
      if (
        cur.id?.includes("FeedType_") ||
        cur.classList?.contains("feed-shared-update-v2") ||
        cur.classList?.contains("artdeco-card")
      ) {
        return cur;
      }
    }
    return null;
  }

  function hideLabel(el) {
    if (el.children.length > 0) return;
    if (!ALL_LABELS.has((el.textContent || "").trim().toLowerCase())) return;

    const card = findCard(el);
    if (card && card.style.display !== "none") {
      card.style.display = "none";
      stats.hiddenCards++;
    }
  }

  function scan(root) {
    // Só no feed: em /jobs, "Promoted" marca uma vaga dentro de uma lista,
    // e subir até o card esconderia a lista inteira.
    if (!location.pathname.startsWith("/feed")) return;
    if (root.matches?.("span, p")) hideLabel(root);
    root.querySelectorAll("span, p").forEach(hideLabel);
  }

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        const root = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (root) scan(root);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan(document));
  } else {
    scan(document);
  }

  window.__linkedinAdblock = { getStats: () => ({ ...stats }) };
})();
