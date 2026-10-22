/**
 * DevProbe — Frontend Application Script
 * Day 2: Professional Developer Workspace UI
 *
 * This script manages interactive UI states for DevProbe:
 * - Tab switching (request configuration & response inspector)
 * - Dynamic parameter and header row additions/removals
 * - HTTP method selector and badge synchronization
 * - Sidebar search filtering and drawer collapsing
 * - Sample request selection and editor synchronization
 * - Toast notification messaging for placeholder actions
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize all application components
  initTabs();
  initKeyValueTables();
  initBodyTypeSelector();
  initAuthTypeSelector();
  initMethodSelector();
  initSidebar();
  initActionButtons();
  initResponseViewer();
});

/* ==========================================================================
   1. Toast Notification System
   ========================================================================== */

/**
 * Display a non-blocking toast message
 * @param {string} title - Short title for the toast
 * @param {string} message - Explanatory message
 * @param {('info'|'warning'|'success')} type - Visual indicator category
 */
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  // Icon based on type
  const iconSvg = type === 'warning'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
    : type === 'success'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

  const iconDiv = document.createElement('div');
  iconDiv.className = 'toast-icon';
  iconDiv.innerHTML = iconSvg;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'toast-content';

  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title;

  const msgEl = document.createElement('div');
  msgEl.className = 'toast-msg';
  msgEl.textContent = message;

  contentDiv.appendChild(titleEl);
  contentDiv.appendChild(msgEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Close toast');
  closeBtn.addEventListener('click', () => removeToast(toast));

  toast.appendChild(iconDiv);
  toast.appendChild(contentDiv);
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  // Auto-dismiss after 4.5 seconds
  setTimeout(() => {
    removeToast(toast);
  }, 4500);
}

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(10px)';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 200);
}

/* ==========================================================================
   2. Request Configuration and Response Tabs
   ========================================================================== */

function initTabs() {
  // Request Config Tabs (Params, Headers, Body, Auth)
  const configTabs = document.querySelectorAll('.config-tab');
  configTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      // Update tab button states
      configTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // Update panels
      const panels = document.querySelectorAll('.config-panel');
      panels.forEach((p) => p.classList.remove('active'));

      const activePanel = document.getElementById(`panel-${targetTab}`);
      if (activePanel) {
        activePanel.classList.add('active');
      }
    });
  });

  // Response Inspector Tabs (Body, Headers, Cookies)
  const responseTabs = document.querySelectorAll('.response-tab');
  responseTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      responseTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const panels = document.querySelectorAll('.response-panel');
      panels.forEach((p) => p.classList.remove('active'));

      const activePanel = document.getElementById(`panel-${targetTab}`);
      if (activePanel) {
        activePanel.classList.add('active');
      }
    });
  });
}

/* ==========================================================================
   3. Key-Value Tables (Parameters & Headers)
   ========================================================================== */

function initKeyValueTables() {
  // Add initial parameter rows
  const paramsTbody = document.getElementById('params-tbody');
  if (paramsTbody) {
    createRow(paramsTbody, '', '', '', false, updateParamsCount);
  }

  // Add initial header rows with standard default suggestions
  const headersTbody = document.getElementById('headers-tbody');
  if (headersTbody) {
    createRow(headersTbody, 'Accept', 'application/json', 'Expected response format', true, updateHeadersCount);
    createRow(headersTbody, 'User-Agent', 'DevProbe/1.0', 'Client identifier', true, updateHeadersCount);
    updateHeadersCount();
  }

  // Hook Add Parameter button
  const btnAddParam = document.getElementById('btn-add-param');
  if (btnAddParam) {
    btnAddParam.addEventListener('click', () => {
      createRow(paramsTbody, '', '', '', true, updateParamsCount);
      updateParamsCount();
    });
  }

  // Hook Add Header button
  const btnAddHeader = document.getElementById('btn-add-header');
  if (btnAddHeader) {
    btnAddHeader.addEventListener('click', () => {
      createRow(headersTbody, '', '', '', true, updateHeadersCount);
      updateHeadersCount();
    });
  }
}

/**
 * Creates a generic key-value row inside a tbody
 */
