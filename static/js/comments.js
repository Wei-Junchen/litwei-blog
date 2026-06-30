document.addEventListener("DOMContentLoaded", () => {
  const escapeText = (value) => String(value || "");

  const renderComments = (list, comments) => {
    list.replaceChildren();
    if (!comments.length) {
      const empty = document.createElement("p");
      empty.className = "comment-hint";
      empty.textContent = "no comments yet.";
      list.appendChild(empty);
      return;
    }

    for (const item of comments) {
      const article = document.createElement("article");
      article.className = "comment-item";

      const meta = document.createElement("div");
      meta.className = "comment-meta";
      const name = document.createElement("span");
      name.textContent = escapeText(item.name || "anonymous");
      const time = document.createElement("time");
      time.textContent = item.created_at ? new Date(item.created_at).toLocaleString() : "";
      meta.append(name, time);

      const body = document.createElement("p");
      body.className = "comment-body";
      body.textContent = escapeText(item.comment);

      article.append(meta, body);
      list.appendChild(article);
    }
  };

  document.querySelectorAll(".comment-terminal").forEach((box) => {
    const form = box.querySelector(".comment-form");
    const list = box.querySelector("[data-comment-list]");
    const status = box.querySelector("[data-comment-status]");
    const endpoint = box.dataset.commentsEndpoint || "/api/comments";
    const pagePath = box.dataset.pagePath || window.location.pathname;
    const timestamp = form.querySelector(".comment-timestamp");

    const setStatus = (text) => {
      if (status) status.textContent = text;
    };

    const loadComments = async () => {
      if (!list) return;
      try {
        const res = await fetch(`${endpoint}?path=${encodeURIComponent(pagePath)}`, {
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderComments(list, data.comments || []);
      } catch (err) {
        list.replaceChildren();
        const p = document.createElement("p");
        p.className = "comment-hint";
        p.textContent = "comments are temporarily unavailable.";
        list.appendChild(p);
      }
    };

    if (timestamp) {
      timestamp.value = new Date().toISOString();
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (timestamp) timestamp.value = new Date().toISOString();
      setStatus("submitting...");

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: new FormData(form),
          headers: { "Accept": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        form.reset();
        if (timestamp) timestamp.value = new Date().toISOString();
        setStatus("comment saved locally.");
        await loadComments();
      } catch (err) {
        setStatus(`submit failed: ${err.message}`);
      }
    });

    loadComments();
  });
});
