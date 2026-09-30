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
const WEEK = 7 * 24 * 60 * 60 * 1000;
const UNDO_WINDOW = 5000;
const LEAVE_DELAY = 2500; // 2.5s linger in Today/Active before sliding out
const MAX_LENGTH = 100;

/* State */
let tasks = [];
let filter = "all"; // "all" | "today" | "active" | "completed"
let query = "";
let pendingDelete = null;
let selectedId = null;
let openPopover = null;
let pendingLeaveIds = new Set();

/* ---------- Date helpers ---------- */
function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function diffDays(iso) {
  const today = new Date(todayISO() + "T00:00:00");
  const target = new Date(iso + "T00:00:00");
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

function formatDue(iso) {
  if (!iso) return "";
  const d = diffDays(iso);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d <= 6) {
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short",
    });
  }
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function dueClass(iso) {
  if (!iso) return "";
  const d = diffDays(iso);
  if (d < 0) return "is-overdue";
  if (d === 0) return "is-today";
  if (d <= 3) return "is-soon";
  return "";
}

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
  tasks.forEach((t) => {
    if (!("dueAt" in t)) t.dueAt = null;
  });
}

/* Normalize for search */
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

/* Highlight matches (XSS-safe) */
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
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor)
      frag.appendChild(document.createTextNode(text.slice(cursor, s)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(s, e);
    frag.appendChild(mark);
    cursor = e;
  }
  if (cursor < text.length)
    frag.appendChild(document.createTextNode(text.slice(cursor)));
  return frag;
}

/* Filtering */
function visibleTasks() {
  const tokens = tokenize(query);
  let list = tasks;

  if (filter === "today") {
    const today = todayISO();
    list = list.filter((t) => !t.done && t.dueAt && t.dueAt <= today);
    // Today view gets sorted by due date (that's the point of the view)
    list = [...list].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  } else if (filter === "active") {
    list = list.filter((t) => !t.done);
    // Preserve original insertion order — no sorting
  } else if (filter === "completed") {
    list = list.filter((t) => t.done);
  }
  // "all" — preserve original insertion order

  if (tokens.length) list = list.filter((t) => matchesQuery(t, tokens));

  // Keep tasks that are animating out visible
  if (pendingLeaveIds.size) {
    for (const id of pendingLeaveIds) {
      const t = tasks.find((x) => x.id === id);
      if (t && !list.find((x) => x.id === id)) list.push(t);
    }
  }

  return { list, tokens };
}

