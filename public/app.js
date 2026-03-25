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
  taskReminderHour: document.querySelector("#taskReminderHour"),
  taskReminderMinute: document.querySelector("#taskReminderMinute"),
  taskReminderMeridiem: document.querySelector("#taskReminderMeridiem"),
  searchInput: document.querySelector("#searchInput"),
  taskList: document.querySelector("#taskList"),
  completedList: document.querySelector("#completedList"),
  completedCount: document.querySelector("#completedCount"),
  toggleCompletedBtn: document.querySelector("#toggleCompletedBtn"),
  noteForm: document.querySelector("#noteForm"),
  noteTitle: document.querySelector("#noteTitle"),
  noteContent: document.querySelector("#noteContent"),
  noteList: document.querySelector("#noteList"),
  toggleNotesBtn: document.querySelector("#toggleNotesBtn"),
  notesCount: document.querySelector("#notesCount"),
  notesBody: document.querySelector("#notesBody"),
  taskCardTemplate: document.querySelector("#taskCardTemplate"),
  noteCardTemplate: document.querySelector("#noteCardTemplate"),
};

const state = {
  tasks: [],
  notes: [],
  todayKey: "",
  showCompleted: false,
  showNotes: false,
  search: "",
  editingTaskId: null,
  menuTaskId: null,
  composerReminderOpen: false,
  editingReminderTaskId: null,
  editingNoteId: null,
  noteMenuId: null,
  expandedNoteId: null,
};

init();

