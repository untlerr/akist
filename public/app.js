const els = {
  todayLabel: document.querySelector("#todayLabel"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
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
};

init();

async function init() {
  bindEvents();
  renderDate();

  try {
    const bootstrap = await api("/api/bootstrap");
    state.tasks = Array.isArray(bootstrap.data.tasks) ? bootstrap.data.tasks : [];
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
  els.toggleCompletedBtn.addEventListener("click", toggleCompleted);
  document.addEventListener("click", handleTaskAction);
  document.addEventListener("keydown", handleShortcuts);
}

function renderDate() {
  const now = new Date();
  els.todayLabel.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
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

  const deleteButton = node.querySelector(".task-action");
  deleteButton.dataset.action = "delete-task";
  deleteButton.dataset.id = task.id;

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
  render();
  els.taskTitle.focus();
}

function handleSearch(event) {
  state.search = event.target.value.trim().toLowerCase();
  render();
}

function toggleCompleted() {
  state.showCompleted = !state.showCompleted;
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
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
