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
 * Supports both predefined in-memory maps and dynamic database-backed environments.
 * Treats disabled variables (is_enabled: false) as unavailable.
 *
 * @param {string|number} envKey - The environment key ('none'|'dev'|'staging'|'prod'|numeric ID)
 * @param {string} varName - The variable name to look up
 * @returns {string|undefined} The resolved variable value or undefined if not found/disabled
 */
function getEnvironmentVariable(envKey, varName) {
  if (!envKey || envKey === 'none' || !varName) return undefined;
  const env = ENVIRONMENTS[envKey];
  if (!env || !env.variables) return undefined;

  // Case 1: Variables is an Array of records (e.g. from MySQL database)
  if (Array.isArray(env.variables)) {
    const lowerVar = varName.toLowerCase();
    const found = env.variables.find(v => {
      const k = v.key || v.var_key;
      return k && String(k).toLowerCase() === lowerVar;
    });

    if (found) {
      // Disabled variables are treated as unavailable
      if (found.is_enabled === false) {
        return undefined;
      }
      return found.value !== undefined && found.value !== null ? String(found.value) : '';
    }
    return undefined;
  }

  // Case 2: Variables is a key-value dictionary (predefined environments dev/staging/prod)
  if (typeof env.variables === 'object') {
    if (Object.prototype.hasOwnProperty.call(env.variables, varName)) {
      return env.variables[varName];
    }
    // Case-insensitive lookup fallback
    const lower = varName.toLowerCase();
    for (const [k, val] of Object.entries(env.variables)) {
      if (k.toLowerCase() === lower) {
        return val;
      }
    }
  }

  return undefined;
}

/**
 * Replaces {{variable_name}} placeholders in a string using the selected environment.
 * Reports missing variables without silently converting them to empty strings.
 *
 * @param {string} input - The string containing {{variable}} placeholders
 * @param {string|number} envKey - The active environment key or ID
 * @returns {{ resolvedText: string, missingVariables: string[], substituted: boolean }}
 */
