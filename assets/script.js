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
const searchTagBtn = document.getElementById("search-tag-btn");
const searchTagPill = document.getElementById("search-tag-pill");
const searchTagPillLabel = document.getElementById("search-tag-pill-label");

const STORAGE_KEY = "todos";
const TAGS_KEY = "tags";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const UNDO_WINDOW = 5000;
const LEAVE_DURATION = 550;
const MAX_LENGTH = 100;
const MAX_TAG_LENGTH = 20;
const RECUR_FLASH = 700;

const STARTER_TAGS = [
  { id: "work", label: "Work", color: "magenta" },
  { id: "personal", label: "Personal", color: "sage" },
  { id: "home", label: "Home", color: "rose" },
  { id: "health", label: "Health", color: "violet" },
  { id: "shopping", label: "Shopping", color: "amber" },
  { id: "learning", label: "Learning", color: "cyan" },
  { id: "ideas", label: "Ideas", color: "neutral" },
];

const CUSTOM_TAG_COLORS = [
  "magenta",
  "sage",
  "rose",
  "violet",
  "amber",
  "cyan",
];

/* State */
let tasks = [];
let customTags = [];
let filter = "all";
let activeTag = null;
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
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

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
  localStorage.setItem(TAGS_KEY, JSON.stringify(customTags));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch {
    tasks = [];
  }
  try {
    const rawTags = localStorage.getItem(TAGS_KEY);
    customTags = rawTags ? JSON.parse(rawTags) : [];
  } catch {
    customTags = [];
  }
  const now = Date.now();
  tasks = tasks.filter((t) => !t.completedAt || now - t.completedAt < WEEK);
  tasks.forEach((t, i) => {
    if (!("dueAt" in t)) t.dueAt = null;
    if (typeof t.order !== "number") t.order = i;
    if (!("recurrence" in t)) t.recurrence = null;
    if (!("tag" in t)) t.tag = null;
  });
}

function allTags() {
  return [...STARTER_TAGS, ...customTags];
}

function getTag(id) {
  if (!id) return null;
  return allTags().find((t) => t.id === id) || null;
}

function nextCustomColor() {
  return CUSTOM_TAG_COLORS[customTags.length % CUSTOM_TAG_COLORS.length];
}

function createCustomTag(label) {
  const trimmed = label.trim().slice(0, MAX_TAG_LENGTH);
  if (!trimmed) return null;
  const exists = allTags().find(
    (t) => t.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) return exists;
  const tag = {
    id: "c_" + uid(),
    label: trimmed,
    color: nextCustomColor(),
  };
  customTags.push(tag);
  save();
  return tag;
}

function deleteCustomTag(id) {
  customTags = customTags.filter((t) => t.id !== id);
  tasks.forEach((t) => {
    if (t.tag === id) t.tag = null;
  });
  if (activeTag === id) activeTag = null;
  save();
  render();
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

  if (activeTag) {
    list = list.filter((t) => t.tag === activeTag);
  }

  if (tokens.length) list = list.filter((t) => matchesQuery(t, tokens));

  return { list, tokens };
}

