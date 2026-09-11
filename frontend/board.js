/**
 * DevFlow Kanban Board Application Logic
 * Integrates with FastAPI Backend & PostgreSQL
 */

// =============================================================================
// API Configuration & State
// =============================================================================
// Dynamically determine the backend API base URL
// Allows storing a custom API URL (e.g. for Vercel -> backend connection) in localStorage
let API_BASE = localStorage.getItem('kanban_api_url') || window.__API_URL__ || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : 'http://localhost:8000'
);

let allTasks = [];
let editingTaskId = null;
let draggedTaskId = null;
let currentSearchTerm = '';

// DOM Elements
const taskListTodo = document.getElementById('task-list-todo');
const taskListProgress = document.getElementById('task-list-progress');
const taskListDone = document.getElementById('task-list-done');

const countTodo = document.getElementById('count-todo');
const countProgress = document.getElementById('count-progress');
const countDone = document.getElementById('count-done');

const statTotal = document.getElementById('stat-total');
const statTodo = document.getElementById('stat-todo');
const statProgress = document.getElementById('stat-progress');
const statDone = document.getElementById('stat-done');

const connectionStatus = document.getElementById('connection-status');
const statusLabel = document.getElementById('status-label');

const taskModal = document.getElementById('task-modal');
const modalHeading = document.getElementById('modal-heading');
const taskForm = document.getElementById('task-form');
const taskIdInput = document.getElementById('task-id-input');
const taskTitleInput = document.getElementById('task-title-input');
const taskDescInput = document.getElementById('task-desc-input');
const taskStatusSelect = document.getElementById('task-status-select');

const btnAddTask = document.getElementById('btn-add-task');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const searchInput = document.getElementById('search-input');
const toastContainer = document.getElementById('toast-container');

// Quick Add buttons on column headers
const btnQuickTodo = document.getElementById('btn-quick-todo');
const btnQuickProgress = document.getElementById('btn-quick-progress');
const btnQuickDone = document.getElementById('btn-quick-done');

// =============================================================================
// Initialization
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkBackendHealth();
  fetchTasks();

  // Periodic health check every 15 seconds
  setInterval(checkBackendHealth, 15000);
});

// =============================================================================
// Event Listeners
// =============================================================================
function setupEventListeners() {
  // Modal opening
  btnAddTask.addEventListener('click', () => openCreateModal('To Do'));
  btnQuickTodo.addEventListener('click', () => openCreateModal('To Do'));
  btnQuickProgress.addEventListener('click', () => openCreateModal('In Progress'));
  btnQuickDone.addEventListener('click', () => openCreateModal('Done'));

  // Modal closing
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);
  taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) closeModal();
  });

  // Allow clicking connection status indicator to change/view backend API URL
  connectionStatus.style.cursor = 'pointer';
  connectionStatus.title = `Backend: ${API_BASE} (Click to configure)`;
  connectionStatus.addEventListener('click', () => {
    const newUrl = prompt('Enter Backend API URL (e.g., http://localhost:8000 or your remote backend URL):', API_BASE);
    if (newUrl !== null && newUrl.trim() !== '') {
      localStorage.setItem('kanban_api_url', newUrl.trim().replace(/\/+$/, ''));
      window.location.reload();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && taskModal.classList.contains('active')) {
      closeModal();
    }
  });

  // Form submit
  taskForm.addEventListener('submit', handleFormSubmit);

  // Search input
  searchInput.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.trim().toLowerCase();
    renderTasks();
  });

  // Setup Drag & Drop on Kanban Columns
  setupDragAndDropColumns();
}

// =============================================================================
// Backend API Integration
// =============================================================================

/**
 * Check backend connection health status
 */
async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET' });
    if (res.ok) {
      connectionStatus.className = 'status-indicator connected';
      statusLabel.textContent = 'API Connected';
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    connectionStatus.className = 'status-indicator error';
    statusLabel.textContent = 'API Offline';
  }
}

/**
 * Fetch all tasks from GET /tasks
 */
async function fetchTasks() {
  try {
    const response = await fetch(`${API_BASE}/tasks`);
    if (!response.ok) {
      throw new Error(`Failed to load tasks (Status: ${response.status})`);
    }
    allTasks = await response.json();
    renderTasks();
  } catch (error) {
    console.error('Error fetching tasks:', error);
    showToast(`Could not load tasks from ${API_BASE}. Ensure backend is running.`, 'error');
  }
}

