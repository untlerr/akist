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
  taskReminderToggleBtn: document.querySelector("#taskReminderToggleBtn"),
  taskReminderEditor: document.querySelector("#taskReminderEditor"),
  taskReminderType: document.querySelector("#taskReminderType"),
  taskReminderDaysBefore: document.querySelector("#taskReminderDaysBefore"),
  taskReminderDateShell: document.querySelector("#taskReminderDateShell"),
  taskReminderDateLabel: document.querySelector("#taskReminderDateLabel"),
  taskReminderDate: document.querySelector("#taskReminderDate"),
  taskReminderTime: document.querySelector("#taskReminderTime"),
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
  composerReminderOpen: false,
  editingReminderTaskId: null,
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
    syncComposerReminderState();
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
  els.taskDueDate.addEventListener("input", handleComposerDueDateChange);
  els.taskDueDate.addEventListener("change", handleComposerDueDateChange);
  els.taskReminderToggleBtn.addEventListener("click", toggleComposerReminderEditor);
  els.taskReminderType.addEventListener("input", syncComposerReminderState);
  els.taskReminderType.addEventListener("change", syncComposerReminderState);
  els.taskReminderDaysBefore.addEventListener("input", syncComposerReminderState);
  els.taskReminderDaysBefore.addEventListener("change", syncComposerReminderState);
  els.taskReminderDate.addEventListener("input", syncComposerReminderDate);
  els.taskReminderDate.addEventListener("change", syncComposerReminderDate);
  els.taskReminderTime.addEventListener("input", syncComposerReminderState);
  els.taskReminderTime.addEventListener("change", syncComposerReminderState);
  els.searchInput.addEventListener("input", handleSearch);
  els.searchInput.addEventListener("blur", handleSearchBlur);
  els.searchToggleBtn.addEventListener("click", toggleSearch);
  els.toggleCompletedBtn.addEventListener("click", toggleCompleted);
  document.addEventListener("click", handleDateShellClick);
  document.addEventListener("click", handleTaskAction);
  document.addEventListener("input", handleDynamicDateInput);
  document.addEventListener("change", handleDynamicDateInput);
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
  const loading = '<div class="loading-state"><p>failed to load.</p></div>';
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
    empty.innerHTML = "<p>empty</p>";
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
  if (task.dueDate) {
    dateEl.textContent = formatDueDate(task.dueDate);
    dateEl.classList.toggle("is-overdue", isOverdue(task));
    dateEl.classList.toggle("is-today", isToday(task.dueDate));
  } else {
    dateEl.textContent = "";
  }

  const editForm = node.querySelector(".task-edit-form");
  editForm.classList.toggle("is-hidden", state.editingTaskId !== task.id);
  editForm.dataset.id = task.id;
  editForm.querySelector(".task-edit-title").value = task.title;
  const editDateInput = editForm.querySelector(".task-edit-date-input");
  const editDateShell = editForm.querySelector(".task-edit-date-shell");
  const editDateLabel = editForm.querySelector(".task-edit-date-label");
  editDateInput.value = task.dueDate || "";
  syncDateShell(editDateShell, editDateLabel, editDateInput.value);
  const editReminderToggle = editForm.querySelector(".task-edit-reminder-toggle");
  editReminderToggle.dataset.id = task.id;
  const editReminderType = editForm.querySelector(".task-edit-reminder-type");
  const editReminderDaysBefore = editForm.querySelector(".task-edit-reminder-days-before");
  const editReminderDateShell = editForm.querySelector(".task-edit-reminder-date-shell");
  const editReminderDateLabel = editForm.querySelector(".task-edit-reminder-date-label");
  const editReminderDate = editForm.querySelector(".task-edit-reminder-date");
  const editReminderTime = editForm.querySelector(".task-edit-reminder-time");

  editReminderType.value = task.reminderType || "none";
  editReminderDaysBefore.value = String(task.reminderDaysBefore || 1);
  editReminderDate.value = task.reminderDate || "";
  editReminderTime.value = task.reminderTime || "09:00";
  syncDateShell(editReminderDateShell, editReminderDateLabel, editReminderDate.value);
  syncTaskEditReminderState(editForm);

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

  const composerReminder = els.taskDueDate.value ? getComposerReminderConfig() : defaultReminderConfig();
  const payload = {
    title: els.taskTitle.value.trim(),
    dueDate: els.taskDueDate.value || null,
    ...composerReminder,
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
  resetComposerReminder();
  syncComposerDate();
  syncComposerReminderState();
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

function syncComposerReminderState() {
  const hasDueDate = Boolean(els.taskDueDate.value);
  const reminder = hasDueDate
    ? getNormalizedReminderConfig(
        els.taskDueDate.value,
        els.taskReminderType,
        els.taskReminderDaysBefore,
        els.taskReminderDate,
        els.taskReminderTime
      )
    : defaultReminderConfig();
  const reminderSet = hasDueDate && isReminderConfigured(reminder);

  els.taskReminderToggleBtn.classList.toggle("is-hidden", !hasDueDate);
  els.taskReminderToggleBtn.classList.toggle("is-set", reminderSet);
  els.taskReminderToggleBtn.classList.toggle("is-open", state.composerReminderOpen && hasDueDate);
  els.taskReminderEditor.classList.toggle("is-hidden", !(state.composerReminderOpen && hasDueDate));

  syncReminderEditorFields(
    els.taskReminderType,
    els.taskReminderDaysBefore,
    els.taskReminderDateShell,
    els.taskReminderDateLabel,
    els.taskReminderDate,
    els.taskReminderTime,
    hasDueDate
  );
}

function handleComposerDueDateChange() {
  syncComposerDate();
  if (!els.taskDueDate.value) {
    resetComposerReminder();
  }
  syncComposerReminderState();
}

function toggleComposerReminderEditor() {
  if (!els.taskDueDate.value) {
    return;
  }

  state.composerReminderOpen = !state.composerReminderOpen;
  syncComposerReminderState();
}

function syncComposerReminderDate() {
  syncDateShell(els.taskReminderDateShell, els.taskReminderDateLabel, els.taskReminderDate.value);
  syncComposerReminderState();
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
    state.editingReminderTaskId = null;
    render();
    return;
  }

  if (action === "cancel-edit") {
    state.editingTaskId = null;
    state.editingReminderTaskId = null;
    render();
    return;
  }

  if (action === "toggle-edit-reminder") {
    state.editingReminderTaskId = state.editingReminderTaskId === taskId ? null : taskId;
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
      state.editingReminderTaskId = null;
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
  const reminder = dueDate ? getTaskEditReminderConfig(form) : defaultReminderConfig();

  if (!title) {
    return;
  }

  const response = await api(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, dueDate, ...reminder }),
  });

  replaceTask(response.task);
  state.editingTaskId = null;
  state.editingReminderTaskId = null;
  render();
}

