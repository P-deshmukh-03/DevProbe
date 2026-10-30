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
  if (typeof document === 'undefined') return;
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

  // 9. Collections & Saved Requests persistence (Day 10)
  initPersistentCollections();

  // 10. Initial state render
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
      setUrlInputError(false);
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

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      const requestButtons = document.querySelectorAll('.sidebar-content .request-item');

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
        const requestButtons = document.querySelectorAll('.sidebar-content .request-item');
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

/* ==========================================================================
   7.5. Active Response State and Response Viewer Rendering (Day 6 & Day 7)
   ========================================================================== */

/**
 * Concurrency guard to prevent duplicate concurrent request execution
 */
let isRequestRunning = false;

function getRequestRunning() {
  return isRequestRunning;
}

function setRequestRunning(val) {
  isRequestRunning = Boolean(val);
}

/**
 * Sets or clears visual error indicators on the URL input bar
 */
function setUrlInputError(isError) {
  if (typeof document === 'undefined') return;
  const reqBar = document.querySelector('.request-bar');
  const urlInput = document.getElementById('request-url-input');
  if (reqBar) {
    if (isError) reqBar.classList.add('has-error');
    else reqBar.classList.remove('has-error');
  }
  if (urlInput) {
    if (isError) urlInput.classList.add('input-error');
    else urlInput.classList.remove('input-error');
  }
}

/**
 * Programmatically switches the active request configuration tab
 * to focus the user on inputs requiring attention.
 */
