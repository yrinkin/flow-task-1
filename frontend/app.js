"use strict";

const API_BASE = "/api";
const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const SEARCH_DELAY_MS = 300;
const STATUSES = [
  { value: "TODO", label: "할 일" },
  { value: "DOING", label: "진행 중" },
  { value: "DONE", label: "완료" },
];
const PRIORITIES = [
  { value: "HIGH", label: "높음" },
  { value: "NORMAL", label: "보통" },
  { value: "LOW", label: "낮음" },
];
const DEFAULT_PRIORITY = "NORMAL";
// 회원 규칙(API-SPEC.md). 서버도 같은 규칙으로 다시 검증한다.
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const LOGIN_REQUIRED_NOTICE = "로그인이 필요합니다. 다시 로그인하세요.";

// 로그인한 사용자({id, username, created_at}). 로그인하지 않았으면 null.
// 세션 쿠키는 HttpOnly라 JavaScript에서 읽지 않으며, 로그인 여부는 /api/auth/me 응답으로 판단한다.
let currentUser = null;

// 마지막으로 API에서 받은 목록(검색·필터 적용 결과).
let tasks = [];
let loadFailed = false;
// 늦게 도착한 이전 목록 응답이 최신 결과를 덮어쓰지 않도록 요청 번호를 비교한다.
let listRequestId = 0;
let searchTimer = null;
// 수정 중인 항목의 id. 한 번에 하나만 수정한다.
let editingId = null;
let editError = "";
// 수정을 시작하거나 수정 오류가 났을 때만 수정 입력칸으로 포커스를 옮긴다.
let focusEditForm = false;
// 제목 검색, 상태, 우선순위 필터. 빈 값은 조건 없음이며 API에서 AND로 적용한다.
const filters = { query: "", status: "", priority: "" };

const form = document.getElementById("task-form");
const titleInput = document.getElementById("task-title");
const descriptionInput = document.getElementById("task-description");
const priorityInput = document.getElementById("task-priority");
const dueInput = document.getElementById("task-due");
const submitButton = document.getElementById("submit-button");
const formError = document.getElementById("form-error");
const apiError = document.getElementById("api-error");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("filter-status");
const priorityFilter = document.getElementById("filter-priority");
const taskList = document.getElementById("task-list");
const taskCount = document.getElementById("task-count");
const emptyMessage = document.getElementById("empty-message");
const loadingMessage = document.getElementById("loading-message");
const authView = document.getElementById("auth-view");
const authHeading = document.getElementById("auth-heading");
const authNotice = document.getElementById("auth-notice");
const authError = document.getElementById("auth-error");
const loginForm = document.getElementById("login-form");
const loginUsername = document.getElementById("login-username");
const loginPassword = document.getElementById("login-password");
const loginButton = document.getElementById("login-button");
const signupForm = document.getElementById("signup-form");
const signupUsername = document.getElementById("signup-username");
const signupPassword = document.getElementById("signup-password");
const signupPasswordConfirm = document.getElementById("signup-password-confirm");
const signupButton = document.getElementById("signup-button");
const showSignupButton = document.getElementById("show-signup");
const showLoginButton = document.getElementById("show-login");
const appView = document.getElementById("app-view");
const userBar = document.getElementById("user-bar");
const currentUserLabel = document.getElementById("current-user");
const logoutButton = document.getElementById("logout-button");

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// FastAPI 오류 응답({"detail": ...})을 화면에 보여 줄 문장으로 바꾼다.
function errorMessage(body, status) {
  if (body && Array.isArray(body.detail) && body.detail.length > 0) {
    return body.detail.map((item) => String(item.msg).replace(/^Value error, /, "")).join(" ");
  }
  if (body && typeof body.detail === "string") {
    return body.detail;
  }
  return `요청을 처리하지 못했습니다. (HTTP ${status})`;
}

