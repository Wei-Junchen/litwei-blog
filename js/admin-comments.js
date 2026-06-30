document.addEventListener("DOMContentLoaded", () => {
  const tokenInput = document.querySelector("#admin-token");
  const saveToken = document.querySelector("#save-token");
  const clearToken = document.querySelector("#clear-token");
  const reloadButton = document.querySelector("#reload-comments");
  const status = document.querySelector("#admin-status");
  const list = document.querySelector("#admin-comments");
  const endpoint = "/api/admin/comments";

  const setStatus = (text) => { status.textContent = text; };
  const token = () => tokenInput.value.trim();
  const headers = () => ({
    "Accept": "application/json",
    "Authorization": `Bearer ${token()}`,
  });

  tokenInput.value = localStorage.getItem("litwei-comment-admin-token") || "";

  const render = (comments) => {
    list.replaceChildren();
    if (!comments.length) {
      const p = document.createElement("p");
      p.className = "comment-hint";
      p.textContent = "no comments.";
      list.appendChild(p);
      return;
    }

    for (const item of comments) {
      const article = document.createElement("article");
      article.className = "comment-item";

      const meta = document.createElement("div");
      meta.className = "comment-meta";
      const who = document.createElement("span");
      who.textContent = `${item.name || "anonymous"}${item.email ? ` <${item.email}>` : ""}`;
      const when = document.createElement("time");
      when.textContent = item.created_at ? new Date(item.created_at).toLocaleString() : "";
      meta.append(who, when);

      const body = document.createElement("p");
      body.className = "comment-body";
      body.textContent = item.comment || "";

      const extra = document.createElement("div");
      extra.className = "admin-comment-extra";
      const page = document.createElement("a");
      page.href = item.page_url || item.page_path || "#";
      page.textContent = item.page_title || item.page_path || item.page_url || "unknown page";
      extra.append("page: ", page, document.createElement("br"));
      extra.append(`ip: ${item.ip || ""}`);
      extra.append(document.createElement("br"));
      extra.append(`ua: ${item.user_agent || ""}`);
      extra.append(document.createElement("br"));
      extra.append(`id: ${item.id}`);

      const actions = document.createElement("div");
      actions.className = "admin-actions";
      const del = document.createElement("button");
      del.className = "comment-submit admin-danger";
      del.type = "button";
      del.textContent = "delete";
      del.addEventListener("click", async () => {
        if (!confirm("Delete this comment?")) return;
        setStatus("deleting...");
        try {
          const res = await fetch(`${endpoint}?id=${encodeURIComponent(item.id)}`, {
            method: "DELETE",
            cache: "no-store",
            headers: headers(),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
          setStatus("deleted.");
          await load();
        } catch (err) {
          setStatus(`delete failed: ${err.message}`);
        }
      });
      actions.appendChild(del);

      article.append(meta, body, extra, actions);
      list.appendChild(article);
    }
  };

  const load = async () => {
    if (!token()) {
      setStatus("missing token.");
      render([]);
      return;
    }
    setStatus("loading...");
    try {
      const res = await fetch(`${endpoint}?_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: headers(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      render(data.comments || []);
      setStatus(`${(data.comments || []).length} comments loaded.`);
    } catch (err) {
      render([]);
      setStatus(`load failed: ${err.message}`);
    }
  };

  saveToken.addEventListener("click", () => {
    localStorage.setItem("litwei-comment-admin-token", token());
    load();
  });
  clearToken.addEventListener("click", () => {
    localStorage.removeItem("litwei-comment-admin-token");
    tokenInput.value = "";
    render([]);
    setStatus("token cleared.");
  });
  reloadButton.addEventListener("click", load);

  if (token()) load();
});
