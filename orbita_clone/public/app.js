// State
let profiles = [];
let folders = [];
let currentFolderId = 'all'; // 'all', 'unorganized', or folder id
let currentStatusFilter = 'all'; // 'all', 'running', 'stopped'
let currentProxyFilter = 'all'; // 'all', 'proxied', 'direct'
let currentTagFilter = 'all';
let currentSort = 'name_asc';
let selectedProfileIds = new Set();
let editingProfileId = null;
let currentFingerprint = null;
let isPolling = false;
let currentView = 'profiles';
let systemInfo = null;
let editingFolderId = null;

// Toast Notification
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlide 0.2s reverse forwards';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// Helper: Escape HTML
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper: Clipboard copy
function copyToClipboard(text, label = 'Text') {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label} copied to clipboard!`, 'success', 2000);
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

// -------------------------------------------------------------
// THEME MANAGEMENT (Light & Dark Modes)
// -------------------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem('orbita_theme') || 'dark';
  applyTheme(savedTheme, false);
}

function applyTheme(theme, showFeedback = true) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('orbita_theme', theme);
  
  const icon = document.getElementById('theme-icon');
  const toggleBtn = document.getElementById('btn-theme-toggle');
  
  if (theme === 'light') {
    if (icon) {
      icon.className = 'fa-solid fa-moon';
    }
    if (toggleBtn) {
      toggleBtn.title = 'Switch to Dark Mode';
    }
    if (showFeedback) {
      showToast('Switched to Light Mode', 'info', 2000);
    }
  } else {
    if (icon) {
      icon.className = 'fa-solid fa-sun';
    }
    if (toggleBtn) {
      toggleBtn.title = 'Switch to Light Mode';
    }
    if (showFeedback) {
      showToast('Switched to Dark Mode', 'info', 2000);
    }
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next, true);
}

// -------------------------------------------------------------
// COLUMN RESIZING & SCALING (Interactive draggable headers)
// -------------------------------------------------------------
const DEFAULT_COLUMN_WIDTHS = {
  action: 105,
  profile: 240,
  tags: 130,
  notes: 160,
  proxy: 175,
  engine: 115,
  'last-active': 110,
  created: 115,
  manage: 140
};

const MIN_COLUMN_WIDTHS = {
  action: 80,
  profile: 140,
  tags: 80,
  notes: 90,
  proxy: 110,
  engine: 85,
  'last-active': 80,
  created: 85,
  manage: 100
};

function getSavedColumnWidths() {
  try {
    const raw = localStorage.getItem('orbita_col_widths');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { ...DEFAULT_COLUMN_WIDTHS };
}

function saveColumnWidths(widths) {
  try {
    localStorage.setItem('orbita_col_widths', JSON.stringify(widths));
  } catch (e) {}
}

function applyColumnWidth(colKey, width) {
  const th = document.querySelector(`th[data-col="${colKey}"]`);
  if (!th) return;
  th.style.width = width + 'px';
  th.style.minWidth = width + 'px';
}

function applySavedColumnWidths() {
  const widths = getSavedColumnWidths();
  for (const [col, w] of Object.entries(widths)) {
    applyColumnWidth(col, w);
  }
}

function initResizableColumns() {
  applySavedColumnWidths();

  const resizers = document.querySelectorAll('.data-table th .col-resizer');
  resizers.forEach(resizer => {
    if (resizer.dataset.resizableBound === 'true') return;
    resizer.dataset.resizableBound = 'true';

    const th = resizer.closest('th');
    if (!th) return;
    const colKey = th.getAttribute('data-col');
    if (!colKey) return;

    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e) => {
      const deltaX = e.pageX - startX;
      const minW = MIN_COLUMN_WIDTHS[colKey] || 70;
      const newWidth = Math.max(minW, Math.round(startWidth + deltaX));
      
      th.style.width = newWidth + 'px';
      th.style.minWidth = newWidth + 'px';
    };

    const onMouseUp = () => {
      resizer.classList.remove('resizing');
      document.body.classList.remove('resizing-columns');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const widths = getSavedColumnWidths();
      widths[colKey] = parseInt(th.style.width, 10) || th.offsetWidth;
      saveColumnWidths(widths);
    };

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.pageX;
      startWidth = th.offsetWidth;
      resizer.classList.add('resizing');
      document.body.classList.add('resizing-columns');

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    resizer.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const defW = DEFAULT_COLUMN_WIDTHS[colKey] || 120;
      th.style.width = defW + 'px';
      th.style.minWidth = defW + 'px';
      const widths = getSavedColumnWidths();
      widths[colKey] = defW;
      saveColumnWidths(widths);
      showToast(`Column "${colKey}" reset to default width (${defW}px)`, 'info', 1800);
    });
  });
}

// -------------------------------------------------------------
// GOLOGIN-STYLE COLUMN & SECTION VISIBILITY CUSTOMIZER
// -------------------------------------------------------------
const COLUMN_SECTIONS_CONFIG = [
  {
    category: 'Proxies',
    columns: [
      { id: 'proxy', label: 'Proxy & Latency', default: true }
    ]
  },
  {
    category: 'Profile Notes',
    columns: [
      { id: 'tags', label: 'Tags', default: true },
      { id: 'notes', label: 'Notes', default: false }
    ]
  },
  {
    category: 'Profile Info',
    columns: [
      { id: 'action', label: 'Action Button', default: true },
      { id: 'engine', label: 'Browser Engine', default: true },
      { id: 'manage', label: 'Manage Actions', default: true }
    ]
  },
  {
    category: 'Date & Time',
    columns: [
      { id: 'last-active', label: 'Last Active', default: true },
      { id: 'created', label: 'Created Date', default: false }
    ]
  }
];

function getDefaultColumnVisibility() {
  const vis = {};
  for (const sec of COLUMN_SECTIONS_CONFIG) {
    for (const col of sec.columns) {
      vis[col.id] = col.default;
    }
  }
  return vis;
}

function getColumnVisibility() {
  try {
    const raw = localStorage.getItem('orbita_visible_columns');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...getDefaultColumnVisibility(), ...parsed };
    }
  } catch (e) {}
  return getDefaultColumnVisibility();
}

function saveColumnVisibility(vis) {
  try {
    localStorage.setItem('orbita_visible_columns', JSON.stringify(vis));
  } catch (e) {}
}

function applyColumnVisibility(vis) {
  let styleEl = document.getElementById('dynamic-column-visibility-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-column-visibility-style';
    document.head.appendChild(styleEl);
  }

  const hiddenSelectors = [];
  for (const [colId, isVisible] of Object.entries(vis)) {
    if (!isVisible) {
      hiddenSelectors.push(`[data-col="${colId}"]`);
    }
  }

  if (hiddenSelectors.length > 0) {
    styleEl.textContent = `${hiddenSelectors.join(', ')} { display: none !important; }`;
  } else {
    styleEl.textContent = '';
  }
}

function toggleColumnCustomizer(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const popover = document.getElementById('custom-columns-popover');
  if (!popover) return;

  const isHidden = popover.classList.contains('hidden');
  if (isHidden) {
    renderColumnCustomizer();
    popover.classList.remove('hidden');
  } else {
    popover.classList.add('hidden');
  }
}

function renderColumnCustomizer() {
  const popover = document.getElementById('custom-columns-popover');
  if (!popover) return;

  const currentVis = getColumnVisibility();

  let html = `
    <div class="col-customizer-header">
      <span class="col-customizer-header-title">
        <i class="fa-solid fa-table-columns text-green"></i> Columns
      </span>
      <button class="col-customizer-reset-btn" onclick="resetColumnVisibility(event)">Reset</button>
    </div>
  `;

  COLUMN_SECTIONS_CONFIG.forEach((sec, idx) => {
    if (idx > 0) {
      html += `<div class="col-customizer-divider"></div>`;
    }
    html += `<div class="col-customizer-section-title">${escapeHtml(sec.category)}</div>`;

    sec.columns.forEach(col => {
      const isVisible = currentVis[col.id] !== false;
      const eyeIcon = isVisible ? 'fa-eye' : 'fa-eye-slash';

      html += `
        <div class="col-customizer-item ${isVisible ? 'active' : ''}" onclick="toggleColumnVisibility('${col.id}', event)">
          <span>${escapeHtml(col.label)}</span>
          <button class="eye-toggle-btn" title="${isVisible ? 'Hide section' : 'Show section'}" tabindex="-1">
            <i class="fa-solid ${eyeIcon}"></i>
          </button>
        </div>
      `;
    });
  });

  popover.innerHTML = html;
}

function toggleColumnVisibility(colId, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const currentVis = getColumnVisibility();
  currentVis[colId] = !currentVis[colId];
  saveColumnVisibility(currentVis);
  applyColumnVisibility(currentVis);
  renderColumnCustomizer();

  const label = findColumnLabel(colId);
  const actionText = currentVis[colId] ? 'shown' : 'hidden';
  showToast(`Section "${label}" ${actionText}`, 'info', 1600);
}

function resetColumnVisibility(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const defaultVis = getDefaultColumnVisibility();
  saveColumnVisibility(defaultVis);
  applyColumnVisibility(defaultVis);
  renderColumnCustomizer();
  showToast('Columns reset to default view', 'info', 1800);
}

function findColumnLabel(colId) {
  for (const sec of COLUMN_SECTIONS_CONFIG) {
    const found = sec.columns.find(c => c.id === colId);
    if (found) return found.label;
  }
  return colId;
}

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------
async function init() {
  console.log('Initializing Orbita Anti-Detect UI...');
  initTheme();
  setupModalDismissals();
  setupFolderColorPicker();
  setupEventListeners();
  applyColumnVisibility(getColumnVisibility());
  initResizableColumns();
  
  await loadSystemInfo();
  await loadFolders();
  await loadProfiles();
  await loadUpdatesStatus();
  checkGoLoginProfiles(false);

  // Periodic polling for running status and background updates
  setInterval(async () => {
    if (!isPolling && !editingProfileId) {
      await loadProfiles(false);
      await loadFolders(false);
    }
  }, 3000);

  // Periodic check for engine updates (every 5 minutes)
  setInterval(async () => {
    await loadUpdatesStatus();
  }, 300000);
}

async function loadSystemInfo() {
  try {
    const res = await fetch('/api/system-info');
    systemInfo = await res.json();
    const data = systemInfo;
    const engineText = document.getElementById('engine-status-text');
    const engineDetails = document.getElementById('engine-details-text');
    
    if (data.engines && data.engines.length > 0) {
      const def = data.engines[0];
      engineText.textContent = def.name.split('(')[0].trim();
      engineDetails.textContent = `${data.engines.length} Engine(s) Available`;
    } else {
      engineText.textContent = 'Chrome Stealth Mode';
      engineDetails.textContent = 'Standard Command Flags';
    }

    if (currentView === 'engines') {
      renderEnginesView();
    }
  } catch (err) {
    console.error('System info fetch error:', err);
  }
}

// -------------------------------------------------------------
// FOLDERS MANAGEMENT
// -------------------------------------------------------------
async function loadFolders(updateUI = true) {
  try {
    const res = await fetch('/api/folders');
    if (!res.ok) return;
    const data = await res.json();
    folders = data.folders || [];

    if (updateUI) {
      renderSidebarFolders(data);
      populateFolderDropdowns();
    }
  } catch (err) {
    console.error('Failed to load folders:', err);
  }
}

function renderSidebarFolders(data) {
  const allBadge = document.getElementById('folder-badge-all');
  if (allBadge) allBadge.textContent = data.totalProfiles !== undefined ? data.totalProfiles : profiles.length;

  const unorgBadge = document.getElementById('folder-badge-unorganized');
  if (unorgBadge) unorgBadge.textContent = data.unorganizedCount !== undefined ? data.unorganizedCount : profiles.filter(p => !p.folder).length;

  const container = document.getElementById('sidebar-custom-folders');
  if (!container) return;

  container.innerHTML = folders.map(f => `
    <div class="nav-folder-item ${currentFolderId === f.id ? 'active' : ''}" data-folder="${escapeHtml(f.id)}" onclick="selectFolder('${escapeHtml(f.id)}')">
      <span class="folder-color-dot" style="background-color: ${escapeHtml(f.color || '#00b86d')};"></span>
      <span class="folder-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
      <span class="badge">${f.count || 0}</span>
      <div class="folder-item-actions">
        <button class="btn-icon-xs" title="Edit Folder" onclick="event.stopPropagation(); openEditFolderModal('${escapeHtml(f.id)}')">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn-icon-xs" title="Delete Folder" onclick="event.stopPropagation(); deleteFolder('${escapeHtml(f.id)}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  // Update top active state
  const allItem = document.getElementById('folder-item-all');
  const unorgItem = document.getElementById('folder-item-unorganized');
  if (allItem) allItem.classList.toggle('active', currentFolderId === 'all');
  if (unorgItem) unorgItem.classList.toggle('active', currentFolderId === 'unorganized');
}

