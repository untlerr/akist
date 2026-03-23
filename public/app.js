const els = {
  todayLabel: document.querySelector("#todayLabel"),
  timeLabel: document.querySelector("#timeLabel"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskNotes: document.querySelector("#taskNotes"),
  taskDuration: document.querySelector("#taskDuration"),
  taskEnergy: document.querySelector("#taskEnergy"),
  taskUrgency: document.querySelector("#taskUrgency"),
  taskLane: document.querySelector("#taskLane"),
  searchInput: document.querySelector("#searchInput"),
  filterChips: document.querySelector("#filterChips"),
  autoPlanBtn: document.querySelector("#autoPlanBtn"),
  focusList: document.querySelector("#focusList"),
  inboxList: document.querySelector("#inboxList"),
  doneList: document.querySelector("#doneList"),
  openCount: document.querySelector("#openCount"),
  doneCount: document.querySelector("#doneCount"),
  plannedMinutes: document.querySelector("#plannedMinutes"),
  focusCountBadge: document.querySelector("#focusCountBadge"),
  inboxCountBadge: document.querySelector("#inboxCountBadge"),
  doneCountBadge: document.querySelector("#doneCountBadge"),
  taskCardTemplate: document.querySelector("#taskCardTemplate"),
};

const urgencyScore = { someday: 1, soon: 3, today: 5 };

const state = {
  tasks: [],
  todayKey: "",
  ui: {
    filter: "all",
    search: "",
  },
};

init();

async function init() {
  bindEvents();
  renderDate();
  window.setInterval(renderDate, 60000);

  try {
    const bootstrap = await api("/api/bootstrap");
    state.tasks = bootstrap.data.tasks || [];
    state.todayKey = bootstrap.todayKey;
    render();
  } catch (error) {
    console.error(error);
    renderLoading();
  }
}

function bindEvents() {
  els.taskForm.addEventListener("submit", handleTaskSubmit);
  els.searchInput.addEventListener("input", handleSearch);
  els.filterChips.addEventListener("click", handleFilterClick);
  els.autoPlanBtn.addEventListener("click", handleAutoPlan);
  document.addEventListener("click", handleTaskAction);
  document.addEventListener("keydown", handleShortcuts);
}

function renderLoading() {
  const loading = '<div class="loading-state"><p>Failed to load.</p></div>';
  els.focusList.innerHTML = loading;
  els.inboxList.innerHTML = loading;
  els.doneList.innerHTML = loading;
}

function renderDate() {
  const now = new Date();
  els.todayLabel.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
  els.timeLabel.textContent = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function render() {
  const visibleTasks = getVisibleTasks();
  const openTasks = visibleTasks.filter((task) => !task.done);
  const focusTasks = openTasks.filter((task) => task.lane === "focus");
  const inboxTasks = openTasks.filter((task) => ["inbox", "personal", "admin"].includes(task.lane));
  const doneTasks = visibleTasks.filter((task) => task.done);

  renderTaskList(els.focusList, focusTasks);
  renderTaskList(els.inboxList, inboxTasks);
  renderTaskList(els.doneList, doneTasks, true);
  updateStats();
  updateFilterChips();
}

function renderTaskList(container, tasks, sortByRecent = false) {
  container.innerHTML = "";

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<p>Empty</p>";
    container.append(empty);
    return;
  }

  const sortedTasks = tasks.slice().sort((a, b) => {
    if (sortByRecent) {
      return new Date(b.completedAt || 0) - new Date(a.completedAt || 0);
    }
    return getTaskScore(b) - getTaskScore(a);
  });

  sortedTasks.forEach((task) => container.append(createTaskCard(task)));
}

function createTaskCard(task) {
  const node = els.taskCardTemplate.content.firstElementChild.cloneNode(true);
  node.classList.toggle("is-done", task.done);

  const chips = node.querySelectorAll(".task-chip");
  chips[0].textContent = task.urgency;
  chips[1].textContent = task.energy;
  chips[2].textContent = `${task.duration}m`;

  node.querySelector(".task-title").textContent = task.title;
  node.querySelector(".task-notes").textContent = task.notes || "";

  const actions = node.querySelector(".task-actions");
  actions.append(
    createActionButton(task.done ? "Reopen" : "Done", "toggle-done", task.id, task.done ? "" : "button-primary")
  );

  if (!task.done && task.lane !== "focus") {
    actions.append(createActionButton("Focus", "promote-focus", task.id));
  }

  if (!task.done && task.lane !== "inbox") {
    actions.append(createActionButton("Inbox", "send-inbox", task.id));
  }

  actions.append(createActionButton("Delete", "delete-task", task.id, "danger"));
  return node;
}

function updateStats() {
  const openTasks = state.tasks.filter((task) => !task.done);
  const doneToday = state.tasks.filter(
    (task) => task.done && task.completedAt && dateKey(task.completedAt) === state.todayKey
  );
  const focusTasks = openTasks.filter((task) => task.lane === "focus");
  const inboxTasks = openTasks.filter((task) => ["inbox", "personal", "admin"].includes(task.lane));
  const plannedMinutes = openTasks.reduce((sum, task) => sum + task.duration, 0);

  els.openCount.textContent = String(openTasks.length);
  els.doneCount.textContent = String(doneToday.length);
  els.plannedMinutes.textContent = String(plannedMinutes);
  els.focusCountBadge.textContent = String(focusTasks.length);
  els.inboxCountBadge.textContent = String(inboxTasks.length);
  els.doneCountBadge.textContent = String(doneToday.length);
}

function updateFilterChips() {
  Array.from(els.filterChips.querySelectorAll("[data-filter]")).forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.filter === state.ui.filter);
  });
}

