const els = {
  todayLabel: document.querySelector("#todayLabel"),
  timeLabel: document.querySelector("#timeLabel"),
  searchWrap: document.querySelector("#searchWrap"),
  searchToggleBtn: document.querySelector("#searchToggleBtn"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskDueDateShell: document.querySelector("#taskDueDateShell"),
  taskDueDateLabel: document.querySelector("#taskDueDateLabel"),
  taskDueDate: document.querySelector("#taskDueDate"),
  searchInput: document.querySelector("#searchInput"),
  taskList: document.querySelector("#taskList"),
  completedList: document.querySelector("#completedList"),
  completedCount: document.querySelector("#completedCount"),
  toggleCompletedBtn: document.querySelector("#toggleCompletedBtn"),
  taskCardTemplate: document.querySelector("#taskCardTemplate"),
};

const state = {
  tasks: [],
  todayKey: "",
  showCompleted: false,
  search: "",
  editingTaskId: null,
  menuTaskId: null,
};

init();

async function init() {
  bindEvents();
  renderDateTime();
  window.setInterval(renderDateTime, 1000);

  try {
    const bootstrap = await api("/api/bootstrap");
    state.tasks = Array.isArray(bootstrap.data.tasks) ? bootstrap.data.tasks : [];
    state.todayKey = getEasternDateKey() || bootstrap.todayKey;
    syncComposerDate();
    render();
  } catch (error) {
    console.error(error);
    renderLoading();
  }
}

function bindEvents() {
  els.taskForm.addEventListener("submit", handleTaskSubmit);
  els.taskDueDate.addEventListener("input", syncComposerDate);
  els.taskDueDate.addEventListener("change", syncComposerDate);
  els.searchInput.addEventListener("input", handleSearch);
  els.searchInput.addEventListener("blur", handleSearchBlur);
  els.searchToggleBtn.addEventListener("click", toggleSearch);
  els.toggleCompletedBtn.addEventListener("click", toggleCompleted);
  document.addEventListener("click", handleDateShellClick);
  document.addEventListener("click", handleTaskAction);
  document.addEventListener("input", handleDynamicDateInput);
  document.addEventListener("submit", handleTaskFormActions);
  document.addEventListener("keydown", handleShortcuts);
}

function renderDateTime() {
  const now = new Date();
  const nextTodayKey = getEasternDateKey();
  if (nextTodayKey && nextTodayKey !== state.todayKey) {
    state.todayKey = nextTodayKey;
    render();
  }

  els.todayLabel.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);

  els.timeLabel.textContent = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(now);
}

function renderLoading() {
  const loading = '<div class="loading-state"><p>Failed to load.</p></div>';
  els.taskList.innerHTML = loading;
  els.completedList.innerHTML = loading;
}

function render() {
  const visibleTasks = getVisibleTasks();
  const activeTasks = visibleTasks.filter((task) => !task.done).sort(sortActiveTasks);
  const completedTasks = visibleTasks.filter((task) => task.done).sort(sortCompletedTasks);

  renderTaskList(els.taskList, activeTasks);
  renderTaskList(els.completedList, completedTasks);

  els.completedCount.textContent = String(completedTasks.length);
  els.completedList.classList.toggle("is-hidden", !state.showCompleted);
}

function renderTaskList(container, tasks) {
  container.innerHTML = "";

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<p>Empty</p>";
    container.append(empty);
    return;
  }

  tasks.forEach((task) => container.append(createTaskCard(task)));
}