function resolveVariables(input, envKey) {
  if (typeof input !== 'string' || !input) {
    return { resolvedText: input || '', missingVariables: [], substituted: false };
  }

  const missingVariables = [];
  let substituted = false;

  // Regex pattern matching {{var_name}}, {{base_url}}, {{api.key}}, etc.
  const placeholderRegex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

  const resolvedText = input.replace(placeholderRegex, (match, varName) => {
    const val = getEnvironmentVariable(envKey, varName);
    if (val !== undefined) {
      substituted = true;
      return val;
    }
    // Variable is missing or disabled in this environment
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

/**
 * Fully resolves variables across URL, query params, headers, body, and auth fields
 * on a CLONED execution payload immediately before outbound execution.
 * Preserves the original editor state and templates completely.
 *
 * @param {object} req - Request state (e.g. activeRequest)
 * @param {string|number} envKey - Active environment key or ID
 * @returns {{ isValid: boolean, executionPayload?: object, missingVariables?: string[], error?: string }}
 */
function resolveEntireRequest(req, envKey = 'none') {
  if (!req || typeof req !== 'object') {
    return { isValid: false, error: 'Invalid request configuration' };
  }

  const missingVariables = [];

  // 1. Resolve URL and query params
  const preparedUrl = prepareRequestUrl(req.url, req.params, envKey);
  if (!preparedUrl.isValid) {
    if (preparedUrl.missingVariables) {
      preparedUrl.missingVariables.forEach(v => {
        if (!missingVariables.includes(v)) missingVariables.push(v);
      });
    }
    return {
      isValid: false,
      missingVariables,
      error: preparedUrl.error || 'Invalid URL configuration'
    };
  }

  // 2. Resolve Headers (both key and value)
  const resolvedHeaders = {};
  const seenHeaderKeys = new Set();

  if (Array.isArray(req.headers)) {
    for (const h of req.headers) {
      if (!h || !h.enabled) continue;
      if (typeof h.key !== 'string' || !h.key.trim()) continue;

      const keyRes = resolveVariables(h.key.trim(), envKey);
      keyRes.missingVariables.forEach(v => {
        if (!missingVariables.includes(v)) missingVariables.push(v);
      });

      const rawVal = h.value !== undefined && h.value !== null ? String(h.value) : '';
      const valRes = resolveVariables(rawVal, envKey);
      valRes.missingVariables.forEach(v => {
        if (!missingVariables.includes(v)) missingVariables.push(v);
      });

      const finalKey = keyRes.resolvedText.trim();
      const lowerKey = finalKey.toLowerCase();

      if (seenHeaderKeys.has(lowerKey)) {
        return {
          isValid: false,
          missingVariables,
          error: `Duplicate header '${finalKey}' detected after variable resolution.`
        };
      }
      seenHeaderKeys.add(lowerKey);
      resolvedHeaders[finalKey] = valRes.resolvedText;
    }
  }

  // 3. Resolve Request Body
  let resolvedBody = null;
  if (req.body && (req.body.type === 'json' || req.body.type === 'text') && req.body.text) {
    const bodyRes = resolveVariables(req.body.text, envKey);
    bodyRes.missingVariables.forEach(v => {
      if (!missingVariables.includes(v)) missingVariables.push(v);
    });

    resolvedBody = bodyRes.resolvedText;

    if (req.body.type === 'json' && resolvedBody.trim()) {
      try {
        JSON.parse(resolvedBody);
      } catch (jsonErr) {
        return {
          isValid: false,
          missingVariables,
          error: `Resolved JSON body syntax error: ${jsonErr.message}`
        };
      }
    }
  }

  // 4. Resolve Auth Credentials
  let resolvedAuth = null;
  if (req.auth && req.auth.type && req.auth.type !== 'none') {
    resolvedAuth = { type: req.auth.type };

    if (req.auth.type === 'bearer') {
      const rawToken = req.auth.bearerToken || '';
      const tokenRes = resolveVariables(rawToken, envKey);
      tokenRes.missingVariables.forEach(v => {
        if (!missingVariables.includes(v)) missingVariables.push(v);
      });
      resolvedAuth.bearerToken = tokenRes.resolvedText;
    } else if (req.auth.type === 'basic') {
      const rawUser = req.auth.basicUsername || '';
      const rawPass = req.auth.basicPassword || '';

      const userRes = resolveVariables(rawUser, envKey);
      userRes.missingVariables.forEach(v => {
        if (!missingVariables.includes(v)) missingVariables.push(v);
      });

      const passRes = resolveVariables(rawPass, envKey);
      passRes.missingVariables.forEach(v => {
        if (!missingVariables.includes(v)) missingVariables.push(v);
      });

      resolvedAuth.basicUsername = userRes.resolvedText;
      resolvedAuth.basicPassword = passRes.resolvedText;
    }
  }

  // If any unresolved variables were found across any request part
  if (missingVariables.length > 0) {
    return {
      isValid: false,
      missingVariables,
      error: `Cannot execute request: unresolved environment variable(s) {{${missingVariables.join('}}, {{')}}}. Please define them in your active environment or select an environment.`
    };
  }

  return {
    isValid: true,
    executionPayload: {
      name: req.name || null,
      method: req.method,
      url: preparedUrl.url,
      headers: resolvedHeaders,
      body: resolvedBody,
      auth: resolvedAuth,
      assertions: Array.isArray(req.assertions) ? req.assertions : []
    }
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
  description: '',
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
  selectedEnvironment: 'none',
  assertions: []
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
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' },
    assertions: []
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
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' },
    assertions: []
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
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' },
    assertions: []
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
  activeRequest.description = template.description || '';
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

  // Deep copy assertions to isolate request assertion states
  activeRequest.assertions = Array.isArray(template.assertions)
    ? template.assertions.map((a) => ({ ...a }))
    : [];

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

  // 7. Render Assertions / Tests (Day 14)
  if (typeof renderAssertions === 'function') {
    renderAssertions();
  }

  // 8. Update Live URL Preview
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

  // 10. Environment Management & Variables (Day 12)
  initEnvironmentManagement();

  // 11. Request History & Execution Management (Day 13)
  initHistoryManagement();

  // 12. Assertion Builder UI (Day 14)
  initAssertionBuilder();

  // 13. Collection Import/Export & API Documentation Generator (Day 15)
  initCollectionImport();
  initApiDocsModal();

  // 14. Initial state render
  renderActiveRequestToUI();
  });

  // Independent event listener for History initialization to ensure decoupling from other components
  document.addEventListener('DOMContentLoaded', () => {
    initHistoryManagement();
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
  if (typeof document === 'undefined') return;

  const requestButtons = document.querySelectorAll('.sidebar-content .request-item');

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
      const currentRequestButtons = document.querySelectorAll('.sidebar-content .request-item');

      if (query.length > 0) {
        if (btnClearSearch) btnClearSearch.classList.remove('hidden');
      } else {
        if (btnClearSearch) btnClearSearch.classList.add('hidden');
      }

      let visibleCount = 0;
      currentRequestButtons.forEach((btn) => {
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
        const currentRequestButtons = document.querySelectorAll('.sidebar-content .request-item');
        currentRequestButtons.forEach((btn) => (btn.style.display = 'flex'));
        if (noResultsMsg) noResultsMsg.classList.add('hidden');
        searchInput.focus();
      });
    }
  }

  // Sample Request Click Handling
  requestButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-content .request-item').forEach((b) => b.classList.remove('active'));
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
  format: 'pretty', // 'pretty' | 'raw'
  test_results: null
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

  resetTestResultsViewer();
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

  // 8. Evaluate and Render Test Results (Day 14 Step 5)
  evaluateAndRenderTestResults(responseData);
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
  renderTestResultsError(message, code);
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

  // 2. Resolve entire request on cloned payload (URL, params, headers, body, auth)
  const resolved = resolveEntireRequest(activeRequest, activeRequest.selectedEnvironment);
  if (!resolved.isValid) {
    setUrlInputError(true);
    renderResponseError(resolved.error || 'Please check your URL and environment configuration.', 'UNRESOLVED_VARIABLE');
    showToast('Cannot Send Request', resolved.error || 'Please check your URL configuration.', 'warning');
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

  // 4. Validate JSON Body (if configured)
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
      body: JSON.stringify(resolved.executionPayload)
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
    // Refresh history list to display the newly recorded execution
    if (typeof fetchHistoryList === 'function') {
      setTimeout(() => {
        try {
          fetchHistoryList(1);
        } catch {
          // ignore in testing
        }
      }, 150);
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
      auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' },
      assertions: []
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
  const inputDesc = document.getElementById('input-edit-req-desc');
  const selectCol = document.getElementById('select-edit-req-collection');
  const selectMethod = document.getElementById('select-edit-req-method');
  const inputUrl = document.getElementById('input-edit-req-url');
  const checkSync = document.getElementById('check-sync-active-config');

  if (modal && inputId && inputName && inputUrl) {
    inputId.value = req.id;
    inputName.value = req.name || '';
    if (inputDesc) inputDesc.value = req.description || '';
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
    description: savedReq.description || '',
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
    },
    assertions: Array.isArray(savedReq.assertions)
      ? savedReq.assertions.map((a) => ({ ...a }))
      : []
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
            <button class="btn-item-action btn-action-docs-col" title="View API Documentation" aria-label="API Documentation">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button class="btn-item-action btn-action-export-col" title="Export collection as JSON" aria-label="Export collection">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
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

        const btnDocsCol = headerEl.querySelector('.btn-action-docs-col');
        const btnExportCol = headerEl.querySelector('.btn-action-export-col');
        const btnEditCol = headerEl.querySelector('.btn-action-edit-col');
        const btnDelCol = headerEl.querySelector('.btn-action-del-col');

        if (btnDocsCol) {
          btnDocsCol.addEventListener('click', (e) => {
            e.stopPropagation();
            openApiDocsModal(col);
          });
        }

        if (btnExportCol) {
          btnExportCol.addEventListener('click', (e) => {
            e.stopPropagation();
            exportCollectionToJson(col.id, col.name);
          });
        }

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
  const inputSaveDesc = document.getElementById('input-save-desc');
  const selectSaveCol = document.getElementById('select-save-collection');
  const btnSaveSubmit = document.getElementById('btn-save-modal-submit');

  const openSaveModal = () => {
    if (modalSave) {
      if (inputSaveName) inputSaveName.value = activeRequest.name || 'My Request';
      if (inputSaveDesc) inputSaveDesc.value = activeRequest.description || '';
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
      const reqDesc = (inputSaveDesc?.value || '').trim();
      const colIdVal = selectSaveCol?.value;
      const collection_id = colIdVal ? parseInt(colIdVal, 10) : null;

      if (!reqName) {
        showToast('Validation Error', 'Request name is required.', 'warning');
        return;
      }

      if (btnSaveSubmit) btnSaveSubmit.disabled = true;

      const payload = {
        name: reqName,
        description: reqDesc || null,
        collection_id: collection_id,
        method: activeRequest.method || 'GET',
        url: activeRequest.url || '',
        headers: Array.isArray(activeRequest.headers) ? activeRequest.headers : [],
        params: Array.isArray(activeRequest.params) ? activeRequest.params : [],
        body: activeRequest.body ? activeRequest.body.text : '',
        body_type: activeRequest.body ? activeRequest.body.type : 'none',
        auth_type: activeRequest.auth ? activeRequest.auth.type : 'none',
        assertions: Array.isArray(activeRequest.assertions) ? activeRequest.assertions : []
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
          activeRequest.description = reqDesc;
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
  const inputEditReqDesc = document.getElementById('input-edit-req-desc');
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
      const reqDesc = (inputEditReqDesc?.value || '').trim();
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
      let assertions = existingReq?.assertions || [];

      // If user opted to update with current active workspace configuration
      if (checkSyncActiveConfig?.checked) {
        headers = Array.isArray(activeRequest.headers) ? activeRequest.headers : [];
        params = Array.isArray(activeRequest.params) ? activeRequest.params : [];
        body = activeRequest.body ? activeRequest.body.text : '';
        body_type = activeRequest.body ? activeRequest.body.type : 'none';
        auth_type = activeRequest.auth ? activeRequest.auth.type : 'none';
        assertions = Array.isArray(activeRequest.assertions) ? activeRequest.assertions : [];
      }

      const payload = {
        name: reqName,
        description: reqDesc || null,
        collection_id,
        method,
        url,
        headers,
        params,
        body,
        body_type,
        auth_type,
        assertions
      };

      try {
        const res = await fetch(`/api/requests/saved/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.status === 200 && data.success) {
          // If the edited request is the currently loaded request, update activeRequest name & description
          if (activeRequest.id === `saved-${id}` || activeRequest.name === existingReq?.name) {
            activeRequest.name = reqName;
            activeRequest.description = reqDesc;
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
  const modalImportCol = document.getElementById('modal-import-collection');
  const modalDocs = document.getElementById('modal-api-docs');
  [modalCol, modalEditCol, modalDelCol, modalSave, modalEditReq, modalDelReq, modalImportCol, modalDocs].forEach((m) => {
    if (m) {
      m.addEventListener('click', (e) => {
        if (e.target === m) {
          if (m === modalDocs) closeApiDocsModal();
          else if (m === modalImportCol) closeImportCollectionModal();
          else m.classList.remove('active');
        }
      });
    }
  });

  // Keyboard shortcut: Escape closes all active modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach((m) => m.classList.remove('active'));
      closeApiDocsModal();
      closeImportCollectionModal();
    }
  });

  // Initial load of collections and saved requests
  loadCollectionsAndSavedRequests();
}

/* ==========================================================================
   Day 15: Collection Import/Export & API Documentation UI Handlers
   ========================================================================== */

/**
 * Triggers a browser file download using a temporary Blob URL and <a> anchor element.
 *
 * @param {string|Blob} content - File content string or Blob
 * @param {string} filename - Target filename for download
 * @param {string} [mimeType='text/plain'] - MIME type for Blob
 */
function downloadFile(content, filename, mimeType = 'text/plain') {
  if (typeof document === 'undefined') return;
  const safeFilename = (filename || 'download').replace(/[\r\n"\\/<>:|?*]/g, '_');
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Parses and strictly validates an incoming JSON collection string against devprobe/v1 requirements.
 *
 * @param {string} jsonString - The raw JSON string to parse and validate
 * @returns {{ valid: boolean, error: string|null, payload: object|null, preview: object|null }}
 */
function parseAndValidateImportJson(jsonString) {
  if (!jsonString || typeof jsonString !== 'string' || !jsonString.trim()) {
    return { valid: false, error: 'Please provide non-empty JSON collection data.', payload: null, preview: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return { valid: false, error: `Invalid JSON syntax: ${err.message}`, payload: null, preview: null };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'Import payload must be a JSON object envelope.', payload: null, preview: null };
  }

  // Schema check (must be devprobe/v1 if provided)
  if (parsed.schema !== undefined && parsed.schema !== null) {
    if (typeof parsed.schema !== 'string' || parsed.schema.trim().toLowerCase() !== 'devprobe/v1') {
      return { valid: false, error: `Unsupported schema '${parsed.schema}'. Expected 'devprobe/v1'.`, payload: null, preview: null };
    }
  }

  // Version check (must be SemVer 1.x)
  if (parsed.version !== undefined && parsed.version !== null) {
    const semVerPattern = /^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    if (typeof parsed.version !== 'string' || !semVerPattern.test(parsed.version.trim())) {
      return { valid: false, error: `Unsupported version '${parsed.version}'. DevProbe currently supports SemVer 1.x.`, payload: null, preview: null };
    }
  }

  // Collection object validation
  const collection = parsed.collection;
  if (!collection || typeof collection !== 'object' || Array.isArray(collection)) {
    return { valid: false, error: "Missing required 'collection' object in JSON payload.", payload: null, preview: null };
  }

  const name = typeof collection.name === 'string' ? collection.name.trim() : '';
  if (!name) {
    return { valid: false, error: 'Collection name is required and cannot be empty.', payload: null, preview: null };
  }

  if (name.length > 255) {
    return { valid: false, error: 'Collection name cannot exceed 255 characters.', payload: null, preview: null };
  }

  const desc = typeof collection.description === 'string' ? collection.description.trim() : null;

  // Requests array validation
  const requests = collection.requests || [];
  if (!Array.isArray(requests)) {
    return { valid: false, error: "'collection.requests' must be an array.", payload: null, preview: null };
  }

  if (requests.length > 100) {
    return { valid: false, error: `Collection contains ${requests.length} requests, exceeding the maximum limit of 100 requests.`, payload: null, preview: null };
  }

  // Inspect each request for basic validity
  for (let i = 0; i < requests.length; i++) {
    const r = requests[i];
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      return { valid: false, error: `Request at index ${i} must be an object.`, payload: null, preview: null };
    }
    const rName = typeof r.name === 'string' ? r.name.trim() : '';
    if (!rName) {
      return { valid: false, error: `Request at index ${i} is missing a valid name.`, payload: null, preview: null };
    }
    const rMethod = typeof r.method === 'string' ? r.method.trim().toUpperCase() : '';
    if (!rMethod) {
      return { valid: false, error: `Request '${rName}' is missing an HTTP method.`, payload: null, preview: null };
    }
    const rUrl = typeof r.url === 'string' ? r.url.trim() : '';
    if (!rUrl) {
      return { valid: false, error: `Request '${rName}' is missing a URL.`, payload: null, preview: null };
    }
    if (/^[a-z]+:\/\/[^@\s]+:[^@\s]+@/i.test(rUrl)) {
      return { valid: false, error: `Request '${rName}' contains embedded URL credentials, which are prohibited.`, payload: null, preview: null };
    }
  }

  return {
    valid: true,
    error: null,
    payload: parsed,
    preview: {
      name,
      description: desc,
      requestsCount: requests.length,
      schema: parsed.schema || 'devprobe/v1',
      version: parsed.version || '1.0.0'
    }
  };
}

let activeImportPayload = null;
let isImportingCollection = false;

function openImportCollectionModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-import-collection');
  if (!modal) return;

  resetImportModalState();
  modal.classList.add('active');
}

function closeImportCollectionModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-import-collection');
  if (modal) {
    modal.classList.remove('active');
  }
  resetImportModalState();
}

function resetImportModalState() {
  if (typeof document === 'undefined') return;
  activeImportPayload = null;
  isImportingCollection = false;

  const fileInput = document.getElementById('input-import-file');
  if (fileInput) fileInput.value = '';

  const fileInfo = document.getElementById('import-file-info');
  if (fileInfo) fileInfo.classList.add('hidden');

  const fileName = document.getElementById('import-file-name');
  if (fileName) fileName.textContent = '';

  const textarea = document.getElementById('input-import-json');
  if (textarea) textarea.value = '';

  const errorBox = document.getElementById('import-error-box');
  if (errorBox) errorBox.classList.add('hidden');

  const errorText = document.getElementById('import-error-text');
  if (errorText) errorText.textContent = '';

  const previewBox = document.getElementById('import-preview-box');
  if (previewBox) previewBox.classList.add('hidden');

  const confirmBtn = document.getElementById('btn-import-col-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    const btnText = document.getElementById('btn-import-confirm-text');
    if (btnText) btnText.textContent = 'Import Collection';
  }

  switchImportTab('file');
}

function switchImportTab(tabName) {
  if (typeof document === 'undefined') return;
  const tabBtnFile = document.getElementById('tab-btn-import-file');
  const tabBtnPaste = document.getElementById('tab-btn-import-paste');
  const paneFile = document.getElementById('pane-import-file');
  const panePaste = document.getElementById('pane-import-paste');

  if (tabName === 'paste') {
    tabBtnPaste?.classList.add('active');
    tabBtnFile?.classList.remove('active');
    panePaste?.classList.remove('hidden');
    panePaste?.classList.add('active');
    paneFile?.classList.add('hidden');
    paneFile?.classList.remove('active');
    const textarea = document.getElementById('input-import-json');
    if (textarea) textarea.focus();
  } else {
    tabBtnFile?.classList.add('active');
    tabBtnPaste?.classList.remove('active');
    paneFile?.classList.remove('hidden');
    paneFile?.classList.add('active');
    panePaste?.classList.add('hidden');
    panePaste?.classList.remove('active');
  }
}

function updateImportPreview(result) {
  if (typeof document === 'undefined') return;
  const errorBox = document.getElementById('import-error-box');
  const errorText = document.getElementById('import-error-text');
  const previewBox = document.getElementById('import-preview-box');
  const previewName = document.getElementById('import-preview-name');
  const previewCount = document.getElementById('import-preview-count');
  const previewDesc = document.getElementById('import-preview-desc');
  const previewBadge = document.getElementById('import-preview-badge');
  const confirmBtn = document.getElementById('btn-import-col-confirm');

  if (result.valid) {
    activeImportPayload = result.payload;
    if (errorBox) errorBox.classList.add('hidden');
    if (errorText) errorText.textContent = '';

    if (previewBox) {
      previewBox.classList.remove('hidden');
      if (previewName) previewName.textContent = result.preview.name;
      if (previewCount) previewCount.textContent = `${result.preview.requestsCount} request${result.preview.requestsCount === 1 ? '' : 's'}`;
      if (previewDesc) previewDesc.textContent = result.preview.description || 'None';
      if (previewBadge) previewBadge.textContent = `${result.preview.schema} (v${result.preview.version})`;
    }

    if (confirmBtn) confirmBtn.disabled = false;
  } else {
    activeImportPayload = null;
    if (previewBox) previewBox.classList.add('hidden');

    if (errorBox) {
      errorBox.classList.remove('hidden');
      if (errorText) errorText.textContent = result.error || 'Invalid collection JSON.';
    }

    if (confirmBtn) confirmBtn.disabled = true;
  }
}

function initCollectionImport() {
  if (typeof document === 'undefined') return;

  const btnOpen = document.getElementById('btn-import-collection');
  const btnClose = document.getElementById('btn-import-col-close');
  const btnCancel = document.getElementById('btn-import-col-cancel');
  const btnConfirm = document.getElementById('btn-import-col-confirm');

  const tabBtnFile = document.getElementById('tab-btn-import-file');
  const tabBtnPaste = document.getElementById('tab-btn-import-paste');

  const dropzone = document.getElementById('import-dropzone');
  const fileInput = document.getElementById('input-import-file');
  const btnRemoveFile = document.getElementById('btn-import-file-remove');
  const textarea = document.getElementById('input-import-json');

  if (btnOpen) btnOpen.addEventListener('click', openImportCollectionModal);
  if (btnClose) btnClose.addEventListener('click', closeImportCollectionModal);
  if (btnCancel) btnCancel.addEventListener('click', closeImportCollectionModal);

  if (tabBtnFile) tabBtnFile.addEventListener('click', () => switchImportTab('file'));
  if (tabBtnPaste) tabBtnPaste.addEventListener('click', () => switchImportTab('paste'));

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleImportFile(files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleImportFile(fileInput.files[0]);
      }
    });
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener('click', (e) => {
      e.stopPropagation();
      resetImportModalState();
    });
  }

  function handleImportFile(file) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json') && file.type && file.type !== 'application/json') {
      updateImportPreview({ valid: false, error: 'Only .json files are accepted.' });
      return;
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      updateImportPreview({ valid: false, error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum limit of 10 MB.` });
      return;
    }

    const fileInfo = document.getElementById('import-file-info');
    const fileNameEl = document.getElementById('import-file-name');
    if (fileInfo && fileNameEl) {
      fileNameEl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      fileInfo.classList.remove('hidden');
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      const result = parseAndValidateImportJson(content);
      updateImportPreview(result);
    };
    reader.onerror = () => {
      updateImportPreview({ valid: false, error: 'Failed to read file from disk.' });
    };
    reader.readAsText(file);
  }

  if (textarea) {
    textarea.addEventListener('input', () => {
      const text = textarea.value;
      if (!text.trim()) {
        const previewBox = document.getElementById('import-preview-box');
        const errorBox = document.getElementById('import-error-box');
        const confirmBtn = document.getElementById('btn-import-col-confirm');
        if (previewBox) previewBox.classList.add('hidden');
        if (errorBox) errorBox.classList.add('hidden');
        if (confirmBtn) confirmBtn.disabled = true;
        activeImportPayload = null;
        return;
      }
      const result = parseAndValidateImportJson(text);
      updateImportPreview(result);
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      if (isImportingCollection || !activeImportPayload) return;
      isImportingCollection = true;
      btnConfirm.disabled = true;
      const btnText = document.getElementById('btn-import-confirm-text');
      if (btnText) btnText.textContent = 'Importing...';

      try {
        const res = await fetch('/api/collections/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(activeImportPayload)
        });

        const data = await res.json();
        if (res.status === 201 && data.success) {
          closeImportCollectionModal();
          showToast('Collection Imported', `Successfully imported "${data.data?.name || 'Collection'}" with ${data.data?.requests_count || 0} requests.`, 'success');
          await loadCollectionsAndSavedRequests();
        } else {
          const errMsg = data.error?.message || data.message || `Import failed with status ${res.status}`;
          updateImportPreview({ valid: false, error: errMsg });
          showToast('Import Failed', errMsg, 'warning');
        }
      } catch (err) {
        const errMsg = `Network error during import: ${err.message}`;
        updateImportPreview({ valid: false, error: errMsg });
        showToast('Connection Error', errMsg, 'warning');
      } finally {
        isImportingCollection = false;
        btnConfirm.disabled = !activeImportPayload;
        if (btnText) btnText.textContent = 'Import Collection';
      }
    });
  }
}

/**
 * Exports a collection to devprobe/v1 JSON and triggers browser download.
 *
 * @param {number|string} collectionId - ID of collection to export
 * @param {string} [collectionName] - Display name for toast and filename
 */
async function exportCollectionToJson(collectionId, collectionName = 'collection') {
  if (!collectionId) return;

  try {
    const res = await fetch(`/api/collections/${collectionId}/export`);
    if (!res.ok) {
      let errData = {};
      try {
        errData = await res.json();
      } catch {}
      const errMsg = errData.error?.message || errData.message || `Export failed with status ${res.status}`;
      showToast('Export Failed', errMsg, 'warning');
      return;
    }

    const disposition = res.headers.get('content-disposition');
    let targetFilename = '';
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match && match[1]) {
        targetFilename = match[1];
      }
    }
    if (!targetFilename) {
      const safeName = String(collectionName || 'collection').replace(/[\r\n"\\/<>:|?*]/g, '_').replace(/\s+/g, '_');
      targetFilename = `${safeName}.json`;
    }

    const jsonData = await res.text();
    downloadFile(jsonData, targetFilename, 'application/json; charset=utf-8');
    showToast('Collection Exported', `Exported "${collectionName}" successfully.`, 'success');
  } catch (err) {
    showToast('Export Error', `Network error during export: ${err.message}`, 'warning');
  }
}

let activeDocsCollection = null;
let cachedMarkdownDoc = '';
let cachedHtmlDoc = '';
let isFetchingDocs = false;

async function openApiDocsModal(collectionOrId, collectionName) {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-api-docs');
  if (!modal) return;

  const colId = typeof collectionOrId === 'object' && collectionOrId !== null ? collectionOrId.id : collectionOrId;
  const colName = typeof collectionOrId === 'object' && collectionOrId !== null ? collectionOrId.name : (collectionName || 'Collection');

  activeDocsCollection = { id: colId, name: colName };
  cachedMarkdownDoc = '';
  cachedHtmlDoc = '';

  const headingEl = document.getElementById('docs-modal-heading');
  if (headingEl) {
    headingEl.textContent = `API Documentation — ${colName}`;
  }

  switchDocsTab('preview');

  const loadingEl = document.getElementById('docs-loading-state');
  const errorEl = document.getElementById('docs-error-state');
  const panePreview = document.getElementById('pane-docs-preview');
  const paneMarkdown = document.getElementById('pane-docs-markdown');
  const paneHtml = document.getElementById('pane-docs-html');

  if (loadingEl) loadingEl.classList.remove('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (panePreview) panePreview.classList.add('hidden');
  if (paneMarkdown) paneMarkdown.classList.add('hidden');
  if (paneHtml) paneHtml.classList.add('hidden');

  setDocsActionsDisabled(true);

  modal.classList.add('active');

  isFetchingDocs = true;
  try {
    const [mdRes, htmlRes] = await Promise.all([
      fetch(`/api/collections/${colId}/docs/markdown`),
      fetch(`/api/collections/${colId}/docs/html`)
    ]);

    if (!mdRes.ok || !htmlRes.ok) {
      let errText = 'Failed to generate documentation.';
      try {
        const errJson = !mdRes.ok ? await mdRes.json() : await htmlRes.json();
        if (errJson.error?.message) errText = errJson.error.message;
      } catch {}
      throw new Error(errText);
    }

    cachedMarkdownDoc = await mdRes.text();
    cachedHtmlDoc = await htmlRes.text();

    const mdViewer = document.getElementById('docs-markdown-source');
    if (mdViewer) mdViewer.value = cachedMarkdownDoc;

    const htmlViewer = document.getElementById('docs-html-source');
    if (htmlViewer) htmlViewer.value = cachedHtmlDoc;

    const iframe = document.getElementById('docs-preview-iframe');
    if (iframe) {
      iframe.srcdoc = cachedHtmlDoc;
    }

    if (loadingEl) loadingEl.classList.add('hidden');
    switchDocsTab('preview');
    setDocsActionsDisabled(false);
  } catch (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) {
      errorEl.classList.remove('hidden');
      const errTextEl = document.getElementById('docs-error-text');
      if (errTextEl) errTextEl.textContent = err.message || 'Failed to load documentation.';
    }
    showToast('Documentation Error', err.message || 'Failed to load documentation', 'warning');
  } finally {
    isFetchingDocs = false;
  }
}

function closeApiDocsModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-api-docs');
  if (modal) modal.classList.remove('active');

  const iframe = document.getElementById('docs-preview-iframe');
  if (iframe) iframe.srcdoc = '';

  const mdViewer = document.getElementById('docs-markdown-source');
  if (mdViewer) mdViewer.value = '';

  const htmlViewer = document.getElementById('docs-html-source');
  if (htmlViewer) htmlViewer.value = '';

  cachedMarkdownDoc = '';
  cachedHtmlDoc = '';
  activeDocsCollection = null;
  isFetchingDocs = false;
}

function switchDocsTab(tabName) {
  if (typeof document === 'undefined') return;
  const btnPreview = document.getElementById('btn-docs-tab-preview');
  const btnMarkdown = document.getElementById('btn-docs-tab-markdown');
  const btnHtml = document.getElementById('btn-docs-tab-html');

  const panePreview = document.getElementById('pane-docs-preview');
  const paneMarkdown = document.getElementById('pane-docs-markdown');
  const paneHtml = document.getElementById('pane-docs-html');

  [btnPreview, btnMarkdown, btnHtml].forEach((b) => b?.classList.remove('active'));
  [panePreview, paneMarkdown, paneHtml].forEach((p) => {
    if (p) {
      p.classList.add('hidden');
      p.classList.remove('active');
    }
  });

  if (tabName === 'markdown') {
    btnMarkdown?.classList.add('active');
    paneMarkdown?.classList.remove('hidden');
    paneMarkdown?.classList.add('active');
  } else if (tabName === 'html') {
    btnHtml?.classList.add('active');
    paneHtml?.classList.remove('hidden');
    paneHtml?.classList.add('active');
  } else {
    btnPreview?.classList.add('active');
    panePreview?.classList.remove('hidden');
    panePreview?.classList.add('active');
  }
}

function setDocsActionsDisabled(disabled) {
  if (typeof document === 'undefined') return;
  const buttons = [
    document.getElementById('btn-docs-copy-md'),
    document.getElementById('btn-docs-copy-html'),
    document.getElementById('btn-docs-download-md'),
    document.getElementById('btn-docs-download-html')
  ];
  buttons.forEach((b) => {
    if (b) b.disabled = disabled;
  });
}

function initApiDocsModal() {
  if (typeof document === 'undefined') return;

  const btnClose = document.getElementById('btn-docs-modal-close');
  const btnDismiss = document.getElementById('btn-docs-modal-dismiss');

  const btnTabPreview = document.getElementById('btn-docs-tab-preview');
  const btnTabMarkdown = document.getElementById('btn-docs-tab-markdown');
  const btnTabHtml = document.getElementById('btn-docs-tab-html');

  const btnCopyMd = document.getElementById('btn-docs-copy-md');
  const btnCopyHtml = document.getElementById('btn-docs-copy-html');
  const btnDownloadMd = document.getElementById('btn-docs-download-md');
  const btnDownloadHtml = document.getElementById('btn-docs-download-html');

  if (btnClose) btnClose.addEventListener('click', closeApiDocsModal);
  if (btnDismiss) btnDismiss.addEventListener('click', closeApiDocsModal);

  if (btnTabPreview) btnTabPreview.addEventListener('click', () => switchDocsTab('preview'));
  if (btnTabMarkdown) btnTabMarkdown.addEventListener('click', () => switchDocsTab('markdown'));
  if (btnTabHtml) btnTabHtml.addEventListener('click', () => switchDocsTab('html'));

  if (btnCopyMd) {
    btnCopyMd.addEventListener('click', () => {
      copyTextToClipboard(cachedMarkdownDoc, 'Markdown Copied', 'Markdown documentation copied to clipboard.');
    });
  }

  if (btnCopyHtml) {
    btnCopyHtml.addEventListener('click', () => {
      copyTextToClipboard(cachedHtmlDoc, 'HTML Copied', 'HTML documentation source copied to clipboard.');
    });
  }

  if (btnDownloadMd) {
    btnDownloadMd.addEventListener('click', () => {
      const colName = activeDocsCollection?.name || 'collection';
      const safeName = colName.replace(/[\r\n"\\/<>:|?*]/g, '_').replace(/\s+/g, '_');
      downloadFile(cachedMarkdownDoc, `${safeName}-docs.md`, 'text/markdown; charset=utf-8');
      showToast('Downloaded', `Saved ${safeName}-docs.md`, 'info');
    });
  }

  if (btnDownloadHtml) {
    btnDownloadHtml.addEventListener('click', () => {
      const colName = activeDocsCollection?.name || 'collection';
      const safeName = colName.replace(/[\r\n"\\/<>:|?*]/g, '_').replace(/\s+/g, '_');
      downloadFile(cachedHtmlDoc, `${safeName}-docs.html`, 'text/html; charset=utf-8');
      showToast('Downloaded', `Saved ${safeName}-docs.html`, 'info');
    });
  }
}

/* ==========================================================================
   11. Environment Management & Variables (Day 12)
   ========================================================================== */

let cachedEnvironments = [];
let currentEditingEnvId = null;

/**
 * Fetches environments from GET /api/environments and populates the UI selector.
 */
async function fetchEnvironments() {
  if (typeof fetch === 'undefined') return;

  try {
    const res = await fetch('/api/environments');
    if (!res.ok) return;
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return;

    cachedEnvironments = json.data;

    // Populate dropdown options
    const envSelector = document.getElementById('env-selector');
    if (envSelector) {
      const currentVal = envSelector.value || activeRequest.selectedEnvironment || 'none';
      envSelector.innerHTML = '<option value="none">No Environment</option>';

      // Preserve predefined demo environments dev/staging/prod for quick testing & Day 3 tests
      envSelector.innerHTML += '<option value="dev">Development (Local Demo)</option>';
      envSelector.innerHTML += '<option value="staging">Staging (Demo)</option>';
      envSelector.innerHTML += '<option value="prod">Production (Demo)</option>';

      // Add database environments
      cachedEnvironments.forEach(env => {
        const opt = document.createElement('option');
        opt.value = String(env.id);
        opt.textContent = `${env.name}${env.is_active ? ' (Active)' : ''}`;
        envSelector.appendChild(opt);
      });

      // Restore active selection: preference is localStorage, then active in DB, then fallback to currentVal
      const storedActive = typeof localStorage !== 'undefined' ? localStorage.getItem('devprobe_active_env_id') : null;
      let targetEnv = 'none';

      if (storedActive && (cachedEnvironments.some(e => String(e.id) === String(storedActive)) || ['none', 'dev', 'staging', 'prod'].includes(storedActive))) {
        targetEnv = storedActive;
      } else {
        const activeInDb = cachedEnvironments.find(e => e.is_active);
        if (activeInDb) {
          targetEnv = String(activeInDb.id);
        } else if (currentVal) {
          targetEnv = currentVal;
        }
      }

      envSelector.value = targetEnv;
      activeRequest.selectedEnvironment = targetEnv;

      // If database environment is active, fetch its full variables
      if (targetEnv !== 'none' && !['dev', 'staging', 'prod'].includes(targetEnv)) {
        await fetchEnvironmentDetails(targetEnv);
      }
    }

    updateQuickView();
    updateUrlPreview();
  } catch (err) {
    // Fail gracefully on fetch error
  }
}

/**
 * Fetches single environment detail from backend and caches in ENVIRONMENTS.
 */
async function fetchEnvironmentDetails(envId) {
  if (typeof fetch === 'undefined') return null;

  try {
    const res = await fetch(`/api/environments/${envId}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !json.data) return null;

    const env = json.data;
    ENVIRONMENTS[String(envId)] = {
      name: env.name,
      description: env.description,
      variables: env.variables || []
    };
    return env;
  } catch (err) {
    return null;
  }
}

/**
 * Sets the active environment in workspace state, localStorage, and updates UI.
 */
async function setActiveEnvironment(envId) {
  const normalizedId = String(envId);
  activeRequest.selectedEnvironment = normalizedId;

  if (typeof localStorage !== 'undefined') {
    // Only store environment ID, NEVER store secrets in localStorage
    localStorage.setItem('devprobe_active_env_id', normalizedId);
  }

  const envSelector = document.getElementById('env-selector');
  if (envSelector) {
    envSelector.value = normalizedId;
  }

  if (normalizedId !== 'none' && !['dev', 'staging', 'prod'].includes(normalizedId)) {
    await fetchEnvironmentDetails(normalizedId);
  }

  const envObj = ENVIRONMENTS[normalizedId];
  const envName = envObj ? envObj.name : 'Unknown';

  updateQuickView();
  updateUrlPreview();
  if (typeof showToast === 'function') {
    showToast('Environment Changed', `Active environment is now: ${envName}. Variables will resolve on request execution.`, 'info');
  }
}

/**
 * Updates the Quick View popover contents with active variables.
 */
function updateQuickView() {
  if (typeof document === 'undefined') return;

  const quickName = document.getElementById('quickview-env-name');
  const quickCount = document.getElementById('quickview-var-count');
  const quickEmpty = document.getElementById('quickview-empty-state');
  const quickTable = document.getElementById('quickview-vars-table');
  const quickTbody = document.getElementById('quickview-vars-tbody');

  if (!quickName || !quickCount) return;

  const currentEnvKey = activeRequest.selectedEnvironment;
  const envObj = ENVIRONMENTS[currentEnvKey];

  if (!envObj || currentEnvKey === 'none') {
    quickName.textContent = 'No Environment';
    quickCount.textContent = '0 variables';
    if (quickEmpty) {
      quickEmpty.textContent = 'No active variables in this environment';
      quickEmpty.classList.remove('hidden');
    }
    if (quickTable) quickTable.classList.add('hidden');
    if (quickTbody) quickTbody.innerHTML = '';
    return;
  }

  quickName.textContent = envObj.name || 'Environment';

  let varsList = [];
  if (Array.isArray(envObj.variables)) {
    varsList = envObj.variables.filter(v => v.is_enabled !== false);
  } else if (typeof envObj.variables === 'object') {
    varsList = Object.entries(envObj.variables).map(([k, v]) => ({ key: k, value: v, is_secret: false }));
  }

  quickCount.textContent = `${varsList.length} variable${varsList.length === 1 ? '' : 's'}`;

  if (varsList.length === 0) {
    if (quickEmpty) {
      quickEmpty.textContent = 'No active variables in this environment';
      quickEmpty.classList.remove('hidden');
    }
    if (quickTable) quickTable.classList.add('hidden');
    if (quickTbody) quickTbody.innerHTML = '';
  } else {
    if (quickEmpty) quickEmpty.classList.add('hidden');
    if (quickTable) quickTable.classList.remove('hidden');
    if (quickTbody) {
      quickTbody.innerHTML = '';
      varsList.forEach(v => {
        const tr = document.createElement('tr');
        const key = v.key || v.var_key;
        const val = v.is_secret ? '••••••••' : (v.value !== undefined ? String(v.value) : '');

        tr.innerHTML = `
          <td class="var-key-col">${escapeHtml(key)}</td>
          <td class="${v.is_secret ? 'var-val-secret' : 'var-val-col'}">${escapeHtml(val)}</td>
        `;
        quickTbody.appendChild(tr);
      });
    }
  }
}

function openEnvironmentManagerModal(selectEnvId = null) {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-environment-manager');
  if (!modal) return;

  modal.classList.add('active');
  renderModalEnvList();

  const targetId = selectEnvId || (activeRequest.selectedEnvironment !== 'none' && !['dev', 'staging', 'prod'].includes(activeRequest.selectedEnvironment) ? activeRequest.selectedEnvironment : (cachedEnvironments[0]?.id || 'new'));

  loadEnvIntoModalEditor(targetId);
}

function closeEnvironmentManagerModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-environment-manager');
  if (modal) modal.classList.remove('active');
}

function renderModalEnvList() {
  const listEl = document.getElementById('modal-env-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (cachedEnvironments.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '8px 10px';
    empty.style.color = 'var(--text-muted)';
    empty.style.fontSize = '11px';
    empty.style.fontStyle = 'italic';
    empty.textContent = 'No saved environments';
    listEl.appendChild(empty);
    return;
  }

  cachedEnvironments.forEach(env => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `modal-env-item ${String(env.id) === String(currentEditingEnvId) ? 'active' : ''}`;
    item.innerHTML = `
      <span class="env-item-name">${escapeHtml(env.name)}</span>
      ${env.is_active ? '<span class="env-item-badge">Active</span>' : ''}
    `;
    item.addEventListener('click', () => {
      loadEnvIntoModalEditor(env.id);
    });
    listEl.appendChild(item);
  });
}

async function loadEnvIntoModalEditor(envId) {
  currentEditingEnvId = envId;
  renderModalEnvList();

  const emptyView = document.getElementById('modal-env-empty-view');
  const editorView = document.getElementById('modal-env-editor-view');
  const idInput = document.getElementById('modal-env-id');
  const nameInput = document.getElementById('modal-env-name-input');
  const descInput = document.getElementById('modal-env-desc-input');
  const btnActivate = document.getElementById('btn-modal-env-activate');
  const btnDelete = document.getElementById('btn-modal-env-delete');
  const tbody = document.getElementById('modal-env-vars-tbody');

  if (!editorView || !emptyView) return;

  emptyView.classList.add('hidden');
  editorView.classList.remove('hidden');

  if (envId === 'new') {
    if (idInput) idInput.value = '';
    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
    if (descInput) descInput.value = '';
    if (btnActivate) btnActivate.style.display = 'none';
    if (btnDelete) btnDelete.style.display = 'none';
    if (tbody) {
      tbody.innerHTML = '';
      addBlankVarRowToModal();
    }
    return;
  }

  if (btnActivate) btnActivate.style.display = 'inline-flex';
  if (btnDelete) btnDelete.style.display = 'inline-flex';

  const env = await fetchEnvironmentDetails(envId);
  if (!env) return;

  if (idInput) idInput.value = env.id;
  if (nameInput) nameInput.value = env.name || '';
  if (descInput) descInput.value = env.description || '';

  if (tbody) {
    tbody.innerHTML = '';
    const vars = Array.isArray(env.variables) ? env.variables : [];
    if (vars.length === 0) {
      addBlankVarRowToModal();
    } else {
      vars.forEach(v => addVariableRowToModal(v));
    }
  }
}

function addVariableRowToModal(v = {}) {
  const tbody = document.getElementById('modal-env-vars-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  const isEnabled = v.is_enabled !== undefined ? Boolean(v.is_enabled) : true;
  const isSecret = Boolean(v.is_secret);
  const key = v.key || v.var_key || '';
  const val = v.value !== undefined && v.value !== null ? String(v.value) : '';

  tr.innerHTML = `
    <td style="text-align: center;">
      <input type="checkbox" class="var-check-enabled" ${isEnabled ? 'checked' : ''} title="Enable/Disable variable">
    </td>
    <td>
      <input type="text" class="var-input-key font-mono" placeholder="Variable key" value="${escapeHtml(key)}">
    </td>
    <td>
      <div class="val-input-wrapper">
        <input type="${isSecret ? 'password' : 'text'}" class="var-input-val font-mono" placeholder="Value" value="${escapeHtml(val)}">
        ${isSecret ? '<button type="button" class="btn-toggle-secret-visibility" title="Toggle visibility"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>' : ''}
      </div>
    </td>
    <td style="text-align: center;">
      <input type="checkbox" class="var-check-secret" ${isSecret ? 'checked' : ''} title="Mark as sensitive secret">
    </td>
    <td style="text-align: center;">
      <button type="button" class="btn-remove-row btn-remove-var" title="Remove variable">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </td>
  `;

  // Secret toggle behavior
  const secretCheck = tr.querySelector('.var-check-secret');
  const valWrapper = tr.querySelector('.val-input-wrapper');
  const valInput = tr.querySelector('.var-input-val');

  if (secretCheck && valInput && valWrapper) {
    secretCheck.addEventListener('change', () => {
      valInput.type = secretCheck.checked ? 'password' : 'text';
      let toggleBtn = valWrapper.querySelector('.btn-toggle-secret-visibility');
      if (secretCheck.checked) {
        if (!toggleBtn) {
          toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'btn-toggle-secret-visibility';
          toggleBtn.title = 'Toggle visibility';
          toggleBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
          toggleBtn.addEventListener('click', () => {
            valInput.type = valInput.type === 'password' ? 'text' : 'password';
          });
          valWrapper.appendChild(toggleBtn);
        }
      } else {
        if (toggleBtn) toggleBtn.remove();
      }
    });

    const existingToggle = valWrapper.querySelector('.btn-toggle-secret-visibility');
    if (existingToggle) {
      existingToggle.addEventListener('click', () => {
        valInput.type = valInput.type === 'password' ? 'text' : 'password';
      });
    }
  }

  // Remove row
  const removeBtn = tr.querySelector('.btn-remove-var');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      tr.remove();
      if (tbody.children.length === 0) {
        addBlankVarRowToModal();
      }
    });
  }

  tbody.appendChild(tr);
}

function addBlankVarRowToModal() {
  addVariableRowToModal({ is_enabled: true, is_secret: false, key: '', value: '' });
}

async function saveEnvironmentFromModal() {
  const idInput = document.getElementById('modal-env-id');
  const nameInput = document.getElementById('modal-env-name-input');
  const descInput = document.getElementById('modal-env-desc-input');
  const tbody = document.getElementById('modal-env-vars-tbody');
  const btnSave = document.getElementById('btn-env-manager-save');

  const name = (nameInput?.value || '').trim();
  if (!name) {
    showToast('Validation Error', 'Environment name is required.', 'warning');
    return;
  }

  const description = (descInput?.value || '').trim();
  const envId = idInput?.value || null;

  // Collect variables
  const variables = [];
  const seenKeys = new Set();

  if (tbody) {
    for (const row of tbody.querySelectorAll('tr')) {
      const key = (row.querySelector('.var-input-key')?.value || '').trim();
      const val = row.querySelector('.var-input-val')?.value || '';
      const isEnabled = Boolean(row.querySelector('.var-check-enabled')?.checked);
      const isSecret = Boolean(row.querySelector('.var-check-secret')?.checked);

      // Skip completely blank rows
      if (!key && !val) continue;

      if (!key) {
        showToast('Validation Error', 'Variable key cannot be empty.', 'warning');
        return;
      }

      const lowerKey = key.toLowerCase();
      if (seenKeys.has(lowerKey)) {
        showToast('Duplicate Variable', `Variable key '${key}' is duplicated in this environment.`, 'warning');
        return;
      }
      seenKeys.add(lowerKey);

      variables.push({
        key,
        value: val,
        is_enabled: isEnabled,
        is_secret: isSecret
      });
    }
  }

  const payload = {
    name,
    description: description || null,
    variables
  };

  if (btnSave) btnSave.disabled = true;

  try {
    const url = envId ? `/api/environments/${envId}` : '/api/environments';
    const method = envId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      showToast('Error Saving Environment', json.error?.message || json.message || 'Operation failed', 'warning');
      return;
    }

    showToast('Environment Saved', `Environment '${name}' saved successfully.`, 'success');
    await fetchEnvironments();
    loadEnvIntoModalEditor(json.data.id);
  } catch (err) {
    showToast('Network Error', err.message, 'warning');
  } finally {
    if (btnSave) btnSave.disabled = false;
  }
}

async function activateEnvironmentFromModal() {
  const idInput = document.getElementById('modal-env-id');
  const envId = idInput?.value;
  if (!envId) return;

  try {
    const res = await fetch(`/api/environments/${envId}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (res.ok && json.success) {
      await fetchEnvironments();
      await setActiveEnvironment(envId);
      renderModalEnvList();
      showToast('Environment Activated', `Environment '${json.data.name}' is now active.`, 'success');
    } else {
      showToast('Activation Failed', json.error?.message || 'Could not activate environment', 'warning');
    }
  } catch (err) {
    showToast('Network Error', err.message, 'warning');
  }
}

async function deleteEnvironmentFromModal() {
  const idInput = document.getElementById('modal-env-id');
  const nameInput = document.getElementById('modal-env-name-input');
  const envId = idInput?.value;
  const envName = nameInput?.value || 'this environment';

  if (!envId) return;

  if (typeof confirm !== 'undefined' && !confirm(`Are you sure you want to delete environment '${envName}'? All its variables will be permanently deleted.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/environments/${envId}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (res.ok && json.success) {
      showToast('Environment Deleted', `Environment '${envName}' deleted.`, 'info');
      if (String(activeRequest.selectedEnvironment) === String(envId)) {
        await setActiveEnvironment('none');
      }
      await fetchEnvironments();
      const firstRemaining = cachedEnvironments[0]?.id || 'new';
      loadEnvIntoModalEditor(firstRemaining);
    } else {
      showToast('Delete Failed', json.error?.message || 'Could not delete environment', 'warning');
    }
  } catch (err) {
    showToast('Network Error', err.message, 'warning');
  }
}

function initEnvironmentManagement() {
  if (typeof document === 'undefined') return;

  // 1. Quickview button toggle
  const btnQuickView = document.getElementById('btn-env-quickview');
  const popover = document.getElementById('env-quickview-popover');

  if (btnQuickView && popover) {
    btnQuickView.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== btnQuickView && !btnQuickView.contains(e.target)) {
        popover.classList.add('hidden');
      }
    });
  }

  // 2. Manage environments button
  const btnManage = document.getElementById('btn-manage-environments');
  if (btnManage) {
    btnManage.addEventListener('click', () => {
      openEnvironmentManagerModal();
    });
  }

  // 3. Modal close & cancel
  const btnClose = document.getElementById('btn-env-manager-close');
  const btnCancel = document.getElementById('btn-env-manager-cancel');
  if (btnClose) btnClose.addEventListener('click', closeEnvironmentManagerModal);
  if (btnCancel) btnCancel.addEventListener('click', closeEnvironmentManagerModal);

  // 4. Modal action buttons
  const btnCreateNew = document.getElementById('btn-env-create-new');
  if (btnCreateNew) {
    btnCreateNew.addEventListener('click', () => {
      loadEnvIntoModalEditor('new');
    });
  }

  const btnAddVar = document.getElementById('btn-env-add-var-row');
  if (btnAddVar) {
    btnAddVar.addEventListener('click', addBlankVarRowToModal);
  }

  const btnSave = document.getElementById('btn-env-manager-save');
  if (btnSave) {
    btnSave.addEventListener('click', saveEnvironmentFromModal);
  }

  const btnActivate = document.getElementById('btn-modal-env-activate');
  if (btnActivate) {
    btnActivate.addEventListener('click', activateEnvironmentFromModal);
  }

  const btnDelete = document.getElementById('btn-modal-env-delete');
  if (btnDelete) {
    btnDelete.addEventListener('click', deleteEnvironmentFromModal);
  }

  // 5. Initial fetch
  fetchEnvironments();
}

/* ==========================================================================
   12. Request History & Execution Management (Day 13)
   ========================================================================== */

let historyCurrentPage = 1;
const historyPageLimit = 20;
let historyTotalRecords = 0;
let historyTotalPages = 1;
let cachedHistoryItems = [];
let selectedHistoryRecord = null;
let selectedHistoryCompareIds = [];
let cachedCompareRecords = { a: null, b: null };

/**
 * Fetches paginated execution history from GET /api/history
 */
async function fetchHistoryList(page = 1) {
  if (typeof document === 'undefined') return;

  historyCurrentPage = Math.max(1, parseInt(page, 10) || 1);

  const loadingSpinner = document.getElementById('history-loading-indicator');
  const errorState = document.getElementById('history-error-state');
  const emptyState = document.getElementById('history-empty-state');
  const listContainer = document.getElementById('history-list-container');
  const totalBadge = document.getElementById('history-total-badge');

  if (loadingSpinner) loadingSpinner.classList.remove('hidden');
  if (errorState) errorState.classList.add('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  try {
    const res = await fetch(`/api/history?page=${historyCurrentPage}&limit=${historyPageLimit}`);
    const json = await res.json();

    if (json.success) {
      cachedHistoryItems = json.data || [];
      if (json.pagination) {
        historyTotalRecords = json.pagination.total || 0;
        historyTotalPages = Math.max(1, json.pagination.totalPages || 1);
        historyCurrentPage = json.pagination.page || 1;
      }

      if (totalBadge) {
        totalBadge.textContent = String(historyTotalRecords);
      }

      renderHistoryList(cachedHistoryItems, json.pagination || { page: historyCurrentPage, totalPages: historyTotalPages, total: historyTotalRecords });
    } else {
      if (errorState) errorState.classList.remove('hidden');
      if (listContainer) listContainer.innerHTML = '';
    }
  } catch {
    if (errorState) errorState.classList.remove('hidden');
    if (listContainer) listContainer.innerHTML = '';
  } finally {
    if (loadingSpinner) loadingSpinner.classList.add('hidden');
  }
}

/**
 * Renders the history records into the sidebar history list container
 */
function renderHistoryList(items, pagination = {}) {
  if (typeof document === 'undefined') return;

  const listContainer = document.getElementById('history-list-container');
  const emptyState = document.getElementById('history-empty-state');
  const paginationContainer = document.getElementById('history-pagination-container');
  const pageInfo = document.getElementById('history-page-info');
  const btnPrev = document.getElementById('btn-history-prev');
  const btnNext = document.getElementById('btn-history-next');

  updateHistoryCompareBar();

  if (!listContainer) return;

  listContainer.innerHTML = '';

  if (!items || items.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (paginationContainer) paginationContainer.classList.add('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  // Render pagination controls
  if (paginationContainer) {
    paginationContainer.classList.remove('hidden');
    const totalPages = Math.max(1, pagination.totalPages || 1);
    const currentPage = pagination.page || 1;

    if (pageInfo) pageInfo.textContent = `${currentPage} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= totalPages;
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-item-row';

    // Compare selection checkbox
    const selectLabel = document.createElement('label');
    selectLabel.className = 'history-select-label';
    selectLabel.title = 'Select for comparison';
    selectLabel.addEventListener('click', (e) => e.stopPropagation());

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'history-select-checkbox';
    checkbox.setAttribute('aria-label', `Select ${item.request_name || item.url || 'request'} for comparison`);
    const isSelected = selectedHistoryCompareIds.includes(item.id);
    checkbox.checked = isSelected;

    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleHistoryCompareSelection(item.id);
    });
    selectLabel.appendChild(checkbox);

    if (isSelected) {
      row.classList.add('is-selected-for-compare');
      const tagIdx = selectedHistoryCompareIds.indexOf(item.id);
      const tag = document.createElement('span');
      tag.className = `compare-indicator-tag tag-${tagIdx === 0 ? 'a' : 'b'}`;
      tag.textContent = tagIdx === 0 ? 'A' : 'B';
      row.appendChild(tag);
    }

    row.appendChild(selectLabel);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'history-item-btn';
    btn.setAttribute('data-id', item.id);
    btn.title = `View details for ${item.request_name || item.url || 'request'}`;

    const methodLower = (item.method || 'GET').toLowerCase();
    const methodSpan = document.createElement('span');
    methodSpan.className = `method-badge method-${methodLower}`;
    methodSpan.textContent = item.method || 'GET';

    const metaDiv = document.createElement('div');
    metaDiv.className = 'history-item-meta';

    const topDiv = document.createElement('div');
    topDiv.className = 'history-item-top';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'history-item-name';
    nameSpan.textContent = item.request_name || item.url || 'Untitled Request';

    topDiv.appendChild(nameSpan);

    const bottomDiv = document.createElement('div');
    bottomDiv.className = 'history-item-bottom';

    // Status pill
    const statusSpan = document.createElement('span');
    const status = item.response_status;
    let statusClass = 'history-status-err';
    if (status >= 200 && status < 300) statusClass = 'history-status-2xx';
    else if (status >= 300 && status < 400) statusClass = 'history-status-3xx';
    else if (status >= 400 && status < 500) statusClass = 'history-status-4xx';
    else if (status >= 500) statusClass = 'history-status-5xx';

    statusSpan.className = `history-status-pill ${statusClass}`;
    statusSpan.textContent = status ? String(status) : (item.error_message ? 'ERR' : 'FAIL');
    bottomDiv.appendChild(statusSpan);

    // Duration badge
    if (item.response_time !== null && item.response_time !== undefined) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'history-time-badge';
      timeSpan.textContent = `${item.response_time}ms`;
      bottomDiv.appendChild(timeSpan);
    }

    // Date badge
    if (item.created_at) {
      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date-badge';
      try {
        const d = new Date(item.created_at);
        dateSpan.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        dateSpan.textContent = '';
      }
      bottomDiv.appendChild(dateSpan);
    }

    metaDiv.appendChild(topDiv);
    metaDiv.appendChild(bottomDiv);

    btn.appendChild(methodSpan);
    btn.appendChild(metaDiv);

    btn.addEventListener('click', () => {
      openHistoryDetailModal(item.id);
    });

    // Delete single item button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'history-delete-item-btn';
    deleteBtn.title = 'Delete this record';
    deleteBtn.setAttribute('aria-label', 'Delete this record');
    deleteBtn.innerHTML = '&times;';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryItem(item.id);
    });

    row.appendChild(btn);
    row.appendChild(deleteBtn);
    listContainer.appendChild(row);
  });
}

/**
 * Opens the History Detail Modal for a specific history record
 */
async function openHistoryDetailModal(id) {
  if (typeof document === 'undefined' || !id) return;

  const modal = document.getElementById('modal-history-detail');
  if (!modal) return;

  try {
    const res = await fetch(`/api/history/${id}`);
    const json = await res.json();

    if (!json.success || !json.data) {
      showToast('Error', 'Failed to retrieve history record details.', 'warning');
      return;
    }

    selectedHistoryRecord = json.data;
    const rec = json.data;

    // Populate header & meta
    const methodBadge = document.getElementById('hist-detail-method-badge');
    const nameEl = document.getElementById('hist-detail-name');
    const urlEl = document.getElementById('hist-detail-url');
    const statusPill = document.getElementById('hist-detail-status-pill');
    const timeEl = document.getElementById('hist-detail-time');
    const dateEl = document.getElementById('hist-detail-date');
    const truncBadge = document.getElementById('hist-detail-truncated-badge');
    const errorRow = document.getElementById('hist-detail-error-row');
    const errorMsg = document.getElementById('hist-detail-error-msg');

    if (methodBadge) {
      const m = (rec.method || 'GET').toLowerCase();
      methodBadge.className = `method-badge method-${m}`;
      methodBadge.textContent = rec.method || 'GET';
    }

    if (nameEl) nameEl.textContent = rec.request_name || 'Untitled Request';
    if (urlEl) urlEl.textContent = rec.url || '-';

    if (statusPill) {
      const s = rec.response_status;
      let statusClass = 'status-pill-danger';
      if (s >= 200 && s < 300) statusClass = 'status-pill-success';
      else if (s >= 300 && s < 400) statusClass = 'status-pill-info';
      else if (s >= 400 && s < 500) statusClass = 'status-pill-warning';

      statusPill.className = `status-pill ${statusClass}`;
      statusPill.textContent = s ? `${s}` : 'No Response';
    }

    if (timeEl) timeEl.textContent = rec.response_time !== null && rec.response_time !== undefined ? `${rec.response_time}ms` : '-';
    if (dateEl) {
      try {
        dateEl.textContent = new Date(rec.created_at).toLocaleString();
      } catch {
        dateEl.textContent = rec.created_at || '-';
      }
    }

    if (truncBadge) {
      if (rec.response_body_truncated) {
        truncBadge.classList.remove('hidden');
      } else {
        truncBadge.classList.add('hidden');
      }
    }

    if (errorRow && errorMsg) {
      if (rec.error_message) {
        errorMsg.textContent = rec.error_message;
        errorRow.classList.remove('hidden');
      } else {
        errorRow.classList.add('hidden');
      }
    }

    const btnCompareToggle = document.getElementById('btn-hist-detail-compare');
    if (btnCompareToggle) {
      const isSel = selectedHistoryCompareIds.includes(rec.id);
      btnCompareToggle.textContent = isSel ? 'Remove from Compare' : 'Select for Compare';
    }

    // Populate Request details
    const reqHeadersView = document.getElementById('hist-detail-req-headers');
    const reqBodyView = document.getElementById('hist-detail-req-body');

    if (reqHeadersView) {
      if (rec.request_headers && typeof rec.request_headers === 'object' && Object.keys(rec.request_headers).length > 0) {
        reqHeadersView.textContent = JSON.stringify(rec.request_headers, null, 2);
      } else {
        reqHeadersView.textContent = 'None';
      }
    }

    if (reqBodyView) {
      reqBodyView.textContent = rec.request_body || 'None';
    }

    // Populate Response details
    const resHeadersView = document.getElementById('hist-detail-res-headers');
    const resBodyView = document.getElementById('hist-detail-res-body');

    if (resHeadersView) {
      if (rec.response_headers && typeof rec.response_headers === 'object' && Object.keys(rec.response_headers).length > 0) {
        resHeadersView.textContent = JSON.stringify(rec.response_headers, null, 2);
      } else {
        resHeadersView.textContent = 'None';
      }
    }

    if (resBodyView) {
      if (rec.response_body) {
        try {
          const parsed = JSON.parse(rec.response_body);
          resBodyView.innerHTML = highlightJsonToHtml(JSON.stringify(parsed, null, 2));
        } catch {
          resBodyView.textContent = rec.response_body;
        }
      } else {
        resBodyView.textContent = 'None';
      }
    }

    // Populate Historical Test Results (Day 14 Step 5)
    renderHistoricalTestResults(rec);

    // Reset tabs to Request tab
    switchHistoryDetailTab('hist-view-request');

    modal.classList.add('active');
  } catch (err) {
    showToast('Error', `Failed to open history details: ${err.message}`, 'warning');
  }
}

/**
 * Closes the History Detail Modal
 */
function closeHistoryDetailModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-history-detail');
  if (modal) modal.classList.remove('active');
  selectedHistoryRecord = null;
}

/**
 * Switches between Request and Response tabs in History Detail Modal
 */
function switchHistoryDetailTab(targetViewId) {
  if (typeof document === 'undefined') return;

  const tabBtns = document.querySelectorAll('.history-tab-btn');
  const tabContents = document.querySelectorAll('.history-tab-content');

  tabBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === targetViewId);
  });

  tabContents.forEach((content) => {
    content.classList.toggle('hidden', content.id !== targetViewId);
  });
}

