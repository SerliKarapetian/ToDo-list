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

const STORAGE_KEY = "todos";
const WEEK = 7 * 24 * 60 * 60 * 1000; // 1 week in ms

/* State */
let tasks = [];
let filter = "all"; // "all" | "active" | "completed"

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

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  save();
  render();
  notify("Task deleted");
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

/* Notification */
function notify(message, type = "success") {
  const el = document.createElement("div");
  el.className = `notification notification--${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 350);
  }, 2000);
}

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