function switchConfigTab(tabName) {
  if (typeof document === 'undefined') return;
  const configTabs = document.querySelectorAll('.config-tab');
  configTabs.forEach((tab) => {
    const isTarget = tab.getAttribute('data-tab') === tabName;
    tab.classList.toggle('active', isTarget);
    tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  const panels = document.querySelectorAll('.config-panel');
  panels.forEach((p) => p.classList.remove('active'));

  const activePanel = document.getElementById(`panel-${tabName}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }
}

/**
 * Categorizes an error code into one of four distinct categories:
 * - 'BLOCKED': SSRF destination restrictions
 * - 'VALIDATION': Client or server request input validation failure
 * - 'TRANSPORT': Network, DNS, timeout, or connection failure
 * - 'INTERNAL': Unexpected server-side error
 *
 * @param {string} code
 * @returns {'BLOCKED'|'VALIDATION'|'TRANSPORT'|'INTERNAL'}
 */
function classifyErrorCode(code) {
  if (!code || typeof code !== 'string') return 'INTERNAL';
  const upper = code.toUpperCase();
  if (upper === 'BLOCKED_DESTINATION') {
    return 'BLOCKED';
  }
  if ([
    'INVALID_URL', 'MISSING_URL', 'MISSING_METHOD', 'UNSUPPORTED_METHOD',
    'INVALID_HEADER', 'INVALID_HEADER_NAME', 'INVALID_HEADER_VALUE', 'INVALID_HEADERS', 'DUPLICATE_HEADER',
    'INVALID_JSON', 'INVALID_BODY', 'INVALID_AUTH', 'INVALID_SETTINGS',
    'INVALID_PAYLOAD', 'PAYLOAD_TOO_LARGE'
  ].includes(upper)) {
    return 'VALIDATION';
  }
  if ([
    'REQUEST_TIMEOUT', 'CONNECTION_ERROR', 'DNS_RESOLUTION_FAILED',
    'TLS_ERROR', 'TOO_MANY_REDIRECTS', 'RESPONSE_TOO_LARGE', 'NETWORK_ERROR'
  ].includes(upper)) {
    return 'TRANSPORT';
  }
  return 'INTERNAL';
}

/**
 * State holding details of the most recent HTTP response.
 */
const activeResponse = {
  status: null,
  statusText: '',
  timeMs: null,
  sizeBytes: null,
  contentType: '',
  headers: {},
  body: null,
  rawText: '',
  isJson: false,
  isBinary: false,
  isMalformedJson: false,
  isEmpty: false,
  format: 'pretty' // 'pretty' | 'raw'
};

/**
 * Safely escapes HTML entities to prevent XSS when rendering into DOM.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extracts Content-Type header value case-insensitively from a headers dictionary.
 * @param {Record<string, any>} headers
 * @returns {string}
 */
function getContentType(headers) {
  if (!headers || typeof headers !== 'object') return '';
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-type') {
      return typeof val === 'string' ? val : String(val);
    }
  }
  return '';
}

/**
 * Formats headers into readable RFC-style text for clipboard copying.
 * @param {Record<string, any>} headers
 * @returns {string}
 */
function formatHeadersForCopy(headers) {
  if (!headers || typeof headers !== 'object') return '';
  const entries = Object.entries(headers);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('\n');
}

/**
 * Tokenizes and syntax-highlights formatted JSON text using safe HTML tokens.
 * All dynamic content is strictly HTML-escaped to prevent executable HTML/XSS.
 * @param {string} jsonStr - Valid JSON string formatted with indentation
 * @returns {string} HTML string with syntax highlighting spans
 */
function highlightJsonToHtml(jsonStr) {
  if (typeof jsonStr !== 'string' || !jsonStr) return '';

  // Match JSON tokens:
  // 1. Strings (including object keys ending in colon): "(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?
  // 2. Booleans & null: \b(true|false|null)\b
  // 3. Numbers: -?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?
  // 4. Structural punctuation: [{}[\],:]
  const tokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],:])/g;

  let lastIndex = 0;
  let html = '';
  let match;

  while ((match = tokenRegex.exec(jsonStr)) !== null) {
    if (match.index > lastIndex) {
      html += escapeHtml(jsonStr.slice(lastIndex, match.index));
    }

    const token = match[0];
    const escaped = escapeHtml(token);

    if (token.startsWith('"')) {
      if (token.trim().endsWith(':')) {
        const colonIdx = escaped.lastIndexOf(':');
        html += `<span class="json-key">${escaped.slice(0, colonIdx)}</span><span class="json-punct">:</span>`;
      } else {
        html += `<span class="json-string">${escaped}</span>`;
      }
    } else if (token === 'true' || token === 'false') {
      html += `<span class="json-boolean">${escaped}</span>`;
    } else if (token === 'null') {
      html += `<span class="json-null">${escaped}</span>`;
    } else if (/^-?\d/.test(token)) {
      html += `<span class="json-number">${escaped}</span>`;
    } else {
      html += `<span class="json-punct">${escaped}</span>`;
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < jsonStr.length) {
    html += escapeHtml(jsonStr.slice(lastIndex));
  }

  return html;
}

/**
 * Copies text to system clipboard with Clipboard API and safe textarea fallback.
 * @param {string} text
 * @param {string} successTitle
 * @param {string} successMsg
 * @param {string} failMsg
 * @returns {Promise<boolean>}
 */
function copyTextToClipboard(text, successTitle = 'Copied', successMsg = 'Copied to clipboard.', failMsg = 'Clipboard permission denied.') {
  if (!text || (typeof text === 'string' && text.trim().length === 0)) {
    showToast('Nothing to Copy', 'No content available to copy.', 'info');
    return Promise.resolve(false);
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
      .then(() => {
        showToast(successTitle, successMsg, 'success');
        return true;
      })
      .catch(() => {
        return fallbackCopyText(text, successTitle, successMsg, failMsg);
      });
  }

  return fallbackCopyText(text, successTitle, successMsg, failMsg);
}

/**
 * Fallback clipboard copy using temporary textarea and document.execCommand('copy').
 */
function fallbackCopyText(text, successTitle, successMsg, failMsg) {
  if (typeof document === 'undefined') return Promise.resolve(false);
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) {
      showToast(successTitle, successMsg, 'success');
      return Promise.resolve(true);
    }
  } catch {
    // ignore
  }
  showToast('Copy Failed', failMsg, 'warning');
  return Promise.resolve(false);
}

/**
 * Marks response viewer as loading and resets stale metrics while a request executes.
 */
function setResponseLoadingState() {
  // Reset stale response state so it never misleadingly appears to belong to a new request
  activeResponse.status = null;
  activeResponse.statusText = '';
  activeResponse.timeMs = null;
  activeResponse.sizeBytes = null;
  activeResponse.contentType = '';
  activeResponse.headers = {};
  activeResponse.body = null;
  activeResponse.rawText = '';
  activeResponse.isJson = false;
  activeResponse.isBinary = false;
  activeResponse.isMalformedJson = false;
  activeResponse.isEmpty = false;

  if (typeof document === 'undefined') return;

  const statusBadge = document.getElementById('res-status-badge');
  if (statusBadge) {
    statusBadge.textContent = 'Sending...';
    statusBadge.className = 'metric-badge';
  }

  const typeVal = document.getElementById('res-type-value');
  if (typeVal) {
    typeVal.textContent = '—';
    typeVal.title = '';
  }

  const timeVal = document.getElementById('res-time-value');
  if (timeVal) timeVal.textContent = '— ms';

  const sizeVal = document.getElementById('res-size-value');
  if (sizeVal) sizeVal.textContent = '— B';

  const headersCount = document.getElementById('res-headers-count');
  if (headersCount) headersCount.textContent = '0';

  const headersPanel = document.getElementById('panel-res-headers');
  if (headersPanel) {
    headersPanel.innerHTML = '<div class="response-empty-state"><p class="empty-state-desc">Waiting for response...</p></div>';
  }

  const stateBanner = document.getElementById('response-state-banner');
  if (stateBanner) {
    stateBanner.className = 'response-state-banner hidden';
    stateBanner.innerHTML = '';
  }

  const codeEl = document.getElementById('response-code-display');
  if (codeEl) {
    codeEl.textContent = 'Sending request to destination...';
  }

  const contentArea = document.getElementById('response-content-area');
  if (contentArea) {
    contentArea.style.opacity = '0.5';
  }
}

/**
 * Renders response body content according to current format selection (pretty or raw).
 */
function renderResponseBodyContent() {
  if (typeof document === 'undefined') return;
  const codeEl = document.getElementById('response-code-display');
  const stateBanner = document.getElementById('response-state-banner');
  if (!codeEl) return;

  // 1. Binary Response State
  if (activeResponse.isBinary) {
    if (stateBanner) {
      stateBanner.className = 'response-state-banner banner-info';
      stateBanner.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span><strong>Binary Media Content:</strong> Raw binary preview is suppressed to protect UI performance and avoid console corruption.</span>
      `;
      stateBanner.classList.remove('hidden');
    }
    const ct = escapeHtml(activeResponse.contentType || 'application/octet-stream');
    const sz = activeResponse.sizeBytes !== null && activeResponse.sizeBytes !== undefined ? activeResponse.sizeBytes : 0;
    const formattedSize = sz < 1024 ? `${sz} B` : `${(sz / 1024).toFixed(1)} KB`;

    codeEl.innerHTML = `
      <div class="binary-card">
        <div class="binary-card-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </div>
        <div class="binary-card-content">
          <div class="binary-card-title">Binary Payload Received (${formattedSize})</div>
          <div class="binary-card-desc">Content-Type: <code>${ct}</code></div>
          <div class="binary-card-subtext">Direct rendering of binary streams is suppressed in the response viewer to prevent encoding corruption. File downloads will be supported in a future update.</div>
        </div>
      </div>
    `;
    return;
  }

  // 2. Empty Response State (e.g. HTTP 204 or 0 bytes)
  if (activeResponse.isEmpty) {
    if (stateBanner) {
      const is204 = activeResponse.status === 204;
      stateBanner.className = 'response-state-banner banner-empty';
      stateBanner.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span>${is204 ? '<strong>HTTP 204 No Content:</strong> The upstream server successfully processed the request with no response body.' : '<strong>Empty Response:</strong> The upstream server returned a response with 0 body bytes.'}</span>
      `;
      stateBanner.classList.remove('hidden');
    }
    codeEl.innerHTML = '<span class="empty-body-text">(Empty response body)</span>';
    return;
  }

  // 3. Malformed JSON Response State
  if (activeResponse.isMalformedJson) {
    if (stateBanner) {
      stateBanner.className = 'response-state-banner banner-warning';
      stateBanner.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span><strong>Malformed JSON:</strong> Header indicates JSON, but body could not be parsed. Displaying as raw text.</span>
      `;
      stateBanner.classList.remove('hidden');
    }
    codeEl.textContent = activeResponse.rawText;
    return;
  }

  // Clear state banner for normal responses
  if (stateBanner) {
    stateBanner.className = 'response-state-banner hidden';
    stateBanner.innerHTML = '';
  }

  // 4. Valid JSON Response State
  if (activeResponse.isJson && activeResponse.body !== null && typeof activeResponse.body === 'object') {
    if (activeResponse.format === 'pretty') {
      try {
        const formatted = JSON.stringify(activeResponse.body, null, 2);
        codeEl.innerHTML = highlightJsonToHtml(formatted);
      } catch {
        codeEl.textContent = activeResponse.rawText;
      }
    } else {
      // Raw mode
      codeEl.textContent = activeResponse.rawText;
    }
    return;
  }

  // 5. Plain Text / HTML / Other text responses
  codeEl.textContent = activeResponse.rawText || '(Empty response body)';
}

/**
 * Renders safe response headers table into the Headers tab with search and copy tools.
 */
function renderResponseHeadersPanel() {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('panel-res-headers');
  const countBadge = document.getElementById('res-headers-count');
  if (!panel) return;

  const entries = Object.entries(activeResponse.headers || {});
  if (countBadge) countBadge.textContent = entries.length.toString();

  if (entries.length === 0) {
    panel.innerHTML = '<div class="response-empty-state"><p class="empty-state-desc">No response headers received.</p></div>';
    return;
  }

  panel.innerHTML = '';

  // Toolbar with filter and Copy All button
  const toolbar = document.createElement('div');
  toolbar.className = 'res-headers-toolbar';

  const filterWrapper = document.createElement('div');
  filterWrapper.className = 'res-headers-search-wrapper';
  filterWrapper.innerHTML = `
    <svg class="res-headers-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    <input type="text" class="res-headers-search" placeholder="Filter headers..." aria-label="Filter response headers">
  `;

  const btnCopyAll = document.createElement('button');
  btnCopyAll.className = 'btn-xs btn-outline';
  btnCopyAll.title = 'Copy all response headers to clipboard';
  btnCopyAll.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
    </svg>
    <span>Copy All Headers</span>
  `;
  btnCopyAll.addEventListener('click', () => {
    const formatted = formatHeadersForCopy(activeResponse.headers);
    copyTextToClipboard(
      formatted,
      'Headers Copied',
      `${entries.length} response headers copied to clipboard.`,
      'Unable to copy headers to clipboard.'
    );
  });

  toolbar.appendChild(filterWrapper);
  toolbar.appendChild(btnCopyAll);
  panel.appendChild(toolbar);

  const tableDiv = document.createElement('div');
  tableDiv.className = 'table-responsive';
  const table = document.createElement('table');
  table.className = 'kv-table font-mono';
  table.innerHTML = '<thead><tr><th style="width:35%;">Header</th><th>Value</th><th style="width:40px; text-align:center;"></th></tr></thead>';
  const tbody = document.createElement('tbody');

  entries.forEach(([key, val]) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-header-key', key.toLowerCase());

    const tdKey = document.createElement('td');
    tdKey.className = 'col-key';
    tdKey.style.padding = '7px 10px';
    tdKey.textContent = key;

    const tdVal = document.createElement('td');
    tdVal.className = 'col-val';
    tdVal.style.padding = '7px 10px';
    tdVal.style.wordBreak = 'break-all';
    const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
    tdVal.textContent = strVal;

    const tdAct = document.createElement('td');
    tdAct.className = 'col-action';
    const btnCopyRow = document.createElement('button');
    btnCopyRow.className = 'btn-copy-header-cell';
    btnCopyRow.title = `Copy ${key} value`;
    btnCopyRow.setAttribute('aria-label', `Copy ${key} value`);
    btnCopyRow.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
    btnCopyRow.addEventListener('click', () => {
      copyTextToClipboard(strVal, 'Header Value Copied', `Copied value of '${key}'.`, 'Failed to copy header.');
    });
    tdAct.appendChild(btnCopyRow);

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableDiv.appendChild(table);
  panel.appendChild(tableDiv);

  // Search filter listener
  const filterInput = filterWrapper.querySelector('.res-headers-search');
  if (filterInput) {
    filterInput.addEventListener('input', () => {
      const q = filterInput.value.toLowerCase().trim();
      const rows = tbody.querySelectorAll('tr');
      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }
}

/**
 * Renders cookie security policy notice into the Cookies tab.
 */
function renderResponseCookiesPanel() {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('panel-res-cookies');
  if (!panel) return;

  panel.innerHTML = `
    <div class="info-callout" style="margin-top: 10px; line-height: 1.6;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      <div>
        <strong>Security Policy: Cookies Filtered</strong>
        <p style="margin-top:4px; font-size: 11px;">
          DevProbe deliberately filters <code>Set-Cookie</code> and ambient session headers from API responses.
          This prevents upstream test endpoints from injecting cookies into your local session or leaking sensitive credentials across domains.
        </p>
      </div>
    </div>
  `;
}

/**
 * Resets the response viewer back to its pristine initial state.
 */
function resetResponseViewer() {
  activeResponse.status = null;
  activeResponse.statusText = '';
  activeResponse.timeMs = null;
  activeResponse.sizeBytes = null;
  activeResponse.contentType = '';
  activeResponse.headers = {};
  activeResponse.body = null;
  activeResponse.rawText = '';
  activeResponse.isJson = false;
  activeResponse.isBinary = false;
  activeResponse.isMalformedJson = false;
  activeResponse.isEmpty = false;
  activeResponse.format = 'pretty';

  if (typeof document === 'undefined') return;

  const statusBadge = document.getElementById('res-status-badge');
  if (statusBadge) {
    statusBadge.textContent = '—';
    statusBadge.className = 'metric-badge';
  }

  const typeVal = document.getElementById('res-type-value');
  if (typeVal) {
    typeVal.textContent = '—';
    typeVal.title = '';
  }

  const timeVal = document.getElementById('res-time-value');
  if (timeVal) timeVal.textContent = '— ms';

  const sizeVal = document.getElementById('res-size-value');
  if (sizeVal) sizeVal.textContent = '— B';

  const stateBanner = document.getElementById('response-state-banner');
  if (stateBanner) {
    stateBanner.className = 'response-state-banner hidden';
    stateBanner.innerHTML = '';
  }

  const emptyState = document.getElementById('response-empty-state');
  const contentArea = document.getElementById('response-content-area');
  if (emptyState) emptyState.classList.remove('hidden');
  if (contentArea) {
    contentArea.classList.add('hidden');
    contentArea.style.opacity = '1';
  }

  const codeEl = document.getElementById('response-code-display');
  if (codeEl) codeEl.textContent = '';

  const headersCount = document.getElementById('res-headers-count');
  if (headersCount) headersCount.textContent = '0';

  const headersPanel = document.getElementById('panel-res-headers');
  if (headersPanel) {
    headersPanel.innerHTML = '<div class="response-empty-state"><p class="empty-state-desc">No response headers available yet. Send a request to inspect response headers.</p></div>';
  }

  const formatButtons = document.querySelectorAll('.format-btn');
  formatButtons.forEach(btn => {
    if (btn.getAttribute('data-fmt') === 'pretty') {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Renders successful or non-2xx upstream execution results into the UI.
 * @param {object} responseData
 */
function renderResponseToUI(responseData) {
  activeResponse.status = responseData.status;
  activeResponse.statusText = responseData.statusText || '';
  activeResponse.timeMs = responseData.timeMs;
  activeResponse.sizeBytes = responseData.sizeBytes;
  activeResponse.headers = responseData.headers || {};
  activeResponse.body = responseData.body;
  activeResponse.contentType = getContentType(responseData.headers);

  // Check if response body is empty
  const isZeroBytes = responseData.sizeBytes === 0;
  const isEmptyBody = responseData.body === '' || responseData.body === null || responseData.body === undefined;
  activeResponse.isEmpty = responseData.status === 204 || (isZeroBytes && isEmptyBody);

  // Parse body states
  if (responseData.body && typeof responseData.body === 'object' && responseData.body.isBinary) {
    activeResponse.isBinary = true;
    activeResponse.isJson = false;
    activeResponse.isMalformedJson = false;
    activeResponse.rawText = responseData.rawText || responseData.body.preview || '[Binary Content]';
  } else if (responseData.body !== null && typeof responseData.body === 'object') {
    activeResponse.isBinary = false;
    activeResponse.isJson = true;
    activeResponse.isMalformedJson = false;
    activeResponse.rawText = responseData.rawText !== undefined ? responseData.rawText : JSON.stringify(responseData.body, null, 2);
  } else {
    activeResponse.isBinary = false;
    activeResponse.rawText = responseData.rawText !== undefined
      ? responseData.rawText
      : (responseData.body !== undefined && responseData.body !== null ? String(responseData.body) : '');

    const ct = (activeResponse.contentType || '').toLowerCase();
    const seemsJson = ct.includes('application/json') || ct.includes('+json') || ct.includes('text/json') || ct.includes('text/x-json');
    const trimmed = activeResponse.rawText.trim();
    const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');

    if ((seemsJson || looksLikeJson) && trimmed.length > 0) {
      try {
        activeResponse.body = JSON.parse(activeResponse.rawText);
        activeResponse.isJson = true;
        activeResponse.isMalformedJson = false;
      } catch {
        if (seemsJson) {
          activeResponse.isJson = false;
          activeResponse.isMalformedJson = true;
        } else {
          // Plain text starting with { or [
          activeResponse.isJson = false;
          activeResponse.isMalformedJson = false;
        }
      }
    } else {
      activeResponse.isJson = false;
      activeResponse.isMalformedJson = false;
    }
  }

  if (typeof document === 'undefined') return;

  // 1. Status Badge
  const statusBadge = document.getElementById('res-status-badge');
  if (statusBadge) {
    statusBadge.textContent = `${activeResponse.status} ${activeResponse.statusText}`.trim();
    statusBadge.className = 'metric-badge';
    const s = activeResponse.status;
    if (s >= 200 && s < 300) statusBadge.classList.add('badge-2xx');
    else if (s >= 300 && s < 400) statusBadge.classList.add('badge-3xx');
    else if (s >= 400 && s < 500) statusBadge.classList.add('badge-4xx');
    else if (s >= 500) statusBadge.classList.add('badge-5xx');
  }

  // 2. Response Content-Type
  const typeVal = document.getElementById('res-type-value');
  if (typeVal) {
    const rawCt = activeResponse.contentType || '';
    if (rawCt) {
      const mime = rawCt.split(';')[0].trim();
      typeVal.textContent = mime || rawCt;
      typeVal.title = rawCt;
    } else {
      typeVal.textContent = activeResponse.isEmpty ? 'none' : '—';
      typeVal.title = 'No Content-Type specified';
    }
  }

  // 3. Response Time
  const timeVal = document.getElementById('res-time-value');
  if (timeVal) {
    timeVal.textContent = `${activeResponse.timeMs} ms`;
  }

  // 4. Response Size
  const sizeVal = document.getElementById('res-size-value');
  if (sizeVal) {
    const b = activeResponse.sizeBytes;
    if (b < 1024) {
      sizeVal.textContent = `${b} B`;
    } else {
      sizeVal.textContent = `${(b / 1024).toFixed(1)} KB`;
    }
  }

  // 5. Response Body display
  const emptyState = document.getElementById('response-empty-state');
  const contentArea = document.getElementById('response-content-area');
  if (emptyState) emptyState.classList.add('hidden');
  if (contentArea) {
    contentArea.style.opacity = '1';
    contentArea.classList.remove('hidden');
  }

  renderResponseBodyContent();

  // 6. Response Headers panel
  renderResponseHeadersPanel();

  // 7. Response Cookies panel
  renderResponseCookiesPanel();
}

/**
 * Renders an execution error (e.g. timeout, SSRF blocked destination, DNS error, validation error).
 * Categorizes errors to give clear, actionable feedback to developers.
 *
 * @param {string} message - Descriptive error message
 * @param {string} code - Machine-readable error code
 */
function renderResponseError(message, code = 'ERROR') {
  activeResponse.status = null;
  activeResponse.statusText = '';
  activeResponse.timeMs = null;
  activeResponse.sizeBytes = null;
  activeResponse.contentType = '';
  activeResponse.headers = {};
  activeResponse.body = null;
  activeResponse.rawText = `Execution Failed: ${message}\nError Code: ${code}`;
  activeResponse.isJson = false;
  activeResponse.isBinary = false;
  activeResponse.isMalformedJson = false;
  activeResponse.isEmpty = false;

  if (typeof document === 'undefined') return;

  const category = classifyErrorCode(code);

  const statusBadge = document.getElementById('res-status-badge');
  if (statusBadge) {
    if (category === 'BLOCKED') {
      statusBadge.textContent = `Blocked: ${code}`;
    } else if (category === 'VALIDATION') {
      statusBadge.textContent = `Validation: ${code}`;
    } else {
      statusBadge.textContent = `Error: ${code}`;
    }
    statusBadge.className = 'metric-badge badge-error';
  }

  const typeVal = document.getElementById('res-type-value');
  if (typeVal) {
    typeVal.textContent = '—';
    typeVal.title = '';
  }

  const timeVal = document.getElementById('res-time-value');
  if (timeVal) timeVal.textContent = '— ms';

  const sizeVal = document.getElementById('res-size-value');
  if (sizeVal) sizeVal.textContent = '— B';

  const stateBanner = document.getElementById('response-state-banner');
  if (stateBanner) {
    let bannerClass = 'banner-warning';
    let bannerTitle = 'Request Failed:';

    if (category === 'BLOCKED') {
      bannerClass = 'banner-blocked';
      bannerTitle = 'Security Policy Blocked:';
    } else if (category === 'VALIDATION') {
      bannerClass = 'banner-error';
      bannerTitle = 'Validation Error:';
    } else if (category === 'TRANSPORT') {
      bannerClass = 'banner-warning';
      bannerTitle = 'Transport / Network Error:';
    }

    stateBanner.className = `response-state-banner ${bannerClass}`;
    stateBanner.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span><strong>${bannerTitle}</strong> ${escapeHtml(message)}</span>
    `;
    stateBanner.classList.remove('hidden');
  }

  const emptyState = document.getElementById('response-empty-state');
  const contentArea = document.getElementById('response-content-area');
  const codeEl = document.getElementById('response-code-display');

  if (emptyState) emptyState.classList.add('hidden');
  if (contentArea) {
    contentArea.style.opacity = '1';
    contentArea.classList.remove('hidden');
  }

  if (codeEl) {
    let notes = '';
    if (category === 'BLOCKED') {
      notes = 'Security Notice:\n- DevProbe SSRF protections prohibit loopback, private IPv4/IPv6 subnets, and cloud IMDS.\n- Connection was rejected before any outbound TCP/TLS socket was established.';
    } else if (category === 'VALIDATION') {
      notes = 'Validation Notice:\n- The request configuration was rejected prior to outbound dispatch.\n- Verify the target URL format, HTTP method, header names/values, and request body syntax.';
    } else if (code === 'REQUEST_TIMEOUT') {
      notes = 'Timeout Notice:\n- Outbound request exceeded the configured execution timeout.\n- The destination server did not complete sending a response in time.';
    } else {
      notes = 'Troubleshooting Notes:\n- Destination may be unreachable or refused connection.\n- SSRF security blocks loopback, private IPs, and cloud metadata.\n- Outbound requests exceeding timeouts (300ms/10s) are terminated.';
    }

    codeEl.textContent = `Execution Failed: ${message}\nError Code: ${code}\n\n${notes}`;
  }

  const headersCount = document.getElementById('res-headers-count');
  if (headersCount) headersCount.textContent = '0';

  renderResponseHeadersPanel();
}

