/* Elements */
const composer = document.getElementById("composer");
const inputBox = document.getElementById("input-box");
const listEl = document.getElementById("list-container");
const emptyEl = document.getElementById("empty-state");
const emptyTitle = document.getElementById("empty-title");
const emptyText = document.getElementById("empty-text");
const todayLabel = document.getElementById("today-label");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const themeToggle = document.getElementById("theme-toggle");
const shortcutsBtn = document.getElementById("shortcuts-btn");
const shortcutsEl = document.getElementById("shortcuts");
const searchBar = document.getElementById("search-bar");
const searchInput = document.getElementById("search-input");
const searchClear = document.getElementById("search-clear");
const searchBtn = document.getElementById("search-btn");

const STORAGE_KEY = "todos";
const WEEK = 7 * 24 * 60 * 60 * 1000; // 1 week in ms
const UNDO_WINDOW = 5000; // 5s to undo a delete
const MAX_LENGTH = 100;

/* State */
let tasks = [];
let filter = "all"; // "all" | "active" | "completed"
let query = "";
let pendingDelete = null; // { task, index, timeoutId }
let selectedId = null;

/* Helpers */
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch {
    tasks = [];
  }
  const now = Date.now();
  tasks = tasks.filter((t) => !t.completedAt || now - t.completedAt < WEEK);
}

/* Normalize for case- and accent-insensitive search */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text) {
  return normalize(text).split(/\s+/).filter(Boolean);
}

function matchesQuery(task, tokens) {
  if (tokens.length === 0) return true;
  const haystack = normalize(task.text);
  return tokens.every((tok) => haystack.includes(tok));
}

/* Wrap matched substrings in <mark> (case-insensitive, XSS-safe) */
function highlight(text, tokens) {
  if (!tokens.length) return document.createTextNode(text);

  const frag = document.createDocumentFragment();
  const haystack = normalize(text);

  const ranges = [];
  tokens.forEach((tok) => {
    let i = 0;
    while (i < haystack.length) {
      const idx = haystack.indexOf(tok, i);
      if (idx === -1) break;
      ranges.push([idx, idx + tok.length]);
      i = idx + tok.length;
    }
  });

  if (ranges.length === 0) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }

  // Merge overlapping ranges
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      frag.appendChild(document.createTextNode(text.slice(cursor, start)));
    }
    const mark = document.createElement("mark");
    mark.textContent = text.slice(start, end);
    frag.appendChild(mark);
    cursor = end;
  }
  if (cursor < text.length) {
    frag.appendChild(document.createTextNode(text.slice(cursor)));
  }
  return frag;
}

/* Rendering */
function visibleTasks() {
  const tokens = tokenize(query);
  let list = tasks;
  if (filter === "active") list = list.filter((t) => !t.done);
  else if (filter === "completed") list = list.filter((t) => t.done);
  if (tokens.length) list = list.filter((t) => matchesQuery(t, tokens));
  return { list, tokens };
}

function render() {
  const { list, tokens } = visibleTasks();
  listEl.innerHTML = "";

  list.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task" + (task.done ? " checked" : "");
    if (task.id === selectedId) li.classList.add("is-selected");
    li.dataset.id = task.id;
    li.tabIndex = 0;
    li.setAttribute("role", "listitem");
    li.setAttribute("aria-checked", String(task.done));

    const check = document.createElement("span");
    check.className = "task__check";
    check.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "task__text";
    text.appendChild(highlight(task.text, tokens));

    const actions = document.createElement("div");
    actions.className = "task__actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "task__action task__edit-btn";
    edit.dataset.action = "edit";
    edit.setAttribute("aria-label", "Edit task");
    edit.title = "Edit (E)";
    edit.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i>';

    const del = document.createElement("button");
    del.type = "button";
    del.className = "task__action task__delete";
    del.dataset.action = "delete";
    del.setAttribute("aria-label", "Delete task");
    del.title = "Delete (Del)";
    del.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';

    actions.append(edit, del);
    li.append(check, text, actions);
    listEl.appendChild(li);
  });

  // Progress ring (based on ALL tasks)
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  progressFill.style.strokeDasharray = `${pct}, 100`;
  progressLabel.textContent = pct + "%";

  // Search: reflect query state only (visibility owned by open/close)
  if (searchBar) {
    searchBar.classList.toggle("has-query", query.length > 0);
  }

  // Empty state
  emptyEl.hidden = list.length > 0;
  if (list.length === 0) {
    if (query) {
      emptyTitle.textContent = "No matches";
      emptyText.textContent = `Nothing matches “${query}”.`;
    } else if (total === 0) {
      emptyTitle.textContent = "All clear!";
      emptyText.textContent = "Add your first task above.";
    } else if (filter === "active") {
      emptyTitle.textContent = "No active tasks 🎉";
      emptyText.textContent = "Everything is done. Enjoy your day!";
    } else {
      emptyTitle.textContent = "Nothing done yet";
      emptyText.textContent = "Check off a task to see it here.";
    }
  }
}