/**
 * Create a new task via POST /tasks
 */
async function createTask(payload) {
  try {
    const response = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to create task');
    }

    const newTask = await response.json();
    allTasks.push(newTask);
    renderTasks();
    showToast(`Task "${newTask.title}" created successfully!`, 'success');
    closeModal();
  } catch (error) {
    console.error('Error creating task:', error);
    showToast(error.message, 'error');
  }
}

/**
 * Update an existing task via PUT /tasks/{task_id}
 */
async function updateTask(taskId, payload) {
  try {
    const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to update task');
    }

    const updatedTask = await response.json();
    const index = allTasks.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      allTasks[index] = updatedTask;
    }
    renderTasks();
    showToast(`Task updated successfully!`, 'success');
    closeModal();
  } catch (error) {
    console.error('Error updating task:', error);
    showToast(error.message, 'error');
  }
}

/**
 * Quick status move via PUT /tasks/{task_id}
 */
async function moveTaskStatus(taskId, newStatus) {
  try {
    const currentTask = allTasks.find((t) => t.id === taskId);
    if (!currentTask) return;

    // Use PUT /tasks/{task_id} to update status
    const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: currentTask.title,
        description: currentTask.description,
        status: newStatus,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update status`);
    }

    const updated = await response.json();
    const index = allTasks.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      allTasks[index] = updated;
    }
    renderTasks();
    showToast(`Moved task to "${newStatus}"`, 'info');
  } catch (error) {
    console.error('Error moving task status:', error);
    showToast('Failed to move task status', 'error');
  }
}

/**
 * Delete a task via DELETE /tasks/{task_id}
 */
async function deleteTask(taskId, taskTitle) {
  if (!confirm(`Are you sure you want to delete "${taskTitle}"?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete task');
    }

    allTasks = allTasks.filter((t) => t.id !== taskId);
    renderTasks();
    showToast(`Task "${taskTitle}" deleted.`, 'info');
  } catch (error) {
    console.error('Error deleting task:', error);
    showToast('Failed to delete task', 'error');
  }
}

// =============================================================================
// Rendering & DOM Updates
// =============================================================================
function renderTasks() {
  // Filter tasks if search term is active
  const filtered = allTasks.filter((task) => {
    if (!currentSearchTerm) return true;
    const matchTitle = (task.title || '').toLowerCase().includes(currentSearchTerm);
    const matchDesc = (task.description || '').toLowerCase().includes(currentSearchTerm);
    return matchTitle || matchDesc;
  });

  // Group by status
  const todoTasks = filtered.filter((t) => t.status === 'To Do');
  const progressTasks = filtered.filter((t) => t.status === 'In Progress');
  const doneTasks = filtered.filter((t) => t.status === 'Done');

  // Update counts
  countTodo.textContent = todoTasks.length;
  countProgress.textContent = progressTasks.length;
  countDone.textContent = doneTasks.length;

  statTotal.textContent = allTasks.length;
  statTodo.textContent = allTasks.filter((t) => t.status === 'To Do').length;
  statProgress.textContent = allTasks.filter((t) => t.status === 'In Progress').length;
  statDone.textContent = allTasks.filter((t) => t.status === 'Done').length;

  // Render columns
  renderColumn(taskListTodo, todoTasks, 'To Do');
  renderColumn(taskListProgress, progressTasks, 'In Progress');
  renderColumn(taskListDone, doneTasks, 'Done');
}