/**
 * Executes the active request by dispatching to POST /api/requests/execute.
 * Enforces client-side validation, prevents accidental duplicate submissions,
 * clears stale response metadata, and provides consistent feedback.
 */
async function handleSendRequest() {
  // Prevent duplicate concurrent requests
  if (isRequestRunning) {
    return;
  }

  // 1. Validate HTTP Method
  const supportedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (!activeRequest.method || !supportedMethods.includes(activeRequest.method.toUpperCase())) {
    const err = `Unsupported HTTP method '${activeRequest.method}'. Supported methods: ${supportedMethods.join(', ')}`;
    renderResponseError(err, 'UNSUPPORTED_METHOD');
    showToast('Unsupported Method', err, 'warning');
    return;
  }

  // 2. Validate Target URL & Environment Variables
  const prepared = prepareRequestUrl(
    activeRequest.url,
    activeRequest.params,
    activeRequest.selectedEnvironment
  );

  if (!prepared.isValid) {
    setUrlInputError(true);
    renderResponseError(prepared.error || 'Please check your URL configuration.', 'INVALID_URL');
    showToast('Cannot Send Request', prepared.error || 'Please check your URL configuration.', 'warning');
    const urlInput = document.getElementById('request-url-input');
    if (urlInput) urlInput.focus();
    return;
  }
  setUrlInputError(false);

  // 3. Validate Headers (syntax & duplicate keys)
  const headerVal = validateHeaders(activeRequest.headers, false);
  if (!headerVal.isValid) {
    switchConfigTab('headers');
    renderResponseError(headerVal.errors[0], 'INVALID_HEADERS');
    showToast('Header Issues Detected', headerVal.errors[0], 'warning');
    return;
  }

  // 4. Validate JSON Body
  if (activeRequest.body.type === 'json' && activeRequest.body.text && activeRequest.body.text.trim()) {
    const jsonVal = validateJsonBody(activeRequest.body.text, 'json', false);
    if (!jsonVal.isValid) {
      switchConfigTab('body');
      renderResponseError(jsonVal.message, 'INVALID_JSON');
      showToast('Invalid JSON Payload', jsonVal.message, 'warning');
      return;
    }
  }

  isRequestRunning = true;
  const btnSend = document.getElementById('btn-send-request');
  const originalBtnHtml = btnSend ? btnSend.innerHTML : '';

  // Assemble request headers map from enabled rows
  const headersMap = {};
  if (Array.isArray(activeRequest.headers)) {
    activeRequest.headers.forEach(h => {
      if (h.enabled && h.key && typeof h.key === 'string' && h.key.trim()) {
        headersMap[h.key.trim()] = h.value !== undefined && h.value !== null ? String(h.value) : '';
      }
    });
  }

  // Prepare body payload
  let bodyPayload = null;
  if (activeRequest.body.type === 'json') {
    bodyPayload = activeRequest.body.text ? activeRequest.body.text : null;
  } else if (activeRequest.body.type === 'text') {
    bodyPayload = activeRequest.body.text;
  }

  // Prepare auth payload
  let authPayload = null;
  if (activeRequest.auth && activeRequest.auth.type && activeRequest.auth.type !== 'none') {
    authPayload = {
      type: activeRequest.auth.type,
      bearerToken: activeRequest.auth.bearerToken || '',
      basicUsername: activeRequest.auth.basicUsername || '',
      basicPassword: activeRequest.auth.basicPassword || ''
    };
  }

  // Set loading state on Send button
  if (btnSend) {
    btnSend.disabled = true;
    btnSend.classList.add('loading');
    btnSend.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
      </svg>
      <span>Sending...</span>
    `;
  }

  setResponseLoadingState();

  try {
    const res = await fetch('/api/requests/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        method: activeRequest.method,
        url: prepared.url,
        headers: headersMap,
        body: bodyPayload,
        auth: authPayload
      })
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = {
        success: false,
        error: {
          message: `Server returned non-JSON response (HTTP ${res.status})`,
          code: res.status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR'
        }
      };
    }

    if (data.success && data.data) {
      renderResponseToUI(data.data);
      const s = data.data.status;
      const toastType = s >= 200 && s < 400 ? 'success' : 'warning';
      showToast(
        `Request Completed (${data.data.status} ${data.data.statusText})`,
        `Roundtrip completed in ${data.data.timeMs}ms (${data.data.sizeBytes} bytes).`,
        toastType
      );
    } else {
      const errMsg = (data.error && data.error.message) || data.message || 'Request execution failed';
      const errCode = data.error ? data.error.code : 'EXECUTION_ERROR';
      renderResponseError(errMsg, errCode);
      showToast('Execution Error', errMsg, 'warning');
    }
  } catch (err) {
    const netErr = `Network error contacting DevProbe server: ${err.message}`;
    renderResponseError(netErr, 'NETWORK_ERROR');
    showToast('Connection Error', netErr, 'warning');
  } finally {
    isRequestRunning = false;
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.classList.remove('loading');
      btnSend.innerHTML = originalBtnHtml;
    }
  }
}

/**
 * Top Navigation and Workspace Action Buttons
 */
function initActionButtons() {
  // Send Button
  const btnSend = document.getElementById('btn-send-request');
  if (btnSend) {
    btnSend.addEventListener('click', handleSendRequest);
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
    resetResponseViewer();
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
  const btnCopyBody = document.getElementById('btn-copy-response');
  const btnCopyHeaders = document.getElementById('btn-copy-headers');
  const formatButtons = document.querySelectorAll('.format-btn');

  // Copy Body
  if (btnCopyBody) {
    btnCopyBody.addEventListener('click', () => {
      if (activeResponse.status === null) {
        showToast('Nothing to Copy', 'No response available yet. Send a request first.', 'info');
        return;
      }

      if (activeResponse.isEmpty) {
        showToast('Nothing to Copy', 'The response body is empty.', 'info');
        return;
      }

      let textToCopy = '';
      if (activeResponse.format === 'pretty' && activeResponse.isJson && activeResponse.body !== null) {
        try {
          textToCopy = JSON.stringify(activeResponse.body, null, 2);
        } catch {
          textToCopy = activeResponse.rawText;
        }
      } else {
        textToCopy = activeResponse.rawText;
      }

      if (textToCopy && textToCopy !== '(Empty response body)') {
        copyTextToClipboard(
          textToCopy,
          'Response Body Copied',
          'Response body copied to clipboard.',
          'Unable to copy response body to clipboard.'
        );
      } else {
        showToast('Nothing to Copy', 'No response body content available.', 'info');
      }
    });
  }

  // Copy Headers
  if (btnCopyHeaders) {
    btnCopyHeaders.addEventListener('click', () => {
      if (activeResponse.status === null) {
        showToast('Nothing to Copy', 'No response available yet. Send a request first.', 'info');
        return;
      }

      const formatted = formatHeadersForCopy(activeResponse.headers);
      if (formatted) {
        const count = Object.keys(activeResponse.headers || {}).length;
        copyTextToClipboard(
          formatted,
          'Headers Copied',
          `${count} response headers copied to clipboard.`,
          'Unable to copy response headers to clipboard.'
        );
      } else {
        showToast('Nothing to Copy', 'No response headers available to copy.', 'info');
      }
    });
  }

  // Format Switcher (Pretty / Raw)
  formatButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      formatButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeResponse.format = btn.getAttribute('data-fmt') || 'pretty';
      renderResponseBodyContent();
    });
  });
}

/* ==========================================================================
   10. Collections & Saved Requests Persistence (Day 10)
   ========================================================================== */

let cachedCollections = [];
let cachedSavedRequests = [];

/**
 * Opens the Edit Collection modal and populates it with collection details.
 */
function openEditCollectionModal(col) {
  if (typeof document === 'undefined' || !col) return;
  const modal = document.getElementById('modal-edit-collection');
  const inputId = document.getElementById('input-edit-col-id');
  const inputName = document.getElementById('input-edit-col-name');
  const inputDesc = document.getElementById('input-edit-col-desc');

  if (modal && inputId && inputName) {
    inputId.value = col.id;
    inputName.value = col.name || '';
    if (inputDesc) inputDesc.value = col.description || '';
    modal.classList.add('active');
    inputName.focus();
  }
}

/**
 * Opens the Delete Collection confirmation dialog.
 */
function openDeleteCollectionModal(col) {
  if (typeof document === 'undefined' || !col) return;
  const modal = document.getElementById('modal-delete-collection');
  const inputId = document.getElementById('input-del-col-id');
  const warningText = document.getElementById('delete-col-warning-text');

  if (modal && inputId) {
    inputId.value = col.id;
    if (warningText) {
      warningText.textContent = `Are you sure you want to delete collection "${col.name}"?`;
    }
    modal.classList.add('active');
  }
}

/**
 * Opens the Edit Saved Request modal and populates it with saved request details.
 */
function openEditSavedRequestModal(req) {
  if (typeof document === 'undefined' || !req) return;
  const modal = document.getElementById('modal-edit-saved-request');
  const inputId = document.getElementById('input-edit-req-id');
  const inputName = document.getElementById('input-edit-req-name');
  const selectCol = document.getElementById('select-edit-req-collection');
  const selectMethod = document.getElementById('select-edit-req-method');
  const inputUrl = document.getElementById('input-edit-req-url');
  const checkSync = document.getElementById('check-sync-active-config');

  if (modal && inputId && inputName && inputUrl) {
    inputId.value = req.id;
    inputName.value = req.name || '';
    if (selectCol) selectCol.value = req.collection_id !== null && req.collection_id !== undefined ? String(req.collection_id) : '';
    if (selectMethod) selectMethod.value = req.method || 'GET';
    inputUrl.value = req.url || '';
    if (checkSync) checkSync.checked = false;
    modal.classList.add('active');
    inputName.focus();
  }
}

/**
 * Opens the Delete Saved Request confirmation dialog.
 */
function openDeleteSavedRequestModal(req) {
  if (typeof document === 'undefined' || !req) return;
  const modal = document.getElementById('modal-delete-saved-request');
  const inputId = document.getElementById('input-del-req-id');
  const warningText = document.getElementById('delete-req-warning-text');

  if (modal && inputId) {
    inputId.value = req.id;
    if (warningText) {
      warningText.textContent = `Are you sure you want to delete saved request "${req.name}"? This action cannot be undone.`;
    }
    modal.classList.add('active');
  }
}

/**
 * Creates a DOM row for a saved request containing the request item and action buttons.
 */
function createSavedRequestRow(req) {
  const row = document.createElement('div');
  row.className = 'saved-request-row';

  const btn = document.createElement('button');
  btn.className = 'request-item';
  btn.setAttribute('data-id', `saved-${req.id}`);
  btn.setAttribute('data-saved-id', req.id);
  btn.setAttribute('data-method', req.method);
  btn.setAttribute('data-name', req.name);
  btn.setAttribute('data-url', req.url);

  const mLower = (req.method || 'get').toLowerCase();
  btn.innerHTML = `
    <span class="method-badge method-${mLower}">${escapeHtml(req.method)}</span>
    <span class="request-name">${escapeHtml(req.name)}</span>
  `;

  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-content .request-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    // Populate request editor without executing outbound HTTP (non-dispatch guarantee)
    const template = convertSavedRequestToTemplate(req);
    loadRequestIntoState(template);
    resetResponseViewer();
    updateUrlPreview();

    showToast('Request Selected', `Loaded "${req.name}" into workspace.`, 'info');
  });

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.innerHTML = `
    <button class="btn-item-action btn-action-edit-req" title="Edit request" aria-label="Edit request">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    </button>
    <button class="btn-item-action btn-action-delete btn-action-del-req" title="Delete request" aria-label="Delete request">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    </button>
  `;

  const btnEdit = actions.querySelector('.btn-action-edit-req');
  const btnDel = actions.querySelector('.btn-action-del-req');

  btnEdit.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditSavedRequestModal(req);
  });

  btnDel.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteSavedRequestModal(req);
  });

  row.appendChild(btn);
  row.appendChild(actions);
  return row;
}

/**
 * Converts a database saved request row into the editor template format.
 * Strictly guarantees that sensitive credentials are never injected.
 */
function convertSavedRequestToTemplate(savedReq) {
  if (!savedReq) return null;

  let headers = [];
  if (Array.isArray(savedReq.headers)) {
    headers = savedReq.headers.map((h) => ({
      key: h.key || '',
      value: h.value || '',
      description: h.description || '',
      enabled: h.enabled !== false
    }));
  } else if (savedReq.headers && typeof savedReq.headers === 'object') {
    headers = Object.entries(savedReq.headers).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : String(v),
      description: '',
      enabled: true
    }));
  }

  let params = [];
  if (Array.isArray(savedReq.params)) {
    params = savedReq.params.map((p) => ({
      key: p.key || '',
      value: p.value || '',
      description: p.description || '',
      enabled: p.enabled !== false
    }));
  } else if (savedReq.params && typeof savedReq.params === 'object') {
    params = Object.entries(savedReq.params).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : String(v),
      description: '',
      enabled: true
    }));
  }

  return {
    name: savedReq.name || 'Saved Request',
    method: savedReq.method || 'GET',
    url: savedReq.url || '',
    headers: headers.length > 0 ? headers : [{ id: generateRowId('hdr'), key: 'Accept', value: 'application/json', description: 'Expected format', enabled: true }],
    params: params.length > 0 ? params : [{ id: generateRowId('param'), key: '', value: '', description: '', enabled: false }],
    body: {
      type: savedReq.body_type || 'none',
      text: savedReq.body || ''
    },
    auth: {
      type: savedReq.auth_type || 'none',
      bearerToken: '',
      basicUsername: '',
      basicPassword: ''
    }
  };
}

/**
 * Loads collections and saved requests from the backend API and renders them in the sidebar.
 */
async function loadCollectionsAndSavedRequests() {
  if (typeof document === 'undefined') return;

  const container = document.getElementById('custom-collections-container');
  const collectionSelect = document.getElementById('select-save-collection');
  const editCollectionSelect = document.getElementById('select-edit-req-collection');

  try {
    const [colRes, reqRes] = await Promise.all([
      fetch('/api/collections'),
      fetch('/api/requests/saved')
    ]);

    const colData = await colRes.json();
    const reqData = await reqRes.json();

    if (colData.success && Array.isArray(colData.data)) {
      cachedCollections = colData.data;
    }
    if (reqData.success && Array.isArray(reqData.data)) {
      cachedSavedRequests = reqData.data;
    }

    // Update collection dropdowns in Save and Edit Modals
    [collectionSelect, editCollectionSelect].forEach((selectEl) => {
      if (selectEl) {
        selectEl.innerHTML = '<option value="">-- No Collection (Unassigned) --</option>';
        cachedCollections.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          selectEl.appendChild(opt);
        });
      }
    });

    // Render collections and saved requests in sidebar
    if (container) {
      container.innerHTML = '';

      if (cachedCollections.length === 0 && cachedSavedRequests.length === 0) {
        return;
      }

      // Render each collection folder
      cachedCollections.forEach((col) => {
        const colRequests = cachedSavedRequests.filter((r) => r.collection_id === col.id);

        const folderEl = document.createElement('div');
        folderEl.className = 'collection-folder open';
        folderEl.setAttribute('data-collection-id', col.id);

        const headerEl = document.createElement('div');
        headerEl.className = 'folder-header';
        headerEl.setAttribute('role', 'button');
        headerEl.setAttribute('tabindex', '0');
        headerEl.setAttribute('aria-expanded', 'true');
        headerEl.innerHTML = `
          <div class="folder-header-title">
            <svg class="folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="folder-title">${escapeHtml(col.name)}</span>
            <span class="folder-badge" title="${colRequests.length} saved requests">${colRequests.length}</span>
          </div>
          <div class="folder-actions">
            <button class="btn-item-action btn-action-edit-col" title="Edit collection" aria-label="Edit collection">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-item-action btn-action-delete btn-action-del-col" title="Delete collection" aria-label="Delete collection">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        `;

        headerEl.addEventListener('click', (e) => {
          if (e.target.closest('.folder-actions')) return;
          const isCollapsed = folderEl.classList.toggle('collapsed');
          headerEl.setAttribute('aria-expanded', (!isCollapsed).toString());
        });

        const btnEditCol = headerEl.querySelector('.btn-action-edit-col');
        const btnDelCol = headerEl.querySelector('.btn-action-del-col');

        if (btnEditCol) {
          btnEditCol.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditCollectionModal(col);
          });
        }

        if (btnDelCol) {
          btnDelCol.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteCollectionModal(col);
          });
        }

        const itemsEl = document.createElement('div');
        itemsEl.className = 'folder-items';

        if (colRequests.length === 0) {
          const emptyEl = document.createElement('div');
          emptyEl.className = 'custom-collection-empty';
          emptyEl.textContent = 'No requests in this collection';
          itemsEl.appendChild(emptyEl);
        } else {
          colRequests.forEach((req) => {
            itemsEl.appendChild(createSavedRequestRow(req));
          });
        }

        folderEl.appendChild(headerEl);
        folderEl.appendChild(itemsEl);
        container.appendChild(folderEl);
      });

      // Render unassigned saved requests if any exist
      const unassignedRequests = cachedSavedRequests.filter((r) => !r.collection_id);
      if (unassignedRequests.length > 0) {
        const unassignedFolder = document.createElement('div');
        unassignedFolder.className = 'collection-folder open';
        unassignedFolder.innerHTML = `
          <div class="folder-header" role="button" tabindex="0" aria-expanded="true">
            <div class="folder-header-title">
              <svg class="folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
              </svg>
              <span class="folder-title">Saved Requests</span>
              <span class="folder-badge">${unassignedRequests.length}</span>
            </div>
          </div>
        `;
        const unassignedItems = document.createElement('div');
        unassignedItems.className = 'folder-items';

        unassignedRequests.forEach((req) => {
          unassignedItems.appendChild(createSavedRequestRow(req));
        });

        const unassignedHeader = unassignedFolder.querySelector('.folder-header');
        unassignedHeader.addEventListener('click', () => {
          const isCollapsed = unassignedFolder.classList.toggle('collapsed');
          unassignedHeader.setAttribute('aria-expanded', (!isCollapsed).toString());
        });

        unassignedFolder.appendChild(unassignedItems);
        container.appendChild(unassignedFolder);
      }
    }
  } catch (err) {
    console.error('Failed to load collections and requests:', err);
  }
}