function selectFolder(folderId) {
  currentFolderId = folderId;

  // Update folder item active styles
  document.querySelectorAll('.nav-folder-item').forEach(el => {
    if (el.dataset.folder === folderId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update topbar breadcrumb / title
  const titleEl = document.getElementById('topbar-active-folder-title');
  const iconEl = document.getElementById('topbar-folder-icon');
  if (folderId === 'all') {
    if (titleEl) titleEl.textContent = 'All Profiles';
    if (iconEl) {
      iconEl.className = 'fa-solid fa-folder-open text-green';
      iconEl.style.color = '';
    }
  } else if (folderId === 'unorganized') {
    if (titleEl) titleEl.textContent = 'Unorganized Profiles';
    if (iconEl) {
      iconEl.className = 'fa-solid fa-inbox text-muted';
      iconEl.style.color = '';
    }
  } else {
    const f = folders.find(item => item.id === folderId);
    if (f) {
      if (titleEl) titleEl.textContent = f.name;
      if (iconEl) {
        iconEl.className = 'fa-solid fa-folder';
        iconEl.style.color = f.color || '#00b86d';
      }
    }
  }

  // Switch view to profiles if not already
  if (currentView !== 'profiles') {
    switchView('profiles');
  }

  renderProfilesTable();
}

function populateFolderDropdowns() {
  const pFolderSelect = document.getElementById('p-folder');
  const bulkFolderSelect = document.getElementById('bulk-folder');
  const moveFolderSelect = document.getElementById('move-folder-select');

  const optionsHtml = `
    <option value="">No Folder (Unorganized)</option>
    ${folders.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('')}
  `;

  if (pFolderSelect) pFolderSelect.innerHTML = optionsHtml;
  if (bulkFolderSelect) bulkFolderSelect.innerHTML = optionsHtml;
  if (moveFolderSelect) {
    let moveOptions = folders.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('');
    moveOptions += `<option value="">(None) Remove from Folder</option>`;
    moveFolderSelect.innerHTML = moveOptions;
  }
}

function openCreateFolderModal() {
  editingFolderId = null;
  document.getElementById('folder-modal-title').textContent = 'Create Folder';
  document.getElementById('folder-name-input').value = '';
  document.getElementById('folder-edit-id').value = '';
  document.getElementById('folder-color-input').value = '#00b86d';

  // Highlight color
  document.querySelectorAll('#folder-color-palette .color-choice').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === '#00b86d');
  });

  openModal('folder-modal');
  setTimeout(() => document.getElementById('folder-name-input').focus(), 50);
}

function openEditFolderModal(id) {
  const f = folders.find(item => item.id === id);
  if (!f) return;

  editingFolderId = id;
  document.getElementById('folder-modal-title').textContent = 'Edit Folder';
  document.getElementById('folder-name-input').value = f.name;
  document.getElementById('folder-edit-id').value = id;
  const col = f.color || '#00b86d';
  document.getElementById('folder-color-input').value = col;

  document.querySelectorAll('#folder-color-palette .color-choice').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === col);
  });

  openModal('folder-modal');
  setTimeout(() => document.getElementById('folder-name-input').focus(), 50);
}

function setupFolderColorPicker() {
  const palette = document.getElementById('folder-color-palette');
  if (!palette) return;

  palette.addEventListener('click', (e) => {
    const choice = e.target.closest('.color-choice');
    if (!choice) return;

    palette.querySelectorAll('.color-choice').forEach(c => c.classList.remove('selected'));
    choice.classList.add('selected');
    document.getElementById('folder-color-input').value = choice.dataset.color;
  });
}

