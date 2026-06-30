document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".comment-form").forEach((form) => {
    const timestamp = form.querySelector(".comment-timestamp");
    if (timestamp) {
      timestamp.value = new Date().toISOString();
    }

    form.addEventListener("submit", (event) => {
      const captcha = form.querySelector(".comment-captcha");
      const expected = form.dataset.captchaAnswer || "5";
      if (captcha && captcha.value.trim() !== expected) {
        event.preventDefault();
        alert("captcha error");
        captcha.focus();
      }
    });
  });
});