/**
 * Initializes dialogs and handlers for creating, editing, and deleting collections and saved requests.
 */
function initPersistentCollections() {
  if (typeof document === 'undefined') return;

  // 1. New Collection Modal
  const modalCol = document.getElementById('modal-new-collection');
  const btnNewCol = document.getElementById('btn-new-collection');
  const btnColClose = document.getElementById('btn-col-modal-close');
  const btnColCancel = document.getElementById('btn-col-modal-cancel');
  const formNewCol = document.getElementById('form-new-collection');
  const inputColName = document.getElementById('input-col-name');
  const inputColDesc = document.getElementById('input-col-desc');
  const btnColSubmit = document.getElementById('btn-col-modal-submit');

  const openColModal = () => {
    if (modalCol) {
      if (inputColName) inputColName.value = '';
      if (inputColDesc) inputColDesc.value = '';
      modalCol.classList.add('active');
      if (inputColName) inputColName.focus();
    }
  };

  const closeColModal = () => {
    if (modalCol) modalCol.classList.remove('active');
  };

  if (btnNewCol) btnNewCol.addEventListener('click', openColModal);
  if (btnColClose) btnColClose.addEventListener('click', closeColModal);
  if (btnColCancel) btnColCancel.addEventListener('click', closeColModal);

  if (formNewCol) {
    formNewCol.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (inputColName?.value || '').trim();
      const desc = (inputColDesc?.value || '').trim();

      if (!name) {
        showToast('Validation Error', 'Collection name is required.', 'warning');
        return;
      }

      if (btnColSubmit) btnColSubmit.disabled = true;

      try {
        const res = await fetch('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: desc || null })
        });
        const data = await res.json();

        if (res.status === 201 && data.success) {
          closeColModal();
          showToast('Collection Created', `Created collection "${data.data.name}".`, 'success');
          await loadCollectionsAndSavedRequests();
        } else {
          const msg = data.error?.message || data.message || 'Failed to create collection';
          showToast('Error', msg, 'warning');
        }
      } catch (err) {
        showToast('Connection Error', `Failed to contact server: ${err.message}`, 'warning');
      } finally {
        if (btnColSubmit) btnColSubmit.disabled = false;
      }
    });
  }

  // 2. Edit Collection Modal
  const modalEditCol = document.getElementById('modal-edit-collection');
  const btnEditColClose = document.getElementById('btn-edit-col-close');
  const btnEditColCancel = document.getElementById('btn-edit-col-cancel');
  const formEditCol = document.getElementById('form-edit-collection');
  const inputEditColId = document.getElementById('input-edit-col-id');
  const inputEditColName = document.getElementById('input-edit-col-name');
  const inputEditColDesc = document.getElementById('input-edit-col-desc');
  const btnEditColSubmit = document.getElementById('btn-edit-col-submit');

  const closeEditColModal = () => {
    if (modalEditCol) modalEditCol.classList.remove('active');
  };

  if (btnEditColClose) btnEditColClose.addEventListener('click', closeEditColModal);
  if (btnEditColCancel) btnEditColCancel.addEventListener('click', closeEditColModal);

  if (formEditCol) {
    formEditCol.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = inputEditColId?.value;
      const name = (inputEditColName?.value || '').trim();
      const desc = (inputEditColDesc?.value || '').trim();

      if (!name) {
        showToast('Validation Error', 'Collection name is required.', 'warning');
        return;
      }

      if (btnEditColSubmit) btnEditColSubmit.disabled = true;

      try {
        const res = await fetch(`/api/collections/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: desc || null })
        });
        const data = await res.json();

        if (res.status === 200 && data.success) {
          closeEditColModal();
          showToast('Collection Updated', `Updated collection "${data.data.name}".`, 'success');
          await loadCollectionsAndSavedRequests();
        } else {
          const msg = data.error?.message || data.message || 'Failed to update collection';
          showToast('Error', msg, 'warning');
        }
      } catch (err) {
        showToast('Connection Error', `Failed to contact server: ${err.message}`, 'warning');
      } finally {
        if (btnEditColSubmit) btnEditColSubmit.disabled = false;
      }
    });
  }

  // 3. Delete Collection Confirmation Modal
  const modalDelCol = document.getElementById('modal-delete-collection');
  const btnDelColClose = document.getElementById('btn-del-col-close');
  const btnDelColCancel = document.getElementById('btn-del-col-cancel');
  const btnDelColConfirm = document.getElementById('btn-del-col-confirm');
  const inputDelColId = document.getElementById('input-del-col-id');

  const closeDelColModal = () => {
    if (modalDelCol) modalDelCol.classList.remove('active');
  };

  if (btnDelColClose) btnDelColClose.addEventListener('click', closeDelColModal);
  if (btnDelColCancel) btnDelColCancel.addEventListener('click', closeDelColModal);

  if (btnDelColConfirm) {
    btnDelColConfirm.addEventListener('click', async () => {
      const id = inputDelColId?.value;
      if (!id) return;

      btnDelColConfirm.disabled = true;
      try {
        const res = await fetch(`/api/collections/${id}`, {
          method: 'DELETE'
        });
        const data = await res.json();

        if (res.status === 200 && data.success) {
          closeDelColModal();
          showToast('Collection Deleted', 'Collection removed. Saved requests are preserved as unassigned.', 'info');
          await loadCollectionsAndSavedRequests();
        } else {
          const msg = data.error?.message || data.message || 'Failed to delete collection';
          showToast('Error', msg, 'warning');
        }
      } catch (err) {
        showToast('Connection Error', `Failed to contact server: ${err.message}`, 'warning');
      } finally {
        btnDelColConfirm.disabled = false;
      }
    });
  }

  // 4. Save Request Modal (Create)
  const modalSave = document.getElementById('modal-save-request');
  const btnSave = document.getElementById('btn-save-request');
  const btnSaveClose = document.getElementById('btn-save-modal-close');
  const btnSaveCancel = document.getElementById('btn-save-modal-cancel');
  const formSave = document.getElementById('form-save-request');
  const inputSaveName = document.getElementById('input-save-name');
  const selectSaveCol = document.getElementById('select-save-collection');
  const btnSaveSubmit = document.getElementById('btn-save-modal-submit');

  const openSaveModal = () => {
    if (modalSave) {
      if (inputSaveName) inputSaveName.value = activeRequest.name || 'My Request';
      modalSave.classList.add('active');
      if (inputSaveName) inputSaveName.focus();
    }
  };

  const closeSaveModal = () => {
    if (modalSave) modalSave.classList.remove('active');
  };

  if (btnSave) {
    btnSave.addEventListener('click', openSaveModal);
  }

  if (btnSaveClose) btnSaveClose.addEventListener('click', closeSaveModal);
  if (btnSaveCancel) btnSaveCancel.addEventListener('click', closeSaveModal);

  if (formSave) {
    formSave.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reqName = (inputSaveName?.value || '').trim();
      const colIdVal = selectSaveCol?.value;
      const collection_id = colIdVal ? parseInt(colIdVal, 10) : null;

      if (!reqName) {
        showToast('Validation Error', 'Request name is required.', 'warning');
        return;
      }

      if (btnSaveSubmit) btnSaveSubmit.disabled = true;

      const payload = {
        name: reqName,
        collection_id: collection_id,
        method: activeRequest.method || 'GET',
        url: activeRequest.url || '',
        headers: Array.isArray(activeRequest.headers) ? activeRequest.headers : [],
        params: Array.isArray(activeRequest.params) ? activeRequest.params : [],
        body: activeRequest.body ? activeRequest.body.text : '',
        body_type: activeRequest.body ? activeRequest.body.type : 'none',
        auth_type: activeRequest.auth ? activeRequest.auth.type : 'none'
      };

      try {
        const res = await fetch('/api/requests/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.status === 201 && data.success) {
          activeRequest.name = reqName;
          const tabTitle = document.getElementById('tab-title-label');
          if (tabTitle) tabTitle.textContent = reqName;

          closeSaveModal();
          showToast('Request Saved', `Successfully saved "${data.data.name}".`, 'success');
          await loadCollectionsAndSavedRequests();
        } else {
          const msg = data.error?.message || data.message || 'Failed to save request';
          showToast('Error', msg, 'warning');
        }
      } catch (err) {
        showToast('Connection Error', `Failed to contact server: ${err.message}`, 'warning');
      } finally {
        if (btnSaveSubmit) btnSaveSubmit.disabled = false;
      }
    });
  }

  // 5. Edit Saved Request Modal
  const modalEditReq = document.getElementById('modal-edit-saved-request');
  const btnEditReqClose = document.getElementById('btn-edit-req-close');
  const btnEditReqCancel = document.getElementById('btn-edit-req-cancel');
  const formEditReq = document.getElementById('form-edit-saved-request');
  const inputEditReqId = document.getElementById('input-edit-req-id');
  const inputEditReqName = document.getElementById('input-edit-req-name');
  const selectEditReqCol = document.getElementById('select-edit-req-collection');
  const selectEditReqMethod = document.getElementById('select-edit-req-method');
  const inputEditReqUrl = document.getElementById('input-edit-req-url');
  const checkSyncActiveConfig = document.getElementById('check-sync-active-config');
  const btnEditReqSubmit = document.getElementById('btn-edit-req-submit');

  const closeEditReqModal = () => {
    if (modalEditReq) modalEditReq.classList.remove('active');
  };

  if (btnEditReqClose) btnEditReqClose.addEventListener('click', closeEditReqModal);
  if (btnEditReqCancel) btnEditReqCancel.addEventListener('click', closeEditReqModal);

  if (formEditReq) {
    formEditReq.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = inputEditReqId?.value;
      const reqName = (inputEditReqName?.value || '').trim();
      const colIdVal = selectEditReqCol?.value;
      const collection_id = colIdVal ? parseInt(colIdVal, 10) : null;
      const method = selectEditReqMethod?.value || 'GET';
      const url = (inputEditReqUrl?.value || '').trim();

      if (!reqName) {
        showToast('Validation Error', 'Request name is required.', 'warning');
        return;
      }
      if (!url) {
        showToast('Validation Error', 'Request URL is required.', 'warning');
        return;
      }

      if (btnEditReqSubmit) btnEditReqSubmit.disabled = true;

      // Determine headers, params, body, auth
      const existingReq = cachedSavedRequests.find((r) => String(r.id) === String(id));
      let headers = existingReq?.headers || [];
      let params = existingReq?.params || [];
      let body = existingReq?.body || '';
      let body_type = existingReq?.body_type || 'none';
      let auth_type = existingReq?.auth_type || 'none';

      // If user opted to update with current active workspace configuration
      if (checkSyncActiveConfig?.checked) {
        headers = Array.isArray(activeRequest.headers) ? activeRequest.headers : [];
        params = Array.isArray(activeRequest.params) ? activeRequest.params : [];
        body = activeRequest.body ? activeRequest.body.text : '';
        body_type = activeRequest.body ? activeRequest.body.type : 'none';
        auth_type = activeRequest.auth ? activeRequest.auth.type : 'none';
      }

      const payload = {
        name: reqName,
        collection_id,
        method,
        url,
        headers,
        params,
        body,
        body_type,
        auth_type
      };

      try {
        const res = await fetch(`/api/requests/saved/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.status === 200 && data.success) {
          // If the edited request is the currently loaded request, update activeRequest name
          if (activeRequest.id === `saved-${id}` || activeRequest.name === existingReq?.name) {
            activeRequest.name = reqName;
            const tabTitle = document.getElementById('tab-title-label');
            if (tabTitle) tabTitle.textContent = reqName;
          }

          closeEditReqModal();
          showToast('Request Updated', `Updated saved request "${data.data.name}".`, 'success');
          await loadCollectionsAndSavedRequests();
        } else {
          const msg = data.error?.message || data.message || 'Failed to update request';
          showToast('Error', msg, 'warning');
        }
      } catch (err) {
        showToast('Connection Error', `Failed to contact server: ${err.message}`, 'warning');
      } finally {
        if (btnEditReqSubmit) btnEditReqSubmit.disabled = false;
      }
    });
  }

  // 6. Delete Saved Request Confirmation Modal
  const modalDelReq = document.getElementById('modal-delete-saved-request');
  const btnDelReqClose = document.getElementById('btn-del-req-close');
  const btnDelReqCancel = document.getElementById('btn-del-req-cancel');
  const btnDelReqConfirm = document.getElementById('btn-del-req-confirm');
  const inputDelReqId = document.getElementById('input-del-req-id');

  const closeDelReqModal = () => {
    if (modalDelReq) modalDelReq.classList.remove('active');
  };

  if (btnDelReqClose) btnDelReqClose.addEventListener('click', closeDelReqModal);
  if (btnDelReqCancel) btnDelReqCancel.addEventListener('click', closeDelReqModal);

  if (btnDelReqConfirm) {
    btnDelReqConfirm.addEventListener('click', async () => {
      const id = inputDelReqId?.value;
      if (!id) return;

      btnDelReqConfirm.disabled = true;
      try {
        const res = await fetch(`/api/requests/saved/${id}`, {
          method: 'DELETE'
        });
        const data = await res.json();

        if (res.status === 200 && data.success) {
          closeDelReqModal();
          showToast('Request Deleted', 'Saved request deleted successfully.', 'info');
          await loadCollectionsAndSavedRequests();
        } else {
          const msg = data.error?.message || data.message || 'Failed to delete request';
          showToast('Error', msg, 'warning');
        }
      } catch (err) {
        showToast('Connection Error', `Failed to contact server: ${err.message}`, 'warning');
      } finally {
        btnDelReqConfirm.disabled = false;
      }
    });
  }

  // Close modals when clicking overlay background
  [modalCol, modalEditCol, modalDelCol, modalSave, modalEditReq, modalDelReq].forEach((m) => {
    if (m) {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('active');
      });
    }
  });

  // Keyboard shortcut: Escape closes all active modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach((m) => m.classList.remove('active'));
    }
  });

  // Initial load of collections and saved requests
  loadCollectionsAndSavedRequests();
}

