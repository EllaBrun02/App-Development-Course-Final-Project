(function () {
  const resource = document.getElementById("resource"),
    list = document.getElementById("record-list"),
    fields = document.getElementById("record-fields"),
    form = document.getElementById("record-form"),
    message = document.getElementById("management-message");
  let page = 1,
    id = null,
    request = 0;
  const definitions = {
    users: [
      ["username", "Username", "text"],
      ["name", "Display name", "text"],
      ["role", "Role", "select"],
      ["password", "Password (leave empty to keep when editing)", "password"],
    ],
    comments: [
      ["article", "Article ID", "text"],
      ["author", "Author name", "text"],
      ["body", "Comment", "textarea"],
    ],
    viewstats: [
      ["article", "Article ID", "text"],
      ["hour", "Hour (UTC)", "datetime-local"],
      ["count", "Views", "number"],
    ],
  };
  async function api(path = "", method = "GET", body) {
    const r = await fetch("/editor/api/" + resource.value + path, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  }
  function edit(item = {}) {
    id = item._id || null;
    fields.replaceChildren();
    document.getElementById("form-heading").textContent = id
      ? "Edit record"
      : "New record";
    for (const [name, label, type] of definitions[resource.value]) {
      const group = document.createElement("div");
      group.className = "form-group";
      const l = document.createElement("label");
      l.textContent = label;
      l.htmlFor = "field-" + name;
      const input = document.createElement(
        type === "textarea"
          ? "textarea"
          : type === "select"
            ? "select"
            : "input",
      );
      input.id = "field-" + name;
      input.name = name;
      if (type !== "textarea" && type !== "select") input.type = type;
      if (type === "select")
        for (const value of ["reporter", "editor"]) {
          const o = document.createElement("option");
          o.value = o.textContent = value;
          input.appendChild(o);
        }
      input.value =
        name === "hour" && item.hour
          ? item.hour.slice(0, 16)
          : (item[name] ??
            (name === "count" ? 0 : name === "role" ? "reporter" : ""));
      input.required = name !== "password" || !id;
      if (type === "number") {
        input.min = 0;
        input.step = 1;
      }
      group.append(l, input);
      fields.appendChild(group);
    }
  }
  async function load() {
    const token = ++request;
    try {
      const data = await api(
        "?page=" +
          page +
          "&search=" +
          encodeURIComponent(document.getElementById("search").value),
      );
      if (token !== request) return;
      list.replaceChildren();
      for (const item of data.items) {
        const li = document.createElement("li"),
          text = document.createElement("span");
        text.textContent =
          resource.value === "users"
            ? `${item.username} — ${item.name} (${item.role})`
            : resource.value === "comments"
              ? `${item.author}: ${item.body} — article ${item.article}`
              : `${item.hour}: ${item.count} views — article ${item.article}`;
        const change = document.createElement("button");
        change.textContent = "Edit";
        change.className = "btn btn-sm btn-outline";
        change.addEventListener("click", () => edit(item));
        const remove = document.createElement("button");
        remove.textContent = "Delete";
        remove.className = "btn btn-sm btn-danger";
        remove.addEventListener("click", async () => {
          if (!confirm("Delete this record?")) return;
          try {
            await api("/" + item._id, "DELETE");
            if (id === item._id) edit();
            await load();
          } catch (e) {
            message.textContent = e.message;
          }
        });
        li.append(text, " ", change, " ", remove);
        list.appendChild(li);
      }
      document.getElementById("previous").disabled = page === 1;
      document.getElementById("next").disabled = !data.hasMore;
    } catch (e) {
      message.textContent = e.message;
    }
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      if (id && !body.password) delete body.password;
      if (resource.value === "viewstats") {
        body.count = Number(body.count);
        body.hour = new Date(body.hour + "Z").toISOString();
      }
      await api(id ? "/" + id : "", id ? "PATCH" : "POST", body);
      message.textContent = "Saved";
      edit();
      await load();
    } catch (e) {
      message.textContent = e.message;
    } finally {
      button.disabled = false;
    }
  });
  resource.addEventListener("change", () => {
    page = 1;
    document.getElementById("search").value = "";
    message.textContent = "";
    edit();
    load();
  });
  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    page = 1;
    load();
  });
  document.getElementById("previous").addEventListener("click", () => {
    page--;
    load();
  });
  document.getElementById("next").addEventListener("click", () => {
    page++;
    load();
  });
  document.getElementById("new-record").addEventListener("click", () => edit());
  edit();
  load();
})();