function canReorder() {
  return filter === "all" && !query && !activeTag;
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

  // Overlay wrapper (meta + actions)
  const overlay = document.createElement("div");
  overlay.className = "task__overlay";

  // Meta cluster: tag + recurrence + due
  const meta = document.createElement("div");
  meta.className = "task__meta";

  const tag = getTag(task.tag);
  if (tag) {
    const tagEl = document.createElement("span");
    tagEl.className = "task__tag";
    tagEl.dataset.color = tag.color;
    tagEl.textContent = tag.label;
    tagEl.title = tag.label;
    meta.appendChild(tagEl);
  }

  if (task.recurrence) {
    const recurEl = document.createElement("span");
    recurEl.className = "task__recur";
    recurEl.title = `Repeats ${task.recurrence}`;
    recurEl.innerHTML = `<i class="fas fa-arrows-rotate" aria-hidden="true"></i>`;
    recurEl.appendChild(
      document.createTextNode(" " + recurLabel(task.recurrence)),
    );
    meta.appendChild(recurEl);
  }

  if (task.dueAt) {
    const due = document.createElement("span");
    due.className = "task__due " + dueClass(task.dueAt);
    const iconCls =
      diffDays(task.dueAt) < 0 ? "fa-triangle-exclamation" : "fa-calendar-day";
    due.innerHTML = `<i class="fas ${iconCls}" aria-hidden="true"></i>`;
    due.appendChild(document.createTextNode(" " + formatDue(task.dueAt)));
    meta.appendChild(due);
  }

  if (meta.children.length) overlay.appendChild(meta);

  // Action slot
  const slot = document.createElement("div");
  slot.className = "task__slot";

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

  const tagBtn = document.createElement("button");
  tagBtn.type = "button";
  tagBtn.className = "task__action task__tag-btn";
  tagBtn.dataset.action = "tag";
  tagBtn.setAttribute("aria-label", task.tag ? "Change tag" : "Set tag");
  tagBtn.title = "Set tag";
  tagBtn.innerHTML = '<i class="fas fa-tag" aria-hidden="true"></i>';
  tagBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openTagPopover(tagBtn, task.id);
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

  actions.append(dateBtn, tagBtn, edit, del);
  slot.appendChild(actions);
  overlay.appendChild(slot);

  li.append(check, text);
  li.appendChild(overlay);
  return li;
}

function updateTaskRow(li, task, tokens) {
  li.classList.toggle("checked", task.done);
  li.setAttribute("aria-checked", String(task.done));
  li.classList.toggle("is-selected", task.id === selectedId);

  // Text
  const textEl = li.querySelector(".task__text");
  if (textEl) {
    textEl.innerHTML = "";
    textEl.appendChild(highlight(task.text, tokens));
  }

  // Overlay wrapper
  let overlay = li.querySelector(".task__overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "task__overlay";
    li.appendChild(overlay);
  }

  // Meta cluster inside overlay
  let meta = overlay.querySelector(".task__meta");
  if (!meta) {
    meta = document.createElement("div");
    meta.className = "task__meta";
    const slotRef = overlay.querySelector(".task__slot");
    overlay.insertBefore(meta, slotRef);
  }

  // Tag
  const existingTag = meta.querySelector(".task__tag");
  const tag = getTag(task.tag);
  if (tag) {
    if (existingTag) {
      existingTag.dataset.color = tag.color;
      existingTag.textContent = tag.label;
      existingTag.title = tag.label;
    } else {
      const el = document.createElement("span");
      el.className = "task__tag";
      el.dataset.color = tag.color;
      el.textContent = tag.label;
      el.title = tag.label;
      meta.insertBefore(el, meta.firstChild);
    }
  } else if (existingTag) {
    existingTag.remove();
  }

  // Recurrence
  const existingRecur = meta.querySelector(".task__recur");
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
      const tagRef = meta.querySelector(".task__tag");
      if (tagRef && tagRef.nextSibling) {
        meta.insertBefore(recur, tagRef.nextSibling);
      } else {
        meta.appendChild(recur);
      }
    }
  } else if (existingRecur) {
    existingRecur.remove();
  }

  // Due chip
  const existingDue = meta.querySelector(".task__due");
  if (task.dueAt) {
    if (existingDue) {
      existingDue.className = "task__due " + dueClass(task.dueAt);
      const iconCls =
        diffDays(task.dueAt) < 0
          ? "fa-triangle-exclamation"
          : "fa-calendar-day";
      existingDue.innerHTML = `<i class="fas ${iconCls}" aria-hidden="true"></i>`;
      existingDue.appendChild(
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
      meta.appendChild(due);
    }
  } else if (existingDue) {
    existingDue.remove();
  }

  // If the meta cluster ended up empty, remove it so it doesn't take space
  if (meta.children.length === 0) meta.remove();

  // Button aria labels
  const dateBtn = li.querySelector('[data-action="date"]');
  if (dateBtn) {
    dateBtn.setAttribute(
      "aria-label",
      task.dueAt ? "Change due date" : "Set due date",
    );
  }

  const tagBtn = li.querySelector('[data-action="tag"]');
  if (tagBtn) {
    tagBtn.setAttribute("aria-label", task.tag ? "Change tag" : "Set tag");
  }
}

