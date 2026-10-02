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
const LEAVE_DURATION = 550;
const MAX_LENGTH = 100;
const RECUR_FLASH = 700;

/* State */
let tasks = [];
let filter = "all";
let query = "";
let pendingDelete = null;
let selectedId = null;
let openPopover = null;
let leavingIds = new Set();
let sortableInstance = null;

/* Date helpers */
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

function addMonthsISO(iso, months) {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  d.setDate(1); // avoid rolling into next month when adding
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

/**
 * Compute the next due date for a recurrence.
 * @param {string} currentISO - the current due date (YYYY-MM-DD)
 * @param {"daily"|"weekly"|"monthly"} recurrence
 * @returns {string} next due date in YYYY-MM-DD
 */
function nextOccurrence(currentISO, recurrence) {
  if (!currentISO) currentISO = todayISO();
  if (recurrence === "daily") return addDaysISO(currentISO, 1);
  if (recurrence === "weekly") return addDaysISO(currentISO, 7);
  if (recurrence === "monthly") return addMonthsISO(currentISO, 1);
  return currentISO;
}

function recurLabel(recurrence) {
  if (recurrence === "daily") return "Daily";
  if (recurrence === "weekly") return "Weekly";
  if (recurrence === "monthly") return "Monthly";
  return "";
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

function isValidISODate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  if (y < 1900 || y > 2999) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
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
  tasks.forEach((t, i) => {
    if (!("dueAt" in t)) t.dueAt = null;
    if (typeof t.order !== "number") t.order = i;
    if (!("recurrence" in t)) t.recurrence = null;
  });
}

/* Search helpers */
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
    list = [...list].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  } else if (filter === "active") {
    list = list.filter((t) => !t.done);
    list = [...list].sort((a, b) => a.order - b.order);
  } else if (filter === "completed") {
    list = list.filter((t) => t.done);
    list = [...list].sort((a, b) => a.order - b.order);
  } else {
    list = [...list].sort((a, b) => a.order - b.order);
  }

  if (tokens.length) list = list.filter((t) => matchesQuery(t, tokens));

  return { list, tokens };
}

function canReorder() {
  return filter === "all" && !query;
}

/* Row builder */
function buildTaskRow(task, tokens) {
  const li = document.createElement("li");
  li.className = "task";
  if (task.done) li.classList.add("checked");
  if (task.id === selectedId) li.classList.add("is-selected");
  li.dataset.id = task.id;
  li.tabIndex = 0;
  li.setAttribute("role", "listitem");
  li.setAttribute("aria-checked", String(task.done));

  // Grip — only rendered when reordering is allowed.
  if (canReorder()) {
    const grip = document.createElement("span");
    grip.className = "task__grip";
    grip.setAttribute("aria-hidden", "true");
    grip.title = "Drag to reorder";
    grip.innerHTML = '<i class="fas fa-grip-vertical"></i>';
    li.appendChild(grip);
  }

  const check = document.createElement("span");
  check.className = "task__check";
  check.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "task__text";
  text.appendChild(highlight(task.text, tokens));

  // Recurrence chip (only when recurrence is set)
  let recurEl = null;
  if (task.recurrence) {
    recurEl = document.createElement("span");
    recurEl.className = "task__recur";
    recurEl.title = `Repeats ${task.recurrence}`;
    recurEl.innerHTML = `<i class="fas fa-arrows-rotate" aria-hidden="true"></i>`;
    recurEl.appendChild(
      document.createTextNode(" " + recurLabel(task.recurrence)),
    );
  }

  const slot = document.createElement("div");
  slot.className = "task__slot";

  if (task.dueAt) {
    const due = document.createElement("span");
    due.className = "task__due " + dueClass(task.dueAt);
    const iconCls =
      diffDays(task.dueAt) < 0 ? "fa-triangle-exclamation" : "fa-calendar-day";
    due.innerHTML = `<i class="fas ${iconCls}" aria-hidden="true"></i>`;
    due.appendChild(document.createTextNode(" " + formatDue(task.dueAt)));
    slot.appendChild(due);
  }

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
  slot.appendChild(actions);

  li.append(check, text);
  if (recurEl) li.appendChild(recurEl);
  li.appendChild(slot);
  return li;
}