/* Rendering */
function render() {
  const { list, tokens } = visibleTasks();
  listEl.innerHTML = "";

  list.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task" + (task.done ? " checked" : "");
    if (task.id === selectedId) li.classList.add("is-selected");
    if (pendingLeaveIds.has(task.id)) li.classList.add("is-leaving");
    if (task.dueAt) {
      li.classList.add("has-due");
      const cls = dueClass(task.dueAt);
      if (cls === "is-overdue") li.classList.add("is-overdue-row");
      if (cls === "is-today") li.classList.add("is-today-row");
    }
    li.dataset.id = task.id;
    li.tabIndex = 0;
    li.setAttribute("role", "listitem");
    li.setAttribute("aria-checked", String(task.done));

    const check = document.createElement("span");
    check.className = "task__check";
    check.setAttribute("aria-hidden", "true");

    // Body wraps text + due chip
    const body = document.createElement("div");
    body.className = "task__body";

    const text = document.createElement("span");
    text.className = "task__text";
    text.appendChild(highlight(task.text, tokens));
    body.appendChild(text);

    if (task.dueAt) {
      const due = document.createElement("span");
      due.className = "task__due " + dueClass(task.dueAt);
      const iconCls =
        diffDays(task.dueAt) < 0
          ? "fa-triangle-exclamation"
          : "fa-calendar-day";
      due.innerHTML = `<i class="fas ${iconCls}" aria-hidden="true"></i>`;
      due.appendChild(document.createTextNode(" " + formatDue(task.dueAt)));
      body.appendChild(due);
    }

    // Actions
    const actions = document.createElement("div");
    actions.className = "task__actions";

    const dateBtn = document.createElement("button");
    dateBtn.type = "button";
    dateBtn.className = "task__action task__date-btn";
    dateBtn.dataset.action = "date";
    dateBtn.setAttribute(
      "aria-label",
      task.dueAt ? "Change due date" : "Set due date",
    );
    dateBtn.title = "Set due date (D)";
    dateBtn.innerHTML = '<i class="far fa-calendar" aria-hidden="true"></i>';
    // Direct listener — bypasses delegation, fixes click issue
    dateBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDatePopover(dateBtn, task.id);
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "task__action task__edit-btn";
    edit.dataset.action = "edit";
    edit.setAttribute("aria-label", "Edit task");
    edit.title = "Edit (E)";
    edit.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i>';
    edit.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startEdit(li);
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "task__action task__delete";
    del.dataset.action = "delete";
    del.setAttribute("aria-label", "Delete task");
    del.title = "Delete (Del)";
    del.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteTask(task.id);
    });

    actions.append(dateBtn, edit, del);

    li.append(check, body, actions);
    listEl.appendChild(li);
  });

  // Progress ring — ALL tasks
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  progressFill.style.strokeDasharray = `${pct}, 100`;
  progressLabel.textContent = pct + "%";

  if (searchBar) searchBar.classList.toggle("has-query", query.length > 0);

  // Empty state
  emptyEl.hidden = list.length > 0;
  if (list.length === 0) {
    if (query) {
      emptyTitle.textContent = "No matches";
      emptyText.textContent = `Nothing matches “${query}”.`;
    } else if (filter === "today") {
      emptyTitle.textContent = "Nothing due today 🎉";
      emptyText.textContent = "Enjoy the clear schedule.";
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
  tasks.unshift({
    id: uid(),
    text,
    done: false,
    completedAt: null,
    dueAt: null,
  });
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

  // In Today or Active, a newly done task lingers before leaving the view
  const leavesView = task.done && (filter === "today" || filter === "active");

  if (leavesView) {
    pendingLeaveIds.add(task.id);
    render();
    setTimeout(() => {
      pendingLeaveIds.delete(task.id);
      render();
    }, LEAVE_DELAY);
  } else {
    render();
  }
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

function setDueDate(id, iso) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.dueAt = iso || null;
  save();
  render();
  notify(iso ? "Due date set" : "Due date cleared");
}

/* Inline edit */
function startEdit(li) {
  if (!li || li.classList.contains("is-editing")) return;
  const id = li.dataset.id;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const bodyEl = li.querySelector(".task__body");
  const textEl = li.querySelector(".task__text");
  const actions = li.querySelector(".task__actions");
  if (!textEl || !bodyEl) return;

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
  pendingLeaveIds.clear();
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

/* Date popover */
function closeDatePopover() {
  if (openPopover?.el) openPopover.el.remove();
  openPopover = null;
}

function openDatePopover(anchorEl, taskId) {
  closeDatePopover();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const pop = document.createElement("div");
  pop.className = "date-popover";
  pop.setAttribute("role", "menu");

  const mkBtn = (icon, label, onClick, danger = false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "date-popover__btn" + (danger ? " date-popover__btn--danger" : "");
    b.setAttribute("role", "menuitem");
    b.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
    b.appendChild(document.createTextNode(" " + label));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
      closeDatePopover();
    });
    return b;
  };

  const today = todayISO();

  pop.appendChild(mkBtn("fa-sun", "Today", () => setDueDate(taskId, today)));
  pop.appendChild(
    mkBtn("fa-arrow-right", "Tomorrow", () =>
      setDueDate(taskId, addDaysISO(today, 1)),
    ),
  );
  pop.appendChild(
    mkBtn("fa-forward", "Next week", () =>
      setDueDate(taskId, addDaysISO(today, 7)),
    ),
  );

  const d1 = document.createElement("div");
  d1.className = "date-popover__divider";
  pop.appendChild(d1);

  const customWrap = document.createElement("div");
  customWrap.className = "date-popover__custom";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = task.dueAt || "";
  dateInput.addEventListener("change", () => {
    setDueDate(taskId, dateInput.value || null);
    closeDatePopover();
  });
  dateInput.addEventListener("click", (e) => e.stopPropagation());
  customWrap.appendChild(dateInput);
  pop.appendChild(customWrap);

  if (task.dueAt) {
    const d2 = document.createElement("div");
    d2.className = "date-popover__divider";
    pop.appendChild(d2);
    pop.appendChild(
      mkBtn("fa-trash-can", "Clear date", () => setDueDate(taskId, null), true),
    );
  }

  document.body.appendChild(pop);
  openPopover = { el: pop, taskId };

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.left + rect.width / 2 - popRect.width / 2;
  let top = rect.bottom + 6;

  if (left + popRect.width > vw - 12) left = vw - popRect.width - 12;
  if (left < 12) left = 12;
  if (top + popRect.height > vh - 12) top = rect.top - popRect.height - 6;
  if (top < 12) top = 12;

  pop.style.left = left + "px";
  pop.style.top = top + "px";

  requestAnimationFrame(() => dateInput.focus());
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
  notify("Task deleted", "success", { label: "Undo", onClick: undoDelete });
}

