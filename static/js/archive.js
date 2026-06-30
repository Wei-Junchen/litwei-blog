document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".section-layout").forEach((layout) => {
    const archive = layout.querySelector(".section-archive");
    if (!archive) return;

    const section = archive.dataset.archiveSection || "default";
    const key = `litwei-archive-collapsed:${section}`;

    const apply = (collapsed) => {
      archive.open = !collapsed;
      layout.classList.toggle("archive-collapsed", collapsed);
    };

    apply(localStorage.getItem(key) === "1");

    archive.addEventListener("toggle", () => {
      const collapsed = !archive.open;
      localStorage.setItem(key, collapsed ? "1" : "0");
      layout.classList.toggle("archive-collapsed", collapsed);
    });
  });
});