function renderColumn(container, tasks, columnStatus) {
  container.innerHTML = '';

  if (tasks.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'empty-placeholder';
    placeholder.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        <line x1="9" y1="12" x2="15" y2="12"></line>
      </svg>
      <span>No tasks in ${columnStatus}</span>
    `;
    container.appendChild(placeholder);
    return;
  }

  tasks.forEach((task) => {
    const card = createTaskCardElement(task);
    container.appendChild(card);
  });
}

function createTaskCardElement(task) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.id = `task-card-${task.id}`;
  card.setAttribute('draggable', 'true');
  card.dataset.id = task.id;

  // Format date
  const createdDate = task.created_at ? new Date(task.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  }) : 'Recently';

  // Navigation arrows based on column
  let moveButtonsHtml = '';
  if (task.status === 'To Do') {
    moveButtonsHtml = `<button class="move-btn" onclick="moveTaskStatus(${task.id}, 'In Progress')" title="Move to In Progress">Move to Progress &rarr;</button>`;
  } else if (task.status === 'In Progress') {
    moveButtonsHtml = `
      <button class="move-btn" onclick="moveTaskStatus(${task.id}, 'To Do')" title="Move back to To Do">&larr; To Do</button>
      <button class="move-btn" onclick="moveTaskStatus(${task.id}, 'Done')" title="Mark as Done">Done &rarr;</button>
    `;
  } else if (task.status === 'Done') {
    moveButtonsHtml = `<button class="move-btn" onclick="moveTaskStatus(${task.id}, 'In Progress')" title="Reopen task">&larr; Reopen</button>`;
  }

  card.innerHTML = `
    <div class="card-header">
      <span class="card-tag">#${task.id}</span>
      <div class="card-actions">
        <button class="action-btn" onclick="openEditModal(${task.id})" title="Edit Task" aria-label="Edit Task">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button class="action-btn btn-delete" onclick="deleteTask(${task.id}, '${escapeHtml(task.title)}')" title="Delete Task" aria-label="Delete Task">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
    <h3 class="card-title">${escapeHtml(task.title)}</h3>
    ${task.description ? `<p class="card-description">${escapeHtml(task.description)}</p>` : ''}
    <div class="card-footer">
      <span class="card-date">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        ${createdDate}
      </span>
      <div class="card-move-actions">
        ${moveButtonsHtml}
      </div>
    </div>
  `;

  // Drag listeners
  card.addEventListener('dragstart', (e) => {
    draggedTaskId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(task.id));
  });

  card.addEventListener('dragend', () => {
    draggedTaskId = null;
    card.classList.remove('dragging');
    document.querySelectorAll('.kanban-column').forEach((col) => col.classList.remove('drag-over'));
  });

  return card;
}

// =============================================================================
// Drag and Drop Logic
// =============================================================================
function setupDragAndDropColumns() {
  const columns = document.querySelectorAll('.kanban-column');

  columns.forEach((column) => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', (e) => {
      // Check if mouse really left the column
      if (!column.contains(e.relatedTarget)) {
        column.classList.remove('drag-over');
      }
    });

    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      const targetStatus = column.dataset.status;

      const rawId = e.dataTransfer.getData('text/plain') || draggedTaskId;
      const taskId = parseInt(rawId, 10);

      if (taskId && targetStatus) {
        const task = allTasks.find((t) => t.id === taskId);
        if (task && task.status !== targetStatus) {
          moveTaskStatus(taskId, targetStatus);
        }
      }
    });
  });
}

// =============================================================================
// Modal Management
// =============================================================================
function openCreateModal(defaultStatus = 'To Do') {
  editingTaskId = null;
  modalHeading.textContent = 'Create New Task';
  taskIdInput.value = '';
  taskTitleInput.value = '';
  taskDescInput.value = '';
  taskStatusSelect.value = defaultStatus;

  taskModal.classList.add('active');
  taskModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => taskTitleInput.focus(), 100);
}

function openEditModal(taskId) {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;
  modalHeading.textContent = `Edit Task #${taskId}`;
  taskIdInput.value = String(task.id);
  taskTitleInput.value = task.title;
  taskDescInput.value = task.description || '';
  taskStatusSelect.value = task.status;

  taskModal.classList.add('active');
  taskModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => taskTitleInput.focus(), 100);
}

function closeModal() {
  taskModal.classList.remove('active');
  taskModal.setAttribute('aria-hidden', 'true');
  editingTaskId = null;
}

function handleFormSubmit(e) {
  e.preventDefault();
  const title = taskTitleInput.value.trim();
  const description = taskDescInput.value.trim();
  const status = taskStatusSelect.value;

  if (!title) {
    showToast('Task title is required.', 'error');
    taskTitleInput.focus();
    return;
  }

  const payload = {
    title,
    description: description || null,
    status,
  };

  if (editingTaskId) {
    updateTask(editingTaskId, payload);
  } else {
    createTask(payload);
  }
}

// =============================================================================
// Toast Notifications
// =============================================================================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  } else {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
