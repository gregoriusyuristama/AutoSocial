(function () {
  const form = document.getElementById("reset-form");
  const notice = document.getElementById("notice");

  function showNotice(msg) {
    notice.textContent = msg;
    notice.classList.remove("hidden");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    notice.classList.add("hidden");
    const username = form.username.value.trim();
    if (!username) return showNotice("Username is required.");

    try {
      await fetch("/auth/reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      showNotice("If the username exists, a token was printed to the server terminal.");
    } catch (err) {
      showNotice(err.message);
    }
  });
})();