function createRow(tbody, key = '', value = '', desc = '', enabled = true, countCallback = null) {
  if (!tbody) return;

  const tr = document.createElement('tr');

  // Checkbox column
  const tdCheck = document.createElement('td');
  tdCheck.className = 'col-check';
  const labelCheck = document.createElement('label');
  labelCheck.className = 'cell-checkbox';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled;
  checkbox.setAttribute('aria-label', 'Toggle row active state');
  checkbox.addEventListener('change', () => {
    if (countCallback) countCallback();
  });
  labelCheck.appendChild(checkbox);
  tdCheck.appendChild(labelCheck);

  // Key column
  const tdKey = document.createElement('td');
  tdKey.className = 'col-key';
  const inputKey = document.createElement('input');
  inputKey.type = 'text';
  inputKey.className = 'table-input font-mono';
  inputKey.placeholder = 'Key';
  inputKey.value = key;
  inputKey.addEventListener('input', () => {
    if (countCallback) countCallback();
  });
  tdKey.appendChild(inputKey);

  // Value column
  const tdVal = document.createElement('td');
  tdVal.className = 'col-val';
  const inputVal = document.createElement('input');
  inputVal.type = 'text';
  inputVal.className = 'table-input font-mono';
  inputVal.placeholder = 'Value';
  inputVal.value = value;
  tdVal.appendChild(inputVal);

  // Description column
  const tdDesc = document.createElement('td');
  tdDesc.className = 'col-desc';
  const inputDesc = document.createElement('input');
  inputDesc.type = 'text';
  inputDesc.className = 'table-input';
  inputDesc.placeholder = 'Description (optional)';
  inputDesc.value = desc;
  tdDesc.appendChild(inputDesc);

  // Action column (Delete row)
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-remove-row';
  deleteBtn.title = 'Remove row';
  deleteBtn.setAttribute('aria-label', 'Remove row');
  deleteBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>`;
  deleteBtn.addEventListener('click', () => {
    tr.remove();
    if (countCallback) countCallback();
  });
  tdAction.appendChild(deleteBtn);

  // Assemble row
  tr.appendChild(tdCheck);
  tr.appendChild(tdKey);
  tr.appendChild(tdVal);
  tr.appendChild(tdDesc);
  tr.appendChild(tdAction);

  tbody.appendChild(tr);

  if (countCallback) countCallback();
}

function updateParamsCount() {
  const tbody = document.getElementById('params-tbody');
  const countBadge = document.getElementById('params-count');
  if (!tbody || !countBadge) return;

  const rows = tbody.querySelectorAll('tr');
  let activeCount = 0;
  rows.forEach((row) => {
    const check = row.querySelector('input[type="checkbox"]');
    const keyInput = row.querySelector('.col-key input');
    if (check && check.checked && keyInput && keyInput.value.trim().length > 0) {
      activeCount++;
    }
  });
  countBadge.textContent = activeCount.toString();
}

function updateHeadersCount() {
  const tbody = document.getElementById('headers-tbody');
  const countBadge = document.getElementById('headers-count');
  if (!tbody || !countBadge) return;

  const rows = tbody.querySelectorAll('tr');
  let activeCount = 0;
  rows.forEach((row) => {
    const check = row.querySelector('input[type="checkbox"]');
    const keyInput = row.querySelector('.col-key input');
    if (check && check.checked && keyInput && keyInput.value.trim().length > 0) {
      activeCount++;
    }
  });
  countBadge.textContent = activeCount.toString();
}

/* ==========================================================================
   4. Request Body Controls
   ========================================================================== */

function initBodyTypeSelector() {
  const bodyRadios = document.querySelectorAll('input[name="body-type"]');
  const bodyNoneMsg = document.getElementById('body-none-msg');
  const bodyInputWrapper = document.getElementById('body-input-wrapper');
  const bodyActiveDot = document.getElementById('body-active-dot');
  const editorFormatLabel = document.getElementById('editor-format-label');
  const bodyTextarea = document.getElementById('body-textarea');
  const btnFormatJson = document.getElementById('btn-format-json');

  bodyRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      const selected = radio.value;

      if (selected === 'none') {
        bodyNoneMsg.classList.remove('hidden');
        bodyInputWrapper.classList.add('hidden');
        bodyActiveDot.classList.add('hidden');
      } else {
        bodyNoneMsg.classList.add('hidden');
        bodyInputWrapper.classList.remove('hidden');
        bodyActiveDot.classList.remove('hidden');

        if (selected === 'json') {
          editorFormatLabel.textContent = 'JSON Editor (application/json)';
          btnFormatJson.classList.remove('hidden');
          if (!bodyTextarea.value.trim()) {
            bodyTextarea.value = '{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}';
          }
        } else {
          editorFormatLabel.textContent = 'Raw Text (text/plain)';
          btnFormatJson.classList.add('hidden');
        }
      }
    });
  });

  // Beautify JSON button
  if (btnFormatJson && bodyTextarea) {
    btnFormatJson.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(bodyTextarea.value);
        bodyTextarea.value = JSON.stringify(parsed, null, 2);
        showToast('JSON Formatted', 'Formatted body payload successfully.', 'info');
      } catch (err) {
        showToast('JSON Error', 'Payload is not valid JSON. Please check syntax.', 'warning');
      }
    });
  }
}

/* ==========================================================================
   5. Authentication Controls
   ========================================================================== */

function initAuthTypeSelector() {
  const authSelect = document.getElementById('auth-type-select');
  const subNone = document.getElementById('auth-subpanel-none');
  const subBearer = document.getElementById('auth-subpanel-bearer');
  const subBasic = document.getElementById('auth-subpanel-basic');
  const authSublabel = document.getElementById('auth-sublabel');

  if (!authSelect) return;

  authSelect.addEventListener('change', () => {
    const val = authSelect.value;

    // Hide all subpanels
    subNone.classList.add('hidden');
    subBearer.classList.add('hidden');
    subBasic.classList.add('hidden');

    if (val === 'bearer') {
      subBearer.classList.remove('hidden');
      authSublabel.textContent = 'Bearer';
    } else if (val === 'basic') {
      subBasic.classList.remove('hidden');
      authSublabel.textContent = 'Basic';
    } else {
      subNone.classList.remove('hidden');
      authSublabel.textContent = 'None';
    }
  });
}

/* ==========================================================================
   6. HTTP Method Selector and Synchronizer
   ========================================================================== */

function initMethodSelector() {
  const methodSelect = document.getElementById('http-method-select');
  const tabMethodLabel = document.getElementById('tab-method-label');

  if (!methodSelect) return;

  const updateMethodStyle = (method) => {
    // Reset all method classes on select
    methodSelect.className = `http-method-select method-color-${method.toLowerCase()}`;

    // Update tab badge
    if (tabMethodLabel) {
      tabMethodLabel.textContent = method;
      tabMethodLabel.className = `tab-method-badge method-${method.toLowerCase()}`;
    }
  };

  methodSelect.addEventListener('change', () => {
    updateMethodStyle(methodSelect.value);
  });
}

/* ==========================================================================
   7. Sidebar (Collections, Search, History, Collapse)
   ========================================================================== */

function initSidebar() {
  // Folder Toggle (Demo Collection)
  const folderToggle = document.getElementById('folder-toggle-btn');
  const folder = document.getElementById('demo-collection-folder');
  if (folderToggle && folder) {
    folderToggle.addEventListener('click', () => {
      const isCollapsed = folder.classList.toggle('collapsed');
      folderToggle.setAttribute('aria-expanded', (!isCollapsed).toString());
    });
  }

  // Sidebar Toggle Button (Collapse/Expand)
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('sidebar');
  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  // Sidebar Search Filter
  const searchInput = document.getElementById('sidebar-search');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const noResultsMsg = document.getElementById('no-filter-results');
  const requestButtons = document.querySelectorAll('.sidebar-content .request-item');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();

      if (query.length > 0) {
        btnClearSearch.classList.remove('hidden');
      } else {
        btnClearSearch.classList.add('hidden');
      }

      let visibleCount = 0;
      requestButtons.forEach((btn) => {
        const name = (btn.getAttribute('data-name') || '').toLowerCase();
        const url = (btn.getAttribute('data-url') || '').toLowerCase();
        const method = (btn.getAttribute('data-method') || '').toLowerCase();

        if (name.includes(query) || url.includes(query) || method.includes(query)) {
          btn.style.display = 'flex';
          visibleCount++;
        } else {
          btn.style.display = 'none';
        }
      });

      if (noResultsMsg) {
        if (visibleCount === 0) {
          noResultsMsg.classList.remove('hidden');
        } else {
          noResultsMsg.classList.add('hidden');
        }
      }
    });

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        btnClearSearch.classList.add('hidden');
        requestButtons.forEach((btn) => (btn.style.display = 'flex'));
        if (noResultsMsg) noResultsMsg.classList.add('hidden');
        searchInput.focus();
      });
    }
  }

  // Sample Request Click Handling
  requestButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Mark as active in sidebar
      requestButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const method = btn.getAttribute('data-method') || 'GET';
      const name = btn.getAttribute('data-name') || 'Untitled Request';
      const url = btn.getAttribute('data-url') || '';

      loadRequestIntoEditor(method, name, url);
    });
  });
}

/**
 * Loads a specified request's parameters into the active editor
 */
function loadRequestIntoEditor(method, name, url) {
  const methodSelect = document.getElementById('http-method-select');
  const urlInput = document.getElementById('request-url-input');
  const tabTitleLabel = document.getElementById('tab-title-label');
  const tabMethodLabel = document.getElementById('tab-method-label');

  if (methodSelect) {
    methodSelect.value = method;
    methodSelect.className = `http-method-select method-color-${method.toLowerCase()}`;
  }

  if (urlInput) {
    urlInput.value = url;
  }

  if (tabTitleLabel) {
    tabTitleLabel.textContent = name;
  }

  if (tabMethodLabel) {
    tabMethodLabel.textContent = method;
    tabMethodLabel.className = `tab-method-badge method-${method.toLowerCase()}`;
  }

  showToast('Request Selected', `Loaded "${name}" into the workspace.`, 'info');
}

/* ==========================================================================
   8. Action Buttons (Send, Save, New Request, Environment, Settings)
   ========================================================================== */

function initActionButtons() {
  // Send Button
  const btnSend = document.getElementById('btn-send-request');
  if (btnSend) {
    btnSend.addEventListener('click', () => {
      const urlInput = document.getElementById('request-url-input');
      const targetUrl = urlInput ? urlInput.value.trim() : '';

      showToast(
        'Request Execution Planned for Day 5',
        `API execution engine is currently under development. Requests to "${targetUrl || 'URL'}" will be executed starting in Day 5.`,
        'info'
      );
    });
  }

  // Save Button
  const btnSave = document.getElementById('btn-save-request');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      showToast(
        'Saving Functionality Coming Soon',
        'Database-backed collection and request persistence is planned for Day 9.',
        'warning'
      );
    });
  }

  // New Request in Sidebar & New Tab Button
  const btnSidebarNew = document.getElementById('btn-sidebar-new-request');
  const btnNewTab = document.getElementById('btn-new-tab');
  const btnCloseTab = document.getElementById('btn-close-tab');

  const resetToNewRequest = () => {
    loadRequestIntoEditor('GET', 'Untitled Request', '');
    showToast('New Request Tab', 'Reset workspace editor for a new request.', 'info');
  };

  if (btnSidebarNew) {
    btnSidebarNew.addEventListener('click', resetToNewRequest);
  }

  if (btnNewTab) {
    btnNewTab.addEventListener('click', resetToNewRequest);
  }

  if (btnCloseTab) {
    btnCloseTab.addEventListener('click', (e) => {
      e.stopPropagation();
      resetToNewRequest();
    });
  }

  // New Collection Button
  const btnNewCollection = document.getElementById('btn-new-collection');
  if (btnNewCollection) {
    btnNewCollection.addEventListener('click', () => {
      showToast(
        'Collections Management',
        'Creating custom collections will be enabled alongside persistent storage in Day 9.',
        'info'
      );
    });
  }

  // Environment Selector
  const envSelector = document.getElementById('env-selector');
  if (envSelector) {
    envSelector.addEventListener('change', () => {
      const selectedText = envSelector.options[envSelector.selectedIndex].text;
      showToast('Environment Changed', `Switched active environment to: ${selectedText}. Variable substitution planned for Day 13.`, 'info');
    });
  }

  // Settings Button
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      showToast('Workspace Settings', 'Application settings, SSL verification toggles, and themes will be configurable in a later phase.', 'info');
    });
  }

  // User Profile
  const btnAvatar = document.getElementById('btn-user-avatar');
  if (btnAvatar) {
    btnAvatar.addEventListener('click', () => {
      showToast('User Account', 'Logged in as Demo Developer (Prasad Deshmukh). User authentication planned for Day 10.', 'info');
    });
  }

  // Workspace Switcher
  const btnWorkspace = document.getElementById('btn-workspace');
  if (btnWorkspace) {
    btnWorkspace.addEventListener('click', () => {
      showToast('Workspaces', 'Workspace management and collaboration features planned for Phase 3.', 'info');
    });
  }
}

/* ==========================================================================
   9. Response Viewer Toolbar
   ========================================================================== */

function initResponseViewer() {
  const btnCopy = document.getElementById('btn-copy-response');
  const formatButtons = document.querySelectorAll('.format-btn');

  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      showToast('Response Viewer', 'No response data available to copy yet. Execute a request once Day 5 is released.', 'info');
    });
  }

  formatButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      formatButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}