async function saveFolderModal() {
  const nameInput = document.getElementById('folder-name-input');
  const name = nameInput.value.trim();
  if (!name) {
    showToast('Folder name is required!', 'error');
    nameInput.focus();
    return;
  }

  const color = document.getElementById('folder-color-input').value || '#00b86d';
  const editId = document.getElementById('folder-edit-id').value;

  try {
    if (editId) {
      const res = await fetch(`/api/folders/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
      });
      if (!res.ok) throw new Error('Failed to update folder');
      showToast(`Folder "${name}" updated!`, 'success');
    } else {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
      });
      if (!res.ok) throw new Error('Failed to create folder');
      showToast(`Folder "${name}" created!`, 'success');
    }

    closeModal('folder-modal');
    await loadFolders();
    await loadProfiles(false);
  } catch (err) {
    showToast('Folder error: ' + err.message, 'error');
  }
}

async function deleteFolder(id) {
  const f = folders.find(item => item.id === id);
  const name = f ? f.name : 'this folder';

  if (!confirm(`Are you sure you want to delete folder "${name}"?\n(Profiles inside this folder will NOT be deleted, they will be moved to Unorganized.)`)) {
    return;
  }

  try {
    const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete folder');
    showToast(`Folder "${name}" deleted`, 'success');

    if (currentFolderId === id) {
      selectFolder('all');
    } else {
      await loadFolders();
      await loadProfiles(false);
    }
  } catch (err) {
    showToast('Failed to delete folder: ' + err.message, 'error');
  }
}

function openMoveToFolderModal() {
  const count = selectedProfileIds.size;
  if (count === 0) {
    showToast('Please select at least 1 profile to move', 'info');
    return;
  }

  document.getElementById('move-folder-count').textContent = count;
  populateFolderDropdowns();
  openModal('move-folder-modal');
}

async function executeMoveToFolder() {
  const targetFolder = document.getElementById('move-folder-select').value || null;
  const ids = Array.from(selectedProfileIds);

  try {
    const res = await fetch('/api/profiles/move-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileIds: ids, folderId: targetFolder })
    });
    const data = await res.json();
    closeModal('move-folder-modal');
    showToast(`Moved ${data.movedCount} profile(s) successfully!`, 'success');

    selectedProfileIds.clear();
    await loadFolders();
    await loadProfiles(false);
  } catch (err) {
    showToast('Failed to move profiles: ' + err.message, 'error');
  }
}

function populateTagFilters() {
  const select = document.getElementById('filter-tag-select');
  if (!select) return;

  const currentVal = select.value || 'all';
  const tagSet = new Set();
  profiles.forEach(p => {
    if (p.tags && Array.isArray(p.tags)) {
      p.tags.forEach(t => {
        if (t && t.trim()) tagSet.add(t.trim());
      });
    }
  });

  const sortedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  select.innerHTML = `
    <option value="all">All Tags</option>
    ${sortedTags.map(t => `<option value="${escapeHtml(t)}">#${escapeHtml(t)}</option>`).join('')}
  `;

  if (tagSet.has(currentVal)) {
    select.value = currentVal;
  } else {
    select.value = 'all';
    currentTagFilter = 'all';
  }
}

async function loadProfiles(showLoader = true) {
  isPolling = true;
  const tbody = document.getElementById('profiles-table-body');
  
  if (showLoader && profiles.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-12">
          <div class="loading-spinner"></div>
          <p class="text-muted mt-2">Loading profiles...</p>
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch('/api/profiles');
    profiles = await res.json();
    
    // Update badge & stats
    document.getElementById('stat-total').textContent = profiles.length;
    document.getElementById('sidebar-total-badge').textContent = profiles.length;
    const runningCount = profiles.filter(p => p.isRunning).length;
    document.getElementById('stat-running').textContent = runningCount;

    populateTagFilters();
    renderProfilesTable();
    if (currentView === 'proxies') {
      renderProxyManager();
    }
  } catch (err) {
    console.error('Failed to load profiles:', err);
    showToast('Failed to load profiles: ' + err.message, 'error');
  } finally {
    isPolling = false;
  }
}

// -------------------------------------------------------------
// TABLE RENDERING & FILTERING
// -------------------------------------------------------------
function renderProfilesTable() {
  const tbody = document.getElementById('profiles-table-body');
  const tableContainer = document.getElementById('profiles-table-container');
  const emptyState = document.getElementById('profiles-empty-state');
  const searchInput = document.getElementById('search-input');
  const filterEngineEl = document.getElementById('filter-engine');
  const filterEngine = filterEngineEl ? filterEngineEl.value : 'all';
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Filter profiles
  let filtered = profiles.filter(p => {
    // 1. Folder filter
    if (currentFolderId === 'unorganized') {
      if (p.folder) return false;
    } else if (currentFolderId !== 'all') {
      if (p.folder !== currentFolderId) return false;
    }

    // 2. Search query
    if (query) {
      const matchName = p.name && p.name.toLowerCase().includes(query);
      const matchTags = p.tags && p.tags.some(t => t.toLowerCase().includes(query));
      const matchProxy = p.proxy && p.proxy.host && p.proxy.host.toLowerCase().includes(query);
      const matchNotes = p.notes && p.notes.toLowerCase().includes(query);
      if (!matchName && !matchTags && !matchProxy && !matchNotes) return false;
    }

    // 3. Status filter
    if (currentStatusFilter === 'running' && !p.isRunning) return false;
    if (currentStatusFilter === 'stopped' && p.isRunning) return false;

    // 4. Proxy filter
    const isProxied = p.proxy && p.proxy.mode && p.proxy.mode !== 'none' && p.proxy.host;
    if (currentProxyFilter === 'proxied' && !isProxied) return false;
    if (currentProxyFilter === 'direct' && isProxied) return false;

    // 5. Engine filter
    if (filterEngine !== 'all' && p.engine !== filterEngine) return false;

    // 6. Tag filter
    if (currentTagFilter !== 'all') {
      if (!p.tags || !p.tags.includes(currentTagFilter)) return false;
    }

    return true;
  });

  // Sort profiles
  filtered.sort((a, b) => {
    if (currentSort === 'name_asc') {
      return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
    } else if (currentSort === 'name_desc') {
      return (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' });
    } else if (currentSort === 'recent_launch') {
      const timeA = a.lastLaunched ? new Date(a.lastLaunched).getTime() : 0;
      const timeB = b.lastLaunched ? new Date(b.lastLaunched).getTime() : 0;
      return timeB - timeA;
    } else if (currentSort === 'newest') {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    } else if (currentSort === 'status') {
      return (b.isRunning ? 1 : 0) - (a.isRunning ? 1 : 0);
    }
    return 0;
  });

  // Toggle Empty State vs Table
  if (filtered.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (tableContainer) tableContainer.style.display = 'none';
    if (emptyState) {
      emptyState.style.display = 'block';
      const emptyTitle = document.getElementById('empty-state-title');
      const emptyDesc = document.getElementById('empty-state-desc');
      if (profiles.length === 0) {
        if (emptyTitle) emptyTitle.textContent = 'No Browser Profiles Found';
        if (emptyDesc) emptyDesc.textContent = 'Get started by creating your first stealth profile or importing from GoLogin in 1 click.';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'No Profiles Found in this View';
        if (emptyDesc) emptyDesc.textContent = 'No profiles match your active folder or filter criteria. Try selecting "All Profiles" or clearing your search.';
      }
    }
    updateBulkBar();
    return;
  }

  if (tableContainer) tableContainer.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  // Render Table Rows
  tbody.innerHTML = filtered.map(p => {
    const isSelected = selectedProfileIds.has(p.id);
    const isRunning = p.isRunning;

    // Quick Start/Stop Button
    const actionBtnHtml = isRunning ? `
      <button class="btn-table-stop" onclick="stopSingleProfile('${escapeHtml(p.id)}')" title="Stop Profile Process">
        <i class="fa-solid fa-stop"></i> Stop
      </button>
    ` : `
      <button class="btn-table-start" onclick="startSingleProfile('${escapeHtml(p.id)}')" title="Launch Anti-Detect Browser">
        <i class="fa-solid fa-play"></i> Start
      </button>
    `;

    // Folder badge pill
    let folderBadgeHtml = '';
    if (p.folder) {
      const folderObj = folders.find(f => f.id === p.folder);
      if (folderObj) {
        folderBadgeHtml = `
          <span class="folder-badge-pill" style="border-left: 3px solid ${escapeHtml(folderObj.color || '#00b86d')}">
            <i class="fa-solid fa-folder"></i> ${escapeHtml(folderObj.name)}
          </span>
        `;
      }
    }

    // Hardware Specs / OS Icon
    const fp = p.fingerprint || {};
    const osIcon = (fp.os && fp.os.includes('Mac')) ? 'fa-apple' : (fp.os && fp.os.includes('Linux') ? 'fa-linux' : 'fa-windows');

    // Tags
    const tagsHtml = (p.tags && p.tags.length > 0)
      ? `<div class="tag-pills-wrap">${p.tags.map(t => `<span class="tag-pill">#${escapeHtml(t)}</span>`).join('')}</div>`
      : `<span class="text-xs text-muted">&mdash;</span>`;

    // Proxy Cell
    let proxyHtml = `<span class="text-xs text-muted"><i class="fa-solid fa-globe"></i> Direct</span>`;
    if (p.proxy && p.proxy.mode !== 'none' && p.proxy.host) {
      const mode = p.proxy.mode.toUpperCase();
      const ipPort = `${p.proxy.host}:${p.proxy.port}`;
      proxyHtml = `
        <div class="proxy-cell-box">
          <div class="flex-center gap-1">
            <span class="status-dot ${isRunning ? 'online' : ''}" style="width: 6px; height: 6px;"></span>
            <span class="text-xs font-semibold text-green">${escapeHtml(mode)}</span>
            <span class="proxy-ip-label" title="Click to copy proxy" onclick="copyToClipboard('${escapeHtml(ipPort)}', 'Proxy')">${escapeHtml(ipPort)}</span>
          </div>
        </div>
      `;
    }

    // Engine Badge
    let engineType = 'orbita';
    let engineLabel = 'Orbita';
    let engineIcon = 'fa-solid fa-shield-halved';
    if (p.engine === 'chrome') {
      engineType = 'chrome';
      engineLabel = 'Chrome';
      engineIcon = 'fa-brands fa-chrome';
    } else if (p.engine === 'edge') {
      engineType = 'edge';
      engineLabel = 'Edge';
      engineIcon = 'fa-brands fa-edge';
    } else if (p.engine === 'camoufox') {
      engineType = 'camoufox';
      engineLabel = 'Camoufox';
      engineIcon = 'fa-solid fa-shield-cat';
    }

    // Last Active Date Formatter
    let lastActiveText = 'Never';
    if (p.lastLaunched) {
      const d = new Date(p.lastLaunched);
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) lastActiveText = 'Just now';
      else if (diffMins < 60) lastActiveText = `${diffMins}m ago`;
      else if (diffMins < 1440) lastActiveText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      else lastActiveText = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    return `
      <tr class="${isSelected ? 'selected' : ''} ${isRunning ? 'row-running' : ''}" data-id="${escapeHtml(p.id)}">
        <td class="text-center col-checkbox">
          <input type="checkbox" class="profile-row-checkbox" data-id="${escapeHtml(p.id)}" ${isSelected ? 'checked' : ''}>
        </td>
        <td class="col-quick-action" data-col="action">
          ${actionBtnHtml}
        </td>
        <td class="col-profile" data-col="profile">
          <div class="profile-cell-wrap">
            <div class="profile-title-row">
              <i class="fa-brands ${osIcon} text-muted" title="${escapeHtml(fp.os || 'Windows')}"></i>
              <strong class="profile-main-name" onclick="openEditModal('${escapeHtml(p.id)}')">${escapeHtml(p.name)}</strong>
              ${folderBadgeHtml}
            </div>
          </div>
        </td>
        <td class="col-tags" data-col="tags">${tagsHtml}</td>
        <td class="col-notes" data-col="notes">
          <span class="text-xs text-muted" title="${escapeHtml(p.notes || '')}">
            ${p.notes ? escapeHtml(p.notes) : '&mdash;'}
          </span>
        </td>
        <td class="col-proxy" data-col="proxy">${proxyHtml}</td>
        <td class="col-engine" data-col="engine">
          <span class="engine-badge ${engineType}">
            <i class="${engineIcon}"></i> ${engineLabel}
          </span>
        </td>
        <td class="col-last-active" data-col="last-active">
          <span class="text-muted text-xs">${escapeHtml(lastActiveText)}</span>
        </td>
        <td class="col-created" data-col="created">
          <span class="text-muted text-xs">
            ${p.createdAt ? new Date(p.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '&mdash;'}
          </span>
        </td>
        <td class="col-actions text-right" data-col="manage">
          <div class="table-actions-inline">
            <button class="btn-icon-subtle" onclick="openProfileFolder('${escapeHtml(p.id)}')" title="Open Profile Data Folder">
              <i class="fa-solid fa-folder-open"></i>
            </button>
            <button class="btn-icon-subtle" onclick="openEditModal('${escapeHtml(p.id)}')" title="Edit Profile & Fingerprint">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-icon-subtle" onclick="cloneSingleProfile('${escapeHtml(p.id)}')" title="Clone with Fresh Fingerprint">
              <i class="fa-solid fa-clone"></i>
            </button>
            <button class="btn-icon-subtle text-danger" onclick="deleteSingleProfile('${escapeHtml(p.id)}')" title="Delete Profile">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  updateBulkBar();
}

// -------------------------------------------------------------
// SELECTION & BULK ACTIONS
// -------------------------------------------------------------
function updateBulkBar() {
  const bulkBar = document.getElementById('bulk-bar');
  const countEl = document.getElementById('bulk-selected-count');
  const masterCheck = document.getElementById('select-all-checkbox');
  const size = selectedProfileIds.size;

  countEl.textContent = size;

  if (size > 0) {
    bulkBar.style.display = 'flex';
  } else {
    bulkBar.style.display = 'none';
  }

  // Update master checkbox state
  if (profiles.length === 0) {
    masterCheck.checked = false;
    masterCheck.indeterminate = false;
  } else if (size === profiles.length) {
    masterCheck.checked = true;
    masterCheck.indeterminate = false;
  } else if (size > 0) {
    masterCheck.checked = false;
    masterCheck.indeterminate = true;
  } else {
    masterCheck.checked = false;
    masterCheck.indeterminate = false;
  }
}

function handleRowCheckboxClick(e) {
  const target = e.target;
  const checkbox = (target && target.matches && target.matches('.profile-row-checkbox'))
    ? target
    : (target && target.closest ? target.closest('.profile-row-checkbox') : null);

  if (!checkbox || !checkbox.dataset.id) return;

  const id = checkbox.dataset.id;
  console.log('handleRowCheckboxClick for id:', id, 'checked:', checkbox.checked);

  if (checkbox.checked) {
    selectedProfileIds.add(id);
  } else {
    selectedProfileIds.delete(id);
  }

  const row = checkbox.closest('tr');
  if (row) row.classList.toggle('selected', checkbox.checked);

  updateBulkBar();
}

function handleSelectAll(e) {
  const isChecked = e.target.checked;
  selectedProfileIds.clear();

  if (isChecked) {
    profiles.forEach(p => selectedProfileIds.add(p.id));
  }

  renderProfilesTable();
}

function deselectAll() {
  selectedProfileIds.clear();
  renderProfilesTable();
}

// -------------------------------------------------------------
// PROFILE LAUNCH / STOP / OPERATIONS
// -------------------------------------------------------------
async function startSingleProfile(id) {
  showToast('Launching stealth browser...', 'info', 2000);
  try {
    const res = await fetch(`/api/profiles/${id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://browserleaks.com' })
    });
    const data = await res.json();
    if (data.error) {
      showToast('Launch failed: ' + data.error, 'error', 4000);
    } else {
      showToast(`Started profile with ${data.engine}!`, 'success', 3000);
    }
    await loadProfiles(false);
  } catch (err) {
    showToast('Launch error: ' + err.message, 'error');
  }
}

async function stopSingleProfile(id) {
  showToast('Stopping browser...', 'info', 1500);
  try {
    const res = await fetch(`/api/profiles/${id}/stop`, { method: 'POST' });
    const data = await res.json();
    showToast('Browser profile stopped', 'success');
    await loadProfiles(false);
  } catch (err) {
    showToast('Failed to stop browser: ' + err.message, 'error');
  }
}

async function cloneSingleProfile(id) {
  showToast('Cloning profile with new fingerprint...', 'info', 1500);
  try {
    const res = await fetch(`/api/profiles/${id}/clone`, { method: 'POST' });
    const data = await res.json();
    showToast(`Cloned as "${data.name}"`, 'success');
    await loadProfiles(false);
  } catch (err) {
    showToast('Failed to clone: ' + err.message, 'error');
  }
}

async function deleteSingleProfile(id) {
  const p = profiles.find(item => item.id === id);
  const name = p ? p.name : 'this profile';

  if (!window.confirm(`Are you sure you want to permanently delete "${name}" and all its isolated cookies & data?`)) {
    return;
  }

  try {
    await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
    selectedProfileIds.delete(id);
    showToast('Profile deleted successfully', 'success');
    await loadFolders();
    await loadProfiles(false);
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

async function openProfileFolder(id) {
  try {
    await fetch(`/api/profiles/${id}/open-folder`, { method: 'POST' });
    showToast('Opening folder in file manager', 'info', 2000);
  } catch (err) {
    showToast('Could not open folder', 'error');
  }
}

// -------------------------------------------------------------
// BULK EXECUTION HANDLERS
// -------------------------------------------------------------
async function executeBulkStart() {
  const ids = Array.from(selectedProfileIds);
  if (ids.length === 0) return;

  showToast(`Starting ${ids.length} browser profiles...`, 'info', 2500);
  try {
    const res = await fetch('/api/profiles/bulk-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    showToast(`Started ${data.started.length} profiles!`, 'success');
    await loadProfiles(false);
  } catch (err) {
    showToast('Bulk start error: ' + err.message, 'error');
  }
}

async function executeBulkStop() {
  const ids = Array.from(selectedProfileIds);
  if (ids.length === 0) return;

  try {
    const res = await fetch('/api/profiles/bulk-stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    showToast(`Stopped ${data.count} running profiles`, 'success');
    await loadProfiles(false);
  } catch (err) {
    showToast('Bulk stop error: ' + err.message, 'error');
  }
}

async function executeBulkRandomizeFp() {
  const ids = Array.from(selectedProfileIds);
  if (ids.length === 0) return;

  try {
    const res = await fetch('/api/profiles/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'randomize_fingerprint' })
    });
    const data = await res.json();
    showToast(`Generated new fingerprints for ${data.count} profiles!`, 'success');
    await loadProfiles(false);
  } catch (err) {
    showToast('Error randomizing fingerprints', 'error');
  }
}

async function executeBulkDelete() {
  const ids = Array.from(selectedProfileIds);
  if (ids.length === 0) return;

  if (!window.confirm(`Are you sure you want to delete ${ids.length} selected profiles? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch('/api/profiles/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    selectedProfileIds.clear();
    showToast(`Deleted ${data.count} profiles`, 'success');
    await loadFolders();
    await loadProfiles(false);
  } catch (err) {
    showToast('Error deleting profiles: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// MODALS MANAGEMENT
// -------------------------------------------------------------
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('show');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}

function setupModalDismissals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal(btn.dataset.close);
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('show');
        backdrop.style.display = 'none';
      }
    });
  });
}

// Single Profile Create / Edit Modal
function openCreateModal() {
  editingProfileId = null;
  document.getElementById('modal-title').textContent = 'Create New Browser Profile';
  
  document.getElementById('p-name').value = `Stealth Profile #${profiles.length + 1}`;
  document.getElementById('p-os').value = 'Windows 11';
  document.getElementById('p-engine').value = 'orbita';
  document.getElementById('p-tags').value = '';
  document.getElementById('p-notes').value = '';

  const pFolder = document.getElementById('p-folder');
  if (pFolder) {
    pFolder.value = (currentFolderId && currentFolderId !== 'all' && currentFolderId !== 'unorganized') ? currentFolderId : '';
  }

  const noProxyRadio = document.querySelector('input[name="proxy-type"][value="none"]');
  if (noProxyRadio) noProxyRadio.checked = true;
  document.getElementById('proxy-details-box').style.display = 'none';
  document.getElementById('px-host').value = '';
  document.getElementById('px-port').value = '';
  document.getElementById('px-user').value = '';
  document.getElementById('px-pass').value = '';
  document.getElementById('proxy-check-status').textContent = '';

  const smartInput = document.getElementById('px-smart-input');
  if (smartInput) smartInput.value = '';
  const smartAlert = document.getElementById('smart-paste-alert');
  if (smartAlert) {
    smartAlert.style.display = 'none';
    smartAlert.textContent = '';
  }

  generateNewFingerprint('Windows 11');
  switchTab('tab-general');
  openModal('profile-modal');
}

function openEditModal(id) {
  const p = profiles.find(item => item.id === id);
  if (!p) return;

  editingProfileId = id;
  document.getElementById('modal-title').textContent = `Edit Profile: ${p.name}`;
  
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-os').value = p.fingerprint?.os || 'Windows 11';
  document.getElementById('p-engine').value = p.engine || 'orbita';
  document.getElementById('p-tags').value = (p.tags || []).join(', ');
  document.getElementById('p-notes').value = p.notes || '';

  const pFolder = document.getElementById('p-folder');
  if (pFolder) {
    pFolder.value = p.folder || '';
  }

  const mode = p.proxy?.mode || 'none';
  const radio = document.querySelector(`input[name="proxy-type"][value="${mode}"]`);
  if (radio) radio.checked = true;
  document.getElementById('proxy-details-box').style.display = (mode === 'none') ? 'none' : 'block';
  document.getElementById('px-host').value = p.proxy?.host || '';
  document.getElementById('px-port').value = p.proxy?.port || '';
  document.getElementById('px-user').value = p.proxy?.username || '';
  document.getElementById('px-pass').value = p.proxy?.password || '';
  document.getElementById('proxy-check-status').textContent = '';

  const smartInput = document.getElementById('px-smart-input');
  const smartAlert = document.getElementById('smart-paste-alert');
  if (smartAlert) smartAlert.style.display = 'none';
  if (smartInput) {
    if (p.proxy && p.proxy.host && p.proxy.port) {
      const auth = p.proxy.username ? `${p.proxy.username}:${p.proxy.password}@` : '';
      smartInput.value = `${p.proxy.mode === 'socks5' ? 'socks5://' : ''}${auth}${p.proxy.host}:${p.proxy.port}`;
    } else {
      smartInput.value = '';
    }
  }

  currentFingerprint = p.fingerprint || {};
  renderFingerprintFields(currentFingerprint);

  switchTab('tab-general');
  openModal('profile-modal');
}

async function generateNewFingerprint(os = 'Windows 11') {
  try {
    const res = await fetch(`/api/generate-fingerprint?os=${encodeURIComponent(os)}`);
    currentFingerprint = await res.json();
    renderFingerprintFields(currentFingerprint);
  } catch (err) {
    console.error('Failed to generate fingerprint:', err);
  }
}

function renderFingerprintFields(fp) {
  document.getElementById('fp-canvas').checked = fp.canvasNoise !== false;
  document.getElementById('fp-webgl').checked = fp.webglNoise !== false;
  document.getElementById('fp-audio').checked = fp.audioNoise !== false;
  document.getElementById('fp-webrtc').checked = fp.webrtcMode !== 'real';
  document.getElementById('fp-res').value = fp.screenResolution || '1920x1080';
  document.getElementById('fp-cores').value = (fp.cpuCores || 8).toString();
  document.getElementById('fp-ram').value = (fp.ramGb || 16).toString();
  document.getElementById('fp-gpu').value = `${fp.webglVendor || 'Google Inc.'} / ${fp.webglRenderer || 'ANGLE NVIDIA'}`;
  document.getElementById('fp-ua').value = fp.userAgent || '';
}

async function saveProfile() {
  console.log('saveProfile invoked');
  const nameInput = document.getElementById('p-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    showToast('Profile name is required!', 'error');
    return;
  }

  const proxyRadio = document.querySelector('input[name="proxy-type"]:checked');
  const proxyType = proxyRadio ? proxyRadio.value : 'none';
  const tagsInput = document.getElementById('p-tags');
  const tags = tagsInput ? tagsInput.value.split(',').map(t => t.trim()).filter(Boolean) : [];

  const engineSelect = document.getElementById('p-engine');
  const notesInput = document.getElementById('p-notes');
  const hostInput = document.getElementById('px-host');
  const portInput = document.getElementById('px-port');
  const userInput = document.getElementById('px-user');
  const passInput = document.getElementById('px-pass');
  const osSelect = document.getElementById('p-os');
  const canvasCheck = document.getElementById('fp-canvas');
  const webglCheck = document.getElementById('fp-webgl');
  const audioCheck = document.getElementById('fp-audio');
  const webrtcCheck = document.getElementById('fp-webrtc');
  const resSelect = document.getElementById('fp-res');
  const coresSelect = document.getElementById('fp-cores');
  const ramSelect = document.getElementById('fp-ram');
  const uaInput = document.getElementById('fp-ua');

  const folderSelect = document.getElementById('p-folder');
  const folder = folderSelect ? (folderSelect.value || null) : null;

  const payload = {
    name,
    folder,
    engine: engineSelect ? engineSelect.value : 'camoufox',
    tags,
    notes: notesInput ? notesInput.value.trim() : '',
    proxy: {
      mode: proxyType,
      host: hostInput ? hostInput.value.trim() : '',
      port: portInput ? portInput.value.trim() : '',
      username: userInput ? userInput.value.trim() : '',
      password: passInput ? passInput.value.trim() : ''
    },
    fingerprint: {
      ...(currentFingerprint || {}),
      os: osSelect ? osSelect.value : 'Windows 11',
      canvasNoise: canvasCheck ? canvasCheck.checked : true,
      webglNoise: webglCheck ? webglCheck.checked : true,
      audioNoise: audioCheck ? audioCheck.checked : true,
      webrtcMode: (webrtcCheck && webrtcCheck.checked) ? 'altered' : 'real',
      screenResolution: resSelect ? resSelect.value : '1920x1080',
      cpuCores: coresSelect ? parseInt(coresSelect.value, 10) : 8,
      ramGb: ramSelect ? parseInt(ramSelect.value, 10) : 16,
      userAgent: uaInput ? uaInput.value.trim() : ''
    }
  };

  try {
    if (editingProfileId) {
      const res = await fetch(`/api/profiles/${editingProfileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Update failed with status ' + res.status);
      showToast(`Profile "${name}" updated`, 'success');
    } else {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Create failed with status ' + res.status);
      showToast(`Created profile "${name}"!`, 'success');
    }
    closeModal('profile-modal');
    editingProfileId = null;
    await loadFolders();
    await loadProfiles(false);
  } catch (err) {
    console.error('saveProfile error:', err);
    showToast('Failed to save profile: ' + err.message, 'error');
  }
}

// Bulk Add Execution
async function executeBulkCreate() {
  const count = parseInt(document.getElementById('bulk-count').value, 10) || 5;
  const baseName = document.getElementById('bulk-basename').value.trim() || 'Profile';
  const os = document.getElementById('bulk-os').value;
  const engine = document.getElementById('bulk-engine').value || 'orbita';
  const bulkFolder = document.getElementById('bulk-folder');
  const folder = bulkFolder ? (bulkFolder.value || null) : null;
  const tags = document.getElementById('bulk-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const proxiesText = document.getElementById('bulk-proxies-text').value.trim();

  // Parse proxies list using Smart Proxy Parser
  const proxiesList = [];
  if (proxiesText) {
    const lines = proxiesText.split('\n');
    lines.forEach(line => {
      const parsed = parseProxyString(line);
      if (parsed && parsed.host && parsed.port) {
        proxiesList.push(parsed);
      }
    });
  }

  showToast(`Generating ${count} unique anti-detect profiles...`, 'info', 2500);

  try {
    const res = await fetch('/api/profiles/bulk-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, baseName, os, engine, folder, tags, proxiesList })
    });
    const data = await res.json();
    closeModal('bulk-modal');
    showToast(`Created ${data.count} new profiles with unique fingerprints!`, 'success');
    await loadFolders();
    await loadProfiles(false);
  } catch (err) {
    showToast('Bulk create failed: ' + err.message, 'error');
  }
}

// Bulk Proxy Execution
async function executeBulkProxy() {
  const ids = Array.from(selectedProfileIds);
  if (ids.length === 0) return;

  const mode = document.getElementById('bulk-px-mode').value;
  const host = document.getElementById('bulk-px-host').value.trim();
  const port = document.getElementById('bulk-px-port').value.trim();
  const username = document.getElementById('bulk-px-user').value.trim();
  const password = document.getElementById('bulk-px-pass').value.trim();

  const proxy = { mode, host, port, username, password };

  try {
    const res = await fetch('/api/profiles/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'set_proxy', data: { proxy } })
    });
    const data = await res.json();
    closeModal('bulk-proxy-modal');
    showToast(`Proxy applied to ${data.count} profiles!`, 'success');
    await loadProfiles(false);
  } catch (err) {
    showToast('Failed to apply proxy', 'error');
  }
}

// Bulk Tag Execution
async function executeBulkTag() {
  const ids = Array.from(selectedProfileIds);
  if (ids.length === 0) return;

  const tag = document.getElementById('bulk-tag-input').value.trim();
  if (!tag) {
    showToast('Tag name required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/profiles/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'add_tag', data: { tag } })
    });
    const data = await res.json();
    closeModal('bulk-tag-modal');
    showToast(`Added tag "${tag}" to ${data.count} profiles!`, 'success');
    await loadProfiles(false);
  } catch (err) {
    showToast('Failed to add tag', 'error');
  }
}

// Tab Switching Helper
function switchTab(targetId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === targetId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === targetId);
  });
}

// -------------------------------------------------------------
// VIEW SWITCHING (Sidebar Navigation)
// -------------------------------------------------------------
function switchView(viewName) {
  currentView = viewName;

  // 1. Update navigation items active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // 2. Hide all view panes, show target
  const views = ['profiles', 'proxies', 'fingerprints', 'engines', 'cloud-sync'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      if (v === viewName) {
        el.classList.remove('hidden');
        el.style.display = 'flex';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    }
  });

  // 3. Update topbar title & actions
  const titleEl = document.querySelector('.page-title');
  const bulkBtn = document.getElementById('btn-open-bulk-modal');
  const newBtn = document.getElementById('btn-create-profile');

  if (viewName === 'profiles') {
    if (titleEl) titleEl.textContent = 'Browser Profiles';
    if (bulkBtn) bulkBtn.style.display = '';
    if (newBtn) newBtn.style.display = '';
  } else if (viewName === 'proxies') {
    if (titleEl) titleEl.textContent = 'Proxy Manager';
    if (bulkBtn) bulkBtn.style.display = 'none';
    if (newBtn) newBtn.style.display = '';
    renderProxyManager();
  } else if (viewName === 'fingerprints') {
    if (titleEl) titleEl.textContent = 'Fingerprints & Hardware Emulation';
    if (bulkBtn) bulkBtn.style.display = 'none';
    if (newBtn) newBtn.style.display = 'none';
  } else if (viewName === 'engines') {
    if (titleEl) titleEl.textContent = 'Installed Browser Engines';
    if (bulkBtn) bulkBtn.style.display = 'none';
    if (newBtn) newBtn.style.display = 'none';
    renderEnginesView();
    renderUpdatesNotification();
  } else if (viewName === 'cloud-sync') {
    if (titleEl) titleEl.textContent = 'Cloud Storage Sync (MinIO / S3)';
    if (bulkBtn) bulkBtn.style.display = 'none';
    if (newBtn) newBtn.style.display = 'none';
    loadCloudConfig();
    renderCloudProfilesTable();
  }
}

// -------------------------------------------------------------
// SMART PROXY AUTO-DETECTOR
// -------------------------------------------------------------
function applySmartProxyToForm(raw, context = 'single') {
  if (!raw || typeof raw !== 'string') return;
  const parsed = parseProxyString(raw);
  if (!parsed || !parsed.host) return;

  if (context === 'single') {
    const proto = parsed.mode === 'socks5' ? 'socks5' : (parsed.mode === 'socks4' ? 'socks5' : 'http');
    const radio = document.querySelector(`input[name="proxy-type"][value="${proto}"]`);
    if (radio) radio.checked = true;

    const box = document.getElementById('proxy-details-box');
    if (box) box.style.display = 'block';

    document.getElementById('px-host').value = parsed.host;
    document.getElementById('px-port').value = parsed.port || '';
    document.getElementById('px-user').value = parsed.username || '';
    document.getElementById('px-pass').value = parsed.password || '';

    const alertEl = document.getElementById('smart-paste-alert');
    if (alertEl) {
      alertEl.className = 'smart-paste-alert success';
      alertEl.style.display = 'flex';
      const authInfo = parsed.username ? `· Auth: <strong>${escapeHtml(parsed.username)}</strong>` : '· Direct (No Auth)';
      alertEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>Detected <strong>${proto.toUpperCase()}</strong>: ${escapeHtml(parsed.host)}:${escapeHtml(parsed.port || '')} ${authInfo}</span>`;
    }

    if (parsed.host && parsed.port) {
      document.getElementById('btn-check-proxy').click();
    }
  } else if (context === 'bulk') {
    const proto = parsed.mode === 'socks5' ? 'socks5' : 'http';
    const select = document.getElementById('bulk-px-mode');
    if (select) select.value = proto;
    document.getElementById('bulk-px-host').value = parsed.host;
    document.getElementById('bulk-px-port').value = parsed.port || '';
    document.getElementById('bulk-px-user').value = parsed.username || '';
    document.getElementById('bulk-px-pass').value = parsed.password || '';
  } else if (context === 'manager') {
    const details = document.getElementById('mgr-proxy-details');
    if (details) details.style.display = 'block';
    document.getElementById('mgr-px-proto').value = parsed.mode.toUpperCase();
    document.getElementById('mgr-px-host').value = parsed.host;
    document.getElementById('mgr-px-port').value = parsed.port || '';
    document.getElementById('mgr-px-auth').value = parsed.username ? `${parsed.username} / ••••` : 'None';
  }
}

// -------------------------------------------------------------
// PROXY MANAGER VIEW RENDERER
// -------------------------------------------------------------
function renderProxyManager() {
  const tbody = document.getElementById('proxy-manager-table-body');
  const countLabel = document.getElementById('proxies-count-label');
  if (!tbody) return;

  const proxyMap = new Map();

  profiles.forEach(p => {
    if (p.proxy && p.proxy.mode !== 'none' && p.proxy.host && p.proxy.port) {
      const key = `${p.proxy.mode}://${p.proxy.host}:${p.proxy.port}`;
      if (!proxyMap.has(key)) {
        proxyMap.set(key, {
          proxy: p.proxy,
          profiles: []
        });
      }
      proxyMap.get(key).profiles.push({ id: p.id, name: p.name });
    }
  });

  const list = Array.from(proxyMap.values());
  if (countLabel) countLabel.textContent = `${list.length} Unique Proxies Active`;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-muted">
          <i class="fa-solid fa-network-wired fa-2x mb-2" style="opacity: 0.3;"></i>
          <p>No proxies configured yet.</p>
          <p class="text-xs text-muted">Use the Smart Tester above or add proxies to your profiles.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(item => {
    const px = item.proxy;
    const hasAuth = Boolean(px.username && px.password);
    const profileBadges = item.profiles.map(pr => `
      <span class="tag-chip" style="cursor: pointer;" onclick="openEditModal('${pr.id}')" title="Click to edit profile">
        <i class="fa-solid fa-folder"></i> ${escapeHtml(pr.name)}
      </span>
    `).join(' ');

    const rowId = `mgr-row-${px.host.replace(/[^a-zA-Z0-9]/g, '_')}-${px.port}`;

    return `
      <tr id="${rowId}">
        <td>
          <div class="profile-name-cell">
            <i class="fa-solid fa-server text-green"></i>
            <div>
              <div class="profile-name text-code font-bold">${escapeHtml(px.host)}:${escapeHtml(px.port)}</div>
              <div class="text-xs text-muted" id="status-${rowId}">Ready to test</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${px.mode === 'socks5' ? 'badge-blue' : 'badge-green'}">
            ${px.mode ? px.mode.toUpperCase() : 'HTTP'}
          </span>
        </td>
        <td>
          ${hasAuth ? `<span class="text-green text-xs"><i class="fa-solid fa-lock"></i> ${escapeHtml(px.username)}</span>` : '<span class="text-muted text-xs">No Auth</span>'}
        </td>
        <td>
          <div class="profile-tags" style="gap: 4px;">
            ${profileBadges}
          </div>
        </td>
        <td>
          <span class="status-pill active" title="WebRTC STUN forced through proxy"><i class="fa-solid fa-shield-halved"></i> Enabled</span>
        </td>
        <td class="text-right">
          <button class="btn btn-sm btn-secondary" onclick="testProxyFromRow('${escapeHtml(px.host)}', '${escapeHtml(px.port)}', '${escapeHtml(px.mode)}', '${escapeHtml(px.username || '')}', '${escapeHtml(px.password || '')}', 'status-${rowId}')">
            <i class="fa-solid fa-bolt"></i> Ping Test
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function testProxyFromRow(host, port, mode, username, password, targetStatusId) {
  const statusEl = document.getElementById(targetStatusId);
  if (statusEl) {
    statusEl.innerHTML = '<span class="text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Checking latency...</span>';
  }

  try {
    const res = await fetch('/api/check-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, mode, username, password })
    });
    const data = await res.json();
    if (data.status === 'online') {
      if (statusEl) statusEl.innerHTML = `<span class="text-green"><i class="fa-solid fa-check"></i> Online (${data.pingMs}ms) · IP: ${data.ip || 'OK'}</span>`;
      showToast(`Proxy ${host}:${port} online (${data.pingMs}ms)`, 'success');
    } else {
      if (statusEl) statusEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-xmark"></i> ${data.error || 'Failed'}</span>`;
      showToast(`Proxy offline: ${data.error || 'Failed'}`, 'error');
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Error</span>`;
  }
}

// -------------------------------------------------------------
// ENGINES VIEW RENDERER
// -------------------------------------------------------------
function renderEnginesView() {
  const container = document.getElementById('engines-cards-container');
  const countLabel = document.getElementById('engines-count-label');
  if (!container) return;

  const engines = systemInfo?.engines || [];
  if (countLabel) countLabel.textContent = `${engines.length} Engine(s) Ready`;

  let html = '';

  engines.forEach(eng => {
    const isOrbita = eng.id === 'orbita';
    const isChrome = eng.id === 'chrome';
    const isEdge = eng.id === 'edge';
    const isCamoufox = eng.id === 'camoufox';

    let icon = 'fa-solid fa-shield-halved';
    let borderColor = 'var(--primary)';
    let desc = '';

    if (isOrbita) {
      icon = 'fa-solid fa-shield-halved';
      borderColor = 'var(--primary)';
      desc = 'Native GoLogin Orbita Chromium Engine. Features kernel-level hardware spoofing, Skia canvas noise, isolated user-data-dir, and automation masking without navigator.webdriver flags.';
    } else if (isChrome) {
      icon = 'fa-brands fa-chrome';
      borderColor = '#f59e0b';
      desc = 'Official Google Chrome binary running with stealth flags (--disable-blink-features=AutomationControlled), isolated user-data-dir, and WebRTC proxy tunnel protection.';
    } else if (isEdge) {
      icon = 'fa-brands fa-edge';
      borderColor = '#38bdf8';
      desc = 'Microsoft Edge running with stealth anti-automation parameters, dedicated storage profiles, and encrypted proxy forwarding.';
    } else if (isCamoufox) {
      icon = 'fa-solid fa-shield-cat';
      borderColor = '#a855f7';
      desc = 'Firefox Gecko-based alternative engine. C++ patched rasterizer with user.js profile injection.';
    }

    html += `
      <div class="info-card" style="border-left: 4px solid ${borderColor};">
        <div class="info-card-header">
          <div class="info-card-title" style="color: ${borderColor};">
            <i class="${icon}"></i>
            ${escapeHtml(eng.name)}
          </div>
          <span class="status-pill ${eng.isDefault ? 'active' : 'ready'}">${eng.isDefault ? 'DEFAULT ENGINE' : 'AVAILABLE'}</span>
        </div>
        <div class="info-card-desc">
          ${desc}
        </div>
        <div class="info-card-meta">
          <strong>Binary Path:</strong> <code>${escapeHtml(eng.path)}</code>
        </div>
        <div class="flex-row gap-2 mt-2">
          <button class="btn btn-sm btn-secondary" onclick="testFirstProfileWithEngine('${eng.id}')">
            <i class="fa-solid fa-play"></i> Launch Test Window
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function testFirstProfileWithUrl(url) {
  if (profiles.length === 0) {
    showToast('Please create at least one profile first!', 'error');
    openCreateModal();
    return;
  }
  const prof = profiles.find(p => !p.isRunning) || profiles[0];
  showToast(`Launching ${prof.name} on ${url}...`, 'info');
  try {
    const res = await fetch(`/api/profiles/${prof.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Launched! Engine: ${data.engine}`, 'success');
      loadProfiles(false);
    } else {
      showToast(data.message || data.error, 'error');
    }
  } catch (err) {
    showToast('Launch failed: ' + err.message, 'error');
  }
}

async function testFirstProfileWithEngine(engineId) {
  if (profiles.length === 0) {
    showToast('Please create at least one profile first!', 'error');
    openCreateModal();
    return;
  }
  const prof = profiles[0];
  showToast(`Launching ${prof.name} with ${engineId}...`, 'info');
  try {
    await fetch(`/api/profiles/${prof.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: engineId })
    });
    await fetch(`/api/profiles/${prof.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://browserleaks.com' })
    });
    loadProfiles(false);
  } catch (err) {
    showToast('Launch failed: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// EVENT LISTENERS
// -------------------------------------------------------------
function setupEventListeners() {
  // Modal Open Buttons
  document.getElementById('btn-create-profile').addEventListener('click', openCreateModal);
  document.getElementById('btn-open-bulk-modal').addEventListener('click', () => {
    populateFolderDropdowns();
    openModal('bulk-modal');
  });
  document.getElementById('btn-bulk-proxy-modal').addEventListener('click', () => openModal('bulk-proxy-modal'));
  document.getElementById('btn-bulk-tag-modal').addEventListener('click', () => openModal('bulk-tag-modal'));

  // Folder Buttons
  const btnCreateFolder = document.getElementById('btn-create-folder');
  if (btnCreateFolder) btnCreateFolder.addEventListener('click', openCreateFolderModal);

  const folderItemAll = document.getElementById('folder-item-all');
  if (folderItemAll) folderItemAll.addEventListener('click', (e) => { e.preventDefault(); selectFolder('all'); });

  const folderItemUnorg = document.getElementById('folder-item-unorganized');
  if (folderItemUnorg) folderItemUnorg.addEventListener('click', (e) => { e.preventDefault(); selectFolder('unorganized'); });

  const btnEmptyCreate = document.getElementById('btn-empty-create');
  if (btnEmptyCreate) btnEmptyCreate.addEventListener('click', openCreateModal);

  // Execution Buttons
  document.getElementById('modal-save-btn').addEventListener('click', saveProfile);
  document.getElementById('btn-execute-bulk-create').addEventListener('click', executeBulkCreate);
  document.getElementById('btn-execute-bulk-proxy').addEventListener('click', executeBulkProxy);
  document.getElementById('btn-execute-bulk-tag').addEventListener('click', executeBulkTag);

  // Bulk Actions
  document.getElementById('btn-bulk-start').addEventListener('click', executeBulkStart);
  document.getElementById('btn-bulk-stop').addEventListener('click', executeBulkStop);
  document.getElementById('btn-bulk-fp').addEventListener('click', executeBulkRandomizeFp);
  document.getElementById('btn-bulk-delete').addEventListener('click', executeBulkDelete);
  document.getElementById('btn-bulk-deselect').addEventListener('click', deselectAll);

  // Filter Chips
  document.querySelectorAll('.filter-chip[data-status-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip[data-status-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStatusFilter = chip.dataset.statusFilter;
      renderProfilesTable();
    });
  });

  document.querySelectorAll('.filter-chip[data-proxy-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('active')) {
        chip.classList.remove('active');
        currentProxyFilter = 'all';
      } else {
        document.querySelectorAll('.filter-chip[data-proxy-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentProxyFilter = chip.dataset.proxyFilter;
      }
      renderProfilesTable();
    });
  });

  // Sort & Tag Selectors
  const sortSelect = document.getElementById('sort-profiles');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderProfilesTable();
    });
  }

  const tagSelect = document.getElementById('filter-tag-select');
  if (tagSelect) {
    tagSelect.addEventListener('change', () => {
      currentTagFilter = tagSelect.value;
      renderProfilesTable();
    });
  }

  // Search & Filters
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search-btn');

  searchInput.addEventListener('input', () => {
    clearBtn.style.display = searchInput.value ? 'block' : 'none';
    renderProfilesTable();
    if (currentView === 'proxies') {
      renderProxyManager();
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    renderProfilesTable();
    if (currentView === 'proxies') {
      renderProxyManager();
    }
  });

  const filterStatusEl = document.getElementById('filter-status');
  if (filterStatusEl) filterStatusEl.addEventListener('change', renderProfilesTable);
  const filterEngineEl = document.getElementById('filter-engine');
  if (filterEngineEl) filterEngineEl.addEventListener('change', renderProfilesTable);
  document.getElementById('btn-refresh').addEventListener('click', () => {
    showToast('Refreshing profiles...', 'info', 1000);
    loadFolders();
    loadProfiles();
  });

  // Table Checkboxes Delegated Listener
  const tbodyEl = document.getElementById('profiles-table-body');
  tbodyEl.addEventListener('change', handleRowCheckboxClick);
  tbodyEl.addEventListener('click', (e) => {
    if (e.target && e.target.matches && e.target.matches('.profile-row-checkbox')) {
      handleRowCheckboxClick(e);
    }
  });
  document.getElementById('select-all-checkbox').addEventListener('change', handleSelectAll);

  // Modal Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(btn.dataset.tab);
    });
  });

  // Proxy Protocol Radio Changes
  document.querySelectorAll('input[name="proxy-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isNone = radio.value === 'none';
      document.getElementById('proxy-details-box').style.display = isNone ? 'none' : 'block';
    });
  });

  // Randomize Fingerprint
  document.getElementById('btn-randomize-fp').addEventListener('click', () => {
    const os = document.getElementById('p-os').value;
    generateNewFingerprint(os);
    showToast('Generated fresh C++ hardware profile', 'success', 2000);
  });

  document.getElementById('p-os').addEventListener('change', () => {
    generateNewFingerprint(document.getElementById('p-os').value);
  });

  // Proxy Test Connection
  document.getElementById('btn-check-proxy').addEventListener('click', async () => {
    const statusMsg = document.getElementById('proxy-check-status');
    const host = document.getElementById('px-host').value.trim();
    const port = document.getElementById('px-port').value.trim();

    if (!host || !port) {
      statusMsg.innerHTML = '<span style="color: var(--danger);">Host and port are required</span>';
      return;
    }

    statusMsg.innerHTML = '<span style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Checking latency...</span>';

    try {
      const res = await fetch('/api/check-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          port,
          mode: document.querySelector('input[name="proxy-type"]:checked').value,
          username: document.getElementById('px-user').value.trim(),
          password: document.getElementById('px-pass').value.trim()
        })
      });
      const data = await res.json();
      if (data.status === 'online') {
        statusMsg.innerHTML = `<span style="color: var(--primary);">✓ Online (${data.pingMs}ms) · IP: ${data.ip || 'OK'}</span>`;
      } else {
        statusMsg.innerHTML = `<span style="color: var(--danger);">✗ Connection failed: ${data.error || 'Timeout'}</span>`;
      }
    } catch (err) {
      statusMsg.innerHTML = `<span style="color: var(--danger);">✗ Request error: ${err.message}</span>`;
    }
  });

  // Sidebar Navigation Items
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });

  // Smart Proxy Auto-Detector on Single Profile Modal
  const smartInput = document.getElementById('px-smart-input');
  const clearSmartBtn = document.getElementById('btn-smart-paste-clear');
  if (smartInput) {
    smartInput.addEventListener('input', () => {
      applySmartProxyToForm(smartInput.value, 'single');
    });
    smartInput.addEventListener('paste', () => {
      setTimeout(() => applySmartProxyToForm(smartInput.value, 'single'), 20);
    });
  }
  if (clearSmartBtn) {
    clearSmartBtn.addEventListener('click', () => {
      smartInput.value = '';
      const alertEl = document.getElementById('smart-paste-alert');
      if (alertEl) alertEl.style.display = 'none';
    });
  }

  // Also smart-paste if user pastes whole proxy line directly into Host field
  const pxHost = document.getElementById('px-host');
  if (pxHost) {
    pxHost.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData)?.getData('text');
      if (pasted && (pasted.includes(':') || pasted.includes('@') || pasted.includes(' '))) {
        e.preventDefault();
        applySmartProxyToForm(pasted, 'single');
      }
    });
  }

  // Smart Proxy Auto-Detector on Bulk Proxy Modal
  const bulkSmartInput = document.getElementById('bulk-px-smart-paste');
  if (bulkSmartInput) {
    bulkSmartInput.addEventListener('input', () => {
      applySmartProxyToForm(bulkSmartInput.value, 'bulk');
    });
    bulkSmartInput.addEventListener('paste', () => {
      setTimeout(() => applySmartProxyToForm(bulkSmartInput.value, 'bulk'), 20);
    });
  }

  // Smart Proxy in Proxy Manager View
  const mgrInput = document.getElementById('mgr-proxy-input');
  const mgrTestBtn = document.getElementById('btn-mgr-test-proxy');
  const mgrClearBtn = document.getElementById('btn-mgr-clear-proxy');
  const mgrCreateBtn = document.getElementById('btn-create-profile-with-proxy');

  if (mgrInput) {
    mgrInput.addEventListener('input', () => {
      applySmartProxyToForm(mgrInput.value, 'manager');
    });
    mgrInput.addEventListener('paste', () => {
      setTimeout(() => applySmartProxyToForm(mgrInput.value, 'manager'), 20);
    });
  }
  if (mgrClearBtn) {
    mgrClearBtn.addEventListener('click', () => {
      mgrInput.value = '';
      const details = document.getElementById('mgr-proxy-details');
      if (details) details.style.display = 'none';
      const statusEl = document.getElementById('mgr-proxy-status');
      if (statusEl) statusEl.innerHTML = '';
    });
  }
  if (mgrTestBtn) {
    mgrTestBtn.addEventListener('click', async () => {
      const raw = mgrInput.value.trim();
      const parsed = parseProxyString(raw);
      if (!parsed || !parsed.host || !parsed.port) {
        showToast('Please paste a valid proxy string first (host:port)', 'error');
        return;
      }
      const statusEl = document.getElementById('mgr-proxy-status');
      statusEl.innerHTML = '<span class="text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Testing latency...</span>';
      try {
        const res = await fetch('/api/check-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });
        const data = await res.json();
        if (data.status === 'online') {
          statusEl.innerHTML = `<span class="text-green"><i class="fa-solid fa-circle-check"></i> <strong>ONLINE</strong> (${data.pingMs}ms latency) · Detected Outbound IP: <strong>${data.ip || 'OK'}</strong> · Zero WebRTC leak</span>`;
          showToast(`Proxy online (${data.pingMs}ms)!`, 'success');
        } else {
          statusEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> <strong>OFFLINE</strong>: ${data.error || 'Connection failed'}</span>`;
          showToast(`Proxy offline: ${data.error || 'Failed'}`, 'error');
        }
      } catch (err) {
        statusEl.innerHTML = `<span class="text-danger">Request error: ${err.message}</span>`;
      }
    });
  }
  if (mgrCreateBtn) {
    mgrCreateBtn.addEventListener('click', () => {
      const raw = mgrInput.value.trim();
      const parsed = parseProxyString(raw);
      openCreateModal();
      if (parsed && parsed.host) {
        switchTab('tab-proxy');
        applySmartProxyToForm(raw, 'single');
      }
    });
  }

  // Global Keyboard Shortcuts (Ctrl+K or "/" to search, Esc to close modals)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      const search = document.getElementById('search-input');
      if (search) {
        search.focus();
        search.select();
      }
    } else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      const search = document.getElementById('search-input');
      if (search) {
        search.focus();
        search.select();
      }
    } else if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-backdrop.active, .modal-backdrop.show');
      if (activeModal) {
        closeModal(activeModal.id);
      } else if (document.activeElement === document.getElementById('search-input')) {
        document.getElementById('search-input').blur();
      }
      const popover = document.getElementById('custom-columns-popover');
      if (popover && !popover.classList.contains('hidden')) {
        popover.classList.add('hidden');
      }
    }
  });

  // Close column customizer on outside click
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('custom-columns-popover');
    const btn = document.getElementById('btn-customize-columns');
    if (popover && !popover.classList.contains('hidden')) {
      if (!popover.contains(e.target) && !btn?.contains(e.target)) {
        popover.classList.add('hidden');
      }
    }
  });
}

// -------------------------------------------------------------
// ENGINE UPDATE NOTIFICATION & DOWNLOAD MANAGER
// -------------------------------------------------------------
let updatesStatus = null;
let downloadPollInterval = null;

async function loadUpdatesStatus() {
  try {
    const res = await fetch('/api/updates/status');
    const data = await res.json();
    if (data.success) {
      updatesStatus = data;
      renderUpdatesNotification();
    }
  } catch (e) {
    console.warn('Failed to load updates status:', e);
  }
}

function renderUpdatesNotification() {
  const badge = document.getElementById('topbar-update-alert');
  const badgeCount = document.getElementById('updates-count-badge');
  const container = document.getElementById('engine-updates-container');

  const total = updatesStatus?.totalUpdatesAvailable || 0;
  if (badge && badgeCount) {
    if (total > 0) {
      badge.classList.remove('hidden');
      badgeCount.textContent = total;
    } else {
      badge.classList.add('hidden');
    }
  }

  if (!container || !updatesStatus?.engines) return;

  const engines = updatesStatus.engines;
  const list = [
    { key: 'chrome', data: engines.chrome, icon: 'fa-brands fa-chrome', color: '#f59e0b' },
    { key: 'orbita', data: engines.orbita, icon: 'fa-solid fa-shield-halved', color: 'var(--primary)' },
    { key: 'camoufox', data: engines.camoufox, icon: 'fa-solid fa-shield-cat', color: '#a855f7' }
  ];

  let html = '<div class="engine-updates-grid">';
  list.forEach(item => {
    const e = item.data;
    if (!e) return;
    const isUpdate = Boolean(e.updateAvailable);
    const installedText = e.installed || 'Not installed';
    const latestText = e.latest || 'Latest';
    const sizeText = e.sizeMb ? ` (~${e.sizeMb} MB)` : '';

    html += `
      <div class="engine-update-card ${isUpdate ? 'has-update' : ''}">
        <div class="engine-update-card-header">
          <div class="engine-update-card-title" style="color: ${item.color}">
            <i class="${item.icon}"></i>
            <span>${escapeHtml(e.name || item.key)}</span>
          </div>
          <span class="status-pill ${isUpdate ? 'active' : 'ready'}" style="${isUpdate ? 'background: rgba(245, 158, 11, 0.2); color: #fbbf24; border-color: rgba(245, 158, 11, 0.4);' : ''}">
            ${isUpdate ? '⚡ Update Available' : (e.installed ? '✓ Up to Date' : 'Not Installed')}
          </span>
        </div>
        <div class="version-comparison-row">
          <span><strong>Installed:</strong> ${escapeHtml(installedText)}</span>
          <span><strong>Latest:</strong> ${escapeHtml(latestText)}</span>
        </div>
        <div class="flex-row gap-2 mt-1">
          ${isUpdate ? `
            <button class="btn btn-sm btn-primary" onclick="downloadEngineUpdate('${item.key}', '${escapeHtml(e.name)}', '${escapeHtml(latestText)}')">
              <i class="fa-solid fa-download"></i> Download & Install ${sizeText}
            </button>
          ` : `
            <button class="btn btn-sm btn-secondary" onclick="downloadEngineUpdate('${item.key}', '${escapeHtml(e.name)}', '${escapeHtml(latestText)}')">
              <i class="fa-solid fa-arrows-rotate"></i> Re-download / Repair
            </button>
          `}
        </div>
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}

async function triggerCheckUpdates() {
  const icon = document.getElementById('check-updates-icon');
  if (icon) icon.classList.add('fa-spin');
  showToast('Checking online version registries...', 'info', 2000);

  try {
    const res = await fetch('/api/updates/check', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      await loadUpdatesStatus();
      await loadSystemInfo();
      showToast('Engine version check complete!', 'success', 2500);
    }
  } catch (e) {
    showToast('Failed to check updates: ' + e.message, 'error');
  } finally {
    if (icon) icon.classList.remove('fa-spin');
  }
}

async function downloadEngineUpdate(key, name, version) {
  const confirmed = window.confirm(`Download and install ${name} (v${version})?\n\nThe engine will be downloaded and configured automatically.`);
  if (!confirmed) return;

  const progressWrap = document.getElementById('download-progress-container');
  const bar = document.getElementById('download-progress-bar');
  const msg = document.getElementById('download-progress-msg');
  const pct = document.getElementById('download-progress-pct');

  if (progressWrap) progressWrap.classList.remove('hidden');
  if (bar) bar.style.width = '10%';
  if (msg) msg.textContent = `Starting download for ${name}...`;
  if (pct) pct.textContent = '10%';

  showToast(`Initiating download for ${name}...`, 'info');

  try {
    const res = await fetch('/api/updates/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: key })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start download');

    if (downloadPollInterval) clearInterval(downloadPollInterval);
    downloadPollInterval = setInterval(async () => {
      try {
        const pRes = await fetch('/api/updates/progress');
        const prog = await pRes.json();
        if (bar) bar.style.width = `${prog.percent || 10}%`;
        if (pct) pct.textContent = `${prog.percent || 10}%`;
        if (msg) msg.textContent = prog.message || 'Processing...';

        if (prog.status === 'done') {
          clearInterval(downloadPollInterval);
          if (bar) bar.style.width = '100%';
          if (pct) pct.textContent = '100%';
          if (progressWrap) setTimeout(() => progressWrap.classList.add('hidden'), 3500);
          showToast(`${name} installed and ready!`, 'success', 4000);
          await loadUpdatesStatus();
          await loadSystemInfo();
        } else if (prog.status === 'error') {
          clearInterval(downloadPollInterval);
          showToast(`Download failed: ${prog.message}`, 'error', 6000);
        }
      } catch (err) {
        clearInterval(downloadPollInterval);
      }
    }, 700);
  } catch (e) {
    showToast('Download error: ' + e.message, 'error');
    if (progressWrap) progressWrap.classList.add('hidden');
  }
}

// -------------------------------------------------------------
// CLOUD STORAGE SYNC (MinIO / S3 VPS)
// -------------------------------------------------------------
let cloudConfigCache = null;

async function loadCloudConfig() {
  try {
    const res = await fetch('/api/cloud/config');
    const cfg = await res.json();
    cloudConfigCache = cfg;

    const enabledToggle = document.getElementById('cloud-enabled-toggle');
    const endpointInput = document.getElementById('cloud-endpoint');
    const bucketInput = document.getElementById('cloud-bucket');
    const accessKeyInput = document.getElementById('cloud-access-key');
    const secretKeyInput = document.getElementById('cloud-secret-key');
    const autoPullToggle = document.getElementById('cloud-auto-pull');
    const autoPushToggle = document.getElementById('cloud-auto-push');
    const lastSyncEl = document.getElementById('cloud-last-sync-text');

    if (enabledToggle) enabledToggle.checked = Boolean(cfg.enabled);
    if (endpointInput) endpointInput.value = cfg.endpoint || '';
    if (bucketInput) bucketInput.value = cfg.bucket || 'orbita-profiles';
    if (accessKeyInput) accessKeyInput.value = cfg.accessKey || '';
    if (secretKeyInput) secretKeyInput.value = cfg.secretKey || '';
    if (autoPullToggle) autoPullToggle.checked = Boolean(cfg.autoSyncOnLaunch);
    if (autoPushToggle) autoPushToggle.checked = cfg.autoSyncOnClose !== false;

    if (lastSyncEl) {
      if (cfg.lastSync) {
        lastSyncEl.textContent = `Last sync: ${new Date(cfg.lastSync).toLocaleString()}`;
      } else {
        lastSyncEl.textContent = 'Last sync: Never';
      }
    }

    if (cfg.enabled && cfg.endpoint && cfg.accessKey && cfg.hasSecretKey) {
      testCloudConnection(false);
    }
  } catch (err) {
    console.error('Failed to load cloud config:', err);
  }
}

async function saveCloudConfig() {
  try {
    const btn = document.getElementById('btn-save-cloud-config');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      btn.disabled = true;
    }

    const payload = {
      enabled: document.getElementById('cloud-enabled-toggle')?.checked || false,
      endpoint: document.getElementById('cloud-endpoint')?.value?.trim() || '',
      bucket: document.getElementById('cloud-bucket')?.value?.trim() || 'orbita-profiles',
      region: 'us-east-1',
      accessKey: document.getElementById('cloud-access-key')?.value?.trim() || '',
      secretKey: document.getElementById('cloud-secret-key')?.value?.trim() || '',
      autoSyncOnLaunch: document.getElementById('cloud-auto-pull')?.checked || false,
      autoSyncOnClose: document.getElementById('cloud-auto-push')?.checked || false
    };

    const res = await fetch('/api/cloud/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (btn) {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }

    if (data.success) {
      showToast('Cloud storage settings saved successfully!', 'success');
      cloudConfigCache = data.config;
      testCloudConnection(false);
    } else {
      showToast(data.error || 'Failed to save cloud settings', 'error');
    }
  } catch (err) {
    showToast('Network error saving cloud config: ' + err.message, 'error');
  }
}

async function testCloudConnection(showToastAlert = true) {
  const btn = document.getElementById('btn-test-cloud');
  const origHtml = btn ? btn.innerHTML : '';
  const statusPill = document.getElementById('cloud-status-pill');
  const statusText = document.getElementById('cloud-status-text');
  const latencyPill = document.getElementById('cloud-latency-pill');
  const latencyText = document.getElementById('cloud-latency-text');

  if (btn && showToastAlert) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing...';
    btn.disabled = true;
  }

  if (statusPill && statusText) {
    statusPill.className = 'badge-status checking';
    statusText.textContent = 'Testing connection...';
  }

  try {
    const override = {
      endpoint: document.getElementById('cloud-endpoint')?.value?.trim() || '',
      bucket: document.getElementById('cloud-bucket')?.value?.trim() || 'orbita-profiles',
      accessKey: document.getElementById('cloud-access-key')?.value?.trim() || '',
      secretKey: document.getElementById('cloud-secret-key')?.value?.trim() || ''
    };

    const res = await fetch('/api/cloud/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(override)
    });
    const result = await res.json();

    if (result.success) {
      if (statusPill && statusText) {
        statusPill.className = 'badge-status connected';
        statusText.textContent = 'Connected (MinIO / S3)';
      }
      if (latencyPill && latencyText) {
        latencyPill.classList.remove('hidden');
        latencyText.textContent = `${result.latencyMs || 0} ms`;
      }
      if (showToastAlert) {
        showToast(result.message || 'Connected to storage bucket!', 'success');
      }
    } else {
      if (statusPill && statusText) {
        statusPill.className = 'badge-status disconnected';
        statusText.textContent = 'Connection Failed';
      }
      if (latencyPill) latencyPill.classList.add('hidden');
      if (showToastAlert) {
        showToast(result.error || 'Could not connect to MinIO storage', 'error', 6000);
      }
    }
  } catch (err) {
    if (statusPill && statusText) {
      statusPill.className = 'badge-status disconnected';
      statusText.textContent = 'Network Error';
    }
    if (latencyPill) latencyPill.classList.add('hidden');
    if (showToastAlert) {
      showToast('Connection test error: ' + err.message, 'error');
    }
  } finally {
    if (btn && showToastAlert) {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }
}

async function syncPushAll() {
  const btn = document.getElementById('btn-cloud-push-all');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
    btn.disabled = true;
  }

  try {
    const res = await fetch('/api/cloud/sync-push', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      if (data.totalSynced === 0 && Array.isArray(data.details) && data.details.length > 0) {
        const firstFail = data.details.find(d => !d.success);
        showToast(`Sync completed: 0 profiles synced${firstFail ? ' (' + firstFail.error + ')' : ''}`, 'warning', 4500);
      } else {
        showToast(`Successfully backed up ${data.totalSynced} profile(s) to MinIO!`, 'success');
      }
      const lastSyncEl = document.getElementById('cloud-last-sync-text');
      if (lastSyncEl && data.timestamp) {
        lastSyncEl.textContent = `Last sync: ${new Date(data.timestamp).toLocaleString()}`;
      }
      try {
        renderCloudProfilesTable();
      } catch (tableErr) {
        console.warn('Notice: Error refreshing cloud profiles table:', tableErr);
      }
    } else {
      showToast(data.error || 'Failed to sync profiles to cloud', 'error');
    }
  } catch (err) {
    showToast('Cloud push failed: ' + (err?.message || 'Network request failed'), 'error');
  } finally {
    if (btn) {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }
}

async function syncPullAll() {
  const btn = document.getElementById('btn-cloud-pull-all');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Restoring...';
    btn.disabled = true;
  }

  try {
    const res = await fetch('/api/cloud/sync-pull', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast(`Restored ${data.restoredCount} profiles from Cloud!`, 'success');
      const lastSyncEl = document.getElementById('cloud-last-sync-text');
      if (lastSyncEl && data.timestamp) {
        lastSyncEl.textContent = `Last sync: ${new Date(data.timestamp).toLocaleString()}`;
      }
      await loadProfiles();
      renderCloudProfilesTable();
    } else {
      showToast(data.error || 'Failed to restore profiles from cloud', 'error');
    }
  } catch (err) {
    showToast('Cloud pull failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }
}

async function syncSingleProfile(id) {
  try {
    showToast('Uploading profile to MinIO cloud...', 'info', 2000);
    const res = await fetch(`/api/cloud/sync-profile/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Profile backed up (${data.sessionSizeKb} KB)`, 'success');
      renderCloudProfilesTable();
    } else {
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (err) {
    showToast('Sync error: ' + err.message, 'error');
  }
}

async function pullSingleProfile(id) {
  try {
    showToast('Pulling profile from MinIO cloud...', 'info', 2000);
    const res = await fetch(`/api/cloud/pull-profile/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Profile restored from cloud', 'success');
      await loadProfiles();
      renderCloudProfilesTable();
    } else {
      showToast(data.error || 'Pull failed', 'error');
    }
  } catch (err) {
    showToast('Pull error: ' + err.message, 'error');
  }
}

function toggleSecretVisibility() {
  const secretInput = document.getElementById('cloud-secret-key');
  const eyeIcon = document.getElementById('cloud-secret-eye');
  if (!secretInput) return;

  if (secretInput.type === 'password') {
    secretInput.type = 'text';
    if (eyeIcon) {
      eyeIcon.classList.remove('fa-eye');
      eyeIcon.classList.add('fa-eye-slash');
    }
  } else {
    secretInput.type = 'password';
    if (eyeIcon) {
      eyeIcon.classList.remove('fa-eye-slash');
      eyeIcon.classList.add('fa-eye');
    }
  }
}

function renderCloudProfilesTable() {
  const tbody = document.getElementById('cloud-profiles-tbody');
  const countEl = document.getElementById('cloud-profiles-count');
  if (!tbody) return;

  const currentList = (typeof profiles !== 'undefined' && Array.isArray(profiles)) 
    ? profiles 
    : ((typeof allProfiles !== 'undefined' && Array.isArray(allProfiles)) ? allProfiles : []);
  if (countEl) countEl.textContent = `${currentList.length} local profile(s) ready`;

  if (currentList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">No profiles found locally. Click "Pull All from Cloud" to restore them from your VPS.</td></tr>`;
    return;
  }

  tbody.innerHTML = currentList.map(p => {
    if (!p) return '';
    const isRunning = Boolean(p.isRunning);
    const proxyDesc = (p.proxy && p.proxy.mode !== 'none' && p.proxy.host) 
      ? `${p.proxy.mode.toUpperCase()} (${p.proxy.host}:${p.proxy.port})` 
      : '<span class="text-muted">Direct</span>';
    const engineName = p.browserEngine || p.engine || 'orbita';

    return `
      <tr>
        <td>
          <div class="profile-name-cell">
            <strong>${escapeHtml(p.name || 'Unnamed')}</strong>
            <span class="text-xs text-muted">ID: ${(p.id || '').slice(0, 8)}...</span>
          </div>
        </td>
        <td>
          <span class="badge ${engineName === 'orbita' ? 'badge-primary' : (engineName === 'chrome' ? 'badge-info' : 'badge-warning')}">
            ${engineName.toUpperCase()}
          </span>
        </td>
        <td>${proxyDesc}</td>
        <td>
          <span class="badge ${isRunning ? 'badge-success' : 'badge-secondary'}">
            ${isRunning ? 'Running' : 'Saved Locally'}
          </span>
        </td>
        <td>
          <span class="text-xs text-green"><i class="fa-solid fa-circle-check"></i> Cloud Ready</span>
        </td>
        <td>
          <div class="flex-center gap-1">
            <button class="btn btn-sm btn-secondary" onclick="syncSingleProfile('${escapeHtml(p.id)}')" title="Upload this profile to MinIO">
              <i class="fa-solid fa-cloud-arrow-up"></i> Push
            </button>
            <button class="btn btn-sm btn-outline" onclick="pullSingleProfile('${escapeHtml(p.id)}')" title="Download this profile from MinIO">
              <i class="fa-solid fa-cloud-arrow-down"></i> Pull
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------
// GOLOGIN OFFICIAL PROFILES IMPORTER
// -------------------------------------------------------------
let detectedGoLoginProfiles = [];
let selectedGoLoginIds = new Set();
let currentCustomScanDir = null;

async function checkGoLoginProfiles(showToastAlert = false, customDir = null) {
  try {
    if (customDir !== null) currentCustomScanDir = customDir;
    let url = '/api/import/gologin/detect';
    if (currentCustomScanDir) {
      url += `?customDir=${encodeURIComponent(currentCustomScanDir)}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      detectedGoLoginProfiles = data.profiles || [];
      const badge = document.getElementById('gologin-detected-badge');
      if (badge) badge.textContent = detectedGoLoginProfiles.length;

      const unimported = detectedGoLoginProfiles.filter(p => !p.alreadyImported);
      if (showToastAlert) {
        showToast(`Discovered ${detectedGoLoginProfiles.length} GoLogin profiles (${unimported.length} new)`, 'success');
      }
      renderGoLoginModal();
    }
  } catch (err) {
    if (showToastAlert) showToast('Failed to scan GoLogin profiles: ' + err.message, 'error');
  }
}

async function scanCustomGoLoginPath() {
  const inputEl = document.getElementById('gologin-custom-path');
  const pathVal = inputEl ? inputEl.value.trim() : '';
  if (!pathVal) {
    showToast('Please enter a folder path to scan', 'info');
    return;
  }
  showToast('Scanning custom path for GoLogin profiles...', 'info', 1500);
  await checkGoLoginProfiles(true, pathVal);
}

function openGoLoginImportModal() {
  openModal('gologin-import-modal');
  checkGoLoginProfiles(false);
}

function renderGoLoginModal() {
  const tbody = document.getElementById('gologin-import-tbody');
  const countEl = document.getElementById('gologin-modal-count');
  const statusEl = document.getElementById('gologin-selected-status');
  if (!tbody) return;

  if (countEl) countEl.textContent = detectedGoLoginProfiles.length;

  if (detectedGoLoginProfiles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">No GoLogin profiles detected in this location. Enter a custom folder path above to scan.</td></tr>`;
    if (statusEl) statusEl.textContent = '0 profiles selected';
    return;
  }

  // Pre-select unimported profiles by default
  selectedGoLoginIds.clear();
  detectedGoLoginProfiles.forEach(p => {
    if (!p.alreadyImported) selectedGoLoginIds.add(p.goLoginId);
  });
  if (selectedGoLoginIds.size === 0) {
    detectedGoLoginProfiles.forEach(p => selectedGoLoginIds.add(p.goLoginId));
  }

  tbody.innerHTML = detectedGoLoginProfiles.map(p => {
    const isChecked = selectedGoLoginIds.has(p.goLoginId);
    const cookieBadge = p.cookieSizeKb > 0 
      ? `<span class="badge badge-success"><i class="fa-solid fa-cookie-bite"></i> ${p.cookieSizeKb} KB</span>`
      : `<span class="badge badge-secondary">No cookies</span>`;
    const pwdBadge = p.hasSavedPasswords
      ? `<span class="badge badge-primary"><i class="fa-solid fa-key"></i> Saved</span>`
      : `<span class="text-xs text-muted">None</span>`;
    const statusBadge = p.alreadyImported
      ? `<span class="badge badge-secondary"><i class="fa-solid fa-check"></i> Already Imported</span>`
      : `<span class="badge badge-info"><i class="fa-solid fa-sparkles"></i> Ready to Import</span>`;

    return `
      <tr>
        <td>
          <input type="checkbox" class="gologin-check" data-id="${p.goLoginId}" ${isChecked ? 'checked' : ''} onchange="onGoLoginItemToggle('${p.goLoginId}', this.checked)">
        </td>
        <td>
          <div class="profile-name-cell">
            <strong>${escapeHtml(p.name)}</strong>
            <span class="text-xs text-muted">ID: ${p.goLoginId.slice(0, 8)}...</span>
          </div>
        </td>
        <td>${cookieBadge}</td>
        <td>${pwdBadge}</td>
        <td><span class="text-xs">${p.resolution} · ${p.cpuCores} Cores · ${p.ramGb}GB</span></td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');

  updateGoLoginSelectedStatus();
}

function onGoLoginItemToggle(id, isChecked) {
  if (isChecked) selectedGoLoginIds.add(id);
  else selectedGoLoginIds.delete(id);
  updateGoLoginSelectedStatus();
}

function toggleSelectAllGoLogin(checked) {
  selectedGoLoginIds.clear();
  if (checked) {
    detectedGoLoginProfiles.forEach(p => selectedGoLoginIds.add(p.goLoginId));
  }
  document.querySelectorAll('.gologin-check').forEach(cb => {
    cb.checked = checked;
  });
  updateGoLoginSelectedStatus();
}

function updateGoLoginSelectedStatus() {
  const statusEl = document.getElementById('gologin-selected-status');
  const btn = document.getElementById('btn-execute-gologin-import');
  const count = selectedGoLoginIds.size;
  if (statusEl) statusEl.textContent = `${count} of ${detectedGoLoginProfiles.length} selected`;
  if (btn) btn.disabled = count === 0;
}

async function executeGoLoginImport() {
  const btn = document.getElementById('btn-execute-gologin-import');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing sessions...';
    btn.disabled = true;
  }

  try {
    const ids = Array.from(selectedGoLoginIds);
    const res = await fetch('/api/import/gologin/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedIds: ids,
        customDir: currentCustomScanDir || null
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Successfully imported ${data.count} profiles with active cookies & passwords!`, 'success', 5000);
      closeModal('gologin-import-modal');
      await loadProfiles();
      renderCloudProfilesTable();
    } else {
      showToast(data.error || 'Failed to import profiles', 'error');
    }
  } catch (err) {
    showToast('Import error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }
}

// Global scope bindings for inline action buttons
window.startSingleProfile = startSingleProfile;
window.stopSingleProfile = stopSingleProfile;
window.cloneSingleProfile = cloneSingleProfile;
window.deleteSingleProfile = deleteSingleProfile;
window.openProfileFolder = openProfileFolder;
window.openEditModal = openEditModal;
window.copyToClipboard = copyToClipboard;
window.switchView = switchView;
window.testProxyFromRow = testProxyFromRow;
window.testFirstProfileWithUrl = testFirstProfileWithUrl;
window.testFirstProfileWithEngine = testFirstProfileWithEngine;
window.triggerCheckUpdates = triggerCheckUpdates;
window.downloadEngineUpdate = downloadEngineUpdate;
window.loadCloudConfig = loadCloudConfig;
window.saveCloudConfig = saveCloudConfig;
window.testCloudConnection = testCloudConnection;
window.syncPushAll = syncPushAll;
window.syncPullAll = syncPullAll;
window.syncSingleProfile = syncSingleProfile;
window.pullSingleProfile = pullSingleProfile;
window.toggleSecretVisibility = toggleSecretVisibility;
window.renderCloudProfilesTable = renderCloudProfilesTable;
window.openGoLoginImportModal = openGoLoginImportModal;
window.checkGoLoginProfiles = checkGoLoginProfiles;
window.scanCustomGoLoginPath = scanCustomGoLoginPath;
window.toggleSelectAllGoLogin = toggleSelectAllGoLogin;
window.onGoLoginItemToggle = onGoLoginItemToggle;
window.executeGoLoginImport = executeGoLoginImport;

// Safe Init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