function handleDynamicDateInput(event) {
  if (event.target === els.taskReminderDate) {
    syncComposerReminderDate();
    return;
  }

  const editDateInput = event.target.closest(".task-edit-date-input");
  if (editDateInput) {
    const form = editDateInput.closest(".task-edit-form");
    if (!form) {
      return;
    }

    syncDateShell(
      form.querySelector(".task-edit-date-shell"),
      form.querySelector(".task-edit-date-label"),
      editDateInput.value
    );
    syncTaskEditReminderState(form);
    return;
  }

  const editReminderDate = event.target.closest(".task-edit-reminder-date");
  if (editReminderDate) {
    const form = editReminderDate.closest(".task-edit-form");
    if (!form) {
      return;
    }

    syncDateShell(
      form.querySelector(".task-edit-reminder-date-shell"),
      form.querySelector(".task-edit-reminder-date-label"),
      editReminderDate.value
    );
    syncTaskEditReminderState(form);
    return;
  }

  const editReminderType = event.target.closest(".task-edit-reminder-type");
  const editReminderDaysBefore = event.target.closest(".task-edit-reminder-days-before");
  const editReminderTime = event.target.closest(".task-edit-reminder-time");
  if (editReminderType || editReminderDaysBefore || editReminderTime) {
    const form = event.target.closest(".task-edit-form");
    if (!form) {
      return;
    }

    syncTaskEditReminderState(form);
  }
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

  if (
    event.key === "Escape" &&
    (
      state.menuTaskId !== null ||
      state.editingTaskId !== null ||
      state.editingReminderTaskId !== null ||
      state.composerReminderOpen
    )
  ) {
    state.menuTaskId = null;
    state.editingTaskId = null;
    state.editingReminderTaskId = null;
    state.composerReminderOpen = false;
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
  const formatted = hasValue ? formatDueDate(value) : "";
  shell.classList.toggle("has-value", hasValue);
  shell.classList.toggle("has-year", hasValue && formatted.includes(","));
  label.textContent = formatted;
  shell.style.width = hasValue ? `${measureDateShellWidth(label, formatted)}px` : "44px";
}

function syncReminderEditorFields(typeEl, daysBeforeEl, dateShellEl, dateLabelEl, dateEl, timeEl, enabled) {
  typeEl.disabled = !enabled;
  timeEl.disabled = !enabled;

  if (!enabled) {
    typeEl.value = "none";
    daysBeforeEl.value = "1";
    dateEl.value = "";
    timeEl.value = "09:00";
  }

  const currentType = enabled ? typeEl.value : "none";
  daysBeforeEl.classList.toggle("is-hidden", currentType !== "days-before");
  dateShellEl.classList.toggle("is-hidden", currentType !== "specific-date");
  daysBeforeEl.disabled = !enabled || currentType !== "days-before";
  dateEl.disabled = !enabled || currentType !== "specific-date";
  syncDateShell(dateShellEl, dateLabelEl, dateEl.value);
}

function defaultReminderConfig() {
  return {
    reminderType: "none",
    reminderDaysBefore: 1,
    reminderDate: null,
    reminderTime: "09:00",
  };
}

function getComposerReminderConfig() {
  if (!els.taskDueDate.value) {
    return defaultReminderConfig();
  }

  return getNormalizedReminderConfig(
    els.taskDueDate.value,
    els.taskReminderType,
    els.taskReminderDaysBefore,
    els.taskReminderDate,
    els.taskReminderTime
  );
}

function getTaskEditReminderConfig(form) {
  return getNormalizedReminderConfig(
    form.querySelector(".task-edit-date-input").value || null,
    form.querySelector(".task-edit-reminder-type"),
    form.querySelector(".task-edit-reminder-days-before"),
    form.querySelector(".task-edit-reminder-date"),
    form.querySelector(".task-edit-reminder-time")
  );
}

function isReminderConfigured(reminder) {
  if (!reminder.reminderType || reminder.reminderType === "none") {
    return false;
  }

  if (reminder.reminderType === "specific-date") {
    return Boolean(reminder.reminderDate);
  }

  return true;
}

function resetComposerReminder() {
  els.taskReminderType.value = "none";
  els.taskReminderDaysBefore.value = "1";
  els.taskReminderDate.value = "";
  els.taskReminderTime.value = "09:00";
  state.composerReminderOpen = false;
}

function syncTaskEditReminderState(form) {
  const dueDate = form.querySelector(".task-edit-date-input").value;
  const reminderToggle = form.querySelector(".task-edit-reminder-toggle");
  const reminderEditor = form.querySelector(".task-edit-reminder-editor");
  const reminderType = form.querySelector(".task-edit-reminder-type");
  const reminderDaysBefore = form.querySelector(".task-edit-reminder-days-before");
  const reminderDateShell = form.querySelector(".task-edit-reminder-date-shell");
  const reminderDateLabel = form.querySelector(".task-edit-reminder-date-label");
  const reminderDate = form.querySelector(".task-edit-reminder-date");
  const reminderTime = form.querySelector(".task-edit-reminder-time");
  const taskId = form.dataset.id;
  const enabled = Boolean(dueDate);
  const reminder = enabled
    ? getNormalizedReminderConfig(dueDate, reminderType, reminderDaysBefore, reminderDate, reminderTime)
    : defaultReminderConfig();

  reminderToggle.classList.toggle("is-hidden", !enabled);
  reminderToggle.classList.toggle("is-set", enabled && isReminderConfigured(reminder));
  reminderToggle.classList.toggle("is-open", enabled && state.editingReminderTaskId === taskId);
  reminderEditor.classList.toggle("is-hidden", !(enabled && state.editingReminderTaskId === taskId));

  if (!enabled) {
    reminderType.value = "none";
    reminderDaysBefore.value = "1";
    reminderDate.value = "";
    reminderTime.value = "09:00";
    if (state.editingReminderTaskId === taskId) {
      state.editingReminderTaskId = null;
    }
  }

  syncReminderEditorFields(
    reminderType,
    reminderDaysBefore,
    reminderDateShell,
    reminderDateLabel,
    reminderDate,
    reminderTime,
    enabled
  );
}

function getNormalizedReminderConfig(dueDate, typeEl, daysBeforeEl, dateEl, timeEl) {
  normalizeReminderInputs(dueDate, typeEl, daysBeforeEl, dateEl, timeEl);
  return {
    reminderType: typeEl.value,
    reminderDaysBefore: Number(daysBeforeEl.value || 1),
    reminderDate: dateEl.value || null,
    reminderTime: timeEl.value || "09:00",
  };
}

function normalizeReminderInputs(dueDate, typeEl, daysBeforeEl, dateEl, timeEl) {
  if (!dueDate) {
    typeEl.value = "none";
    daysBeforeEl.value = "1";
    dateEl.value = "";
    timeEl.value = "09:00";
    return;
  }

  if (!["none", "day-of", "days-before", "specific-date"].includes(typeEl.value)) {
    typeEl.value = "none";
  }

  const daysBefore = Math.max(1, Number(daysBeforeEl.value || 1));
  daysBeforeEl.value = String(Number.isFinite(daysBefore) ? daysBefore : 1);

  if (!/^\d{2}:\d{2}$/.test(timeEl.value || "")) {
    timeEl.value = "09:00";
  }

  if (typeEl.value === "specific-date" && !dateEl.value) {
    dateEl.value = dueDate;
  }
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

function measureDateShellWidth(label, text) {
  const computed = window.getComputedStyle(label);
  const canvas = measureDateShellWidth.canvas || (measureDateShellWidth.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");

  if (!context) {
    return text.includes(",") ? 132 : 102;
  }

  context.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  const textWidth = context.measureText(text).width;

  return Math.ceil(textWidth + 18 + 10 + 28 + 14);
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
