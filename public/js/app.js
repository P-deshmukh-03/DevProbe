/**
 * DevProbe — Frontend Application Script
 * Day 3: Request Configuration and State Management
 *
 * This script provides centralized state management for HTTP requests in DevProbe:
 * - Centralized JavaScript request state (URL, method, params, headers, body, auth, env)
 * - Safe URL query parameter preparation, encoding, and live preview
 * - Environment variable resolution (e.g. {{base_url}}) with error reporting
 * - Client-side HTTP header validation (RFC 7230 compliant, case-insensitive duplicate detection)
 * - JSON body validation and beautification with error preservation
 * - In-memory authentication management (zero credential persistence in storage/URLs)
 * - Complete Day 2 UI synchronization (sidebar, tabs, tables, toasts, response viewer)
 */

/* ==========================================================================
   1. Environment Configuration and Variable Resolution
   ========================================================================== */

/**
 * Predefined demonstration environments and sample variable mappings.
 * Kept separate from the active request state.
 */
const ENVIRONMENTS = {
  none: {
    name: 'No Environment',
    variables: {}
  },
  dev: {
    name: 'Development (Local)',
    variables: {
      base_url: 'http://localhost:3000',
      api_version: 'v1',
      port: '3000'
    }
  },
  staging: {
    name: 'Staging',
    variables: {
      base_url: 'https://staging.api.example.com',
      api_version: 'v1',
      timeout_ms: '5000'
    }
  },
  prod: {
    name: 'Production',
    variables: {
      base_url: 'https://api.example.com',
      api_version: 'v1'
    }
  }
};

/**
 * Look up an environment variable by name in a specified environment.
 * @param {string} envKey - The environment key ('none'|'dev'|'staging'|'prod')
 * @param {string} varName - The variable name to look up
 * @returns {string|undefined} The resolved variable value or undefined if not found
 */
function getEnvironmentVariable(envKey, varName) {
  if (!envKey || !ENVIRONMENTS[envKey]) return undefined;
  const env = ENVIRONMENTS[envKey];
  if (env.variables && Object.prototype.hasOwnProperty.call(env.variables, varName)) {
    return env.variables[varName];
  }
  return undefined;
}

/**
 * Replaces {{variable_name}} placeholders in a string using the selected environment.
 * Reports missing variables without silently converting them to empty strings.
 * @param {string} input - The string containing {{variable}} placeholders
 * @param {string} envKey - The active environment key
 * @returns {{ resolvedText: string, missingVariables: string[], substituted: boolean }}
 */
function resolveVariables(input, envKey) {
  if (typeof input !== 'string' || !input) {
    return { resolvedText: input || '', missingVariables: [], substituted: false };
  }

  const missingVariables = [];
  let substituted = false;

  // Regex pattern matching {{var_name}}
  const placeholderRegex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

  const resolvedText = input.replace(placeholderRegex, (match, varName) => {
    const val = getEnvironmentVariable(envKey, varName);
    if (val !== undefined) {
      substituted = true;
      return val;
    }
    // Variable is missing in this environment
    if (!missingVariables.includes(varName)) {
      missingVariables.push(varName);
    }
    // Retain placeholder so user can see what failed to resolve
    return match;
  });

  return {
    resolvedText,
    missingVariables,
    substituted
  };
}

/* ==========================================================================
   2. Centralized Request State
   ========================================================================== */

/**
 * The single source of truth for the active request currently being configured.
 * DOM controls synchronize with this state structure.
 */
const activeRequest = {
  id: 'req-1',
  name: 'Get User Profile',
  method: 'GET',
  url: 'https://jsonplaceholder.typicode.com/users/1',
  params: [
    // Initial parameter placeholder row
    { id: 'param-init', key: '', value: '', description: '', enabled: false }
  ],
  headers: [
    { id: 'hdr-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true },
    { id: 'hdr-2', key: 'User-Agent', value: 'DevProbe/1.0', description: 'Client identifier', enabled: true }
  ],
  body: {
    type: 'none', // 'none' | 'json' | 'text'
    text: ''
  },
  auth: {
    type: 'none', // 'none' | 'bearer' | 'basic'
    bearerToken: '',
    basicUsername: '',
    basicPassword: ''
  },
  selectedEnvironment: 'none'
};

/**
 * Preset sample request configurations for collections and demo history.
 */
const SAMPLE_REQUEST_TEMPLATES = {
  'req-1': {
    name: 'Get User Profile',
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/users/1',
    params: [
      { id: 'p-1', key: '', value: '', description: '', enabled: false }
    ],
    headers: [
      { id: 'h-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true },
      { id: 'h-2', key: 'User-Agent', value: 'DevProbe/1.0', description: 'Client identifier', enabled: true }
    ],
    body: { type: 'none', text: '' },
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }
  },
  'req-2': {
    name: 'Create New Post',
    method: 'POST',
    url: 'https://jsonplaceholder.typicode.com/posts',
    params: [
      { id: 'p-1', key: '', value: '', description: '', enabled: false }
    ],
    headers: [
      { id: 'h-1', key: 'Content-Type', value: 'application/json', description: 'JSON payload format', enabled: true },
      { id: 'h-2', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }
    ],
    body: {
      type: 'json',
      text: '{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}'
    },
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }
  },
  'req-3': {
    name: 'Remove Item',
    method: 'DELETE',
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    params: [
      { id: 'p-1', key: '', value: '', description: '', enabled: false }
    ],
    headers: [
      { id: 'h-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }
    ],
    body: { type: 'none', text: '' },
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }
  },
  'hist-1': {
    name: 'Get Users List',
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/users',
    params: [
      { id: 'p-1', key: 'limit', value: '10', description: 'Page limit', enabled: true }
    ],
    headers: [
      { id: 'h-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }
    ],
    body: { type: 'none', text: '' },
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }
  },
  'hist-2': {
    name: 'Login Authenticate',
    method: 'POST',
    url: 'https://jsonplaceholder.typicode.com/posts',
    params: [],
    headers: [
      { id: 'h-1', key: 'Content-Type', value: 'application/json', description: 'JSON payload', enabled: true }
    ],
    body: {
      type: 'json',
      text: '{\n  "username": "demo",\n  "password": "secretPassword"\n}'
    },
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }
  },
  'hist-3': {
    name: 'Check Server Health',
    method: 'GET',
    url: 'http://localhost:3000/api/health',
    params: [],
    headers: [
      { id: 'h-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }
    ],
    body: { type: 'none', text: '' },
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }
  }
};