/* ==========================================================================
   9. Testing and Module Compatibility Export
   ========================================================================== */

// Expose state and reusable helpers on window object for testing and inspection
if (typeof window !== 'undefined') {
  window.DevProbe = {
    activeRequest,
    activeResponse,
    isRequestRunning,
    getRequestRunning,
    setRequestRunning,
    classifyErrorCode,
    switchConfigTab,
    setUrlInputError,
    ENVIRONMENTS,
    getEnvironmentVariable,
    resolveVariables,
    prepareRequestUrl,
    validateHeaders,
    validateJsonBody,
    beautifyJsonBody,
    loadRequestIntoState,
    updateUrlPreview,
    handleSendRequest,
    renderResponseToUI,
    renderResponseError,
    renderResponseBodyContent,
    resetResponseViewer,
    setResponseLoadingState,
    escapeHtml,
    getContentType,
    highlightJsonToHtml,
    formatHeadersForCopy,
    copyTextToClipboard,
    showToast,
    convertSavedRequestToTemplate,
    loadCollectionsAndSavedRequests,
    initPersistentCollections,
    openEditCollectionModal,
    openDeleteCollectionModal,
    openEditSavedRequestModal,
    openDeleteSavedRequestModal,
    createSavedRequestRow,
    getCachedCollections: () => cachedCollections,
    getCachedSavedRequests: () => cachedSavedRequests
  };
}

// Support Node.js CommonJS test environments if applicable
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    activeRequest,
    activeResponse,
    isRequestRunning,
    getRequestRunning,
    setRequestRunning,
    classifyErrorCode,
    switchConfigTab,
    setUrlInputError,
    ENVIRONMENTS,
    getEnvironmentVariable,
    resolveVariables,
    prepareRequestUrl,
    validateHeaders,
    validateJsonBody,
    beautifyJsonBody,
    loadRequestIntoState,
    handleSendRequest,
    renderResponseToUI,
    renderResponseError,
    renderResponseBodyContent,
    resetResponseViewer,
    setResponseLoadingState,
    escapeHtml,
    getContentType,
    highlightJsonToHtml,
    formatHeadersForCopy,
    copyTextToClipboard,
    showToast,
    convertSavedRequestToTemplate,
    loadCollectionsAndSavedRequests,
    initPersistentCollections,
    openEditCollectionModal,
    openDeleteCollectionModal,
    openEditSavedRequestModal,
    openDeleteSavedRequestModal,
    createSavedRequestRow,
    getCachedCollections: () => cachedCollections,
    getCachedSavedRequests: () => cachedSavedRequests
  };
}

