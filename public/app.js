const els = {
  todayLabel: document.querySelector("#todayLabel"),
  timeLabel: document.querySelector("#timeLabel"),
  networkLabel: document.querySelector("#networkLabel"),
  networkHint: document.querySelector("#networkHint"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskNotes: document.querySelector("#taskNotes"),
  taskDuration: document.querySelector("#taskDuration"),
  taskEnergy: document.querySelector("#taskEnergy"),
  taskUrgency: document.querySelector("#taskUrgency"),
  taskLane: document.querySelector("#taskLane"),
  intentionInput: document.querySelector("#intentionInput"),
  reflectionInput: document.querySelector("#reflectionInput"),
  searchInput: document.querySelector("#searchInput"),
  filterChips: document.querySelector("#filterChips"),
  autoPlanBtn: document.querySelector("#autoPlanBtn"),
  recommendationCard: document.querySelector("#recommendationCard"),
  focusList: document.querySelector("#focusList"),
  inboxList: document.querySelector("#inboxList"),
  morningList: document.querySelector("#morningList"),
  afternoonList: document.querySelector("#afternoonList"),
  eveningList: document.querySelector("#eveningList"),
  doneList: document.querySelector("#doneList"),
  openCount: document.querySelector("#openCount"),
  doneCount: document.querySelector("#doneCount"),
  plannedMinutes: document.querySelector("#plannedMinutes"),
  carryoverCount: document.querySelector("#carryoverCount"),
  loadFill: document.querySelector("#loadFill"),
  focusCountBadge: document.querySelector("#focusCountBadge"),
  inboxCountBadge: document.querySelector("#inboxCountBadge"),
  doneCountBadge: document.querySelector("#doneCountBadge"),
  taskCardTemplate: document.querySelector("#taskCardTemplate"),
};

const urgencyScore = { someday: 1, soon: 3, today: 5 };

const state = {
  tasks: [],
  dailyNotes: {},
  todayKey: "",
  lanAddress: null,
  ui: {
    filter: "all",
    search: "",
  },
};

let noteSaveTimer = null;

init();

async function init() {
  bindEvents();
  renderLoading();
  renderDate();
  window.setInterval(renderDate, 60000);

  try {
    const bootstrap = await api("/api/bootstrap");
    state.tasks = bootstrap.data.tasks || [];
    state.dailyNotes = bootstrap.data.dailyNotes || {};
    state.todayKey = bootstrap.todayKey;
    state.lanAddress = bootstrap.lanAddress;
    updateNetworkCard();
    render();
  } catch (error) {
    console.error(error);
    els.recommendationCard.innerHTML =
      '<div class="loading-state"><p>Could not load the board. Start the server with <code>npm start</code> after installing Node.</p></div>';
  }
}

function bindEvents() {
  els.taskForm.addEventListener("submit", handleTaskSubmit);
  els.searchInput.addEventListener("input", handleSearch);
  els.filterChips.addEventListener("click", handleFilterClick);
  els.autoPlanBtn.addEventListener("click", handleAutoPlan);
  els.intentionInput.addEventListener("input", scheduleNotesSave);
  els.reflectionInput.addEventListener("input", scheduleNotesSave);
  document.addEventListener("click", handleTaskAction);
  document.addEventListener("keydown", handleShortcuts);
}

function renderLoading() {
  els.recommendationCard.innerHTML =
    '<div class="loading-state"><p>Loading your dayboard...</p></div>';
}

function renderDate() {
  const now = new Date();
  els.todayLabel.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  els.timeLabel.textContent = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function updateNetworkCard() {
  if (state.lanAddress) {
    els.networkLabel.textContent = state.lanAddress;
    els.networkHint.textContent = `Open http://${state.lanAddress}:3000 from your other device on the same network`;
    return;
  }

  els.networkLabel.textContent = "localhost";
  els.networkHint.textContent = "Run on one machine and access it there or over your local network";
}

function render() {
  const todayNotes = state.dailyNotes[state.todayKey] || { intention: "", reflection: "" };
  const visibleTasks = getVisibleTasks();
  const focusTasks = visibleTasks.filter((task) => !task.done && task.lane === "focus");
  const inboxTasks = visibleTasks.filter(
    (task) => !task.done && ["inbox", "personal", "admin"].includes(task.lane)
  );
  const doneTasks = visibleTasks.filter((task) => task.done);

  renderTaskList(els.focusList, focusTasks);
  renderTaskList(els.inboxList, inboxTasks);
  renderTaskList(els.doneList, doneTasks);
  renderTaskList(els.morningList, visibleTasks.filter((task) => !task.done && task.slot === "morning"));
  renderTaskList(els.afternoonList, visibleTasks.filter((task) => !task.done && task.slot === "afternoon"));
  renderTaskList(els.eveningList, visibleTasks.filter((task) => !task.done && task.slot === "evening"));

  renderRecommendation();
  updateStats();
  updateFilterChips();

  els.intentionInput.value = todayNotes.intention;
  els.reflectionInput.value = todayNotes.reflection;
}

function renderTaskList(container, tasks) {
  container.innerHTML = "";

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<p>No tasks here yet.</p>";
    container.append(empty);
    return;
  }

  tasks
    .slice()
    .sort((a, b) => getTaskScore(b) - getTaskScore(a))
    .forEach((task) => container.append(createTaskCard(task)));
}

function renderRecommendation() {
  els.recommendationCard.innerHTML = "";
  const task = getRecommendedTask();

  if (!task) {
    const empty = document.createElement("div");
    empty.className = "recommendation-empty";
    empty.innerHTML =
      "<p>Add a few tasks and Akist will surface the best next move for this part of the day.</p>";
    els.recommendationCard.append(empty);
    return;
  }

  const panel = document.createElement("div");
  panel.className = "recommendation-panel";

  const lead = document.createElement("div");
  lead.className = "task-meta-row";
  lead.innerHTML = `<span class="eyebrow">Best fit right now</span><span class="task-chip">${slotLabel(
    task.slot
  )}</span>`;

  const title = document.createElement("h3");
  title.className = "recommendation-title";
  title.textContent = task.title;

  const notes = document.createElement("p");
  notes.className = "task-notes";
  notes.textContent =
    task.notes || "This task has no notes yet. Add a sentence if you want a clearer definition of done.";

  const strip = document.createElement("div");
  strip.className = "insight-strip";
  [
    `${task.duration} min block`,
    `${capitalize(task.energy)} energy`,
    `${capitalize(task.urgency)} priority`,
    recommendationReason(task),
  ].forEach((item) => {
    const pill = document.createElement("span");
    pill.className = "insight-pill";
    pill.textContent = item;
    strip.append(pill);
  });

  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.append(
    createActionButton("Mark done", "toggle-done", task.id, "button-primary"),
    task.lane === "focus"
      ? createActionButton("Send to inbox", "send-inbox", task.id)
      : createActionButton("Put in focus", "promote-focus", task.id)
  );

  panel.append(lead, title, notes, strip, actions);
  els.recommendationCard.append(panel);
}

function createTaskCard(task) {
  const node = els.taskCardTemplate.content.firstElementChild.cloneNode(true);
  node.classList.toggle("is-done", task.done);
  node.classList.toggle("is-carryover", isCarryoverTask(task));

  const chips = node.querySelectorAll(".task-chip");
  chips[0].textContent = task.urgency;
  chips[1].textContent = task.energy;
  chips[2].textContent = `${task.duration} min`;

  node.querySelector(".task-title").textContent = task.title;
  node.querySelector(".task-notes").textContent = task.notes || "No extra notes.";

  const flags = node.querySelector(".task-flags");
  if (isCarryoverTask(task)) flags.append(createFlag("Carryover"));
  if (!task.done) flags.append(createFlag(slotLabel(task.slot)));
  if (task.lane === "personal") flags.append(createFlag("Personal"));
  if (task.lane === "admin") flags.append(createFlag("Admin"));

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

  if (!task.done) {
    actions.append(createActionButton("Move slot", "cycle-slot", task.id));
  }

  actions.append(createActionButton("Delete", "delete-task", task.id, "danger"));
  return node;
}

function updateStats() {
  const openTasks = state.tasks.filter((task) => !task.done);
  const doneToday = state.tasks.filter(
    (task) => task.done && task.completedAt && dateKey(task.completedAt) === state.todayKey
  );
  const carryover = openTasks.filter(isCarryoverTask);
  const focusTasks = openTasks.filter((task) => task.lane === "focus");
  const inboxTasks = openTasks.filter((task) => ["inbox", "personal", "admin"].includes(task.lane));
  const plannedMinutes = openTasks.reduce((sum, task) => sum + task.duration, 0);

  els.openCount.textContent = String(openTasks.length);
  els.doneCount.textContent = String(doneToday.length);
  els.plannedMinutes.textContent = String(plannedMinutes);
  els.carryoverCount.textContent = String(carryover.length);
  els.focusCountBadge.textContent = String(focusTasks.length);
  els.inboxCountBadge.textContent = String(inboxTasks.length);
  els.doneCountBadge.textContent = String(doneToday.length);
  els.loadFill.style.width = `${Math.min(100, (plannedMinutes / 360) * 100)}%`;
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
    task.lane = index < 3 ? "focus" : task.lane === "focus" ? "inbox" : task.lane;
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
    return;
  }

  if (action === "cycle-slot") {
    const response = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ slot: nextSlot(task.slot) }),
    });
    replaceTask(response.task);
    render();
  }
}