/**
 * Converts a history record into active request state and loads it into the workspace
 */
function loadHistoryIntoWorkspace(record = selectedHistoryRecord) {
  if (!record) return;

  // Build params
  let parsedUrl = record.url || '';
  const params = [];
  try {
    const u = new URL(parsedUrl);
    u.searchParams.forEach((val, key) => {
      params.push({
        id: generateRowId('param'),
        key,
        value: val,
        description: '',
        enabled: true
      });
    });
  } catch {
    // If not a valid absolute URL, leave params empty
  }

  if (params.length === 0) {
    params.push({ id: generateRowId('param'), key: '', value: '', description: '', enabled: false });
  }

  // Build headers
  const headers = [];
  if (record.request_headers && typeof record.request_headers === 'object') {
    Object.entries(record.request_headers).forEach(([key, value]) => {
      headers.push({
        id: generateRowId('hdr'),
        key,
        value: String(value),
        description: '',
        enabled: true
      });
    });
  }
  if (headers.length === 0) {
    headers.push({ id: generateRowId('hdr'), key: 'Accept', value: 'application/json', description: '', enabled: true });
  }

  // Build body
  let bodyType = 'none';
  let bodyText = '';
  if (record.request_body) {
    bodyText = record.request_body;
    try {
      JSON.parse(record.request_body);
      bodyType = 'json';
    } catch {
      bodyType = 'raw';
    }
  }

  loadRequestIntoState({
    name: record.request_name || 'History Request',
    method: record.method || 'GET',
    url: record.url || '',
    params,
    headers,
    body: { type: bodyType, text: bodyText },
    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' },
    assertions: []
  });

  closeHistoryDetailModal();
  showToast('Workspace Updated', `Loaded "${record.request_name || record.url}" into workspace.`, 'success');
}

