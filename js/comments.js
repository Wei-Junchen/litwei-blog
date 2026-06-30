document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".comment-form").forEach((form) => {
    const timestamp = form.querySelector(".comment-timestamp");
    if (timestamp) {
      timestamp.value = new Date().toISOString();
    }
  });
});