function createTaskCard(task) {
  const node = els.taskCardTemplate.content.firstElementChild.cloneNode(true);
  node.classList.toggle("is-done", task.done);
  node.dataset.id = task.id;

  const checkButton = node.querySelector(".check-button");
  checkButton.dataset.action = "toggle-done";
  checkButton.dataset.id = task.id;
  checkButton.classList.toggle("is-done", task.done);

  node.querySelector(".task-title").textContent = task.title;

  const dateEl = node.querySelector(".task-date");
  const pinEl = node.querySelector(".task-pin");
  if (task.dueDate) {
    dateEl.textContent = formatDueDate(task.dueDate);
    dateEl.classList.toggle("is-overdue", isOverdue(task));
    dateEl.classList.toggle("is-today", isToday(task.dueDate));
  } else {
    dateEl.textContent = "";
  }

  pinEl.textContent = "Pinned";
  pinEl.classList.toggle("is-visible", Boolean(task.pinned));

  const editForm = node.querySelector(".task-edit-form");
  editForm.classList.toggle("is-hidden", state.editingTaskId !== task.id);
  editForm.dataset.id = task.id;
  editForm.querySelector(".task-edit-title").value = task.title;
  const editDateInput = editForm.querySelector(".task-edit-date-input");
  const editDateShell = editForm.querySelector(".task-edit-date-shell");
  const editDateLabel = editForm.querySelector(".task-edit-date-label");
  editDateInput.value = task.dueDate || "";
  syncDateShell(editDateShell, editDateLabel, editDateInput.value);

  const pinButton = node.querySelector(".pin-button");
  pinButton.dataset.action = "toggle-pin";
  pinButton.dataset.id = task.id;
  pinButton.classList.toggle("is-pinned", Boolean(task.pinned));

  const menuButton = node.querySelector(".menu-button");
  menuButton.dataset.action = "toggle-menu";
  menuButton.dataset.id = task.id;

  const menu = node.querySelector(".task-menu");
  menu.classList.toggle("is-hidden", state.menuTaskId !== task.id);

  const menuItems = node.querySelectorAll(".task-menu-item");
  menuItems.forEach((item) => {
    item.dataset.id = task.id;
  });

  node.querySelector(".task-cancel").dataset.id = task.id;

  return node;
}

async function handleTaskSubmit(event) {
  event.preventDefault();

  const payload = {
    title: els.taskTitle.value.trim(),
    dueDate: els.taskDueDate.value || null,
    dayKey: state.todayKey,
  };

  if (!payload.title) {
    return;
  }

  const response = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  state.tasks.unshift(response.task);
  els.taskForm.reset();
  syncComposerDate();
  render();
  els.taskTitle.focus();
}

function handleSearch(event) {
  state.search = event.target.value.trim().toLowerCase();
  syncSearchState();
  render();
}

function handleDateShellClick(event) {
  const shell = event.target.closest(".date-shell");
  if (!shell) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const input = shell.querySelector('input[type="date"]');
  if (!input) {
    return;
  }

  openDatePicker(input);
}

function syncComposerDate() {
  syncDateShell(els.taskDueDateShell, els.taskDueDateLabel, els.taskDueDate.value);
}

function toggleSearch() {
  const nextOpen = !els.searchWrap.classList.contains("is-open");

  if (nextOpen) {
    els.searchWrap.classList.add("is-open");
    window.setTimeout(() => els.searchInput.focus(), 140);
  } else {
    state.search = "";
    els.searchInput.value = "";
    els.searchWrap.classList.remove("is-open");
    els.searchInput.blur();
    render();
  }
}

function handleSearchBlur() {
  if (!state.search) {
    els.searchWrap.classList.remove("is-open");
  }
}

function syncSearchState() {
  els.searchWrap.classList.toggle("is-open", Boolean(state.search));
}

function toggleCompleted() {
  state.showCompleted = !state.showCompleted;
  render();
}