/**
 * Deletes a single history record by ID
 */
async function deleteHistoryItem(id) {
  if (!id) return;

  try {
    const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
    const json = await res.json();

    if (json.success) {
      showToast('Record Deleted', 'Execution history record deleted successfully.', 'info');

      if (selectedHistoryRecord && selectedHistoryRecord.id === id) {
        closeHistoryDetailModal();
      }

      // If this was the last item on current page and we're past page 1, step back
      if (cachedHistoryItems.length <= 1 && historyCurrentPage > 1) {
        historyCurrentPage--;
      }

      fetchHistoryList(historyCurrentPage);
    } else {
      showToast('Error', json.message || 'Failed to delete history record.', 'warning');
    }
  } catch (err) {
    showToast('Error', `Network error deleting record: ${err.message}`, 'warning');
  }
}

/**
 * Opens the Clear All History confirmation modal
 */
function openClearHistoryModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-clear-history');
  if (modal) modal.classList.add('active');
}

/**
 * Closes the Clear All History confirmation modal
 */
function closeClearHistoryModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-clear-history');
  if (modal) modal.classList.remove('active');
}

/**
 * Executes clear-all history deletion
 */
async function confirmClearAllHistory() {
  try {
    const res = await fetch('/api/history', { method: 'DELETE' });
    const json = await res.json();

    if (json.success) {
      showToast('History Cleared', 'All execution history records have been deleted.', 'success');
      closeClearHistoryModal();
      historyCurrentPage = 1;
      fetchHistoryList(1);
    } else {
      showToast('Error', json.message || 'Failed to clear history.', 'warning');
    }
  } catch (err) {
    showToast('Error', `Network error clearing history: ${err.message}`, 'warning');
  }
}

let isHistoryInitialized = false;

/**
 * Initializes History Management event handlers and triggers initial fetch
 */
