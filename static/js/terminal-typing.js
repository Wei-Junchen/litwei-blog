(function () {
  const targets = document.querySelectorAll("[data-terminal-typing]");
  if (!targets.length) return;

  const playedKeyPrefix = "litwei:terminal-typing:played:";
  const targetDurationMs = 5000;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  function readSteps(target) {
    try {
      const steps = JSON.parse(target.getAttribute("data-typing") || "[]");
      return Array.isArray(steps) ? steps : [];
    } catch (_err) {
      return [];
    }
  }

  function contentKey(target) {
    let hash = 0;
    const value = target.getAttribute("data-typing") || "";
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return playedKeyPrefix + Math.abs(hash);
  }

  function finalText(steps) {
    let value = "";
    for (const step of steps) {
      if (step.type === "type") value += String(step.value || "");
      if (step.type === "backspace") value = value.slice(0, Math.max(0, value.length - Number(step.count || 1)));
    }
    return value;
  }

  function timingFor(steps) {
    const pauseMs = steps.reduce((sum, step) => step.type === "pause" ? sum + Number(step.ms || 240) : sum, 0);
    const operations = steps.reduce((sum, step) => {
      if (step.type === "type") return sum + Array.from(String(step.value || "")).length;
      if (step.type === "backspace") return sum + Number(step.count || 1);
      return sum;
    }, 0);
    const compressedPauseMs = Math.min(900, pauseMs * 0.55);
    const availableMs = Math.max(1800, targetDurationMs - compressedPauseMs);
    const operationDelayMs = operations ? availableMs / operations : 0;
    return {
      operationDelayMs: Math.max(8, Math.min(58, operationDelayMs)),
      pauseScale: pauseMs ? compressedPauseMs / pauseMs : 1,
    };
  }

  async function play(target) {
    const output = target.querySelector(".terminal-typing-output");
    const steps = readSteps(target);
    if (!output || !steps.length) return;
    const playedKey = contentKey(target);

    if (reduceMotion || window.sessionStorage.getItem(playedKey) === "1") {
      output.textContent = finalText(steps);
      return;
    }

    let value = "";
    const timing = timingFor(steps);
    await sleep(220);

    for (const step of steps) {
      if (step.type === "pause") {
        await sleep(Number(step.ms || 240) * timing.pauseScale);
      }

      if (step.type === "type") {
        for (const char of String(step.value || "")) {
          value += char;
          output.textContent = value;
          await sleep(timing.operationDelayMs * (0.75 + Math.random() * 0.5));
        }
      }

      if (step.type === "backspace") {
        const count = Number(step.count || 1);
        for (let index = 0; index < count; index += 1) {
          value = value.slice(0, -1);
          output.textContent = value;
          await sleep(timing.operationDelayMs * (0.55 + Math.random() * 0.35));
        }
      }
    }

    window.sessionStorage.setItem(playedKey, "1");
  }

  targets.forEach((target) => {
    play(target);
  });
})();