/* Theme */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {}
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

/* ---------- List interaction ----------
   Only handles the row body click (toggle) and selection.
   Buttons have their own direct listeners set up in render().
*/
composer.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask();
});

listEl.addEventListener("click", (e) => {
  const li = e.target.closest(".task");
  if (!li) return;
  if (li.classList.contains("is-editing")) return;

  // If the click was on an action button, its own listener already
  // handled it (and called stopPropagation). But be safe:
  if (e.target.closest("[data-action]")) return;

  selectTask(li.dataset.id, { scroll: false });
  toggleTask(li.dataset.id);
});

listEl.addEventListener("focusin", (e) => {
  const li = e.target.closest(".task");
  if (li) selectTask(li.dataset.id, { scroll: false });
});

/* ---------- Filters ---------- */
document
  .querySelectorAll(".filter")
  .forEach((btn) =>
    btn.addEventListener("click", () => setFilter(btn.dataset.filter)),
  );

/* ---------- Search wiring ---------- */
searchBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
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

/* ---------- Shortcuts overlay triggers ---------- */
shortcutsBtn?.addEventListener("click", toggleShortcuts);
shortcutsEl?.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeShortcuts();
});

/* ---------- Click outside ---------- */
document.addEventListener("click", (e) => {
  // Popover close
  if (openPopover && !e.target.closest(".date-popover")) {
    closeDatePopover();
  }

  // Clicks on a task are handled by the list listener — bail here
  if (e.target.closest(".task")) return;

  // Search bar close
  const insideSearch = e.target.closest(".search");
  const onSearchBtn = e.target.closest("#search-btn");
  if (!insideSearch && !onSearchBtn) {
    if (searchBar && !searchBar.hidden && !query) closeSearch();
  }

  // Shortcuts overlay
  if (e.target.closest("#shortcuts")) return;
  if (e.target.closest("#shortcuts-btn")) return;

  // Clear selection
  if (selectedId) selectTask(null);
});

/* ---------- Keyboard ---------- */
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
  if (e.key === "Escape") {
    if (openPopover) {
      e.preventDefault();
      closeDatePopover();
      return;
    }
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
    if (e.target === searchInput) return;
    if (isTypingTarget(e.target)) {
      e.target.blur();
      return;
    }
    if (selectedId) selectTask(null);
    return;
  }

  if (isTypingTarget(e.target)) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    if (pendingDelete) {
      e.preventDefault();
      undoDelete();
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    inputBox.focus();
    inputBox.select();
    return;
  }

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

    case "t":
    case "T":
      e.preventDefault();
      setFilter("today");
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

    case "d":
    case "D":
      if (selectedId && selectedLi) {
        e.preventDefault();
        const btn = selectedLi.querySelector('[data-action="date"]');
        if (btn) openDatePopover(btn, selectedId);
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

window.addEventListener("beforeunload", () => {
  if (pendingDelete) {
    clearTimeout(pendingDelete.timeoutId);
    pendingDelete = null;
    save();
  }
});

todayLabel.textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

load();
render();
inputBox.focus();