function initHistoryManagement() {
  if (typeof document === 'undefined') return;
  if (isHistoryInitialized) return;
  isHistoryInitialized = true;

  // Refresh & Clear All buttons in sidebar header
  const btnRefresh = document.getElementById('btn-history-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => fetchHistoryList(historyCurrentPage));
  }

  const btnClearAll = document.getElementById('btn-history-clear-all');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', openClearHistoryModal);
  }

  const btnRetry = document.getElementById('btn-history-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => fetchHistoryList(historyCurrentPage));
  }

  // Pagination buttons
  const btnPrev = document.getElementById('btn-history-prev');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (historyCurrentPage > 1) {
        fetchHistoryList(historyCurrentPage - 1);
      }
    });
  }

  const btnNext = document.getElementById('btn-history-next');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (historyCurrentPage < historyTotalPages) {
        fetchHistoryList(historyCurrentPage + 1);
      }
    });
  }

  // History Detail Modal controls
  const btnDetailClose = document.getElementById('btn-hist-detail-close');
  if (btnDetailClose) btnDetailClose.addEventListener('click', closeHistoryDetailModal);

  const btnDetailCancel = document.getElementById('btn-hist-detail-cancel');
  if (btnDetailCancel) btnDetailCancel.addEventListener('click', closeHistoryDetailModal);

  const btnDetailLoad = document.getElementById('btn-hist-detail-load');
  if (btnDetailLoad) {
    btnDetailLoad.addEventListener('click', () => loadHistoryIntoWorkspace(selectedHistoryRecord));
  }

  const btnDetailDelete = document.getElementById('btn-hist-detail-delete');
  if (btnDetailDelete) {
    btnDetailDelete.addEventListener('click', () => {
      if (selectedHistoryRecord && selectedHistoryRecord.id) {
        deleteHistoryItem(selectedHistoryRecord.id);
      }
    });
  }

  // History Detail Tabs
  const tabReq = document.getElementById('tab-btn-hist-request');
  if (tabReq) {
    tabReq.addEventListener('click', () => switchHistoryDetailTab('hist-view-request'));
  }

  const tabRes = document.getElementById('tab-btn-hist-response');
  if (tabRes) {
    tabRes.addEventListener('click', () => switchHistoryDetailTab('hist-view-response'));
  }

  // Clear All Modal controls
  const btnClearClose = document.getElementById('btn-clear-hist-close');
  if (btnClearClose) btnClearClose.addEventListener('click', closeClearHistoryModal);

  const btnClearCancel = document.getElementById('btn-clear-hist-cancel');
  if (btnClearCancel) btnClearCancel.addEventListener('click', closeClearHistoryModal);

  const btnClearConfirm = document.getElementById('btn-clear-hist-confirm');
  if (btnClearConfirm) btnClearConfirm.addEventListener('click', confirmClearAllHistory);

  // Initialize comparison toolbar and modal controls
  initHistoryComparison();

  // Initial fetch
  fetchHistoryList(1);
}

/* ==========================================================================
   13. Response Comparison Management (Day 13 Step 6)
   ========================================================================== */

/**
 * Returns a clone of the currently selected history IDs for comparison.
 */
function getSelectedHistoryCompareIds() {
  return [...selectedHistoryCompareIds];
}

/**
 * Sets the selected history compare IDs (capped at 2).
 */
function setSelectedHistoryCompareIds(ids) {
  if (Array.isArray(ids)) {
    selectedHistoryCompareIds = ids.slice(0, 2);
    updateHistoryCompareBar();
  }
}

/**
 * Toggles selection of a history record for side-by-side comparison.
 * Exactly two records can be selected.
 */
function toggleHistoryCompareSelection(id) {
  if (!id) return;
  const numId = Number(id);

  const idx = selectedHistoryCompareIds.indexOf(numId);
  if (idx !== -1) {
    selectedHistoryCompareIds.splice(idx, 1);
  } else {
    if (selectedHistoryCompareIds.length >= 2) {
      if (typeof showToast === 'function') {
        showToast('Comparison Limit', 'You can select up to 2 records for comparison. Deselect one first.', 'warning');
      }
      return;
    }
    selectedHistoryCompareIds.push(numId);
  }

  updateHistoryCompareBar();

  if (typeof document !== 'undefined') {
    renderHistoryList(cachedHistoryItems);
  }
}

/**
 * Clears active history comparison selection.
 */
function clearHistoryCompareSelection() {
  selectedHistoryCompareIds = [];
  cachedCompareRecords = { a: null, b: null };
  updateHistoryCompareBar();
  if (typeof document !== 'undefined') {
    renderHistoryList(cachedHistoryItems);
  }
}

/**
 * Updates the compare toolbar in the history sidebar.
 */
function updateHistoryCompareBar() {
  if (typeof document === 'undefined') return;

  const compareBar = document.getElementById('history-compare-bar');
  const countBadge = document.getElementById('compare-selection-count');
  const btnLaunch = document.getElementById('btn-history-compare-launch');

  const count = selectedHistoryCompareIds.length;

  if (countBadge) {
    countBadge.textContent = `${count}/2`;
  }

  if (btnLaunch) {
    btnLaunch.disabled = count !== 2;
  }

  if (compareBar) {
    if (count > 0) {
      compareBar.classList.remove('hidden');
    } else {
      compareBar.classList.add('hidden');
    }
  }
}

/**
 * Compares two response header objects with case-insensitive key matching.
 * @param {object|null} headersA - Headers from Record A
 * @param {object|null} headersB - Headers from Record B
 * @returns {{ identical: boolean, rows: Array<{ key: string, valueA: string|null, valueB: string|null, status: 'same'|'modified'|'only_a'|'only_b' }> }}
 */
function compareResponseHeaders(headersA, headersB) {
  const normA = {};
  const origKeyA = {};
  if (headersA && typeof headersA === 'object') {
    Object.entries(headersA).forEach(([k, v]) => {
      const lower = k.toLowerCase();
      normA[lower] = String(v);
      origKeyA[lower] = k;
    });
  }

  const normB = {};
  const origKeyB = {};
  if (headersB && typeof headersB === 'object') {
    Object.entries(headersB).forEach(([k, v]) => {
      const lower = k.toLowerCase();
      normB[lower] = String(v);
      origKeyB[lower] = k;
    });
  }

  const allKeys = Array.from(new Set([...Object.keys(normA), ...Object.keys(normB)])).sort();
  let identical = true;

  const rows = allKeys.map((lowerKey) => {
    const hasA = Object.prototype.hasOwnProperty.call(normA, lowerKey);
    const hasB = Object.prototype.hasOwnProperty.call(normB, lowerKey);
    const valA = hasA ? normA[lowerKey] : null;
    const valB = hasB ? normB[lowerKey] : null;
    const displayKey = origKeyA[lowerKey] || origKeyB[lowerKey] || lowerKey;

    let status = 'same';
    if (hasA && !hasB) {
      status = 'only_a';
      identical = false;
    } else if (!hasA && hasB) {
      status = 'only_b';
      identical = false;
    } else if (valA !== valB) {
      status = 'modified';
      identical = false;
    }

    return {
      key: displayKey,
      valueA: valA,
      valueB: valB,
      status
    };
  });

  return { identical, rows };
}

/**
 * Computes an LCS-based line-by-line diff between two multi-line strings.
 * @param {string|null} textA
 * @param {string|null} textB
 * @returns {Array<{ type: 'same'|'added'|'removed', textA: string|null, textB: string|null }>}
 */
function computeLineDiff(textA, textB) {
  if (textA === textB) {
    const lines = (textA || '').split('\n');
    return lines.map((l) => ({ type: 'same', textA: l, textB: l }));
  }

  const a = (textA === null || textA === undefined) ? [] : String(textA).split('\n');
  const b = (textB === null || textB === undefined) ? [] : String(textB).split('\n');

  if (a.length === 0) {
    return b.map((l) => ({ type: 'added', textA: null, textB: l }));
  }
  if (b.length === 0) {
    return a.map((l) => ({ type: 'removed', textA: l, textB: null }));
  }

  // Fast path / guard for very large line counts to keep UI responsive
  if (a.length > 800 || b.length > 800) {
    const diff = [];
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const lineA = i < a.length ? a[i] : null;
      const lineB = i < b.length ? b[i] : null;
      if (lineA === lineB) {
        diff.push({ type: 'same', textA: lineA, textB: lineB });
      } else {
        if (lineA !== null) diff.push({ type: 'removed', textA: lineA, textB: null });
        if (lineB !== null) diff.push({ type: 'added', textA: null, textB: lineB });
      }
    }
    return diff;
  }

  // Standard LCS Dynamic Programming
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'same', textA: a[i - 1], textB: b[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', textA: null, textB: b[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.push({ type: 'removed', textA: a[i - 1], textB: null });
      i--;
    }
  }

  return result.reverse();
}

/**
 * Formats a body payload for comparison (pretty JSON if valid JSON, otherwise string).
 * @param {any} body
 * @returns {{ text: string, type: 'json'|'text'|'empty' }}
 */
function formatBodyForComparison(body) {
  if (body === null || body === undefined || body === '') {
    return { text: '', type: 'empty' };
  }

  if (typeof body === 'object') {
    try {
      return { text: JSON.stringify(body, null, 2), type: 'json' };
    } catch {
      return { text: String(body), type: 'text' };
    }
  }

  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return { text: '', type: 'empty' };
    }
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return { text: JSON.stringify(parsed, null, 2), type: 'json' };
      } catch {
        return { text: body, type: 'text' };
      }
    }
    return { text: body, type: 'text' };
  }

  return { text: String(body), type: 'text' };
}

/**
 * Analyzes two history records and generates complete comparison metadata.
 * @param {object} recA - History record A
 * @param {object} recB - History record B
 * @returns {object} Comparison descriptor
 */
function compareHistoryRecords(recA, recB) {
  if (!recA || !recB) {
    throw new Error('Both Record A and Record B are required for comparison');
  }

  // 1. Status comparison
  const statusA = recA.response_status;
  const statusB = recB.response_status;
  const statusIdentical = statusA === statusB;

  // 2. Latency comparison
  const timeA = recA.response_time !== null && recA.response_time !== undefined ? Number(recA.response_time) : null;
  const timeB = recB.response_time !== null && recB.response_time !== undefined ? Number(recB.response_time) : null;
  const timeDelta = (timeA !== null && timeB !== null) ? (timeB - timeA) : null;

  // 3. Truncation flags
  const truncA = Boolean(recA.response_body_truncated);
  const truncB = Boolean(recB.response_body_truncated);
  const hasTruncation = truncA || truncB;

  // 4. Failure comparison
  const isFailedA = Boolean(recA.error_message || statusA === null);
  const isFailedB = Boolean(recB.error_message || statusB === null);

  // 5. Header comparison
  const headerDiff = compareResponseHeaders(recA.response_headers, recB.response_headers);

  // 6. Body comparison
  const fmtA = formatBodyForComparison(recA.response_body);
  const fmtB = formatBodyForComparison(recB.response_body);

  let bodyIdentical = false;
  let bodyDiffType = fmtA.type === fmtB.type ? fmtA.type : 'mixed';

  if (isFailedA && isFailedB) {
    bodyDiffType = 'error';
    bodyIdentical = recA.error_message === recB.error_message;
  } else if (isFailedA || isFailedB) {
    bodyDiffType = 'error';
    bodyIdentical = false;
  } else if (!hasTruncation && fmtA.text === fmtB.text) {
    bodyIdentical = true;
  }

  const lineDiff = (isFailedA || isFailedB)
    ? computeLineDiff(recA.error_message || fmtA.text, recB.error_message || fmtB.text)
    : computeLineDiff(fmtA.text, fmtB.text);

  return {
    recordA: recA,
    recordB: recB,
    statusDiff: {
      statusA,
      statusB,
      identical: statusIdentical
    },
    timeDiff: {
      timeA,
      timeB,
      delta: timeDelta
    },
    truncation: {
      truncA,
      truncB,
      hasTruncation
    },
    failures: {
      isFailedA,
      isFailedB,
      errorA: recA.error_message,
      errorB: recB.error_message
    },
    headerDiff,
    bodyDiff: {
      typeA: fmtA.type,
      typeB: fmtB.type,
      diffType: bodyDiffType,
      identical: bodyIdentical,
      hasTruncation,
      lines: lineDiff
    }
  };
}

/**
 * Opens the History Compare Modal and loads comparison for the two selected IDs.
 */
async function openHistoryCompareModal() {
  if (typeof document === 'undefined') return;

  if (selectedHistoryCompareIds.length !== 2) {
    if (typeof showToast === 'function') {
      showToast('Select Records', 'Please select exactly two history records to compare.', 'warning');
    }
    return;
  }

  const modal = document.getElementById('modal-history-compare');
  const loadingEl = document.getElementById('compare-modal-loading');
  const errorEl = document.getElementById('compare-modal-error');
  const errorMsg = document.getElementById('compare-modal-error-msg');
  const contentEl = document.getElementById('compare-modal-content');

  if (!modal) return;

  modal.classList.add('active');
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (contentEl) contentEl.classList.add('hidden');

  const [idA, idB] = selectedHistoryCompareIds;

  try {
    const [resA, resB] = await Promise.all([
      fetch(`/api/history/${idA}`),
      fetch(`/api/history/${idB}`)
    ]);

    const jsonA = await resA.json();
    const jsonB = await resB.json();

    if (!resA.ok || !jsonA.success || !jsonA.data) {
      throw new Error(`Could not load Record A (#${idA}): ${jsonA.error?.message || jsonA.message || 'Not found'}`);
    }
    if (!resB.ok || !jsonB.success || !jsonB.data) {
      throw new Error(`Could not load Record B (#${idB}): ${jsonB.error?.message || jsonB.message || 'Not found'}`);
    }

    cachedCompareRecords = { a: jsonA.data, b: jsonB.data };
    const comp = compareHistoryRecords(jsonA.data, jsonB.data);
    renderCompareModalContent(comp);

    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
  } catch (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl && errorMsg) {
      errorMsg.textContent = err.message || 'Failed to retrieve comparison records.';
      errorEl.classList.remove('hidden');
    }
    if (typeof showToast === 'function') {
      showToast('Compare Error', err.message || 'Failed to compare records.', 'warning');
    }
  }
}

/**
 * Closes the History Compare Modal.
 */
function closeHistoryCompareModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-history-compare');
  if (modal) modal.classList.remove('active');
}

/**
 * Switches between Response Bodies and Response Headers in the Comparison Modal.
 */
function switchCompareSection(targetSectionId) {
  if (typeof document === 'undefined') return;

  const tabBtns = document.querySelectorAll('.compare-tab-btn');
  const panels = document.querySelectorAll('.compare-section-panel');

  tabBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === targetSectionId);
  });

  panels.forEach((p) => {
    p.classList.toggle('hidden', p.id !== targetSectionId);
  });
}

/**
 * Renders the comparison results into the comparison modal DOM elements.
 * @param {object} comp - Comparison descriptor from compareHistoryRecords
 */