function scheduleNotesSave() {
  state.dailyNotes[state.todayKey] = {
    intention: els.intentionInput.value,
    reflection: els.reflectionInput.value,
  };
  window.clearTimeout(noteSaveTimer);
  noteSaveTimer = window.setTimeout(saveNotes, 350);
}

async function saveNotes() {
  const payload = {
    intention: els.intentionInput.value,
    reflection: els.reflectionInput.value,
  };

  const response = await api(`/api/notes/${state.todayKey}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  state.dailyNotes[state.todayKey] = response.notes;
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

function getRecommendedTask() {
  const openTasks = state.tasks.filter((task) => !task.done);
  if (openTasks.length === 0) {
    return null;
  }

  return openTasks.slice().sort((a, b) => getTaskScore(b) - getTaskScore(a))[0];
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

function recommendationReason(task) {
  if (task.energy === "deep") return "Best tackled before your attention fragments";
  if (task.duration <= 30) return "Fits a quick momentum block";
  if (isCarryoverTask(task)) return "Carryover worth clearing";
  return "A strong match for the current part of the day";
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

function nextSlot(slot) {
  if (slot === "morning") return "afternoon";
  if (slot === "afternoon") return "evening";
  return "morning";
}

function isCarryoverTask(task) {
  return !task.done && task.dayKey !== state.todayKey;
}

function createFlag(text) {
  const flag = document.createElement("span");
  flag.className = "flag";
  flag.textContent = text;
  return flag;
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

function replaceTask(updatedTask) {
  const index = state.tasks.findIndex((item) => item.id === updatedTask.id);
  if (index >= 0) {
    state.tasks[index] = updatedTask;
  }
}

function slotLabel(slot) {
  if (slot === "morning") return "Morning";
  if (slot === "afternoon") return "Afternoon";
  if (slot === "evening") return "Evening";
  return "Flexible";
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
