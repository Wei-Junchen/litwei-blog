document.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector("#site-search");
  const results = document.querySelector("#site-search-results");
  if (!input || !results) return;

  let index = [];
  let loaded = false;

  const escapeText = (value) => String(value || "");

  const loadIndex = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const res = await fetch(`/index.json?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      index = await res.json();
    } catch (_err) {
      index = [];
    }
  };

  const render = (items, query) => {
    results.replaceChildren();
    if (!query) {
      results.hidden = true;
      return;
    }

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "site-search-empty";
      empty.textContent = "no result";
      results.appendChild(empty);
      results.hidden = false;
      return;
    }

    for (const item of items.slice(0, 8)) {
      const link = document.createElement("a");
      link.className = "site-search-result";
      link.href = item.url;

      const title = document.createElement("strong");
      title.textContent = escapeText(item.title);

      const meta = document.createElement("span");
      meta.textContent = `${item.section} · ${item.date}`;

      const summary = document.createElement("small");
      summary.textContent = escapeText(item.summary || item.content || "");

      link.append(title, meta, summary);
      results.appendChild(link);
    }
    results.hidden = false;
  };

  const search = async () => {
    await loadIndex();
    const query = input.value.trim().toLowerCase();
    if (!query) return render([], "");
    const terms = query.split(/\s+/).filter(Boolean);
    const matched = index
      .map((item) => {
        const haystack = `${item.title} ${item.section} ${item.summary} ${item.content}`.toLowerCase();
        const ok = terms.every((term) => haystack.includes(term));
        const score = terms.reduce((sum, term) => sum + (String(item.title || "").toLowerCase().includes(term) ? 3 : haystack.includes(term) ? 1 : 0), 0);
        return { item, ok, score };
      })
      .filter((entry) => entry.ok)
      .sort((a, b) => b.score - a.score || String(b.item.date).localeCompare(String(a.item.date)))
      .map((entry) => entry.item);
    render(matched, query);
  };

  input.addEventListener("focus", search);
  input.addEventListener("input", search);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".header-search")) results.hidden = true;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      results.hidden = true;
    }
  });
});