async function request(method, path, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await window.fetch(`${API_BASE}${path}`, options);
  } catch (networkError) {
    throw new ApiError("API 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.", 0);
  }

  if (response.status === 204) {
    return null;
  }
  let data = null;
  try {
    data = await response.json();
  } catch (parseError) {
    data = null;
  }
  if (!response.ok) {
    // 할 일 API에서 401이면 세션이 없거나 만료된 것이다. 목록을 지우고 로그인 화면으로 보낸다.
    if (response.status === 401 && !path.startsWith("/auth/")) {
      handleUnauthorized();
    }
    throw new ApiError(errorMessage(data, response.status), response.status);
  }
  return data;
}

function textLength(value) {
  return Array.from(value).length;
}

// 검증 실패 시 오류 메시지, 통과 시 null을 반환한다. 서버도 같은 규칙으로 다시 검증한다.
function validateTitle(title) {
  const length = textLength(title);
  if (length === 0) {
    return "제목을 입력하세요.";
  }
  if (length > TITLE_MAX_LENGTH) {
    return `제목은 ${TITLE_MAX_LENGTH}자 이하로 입력하세요. (현재 ${length}자)`;
  }
  return null;
}

function validateDescription(description) {
  const length = textLength(description);
  if (length > DESCRIPTION_MAX_LENGTH) {
    return `설명은 ${DESCRIPTION_MAX_LENGTH}자 이하로 입력하세요. (현재 ${length}자)`;
  }
  return null;
}

// YYYY-MM-DD 형식이면서 실제 존재하는 날짜인지 확인한다.
function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function validateTaskInput(input) {
  return (
    validateTitle(input.title) ||
    validateDescription(input.description) ||
    (isValidPriority(input.priority) ? null : "우선순위가 올바르지 않습니다.") ||
    (input.due_date !== null && !isValidDate(input.due_date)
      ? "마감일은 YYYY-MM-DD 형식의 올바른 날짜여야 합니다."
      : null)
  );
}

// 입력값을 API 요청 형식으로 정리한다. 빈 마감일은 null이다.
function readTaskInput(title, description, priority, dueDate) {
  return {
    title: title.trim(),
    description,
    priority,
    due_date: dueDate === "" ? null : dueDate,
  };
}

function isValidPriority(priority) {
  return PRIORITIES.some((item) => item.value === priority);
}

function labelOf(list, value) {
  const found = list.find((item) => item.value === value);
  return found ? found.label : value;
}

function findTask(id) {
  return tasks.find((task) => task.id === id);
}

function hasFilters() {
  return filters.query.trim() !== "" || filters.status !== "" || filters.priority !== "";
}

function listPath() {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  if (query !== "") {
    params.set("q", query);
  }
  if (filters.status !== "") {
    params.set("status", filters.status);
  }
  if (filters.priority !== "") {
    params.set("priority", filters.priority);
  }
  const queryString = params.toString();
  return queryString === "" ? "/tasks" : `/tasks?${queryString}`;
}

// API에서 현재 검색·필터 조건의 목록을 다시 받아 화면을 그린다.
async function loadTasks() {
  if (!currentUser) {
    return;
  }
  const requestId = ++listRequestId;
  try {
    const data = await request("GET", listPath());
    if (requestId !== listRequestId) {
      return;
    }
    tasks = data;
    loadFailed = false;
    apiError.textContent = "";
  } catch (error) {
    if (requestId !== listRequestId || error.status === 401) {
      return;
    }
    loadFailed = true;
    apiError.textContent = `목록을 불러오지 못했습니다. ${error.message}`;
  }
  render();
}

// 변경 요청을 보내고 결과와 관계없이 목록을 다시 받는다. 실패하면 오류를 표시한다.
async function runAction(action) {
  let message = "";
  try {
    await action();
  } catch (error) {
    if (error.status === 401) {
      return;
    }
    message = error.message;
  }
  await loadTasks();
  if (message) {
    apiError.textContent = message;
  }
}

// 로컬 달력 기준 오늘 날짜(YYYY-MM-DD).
function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isOverdue(task, today) {
  return task.due_date !== null && task.status !== "DONE" && task.due_date < today;
}