/* Actions */
function addTask() {
  const text = inputBox.value.trim();
  if (!text) {
    notify("Please enter a task", "error");
    inputBox.focus();
    return;
  }
  tasks.unshift({ id: uid(), text, done: false, completedAt: null });
  inputBox.value = "";
  save();
  render();
  notify("Task added");
}

function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? Date.now() : null;
  save();
  render();
}

function updateTaskText(id, text) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  const trimmed = text.trim();
  if (!trimmed || trimmed === task.text) return;
  task.text = trimmed;
  save();
  render();
  notify("Task updated");
}

/* Inline edit */
function startEdit(li) {
  if (!li || li.classList.contains("is-editing")) return;
  const id = li.dataset.id;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const textEl = li.querySelector(".task__text");
  const actions = li.querySelector(".task__actions");
  if (!textEl) return;

  li.classList.add("is-editing");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "task__edit";
  input.value = task.text;
  input.maxLength = MAX_LENGTH;
  input.setAttribute("aria-label", "Edit task");
  input.autocomplete = "off";
  input.spellcheck = false;

  textEl.replaceWith(input);
  if (actions) actions.hidden = true;

  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);

  let finished = false;

  function commit() {
    if (finished) return;
    finished = true;
    updateTaskText(id, input.value);
  }

  function cancel() {
    if (finished) return;
    finished = true;
    li.classList.remove("is-editing");
    if (actions) actions.hidden = false;
    render();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("blur", () => setTimeout(commit, 0));
  input.addEventListener("click", (e) => e.stopPropagation());
}

/* Delete with undo */
function deleteTask(id) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;

  commitPendingDelete();

  const task = tasks[index];
  tasks.splice(index, 1);
  render();

  pendingDelete = {
    task,
    index,
    timeoutId: setTimeout(commitPendingDelete, UNDO_WINDOW),
  };

  showUndoToast();
}

function commitPendingDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timeoutId);
  pendingDelete = null;
  save();
}

function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timeoutId);

  const { task, index } = pendingDelete;
  tasks.splice(index, 0, task);
  pendingDelete = null;

  save();
  render();
  notify("Task restored");
}

function setFilter(next) {
  filter = next;
  selectedId = null;
  document
    .querySelectorAll(".filter")
    .forEach((b) =>
      b.classList.toggle("is-active", b.dataset.filter === filter),
    );
  render();
}

/* Search */
function openSearch() {
  if (!searchBar) return;
  searchBar.hidden = false;
  requestAnimationFrame(() => {
    searchInput.focus();
    searchInput.select();
  });
}

function closeSearch({ clear = true } = {}) {
  if (!searchBar) return;
  if (clear) {
    query = "";
    searchInput.value = "";
  }
  searchBar.hidden = true;
  selectedId = null;
  render();
}

function setQuery(next) {
  query = next;
  selectedId = null;
  render();
}