function renderCompareModalContent(comp) {
  if (typeof document === 'undefined' || !comp) return;

  const recA = comp.recordA;
  const recB = comp.recordB;

  // 1. Header Card A
  const methA = document.getElementById('compare-a-method');
  const nameA = document.getElementById('compare-a-name');
  const urlA = document.getElementById('compare-a-url');
  const statusA = document.getElementById('compare-a-status');
  const timeA = document.getElementById('compare-a-time');
  const dateA = document.getElementById('compare-a-date');
  const truncA = document.getElementById('compare-a-trunc');

  if (methA) {
    const m = (recA.method || 'GET').toLowerCase();
    methA.className = `method-badge method-${m}`;
    methA.textContent = recA.method || 'GET';
  }
  if (nameA) nameA.textContent = recA.request_name || 'Untitled Request';
  if (urlA) urlA.textContent = recA.url || '-';
  if (statusA) {
    const s = recA.response_status;
    let sClass = 'status-pill-danger';
    if (s >= 200 && s < 300) sClass = 'status-pill-success';
    else if (s >= 300 && s < 400) sClass = 'status-pill-info';
    else if (s >= 400 && s < 500) sClass = 'status-pill-warning';
    statusA.className = `status-pill ${sClass}`;
    statusA.textContent = s ? `${s} ${s === 200 ? 'OK' : ''}`.trim() : (recA.error_message ? 'Error' : 'No Response');
  }
  if (timeA) timeA.textContent = recA.response_time !== null && recA.response_time !== undefined ? `${recA.response_time}ms` : '-';
  if (dateA) {
    try { dateA.textContent = new Date(recA.created_at).toLocaleTimeString(); } catch { dateA.textContent = '-'; }
  }
  if (truncA) {
    truncA.classList.toggle('hidden', !recA.response_body_truncated);
  }

  // 2. Header Card B
  const methB = document.getElementById('compare-b-method');
  const nameB = document.getElementById('compare-b-name');
  const urlB = document.getElementById('compare-b-url');
  const statusB = document.getElementById('compare-b-status');
  const timeB = document.getElementById('compare-b-time');
  const dateB = document.getElementById('compare-b-date');
  const truncB = document.getElementById('compare-b-trunc');

  if (methB) {
    const m = (recB.method || 'GET').toLowerCase();
    methB.className = `method-badge method-${m}`;
    methB.textContent = recB.method || 'GET';
  }
  if (nameB) nameB.textContent = recB.request_name || 'Untitled Request';
  if (urlB) urlB.textContent = recB.url || '-';
  if (statusB) {
    const s = recB.response_status;
    let sClass = 'status-pill-danger';
    if (s >= 200 && s < 300) sClass = 'status-pill-success';
    else if (s >= 300 && s < 400) sClass = 'status-pill-info';
    else if (s >= 400 && s < 500) sClass = 'status-pill-warning';
    statusB.className = `status-pill ${sClass}`;
    statusB.textContent = s ? `${s} ${s === 200 ? 'OK' : ''}`.trim() : (recB.error_message ? 'Error' : 'No Response');
  }
  if (timeB) timeB.textContent = recB.response_time !== null && recB.response_time !== undefined ? `${recB.response_time}ms` : '-';
  if (dateB) {
    try { dateB.textContent = new Date(recB.created_at).toLocaleTimeString(); } catch { dateB.textContent = '-'; }
  }
  if (truncB) {
    truncB.classList.toggle('hidden', !recB.response_body_truncated);
  }

  // 3. Global Delta Summary Banner
  const summaryEl = document.getElementById('compare-delta-summary');
  if (summaryEl) {
    summaryEl.innerHTML = '';

    // Status delta pill
    const pStatus = document.createElement('span');
    if (comp.statusDiff.identical) {
      pStatus.className = 'delta-pill delta-pill-same';
      pStatus.textContent = `Status: ${comp.statusDiff.statusA || 'None'} (Identical)`;
    } else {
      pStatus.className = 'delta-pill delta-pill-diff';
      pStatus.textContent = `Status: ${comp.statusDiff.statusA || 'None'} vs ${comp.statusDiff.statusB || 'None'}`;
    }
    summaryEl.appendChild(pStatus);

    // Latency delta pill
    if (comp.timeDiff.timeA !== null && comp.timeDiff.timeB !== null) {
      const pTime = document.createElement('span');
      const d = comp.timeDiff.delta;
      const sign = d > 0 ? `+${d}ms` : `${d}ms`;
      pTime.className = d === 0 ? 'delta-pill delta-pill-same' : 'delta-pill delta-pill-diff';
      pTime.textContent = `Latency: ${comp.timeDiff.timeA}ms vs ${comp.timeDiff.timeB}ms (Δ ${sign})`;
      summaryEl.appendChild(pTime);
    }

    // Headers delta pill
    const pHeaders = document.createElement('span');
    if (comp.headerDiff.identical) {
      pHeaders.className = 'delta-pill delta-pill-same';
      pHeaders.textContent = `Headers: All Identical (${comp.headerDiff.rows.length})`;
    } else {
      const diffCount = comp.headerDiff.rows.filter(r => r.status !== 'same').length;
      pHeaders.className = 'delta-pill delta-pill-diff';
      pHeaders.textContent = `Headers: ${diffCount} difference${diffCount === 1 ? '' : 's'}`;
    }
    summaryEl.appendChild(pHeaders);

    // Body delta pill
    const pBody = document.createElement('span');
    if (comp.truncation.hasTruncation) {
      pBody.className = 'delta-pill delta-pill-trunc';
      pBody.textContent = 'Body: Truncated (64 KB limit)';
    } else if (comp.bodyDiff.identical) {
      pBody.className = 'delta-pill delta-pill-same';
      pBody.textContent = 'Body: Identical';
    } else {
      pBody.className = 'delta-pill delta-pill-diff';
      pBody.textContent = 'Body: Differences Found';
    }
    summaryEl.appendChild(pBody);
  }

  // 4. Response Bodies Panel
  const bannerIdentical = document.getElementById('compare-body-identical-banner');
  const bannerTrunc = document.getElementById('compare-truncation-warning');
  const typeBadgeA = document.getElementById('compare-a-body-type');
  const typeBadgeB = document.getElementById('compare-b-body-type');
  const viewPaneA = document.getElementById('compare-a-body-view');
  const viewPaneB = document.getElementById('compare-b-body-view');

  if (bannerIdentical) {
    bannerIdentical.classList.toggle('hidden', !comp.bodyDiff.identical);
  }
  if (bannerTrunc) {
    bannerTrunc.classList.toggle('hidden', !comp.truncation.hasTruncation);
  }
  if (typeBadgeA) typeBadgeA.textContent = comp.bodyDiff.typeA.toUpperCase();
  if (typeBadgeB) typeBadgeB.textContent = comp.bodyDiff.typeB.toUpperCase();

  if (viewPaneA && viewPaneB) {
    viewPaneA.innerHTML = '';
    viewPaneB.innerHTML = '';

    let lineCounterA = 1;
    let lineCounterB = 1;

    comp.bodyDiff.lines.forEach((line) => {
      // Line for Pane A
      const elA = document.createElement('div');
      elA.className = `diff-line diff-${line.type === 'removed' ? 'removed' : (line.type === 'same' ? 'same' : 'empty')}`;

      const numA = document.createElement('span');
      numA.className = 'diff-line-num';
      const textA = document.createElement('span');
      textA.className = 'diff-line-text';

      if (line.textA !== null) {
        numA.textContent = String(lineCounterA++);
        textA.textContent = line.textA;
      } else {
        numA.textContent = '';
        textA.textContent = '';
      }
      elA.appendChild(numA);
      elA.appendChild(textA);
      viewPaneA.appendChild(elA);

      // Line for Pane B
      const elB = document.createElement('div');
      elB.className = `diff-line diff-${line.type === 'added' ? 'added' : (line.type === 'same' ? 'same' : 'empty')}`;

      const numB = document.createElement('span');
      numB.className = 'diff-line-num';
      const textB = document.createElement('span');
      textB.className = 'diff-line-text';

      if (line.textB !== null) {
        numB.textContent = String(lineCounterB++);
        textB.textContent = line.textB;
      } else {
        numB.textContent = '';
        textB.textContent = '';
      }
      elB.appendChild(numB);
      elB.appendChild(textB);
      viewPaneB.appendChild(elB);
    });
  }

  // 5. Response Headers Table
  const bannerHeadersIdentical = document.getElementById('compare-headers-identical-banner');
  const tbodyHeaders = document.getElementById('compare-headers-tbody');

  if (bannerHeadersIdentical) {
    bannerHeadersIdentical.classList.toggle('hidden', !comp.headerDiff.identical);
  }

  if (tbodyHeaders) {
    tbodyHeaders.innerHTML = '';
    comp.headerDiff.rows.forEach((row) => {
      const tr = document.createElement('tr');

      const tdKey = document.createElement('td');
      tdKey.className = 'font-mono';
      tdKey.textContent = row.key;

      const tdValA = document.createElement('td');
      tdValA.className = 'font-mono';
      if (row.valueA !== null) {
        tdValA.textContent = row.valueA;
      } else {
        tdValA.innerHTML = '<span class="diff-tag-missing">Not present</span>';
      }

      const tdValB = document.createElement('td');
      tdValB.className = 'font-mono';
      if (row.valueB !== null) {
        tdValB.textContent = row.valueB;
      } else {
        tdValB.innerHTML = '<span class="diff-tag-missing">Not present</span>';
      }

      const tdStatus = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = `diff-status-pill status-${row.status}`;
      if (row.status === 'same') pill.textContent = 'Identical';
      else if (row.status === 'modified') pill.textContent = 'Modified';
      else if (row.status === 'only_a') pill.textContent = 'Record A only';
      else if (row.status === 'only_b') pill.textContent = 'Record B only';
      tdStatus.appendChild(pill);

      tr.appendChild(tdKey);
      tr.appendChild(tdValA);
      tr.appendChild(tdValB);
      tr.appendChild(tdStatus);
      tbodyHeaders.appendChild(tr);
    });
  }
}

/**
 * Binds comparison event listeners in the DOM.
 */
function initHistoryComparison() {
  if (typeof document === 'undefined') return;

  const btnLaunch = document.getElementById('btn-history-compare-launch');
  if (btnLaunch) {
    btnLaunch.addEventListener('click', openHistoryCompareModal);
  }

  const btnClear = document.getElementById('btn-history-compare-clear');
  if (btnClear) {
    btnClear.addEventListener('click', clearHistoryCompareSelection);
  }

  const btnModalClose = document.getElementById('btn-compare-modal-close');
  if (btnModalClose) {
    btnModalClose.addEventListener('click', closeHistoryCompareModal);
  }

  const btnModalCloseFooter = document.getElementById('btn-compare-modal-close-footer');
  if (btnModalCloseFooter) {
    btnModalCloseFooter.addEventListener('click', closeHistoryCompareModal);
  }

  const btnModalClear = document.getElementById('btn-compare-modal-clear');
  if (btnModalClear) {
    btnModalClear.addEventListener('click', () => {
      clearHistoryCompareSelection();
      closeHistoryCompareModal();
    });
  }

  const tabBody = document.getElementById('tab-btn-compare-body');
  if (tabBody) {
    tabBody.addEventListener('click', () => switchCompareSection('compare-section-body'));
  }

  const tabHeaders = document.getElementById('tab-btn-compare-headers');
  if (tabHeaders) {
    tabHeaders.addEventListener('click', () => switchCompareSection('compare-section-headers'));
  }

  const btnDetailCompare = document.getElementById('btn-hist-detail-compare');
  if (btnDetailCompare) {
    btnDetailCompare.addEventListener('click', () => {
      if (selectedHistoryRecord && selectedHistoryRecord.id) {
        toggleHistoryCompareSelection(selectedHistoryRecord.id);
        const isSel = selectedHistoryCompareIds.includes(selectedHistoryRecord.id);
        btnDetailCompare.textContent = isSel ? 'Remove from Compare' : 'Select for Compare';
      }
    });
  }
}

/* ==========================================================================
   12. Assertion Builder & Automated Testing Management (Day 14)
   ========================================================================== */

/**
 * Supported operators per assertion category for the UI builder
 */
const ASSERTION_OPERATORS_BY_TYPE = {
  status_code: [
    { value: 'equals', label: 'equals (==)' },
    { value: 'not_equals', label: 'not equals (!=)' },
    { value: 'less_than', label: 'less than (<)' },
    { value: 'greater_than', label: 'greater than (>)' },
    { value: 'less_than_or_equal', label: 'less than or equal (<=)' },
    { value: 'greater_than_or_equal', label: 'greater than or equal (>=)' }
  ],
  response_time: [
    { value: 'less_than', label: 'less than (<)' },
    { value: 'greater_than', label: 'greater than (>)' },
    { value: 'less_than_or_equal', label: 'less than or equal (<=)' },
    { value: 'greater_than_or_equal', label: 'greater than or equal (>=)' },
    { value: 'equals', label: 'equals (==)' },
    { value: 'not_equals', label: 'not equals (!=)' }
  ],
  header: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'exists', label: 'exists' },
    { value: 'not_exists', label: 'does not exist' }
  ],
  body_text: [
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' }
  ],
  json_path: [
    { value: 'equals', label: 'equals (==)' },
    { value: 'not_equals', label: 'not equals (!=)' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'greater_than', label: 'greater than (>)' },
    { value: 'less_than', label: 'less than (<)' },
    { value: 'less_than_or_equal', label: 'less than or equal (<=)' },
    { value: 'greater_than_or_equal', label: 'greater than or equal (>=)' },
    { value: 'exists', label: 'exists' },
    { value: 'not_exists', label: 'does not exist' }
  ]
};

const SENSITIVE_OPERATORS_ONLY = [
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: 'does not exist' }
];

const SENSITIVE_HEADERS_SET = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'auth-token',
  'session-token',
  'x-session-id'
]);

const PURE_SECRET_PROP_REGEX = /(^|\.)(password|passwd|pwd|private_key|secret|client_secret|secret_key|api_key|apikey|token|access_token|refresh_token)$/i;
const PROTOTYPE_POLLUTION_REGEX = /(__proto__|prototype|constructor)/i;
const RFC_7230_HEADER_REGEX = /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/;
const JSON_PATH_SYNTAX_REGEX = /^([a-zA-Z_$][a-zA-Z0-9_$]*|\[\d+\])(\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[\d+\])*$/;

/**
 * Checks if a header name is considered sensitive credentials.
 */
function isSensitiveHeaderName(headerName) {
  if (!headerName || typeof headerName !== 'string') return false;
  return SENSITIVE_HEADERS_SET.has(headerName.trim().toLowerCase());
}

/**
 * Checks if a property or JSON path targets sensitive credentials.
 */
