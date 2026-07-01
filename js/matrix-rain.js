(function () {
  const canvas = document.querySelector(".matrix-rain");
  if (!canvas) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wideScreen = window.matchMedia("(min-width: 1181px)");
  const ctx = canvas.getContext("2d", { alpha: true });
  const glyphs = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-/<>{}[]";

  let columns = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frame = 0;
  let timer = 0;
  let active = false;

  function contentBounds() {
    const main = document.querySelector(".home-main, .section-main");
    const rect = main ? main.getBoundingClientRect() : null;
    if (!rect) return { left: width * 0.2, right: width * 0.8 };
    return {
      left: Math.max(0, rect.left - 40),
      right: Math.min(width, rect.right + 40),
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const fontSize = width >= 1440 ? 16 : 14;
    const count = Math.ceil(width / fontSize);
    columns = Array.from({ length: count }, (_, index) => ({
      x: index * fontSize,
      y: Math.random() * -height,
      speed: 7 + Math.random() * 12,
      fontSize,
      alpha: 0.35 + Math.random() * 0.45,
    }));
  }

  function draw() {
    if (!active) return;

    const bounds = contentBounds();
    ctx.fillStyle = "rgba(5, 8, 7, 0.22)";
    ctx.fillRect(0, 0, width, height);
    ctx.font = columns[0] ? columns[0].fontSize + "px monospace" : "14px monospace";
    ctx.textAlign = "center";

    for (const column of columns) {
      const inContent = column.x > bounds.left && column.x < bounds.right;
      const alpha = inContent ? column.alpha * 0.05 : column.alpha;
      const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];

      ctx.fillStyle = "rgba(0, 255, 136, " + alpha.toFixed(3) + ")";
      ctx.shadowColor = "rgba(0, 255, 136, " + (alpha * 0.65).toFixed(3) + ")";
      ctx.shadowBlur = inContent ? 0 : 8;
      ctx.fillText(glyph, column.x, column.y);

      column.y += column.speed;
      if (column.y > height + 40) {
        column.y = Math.random() * -160;
        column.speed = 7 + Math.random() * 12;
        column.alpha = 0.35 + Math.random() * 0.45;
      }
    }

    ctx.shadowBlur = 0;
    frame = window.requestAnimationFrame(draw);
  }

  function start() {
    if (active || reduceMotion.matches || !wideScreen.matches) return;
    active = true;
    canvas.classList.add("is-active");
    resize();
    draw();
  }

  function stop() {
    active = false;
    canvas.classList.remove("is-active");
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function sync() {
    if (reduceMotion.matches || !wideScreen.matches) {
      stop();
    } else {
      start();
    }
  }

  window.addEventListener("resize", function () {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      if (active) resize();
      sync();
    }, 120);
  });

  reduceMotion.addEventListener("change", sync);
  wideScreen.addEventListener("change", sync);
  sync();
})();