async function handleTaskAction(event) {
  if (!event.target.closest("[data-action]")) {
    if (state.menuTaskId !== null) {
      state.menuTaskId = null;
      render();
    }
    return;
  }

  const button = event.target.closest("[data-action]");
  const taskId = button.dataset.id;
  const task = state.tasks.find((item) => item.id === taskId);
  const action = button.dataset.action;

  if (action === "toggle-menu") {
    state.menuTaskId = state.menuTaskId === taskId ? null : taskId;
    render();
    return;
  }

  if (!task) {
    return;
  }

  state.menuTaskId = null;

  if (action === "delete-task") {
    await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    state.tasks = state.tasks.filter((item) => item.id !== taskId);
    if (state.editingTaskId === taskId) {
      state.editingTaskId = null;
    }
    render();
    return;
  }

  if (action === "start-edit") {
    state.editingTaskId = taskId;
    render();
    return;
  }

  if (action === "cancel-edit") {
    state.editingTaskId = null;
    render();
    return;
  }

  if (action === "toggle-pin") {
    const response = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ pinned: !task.pinned }),
    });
    replaceTask(response.task);
    render();
    return;
  }

  if (action === "toggle-done") {
    const response = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ done: !task.done }),
    });
    replaceTask(response.task);
    if (response.task.done && state.editingTaskId === taskId) {
      state.editingTaskId = null;
    }
    render();
  }
}

async function handleTaskFormActions(event) {
  const form = event.target.closest(".task-edit-form");
  if (!form) {
    return;
  }

  event.preventDefault();
  const taskId = form.dataset.id;
  const title = form.querySelector(".task-edit-title").value.trim();
  const dueDate = form.querySelector(".task-edit-date-input").value || null;

  if (!title) {
    return;
  }

  const response = await api(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, dueDate }),
  });

  replaceTask(response.task);
  state.editingTaskId = null;
  render();
}

function handleDynamicDateInput(event) {
  const input = event.target.closest(".task-edit-date-input");
  if (!input) {
    return;
  }

  const form = input.closest(".task-edit-form");
  if (!form) {
    return;
  }

  syncDateShell(
    form.querySelector(".task-edit-date-shell"),
    form.querySelector(".task-edit-date-label"),
    input.value
  );
}

function handleShortcuts(event) {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

  if (!typing && event.key.toLowerCase() === "n") {
    event.preventDefault();
    els.taskTitle.focus();
  }

  if (!typing && event.key === "/") {
    event.preventDefault();
    els.searchWrap.classList.add("is-open");
    els.searchInput.focus();
  }

  if (event.key === "Escape" && (state.menuTaskId !== null || state.editingTaskId !== null)) {
    state.menuTaskId = null;
    state.editingTaskId = null;
    render();
  }
}

function getVisibleTasks() {
  if (!state.search) {
    return state.tasks;
  }

  return state.tasks.filter((task) => {
    const title = String(task.title || "").toLowerCase();
    return title.includes(state.search);
  });
}

function sortActiveTasks(a, b) {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) {
    return a.pinned ? -1 : 1;
  }

  if (a.dueDate && b.dueDate) {
    return a.dueDate.localeCompare(b.dueDate) || new Date(b.createdAt) - new Date(a.createdAt);
  }

  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function sortCompletedTasks(a, b) {
  return new Date(b.completedAt || 0) - new Date(a.completedAt || 0);
}

function replaceTask(updatedTask) {
  const index = state.tasks.findIndex((item) => item.id === updatedTask.id);
  if (index >= 0) {
    state.tasks[index] = updatedTask;
  }
}

function isOverdue(task) {
  return Boolean(task.dueDate) && task.dueDate < state.todayKey && !task.done;
}

function isToday(dueDate) {
  return dueDate === state.todayKey;
}

function formatDueDate(dueDate) {
  const parts = dueDate.split("-");
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const currentYear = state.todayKey ? Number(state.todayKey.slice(0, 4)) : null;
  const dueYear = Number(parts[0]);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(currentYear && dueYear !== currentYear ? { year: "numeric" } : {}),
  }).format(date);
}

function syncDateShell(shell, label, value) {
  const hasValue = Boolean(value);
  shell.classList.toggle("has-value", hasValue);
  label.textContent = hasValue ? formatDueDate(value) : "";
}

function openDatePicker(input) {
  if (typeof input.showPicker === "function") {
    input.showPicker();
    return;
  }

  input.focus();
  input.click();
}

function getEasternDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