function changeStatus(id, status) {
  return runAction(() => request("PATCH", `/tasks/${id}`, { status }));
}

function startEdit(id) {
  editingId = id;
  editError = "";
  focusEditForm = true;
  render();
}

function cancelEdit() {
  editingId = null;
  editError = "";
  render();
}

function showEditError(message) {
  editError = message;
  focusEditForm = true;
  render();
}

async function saveEdit(id, input) {
  const error = validateTaskInput(input);
  if (error) {
    showEditError(error);
    return;
  }
  try {
    await request("PATCH", `/tasks/${id}`, input);
  } catch (requestError) {
    if (requestError.status === 401) {
      return;
    }
    if (requestError.status === 404) {
      // 이미 삭제된 항목이면 수정 폼을 닫고 최신 목록을 보여 준다.
      editingId = null;
      editError = "";
      await loadTasks();
      apiError.textContent = requestError.message;
      return;
    }
    // 입력 오류나 연결 실패는 입력한 내용을 유지한 채 오류를 보여 준다.
    showEditError(requestError.message);
    return;
  }
  editingId = null;
  editError = "";
  await loadTasks();
}

function deleteTask(id) {
  const task = findTask(id);
  if (!task) {
    return Promise.resolve();
  }
  if (!window.confirm(`"${task.title}" 할 일을 삭제할까요?`)) {
    return Promise.resolve();
  }
  if (editingId === id) {
    editingId = null;
    editError = "";
  }
  return runAction(() => request("DELETE", `/tasks/${id}`));
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createSelect(options, value, ariaLabel) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", ariaLabel);
  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  }
  select.value = value;
  return select;
}

function createStatusSelect(task) {
  const select = createSelect(STATUSES, task.status, "상태");
  select.addEventListener("change", () => changeStatus(task.id, select.value));
  return select;
}

function createEditForm(task) {
  const container = document.createElement("div");
  container.className = "task-edit";

  const titleField = document.createElement("input");
  titleField.type = "text";
  titleField.value = task.title;
  titleField.setAttribute("aria-label", "제목 수정");

  const descriptionField = document.createElement("textarea");
  descriptionField.rows = 3;
  descriptionField.value = task.description;
  descriptionField.setAttribute("aria-label", "설명 수정");
  descriptionField.placeholder = "설명 (최대 2000자)";

  const priorityField = createSelect(PRIORITIES, task.priority, "우선순위 수정");

  const dueField = document.createElement("input");
  dueField.type = "date";
  dueField.value = task.due_date === null ? "" : task.due_date;
  dueField.setAttribute("aria-label", "마감일 수정");

  const save = () =>
    saveEdit(
      task.id,
      readTaskInput(titleField.value, descriptionField.value, priorityField.value, dueField.value)
    );

  titleField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      save();
    }
  });
  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cancelEdit();
    }
  });

  const options = document.createElement("div");
  options.className = "form-row";
  options.appendChild(priorityField);
  options.appendChild(dueField);
  options.appendChild(createButton("저장", save));
  options.appendChild(createButton("취소", cancelEdit));

  container.appendChild(titleField);
  container.appendChild(descriptionField);
  container.appendChild(options);
  return { container, focusTarget: titleField };
}

function createBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`;
  badge.textContent = text;
  return badge;
}

function createTaskItem(task, today) {
  const item = document.createElement("li");
  item.dataset.id = String(task.id);
  const classes = [];
  if (task.status === "DONE") {
    classes.push("done");
  }
  if (isOverdue(task, today)) {
    classes.push("overdue");
  }
  item.className = classes.join(" ");

  if (task.id === editingId) {
    const { container, focusTarget } = createEditForm(task);
    item.appendChild(container);
    if (editError) {
      const error = document.createElement("p");
      error.className = "form-error";
      error.textContent = editError;
      item.appendChild(error);
    }
    return { item, focusTarget };
  }

  const main = document.createElement("div");
  main.className = "task-main";

  const info = document.createElement("div");
  info.className = "task-info";

  const title = document.createElement("span");
  title.className = "task-title";
  // 사용자 입력은 HTML로 해석하지 않고 글자로만 표시한다.
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.appendChild(
    createBadge(labelOf(PRIORITIES, task.priority), `priority-${task.priority.toLowerCase()}`)
  );
  if (task.due_date !== null) {
    meta.appendChild(createBadge(`마감 ${task.due_date}`, "due"));
  }
  if (isOverdue(task, today)) {
    meta.appendChild(createBadge("지연", "overdue-badge"));
  }

  info.appendChild(title);
  info.appendChild(meta);
  if (task.description !== "") {
    const description = document.createElement("p");
    description.className = "task-description";
    description.textContent = task.description;
    info.appendChild(description);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.appendChild(createStatusSelect(task));
  actions.appendChild(createButton("수정", () => startEdit(task.id)));
  actions.appendChild(createButton("삭제", () => deleteTask(task.id)));

  main.appendChild(info);
  main.appendChild(actions);
  item.appendChild(main);
  return { item, focusTarget: null };
}

function render() {
  taskList.replaceChildren();
  const today = todayString();
  let focusTarget = null;

  for (const task of tasks) {
    const created = createTaskItem(task, today);
    taskList.appendChild(created.item);
    if (created.focusTarget) {
      focusTarget = created.focusTarget;
    }
  }

  taskCount.textContent = hasFilters() ? `(검색 결과 ${tasks.length})` : `(${tasks.length})`;
  emptyMessage.hidden = tasks.length > 0;
  if (loadFailed && tasks.length === 0) {
    emptyMessage.textContent = "목록을 불러오지 못했습니다.";
  } else {
    emptyMessage.textContent = hasFilters()
      ? "조건에 맞는 할 일이 없습니다."
      : "등록된 할 일이 없습니다.";
  }
  if (focusTarget && focusEditForm) {
    focusTarget.focus();
  }
  focusEditForm = false;
}

function resetForm() {
  titleInput.value = "";
  descriptionInput.value = "";
  priorityInput.value = DEFAULT_PRIORITY;
  dueInput.value = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) {
    return;
  }

  const input = readTaskInput(
    titleInput.value,
    descriptionInput.value,
    priorityInput.value,
    dueInput.value
  );
  const error = validateTaskInput(input);
  if (error) {
    formError.textContent = error;
    titleInput.focus();
    return;
  }

  // 응답을 기다리는 동안 같은 할 일이 두 번 등록되지 않도록 버튼을 잠근다.
  submitButton.disabled = true;
  try {
    await request("POST", "/tasks", input);
  } catch (requestError) {
    if (requestError.status !== 401) {
      formError.textContent = `등록하지 못했습니다. ${requestError.message}`;
    }
    return;
  } finally {
    submitButton.disabled = false;
  }

  formError.textContent = "";
  resetForm();
  titleInput.focus();
  await loadTasks();
});

searchInput.addEventListener("input", () => {
  filters.query = searchInput.value;
  // 글자를 입력할 때마다 요청하지 않도록 입력이 멈춘 뒤 조회한다.
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadTasks, SEARCH_DELAY_MS);
});
statusFilter.addEventListener("change", () => {
  filters.status = statusFilter.value;
  loadTasks();
});
priorityFilter.addEventListener("change", () => {
  filters.priority = priorityFilter.value;
  loadTasks();
});

// ---- 회원가입·로그인·로그아웃 (T21) ----

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function validateSignup(username, password, passwordConfirm) {
  if (!USERNAME_PATTERN.test(username)) {
    return "아이디는 영문 소문자·숫자·밑줄(_) 3~30자여야 합니다.";
  }
  const length = textLength(password);
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자여야 합니다.`;
  }
  if (password !== passwordConfirm) {
    return "비밀번호 확인이 일치하지 않습니다.";
  }
  return null;
}

