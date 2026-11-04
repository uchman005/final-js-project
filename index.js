const STORAGE_KEY = "tasks";
const PRIORITIES = ["high", "medium", "low"];
const EMPTY_TEXT = {
  all: "No tasks yet. Add your first task above.",
  pending: "Nothing pending. Nice work!",
  completed: "No completed tasks yet.",
  overdue: "No overdue tasks."
};
const FILTERS = {
  all: () => true,
  pending: (task) => !task.completed,
  completed: (task) => task.completed,
  overdue: (task) => isOverdue(task)
};

function query(selector) { return document.querySelector(selector) }
const today = query("#today");
const form = query("#task-form");
const formTitle = query("#form-title");
const submitButton = query("#submit-btn");
const cancelButton = query("#cancel-btn");
const taskList = query("#task-list");
const empty = query("#empty");
const titleInput = query("#title");
const descriptionInput = query("#description");
const priorityInput = query("#priority");
const dueDateInput = query("#due-date");

const tasks = loadTasks();
let activeTab = "all";
let editingId = null;
const items = new Map(); // task id -> its <li>, built once and updated in place

/** Returns the task's <li>, building its skeleton the first time. */
function getTaskItem(task) {
  let item = items.get(task.id);
  if (!item) {
    item = el("li", "card task",
      iconButton("", "", "check"),
      el("div", "task-body",
        el("p", "task-title"),
        el("p", "task-desc"),
        el("p", "task-meta", el("span", ""), " · ", el("span", ""))),
      iconButton("edit", "Edit task", "edit"),
      iconButton("delete", "Delete task", "delete"));
    item.id = task.id;
    items.set(task.id, item);
  }
  updateTaskItem(item, task);
  return item;
}

/** Writes the task's current data into its existing <li>. */
function updateTaskItem(item, task) {
  const [checkButton, body] = item.children;
  const [title, description, meta] = body.children;
  const [priority, due] = meta.children;
  const overdue = isOverdue(task);
  const label = task.completed ? "Mark as pending" : "Mark as completed";

  item.classList.toggle("done", task.completed);
  checkButton.firstChild.textContent = task.completed ? "check_circle" : "radio_button_unchecked";
  checkButton.title = label;
  checkButton.setAttribute("aria-label", label);
  title.textContent = task.title;
  description.textContent = task.description;
  description.hidden = !task.description;
  priority.className = task.priority;
  priority.textContent = `${capitalize(task.priority)} priority`;
  due.className = overdue ? "overdue" : "";
  due.textContent = `${overdue ? "Overdue ·" : "Due"} ${formatDate(task.dueDate)}`;
}

/** Filters and sorts the tasks, then shows their (reused) items in that order. */
function render() {
  const visible = tasks.filter(FILTERS[activeTab]).sort(compareTasks);
  taskList.replaceChildren(...visible.map(getTaskItem));
  empty.hidden = visible.length > 0;
  empty.textContent = EMPTY_TEXT[activeTab];
  for (const name in FILTERS) {
    const tab = query(`#tab-${name}`);
    tab.classList.toggle("active", name === activeTab);
    tab.setAttribute("aria-selected", name === activeTab);
    query(`#count-${name}`).textContent = tasks.filter(FILTERS[name]).length;
  }
}

function validateForm() {
  titleInput.value = titleInput.value.trim();
  descriptionInput.value = descriptionInput.value.trim();
  const lower = titleInput.value.toLowerCase();
  const duplicate = tasks.some((task) => task.id !== editingId && task.title.toLowerCase() === lower);
  titleInput.setCustomValidity(duplicate ? "You already have a task with this title." : "");
  return form.reportValidity();
}

function setEditing(task) {
  const todayString = getTodayString();
  editingId = task?.id ?? null;
  form.reset();
  formTitle.textContent = task ? "Edit task" : "Add a task";
  submitButton.textContent = task ? "Save changes" : "Add task";
  cancelButton.hidden = !task;
  dueDateInput.min = task && task.dueDate < todayString ? task.dueDate : todayString;
  if (!task) return;

  titleInput.value = task.title;
  descriptionInput.value = task.description;
  priorityInput.value = task.priority;
  dueDateInput.value = task.dueDate;
  form.scrollIntoView({ behavior: "smooth" });
  titleInput.focus({ preventScroll: true });
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!validateForm()) return;
  const data = {
    title: titleInput.value,
    description: descriptionInput.value,
    priority: priorityInput.value,
    dueDate: dueDateInput.value
  };
  let task = findTask(editingId);
  if (task) Object.assign(task, data);
  else tasks.push((task = { id: generateId(), ...data, completed: false, createdAt: Date.now() }));
  if (!FILTERS[activeTab](task)) activeTab = "all";
  setEditing();
  render();
  saveTasks();
}

function toggleTask(task) {
  task.completed = !task.completed;
  render();
  saveTasks();
}

function deleteTask(task) {
  if (!confirm("Delete this task?")) return;
  tasks.splice(tasks.indexOf(task), 1);
  items.delete(task.id);
  if (editingId === task.id) setEditing();
  saveTasks();
  render();
}


form.addEventListener("submit", handleFormSubmit);
titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));
cancelButton.addEventListener("click", () => setEditing());
// Delegated: task items come and go, so one listener on the list handles all their buttons.
taskList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const task = findTask(button.closest(".task").id);
  if (button.classList.contains("check")) toggleTask(task);
  else if (button.classList.contains("edit")) setEditing(task);
  else if (button.classList.contains("delete")) deleteTask(task);
});
for (const name in FILTERS) {
  query(`#tab-${name}`).addEventListener("click", () => {
    activeTab = name;
    render();
  });
}

today.textContent = new Date().toLocaleDateString("en-us", { weekday: "long", day: "numeric", month: "long" });
dueDateInput.min = getTodayString();
render();


function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved.filter((task) => task?.id && PRIORITIES.includes(task.priority)) : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.error("Could not save tasks:", error);
  }
}

function findTask(id) {
  return tasks.find((task) => task.id === id);
}

function compareTasks(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
}

/** Creates an element; strings and nodes in `children` are appended. */
function el(tag, className, ...children) {
  const element = document.createElement(tag);
  element.className = className;
  element.append(...children);
  return element;
}

function iconButton(icon, label, className = "") {
  const button = el("button", `icon-btn ${className}`, el("span", "material-icons-round", icon));
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

function getTodayString() {
  const now = new Date();
  return new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function isOverdue(task) {
  return !task.completed && task.dueDate < getTodayString();
}

function formatDate(date) {
  return new Date(`${date}T00:00`).toLocaleDateString("en-us", { day: "numeric", month: "short", year: "numeric" });
}

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}

function generateId() {
  return Date.now().toString();
}
