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

const STORAGE_KEY = "todos";
const WEEK = 7 * 24 * 60 * 60 * 1000; // 1 week in ms
const UNDO_WINDOW = 5000; // 5s to undo a delete

/* State */
let tasks = [];
let filter = "all"; // "all" | "active" | "completed"

/* Pending delete (for undo) */
let pendingDelete = null; // { task, index, timeoutId }

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
  // Auto-remove tasks completed more than 1 week ago
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
    li.dataset.id = task.id;
    li.tabIndex = 0;
    li.setAttribute("role", "listitem");
    li.setAttribute("aria-checked", String(task.done));

    const check = document.createElement("span");
    check.className = "task__check";
    check.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "task__text";
    text.textContent = task.text; // safe from XSS

    const del = document.createElement("button");
    del.type = "button";
    del.className = "task__delete";
    del.dataset.action = "delete";
    del.setAttribute("aria-label", "Delete task");
    del.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';

    li.append(check, text, del);
    listEl.appendChild(li);
  });

  // Progress ring
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  progressFill.style.strokeDasharray = `${pct}, 100`;
  progressLabel.textContent = pct + "%";

  // Empty state (contextual)
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

/* Delete with undo window */
function deleteTask(id) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;

  // If a previous delete is still pending, commit it now
  commitPendingDelete();

  const task = tasks[index];

  // Soft-delete: remove from view immediately
  tasks.splice(index, 1);
  render();

  // Hold in memory for the undo window
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
  save(); // persist the deletion only now
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
  document
    .querySelectorAll(".filter")
    .forEach((b) =>
      b.classList.toggle("is-active", b.dataset.filter === filter),
    );
  render();
}

/* Notification (supports optional action button + timer bar) */
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

/* Follow system changes only if the user hasn't picked a theme */
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
  if (e.target.closest("[data-action='delete']")) deleteTask(li.dataset.id);
  else toggleTask(li.dataset.id);
});

listEl.addEventListener("keydown", (e) => {
  const li = e.target.closest(".task");
  if (!li) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleTask(li.dataset.id);
  }
  if (e.key === "Delete") deleteTask(li.dataset.id);
});

document
  .querySelectorAll(".filter")
  .forEach((btn) =>
    btn.addEventListener("click", () => setFilter(btn.dataset.filter)),
  );

/* Ctrl/Cmd + Z to undo last delete */
document.addEventListener("keydown", (e) => {
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === "z" &&
    pendingDelete
  ) {
    e.preventDefault();
    undoDelete();
  }
});

/* Commit any pending delete before leaving the page */
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