function isSensitivePropertyName(propPath) {
  if (!propPath || typeof propPath !== 'string') return false;
  const normalized = propPath.replace(/\[\s*['"]?([a-zA-Z0-9_$]+)['"]?\s*\]/g, '.$1');
  return PURE_SECRET_PROP_REGEX.test(normalized);
}

/**
 * Generates a unique, collision-resistant assertion ID.
 */
function generateAssertionId(type = 'assertion') {
  const safeType = String(type || 'assertion').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `assert_${safeType}_${timestamp}_${randomPart}`;
}

/**
 * Updates the Tests tab badge counter with the count of active/enabled assertions.
 */
function updateTestsCount() {
  if (typeof document === 'undefined') return;
  const countBadge = document.getElementById('tests-count');
  if (!countBadge) return;
  const count = (activeRequest.assertions || []).filter(a => a && a.enabled !== false).length;
  countBadge.textContent = count.toString();
}

/**
 * Safely parses the raw expected value string according to type and operator.
 */
function parseExpectedValue(type, rawVal, explicitType = 'auto', operator = '') {
  if (operator === 'exists' || operator === 'not_exists') {
    return null;
  }

  if (type === 'status_code') {
    const parsed = parseInt(rawVal, 10);
    return isNaN(parsed) ? rawVal : parsed;
  }

  if (type === 'response_time') {
    const num = Number(rawVal);
    return isNaN(num) ? rawVal : num;
  }

  const str = typeof rawVal === 'string' ? rawVal : String(rawVal != null ? rawVal : '');
  const trimmed = str.trim();

  if (explicitType === 'number') {
    const num = Number(trimmed);
    return isNaN(num) ? trimmed : num;
  }
  if (explicitType === 'boolean') {
    return trimmed.toLowerCase() === 'true';
  }
  if (explicitType === 'null') {
    return null;
  }
  if (explicitType === 'string') {
    return trimmed;
  }

  // Auto-detect mode
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'null') return null;

  // Check if quoted string e.g. "foo" or 'foo'
  if ((trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)) {
    return trimmed.slice(1, -1);
  }

  // Check if pure numeric
  if (trimmed !== '' && !isNaN(Number(trimmed)) && !trimmed.includes(' ') && !/^\s*0[0-9]+/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

/**
 * Formats assertion category for display badge
 */
function formatAssertionTypeBadge(type) {
  switch (type) {
    case 'status_code': return 'Status Code';
    case 'response_time': return 'Latency';
    case 'header': return 'Header';
    case 'body_text': return 'Body Text';
    case 'json_path': return 'JSON Path';
    default: return type || 'Assertion';
  }
}

/**
 * Formats expected value for display in the table
 */
function formatExpectedForDisplay(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return `"${val}"`;
  return String(val);
}

/**
 * Updates builder form fields dynamically based on the selected assertion category
 */
function updateAssertionFormForType() {
  if (typeof document === 'undefined') return;

  const typeSelect = document.getElementById('assert-type-select');
  const propGroup = document.getElementById('assert-property-group');
  const propLabel = document.getElementById('assert-property-label');
  const propInput = document.getElementById('assert-property-input');
  const propHint = document.getElementById('assert-property-hint');
  const opSelect = document.getElementById('assert-operator-select');
  const expectedGroup = document.getElementById('assert-expected-group');
  const expectedInput = document.getElementById('assert-expected-input');
  const expectedHint = document.getElementById('assert-expected-hint');
  const expectedType = document.getElementById('assert-expected-type');

  if (!typeSelect || !opSelect) return;

  const type = typeSelect.value || 'status_code';

  // 1. Property group visibility & labels
  if (type === 'header') {
    if (propGroup) propGroup.classList.remove('hidden');
    if (propLabel) propLabel.textContent = 'Header Name';
    if (propInput) propInput.placeholder = 'e.g. Content-Type';
    if (propHint) propHint.textContent = 'Standard HTTP response header name';
    if (expectedHint) expectedHint.textContent = 'Expected header value (case-insensitive substring/equality)';
    if (expectedType) expectedType.classList.add('hidden');
  } else if (type === 'json_path') {
    if (propGroup) propGroup.classList.remove('hidden');
    if (propLabel) propLabel.textContent = 'JSON Path';
    if (propInput) propInput.placeholder = 'e.g. user.id or items[0].name';
    if (propHint) propHint.textContent = 'Dot and bracket notation (e.g. status, user.name, items[0].id)';
    if (expectedHint) expectedHint.textContent = 'Expected value (string, number, boolean, null)';
    if (expectedType) expectedType.classList.remove('hidden');
  } else {
    if (propGroup) propGroup.classList.add('hidden');
    if (propInput) propInput.value = '';
    if (expectedType) expectedType.classList.add('hidden');

    if (type === 'status_code') {
      if (expectedHint) expectedHint.textContent = 'Expected HTTP status code (100–599)';
      if (expectedInput && !expectedInput.value) expectedInput.value = '200';
    } else if (type === 'response_time') {
      if (expectedHint) expectedHint.textContent = 'Maximum latency in milliseconds (ms)';
      if (expectedInput && !expectedInput.value) expectedInput.value = '500';
    } else if (type === 'body_text') {
      if (expectedHint) expectedHint.textContent = 'Text to search in raw response body';
    }
  }

  // 2. Check sensitivity to populate operator select
  checkPropertySensitivity();
}

/**
 * Checks sensitivity for the current property input and updates operator options accordingly
 */
function checkPropertySensitivity() {
  if (typeof document === 'undefined') return;

  const typeSelect = document.getElementById('assert-type-select');
  const propInput = document.getElementById('assert-property-input');
  const opSelect = document.getElementById('assert-operator-select');
  const securityNotice = document.getElementById('assert-security-notice');
  const noticeText = document.getElementById('assert-security-notice-text');

  if (!typeSelect || !opSelect) return;

  const type = typeSelect.value;
  const propVal = propInput ? propInput.value.trim() : '';

  let isSensitive = false;
  if (type === 'header' && isSensitiveHeaderName(propVal)) {
    isSensitive = true;
    if (noticeText) {
      noticeText.textContent = `Header "${propVal}" contains sensitive authentication credentials. Matching is restricted to existence checks.`;
    }
  } else if (type === 'json_path' && isSensitivePropertyName(propVal)) {
    isSensitive = true;
    if (noticeText) {
      noticeText.textContent = `Property "${propVal}" targets sensitive credentials. Matching is restricted to existence checks.`;
    }
  }

  const currentOp = opSelect.value;
  opSelect.innerHTML = '';

  const opList = isSensitive
    ? SENSITIVE_OPERATORS_ONLY
    : (ASSERTION_OPERATORS_BY_TYPE[type] || []);

  opList.forEach((op) => {
    const opt = document.createElement('option');
    opt.value = op.value;
    opt.textContent = op.label;
    opSelect.appendChild(opt);
  });

  if (opList.some((op) => op.value === currentOp)) {
    opSelect.value = currentOp;
  } else if (opList.length > 0) {
    opSelect.value = opList[0].value;
  }

  if (securityNotice) {
    if (isSensitive) {
      securityNotice.classList.remove('hidden');
    } else {
      securityNotice.classList.add('hidden');
    }
  }

  checkExpectedVisibility();
}

/**
 * Toggles visibility of the expected value input group based on current operator and sensitivity
 */
function checkExpectedVisibility() {
  if (typeof document === 'undefined') return;

  const opSelect = document.getElementById('assert-operator-select');
  const expectedGroup = document.getElementById('assert-expected-group');

  if (!opSelect || !expectedGroup) return;

  const op = opSelect.value;
  if (op === 'exists' || op === 'not_exists') {
    expectedGroup.classList.add('hidden');
  } else {
    expectedGroup.classList.remove('hidden');
  }
}

/**
 * Displays validation error inside the assertion builder card
 */
function showAssertionBuilderError(message) {
  if (typeof document === 'undefined') return;
  const errorEl = document.getElementById('assertion-builder-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

/**
 * Hides validation error in the builder card
 */
function hideAssertionBuilderError() {
  if (typeof document === 'undefined') return;
  const errorEl = document.getElementById('assertion-builder-error');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
}

/**
 * Opens the Assertion Builder form card in either create or edit mode
 */
function openAssertionBuilder(assertionId = null) {
  if (typeof document === 'undefined') return;

  hideAssertionBuilderError();

  const card = document.getElementById('assertion-builder-card');
  const title = document.getElementById('assertion-builder-title');
  const editIdInput = document.getElementById('assert-edit-id');
  const typeSelect = document.getElementById('assert-type-select');
  const propInput = document.getElementById('assert-property-input');
  const opSelect = document.getElementById('assert-operator-select');
  const expectedInput = document.getElementById('assert-expected-input');
  const expectedType = document.getElementById('assert-expected-type');

  if (!card) return;

  if (assertionId) {
    // Edit mode
    const assertion = (activeRequest.assertions || []).find((a) => a && a.id === assertionId);
    if (!assertion) return;

    if (title) title.textContent = 'Edit Assertion';
    if (editIdInput) editIdInput.value = assertion.id;
    if (typeSelect) typeSelect.value = assertion.type;

    updateAssertionFormForType();

    if (propInput) propInput.value = assertion.property || '';
    checkPropertySensitivity();

    if (opSelect) opSelect.value = assertion.operator;
    checkExpectedVisibility();

    if (expectedInput) {
      if (assertion.expected === null || assertion.expected === undefined) {
        expectedInput.value = '';
      } else {
        expectedInput.value = String(assertion.expected);
      }
    }

    if (expectedType) {
      if (typeof assertion.expected === 'number') expectedType.value = 'number';
      else if (typeof assertion.expected === 'boolean') expectedType.value = 'boolean';
      else if (assertion.expected === null) expectedType.value = 'null';
      else if (typeof assertion.expected === 'string') expectedType.value = 'string';
      else expectedType.value = 'auto';
    }
  } else {
    // Create new mode
    if (title) title.textContent = 'New Assertion';
    if (editIdInput) editIdInput.value = '';
    if (typeSelect) typeSelect.value = 'status_code';

    updateAssertionFormForType();

    if (propInput) propInput.value = '';
    if (opSelect) opSelect.value = 'equals';
    if (expectedInput) expectedInput.value = '200';
    if (expectedType) expectedType.value = 'auto';

    checkExpectedVisibility();
  }

  card.classList.remove('hidden');

  // Focus appropriate input
  if (propInput && !propInput.parentElement.classList.contains('hidden')) {
    propInput.focus();
  } else if (expectedInput && !expectedInput.parentElement.classList.contains('hidden')) {
    expectedInput.focus();
  }
}

/**
 * Closes the Assertion Builder form card and resets fields
 */
function closeAssertionBuilder() {
  if (typeof document === 'undefined') return;

  hideAssertionBuilderError();

  const card = document.getElementById('assertion-builder-card');
  if (card) card.classList.add('hidden');

  const editIdInput = document.getElementById('assert-edit-id');
  if (editIdInput) editIdInput.value = '';

  const propInput = document.getElementById('assert-property-input');
  if (propInput) propInput.value = '';

  const expectedInput = document.getElementById('assert-expected-input');
  if (expectedInput) expectedInput.value = '';
}

/**
 * Validates builder inputs and persists assertion to activeRequest.assertions
 */
function saveAssertionFromForm() {
  if (typeof document === 'undefined') return;

  hideAssertionBuilderError();

  const editIdInput = document.getElementById('assert-edit-id');
  const typeSelect = document.getElementById('assert-type-select');
  const propInput = document.getElementById('assert-property-input');
  const opSelect = document.getElementById('assert-operator-select');
  const expectedInput = document.getElementById('assert-expected-input');
  const expectedType = document.getElementById('assert-expected-type');

  if (!typeSelect || !opSelect) return;

  const editId = editIdInput ? editIdInput.value.trim() : '';
  const type = typeSelect.value;
  const property = propInput ? propInput.value.trim() : '';
  const operator = opSelect.value;
  const rawExpected = expectedInput ? expectedInput.value : '';
  const explicitType = expectedType ? expectedType.value : 'auto';

  // Ensure activeRequest.assertions array exists
  if (!Array.isArray(activeRequest.assertions)) {
    activeRequest.assertions = [];
  }

  // 1. Limit check
  if (!editId && activeRequest.assertions.length >= 50) {
    showAssertionBuilderError('Maximum of 50 assertions per request allowed.');
    return;
  }

  // 2. Validate category
  if (!ASSERTION_OPERATORS_BY_TYPE[type]) {
    showAssertionBuilderError('Invalid assertion category selected.');
    return;
  }

  // 3. Category-specific target property validation
  let targetProperty = null;
  if (type === 'header') {
    if (!property) {
      showAssertionBuilderError('Header name is required.');
      return;
    }
    if (PROTOTYPE_POLLUTION_REGEX.test(property)) {
      showAssertionBuilderError('Header name contains forbidden prototype property names.');
      return;
    }
    if (!RFC_7230_HEADER_REGEX.test(property)) {
      showAssertionBuilderError('Invalid header name. Must be a valid RFC 7230 token.');
      return;
    }
    targetProperty = property;

    if (isSensitiveHeaderName(property) && operator !== 'exists' && operator !== 'not_exists') {
      showAssertionBuilderError('Sensitive headers are restricted to exists and does not exist operators.');
      return;
    }
  } else if (type === 'json_path') {
    if (!property) {
      showAssertionBuilderError('JSON path is required.');
      return;
    }
    if (PROTOTYPE_POLLUTION_REGEX.test(property)) {
      showAssertionBuilderError('JSON path contains forbidden prototype properties (__proto__, prototype, constructor).');
      return;
    }
    if (!JSON_PATH_SYNTAX_REGEX.test(property)) {
      showAssertionBuilderError('Invalid JSON path syntax. Use dot notation (user.name) or bracket index (items[0]).');
      return;
    }
    targetProperty = property;

    if (isSensitivePropertyName(property) && operator !== 'exists' && operator !== 'not_exists') {
      showAssertionBuilderError('Sensitive properties are restricted to exists and does not exist operators.');
      return;
    }
  }

  // 4. Operator validation
  const allowedOps = (isSensitiveHeaderName(property) || isSensitivePropertyName(property))
    ? SENSITIVE_OPERATORS_ONLY.map(o => o.value)
    : (ASSERTION_OPERATORS_BY_TYPE[type] || []).map(o => o.value);

  if (!allowedOps.includes(operator)) {
    showAssertionBuilderError(`Operator "${operator}" is not supported for ${type}.`);
    return;
  }

  // 5. Expected value validation & parsing
  let finalExpected = null;
  if (operator === 'exists' || operator === 'not_exists') {
    finalExpected = null;
  } else {
    if (rawExpected.trim() === '' && explicitType !== 'string' && type !== 'body_text') {
      showAssertionBuilderError('Expected value is required.');
      return;
    }

    if (type === 'status_code') {
      const code = parseInt(rawExpected, 10);
      if (isNaN(code) || code < 100 || code > 599) {
        showAssertionBuilderError('Status code must be an integer between 100 and 599.');
        return;
      }
      finalExpected = code;
    } else if (type === 'response_time') {
      const latency = Number(rawExpected);
      if (isNaN(latency) || latency < 0) {
        showAssertionBuilderError('Response latency must be a non-negative number in milliseconds.');
        return;
      }
      finalExpected = latency;
    } else {
      // Forbidden script patterns check
      if (typeof rawExpected === 'string' &&
          (/\beval\s*\(/i.test(rawExpected) || /\bFunction\s*\(/i.test(rawExpected) || /<\s*script\b/i.test(rawExpected))) {
        showAssertionBuilderError('Forbidden script or dynamic code pattern detected in expected value.');
        return;
      }
      finalExpected = parseExpectedValue(type, rawExpected, explicitType, operator);
    }
  }

  // 6. Build assertion object
  const assertionData = {
    id: editId || generateAssertionId(type),
    type,
    property: targetProperty,
    operator,
    expected: finalExpected,
    enabled: true
  };

  // 7. Update state
  if (editId) {
    const existingIndex = activeRequest.assertions.findIndex((a) => a && a.id === editId);
    if (existingIndex !== -1) {
      assertionData.enabled = activeRequest.assertions[existingIndex].enabled !== false;
      activeRequest.assertions[existingIndex] = assertionData;
      showToast('Assertion updated', 'Saved changes to assertion definition.', 'success');
    } else {
      activeRequest.assertions.push(assertionData);
      showToast('Assertion added', 'Added new assertion definition.', 'success');
    }
  } else {
    activeRequest.assertions.push(assertionData);
    showToast('Assertion added', 'Added new assertion definition.', 'success');
  }

  // 8. Close builder & render
  closeAssertionBuilder();
  renderAssertions();
}

/**
 * Removes an assertion definition by its unique ID
 */
function deleteAssertion(assertionId) {
  if (!assertionId) return;
  activeRequest.assertions = (activeRequest.assertions || []).filter((a) => a && a.id !== assertionId);
  renderAssertions();
  showToast('Assertion deleted', 'Removed assertion from request configuration.', 'info');
}

/**
 * Toggles an assertion definition's enabled status
 */
function toggleAssertionEnabled(assertionId) {
  if (!assertionId) return;
  const assertion = (activeRequest.assertions || []).find((a) => a && a.id === assertionId);
  if (!assertion) return;

  assertion.enabled = !(assertion.enabled !== false);
  renderAssertions();
}

/**
 * Clears all assertions configured for the active request
 */
function clearAllAssertions() {
  if (!activeRequest.assertions || activeRequest.assertions.length === 0) return;

  const proceed = typeof confirm === 'function'
    ? confirm('Are you sure you want to remove all assertions from this request?')
    : true;

  if (proceed) {
    activeRequest.assertions = [];
    closeAssertionBuilder();
    renderAssertions();
    showToast('Assertions cleared', 'All assertions removed from active request.', 'info');
  }
}

/**
 * Renders the assertion list and empty state based on activeRequest.assertions state
 */
function renderAssertions() {
  if (typeof document === 'undefined') return;

  if (!Array.isArray(activeRequest.assertions)) {
    activeRequest.assertions = [];
  }

  updateTestsCount();

  const emptyState = document.getElementById('assertions-empty-state');
  const listContainer = document.getElementById('assertions-list-container');
  const btnClearAll = document.getElementById('btn-clear-all-assertions');
  const tbody = document.getElementById('assertions-tbody');

  if (!emptyState || !listContainer || !tbody) return;

  if (activeRequest.assertions.length === 0) {
    emptyState.classList.remove('hidden');
    listContainer.classList.add('hidden');
    if (btnClearAll) btnClearAll.classList.add('hidden');
    tbody.innerHTML = '';
    return;
  }

  emptyState.classList.add('hidden');
  listContainer.classList.remove('hidden');
  if (btnClearAll) btnClearAll.classList.remove('hidden');

  tbody.innerHTML = '';

  activeRequest.assertions.forEach((assertion) => {
    if (!assertion || !assertion.id) return;

    const tr = document.createElement('tr');
    tr.className = `assertion-row ${assertion.enabled === false ? 'assertion-row-disabled' : ''}`;
    tr.setAttribute('data-id', assertion.id);

    // 1. Checkbox for enabled state
    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const checkLabel = document.createElement('label');
    checkLabel.className = 'cell-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'assert-checkbox';
    checkbox.setAttribute('data-id', assertion.id);
    checkbox.checked = assertion.enabled !== false;
    checkbox.setAttribute('aria-label', `Toggle assertion ${assertion.id}`);
    checkLabel.appendChild(checkbox);
    tdCheck.appendChild(checkLabel);
    tr.appendChild(tdCheck);

    // 2. Category badge
    const tdType = document.createElement('td');
    tdType.className = 'col-assert-type';
    const badge = document.createElement('span');
    badge.className = `assert-badge assert-type-${assertion.type || 'status_code'}`;
    badge.textContent = formatAssertionTypeBadge(assertion.type);
    tdType.appendChild(badge);
    tr.appendChild(tdType);

    // 3. Target / Property
    const tdProp = document.createElement('td');
    tdProp.className = 'col-assert-prop';
    if (assertion.property) {
      const code = document.createElement('code');
      code.textContent = assertion.property;
      tdProp.appendChild(code);
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'text-muted';
      emptySpan.textContent = '—';
      tdProp.appendChild(emptySpan);
    }
    tr.appendChild(tdProp);

    // 4. Operator pill
    const tdOp = document.createElement('td');
    tdOp.className = 'col-assert-op';
    const opPill = document.createElement('span');
    opPill.className = 'assert-op-pill';
    opPill.textContent = assertion.operator || 'equals';
    tdOp.appendChild(opPill);
    tr.appendChild(tdOp);

    // 5. Expected value
    const tdVal = document.createElement('td');
    tdVal.className = 'col-assert-val';
    if (assertion.operator === 'exists' || assertion.operator === 'not_exists') {
      const notReq = document.createElement('span');
      notReq.className = 'text-muted';
      notReq.textContent = '(not required)';
      tdVal.appendChild(notReq);
    } else {
      const valCode = document.createElement('code');
      valCode.textContent = formatExpectedForDisplay(assertion.expected);
      tdVal.appendChild(valCode);
    }
    tr.appendChild(tdVal);

    // 6. Action buttons (Edit & Delete)
    const tdActions = document.createElement('td');
    tdActions.className = 'col-assert-actions';

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-icon btn-edit-assertion';
    btnEdit.setAttribute('data-id', assertion.id);
    btnEdit.setAttribute('title', 'Edit assertion');
    btnEdit.setAttribute('aria-label', `Edit assertion ${assertion.id}`);
    btnEdit.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn-icon btn-delete-assertion';
    btnDelete.setAttribute('data-id', assertion.id);
    btnDelete.setAttribute('title', 'Delete assertion');
    btnDelete.setAttribute('aria-label', `Delete assertion ${assertion.id}`);
    btnDelete.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;

    tdActions.appendChild(btnEdit);
    tdActions.appendChild(btnDelete);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

/**
 * Initializes DOM event listeners for the Assertion Builder UI
 */
function initAssertionBuilder() {
  if (typeof document === 'undefined') return;

  const btnOpen = document.getElementById('btn-open-assertion-builder');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => openAssertionBuilder());
  }

  const btnAddFirst = document.getElementById('btn-add-first-assertion');
  if (btnAddFirst) {
    btnAddFirst.addEventListener('click', () => openAssertionBuilder());
  }

  const btnClose = document.getElementById('btn-close-assertion-builder');
  if (btnClose) {
    btnClose.addEventListener('click', () => closeAssertionBuilder());
  }

  const btnCancel = document.getElementById('btn-cancel-assertion');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => closeAssertionBuilder());
  }

  const btnSave = document.getElementById('btn-save-assertion');
  if (btnSave) {
    btnSave.addEventListener('click', () => saveAssertionFromForm());
  }

  const btnClearAll = document.getElementById('btn-clear-all-assertions');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => clearAllAssertions());
  }

  const typeSelect = document.getElementById('assert-type-select');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => updateAssertionFormForType());
  }

  const propInput = document.getElementById('assert-property-input');
  if (propInput) {
    propInput.addEventListener('input', () => checkPropertySensitivity());
  }

  const opSelect = document.getElementById('assert-operator-select');
  if (opSelect) {
    opSelect.addEventListener('change', () => checkExpectedVisibility());
  }

  const expectedInput = document.getElementById('assert-expected-input');
  [propInput, expectedInput].forEach((inputEl) => {
    if (inputEl) {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveAssertionFromForm();
        }
      });
    }
  });

  const tbody = document.getElementById('assertions-tbody');
  if (tbody) {
    tbody.addEventListener('change', (e) => {
      const checkbox = e.target.closest('.assert-checkbox');
      if (checkbox) {
        const id = checkbox.getAttribute('data-id');
        if (id) toggleAssertionEnabled(id);
      }
    });

    tbody.addEventListener('click', (e) => {
      const btnEdit = e.target.closest('.btn-edit-assertion');
      if (btnEdit) {
        const id = btnEdit.getAttribute('data-id');
        if (id) openAssertionBuilder(id);
        return;
      }

      const btnDel = e.target.closest('.btn-delete-assertion');
      if (btnDel) {
        const id = btnDel.getAttribute('data-id');
        if (id) deleteAssertion(id);
      }
    });
  }
}