/* Rendering */
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
  renderSearchTagPill();

  if (searchBar) {
    searchBar.classList.toggle("has-query", query.length > 0);
    if (activeTag) searchBar.hidden = false;
  }

  syncSortable();
}

function renderSearchTagPill() {
  if (!searchTagPill) return;
  const tag = getTag(activeTag);
  if (tag) {
    searchTagPill.hidden = false;
    searchTagPill.dataset.color = tag.color;
    searchTagPillLabel.textContent = tag.label;
  } else {
    searchTagPill.hidden = true;
    searchTagPill.removeAttribute("data-color");
    searchTagPillLabel.textContent = "";
  }
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
  if (activeTag) {
    const tag = getTag(activeTag);
    emptyTitle.textContent = `No ${tag?.label || ""} tasks`;
    emptyText.textContent = "Pick another tag or clear the filter.";
  } else if (query) {
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

/* DRAG & DROP */
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
    tag: null,
  });
  inputBox.value = "";
  save();
  render();
  notify("Task added");
}

function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  if (task.recurrence && !task.done) {
    const li = listEl.querySelector(`.task[data-id="${id}"]`);
    if (!li) {
      toggleRecurring(task);
      return;
    }
    li.classList.add("checked");
    li.setAttribute("aria-checked", "true");
    setTimeout(() => {
      toggleRecurring(task);
    }, RECUR_FLASH);
    return;
  }

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

function toggleRecurring(task) {
  task.dueAt = nextOccurrence(task.dueAt, task.recurrence);
  task.done = false;
  task.completedAt = null;
  save();
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
  if (!iso && task.recurrence) task.recurrence = null;
  save();
  selectedId = null;
  render();
  notify(iso ? "Due date set" : "Due date cleared");
}

function setRecurrence(id, recurrence) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  if (recurrence && !task.dueAt) task.dueAt = todayISO();
  task.recurrence = recurrence || null;
  save();
  render();
  notify(recurrence ? `Repeats ${recurrence}` : "Repeat cleared");
}

function setTag(id, tagId) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.tag = tagId || null;
  save();
  render();
  notify(tagId ? "Tag set" : "Tag cleared");
}