// 이전 계정의 목록·수정 상태·검색 조건·입력 중인 내용이 다음 계정 화면에 남지 않도록 비운다.
function clearTaskState() {
  listRequestId += 1; // 이전 계정으로 보낸 목록 요청의 늦은 응답은 버린다.
  window.clearTimeout(searchTimer);
  tasks = [];
  loadFailed = false;
  editingId = null;
  editError = "";
  filters.query = "";
  filters.status = "";
  filters.priority = "";
  searchInput.value = "";
  statusFilter.value = "";
  priorityFilter.value = "";
  resetForm();
  formError.textContent = "";
  apiError.textContent = "";
  render();
}

function setAuthMode(mode) {
  const signup = mode === "signup";
  loginForm.hidden = signup;
  signupForm.hidden = !signup;
  authHeading.textContent = signup ? "회원가입" : "로그인";
  authError.textContent = "";
  (signup ? signupUsername : loginUsername).focus();
}

function showAuthView(notice = "", mode = "login") {
  currentUser = null;
  clearTaskState();
  loadingMessage.hidden = true;
  appView.hidden = true;
  userBar.hidden = true;
  currentUserLabel.textContent = "";
  authView.hidden = false;
  loginPassword.value = "";
  signupPassword.value = "";
  signupPasswordConfirm.value = "";
  authNotice.textContent = notice;
  setAuthMode(mode);
}

function showAppView(user) {
  currentUser = user;
  clearTaskState();
  loadingMessage.hidden = true;
  authView.hidden = true;
  authNotice.textContent = "";
  authError.textContent = "";
  // 사용자 입력(아이디)은 글자로만 표시한다.
  currentUserLabel.textContent = user.username;
  userBar.hidden = false;
  appView.hidden = false;
  titleInput.focus();
  loadTasks();
}

function handleUnauthorized() {
  if (currentUser) {
    showAuthView(LOGIN_REQUIRED_NOTICE);
  }
}

async function login(username, password) {
  const user = await request("POST", "/auth/login", { username, password });
  showAppView(user);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginButton.disabled) {
    return;
  }
  const username = loginUsername.value;
  const password = loginPassword.value;
  if (username.trim() === "" || password === "") {
    authError.textContent = "아이디와 비밀번호를 입력하세요.";
    return;
  }
  loginButton.disabled = true;
  try {
    await login(username, password);
  } catch (error) {
    authError.textContent = error.message;
    loginPassword.value = "";
    loginPassword.focus();
  } finally {
    loginButton.disabled = false;
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (signupButton.disabled) {
    return;
  }
  const username = normalizeUsername(signupUsername.value);
  const password = signupPassword.value;
  const error = validateSignup(username, password, signupPasswordConfirm.value);
  if (error) {
    authError.textContent = error;
    return;
  }
  signupButton.disabled = true;
  try {
    await request("POST", "/auth/signup", { username, password });
  } catch (requestError) {
    authError.textContent = requestError.message;
    signupButton.disabled = false;
    return;
  }
  // 가입 API는 세션을 만들지 않으므로 같은 정보로 이어서 로그인한다.
  try {
    await login(username, password);
  } catch (loginError) {
    showAuthView("가입했습니다. 로그인하세요.");
    loginUsername.value = username;
    loginPassword.focus();
  } finally {
    signupButton.disabled = false;
  }
});

showSignupButton.addEventListener("click", () => setAuthMode("signup"));
showLoginButton.addEventListener("click", () => setAuthMode("login"));

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await request("POST", "/auth/logout");
    showAuthView("로그아웃했습니다.");
  } catch (error) {
    apiError.textContent = `로그아웃하지 못했습니다. ${error.message}`;
  } finally {
    logoutButton.disabled = false;
  }
});

// 처음 열 때 로그인 여부를 확인한다.
async function initAuth() {
  try {
    showAppView(await request("GET", "/auth/me"));
  } catch (error) {
    showAuthView();
    if (error.status !== 401) {
      authError.textContent = error.message;
    }
  }
}

initAuth();
