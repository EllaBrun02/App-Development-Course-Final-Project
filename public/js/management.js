// Editor management page: list, search, create, edit and delete users, comments and view stats
// through /editor/api/<resource>.
(function () {
  const resource = document.getElementById('resource'),
    list = document.getElementById('record-list'),
    fields = document.getElementById('record-fields'),
    form = document.getElementById('record-form'),
    message = document.getElementById('management-message');
  let page = 1,
    id = null,
    request = 0,
    busy = false,
    loading = false,
    hasMore = false;
  const definitions = {
    users: [
      ['username', 'Username', 'text'],
      ['name', 'Display name', 'text'],
      ['role', 'Role', 'select'],
      ['password', 'Password (leave empty to keep when editing)', 'password'],
    ],
    comments: [
      ['article', 'Article ID', 'text'],
      ['author', 'Author name', 'text'],
      ['body', 'Comment', 'textarea'],
    ],
    viewstats: [
      ['article', 'Article ID', 'text'],
      ['hour', 'Hour (UTC)', 'datetime-local'],
      ['count', 'Views', 'number'],
    ],
  };
  // Disables every control while a save or delete runs, and the paging buttons when they can't be used.
  function syncControls() {
    const controls = [
      resource,
      document.getElementById('new-record'),
      ...form.querySelectorAll('input, select, textarea, button'),
      ...document.getElementById('search-form').querySelectorAll('input, button'),
      ...list.querySelectorAll('button'),
    ];
    controls.forEach((control) => {
      control.disabled = busy;
    });
    document.getElementById('previous').disabled = busy || loading || page === 1;
    document.getElementById('next').disabled = busy || loading || !hasMore;
  }
  // Calls the JSON API of the selected resource; throws with the server's error message on failure.
  async function api(path = '', method = 'GET', body) {
    const r = await fetch('/editor/api/' + resource.value + path, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  }
  // Builds the form fields for the selected resource: filled in when editing an item, empty for a new record.
  function edit(item = {}) {
    id = item._id || null;
    fields.replaceChildren();
    document.getElementById('form-heading').textContent = id ? 'Edit record' : 'New record';
    for (const [name, label, type] of definitions[resource.value]) {
      const group = document.createElement('div');
      group.className = 'form-group';
      const l = document.createElement('label');
      l.textContent = label;
      l.htmlFor = 'field-' + name;
      const input = document.createElement(
        type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input',
      );
      input.id = 'field-' + name;
      input.name = name;
      if (type !== 'textarea' && type !== 'select') input.type = type;
      if (type === 'select')
        for (const value of ['reporter', 'editor']) {
          const o = document.createElement('option');
          o.value = o.textContent = value;
          input.appendChild(o);
        }
      input.value =
        name === 'hour' && item.hour
          ? item.hour.slice(0, 16)
          : (item[name] ?? (name === 'count' ? 0 : name === 'role' ? 'reporter' : ''));
      input.required = name !== 'password' || !id;
      if (type === 'number') {
        input.min = 0;
        input.step = 1;
      }
      group.append(l, input);
      fields.appendChild(group);
    }
  }
  // Loads one page of records into the list, each with Edit and Delete buttons.
  // The request token ignores responses that arrive after a newer load started.
  async function load() {
    const token = ++request;
    loading = true;
    list.replaceChildren();
    syncControls();
    try {
      const data = await api(
        '?page=' + page + '&search=' + encodeURIComponent(document.getElementById('search').value),
      );
      if (token !== request) return;
      list.replaceChildren();
      for (const item of data.items) {
        const li = document.createElement('li'),
          text = document.createElement('span');
        text.textContent =
          resource.value === 'users'
            ? `${item.username} — ${item.name} (${item.role})`
            : resource.value === 'comments'
              ? `${item.author}: ${item.body} — article ${item.article}`
              : `${item.hour}: ${item.count} views — article ${item.article}`;
        const change = document.createElement('button');
        change.textContent = 'Edit';
        change.className = 'btn btn-sm btn-outline';
        change.addEventListener('click', () => edit(item));
        const remove = document.createElement('button');
        remove.textContent = 'Delete';
        remove.className = 'btn btn-sm btn-danger';
        // Deletes the record after confirmation, clears the form if it held that record, and reloads the list.
        remove.addEventListener('click', async () => {
          if (busy || !confirm('Delete this record?')) return;
          busy = true;
          syncControls();
          try {
            await api('/' + item._id, 'DELETE');
            if (id === item._id) edit();
            await load();
          } catch (e) {
            message.textContent = e.message;
          } finally {
            busy = false;
            syncControls();
          }
        });
        li.append(text, ' ', change, ' ', remove);
        list.appendChild(li);
      }
      hasMore = data.hasMore;
    } catch (e) {
      if (token === request) {
        hasMore = false;
        message.textContent = e.message;
      }
    } finally {
      if (token === request) {
        loading = false;
        syncControls();
      }
    }
  }
  // Saves the form: PATCH when editing, POST when new. An empty password is dropped so it stays unchanged,
  // and a view stat's hour is sent as a UTC ISO date.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    try {
      const body = Object.fromEntries(new FormData(form));
      if (id && !body.password) delete body.password;
      if (resource.value === 'viewstats') {
        body.count = Number(body.count);
        body.hour = new Date(body.hour + 'Z').toISOString();
      }
      busy = true;
      syncControls();
      await api(id ? '/' + id : '', id ? 'PATCH' : 'POST', body);
      message.textContent = 'Saved';
      edit();
      await load();
    } catch (e) {
      message.textContent = e.message;
    } finally {
      busy = false;
      syncControls();
    }
  });
  // Switching resource resets paging, search and the form, then loads the new list.
  resource.addEventListener('change', () => {
    if (busy) return;
    page = 1;
    document.getElementById('search').value = '';
    message.textContent = '';
    edit();
    load();
  });
  // A new search starts again from page 1.
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    page = 1;
    load();
  });
  // Go back one page (ignored while a request runs or on the first page).
  document.getElementById('previous').addEventListener('click', () => {
    if (busy || loading || page === 1) return;
    page--;
    load();
  });
  // Go forward one page, only when the server said more records exist.
  document.getElementById('next').addEventListener('click', () => {
    if (busy || loading || !hasMore) return;
    page++;
    load();
  });
  document.getElementById('new-record').addEventListener('click', () => {
    if (!busy) edit();
  });
  edit();
  load();
})();