/* Selection */
function selectTask(id, { scroll = true } = {}) {
  selectedId = id;
  listEl.querySelectorAll(".task").forEach((li) => {
    li.classList.toggle("is-selected", li.dataset.id === id);
  });
  if (scroll && id) {
    const el = listEl.querySelector(`.task[data-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function moveSelection(direction) {
  const items = [...listEl.querySelectorAll(".task")];
  if (items.length === 0) return;

  if (!selectedId) {
    const target = direction > 0 ? items[0] : items[items.length - 1];
    selectTask(target.dataset.id);
    return;
  }

  const idx = items.findIndex((li) => li.dataset.id === selectedId);
  if (idx === -1) {
    selectTask(items[0].dataset.id);
    return;
  }

  const next = items[idx + direction];
  if (next) selectTask(next.dataset.id);
}

function getSelectedLi() {
  if (!selectedId) return null;
  return listEl.querySelector(`.task[data-id="${selectedId}"]`);
}

/* Shortcuts overlay */
function openShortcuts() {
  shortcutsEl.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeShortcuts() {
  shortcutsEl.hidden = true;
  document.body.style.overflow = "";
}

function toggleShortcuts() {
  if (shortcutsEl.hidden) openShortcuts();
  else closeShortcuts();
}

/* Notification */
function notify(message, type = "success", action = null) {
  const el = document.createElement("div");
  el.className = `notification notification--${type}`;
  el.setAttribute("role", "status");

  const msg = document.createElement("span");
  msg.className = "notification__message";
  msg.textContent = message;
  el.appendChild(msg);

  let duration = 2000;

  if (action) {
    duration = UNDO_WINDOW;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notification__action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      action.onClick();
      dismiss();
    });
    el.appendChild(btn);

    const timer = document.createElement("span");
    timer.className = "notification__timer";
    el.appendChild(timer);
  }

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));

  function dismiss() {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 350);
  }

  setTimeout(dismiss, duration);
}

function showUndoToast() {
  notify("Task deleted", "success", {
    label: "Undo",
    onClick: undoDelete,
  });
}

/* Theme */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore */
  }
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

window
  .matchMedia("(prefers-color-scheme: light)")
  .addEventListener("change", (e) => {
    if (localStorage.getItem("theme")) return;
    applyTheme(e.matches ? "light" : "dark");
  });

/* Events */
composer.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask();
});

listEl.addEventListener("click", (e) => {
  const li = e.target.closest(".task");
  if (!li) return;

  if (li.classList.contains("is-editing")) return;

  const actionEl = e.target.closest("[data-action]");
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === "delete") deleteTask(li.dataset.id);
    else if (action === "edit") startEdit(li);
    return;
  }

  selectTask(li.dataset.id, { scroll: false });
  toggleTask(li.dataset.id);
});

listEl.addEventListener("focusin", (e) => {
  const li = e.target.closest(".task");
  if (li) selectTask(li.dataset.id, { scroll: false });
});

/* Filters */
document
  .querySelectorAll(".filter")
  .forEach((btn) =>
    btn.addEventListener("click", () => setFilter(btn.dataset.filter)),
  );

/* Search wiring */
searchBtn?.addEventListener("click", (e) => {
  e.stopPropagation(); // don't trigger document click-outside
  if (searchBar.hidden) openSearch();
  else closeSearch();
});

searchInput?.addEventListener("input", (e) => {
  setQuery(e.target.value.trim());
});

searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    closeSearch();
  }
});

searchClear?.addEventListener("click", (e) => {
  e.stopPropagation();
  searchInput.value = "";
  setQuery("");
  searchInput.focus();
});

/* Shortcuts overlay triggers */
shortcutsBtn?.addEventListener("click", toggleShortcuts);

shortcutsEl?.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeShortcuts();
});

/* Click outside → close search (if empty) + clear selection */
document.addEventListener("click", (e) => {
  // Task row: handled by the list listener
  if (e.target.closest(".task")) return;

  // Shortcuts overlay + its toggle
  if (e.target.closest("#shortcuts")) return;
  if (e.target.closest("#shortcuts-btn")) return;

  // Search bar itself and its toggle
  const insideSearch = e.target.closest(".search");
  const onSearchBtn = e.target.closest("#search-btn");
  if (insideSearch || onSearchBtn) return;

  // Close search bar if open and query is empty
  if (searchBar && !searchBar.hidden && !query) {
    closeSearch();
  }

  // Clear task selection
  if (selectedId) {
    selectTask(null);
  }
});

/* Global keyboard shortcuts */
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

document.addEventListener("keydown", (e) => {
  // Esc always works, even inside inputs
  if (e.key === "Escape") {
    if (shortcutsEl && !shortcutsEl.hidden) {
      e.preventDefault();
      closeShortcuts();
      return;
    }
    if (
      searchBar &&
      !searchBar.hidden &&
      document.activeElement !== searchInput
    ) {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.target === searchInput) {
      // handled by search input's own listener
      return;
    }
    if (isTypingTarget(e.target)) {
      e.target.blur();
      return;
    }
    if (selectedId) {
      selectTask(null);
    }
    return;
  }

  // Don't hijack keys while typing
  if (isTypingTarget(e.target)) return;

  // Undo (Ctrl/Cmd + Z)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    if (pendingDelete) {
      e.preventDefault();
      undoDelete();
    }
    return;
  }

  // Focus composer (Ctrl/Cmd + K)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    inputBox.focus();
    inputBox.select();
    return;
  }

  // Focus search
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    openSearch();
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const selectedLi = getSelectedLi();

  switch (e.key) {
    case "n":
    case "N":
      e.preventDefault();
      inputBox.focus();
      inputBox.select();
      break;

    case "/":
      e.preventDefault();
      openSearch();
      break;

    case "j":
    case "J":
    case "ArrowDown":
      e.preventDefault();
      moveSelection(1);
      break;

    case "k":
    case "K":
    case "ArrowUp":
      e.preventDefault();
      moveSelection(-1);
      break;

    case "x":
    case "X":
      if (selectedId) {
        e.preventDefault();
        toggleTask(selectedId);
      }
      break;

    case " ":
      if (selectedId && selectedLi) {
        e.preventDefault();
        toggleTask(selectedId);
      }
      break;

    case "e":
    case "E":
      if (selectedLi) {
        e.preventDefault();
        startEdit(selectedLi);
      }
      break;

    case "Delete":
    case "Backspace":
      if (selectedId) {
        e.preventDefault();
        const id = selectedId;
        moveSelection(1);
        deleteTask(id);
      }
      break;

    case "?":
      e.preventDefault();
      toggleShortcuts();
      break;
  }
});

/* Commit pending delete before leaving */
window.addEventListener("beforeunload", () => {
  if (pendingDelete) {
    clearTimeout(pendingDelete.timeoutId);
    pendingDelete = null;
    save();
  }
});

/* Today label */
todayLabel.textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

/* Init */
load();
render();
inputBox.focus();