async function init() {
  populateReminderTimeControls();
  bindEvents();
  renderDateTime();
  window.setInterval(renderDateTime, 1000);

  try {
    const bootstrap = await api("/api/bootstrap");
    state.tasks = Array.isArray(bootstrap.data.tasks) ? bootstrap.data.tasks : [];
    state.notes = Array.isArray(bootstrap.data.notes) ? bootstrap.data.notes : [];
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
  els.taskReminderHour.addEventListener("input", syncComposerReminderState);
  els.taskReminderHour.addEventListener("change", syncComposerReminderState);
  els.taskReminderMinute.addEventListener("input", syncComposerReminderState);
  els.taskReminderMinute.addEventListener("change", syncComposerReminderState);
  els.taskReminderMeridiem.addEventListener("input", syncComposerReminderState);
  els.taskReminderMeridiem.addEventListener("change", syncComposerReminderState);
  els.searchInput.addEventListener("input", handleSearch);
  els.searchInput.addEventListener("blur", handleSearchBlur);
  els.searchToggleBtn.addEventListener("click", toggleSearch);
  els.toggleCompletedBtn.addEventListener("click", toggleCompleted);
  els.noteForm.addEventListener("submit", handleNoteSubmit);
  els.toggleNotesBtn.addEventListener("click", toggleNotes);
  document.addEventListener("click", handleDateShellClick);
  document.addEventListener("click", handleTaskAction);
  document.addEventListener("click", handleNoteAction);
  document.addEventListener("input", handleDynamicDateInput);
  document.addEventListener("change", handleDynamicDateInput);
  document.addEventListener("submit", handleTaskFormActions);
  document.addEventListener("submit", handleNoteFormActions);
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
  els.noteList.innerHTML = loading;
}

function render() {
  const visibleTasks = getVisibleTasks();
  const activeTasks = visibleTasks.filter((task) => !task.done).sort(sortActiveTasks);
  const completedTasks = visibleTasks.filter((task) => task.done).sort(sortCompletedTasks);
  const notes = [...state.notes].sort(sortNotes);

  renderTaskList(els.taskList, activeTasks);
  renderTaskList(els.completedList, completedTasks);
  renderNoteList(els.noteList, notes);

  els.completedCount.textContent = String(completedTasks.length);
  els.completedList.classList.toggle("is-hidden", !state.showCompleted);
  els.notesCount.textContent = String(notes.length);
  els.notesBody.classList.toggle("is-hidden", !state.showNotes);
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

function renderNoteList(container, notes) {
  container.innerHTML = "";

  if (notes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<p>empty</p>";
    container.append(empty);
    return;
  }

  notes.forEach((note) => container.append(createNoteCard(note)));
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
  const editReminderHour = editForm.querySelector(".task-edit-reminder-hour");
  const editReminderMinute = editForm.querySelector(".task-edit-reminder-minute");
  const editReminderMeridiem = editForm.querySelector(".task-edit-reminder-meridiem");

  editReminderType.value = task.reminderType || "none";
  editReminderDaysBefore.value = String(task.reminderDaysBefore || 1);
  editReminderDate.value = task.reminderDate || "";
  writeReminderTimeParts(editReminderHour, editReminderMinute, editReminderMeridiem, task.reminderTime || "09:00");
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

function createNoteCard(note) {
  const node = els.noteCardTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = note.id;
  const editingNote = state.editingNoteId === note.id;
  const expandedNote = state.expandedNoteId === note.id || editingNote;
  node.classList.toggle("is-expanded", expandedNote);

  const noteToggle = node.querySelector(".note-toggle");
  noteToggle.dataset.action = "toggle-note";
  noteToggle.dataset.id = note.id;
  noteToggle.classList.toggle("is-hidden", editingNote);
  node.querySelector(".note-title").textContent = note.title || "untitled";

  const content = node.querySelector(".note-content");
  content.textContent = note.content || "";
  content.classList.toggle("is-hidden", editingNote || !expandedNote);

  const editForm = node.querySelector(".note-edit-form");
  editForm.dataset.id = note.id;
  editForm.classList.toggle("is-hidden", !editingNote);
  editForm.querySelector(".note-edit-title").value = note.title || "";
  editForm.querySelector(".note-edit-content").value = note.content || "";

  const menuButton = node.querySelector(".menu-button");
  menuButton.dataset.action = "toggle-note-menu";
  menuButton.dataset.id = note.id;

  const menu = node.querySelector(".task-menu");
  menu.classList.toggle("is-hidden", state.noteMenuId !== note.id);

  node.querySelectorAll(".task-menu-item").forEach((item) => {
    item.dataset.id = note.id;
  });

  const cancelButton = node.querySelector('[data-action="cancel-note-edit"]');
  cancelButton.dataset.id = note.id;

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

async function handleNoteSubmit(event) {
  event.preventDefault();

  const payload = {
    title: els.noteTitle.value.trim(),
    content: els.noteContent.value.trim(),
  };

  if (!payload.title && !payload.content) {
    return;
  }

  const response = await api("/api/notes", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  state.notes.unshift(response.note);
  els.noteForm.reset();
  state.showNotes = true;
  render();
  els.noteTitle.focus();
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
        getReminderTimeParts(els.taskReminderHour, els.taskReminderMinute, els.taskReminderMeridiem)
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
    getReminderTimeParts(els.taskReminderHour, els.taskReminderMinute, els.taskReminderMeridiem),
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

function toggleNotes() {
  state.showNotes = !state.showNotes;
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

  if (action.startsWith("toggle-note") || action.includes("-note") || action.endsWith("-note-edit")) {
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

async function handleNoteAction(event) {
  const noteCard = event.target.closest(".note-card");

  if (!event.target.closest("[data-action]")) {
    if (state.noteMenuId !== null) {
      state.noteMenuId = null;
      if (!noteCard) {
        render();
      }
    }

    if (noteCard) {
      const noteId = noteCard.dataset.id;
      if (!noteId || state.editingNoteId === noteId) {
        return;
      }

      state.expandedNoteId = state.expandedNoteId === noteId ? null : noteId;
      render();
    }

    return;
  }

  const button = event.target.closest("[data-action]");
  const noteId = button.dataset.id;
  const note = state.notes.find((item) => item.id === noteId);
  const action = button.dataset.action;

  if (action === "toggle-note-menu") {
    state.noteMenuId = state.noteMenuId === noteId ? null : noteId;
    render();
    return;
  }

  if (!note) {
    return;
  }

  state.noteMenuId = null;

  if (action === "toggle-note") {
    state.expandedNoteId = state.expandedNoteId === noteId ? null : noteId;
    render();
    return;
  }

  if (action === "start-note-edit") {
    state.editingNoteId = noteId;
    state.expandedNoteId = noteId;
    render();
    return;
  }

  if (action === "cancel-note-edit") {
    state.editingNoteId = null;
    render();
    return;
  }

  if (action === "delete-note") {
    await api(`/api/notes/${noteId}`, { method: "DELETE" });
    state.notes = state.notes.filter((item) => item.id !== noteId);
    if (state.editingNoteId === noteId) {
      state.editingNoteId = null;
    }
    if (state.expandedNoteId === noteId) {
      state.expandedNoteId = null;
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

async function handleNoteFormActions(event) {
  const form = event.target.closest(".note-edit-form");
  if (!form) {
    return;
  }

  event.preventDefault();
  const noteId = form.dataset.id;
  const title = form.querySelector(".note-edit-title").value.trim();
  const content = form.querySelector(".note-edit-content").value.trim();

  if (!title && !content) {
    return;
  }

  const response = await api(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, content }),
  });

  replaceNote(response.note);
  state.editingNoteId = null;
  state.expandedNoteId = noteId;
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
  const editReminderHour = event.target.closest(".task-edit-reminder-hour");
  const editReminderMinute = event.target.closest(".task-edit-reminder-minute");
  const editReminderMeridiem = event.target.closest(".task-edit-reminder-meridiem");
  if (editReminderType || editReminderDaysBefore || editReminderHour || editReminderMinute || editReminderMeridiem) {
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
      state.noteMenuId !== null ||
      state.editingTaskId !== null ||
      state.editingNoteId !== null ||
      state.editingReminderTaskId !== null ||
      state.composerReminderOpen ||
      state.expandedNoteId !== null
    )
  ) {
    state.menuTaskId = null;
    state.noteMenuId = null;
    state.editingTaskId = null;
    state.editingNoteId = null;
    state.editingReminderTaskId = null;
    state.composerReminderOpen = false;
    state.expandedNoteId = null;
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

function sortNotes(a, b) {
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

function replaceTask(updatedTask) {
  const index = state.tasks.findIndex((item) => item.id === updatedTask.id);
  if (index >= 0) {
    state.tasks[index] = updatedTask;
  }
}

function replaceNote(updatedNote) {
  const index = state.notes.findIndex((item) => item.id === updatedNote.id);
  if (index >= 0) {
    state.notes[index] = updatedNote;
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

function syncReminderEditorFields(typeEl, daysBeforeEl, dateShellEl, dateLabelEl, dateEl, timeControls, enabled) {
  const { hourEl, minuteEl, meridiemEl } = timeControls;
  typeEl.disabled = !enabled;
  hourEl.disabled = !enabled;
  minuteEl.disabled = !enabled;
  meridiemEl.disabled = !enabled;

  if (!enabled) {
    typeEl.value = "none";
    daysBeforeEl.value = "1";
    dateEl.value = "";
    writeReminderTimeParts(hourEl, minuteEl, meridiemEl, "09:00");
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
    getReminderTimeParts(els.taskReminderHour, els.taskReminderMinute, els.taskReminderMeridiem)
  );
}

function getTaskEditReminderConfig(form) {
  return getNormalizedReminderConfig(
    form.querySelector(".task-edit-date-input").value || null,
    form.querySelector(".task-edit-reminder-type"),
    form.querySelector(".task-edit-reminder-days-before"),
    form.querySelector(".task-edit-reminder-date"),
    getReminderTimeParts(
      form.querySelector(".task-edit-reminder-hour"),
      form.querySelector(".task-edit-reminder-minute"),
      form.querySelector(".task-edit-reminder-meridiem")
    )
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
  writeReminderTimeParts(els.taskReminderHour, els.taskReminderMinute, els.taskReminderMeridiem, "09:00");
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
  const reminderTime = getReminderTimeParts(
    form.querySelector(".task-edit-reminder-hour"),
    form.querySelector(".task-edit-reminder-minute"),
    form.querySelector(".task-edit-reminder-meridiem")
  );
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
    writeReminderTimeParts(reminderTime.hourEl, reminderTime.minuteEl, reminderTime.meridiemEl, "09:00");
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

function getNormalizedReminderConfig(dueDate, typeEl, daysBeforeEl, dateEl, timeControls) {
  normalizeReminderInputs(dueDate, typeEl, daysBeforeEl, dateEl, timeControls);
  return {
    reminderType: typeEl.value,
    reminderDaysBefore: Number(daysBeforeEl.value || 1),
    reminderDate: dateEl.value || null,
    reminderTime: readReminderTimeParts(timeControls.hourEl, timeControls.minuteEl, timeControls.meridiemEl),
  };
}

function normalizeReminderInputs(dueDate, typeEl, daysBeforeEl, dateEl, timeControls) {
  const { hourEl, minuteEl, meridiemEl } = timeControls;
  if (!dueDate) {
    typeEl.value = "none";
    daysBeforeEl.value = "1";
    dateEl.value = "";
    writeReminderTimeParts(hourEl, minuteEl, meridiemEl, "09:00");
    return;
  }

  if (!["none", "day-of", "days-before", "specific-date"].includes(typeEl.value)) {
    typeEl.value = "none";
  }

  const daysBefore = Math.max(1, Number(daysBeforeEl.value || 1));
  daysBeforeEl.value = String(Number.isFinite(daysBefore) ? daysBefore : 1);

  writeReminderTimeParts(
    hourEl,
    minuteEl,
    meridiemEl,
    readReminderTimeParts(hourEl, minuteEl, meridiemEl)
  );

  if (typeEl.value === "specific-date" && !dateEl.value) {
    dateEl.value = dueDate;
  }
}

function populateReminderTimeControls() {
  const containers = [document, els.taskCardTemplate.content];

  containers.forEach((container) => {
    container.querySelectorAll(".reminder-hour").forEach((select) => {
      if (!select.options.length) {
        for (let hour = 1; hour <= 12; hour += 1) {
          select.add(new Option(String(hour), String(hour)));
        }
      }
    });

    container.querySelectorAll(".reminder-minute").forEach((select) => {
      if (!select.options.length) {
        for (let minute = 0; minute < 60; minute += 1) {
          const value = String(minute).padStart(2, "0");
          select.add(new Option(value, value));
        }
      }
    });
  });

  writeReminderTimeParts(els.taskReminderHour, els.taskReminderMinute, els.taskReminderMeridiem, "09:00");
}

function getReminderTimeParts(hourEl, minuteEl, meridiemEl) {
  return { hourEl, minuteEl, meridiemEl };
}

function readReminderTimeParts(hourEl, minuteEl, meridiemEl) {
  const hourValue = Math.max(1, Math.min(12, Number(hourEl.value || 9)));
  const minuteValue = Math.max(0, Math.min(59, Number(minuteEl.value || 0)));
  const meridiem = meridiemEl.value === "pm" ? "pm" : "am";

  let hour24 = hourValue % 12;
  if (meridiem === "pm") {
    hour24 += 12;
  }

  return `${String(hour24).padStart(2, "0")}:${String(minuteValue).padStart(2, "0")}`;
}

function writeReminderTimeParts(hourEl, minuteEl, meridiemEl, value) {
  const [rawHour, rawMinute] = String(value || "09:00").split(":").map(Number);
  const safeHour = Number.isFinite(rawHour) ? Math.max(0, Math.min(23, rawHour)) : 9;
  const safeMinute = Number.isFinite(rawMinute) ? Math.max(0, Math.min(59, rawMinute)) : 0;
  const meridiem = safeHour >= 12 ? "pm" : "am";
  const hour12 = safeHour % 12 || 12;

  hourEl.value = String(hour12);
  minuteEl.value = String(safeMinute).padStart(2, "0");
  meridiemEl.value = meridiem;
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