/* Update an existing row in place */
function updateTaskRow(li, task, tokens) {
  li.classList.toggle("checked", task.done);
  li.setAttribute("aria-checked", String(task.done));
  li.classList.toggle("is-selected", task.id === selectedId);

  const textEl = li.querySelector(".task__text");
  if (textEl) {
    textEl.innerHTML = "";
    textEl.appendChild(highlight(task.text, tokens));
  }

  // Recurrence chip
  const existingRecur = li.querySelector(".task__recur");
  if (task.recurrence) {
    if (existingRecur) {
      existingRecur.title = `Repeats ${task.recurrence}`;
      existingRecur.innerHTML = `<i class="fas fa-arrows-rotate" aria-hidden="true"></i>`;
      existingRecur.appendChild(
        document.createTextNode(" " + recurLabel(task.recurrence)),
      );
    } else {
      const recur = document.createElement("span");
      recur.className = "task__recur";
      recur.title = `Repeats ${task.recurrence}`;
      recur.innerHTML = `<i class="fas fa-arrows-rotate" aria-hidden="true"></i>`;
      recur.appendChild(
        document.createTextNode(" " + recurLabel(task.recurrence)),
      );
      // Insert before the slot so it sits in the same place as
      // buildTaskRow.
      const slotEl = li.querySelector(".task__slot");
      li.insertBefore(recur, slotEl);
    }
  } else if (existingRecur) {
    existingRecur.remove();
  }

  // Due chip
  const slot = li.querySelector(".task__slot");
  if (slot) {
    const existingChip = slot.querySelector(".task__due");
    if (task.dueAt) {
      if (existingChip) {
        existingChip.className = "task__due " + dueClass(task.dueAt);
        const iconCls =
          diffDays(task.dueAt) < 0
            ? "fa-triangle-exclamation"
            : "fa-calendar-day";
        existingChip.innerHTML = `<i class="fas ${iconCls}" aria-hidden="true"></i>`;
        existingChip.appendChild(
          document.createTextNode(" " + formatDue(task.dueAt)),
        );
      } else {
        const due = document.createElement("span");
        due.className = "task__due " + dueClass(task.dueAt);
        const iconCls =
          diffDays(task.dueAt) < 0
            ? "fa-triangle-exclamation"
            : "fa-calendar-day";
        due.innerHTML = `<i class="fas ${iconCls}" aria-hidden="true"></i>`;
        due.appendChild(document.createTextNode(" " + formatDue(task.dueAt)));
        slot.insertBefore(due, slot.firstChild);
      }
    } else if (existingChip) {
      existingChip.remove();
    }
  }

  const dateBtn = li.querySelector('[data-action="date"]');
  if (dateBtn) {
    dateBtn.setAttribute(
      "aria-label",
      task.dueAt ? "Change due date" : "Set due date",
    );
  }
}

/* Rendering (keyed reconciliation) */
function render() {
  const { list, tokens } = visibleTasks();

  const desiredIds = new Set(list.map((t) => t.id));

  [...listEl.children].forEach((li) => {
    if (!desiredIds.has(li.dataset.id)) li.remove();
  });

  list.forEach((task, index) => {
    let li = listEl.querySelector(`.task[data-id="${task.id}"]`);

    if (li) {
      if (canReorder() && !li.querySelector(".task__grip")) {
        const fresh = buildTaskRow(task, tokens);
        li.replaceWith(fresh);
        li = fresh;
      } else {
        updateTaskRow(li, task, tokens);
      }
    } else {
      li = buildTaskRow(task, tokens);
      if (!leavingIds.has(task.id)) {
        li.classList.add("task--enter");
        li.addEventListener(
          "animationend",
          () => li.classList.remove("task--enter"),
          { once: true },
        );
      }
    }

    const currentAtIndex = listEl.children[index];
    if (currentAtIndex !== li) listEl.insertBefore(li, currentAtIndex || null);
  });

  updateProgress();
  updateEmptyState(list.length);

  if (searchBar) searchBar.classList.toggle("has-query", query.length > 0);

  syncSortable();
}