/**
 * Generate a unique ID for state rows
 */
function generateRowId(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
}

/* ==========================================================================
   3. Request URL Handling and Query Parameter Preparation
   ========================================================================== */

/**
 * Prepares the final request URL without executing any network requests.
 * Safely resolves environment variables, preserves existing query params,
 * appends enabled query parameters from state, and validates the URL syntax.
 *
 * @param {string} rawUrl - Base URL string (may contain query parameters or {{var}} tags)
 * @param {Array<{ key: string, value: string, enabled: boolean }>} params - Array of parameter rows
 * @param {string} envKey - Active environment key
 * @returns {{ isValid: boolean, url: string, error?: string, missingVariables?: string[] }}
 */
function prepareRequestUrl(rawUrl, params = [], envKey = 'none') {
  // 1. Check for presence of URL
  if (!rawUrl || !rawUrl.trim()) {
    return {
      isValid: false,
      url: '',
      error: 'URL is required'
    };
  }

  const trimmed = rawUrl.trim();

  // 2. Resolve environment variables in the URL
  const { resolvedText, missingVariables } = resolveVariables(trimmed, envKey);
  if (missingVariables.length > 0) {
    return {
      isValid: false,
      url: resolvedText,
      error: `Missing environment variable: {{${missingVariables.join(', ')}}}`,
      missingVariables
    };
  }

  // 3. Parse base URL safely using the standard URL API
  let parsedUrl;
  let isRelative = false;

  try {
    // Attempt standard absolute URL parsing
    parsedUrl = new URL(resolvedText);
  } catch (err) {
    // If it starts with / or is relative, parse against window origin or localhost placeholder
    if (resolvedText.startsWith('/') || resolvedText.startsWith('./')) {
      try {
        const dummyOrigin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
          ? window.location.origin
          : 'http://localhost:3000';
        parsedUrl = new URL(resolvedText, dummyOrigin);
        isRelative = true;
      } catch (relErr) {
        return {
          isValid: false,
          url: resolvedText,
          error: 'Invalid relative URL syntax'
        };
      }
    } else {
      // Missing protocol or malformed scheme
      return {
        isValid: false,
        url: resolvedText,
        error: 'Invalid URL syntax. URL must include a protocol (e.g. https:// or http://)'
      };
    }
  }

  // 4. Apply enabled query parameters from request state
  if (Array.isArray(params)) {
    params.forEach((param) => {
      // Must be enabled
      if (!param || !param.enabled) return;

      // Key must be present and not purely whitespace
      if (typeof param.key !== 'string' || !param.key.trim()) return;

      // Resolve variables in key and value
      const keyResolved = resolveVariables(param.key.trim(), envKey).resolvedText;
      const rawVal = param.value !== undefined && param.value !== null ? String(param.value) : '';
      const valResolved = resolveVariables(rawVal, envKey).resolvedText;

      // Append parameter preserving existing parameters and handling special characters
      parsedUrl.searchParams.append(keyResolved, valResolved);
    });
  }

  // 5. Construct final prepared URL string
  const finalUrl = isRelative
    ? `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
    : parsedUrl.toString();

  return {
    isValid: true,
    url: finalUrl
  };
}

/**
 * Updates the URL preview bar in the UI.
 * Does not modify the user's raw input in the request-url input box.
 */
function updateUrlPreview() {
  if (typeof document === 'undefined') return;
  const previewText = document.getElementById('url-preview-text');
  const previewStatus = document.getElementById('url-preview-status');
  if (!previewText || !previewStatus) return;

  const result = prepareRequestUrl(
    activeRequest.url,
    activeRequest.params,
    activeRequest.selectedEnvironment
  );

  if (result.isValid) {
    previewText.textContent = result.url;
    previewText.title = result.url;
    previewStatus.textContent = 'Ready';
    previewStatus.className = 'url-preview-status badge-valid';
  } else {
    previewText.textContent = result.url || '(No URL provided)';
    previewText.title = result.error || 'Invalid URL';
    previewStatus.textContent = result.error || 'Invalid';
    previewStatus.className = 'url-preview-status badge-invalid';
  }
}

/* ==========================================================================
   4. HTTP Header Validation
   ========================================================================== */

/**
 * Validates HTTP request headers on the client side according to RFC 7230 token rules.
 * Detects empty header names, invalid header name characters, and duplicate headers case-insensitively.
 *
 * @param {Array<{ key: string, value: string, enabled: boolean }>} headers
 * @param {boolean} showToastFeedback - Whether to show a toast message on manual validation
 * @returns {{ isValid: boolean, errors: string[], warnings: string[] }}
 */
function validateHeaders(headers, showToastFeedback = false) {
  const errors = [];
  const warnings = [];
  const seenHeaderNames = new Map(); // lowercase -> originalName

  // RFC 7230 token characters: 1*tchar
  // tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA
  const validHeaderNamePattern = /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/;

  if (Array.isArray(headers)) {
    headers.forEach((header, index) => {
      // Ignore disabled header rows
      if (!header || !header.enabled) return;

      const rawKey = header.key !== undefined && header.key !== null ? String(header.key) : '';
      const trimmedKey = rawKey.trim();
      const rowNum = index + 1;

      // 1. Reject empty header name
      if (!trimmedKey) {
        errors.push(`Row ${rowNum}: Header name cannot be empty when enabled.`);
        return;
      }

      // 2. Reject invalid header name characters (spaces, colons, non-token characters)
      if (!validHeaderNamePattern.test(trimmedKey)) {
        errors.push(`Row ${rowNum}: Invalid header name "${trimmedKey}". Header names cannot contain spaces, colons, or control characters.`);
        return;
      }

      // 3. Detect duplicate header names case-insensitively
      const lowerKey = trimmedKey.toLowerCase();
      if (seenHeaderNames.has(lowerKey)) {
        const originalName = seenHeaderNames.get(lowerKey);
        errors.push(`Duplicate header "${trimmedKey}" detected (conflicts with "${originalName}"). Headers are case-insensitive.`);
      } else {
        seenHeaderNames.set(lowerKey, trimmedKey);
      }
    });
  }

  const isValid = errors.length === 0;

  // Update UI validation banner in the Headers panel
  const banner = typeof document !== 'undefined' ? document.getElementById('headers-validation-msg') : null;
  if (banner) {
    if (!isValid) {
      banner.className = 'validation-banner banner-error';
      banner.innerHTML = `<strong>Header Validation Issues:</strong><ul style="margin:4px 0 0 16px;padding:0;">${errors.map((e) => `<li>${e}</li>`).join('')}</ul>`;
      banner.classList.remove('hidden');
    } else {
      banner.className = 'validation-banner banner-success';
      banner.innerHTML = '<strong>Headers Valid:</strong> All enabled headers conform to standard HTTP token specifications.';
      banner.classList.remove('hidden');

      // Auto-hide success message after 3.5 seconds
      setTimeout(() => {
        if (banner.classList.contains('banner-success')) {
          banner.classList.add('hidden');
        }
      }, 3500);
    }
  }

  if (showToastFeedback) {
    if (isValid) {
      showToast('Headers Validated', 'All active request headers are valid.', 'success');
    } else {
      showToast('Header Validation Error', errors[0], 'warning');
    }
  }

  return {
    isValid,
    errors,
    warnings
  };
}

/* ==========================================================================
   5. JSON Body Validation and Beautification
   ========================================================================== */

/**
 * Validates request body text if JSON mode is active.
 * Uses JSON.parse() safely inside try/catch and preserves user's original text on error.
 *
 * @param {string} text - Request body payload
 * @param {string} bodyType - Active body type ('none'|'json'|'text')
 * @param {boolean} showToastFeedback - Whether to trigger toast notification
 * @returns {{ isValid: boolean, message: string, parsed?: any }}
 */
function validateJsonBody(text, bodyType = 'json', showToastFeedback = false) {
  const badge = typeof document !== 'undefined' ? document.getElementById('json-validation-badge') : null;
  const feedbackMsg = typeof document !== 'undefined' ? document.getElementById('json-validation-msg') : null;

  // If not JSON body mode, skip JSON validation
  if (bodyType !== 'json') {
    if (badge) badge.classList.add('hidden');
    if (feedbackMsg) feedbackMsg.classList.add('hidden');
    return { isValid: true, message: 'Non-JSON body mode active; validation skipped.' };
  }

  const trimmed = (text || '').trim();

  // If empty, it's valid empty payload
  if (!trimmed) {
    if (badge) {
      badge.textContent = 'Empty Payload';
      badge.className = 'validation-chip';
      badge.classList.remove('hidden');
    }
    if (feedbackMsg) feedbackMsg.classList.add('hidden');
    if (showToastFeedback) {
      showToast('JSON Body', 'Body payload is currently empty.', 'info');
    }
    return { isValid: true, message: 'Payload is empty.' };
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (badge) {
      badge.textContent = 'Valid JSON';
      badge.className = 'validation-chip chip-success';
      badge.classList.remove('hidden');
    }
    if (feedbackMsg) {
      feedbackMsg.classList.add('hidden');
    }

    if (showToastFeedback) {
      showToast('Valid JSON', 'JSON payload parsed successfully with zero syntax errors.', 'success');
    }

    return {
      isValid: true,
      message: 'Valid JSON format.',
      parsed
    };
  } catch (err) {
    const errMsg = `JSON Parse Error: ${err.message}`;

    if (badge) {
      badge.textContent = 'Invalid JSON';
      badge.className = 'validation-chip chip-error';
      badge.classList.remove('hidden');
    }
    if (feedbackMsg) {
      feedbackMsg.textContent = errMsg;
      feedbackMsg.classList.remove('hidden');
    }

    if (showToastFeedback) {
      showToast('Invalid JSON Payload', err.message, 'warning');
    }

    return {
      isValid: false,
      message: errMsg
    };
  }
}

/**
 * Beautifies JSON payload using JSON.stringify(parsed, null, 2).
 * Preserves user's original text if JSON is invalid.
 */
function beautifyJsonBody() {
  const bodyTextarea = document.getElementById('body-textarea');
  if (!bodyTextarea) return;

  const currentText = bodyTextarea.value;
  const result = validateJsonBody(currentText, 'json', false);

  if (result.isValid && result.parsed !== undefined) {
    const formatted = JSON.stringify(result.parsed, null, 2);
    bodyTextarea.value = formatted;
    activeRequest.body.text = formatted;
    showToast('JSON Beautified', 'Formatted body payload successfully.', 'success');
  } else if (!currentText.trim()) {
    showToast('Beautify JSON', 'Cannot beautify empty JSON payload.', 'info');
  } else {
    // Preserve user's original text!
    showToast('Cannot Beautify JSON', result.message, 'warning');
  }
}

/* ==========================================================================
   6. Toast Notification System
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
   7. Synchronizing State with the User Interface
   ========================================================================== */

/**
 * Loads a structured request configuration into activeRequest state and renders it to the DOM.
 */
function loadRequestIntoState(template) {
  if (!template) return;

  activeRequest.name = template.name || 'Untitled Request';
  activeRequest.method = template.method || 'GET';
  activeRequest.url = template.url || '';

  // Deep copy params & headers to avoid mutating original templates
  activeRequest.params = Array.isArray(template.params)
    ? template.params.map((p) => ({ ...p, id: p.id || generateRowId('param') }))
    : [{ id: generateRowId('param'), key: '', value: '', description: '', enabled: false }];

  activeRequest.headers = Array.isArray(template.headers)
    ? template.headers.map((h) => ({ ...h, id: h.id || generateRowId('hdr') }))
    : [];

  activeRequest.body = template.body
    ? { type: template.body.type || 'none', text: template.body.text || '' }
    : { type: 'none', text: '' };

  activeRequest.auth = template.auth
    ? {
        type: template.auth.type || 'none',
        bearerToken: template.auth.bearerToken || '',
        basicUsername: template.auth.basicUsername || '',
        basicPassword: template.auth.basicPassword || ''
      }
    : { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' };

  // Render state to DOM
  renderActiveRequestToUI();
}

/**
 * Renders all controls from the centralized activeRequest state.
 */
function renderActiveRequestToUI() {
  if (typeof document === 'undefined') return;
  // 1. Method selector & Badge
  const methodSelect = document.getElementById('http-method-select');
  const tabMethodLabel = document.getElementById('tab-method-label');
  if (methodSelect) {
    methodSelect.value = activeRequest.method;
    methodSelect.className = `http-method-select method-color-${activeRequest.method.toLowerCase()}`;
  }
  if (tabMethodLabel) {
    tabMethodLabel.textContent = activeRequest.method;
    tabMethodLabel.className = `tab-method-badge method-${activeRequest.method.toLowerCase()}`;
  }

  // 2. Request URL
  const urlInput = document.getElementById('request-url-input');
  if (urlInput) {
    urlInput.value = activeRequest.url;
  }

  // 3. Tab Title
  const tabTitleLabel = document.getElementById('tab-title-label');
  if (tabTitleLabel) {
    tabTitleLabel.textContent = activeRequest.name;
  }

  // 4. Render Table rows
  renderParamsTable();
  renderHeadersTable();

  // 5. Body controls
  renderBodyControls();

  // 6. Auth controls
  renderAuthControls();

  // 7. Update Live URL Preview
  updateUrlPreview();
}

/**
 * Renders the Query Parameters table strictly from activeRequest.params state.
 */
function renderParamsTable() {
  const tbody = document.getElementById('params-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  activeRequest.params.forEach((param) => {
    const tr = document.createElement('tr');

    // Checkbox (enabled)
    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const labelCheck = document.createElement('label');
    labelCheck.className = 'cell-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!param.enabled;
    checkbox.setAttribute('aria-label', 'Toggle parameter enabled');
    checkbox.addEventListener('change', () => {
      param.enabled = checkbox.checked;
      updateParamsCount();
      updateUrlPreview();
    });
    labelCheck.appendChild(checkbox);
    tdCheck.appendChild(labelCheck);

    // Key input
    const tdKey = document.createElement('td');
    tdKey.className = 'col-key';
    const inputKey = document.createElement('input');
    inputKey.type = 'text';
    inputKey.className = 'table-input font-mono';
    inputKey.placeholder = 'Parameter Key';
    inputKey.value = param.key || '';
    inputKey.addEventListener('input', () => {
      param.key = inputKey.value;
      updateParamsCount();
      updateUrlPreview();
    });
    tdKey.appendChild(inputKey);

    // Value input
    const tdVal = document.createElement('td');
    tdVal.className = 'col-val';
    const inputVal = document.createElement('input');
    inputVal.type = 'text';
    inputVal.className = 'table-input font-mono';
    inputVal.placeholder = 'Value';
    inputVal.value = param.value !== undefined ? String(param.value) : '';
    inputVal.addEventListener('input', () => {
      param.value = inputVal.value;
      updateUrlPreview();
    });
    tdVal.appendChild(inputVal);

    // Description input
    const tdDesc = document.createElement('td');
    tdDesc.className = 'col-desc';
    const inputDesc = document.createElement('input');
    inputDesc.type = 'text';
    inputDesc.className = 'table-input';
    inputDesc.placeholder = 'Description (optional)';
    inputDesc.value = param.description || '';
    inputDesc.addEventListener('input', () => {
      param.description = inputDesc.value;
    });
    tdDesc.appendChild(inputDesc);

    // Delete button
    const tdAction = document.createElement('td');
    tdAction.className = 'col-action';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-remove-row';
    deleteBtn.title = 'Remove parameter';
    deleteBtn.setAttribute('aria-label', 'Remove parameter');
    deleteBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>`;
    deleteBtn.addEventListener('click', () => {
      const idx = activeRequest.params.indexOf(param);
      if (idx !== -1) {
        activeRequest.params.splice(idx, 1);
      }
      renderParamsTable();
      updateUrlPreview();
    });
    tdAction.appendChild(deleteBtn);

    tr.appendChild(tdCheck);
    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tr.appendChild(tdDesc);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  updateParamsCount();
}