async function handleTaskSubmit(event) {
  event.preventDefault();

  const payload = {
    title: els.taskTitle.value.trim(),
    notes: els.taskNotes.value.trim(),
    duration: Number(els.taskDuration.value),
    energy: els.taskEnergy.value,
    urgency: els.taskUrgency.value,
    lane: els.taskLane.value,
    slot: inferSlotFromEnergy(els.taskEnergy.value),
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
  els.taskDuration.value = "30";
  els.taskEnergy.value = "steady";
  els.taskUrgency.value = "today";
  els.taskLane.value = "inbox";
  render();
  els.taskTitle.focus();
}

function handleSearch(event) {
  state.ui.search = event.target.value.trim().toLowerCase();
  render();
}

function handleFilterClick(event) {
  const button = event.target.closest("[data-filter]");
  if (!button) {
    return;
  }

  state.ui.filter = button.dataset.filter;
  render();
}

async function handleAutoPlan() {
  const openTasks = state.tasks.filter((task) => !task.done);
  const sorted = openTasks.slice().sort((a, b) => getTaskScore(b) - getTaskScore(a));

  sorted.forEach((task, index) => {
    task.lane = index < 3 ? "focus" : "inbox";
    task.slot = assignSlot(task, index);
    task.dayKey = state.todayKey;
  });

  await api("/api/tasks/bulk", {
    method: "PUT",
    body: JSON.stringify({ tasks: state.tasks }),
  });

  render();
}

async function handleTaskAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const taskId = button.dataset.id;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  const action = button.dataset.action;

  if (action === "delete-task") {
    await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    state.tasks = state.tasks.filter((item) => item.id !== taskId);
    render();
    return;
  }

  if (action === "toggle-done") {
    const response = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ done: !task.done }),
    });
    replaceTask(response.task);
    render();
    return;
  }

  if (action === "promote-focus") {
    const response = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ lane: "focus" }),
    });
    replaceTask(response.task);
    render();
    return;
  }

  if (action === "send-inbox") {
    const response = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ lane: "inbox" }),
    });
    replaceTask(response.task);
    render();
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
    els.searchInput.focus();
  }

  if (event.shiftKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    handleAutoPlan();
  }
}

function getVisibleTasks() {
  return state.tasks.filter((task) => matchesSearch(task) && matchesFilter(task));
}

function matchesSearch(task) {
  if (!state.ui.search) {
    return true;
  }

  const haystack = `${task.title} ${task.notes}`.toLowerCase();
  return haystack.includes(state.ui.search);
}

function matchesFilter(task) {
  if (state.ui.filter === "all") return true;
  if (state.ui.filter === "focus") return task.lane === "focus" && !task.done;
  if (state.ui.filter === "quick") return task.duration <= 30 && !task.done;
  if (state.ui.filter === "deep") return task.energy === "deep" && !task.done;
  if (state.ui.filter === "carryover") return isCarryoverTask(task) && !task.done;
  return true;
}

function getTaskScore(task) {
  const hour = new Date().getHours();
  let score = urgencyScore[task.urgency] || 0;

  score += task.lane === "focus" ? 4 : 0;
  score += task.duration <= 30 ? 1.25 : 0;
  score += isCarryoverTask(task) ? 1.75 : 0;
  score += task.dayKey === state.todayKey ? 1 : 0;

  if (hour < 12 && task.energy === "deep") score += 2.5;
  else if (hour >= 12 && hour < 17 && task.energy === "steady") score += 2;
  else if (hour >= 17 && task.energy === "light") score += 2.5;
  else score += 0.5;

  return score;
}

function assignSlot(task, index) {
  if (task.energy === "deep") return "morning";
  if (task.energy === "light") return index < 3 ? "afternoon" : "evening";
  return "afternoon";
}

function inferSlotFromEnergy(energy) {
  if (energy === "deep") return "morning";
  if (energy === "light") return "evening";
  return "afternoon";
}

function replaceTask(updatedTask) {
  const index = state.tasks.findIndex((item) => item.id === updatedTask.id);
  if (index >= 0) {
    state.tasks[index] = updatedTask;
  }
}

function createActionButton(label, action, id, tone = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `task-action ${tone}`.trim();
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

function isCarryoverTask(task) {
  return !task.done && task.dayKey !== state.todayKey;
}

function dateKey(input) {
  const value = new Date(input);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
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