/**
 * Safely resolves the Assertion Evaluation Engine in both browser and CommonJS contexts.
 */
function getAssertionEngine() {
  if (typeof window !== 'undefined' && window.assertionEngine) {
    return window.assertionEngine;
  }
  if (typeof evaluateAssertions === 'function') {
    return { evaluateAssertions };
  }
  try {
    return require('./assertionEngine');
  } catch {
    return null;
  }
}

/**
 * Safely evaluates active request assertions against the HTTP response
 * and orchestrates rendering to the Test Results panel.
 *
 * @param {object} responseData - Upstream response object
 * @returns {object|null} Evaluated test results summary or null
 */
function evaluateAndRenderTestResults(responseData) {
  if (typeof document === 'undefined') return null;

  const assertions = activeRequest.assertions || [];
  const enabledAssertions = assertions.filter((a) => a && a.enabled !== false);

  const emptyState = document.getElementById('res-tests-empty-state');
  const emptyDesc = document.getElementById('res-tests-empty-desc');
  const contentEl = document.getElementById('res-tests-content');
  const countBadge = document.getElementById('res-tests-count');
  const metricItem = document.getElementById('res-tests-metric');
  const metricBadge = document.getElementById('res-tests-badge');

  // Case 1: No assertions configured at all
  if (assertions.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (emptyDesc) {
      emptyDesc.textContent = 'No test assertions configured. Add assertions in the Tests tab to automate validation for this request.';
    }
    if (contentEl) {
      contentEl.classList.add('hidden');
      contentEl.innerHTML = '';
    }
    if (countBadge) countBadge.classList.add('hidden');
    if (metricItem) metricItem.classList.add('hidden');
    activeResponse.test_results = null;
    return null;
  }

  // Case 2: All assertions are disabled
  if (enabledAssertions.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (emptyDesc) {
      emptyDesc.textContent = 'All configured assertions are currently disabled. Enable them in the Tests tab to evaluate response data.';
    }
    if (contentEl) {
      contentEl.classList.add('hidden');
      contentEl.innerHTML = '';
    }
    if (countBadge) countBadge.classList.add('hidden');
    if (metricItem) metricItem.classList.add('hidden');
    activeResponse.test_results = null;
    return null;
  }

  // Case 3: Evaluate enabled assertions against response
  let testResults = responseData && responseData.test_results ? responseData.test_results : null;

  if (!testResults) {
    const engine = getAssertionEngine();
    if (engine && typeof engine.evaluateAssertions === 'function') {
      testResults = engine.evaluateAssertions(assertions, responseData);
    }
  }

  activeResponse.test_results = testResults;

  if (testResults && testResults.summary) {
    const { total, passed, status } = testResults.summary;

    // Render results into panel
    renderTestResultsToUI(testResults, 'res-tests-content');

    // Update Response Inspector Tab Counter
    if (countBadge) {
      countBadge.textContent = `${passed}/${total}`;
      countBadge.className = `tab-counter test-results-counter ${status === 'passed' ? 'badge-success' : 'badge-danger'}`;
      countBadge.classList.remove('hidden');
    }

    // Update Response Metrics Badge
    if (metricItem && metricBadge) {
      metricBadge.textContent = `${passed}/${total} Passed`;
      metricBadge.className = `metric-badge ${status === 'passed' ? 'metric-badge-success' : 'metric-badge-danger'}`;
      metricItem.classList.remove('hidden');
    }
  }

  return testResults;
}

/**
 * Renders structured test results cards and summary metrics into target container.
 *
 * @param {object} testResults - Output from assertion evaluation engine
 * @param {string} targetContainerId - Target DOM element ID
 */
function renderTestResultsToUI(testResults, targetContainerId = 'res-tests-content') {
  if (typeof document === 'undefined') return;
  if (!testResults || !testResults.summary) return;

  const container = document.getElementById(targetContainerId);
  if (!container) return;

  if (targetContainerId === 'res-tests-content') {
    const emptyState = document.getElementById('res-tests-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    container.classList.remove('hidden');
  }

  const { total, passed, failed, status } = testResults.summary;
  const isAllPassed = status === 'passed';

  let html = `
    <div class="test-results-summary-bar ${isAllPassed ? 'summary-status-passed' : 'summary-status-failed'}">
      <div class="summary-status-group">
        <div class="summary-status-icon ${isAllPassed ? 'icon-pass' : 'icon-fail'}">
          ${isAllPassed
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'}
        </div>
        <span class="summary-status-title">
          ${isAllPassed ? 'All Assertions Passed' : `Assertions Failed (${passed} of ${total} passed)`}
        </span>
      </div>
      <div class="summary-metrics-group">
        <span class="metric-chip chip-total">Total: ${total}</span>
        <span class="metric-chip chip-passed">Passed: ${passed}</span>
        <span class="metric-chip chip-failed">Failed: ${failed}</span>
      </div>
    </div>
    <div class="test-results-list">
  `;

  (testResults.results || []).forEach((r) => {
    if (!r) return;
    const isPass = r.passed === true;
    const isExistenceOp = r.operator === 'exists' || r.operator === 'not_exists';

    html += `
      <div class="test-result-card ${isPass ? 'passed' : 'failed'}">
        <div class="test-result-card-header">
          <div class="result-header-left">
            <span class="result-status-badge ${isPass ? 'status-pass' : 'status-fail'}">
              ${isPass ? 'PASS' : 'FAIL'}
            </span>
            <span class="assert-badge assert-type-${escapeHtml(r.type || 'status_code')}">
              ${escapeHtml(formatAssertionTypeBadge(r.type))}
            </span>
            ${r.property ? `<code class="result-target-code">${escapeHtml(r.property)}</code>` : ''}
            <span class="assert-op-pill">${escapeHtml(r.operator || 'equals')}</span>
          </div>
        </div>
        <div class="test-result-card-body">
          <div class="result-compare-row">
            ${isExistenceOp
              ? '<div class="result-val-item"><span class="result-val-label">Condition:</span> <span class="text-muted">' + escapeHtml(r.operator) + '</span></div>'
              : '<div class="result-val-item"><span class="result-val-label">Expected:</span> <code class="result-val-code">' + escapeHtml(formatExpectedForDisplay(r.expected)) + '</code></div>'}
            ${!isExistenceOp && r.actual !== undefined
              ? '<div class="result-val-item"><span class="result-val-label">Actual:</span> <code class="result-val-code ' + (isPass ? '' : 'actual-fail') + '">' + escapeHtml(formatExpectedForDisplay(r.actual)) + '</code></div>'
              : ''}
          </div>
          <div class="result-diagnostic-msg ${isPass ? '' : 'has-error'}">
            ${escapeHtml(r.message || (isPass ? 'Assertion satisfied' : 'Assertion failed'))}
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Displays request execution errors (transport/network failure) in Test Results panel.
 *
 * @param {string} message - Descriptive error message
 * @param {string} code - Machine-readable error code
 */
function renderTestResultsError(message, code = 'ERROR') {
  if (typeof document === 'undefined') return;

  const contentEl = document.getElementById('res-tests-content');
  const emptyState = document.getElementById('res-tests-empty-state');
  const emptyDesc = document.getElementById('res-tests-empty-desc');
  const countBadge = document.getElementById('res-tests-count');
  const metricItem = document.getElementById('res-tests-metric');

  if (contentEl) {
    contentEl.classList.add('hidden');
    contentEl.innerHTML = '';
  }
  if (emptyState) emptyState.classList.remove('hidden');
  if (emptyDesc) {
    emptyDesc.innerHTML = `<strong>Request Execution Error:</strong> Assertions were not evaluated because no HTTP response was received (${escapeHtml(code)}: ${escapeHtml(message)}).`;
  }
  if (countBadge) countBadge.classList.add('hidden');
  if (metricItem) metricItem.classList.add('hidden');
  if (activeResponse) activeResponse.test_results = null;
}

/**
 * Resets the Test Results viewer to clean initial state.
 */
function resetTestResultsViewer() {
  if (typeof document === 'undefined') return;

  const contentEl = document.getElementById('res-tests-content');
  const emptyState = document.getElementById('res-tests-empty-state');
  const emptyDesc = document.getElementById('res-tests-empty-desc');
  const countBadge = document.getElementById('res-tests-count');
  const metricItem = document.getElementById('res-tests-metric');

  if (contentEl) {
    contentEl.classList.add('hidden');
    contentEl.innerHTML = '';
  }
  if (emptyState) emptyState.classList.remove('hidden');
  if (emptyDesc) {
    emptyDesc.textContent = 'No test results available. Configure assertions in the Tests tab and send a request to view automated evaluation results.';
  }
  if (countBadge) countBadge.classList.add('hidden');
  if (metricItem) metricItem.classList.add('hidden');
  if (activeResponse) activeResponse.test_results = null;
}

/**
 * Renders historical test results into History Detail Modal without re-evaluating assertions.
 *
 * @param {object} rec - Historical record from database
 */
function renderHistoricalTestResults(rec) {
  if (typeof document === 'undefined') return;

  const testItem = document.getElementById('hist-detail-test-item');
  const testPill = document.getElementById('hist-detail-test-pill');
  const testCounter = document.getElementById('hist-detail-tests-counter');
  const testContent = document.getElementById('hist-detail-tests-content');

  let testResults = null;
  if (rec && rec.test_results) {
    if (typeof rec.test_results === 'string') {
      try {
        testResults = JSON.parse(rec.test_results);
      } catch {
        testResults = null;
      }
    } else if (typeof rec.test_results === 'object') {
      testResults = rec.test_results;
    }
  }

  if (testResults && testResults.summary && testResults.summary.total > 0) {
    const { total, passed, status } = testResults.summary;
    if (testItem) testItem.classList.remove('hidden');
    if (testPill) {
      testPill.textContent = `${passed}/${total} Passed`;
      testPill.className = `status-pill ${status === 'passed' ? 'status-pill-success' : 'status-pill-danger'}`;
    }
    if (testCounter) {
      testCounter.textContent = `${passed}/${total}`;
      testCounter.classList.remove('hidden');
    }
    if (testContent) {
      renderTestResultsToUI(testResults, 'hist-detail-tests-content');
    }
  } else {
    if (testItem) testItem.classList.add('hidden');
    if (testCounter) testCounter.classList.add('hidden');
    if (testContent) {
      testContent.innerHTML = '<div class="response-empty-state"><p class="empty-state-desc">No test assertions were recorded for this historical execution.</p></div>';
    }
  }
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
    getCachedSavedRequests: () => cachedSavedRequests,
    resolveEntireRequest,
    fetchEnvironments,
    fetchEnvironmentDetails,
    setActiveEnvironment,
    updateQuickView,
    openEnvironmentManagerModal,
    closeEnvironmentManagerModal,
    saveEnvironmentFromModal,
    activateEnvironmentFromModal,
    deleteEnvironmentFromModal,
    addVariableRowToModal,
    getCachedEnvironments: () => cachedEnvironments,
    setDynamicEnvironments: (envs) => { cachedEnvironments = envs; },
    fetchHistoryList,
    renderHistoryList,
    openHistoryDetailModal,
    closeHistoryDetailModal,
    loadHistoryIntoWorkspace,
    deleteHistoryItem,
    confirmClearAllHistory,
    openClearHistoryModal,
    closeClearHistoryModal,
    getHistoryCurrentPage: () => historyCurrentPage,
    getCachedHistoryItems: () => cachedHistoryItems,
    getSelectedHistoryRecord: () => selectedHistoryRecord,
    initSidebar,
    initHistoryManagement,
    getSelectedHistoryCompareIds,
    setSelectedHistoryCompareIds,
    toggleHistoryCompareSelection,
    clearHistoryCompareSelection,
    updateHistoryCompareBar,
    compareResponseHeaders,
    computeLineDiff,
    formatBodyForComparison,
    compareHistoryRecords,
    openHistoryCompareModal,
    closeHistoryCompareModal,
    switchCompareSection,
    renderCompareModalContent,
    initHistoryComparison,
    initAssertionBuilder,
    renderAssertions,
    updateTestsCount,
    openAssertionBuilder,
    closeAssertionBuilder,
    updateAssertionFormForType,
    checkPropertySensitivity,
    checkExpectedVisibility,
    saveAssertionFromForm,
    deleteAssertion,
    toggleAssertionEnabled,
    clearAllAssertions,
    parseExpectedValue,
    generateAssertionId,
    isSensitiveHeaderName,
    isSensitivePropertyName,
    getActiveRequestAssertions: () => activeRequest.assertions,
    setActiveRequestAssertions: (arr) => { activeRequest.assertions = Array.isArray(arr) ? arr : []; },
    getAssertionEngine,
    evaluateAndRenderTestResults,
    renderTestResultsToUI,
    renderTestResultsError,
    resetTestResultsViewer,
    renderHistoricalTestResults,
    downloadFile,
    parseAndValidateImportJson,
    openImportCollectionModal,
    closeImportCollectionModal,
    resetImportModalState,
    switchImportTab,
    updateImportPreview,
    initCollectionImport,
    exportCollectionToJson,
    openApiDocsModal,
    closeApiDocsModal,
    switchDocsTab,
    initApiDocsModal,
    getActiveImportPayload: () => activeImportPayload,
    setActiveImportPayload: (val) => { activeImportPayload = val; },
    getActiveDocsCollection: () => activeDocsCollection,
    getCachedMarkdownDoc: () => cachedMarkdownDoc,
    getCachedHtmlDoc: () => cachedHtmlDoc
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
    getCachedSavedRequests: () => cachedSavedRequests,
    resolveEntireRequest,
    fetchEnvironments,
    fetchEnvironmentDetails,
    setActiveEnvironment,
    updateQuickView,
    openEnvironmentManagerModal,
    closeEnvironmentManagerModal,
    saveEnvironmentFromModal,
    activateEnvironmentFromModal,
    deleteEnvironmentFromModal,
    addVariableRowToModal,
    getCachedEnvironments: () => cachedEnvironments,
    setDynamicEnvironments: (envs) => { cachedEnvironments = envs; },
    fetchHistoryList,
    renderHistoryList,
    openHistoryDetailModal,
    closeHistoryDetailModal,
    loadHistoryIntoWorkspace,
    deleteHistoryItem,
    confirmClearAllHistory,
    openClearHistoryModal,
    closeClearHistoryModal,
    getHistoryCurrentPage: () => historyCurrentPage,
    getCachedHistoryItems: () => cachedHistoryItems,
    getSelectedHistoryRecord: () => selectedHistoryRecord,
    initSidebar,
    initHistoryManagement,
    getSelectedHistoryCompareIds,
    setSelectedHistoryCompareIds,
    toggleHistoryCompareSelection,
    clearHistoryCompareSelection,
    updateHistoryCompareBar,
    compareResponseHeaders,
    computeLineDiff,
    formatBodyForComparison,
    compareHistoryRecords,
    openHistoryCompareModal,
    closeHistoryCompareModal,
    switchCompareSection,
    renderCompareModalContent,
    initHistoryComparison,
    initAssertionBuilder,
    renderAssertions,
    updateTestsCount,
    openAssertionBuilder,
    closeAssertionBuilder,
    updateAssertionFormForType,
    checkPropertySensitivity,
    checkExpectedVisibility,
    saveAssertionFromForm,
    deleteAssertion,
    toggleAssertionEnabled,
    clearAllAssertions,
    parseExpectedValue,
    generateAssertionId,
    isSensitiveHeaderName,
    isSensitivePropertyName,
    getActiveRequestAssertions: () => activeRequest.assertions,
    setActiveRequestAssertions: (arr) => { activeRequest.assertions = Array.isArray(arr) ? arr : []; },
    getAssertionEngine,
    evaluateAndRenderTestResults,
    renderTestResultsToUI,
    renderTestResultsError,
    resetTestResultsViewer,
    renderHistoricalTestResults,
    downloadFile,
    parseAndValidateImportJson,
    openImportCollectionModal,
    closeImportCollectionModal,
    resetImportModalState,
    switchImportTab,
    updateImportPreview,
    initCollectionImport,
    exportCollectionToJson,
    openApiDocsModal,
    closeApiDocsModal,
    switchDocsTab,
    initApiDocsModal,
    getActiveImportPayload: () => activeImportPayload,
    setActiveImportPayload: (val) => { activeImportPayload = val; },
    getActiveDocsCollection: () => activeDocsCollection,
    getCachedMarkdownDoc: () => cachedMarkdownDoc,
    getCachedHtmlDoc: () => cachedHtmlDoc
  };
}

