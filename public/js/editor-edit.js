(function () {
  const form = document.getElementById("version-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const body = Object.fromEntries(new FormData(form));
    body.target = form.dataset.target;
    body.revision = Number(form.dataset.revision);
    try {
      const res = await fetch(`/editor/articles/${form.dataset.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      form.dataset.revision = data.revision;
      document.getElementById("edit-message").textContent = "Version saved";
    } catch (err) {
      document.getElementById("edit-message").textContent =
        err.message || "Save failed";
    } finally {
      button.disabled = false;
    }
  });
})();
