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

const STORAGE_KEY = "todos";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const UNDO_WINDOW = 5000;
const MAX_LENGTH = 100;

/* State */
let tasks = [];
let filter = "all";
let pendingDelete = null;
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

/* Rendering */
function visibleTasks() {
  if (filter === "active") return tasks.filter((t) => !t.done);
  if (filter === "completed") return tasks.filter((t) => t.done);
  return tasks;
}

function render() {
  const list = visibleTasks();
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
    text.textContent = task.text;

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

  // Progress
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  progressFill.style.strokeDasharray = `${pct}, 100`;
  progressLabel.textContent = pct + "%";

  // Empty state
  emptyEl.hidden = list.length > 0;
  if (list.length === 0) {
    if (total === 0) {
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

  // Click anywhere else on the row: select + toggle
  selectTask(li.dataset.id, { scroll: false });
  toggleTask(li.dataset.id);
});

// Focused task + keyboard — handled by the global handler below now.
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

/* Shortcuts overlay triggers */
shortcutsBtn?.addEventListener("click", toggleShortcuts);

shortcutsEl?.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeShortcuts();
});

/* Click outside any task → clear selection */
document.addEventListener("click", (e) => {
  // Ignore clicks inside a task (the list handler manages those)
  if (e.target.closest(".task")) return;

  // Ignore clicks inside the shortcuts overlay
  if (e.target.closest("#shortcuts")) return;

  // Ignore clicks on the shortcuts toggle button (it's a UI control)
  if (e.target.closest("#shortcuts-btn")) return;

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
  // Esc always works, even inside inputs (used to cancel edit)
  if (e.key === "Escape") {
    if (shortcutsEl && !shortcutsEl.hidden) {
      e.preventDefault();
      closeShortcuts();
      return;
    }
    if (isTypingTarget(e.target)) {
      // Blur the input; edit's own Esc handler handles cancel
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

  // Ignore bare modifier presses
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const selectedLi = getSelectedLi();

  switch (e.key) {
    // Focus composer
    case "n":
    case "N":
    case "/":
      e.preventDefault();
      inputBox.focus();
      inputBox.select();
      break;

    // Navigation
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

    // Toggle done
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

    // Edit selected
    case "e":
    case "E":
      if (selectedLi) {
        e.preventDefault();
        startEdit(selectedLi);
      }
      break;

    // Delete selected
    case "Delete":
    case "Backspace":
      if (selectedId) {
        e.preventDefault();
        const id = selectedId;
        moveSelection(1);
        deleteTask(id);
      }
      break;

    // Shortcuts overlay
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