/* Inline edit */
function startEdit(li) {
  if (!li || li.classList.contains("is-editing")) return;
  if (li.classList.contains("is-leaving")) return;
  const id = li.dataset.id;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const textEl = li.querySelector(".task__text");
  const overlay = li.querySelector(".task__overlay");
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
  if (overlay) overlay.hidden = true;

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

/* Popover infrastructure */
function closePopover() {
  if (openPopover?.el) openPopover.el.remove();
  openPopover = null;
}

/* Shared positioning helper */
function positionPopover(pop, anchorEl) {
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
}

/* Date popover */
function openDatePopover(anchorEl, taskId) {
  closePopover();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const pop = document.createElement("div");
  pop.className = "date-popover";
  pop.setAttribute("role", "menu");

  let workingDate = task.dueAt || "";
  let workingRecur = task.recurrence || null;

  const commitAndClose = () => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) {
      closePopover();
      return;
    }
    t.dueAt = workingDate || null;
    t.recurrence = workingDate ? workingRecur : null;
    save();
    selectedId = null;
    render();
    notify("Date updated");
    closePopover();
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
    });
    return b;
  };

  const today = todayISO();

  pop.appendChild(
    mkBtn("fa-sun", "Today", () => {
      workingDate = today;
      dateInput.value = today;
    }),
  );
  pop.appendChild(
    mkBtn("fa-arrow-right", "Tomorrow", () => {
      workingDate = addDaysISO(today, 1);
      dateInput.value = workingDate;
    }),
  );
  pop.appendChild(
    mkBtn("fa-forward", "Next week", () => {
      workingDate = addDaysISO(today, 7);
      dateInput.value = workingDate;
    }),
  );

  const d1 = document.createElement("div");
  d1.className = "date-popover__divider";
  pop.appendChild(d1);

  const customWrap = document.createElement("div");
  customWrap.className = "date-popover__custom";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = workingDate;
  dateInput.addEventListener("click", (e) => e.stopPropagation());

  let typedSinceOpen = false;

  dateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const v = dateInput.value;
      if (v === "") {
        workingDate = "";
        commitAndClose();
      } else if (isValidISODate(v)) {
        workingDate = v;
        commitAndClose();
      } else {
        notify("Incomplete date", "error");
        dateInput.focus();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePopover();
      return;
    }
    typedSinceOpen = true;
  });

  dateInput.addEventListener("input", () => {
    typedSinceOpen = true;
    workingDate = dateInput.value;
  });

  dateInput.addEventListener("change", () => {
    if (typedSinceOpen) return;
    const v = dateInput.value;
    if (v && isValidISODate(v)) workingDate = v;
  });

  customWrap.appendChild(dateInput);
  pop.appendChild(customWrap);

  const dRecur = document.createElement("div");
  dRecur.className = "date-popover__divider";
  pop.appendChild(dRecur);

  const recurLabelEl = document.createElement("p");
  recurLabelEl.className = "date-popover__label";
  recurLabelEl.textContent = "Repeat";
  pop.appendChild(recurLabelEl);

  const recurRow = document.createElement("div");
  recurRow.className = "date-popover__recur";
  const recurButtons = [];

  const mkRecurBtn = (value, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "date-popover__recur-btn";
    if (workingRecur === value) b.classList.add("is-active");
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      workingRecur = workingRecur === value ? null : value;
      recurButtons.forEach((btn) =>
        btn.classList.toggle("is-active", btn.dataset.value === workingRecur),
      );
    });
    b.dataset.value = value || "none";
    recurButtons.push(b);
    return b;
  };

  recurRow.appendChild(mkRecurBtn("daily", "Daily"));
  recurRow.appendChild(mkRecurBtn("weekly", "Weekly"));
  recurRow.appendChild(mkRecurBtn("monthly", "Monthly"));
  recurRow.appendChild(mkRecurBtn(null, "None"));
  pop.appendChild(recurRow);

  const footer = document.createElement("div");
  footer.className = "date-popover__footer";

  if (task.dueAt) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className =
      "date-popover__footer-btn date-popover__footer-btn--danger";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      workingDate = "";
      workingRecur = null;
      commitAndClose();
    });
    footer.appendChild(clearBtn);
  } else {
    footer.appendChild(document.createElement("span"));
  }

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className =
    "date-popover__footer-btn date-popover__footer-btn--primary";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (workingRecur && !workingDate) workingDate = todayISO();
    commitAndClose();
  });
  footer.appendChild(doneBtn);

  pop.appendChild(footer);

  document.body.appendChild(pop);
  openPopover = { el: pop, taskId };

  positionPopover(pop, anchorEl);
  requestAnimationFrame(() => dateInput.focus());
}