function updateProgress() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  progressFill.style.strokeDasharray = `${pct}, 100`;
  progressLabel.textContent = pct + "%";
}

function updateEmptyState(listLength) {
  emptyEl.hidden = listLength > 0;
  if (listLength > 0) return;
  const total = tasks.length;
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

/* Row leave animation */
function leaveRow(li, onDone) {
  li.getAnimations().forEach((a) => a.cancel());
  li.classList.remove("task--enter");
  li.classList.add("is-leaving");
  li.setAttribute("aria-checked", "true");

  const rect = li.getBoundingClientRect();
  const cs = getComputedStyle(li);
  const h = rect.height;
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const borderBottom = parseFloat(cs.borderBottomWidth) || 0;

  const anim = li.animate(
    [
      {
        opacity: 1,
        transform: "translateX(0)",
        height: `${h}px`,
        marginBottom: "0px",
        paddingTop: `${padTop}px`,
        paddingBottom: `${padBottom}px`,
        borderTopWidth: `${borderTop}px`,
        borderBottomWidth: `${borderBottom}px`,
        offset: 0,
      },
      {
        opacity: 0,
        transform: "translateX(28px)",
        height: `${h}px`,
        marginBottom: "0px",
        paddingTop: `${padTop}px`,
        paddingBottom: `${padBottom}px`,
        borderTopWidth: `${borderTop}px`,
        borderBottomWidth: `${borderBottom}px`,
        offset: 0.4,
      },
      {
        opacity: 0,
        transform: "translateX(28px)",
        height: "0px",
        marginBottom: "-8px",
        paddingTop: "0px",
        paddingBottom: "0px",
        borderTopWidth: "0px",
        borderBottomWidth: "0px",
        offset: 1,
      },
    ],
    {
      duration: LEAVE_DURATION,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards",
    },
  );

  anim.onfinish = () => {
    anim.cancel();
    onDone();
  };
}

/* DRAG & DROP — Sortable.js */

function syncSortable() {
  const shouldBeActive = canReorder() && typeof Sortable !== "undefined";

  if (shouldBeActive && !sortableInstance) {
    sortableInstance = new Sortable(listEl, {
      animation: 180,
      handle: ".task__grip",
      draggable: ".task",
      ghostClass: "task--ghost",
      dragClass: "task--dragging",
      filter: ".task.is-editing, .task.is-leaving",
      preventOnFilter: false,
      forceAutoScrollFallback: true,
      scroll: listEl,
      scrollSensitivity: 60,
      scrollSpeed: 14,
      bubbleScroll: false,
      onEnd: () => {
        syncOrderFromDom();
      },
    });
  } else if (!shouldBeActive && sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
}

function syncOrderFromDom() {
  const domIds = [...listEl.querySelectorAll(".task")].map(
    (li) => li.dataset.id,
  );

  domIds.forEach((id, i) => {
    const t = tasks.find((x) => x.id === id);
    if (t) t.order = i;
  });

  const visibleIds = new Set(domIds);
  let tail = domIds.length;
  tasks.forEach((t) => {
    if (!visibleIds.has(t.id)) t.order = tail++;
  });

  save();
  render();
}

/* Actions */
function addTask() {
  const text = inputBox.value.trim();
  if (!text) {
    notify("Please enter a task", "error");
    inputBox.focus();
    return;
  }
  const minOrder = tasks.reduce(
    (min, t) => (t.order < min ? t.order : min),
    tasks.length,
  );
  tasks.unshift({
    id: uid(),
    text,
    done: false,
    completedAt: null,
    dueAt: null,
    order: minOrder - 1,
    recurrence: null,
  });
  inputBox.value = "";
  save();
  render();
  notify("Task added");
}

function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  // Recurring task: advance to next occurrence
  if (task.recurrence && !task.done) {
    const li = listEl.querySelector(`.task[data-id="${id}"]`);
    if (!li) {
      toggleRecurring(task);
      return;
    }

    // Flash the checkbox as done, then reset with the new date.
    li.classList.add("checked");
    li.setAttribute("aria-checked", "true");

    setTimeout(() => {
      toggleRecurring(task);
      // If the filter is "today" and the new date is beyond today,
      // the render() inside toggleRecurring will remove the row.
    }, RECUR_FLASH);
    return;
  }

  // Normal task: existing behavior
  task.done = !task.done;
  task.completedAt = task.done ? Date.now() : null;
  save();

  const leavesView = task.done && (filter === "today" || filter === "active");

  if (leavesView) {
    const li = listEl.querySelector(`.task[data-id="${id}"]`);
    if (!li) {
      render();
      return;
    }
    li.classList.add("checked");
    li.setAttribute("aria-checked", "true");
    updateProgress();
    leavingIds.add(id);
    requestAnimationFrame(() => {
      leaveRow(li, () => {
        leavingIds.delete(id);
        li.remove();
        updateProgress();
        updateEmptyState(listEl.children.length);
      });
    });
  } else {
    const li = listEl.querySelector(`.task[data-id="${id}"]`);
    if (li) {
      li.classList.toggle("checked", task.done);
      li.setAttribute("aria-checked", String(task.done));
      updateProgress();
    }
  }
}

/* Advance a recurring task to its next occurrence. Called after the brief done-flash. */
function toggleRecurring(task) {
  // Compute the next due date relative to the current due date.
  task.dueAt = nextOccurrence(task.dueAt, task.recurrence);
  // Reset done state — the task lives on.
  task.done = false;
  task.completedAt = null;
  save();

  // Notify the user with a small toast.
  notify(
    `Next ${recurLabel(task.recurrence).toLowerCase()} · ${formatDue(task.dueAt)}`,
    "success",
  );

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

function setDueDate(id, iso) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.dueAt = iso || null;
  // Clearing the date also clears the recurrence — can't recur
  // without an anchor.
  if (!iso && task.recurrence) {
    task.recurrence = null;
  }
  save();
  selectedId = null;
  render();
  notify(iso ? "Due date set" : "Due date cleared");
}

function setRecurrence(id, recurrence) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  // Must have a due date to recur.
  if (recurrence && !task.dueAt) {
    task.dueAt = todayISO();
  }
  task.recurrence = recurrence || null;
  save();
  render();
  notify(recurrence ? `Repeats ${recurrence}` : "Repeat cleared");
}

