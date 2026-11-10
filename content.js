// Removes sponsored and suggested posts from the LinkedIn feed.
// Runs in the page context (world: "MAIN") to intercept window.fetch.

(function () {
  "use strict";

  const PROMOTED_LABELS = ["promoted", "patrocinado", "patrocinada"];
  const SUGGESTED_LABELS = ["suggested", "suggested for you", "sugerido", "sugerida", "publicação sugerida"];
  const ALL_LABELS = new Set([...PROMOTED_LABELS, ...SUGGESTED_LABELS]);

  const stats = { promoted: 0, suggested: 0, hiddenCards: 0 };

  // ---------------------------------------------------------------------
  // 1. Network: cleans feed API payloads before rendering
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
      return response; // When in doubt, return original response
    }
  };

  // Only matches exact text values: `"promoted":false` is a key, and
  // "promoted to VP" is a normal post. Neither should be removed.
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

  // Mutates `data` in-place. Returns true if anything was removed.
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

  // Removes stripped URNs from any response list at any nesting level.
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
  // 2. Page: hides whatever bypasses network filter, including infinite scroll
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
    // Only in feed: in /jobs, "Promoted" tags a job inside a list,
    // and traversing up to the card would hide the entire list.
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