/* Tag popover (assign a tag to a task) */
function openTagPopover(anchorEl, taskId) {
  closePopover();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const pop = document.createElement("div");
  pop.className = "tag-popover";
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", "Tag this task");

  const list = document.createElement("div");
  list.className = "tag-popover__list";
  pop.appendChild(list);

  const noneRow = document.createElement("button");
  noneRow.type = "button";
  noneRow.className = "tag-popover__row tag-popover__row--none";
  if (!task.tag) noneRow.classList.add("is-active");
  noneRow.setAttribute("role", "menuitemradio");
  noneRow.setAttribute("aria-checked", String(!task.tag));
  noneRow.innerHTML = `
    <span class="tag-popover__check" aria-hidden="true">
      <i class="fas fa-check"></i>
    </span>
    <span class="tag-popover__label">No tag</span>
  `;
  noneRow.addEventListener("click", (e) => {
    e.stopPropagation();
    setTag(taskId, null);
    closePopover();
  });
  list.appendChild(noneRow);

  const divider = document.createElement("div");
  divider.className = "tag-popover__divider";
  list.appendChild(divider);

  const renderTagRows = () => {
    list.querySelectorAll(".tag-popover__row--tag").forEach((n) => n.remove());

    allTags().forEach((t) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "tag-popover__row tag-popover__row--tag";
      if (task.tag === t.id) row.classList.add("is-active");
      row.setAttribute("role", "menuitemradio");
      row.setAttribute("aria-checked", String(task.tag === t.id));
      row.dataset.color = t.color;
      row.title = t.label;

      row.innerHTML = `
        <span class="tag-popover__check" aria-hidden="true">
          <i class="fas fa-check"></i>
        </span>
        <span class="tag-popover__dot" aria-hidden="true"></span>
        <span class="tag-popover__label">${t.label}</span>
      `;

      if (t.id.startsWith("c_")) {
        const del = document.createElement("span");
        del.className = "tag-popover__delete";
        del.setAttribute("role", "button");
        del.setAttribute("tabindex", "0");
        del.setAttribute("aria-label", `Delete tag ${t.label}`);
        del.title = "Delete tag";
        del.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteCustomTag(t.id);
          renderTagRows();
        });
        del.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            deleteCustomTag(t.id);
            renderTagRows();
          }
        });
        row.appendChild(del);
      }

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        setTag(taskId, task.tag === t.id ? null : t.id);
        closePopover();
      });

      list.insertBefore(row, divider.nextSibling);
    });
  };

  renderTagRows();

  const newSection = document.createElement("div");
  newSection.className = "tag-popover__new";
  pop.appendChild(newSection);

  const newRow = document.createElement("button");
  newRow.type = "button";
  newRow.className = "tag-popover__row tag-popover__row--new";
  newRow.innerHTML = `
    <span class="tag-popover__plus" aria-hidden="true">
      <i class="fas fa-plus"></i>
    </span>
    <span class="tag-popover__label">New tag</span>
  `;
  newSection.appendChild(newRow);

  newRow.addEventListener("click", (e) => {
    e.stopPropagation();
    newSection.innerHTML = "";

    const editor = document.createElement("div");
    editor.className = "tag-popover__editor";

    const icon = document.createElement("i");
    icon.className = "fas fa-tag tag-popover__editor-icon";
    icon.setAttribute("aria-hidden", "true");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tag-popover__input";
    input.placeholder = "Tag name…";
    input.maxLength = MAX_TAG_LENGTH;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "New tag name");

    // Character counter — appears as the user approaches the limit.
    const counter = document.createElement("span");
    counter.className = "tag-popover__counter";

    const actions = document.createElement("div");
    actions.className = "tag-popover__editor-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "tag-popover__editor-btn";
    cancel.setAttribute("aria-label", "Cancel");
    cancel.title = "Cancel (Esc)";
    cancel.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className =
      "tag-popover__editor-btn tag-popover__editor-btn--primary";
    confirm.setAttribute("aria-label", "Create tag");
    confirm.title = "Create (Enter)";
    confirm.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';

    actions.append(cancel, confirm);

    editor.append(icon, input, actions);
    newSection.appendChild(editor);
    newSection.appendChild(counter);

    let finished = false;

    function collapse() {
      finished = true;
      newSection.innerHTML = "";
      newSection.appendChild(newRow);
    }

    function showHint(message) {
      counter.textContent = message;
      counter.classList.add("is-error");
      editor.classList.add("is-invalid");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      setTimeout(() => {
        editor.classList.remove("is-invalid");
        counter.classList.remove("is-error");
        updateCounter();
      }, 1600);
    }

    function commit() {
      if (finished) return;
      const value = input.value.trim();

      if (!value) {
        collapse();
        return;
      }

      const dupe = allTags().some(
        (t) => t.label.toLowerCase() === value.toLowerCase(),
      );
      if (dupe) {
        showHint("Already exists");
        return;
      }

      finished = true;
      const tag = createCustomTag(value);
      if (!tag) {
        finished = false;
        showHint("Couldn't create tag");
        return;
      }
      input.value = "";
      setTag(taskId, tag.id);
      closePopover();
    }

    const updateCounter = () => {
      counter.textContent = `${input.value.length}/${MAX_TAG_LENGTH}`;
      counter.classList.toggle(
        "is-near-limit",
        input.value.length >= MAX_TAG_LENGTH - 3,
      );
    };
    input.addEventListener("input", updateCounter);
    updateCounter();

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        commit();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        collapse();
      }
    });
    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!finished) commit();
      }, 130);
    });
    input.addEventListener("click", (ev) => ev.stopPropagation());

    cancel.addEventListener("mousedown", (ev) => ev.preventDefault());
    cancel.addEventListener("click", (ev) => {
      ev.stopPropagation();
      collapse();
    });

    confirm.addEventListener("mousedown", (ev) => ev.preventDefault());
    confirm.addEventListener("click", (ev) => {
      ev.stopPropagation();
      commit();
    });

    requestAnimationFrame(() => input.focus());
  });

  document.body.appendChild(pop);
  openPopover = { el: pop, taskId };

  positionPopover(pop, anchorEl);
}