/* Inline edit */
function startEdit(li) {
  if (!li || li.classList.contains("is-editing")) return;
  if (li.classList.contains("is-leaving")) return;
  const id = li.dataset.id;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const textEl = li.querySelector(".task__text");
  const slot = li.querySelector(".task__slot");
  if (!textEl) return;

  li.classList.add("is-editing");

  const input = document.createElement("textarea");
  input.className = "task__edit";
  input.value = task.text;
  input.maxLength = MAX_LENGTH;
  input.setAttribute("aria-label", "Edit task");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.rows = 1;

  textEl.replaceWith(input);
  if (slot) slot.hidden = true;

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  }
  input.addEventListener("input", autoGrow);
  autoGrow();

  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);

  let finished = false;

  function finish(shouldPersist) {
    if (finished) return;
    finished = true;

    input.blur();
    selectedId = null;

    if (shouldPersist) {
      const trimmed = input.value.trim();
      const t = tasks.find((x) => x.id === id);
      if (t && trimmed && trimmed !== t.text) {
        t.text = trimmed;
        save();
        notify("Task updated");
      }
    }

    li.classList.remove("is-editing");
    const current = tasks.find((x) => x.id === id);
    if (current) {
      const fresh = buildTaskRow(current, tokenize(query));
      li.replaceWith(fresh);
    } else {
      render();
    }
    updateProgress();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener("blur", () => setTimeout(() => finish(false), 0));
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
  if (leavingIds.size) {
    listEl.querySelectorAll(".task.is-leaving").forEach((li) => {
      li.getAnimations().forEach((a) => a.cancel());
      li.remove();
    });
    leavingIds.clear();
  }
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

/* Date popover (with recurrence picker) */
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

  const commitAndClose = (iso) => {
    setDueDate(taskId, iso);
    closeDatePopover();
  };

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

  pop.appendChild(mkBtn("fa-sun", "Today", () => commitAndClose(today)));
  pop.appendChild(
    mkBtn("fa-arrow-right", "Tomorrow", () =>
      commitAndClose(addDaysISO(today, 1)),
    ),
  );
  pop.appendChild(
    mkBtn("fa-forward", "Next week", () =>
      commitAndClose(addDaysISO(today, 7)),
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
  dateInput.addEventListener("click", (e) => e.stopPropagation());

  let typedSinceOpen = false;

  dateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const v = dateInput.value;
      if (v === "") commitAndClose(null);
      else if (isValidISODate(v)) commitAndClose(v);
      else {
        notify("Incomplete date", "error");
        dateInput.focus();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeDatePopover();
      return;
    }
    typedSinceOpen = true;
  });

  dateInput.addEventListener("input", () => {
    typedSinceOpen = true;
  });

  dateInput.addEventListener("change", () => {
    if (typedSinceOpen) return;
    const v = dateInput.value;
    if (v && isValidISODate(v)) commitAndClose(v);
  });

  customWrap.appendChild(dateInput);
  pop.appendChild(customWrap);

  const hint = document.createElement("p");
  hint.className = "date-popover__hint";
  hint.textContent = "Press Enter to save";
  customWrap.appendChild(hint);

  // Recurrence section 
  const dRecur = document.createElement("div");
  dRecur.className = "date-popover__divider";
  pop.appendChild(dRecur);

  const recurLabelEl = document.createElement("p");
  recurLabelEl.className = "date-popover__label";
  recurLabelEl.textContent = "Repeat";
  pop.appendChild(recurLabelEl);

  const recurRow = document.createElement("div");
  recurRow.className = "date-popover__recur";

  const mkRecurBtn = (value, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "date-popover__recur-btn";
    if (task.recurrence === value) b.classList.add("is-active");
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      // Commits the recurrence and closes the popover.
      setRecurrence(taskId, value === task.recurrence ? null : value);
      closeDatePopover();
    });
    return b;
  };

  recurRow.appendChild(mkRecurBtn("daily", "Daily"));
  recurRow.appendChild(mkRecurBtn("weekly", "Weekly"));
  recurRow.appendChild(mkRecurBtn("monthly", "Monthly"));
  recurRow.appendChild(mkRecurBtn(null, "None"));
  pop.appendChild(recurRow);

  if (task.dueAt) {
    const d2 = document.createElement("div");
    d2.className = "date-popover__divider";
    pop.appendChild(d2);
    pop.appendChild(
      mkBtn("fa-trash-can", "Clear date", () => commitAndClose(null), true),
    );
  }

  document.body.appendChild(pop);
  openPopover = { el: pop, taskId };

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

/* List interaction */
composer.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask();
});

listEl.addEventListener("click", (e) => {
  const li = e.target.closest(".task");
  if (!li) return;
  if (li.classList.contains("is-editing")) return;
  if (li.classList.contains("is-leaving")) return;
  if (e.target.closest("[data-action]")) return;
  if (e.target.closest(".task__grip")) return;

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

/* Shortcuts overlay triggers */
shortcutsBtn?.addEventListener("click", toggleShortcuts);
shortcutsEl?.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeShortcuts();
});

/* Click outside */
document.addEventListener("click", (e) => {
  if (openPopover && !e.target.closest(".date-popover")) {
    closeDatePopover();
  }

  if (e.target.closest(".task")) return;

  const insideSearch = e.target.closest(".search");
  const onSearchBtn = e.target.closest("#search-btn");
  if (!insideSearch && !onSearchBtn) {
    if (searchBar && !searchBar.hidden && !query) closeSearch();
  }

  if (e.target.closest("#shortcuts")) return;
  if (e.target.closest("#shortcuts-btn")) return;

  if (selectedId) selectTask(null);
});

/* Keyboard */
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