/**
 * Renders the HTTP Headers table strictly from activeRequest.headers state.
 */
function renderHeadersTable() {
  const tbody = document.getElementById('headers-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  activeRequest.headers.forEach((header) => {
    const tr = document.createElement('tr');

    // Checkbox (enabled)
    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const labelCheck = document.createElement('label');
    labelCheck.className = 'cell-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!header.enabled;
    checkbox.setAttribute('aria-label', 'Toggle header enabled');
    checkbox.addEventListener('change', () => {
      header.enabled = checkbox.checked;
      updateHeadersCount();
      validateHeaders(activeRequest.headers, false);
    });
    labelCheck.appendChild(checkbox);
    tdCheck.appendChild(labelCheck);

    // Key input
    const tdKey = document.createElement('td');
    tdKey.className = 'col-key';
    const inputKey = document.createElement('input');
    inputKey.type = 'text';
    inputKey.className = 'table-input font-mono';
    inputKey.placeholder = 'Header Key (e.g. Accept)';
    inputKey.value = header.key || '';
    inputKey.addEventListener('input', () => {
      header.key = inputKey.value;
      updateHeadersCount();
      validateHeaders(activeRequest.headers, false);
    });
    tdKey.appendChild(inputKey);

    // Value input
    const tdVal = document.createElement('td');
    tdVal.className = 'col-val';
    const inputVal = document.createElement('input');
    inputVal.type = 'text';
    inputVal.className = 'table-input font-mono';
    inputVal.placeholder = 'Value (e.g. application/json)';
    inputVal.value = header.value !== undefined ? String(header.value) : '';
    inputVal.addEventListener('input', () => {
      header.value = inputVal.value;
    });
    tdVal.appendChild(inputVal);

    // Description input
    const tdDesc = document.createElement('td');
    tdDesc.className = 'col-desc';
    const inputDesc = document.createElement('input');
    inputDesc.type = 'text';
    inputDesc.className = 'table-input';
    inputDesc.placeholder = 'Description (optional)';
    inputDesc.value = header.description || '';
    inputDesc.addEventListener('input', () => {
      header.description = inputDesc.value;
    });
    tdDesc.appendChild(inputDesc);

    // Delete button
    const tdAction = document.createElement('td');
    tdAction.className = 'col-action';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-remove-row';
    deleteBtn.title = 'Remove header';
    deleteBtn.setAttribute('aria-label', 'Remove header');
    deleteBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>`;
    deleteBtn.addEventListener('click', () => {
      const idx = activeRequest.headers.indexOf(header);
      if (idx !== -1) {
        activeRequest.headers.splice(idx, 1);
      }
      renderHeadersTable();
      validateHeaders(activeRequest.headers, false);
    });
    tdAction.appendChild(deleteBtn);

    tr.appendChild(tdCheck);
    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tr.appendChild(tdDesc);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  updateHeadersCount();
  validateHeaders(activeRequest.headers, false);
}

/**
 * Updates the badge counter for enabled parameters that have a non-empty key.
 */
function updateParamsCount() {
  const countBadge = document.getElementById('params-count');
  if (!countBadge) return;

  const count = activeRequest.params.filter(
    (p) => p.enabled && typeof p.key === 'string' && p.key.trim().length > 0
  ).length;

  countBadge.textContent = count.toString();
}

/**
 * Updates the badge counter for enabled headers that have a non-empty key.
 */
function updateHeadersCount() {
  const countBadge = document.getElementById('headers-count');
  if (!countBadge) return;

  const count = activeRequest.headers.filter(
    (h) => h.enabled && typeof h.key === 'string' && h.key.trim().length > 0
  ).length;

  countBadge.textContent = count.toString();
}

/**
 * Renders body controls from activeRequest.body state.
 */
function renderBodyControls() {
  const bodyRadios = document.querySelectorAll('input[name="body-type"]');
  const bodyNoneMsg = document.getElementById('body-none-msg');
  const bodyInputWrapper = document.getElementById('body-input-wrapper');
  const bodyActiveDot = document.getElementById('body-active-dot');
  const editorFormatLabel = document.getElementById('editor-format-label');
  const bodyTextarea = document.getElementById('body-textarea');
  const btnFormatJson = document.getElementById('btn-format-json');
  const btnValidateJson = document.getElementById('btn-validate-json');

  const selected = activeRequest.body.type || 'none';

  // Set radio state
  bodyRadios.forEach((radio) => {
    radio.checked = radio.value === selected;
  });

  if (bodyTextarea) {
    bodyTextarea.value = activeRequest.body.text || '';
  }

  if (selected === 'none') {
    if (bodyNoneMsg) bodyNoneMsg.classList.remove('hidden');
    if (bodyInputWrapper) bodyInputWrapper.classList.add('hidden');
    if (bodyActiveDot) bodyActiveDot.classList.add('hidden');
  } else {
    if (bodyNoneMsg) bodyNoneMsg.classList.add('hidden');
    if (bodyInputWrapper) bodyInputWrapper.classList.remove('hidden');
    if (bodyActiveDot) bodyActiveDot.classList.remove('hidden');

    if (selected === 'json') {
      if (editorFormatLabel) editorFormatLabel.textContent = 'JSON Editor (application/json)';
      if (btnFormatJson) btnFormatJson.classList.remove('hidden');
      if (btnValidateJson) btnValidateJson.classList.remove('hidden');
    } else {
      if (editorFormatLabel) editorFormatLabel.textContent = 'Raw Text (text/plain)';
      if (btnFormatJson) btnFormatJson.classList.add('hidden');
      if (btnValidateJson) btnValidateJson.classList.add('hidden');
    }
  }

  // Validate or clear JSON status
  validateJsonBody(activeRequest.body.text, selected, false);
}

/**
 * Renders auth controls from activeRequest.auth state without clearing inputs.
 */
function renderAuthControls() {
  const authSelect = document.getElementById('auth-type-select');
  const subNone = document.getElementById('auth-subpanel-none');
  const subBearer = document.getElementById('auth-subpanel-bearer');
  const subBasic = document.getElementById('auth-subpanel-basic');
  const authSublabel = document.getElementById('auth-sublabel');
  const bearerInput = document.getElementById('auth-bearer-token');
  const basicUserInput = document.getElementById('auth-basic-username');
  const basicPassInput = document.getElementById('auth-basic-password');

  const val = activeRequest.auth.type || 'none';

  if (authSelect) authSelect.value = val;

  if (subNone) subNone.classList.add('hidden');
  if (subBearer) subBearer.classList.add('hidden');
  if (subBasic) subBasic.classList.add('hidden');

  if (val === 'bearer') {
    if (subBearer) subBearer.classList.remove('hidden');
    if (authSublabel) authSublabel.textContent = 'Bearer';
  } else if (val === 'basic') {
    if (subBasic) subBasic.classList.remove('hidden');
    if (authSublabel) authSublabel.textContent = 'Basic';
  } else {
    if (subNone) subNone.classList.remove('hidden');
    if (authSublabel) authSublabel.textContent = 'None';
  }

  // Populate inputs from state without clearing them
  if (bearerInput) bearerInput.value = activeRequest.auth.bearerToken || '';
  if (basicUserInput) basicUserInput.value = activeRequest.auth.basicUsername || '';
  if (basicPassInput) basicPassInput.value = activeRequest.auth.basicPassword || '';
}

/* ==========================================================================
   8. Component Initializers and Event Wiring
   ========================================================================== */

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
  // 1. Navigation and inspector tabs
  initTabs();

  // 2. Request URL bar & Method selector
  initRequestBar();

  // 3. Key-Value table controls (Add Parameter, Add Header, Validate Headers)
  initTableActionButtons();

  // 4. Body panel controls (radio modes, JSON formatting and validation)
  initBodyTypeSelector();

  // 5. Auth panel controls (No Auth, Bearer, Basic)
  initAuthTypeSelector();

  // 6. Sidebar (search filter, folder collapse, sample requests, sidebar toggle)
  initSidebar();

  // 7. General action buttons (Send, Save, New Tab, Environments, Settings)
  initActionButtons();

  // 8. Response viewer toolbar (copy, pretty/raw)
  initResponseViewer();

  // 9. Initial state render
  renderActiveRequestToUI();
  });
}

/**
 * Request Bar and URL Input synchronization
 */
function initRequestBar() {
  const methodSelect = document.getElementById('http-method-select');
  const urlInput = document.getElementById('request-url-input');
  const tabMethodLabel = document.getElementById('tab-method-label');
  const btnCopyPreviewUrl = document.getElementById('btn-copy-preview-url');

  if (methodSelect) {
    methodSelect.addEventListener('change', () => {
      activeRequest.method = methodSelect.value;
      methodSelect.className = `http-method-select method-color-${activeRequest.method.toLowerCase()}`;
      if (tabMethodLabel) {
        tabMethodLabel.textContent = activeRequest.method;
        tabMethodLabel.className = `tab-method-badge method-${activeRequest.method.toLowerCase()}`;
      }
    });
  }

  if (urlInput) {
    urlInput.addEventListener('input', () => {
      activeRequest.url = urlInput.value;
      updateUrlPreview();
    });
  }

  if (btnCopyPreviewUrl) {
    btnCopyPreviewUrl.addEventListener('click', () => {
      const previewText = document.getElementById('url-preview-text');
      const textToCopy = previewText ? previewText.textContent : '';
      if (textToCopy && textToCopy !== '(No URL provided)') {
        navigator.clipboard.writeText(textToCopy)
          .then(() => showToast('Copied to Clipboard', textToCopy, 'success'))
          .catch(() => showToast('Copy Failed', 'Clipboard permissions denied.', 'warning'));
      }
    });
  }
}

/**
 * Key-Value Table Action Buttons (Add Parameter, Add Header, Validate Headers)
 */
function initTableActionButtons() {
  const btnAddParam = document.getElementById('btn-add-param');
  const btnAddHeader = document.getElementById('btn-add-header');
  const btnValidateHeaders = document.getElementById('btn-validate-headers');

  if (btnAddParam) {
    btnAddParam.addEventListener('click', () => {
      activeRequest.params.push({
        id: generateRowId('param'),
        key: '',
        value: '',
        description: '',
        enabled: true
      });
      renderParamsTable();
      updateUrlPreview();
    });
  }

  if (btnAddHeader) {
    btnAddHeader.addEventListener('click', () => {
      activeRequest.headers.push({
        id: generateRowId('hdr'),
        key: '',
        value: '',
        description: '',
        enabled: true
      });
      renderHeadersTable();
      validateHeaders(activeRequest.headers, false);
    });
  }

  if (btnValidateHeaders) {
    btnValidateHeaders.addEventListener('click', () => {
      validateHeaders(activeRequest.headers, true);
    });
  }
}

/**
 * Body panel event listeners
 */
function initBodyTypeSelector() {
  const bodyRadios = document.querySelectorAll('input[name="body-type"]');
  const bodyTextarea = document.getElementById('body-textarea');
  const btnFormatJson = document.getElementById('btn-format-json');
  const btnValidateJson = document.getElementById('btn-validate-json');

  bodyRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      activeRequest.body.type = radio.value;
      renderBodyControls();
    });
  });

  if (bodyTextarea) {
    bodyTextarea.addEventListener('input', () => {
      activeRequest.body.text = bodyTextarea.value;
      // Soft validation without noisy toasts while typing
      validateJsonBody(activeRequest.body.text, activeRequest.body.type, false);
    });
  }

  if (btnFormatJson) {
    btnFormatJson.addEventListener('click', beautifyJsonBody);
  }

  if (btnValidateJson) {
    btnValidateJson.addEventListener('click', () => {
      validateJsonBody(activeRequest.body.text, activeRequest.body.type, true);
    });
  }
}

/**
 * Auth panel event listeners
 */
function initAuthTypeSelector() {
  const authSelect = document.getElementById('auth-type-select');
  const bearerInput = document.getElementById('auth-bearer-token');
  const basicUserInput = document.getElementById('auth-basic-username');
  const basicPassInput = document.getElementById('auth-basic-password');

  if (authSelect) {
    authSelect.addEventListener('change', () => {
      activeRequest.auth.type = authSelect.value;
      renderAuthControls();
    });
  }

  if (bearerInput) {
    bearerInput.addEventListener('input', () => {
      activeRequest.auth.bearerToken = bearerInput.value;
    });
  }

  if (basicUserInput) {
    basicUserInput.addEventListener('input', () => {
      activeRequest.auth.basicUsername = basicUserInput.value;
    });
  }

  if (basicPassInput) {
    basicPassInput.addEventListener('input', () => {
      activeRequest.auth.basicPassword = basicPassInput.value;
    });
  }
}

/**
 * Configuration & Response Inspector Tabs
 */
function initTabs() {
  // Request Config Tabs (Params, Headers, Body, Auth)
  const configTabs = document.querySelectorAll('.config-tab');
  configTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      configTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

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

/**
 * Sidebar Navigation (Search filter, Folder collapse, Sample requests, Sidebar drawer)
 */
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
        if (btnClearSearch) btnClearSearch.classList.remove('hidden');
      } else {
        if (btnClearSearch) btnClearSearch.classList.add('hidden');
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
      requestButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const reqId = btn.getAttribute('data-id');
      const method = btn.getAttribute('data-method') || 'GET';
      const name = btn.getAttribute('data-name') || 'Untitled Request';
      const url = btn.getAttribute('data-url') || '';

      if (reqId && SAMPLE_REQUEST_TEMPLATES[reqId]) {
        loadRequestIntoState(SAMPLE_REQUEST_TEMPLATES[reqId]);
      } else {
        // Fallback for custom or unmapped request buttons
        loadRequestIntoState({
          name,
          method,
          url,
          params: [{ id: generateRowId('param'), key: '', value: '', description: '', enabled: false }],
          headers: [
            { id: generateRowId('hdr'), key: 'Accept', value: 'application/json', description: 'Expected format', enabled: true }
          ],
          body: { type: 'none', text: '' },
          auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }
        });
      }

      showToast('Request Selected', `Loaded "${name}" into the workspace.`, 'info');
    });
  });
}

/**
 * Top Navigation and Workspace Action Buttons
 */
function initActionButtons() {
  // Send Button
  const btnSend = document.getElementById('btn-send-request');
  if (btnSend) {
    btnSend.addEventListener('click', () => {
      const prepared = prepareRequestUrl(
        activeRequest.url,
        activeRequest.params,
        activeRequest.selectedEnvironment
      );

      if (!prepared.isValid) {
        showToast('Cannot Send Request', prepared.error || 'Please check your URL configuration.', 'warning');
        return;
      }

      // Validate headers before reporting ready
      const headerVal = validateHeaders(activeRequest.headers, false);
      if (!headerVal.isValid) {
        showToast('Header Issues Detected', headerVal.errors[0], 'warning');
        return;
      }

      showToast(
        'Request Execution Planned for Day 5',
        `Ready to dispatch ${activeRequest.method} request to: ${prepared.url}. API execution engine connects in Day 5.`,
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
    loadRequestIntoState({
      name: 'Untitled Request',
      method: 'GET',
      url: '',
      params: [{ id: generateRowId('param'), key: '', value: '', description: '', enabled: false }],
      headers: [
        { id: generateRowId('hdr'), key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }
      ],
      body: { type: 'none', text: '' },
      auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }
    });
    showToast('New Request Tab', 'Reset workspace editor for a new request.', 'info');
  };

  if (btnSidebarNew) btnSidebarNew.addEventListener('click', resetToNewRequest);
  if (btnNewTab) btnNewTab.addEventListener('click', resetToNewRequest);
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
      showToast('Collections Management', 'Creating custom collections will be enabled alongside persistent storage in Day 9.', 'info');
    });
  }

  // Environment Selector
  const envSelector = document.getElementById('env-selector');
  if (envSelector) {
    envSelector.addEventListener('change', () => {
      const selectedKey = envSelector.value;
      activeRequest.selectedEnvironment = selectedKey;
      const envObj = ENVIRONMENTS[selectedKey];
      const envName = envObj ? envObj.name : 'Unknown';

      updateUrlPreview();
      showToast('Environment Changed', `Switched active environment to: ${envName}. Variables like {{base_url}} will resolve accordingly.`, 'info');
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

/**
 * Response Viewer Toolbar
 */
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

/* ==========================================================================
   9. Testing and Module Compatibility Export
   ========================================================================== */

// Expose state and reusable helpers on window object for testing and inspection
if (typeof window !== 'undefined') {
  window.DevProbe = {
    activeRequest,
    ENVIRONMENTS,
    getEnvironmentVariable,
    resolveVariables,
    prepareRequestUrl,
    validateHeaders,
    validateJsonBody,
    beautifyJsonBody,
    loadRequestIntoState,
    updateUrlPreview,
    showToast
  };
}

// Support Node.js CommonJS test environments if applicable
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    activeRequest,
    ENVIRONMENTS,
    getEnvironmentVariable,
    resolveVariables,
    prepareRequestUrl,
    validateHeaders,
    validateJsonBody,
    beautifyJsonBody,
    loadRequestIntoState
  };
}