/* Tag filter popover (filter the list) */
function openTagFilterPopover(anchorEl) {
  closePopover();

  const pop = document.createElement("div");
  pop.className = "tag-popover";
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", "Filter by tag");

  const list = document.createElement("div");
  list.className = "tag-popover__list";
  pop.appendChild(list);

  const allRow = document.createElement("button");
  allRow.type = "button";
  allRow.className = "tag-popover__row tag-popover__row--none";
  if (!activeTag) allRow.classList.add("is-active");
  allRow.setAttribute("role", "menuitemradio");
  allRow.setAttribute("aria-checked", String(!activeTag));
  allRow.innerHTML = `
    <span class="tag-popover__check" aria-hidden="true">
      <i class="fas fa-check"></i>
    </span>
    <span class="tag-popover__label">All tags</span>
  `;
  allRow.addEventListener("click", (e) => {
    e.stopPropagation();
    activeTag = null;
    selectedId = null;
    render();
    closePopover();
  });
  list.appendChild(allRow);

  const divider = document.createElement("div");
  divider.className = "tag-popover__divider";
  list.appendChild(divider);

  const usedTagIds = new Set(tasks.map((t) => t.tag).filter(Boolean));
  const visibleTags = allTags().filter((t) => usedTagIds.has(t.id));

  if (visibleTags.length === 0) {
    const empty = document.createElement("p");
    empty.className = "tag-popover__empty";
    empty.textContent = "No tags yet";
    list.appendChild(empty);
  } else {
    visibleTags.forEach((t) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "tag-popover__row tag-popover__row--tag";
      if (activeTag === t.id) row.classList.add("is-active");
      row.setAttribute("role", "menuitemradio");
      row.setAttribute("aria-checked", String(activeTag === t.id));
      row.dataset.color = t.color;
      row.title = t.label;
      row.innerHTML = `
        <span class="tag-popover__check" aria-hidden="true">
          <i class="fas fa-check"></i>
        </span>
        <span class="tag-popover__dot" aria-hidden="true"></span>
        <span class="tag-popover__label">${t.label}</span>
      `;
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        activeTag = activeTag === t.id ? null : t.id;
        selectedId = null;
        render();
        closePopover();
      });
      list.appendChild(row);
    });
  }

  document.body.appendChild(pop);
  openPopover = { el: pop };

  const rect = anchorEl.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.right - popRect.width;
  let top = rect.bottom + 8;

  if (left < 12) left = 12;
  if (left + popRect.width > vw - 12) left = vw - popRect.width - 12;
  if (top + popRect.height > vh - 12) top = rect.top - popRect.height - 8;
  if (top < 12) top = 12;

  pop.style.left = left + "px";
  pop.style.top = top + "px";
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
  if (e.target.closest(".task__tag")) return;
  if (e.target.closest(".task__overlay")) return;

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

/* Tag filter wiring */
searchTagBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  openTagFilterPopover(searchTagBtn);
});

searchTagPill?.addEventListener("click", (e) => {
  e.stopPropagation();
  activeTag = null;
  selectedId = null;
  render();
});

/* Shortcuts overlay triggers */
shortcutsBtn?.addEventListener("click", toggleShortcuts);
shortcutsEl?.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeShortcuts();
});

/* Click outside */
document.addEventListener("click", (e) => {
  if (openPopover && !e.target.closest(".tag-popover, .date-popover")) {
    closePopover();
  }

  if (e.target.closest(".task")) return;

  const insideSearch = e.target.closest(".search");
  const onSearchBtn = e.target.closest("#search-btn");
  if (!insideSearch && !onSearchBtn) {
    if (searchBar && !searchBar.hidden && !query && !activeTag) closeSearch();
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
      closePopover();
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
