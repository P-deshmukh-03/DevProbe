/**
 * DevProbe — Client-Side Assertion Evaluation Engine
 * Day 14: Automated Response Assertion & Testing Engine (Step 3)
 *
 * Safely evaluates declarative assertion definitions against actual HTTP responses.
 * Implements strict security guards:
 * - Declarative only: strictly forbids eval(), Function(), and dynamic execution.
 * - Prototype-pollution protection: blocks __proto__, prototype, and constructor.
 * - Credential protection: redacts sensitive headers, auth tokens, cookies, and secret properties.
 * - Fault isolation: single malformed assertion never aborts evaluation of remaining assertions.
 * - Response immutability: never mutates the underlying response object.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS environment (for automated tests)
    module.exports = factory();
  } else {
    // Browser environment
    const engine = factory();
    root.assertionEngine = engine;
    root.evaluateAssertions = engine.evaluateAssertions;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // =========================================================================
  // Constants and Security Definitions
  // =========================================================================

  const REDACTED_PLACEHOLDER = '[REDACTED]';

  /**
   * HTTP headers containing sensitive authentication, authorization, or session secrets.
   */
  const SENSITIVE_HEADERS = new Set([
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

  /**
   * Secret property names in JSON paths that must have values redacted.
   */
  const PURE_SECRET_PROPERTY_PATTERN = /(^|\.)(password|passwd|pwd|private_key|client_secret|secret_key|api_key|apikey|access_token|refresh_token)$/i;

  /**
   * Sensitive key names for recursive object redaction.
   */
  const SENSITIVE_KEY_PATTERN = /^(authorization|bearer|token|access_token|refresh_token|api_key|apikey|key|secret|client_secret|password|passwd|pwd|private_key|session_token|sessionid|cookie|set-cookie)$/i;

  /**
   * Cookie / session token assignment strings in values.
   */
  const COOKIE_SESSION_ASSIGNMENT_PATTERN = /^(session|sessionid|connect\.sid|token|access_token|refresh_token|api_key|jwt|sid)=/i;

  /**
   * Prototype-pollution detection pattern.
   */
  const PROTOTYPE_POLLUTION_REGEX = /(__proto__|prototype|constructor)/i;

  const FORBIDDEN_PROPERTY_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  /**
   * Canonical assertion types.
   */
  const CANONICAL_TYPES = {
    status: 'status_code',
    status_code: 'status_code',
    response_time: 'response_time',
    header: 'header',
    body_text: 'body_text',
    json_path: 'json_path'
  };

  // =========================================================================
  // Security & Sanitization Helpers
  // =========================================================================

  /**
   * Sanitizes diagnostic messages to ensure live credentials and tokens are redacted.
   *
   * @param {string} msg
   * @returns {string}
   */
  function sanitizeMessage(msg) {
    if (typeof msg !== 'string') return String(msg || '');
    return msg
      .replace(/Bearer\s+[a-zA-Z0-9_\-.~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/enc:v1:[a-f0-9:]+/gi, '[REDACTED]')
      .replace(/(password|passwd|pwd|token|secret|client_secret|api_key|session|sessionid)\s*[:=]\s*['"]?[^'",\s]+['"]?/gi, '$1=[REDACTED]');
  }

  /**
   * Redacts sensitive strings and object structures.
   *
   * @param {any} val
   * @returns {any}
   */
  function redactValue(val) {
    if (val === null || val === undefined) return val;

    if (typeof val === 'string') {
      if (
        /^Bearer\s+/i.test(val) ||
        val.startsWith('enc:v1:') ||
        val === '••••••••' ||
        COOKIE_SESSION_ASSIGNMENT_PATTERN.test(val)
      ) {
        return REDACTED_PLACEHOLDER;
      }
      if (/Bearer\s+[a-zA-Z0-9_\-.~+/]+=*/i.test(val)) {
        return val.replace(/Bearer\s+[a-zA-Z0-9_\-.~+/]+=*/gi, 'Bearer [REDACTED]');
      }
      return val;
    }

    if (Array.isArray(val)) {
      return val.map(redactValue);
    }

    if (typeof val === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(val)) {
        if (SENSITIVE_KEY_PATTERN.test(k)) {
          clean[k] = REDACTED_PLACEHOLDER;
        } else {
          clean[k] = redactValue(v);
        }
      }
      return clean;
    }

    return val;
  }

  // =========================================================================
  // JSON Path Parsing & Traversal (No eval, No Function)
  // =========================================================================

  /**
   * Parses and validates a JSON path string into an array of traversal segments.
   * Supports dot notation and array index brackets: data.users[0].name -> ['data', 'users', 0, 'name']
   *
   * @param {string} pathStr
   * @returns {{ valid: boolean, error?: string, segments: Array<string|number> }}
   */
  function parseJsonPath(pathStr) {
    if (typeof pathStr !== 'string' || !pathStr.trim()) {
      return { valid: false, error: 'JSON path must be a non-empty string', segments: [] };
    }

    let p = pathStr.trim();

    // Strip optional root prefix
    if (p.startsWith('$.')) {
      p = p.slice(2);
    } else if (p.startsWith('$[')) {
      p = p.slice(1);
    } else if (p === '$') {
      return { valid: true, segments: [] };
    }

    if (!p) {
      return { valid: false, error: 'JSON path cannot be empty after prefix normalization', segments: [] };
    }

    // Prototype pollution pattern guard
    if (PROTOTYPE_POLLUTION_REGEX.test(p)) {
      return { valid: false, error: 'Prototype pollution properties (__proto__, prototype, constructor) are forbidden in JSON paths', segments: [] };
    }

    // Verify allowed path syntax
    const validPattern = /^([a-zA-Z_$][a-zA-Z0-9_$]*|\[\d+\])(\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[\d+\])*$/;
    if (!validPattern.test(p)) {
      return { valid: false, error: `Invalid JSON path syntax: '${pathStr}'. Use dot notation (user.name) and bracket indices (items[0])`, segments: [] };
    }

    const segments = [];
    const tokenRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)|\[(\d+)\]/g;
    let match;

    while ((match = tokenRegex.exec(p)) !== null) {
      if (match[1] !== undefined) {
        const prop = match[1];
        if (FORBIDDEN_PROPERTY_KEYS.has(prop)) {
          return { valid: false, error: 'Forbidden property in path', segments: [] };
        }
        segments.push(prop);
      } else if (match[2] !== undefined) {
        segments.push(parseInt(match[2], 10));
      }
    }

    return { valid: true, segments };
  }

  /**
   * Resolves a JSON path against an object or array.
   * Explicitly distinguishes missing properties from null properties.
   *
   * @param {any} rootObj
   * @param {Array<string|number>} segments
   * @returns {{ exists: boolean, value: any }}
   */
  function resolveJsonPath(rootObj, segments) {
    if (segments.length === 0) {
      return { exists: rootObj !== undefined, value: rootObj };
    }

    let current = rootObj;

    for (let i = 0; i < segments.length; i++) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return { exists: false, value: undefined };
      }

      const seg = segments[i];

      // Safe prototype guard
      if (typeof seg === 'string' && FORBIDDEN_PROPERTY_KEYS.has(seg)) {
        return { exists: false, value: undefined };
      }

      if (typeof seg === 'number') {
        // Array index
        if (!Array.isArray(current)) {
          return { exists: false, value: undefined };
        }
        if (seg < 0 || seg >= current.length) {
          return { exists: false, value: undefined };
        }
        current = current[seg];
      } else {
        // Object property
        if (!Object.prototype.hasOwnProperty.call(current, seg)) {
          return { exists: false, value: undefined };
        }
        current = current[seg];
      }
    }

    return { exists: true, value: current };
  }

  /**
   * Extracts parsed JSON data from a response object without mutating the original.
   *
   * @param {object} response
   * @returns {{ ok: boolean, error?: string, json: any }}
   */
  function extractParsedJson(response) {
    if (!response || typeof response !== 'object') {
      return { ok: false, error: 'No response object provided', json: null };
    }

    if (response.body !== null && typeof response.body === 'object') {
      return { ok: true, json: response.body };
    }

    const raw = typeof response.rawText === 'string'
      ? response.rawText
      : (typeof response.body === 'string' ? response.body : null);

    if (raw === null || raw === undefined || raw.trim() === '') {
      return { ok: false, error: 'Response body is empty', json: null };
    }

    try {
      const parsed = JSON.parse(raw);
      return { ok: true, json: parsed };
    } catch (parseErr) {
      return { ok: false, error: `Invalid JSON response body: ${parseErr.message}`, json: null };
    }
  }

  /**
   * Safely extracts body text representation from a response.
   *
   * @param {object} response
   * @returns {string}
   */
  function extractBodyText(response) {
    if (!response || typeof response !== 'object') return '';
    if (typeof response.rawText === 'string') return response.rawText;
    if (response.body === null || response.body === undefined) return '';
    if (typeof response.body === 'string') return response.body;
    if (typeof response.body === 'object') {
      try {
        return JSON.stringify(response.body);
      } catch {
        return '';
      }
    }
    return String(response.body);
  }

  /**
   * Case-insensitive header lookup.
   *
   * @param {object} headers
   * @param {string} name
   * @returns {{ found: boolean, key: string|null, value: any }}
   */
  function findHeaderCaseInsensitive(headers, name) {
    if (!headers || typeof headers !== 'object') {
      return { found: false, key: null, value: undefined };
    }
    const target = String(name || '').toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === target) {
        return { found: true, key: k, value: v };
      }
    }
    return { found: false, key: null, value: undefined };
  }

  // =========================================================================
  // Type Evaluators
  // =========================================================================

  /**
   * Evaluates a status_code assertion against an HTTP response.
   */
  function evaluateStatusCode(assertion, response) {
    const rawActual = response ? response.status : null;
    const actual = typeof rawActual === 'number' && Number.isInteger(rawActual) ? rawActual : null;
    const expected = Number(assertion.expected);
    const op = (assertion.operator || '').toLowerCase();

    if (actual === null) {
      return {
        passed: false,
        actual: null,
        expected,
        message: 'No HTTP status code available in response'
      };
    }

    let passed = false;
    let message = '';

    switch (op) {
      case 'equals':
        passed = actual === expected;
        message = passed
          ? `Status code is ${actual}`
          : `Expected status code ${expected}, but got ${actual}`;
        break;

      case 'not_equals':
        passed = actual !== expected;
        message = passed
          ? `Status code ${actual} is not equal to ${expected}`
          : `Expected status code not to equal ${expected}, but got ${actual}`;
        break;

      case 'less_than':
        passed = actual < expected;
        message = passed
          ? `Status code ${actual} is less than ${expected}`
          : `Expected status code to be less than ${expected}, but got ${actual}`;
        break;

      case 'greater_than':
        passed = actual > expected;
        message = passed
          ? `Status code ${actual} is greater than ${expected}`
          : `Expected status code to be greater than ${expected}, but got ${actual}`;
        break;

      case 'less_than_or_equal':
        passed = actual <= expected;
        message = passed
          ? `Status code ${actual} is less than or equal to ${expected}`
          : `Expected status code to be less than or equal to ${expected}, but got ${actual}`;
        break;

      case 'greater_than_or_equal':
        passed = actual >= expected;
        message = passed
          ? `Status code ${actual} is greater than or equal to ${expected}`
          : `Expected status code to be greater than or equal to ${expected}, but got ${actual}`;
        break;

      default:
        passed = false;
        message = `Unsupported status_code operator: '${op}'`;
    }

    return { passed, actual, expected, message };
  }

  /**
   * Evaluates a response_time assertion against response duration.
   */
  function evaluateResponseTime(assertion, response) {
    const rawTime = response
      ? (response.timeMs !== undefined ? response.timeMs : response.time)
      : null;
    const actual = typeof rawTime === 'number' && Number.isFinite(rawTime) ? rawTime : null;
    const expected = Number(assertion.expected);
    const op = (assertion.operator || '').toLowerCase();

    if (actual === null) {
      return {
        passed: false,
        actual: null,
        expected,
        message: 'No response time available in response'
      };
    }

    let passed = false;
    let message = '';

    switch (op) {
      case 'less_than':
        passed = actual < expected;
        message = passed
          ? `Response time ${actual}ms is less than ${expected}ms`
          : `Expected response time to be less than ${expected}ms, but got ${actual}ms`;
        break;

      case 'greater_than':
        passed = actual > expected;
        message = passed
          ? `Response time ${actual}ms is greater than ${expected}ms`
          : `Expected response time to be greater than ${expected}ms, but got ${actual}ms`;
        break;

      case 'less_than_or_equal':
        passed = actual <= expected;
        message = passed
          ? `Response time ${actual}ms is less than or equal to ${expected}ms`
          : `Expected response time to be less than or equal to ${expected}ms, but got ${actual}ms`;
        break;

      case 'greater_than_or_equal':
        passed = actual >= expected;
        message = passed
          ? `Response time ${actual}ms is greater than or equal to ${expected}ms`
          : `Expected response time to be greater than or equal to ${expected}ms, but got ${actual}ms`;
        break;

      case 'equals':
        passed = actual === expected;
        message = passed
          ? `Response time is ${actual}ms`
          : `Expected response time to equal ${expected}ms, but got ${actual}ms`;
        break;

      case 'not_equals':
        passed = actual !== expected;
        message = passed
          ? `Response time ${actual}ms is not equal to ${expected}ms`
          : `Expected response time not to equal ${expected}ms, but got ${actual}ms`;
        break;

      default:
        passed = false;
        message = `Unsupported response_time operator: '${op}'`;
    }

    return { passed, actual, expected, message };
  }

  /**
   * Evaluates a response header assertion with case-insensitive matching and credential protection.
   */
  function evaluateHeader(assertion, response) {
    const prop = assertion.property || '';
    const lowerProp = prop.toLowerCase();
    const isSensitive = SENSITIVE_HEADERS.has(lowerProp);
    const op = (assertion.operator || '').toLowerCase();
    const headers = response ? response.headers : null;

    const { found, value } = findHeaderCaseInsensitive(headers, prop);

    // Redaction for sensitive headers: always [REDACTED] for both actual and expected
    const safeActual = isSensitive
      ? REDACTED_PLACEHOLDER
      : (found ? String(value) : null);
    const safeExpected = isSensitive
      ? REDACTED_PLACEHOLDER
      : (op === 'exists' || op === 'not_exists' ? null : assertion.expected);

    let passed = false;
    let message = '';

    if (op === 'exists') {
      passed = found;
      message = passed
        ? `Header '${prop}' exists in response`
        : `Expected header '${prop}' to exist, but it was not found`;
      return {
        passed,
        actual: safeActual,
        expected: safeExpected,
        message: sanitizeMessage(message)
      };
    }

    if (op === 'not_exists') {
      passed = !found;
      message = passed
        ? `Header '${prop}' does not exist in response as expected`
        : `Expected header '${prop}' not to exist, but it was found`;
      return {
        passed,
        actual: safeActual,
        expected: safeExpected,
        message: sanitizeMessage(message)
      };
    }

    // Value comparisons require the header to be present
    if (!found) {
      return {
        passed: false,
        actual: safeActual,
        expected: safeExpected,
        message: sanitizeMessage(`Header '${prop}' was not found in response`)
      };
    }

    const strActual = String(value);
    const strExpected = String(assertion.expected !== undefined ? assertion.expected : '');

    switch (op) {
      case 'equals':
        passed = strActual === strExpected;
        message = passed
          ? `Header '${prop}' matches expected value`
          : `Expected header '${prop}' to equal expected value`;
        break;

      case 'not_equals':
        passed = strActual !== strExpected;
        message = passed
          ? `Header '${prop}' does not equal value`
          : `Expected header '${prop}' not to equal value`;
        break;

      case 'contains':
        passed = strActual.includes(strExpected);
        message = passed
          ? `Header '${prop}' contains expected value`
          : `Expected header '${prop}' to contain expected value`;
        break;

      case 'not_contains':
        passed = !strActual.includes(strExpected);
        message = passed
          ? `Header '${prop}' does not contain expected value`
          : `Expected header '${prop}' not to contain expected value`;
        break;

      default:
        passed = false;
        message = `Unsupported header operator: '${op}'`;
    }

    return {
      passed,
      actual: safeActual,
      expected: safeExpected,
      message: sanitizeMessage(message)
    };
  }

  /**
   * Evaluates a body_text assertion against response body text.
   */
  function evaluateBodyText(assertion, response) {
    const actualText = extractBodyText(response);
    const expected = String(assertion.expected !== undefined ? assertion.expected : '');
    const op = (assertion.operator || '').toLowerCase();

    let passed = false;
    let message = '';

    const actualDisplay = actualText.length > 500
      ? actualText.slice(0, 500) + '... [truncated]'
      : actualText;

    switch (op) {
      case 'contains':
        passed = actualText.includes(expected);
        message = passed
          ? `Response body contains expected text`
          : `Expected response body to contain '${expected}'`;
        break;

      case 'not_contains':
        passed = !actualText.includes(expected);
        message = passed
          ? `Response body does not contain '${expected}'`
          : `Expected response body not to contain '${expected}', but it was found`;
        break;

      case 'equals':
        passed = actualText === expected;
        message = passed
          ? `Response body matches expected text`
          : `Expected response body to equal '${expected}'`;
        break;

      case 'not_equals':
        passed = actualText !== expected;
        message = passed
          ? `Response body does not equal '${expected}'`
          : `Expected response body not to equal '${expected}', but got identical text`;
        break;

      default:
        passed = false;
        message = `Unsupported body_text operator: '${op}'`;
    }

    return {
      passed,
      actual: sanitizeMessage(actualDisplay),
      expected: sanitizeMessage(expected),
      message: sanitizeMessage(message)
    };
  }

  /**
   * Evaluates a JSON path assertion against parsed JSON response.
   */
  function evaluateJsonPath(assertion, response) {
    const prop = assertion.property || '';
    const op = (assertion.operator || '').toLowerCase();

    // Prototype pollution pattern guard
    if (PROTOTYPE_POLLUTION_REGEX.test(prop)) {
      return {
        passed: false,
        actual: null,
        expected: assertion.expected,
        message: `Prototype pollution properties are forbidden in JSON paths: '${prop}'`
      };
    }

    const isSensitive = PURE_SECRET_PROPERTY_PATTERN.test(prop);

    const pathResult = parseJsonPath(prop);
    if (!pathResult.valid) {
      return {
        passed: false,
        actual: null,
        expected: assertion.expected,
        message: `Malformed JSON path: ${pathResult.error}`
      };
    }

    const jsonResult = extractParsedJson(response);
    if (!jsonResult.ok) {
      return {
        passed: false,
        actual: null,
        expected: assertion.expected,
        message: jsonResult.error
      };
    }

    const { exists, value } = resolveJsonPath(jsonResult.json, pathResult.segments);

    const safeActual = isSensitive
      ? REDACTED_PLACEHOLDER
      : (exists ? redactValue(value) : undefined);
    const safeExpected = isSensitive
      ? REDACTED_PLACEHOLDER
      : (op === 'exists' || op === 'not_exists' ? null : redactValue(assertion.expected));

    let passed = false;
    let message = '';

    if (op === 'exists') {
      passed = exists;
      message = passed
        ? `Property '${prop}' exists in JSON response`
        : `Expected property '${prop}' to exist in JSON response, but it was not found`;
      return {
        passed,
        actual: safeActual,
        expected: safeExpected,
        message: sanitizeMessage(message)
      };
    }

    if (op === 'not_exists') {
      passed = !exists;
      message = passed
        ? `Property '${prop}' does not exist in JSON response as expected`
        : `Expected property '${prop}' not to exist in JSON response, but it was found`;
      return {
        passed,
        actual: safeActual,
        expected: safeExpected,
        message: sanitizeMessage(message)
      };
    }

    // All value-matching operators require property to exist
    if (!exists) {
      return {
        passed: false,
        actual: undefined,
        expected: safeExpected,
        message: `Property '${prop}' not found in JSON response`
      };
    }

    switch (op) {
      case 'equals':
        if (typeof value === 'object' && value !== null) {
          try {
            passed = JSON.stringify(value) === JSON.stringify(assertion.expected);
          } catch {
            passed = false;
          }
        } else {
          passed = value === assertion.expected;
        }
        message = passed
          ? `Property '${prop}' equals expected value`
          : `Expected property '${prop}' to equal ${JSON.stringify(safeExpected)}, but got ${JSON.stringify(safeActual)}`;
        break;

      case 'not_equals':
        if (typeof value === 'object' && value !== null) {
          try {
            passed = JSON.stringify(value) !== JSON.stringify(assertion.expected);
          } catch {
            passed = true;
          }
        } else {
          passed = value !== assertion.expected;
        }
        message = passed
          ? `Property '${prop}' does not equal ${JSON.stringify(safeExpected)}`
          : `Expected property '${prop}' not to equal ${JSON.stringify(safeExpected)}, but got identical value`;
        break;

      case 'contains':
        if (typeof value === 'string') {
          passed = value.includes(String(assertion.expected));
        } else if (Array.isArray(value)) {
          passed = value.some((item) => {
            if (typeof item === 'object' && item !== null) {
              return JSON.stringify(item) === JSON.stringify(assertion.expected);
            }
            return item === assertion.expected;
          });
        } else {
          passed = false;
        }
        message = passed
          ? `Property '${prop}' contains expected value`
          : `Expected property '${prop}' to contain ${JSON.stringify(safeExpected)}, but got ${JSON.stringify(safeActual)}`;
        break;

      case 'not_contains':
        if (typeof value === 'string') {
          passed = !value.includes(String(assertion.expected));
        } else if (Array.isArray(value)) {
          passed = !value.some((item) => {
            if (typeof item === 'object' && item !== null) {
              return JSON.stringify(item) === JSON.stringify(assertion.expected);
            }
            return item === assertion.expected;
          });
        } else {
          passed = true;
        }
        message = passed
          ? `Property '${prop}' does not contain ${JSON.stringify(safeExpected)}`
          : `Expected property '${prop}' not to contain ${JSON.stringify(safeExpected)}, but it was found`;
        break;

      case 'less_than':
        passed = typeof value === 'number' && Number.isFinite(value) && value < Number(assertion.expected);
        message = passed
          ? `Property '${prop}' (${value}) is less than ${assertion.expected}`
          : `Expected property '${prop}' to be less than ${assertion.expected}, but got ${value}`;
        break;

      case 'greater_than':
        passed = typeof value === 'number' && Number.isFinite(value) && value > Number(assertion.expected);
        message = passed
          ? `Property '${prop}' (${value}) is greater than ${assertion.expected}`
          : `Expected property '${prop}' to be greater than ${assertion.expected}, but got ${value}`;
        break;

      case 'less_than_or_equal':
        passed = typeof value === 'number' && Number.isFinite(value) && value <= Number(assertion.expected);
        message = passed
          ? `Property '${prop}' (${value}) is less than or equal to ${assertion.expected}`
          : `Expected property '${prop}' to be less than or equal to ${assertion.expected}, but got ${value}`;
        break;

      case 'greater_than_or_equal':
        passed = typeof value === 'number' && Number.isFinite(value) && value >= Number(assertion.expected);
        message = passed
          ? `Property '${prop}' (${value}) is greater than or equal to ${assertion.expected}`
          : `Expected property '${prop}' to be greater than or equal to ${assertion.expected}, but got ${value}`;
        break;

      default:
        passed = false;
        message = `Unsupported json_path operator: '${op}'`;
    }

    return {
      passed,
      actual: safeActual,
      expected: safeExpected,
      message: sanitizeMessage(message)
    };
  }

  // =========================================================================
  // Master Evaluation Function
  // =========================================================================

  /**
   * Central evaluation engine.
   * Evaluates an array of declarative assertion definitions against an actual HTTP response.
   *
   * @param {Array<object>|null|undefined} assertions - Candidate assertions list
   * @param {object|null|undefined} response - HTTP response object
   * @returns {{ summary: { total: number, passed: number, failed: number, status: string }, results: Array<object> }}
   */
  function evaluateAssertions(assertions, response) {
    // Check if assertions argument is null, undefined, or empty
    if (assertions === null || assertions === undefined) {
      return {
        summary: { total: 0, passed: 0, failed: 0, status: 'unevaluated' },
        results: []
      };
    }

    if (!Array.isArray(assertions)) {
      return {
        summary: { total: 0, passed: 0, failed: 0, status: 'error' },
        results: []
      };
    }

    if (assertions.length === 0) {
      return {
        summary: { total: 0, passed: 0, failed: 0, status: 'unevaluated' },
        results: []
      };
    }

    const results = [];
    let passedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < assertions.length; i++) {
      const item = assertions[i];

      // Safe handling of malformed assertion entries
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        failedCount++;
        results.push({
          id: `malformed_${i}`,
          type: 'unknown',
          property: null,
          operator: 'unknown',
          expected: null,
          actual: null,
          passed: false,
          message: `Malformed assertion definition at index ${i}: item must be an object`
        });
        continue;
      }

      // Disabled assertions are skipped and do not count toward total, passed, or failed
      if (item.enabled === false) {
        continue;
      }

      const id = typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : `assert_${i}`;

      const rawType = item.type ? String(item.type).trim().toLowerCase() : '';
      const canonicalType = CANONICAL_TYPES[rawType] || rawType;
      const property = item.property !== undefined && item.property !== null ? String(item.property).trim() : null;
      const operator = item.operator ? String(item.operator).trim().toLowerCase() : '';

      try {
        let evalResult;

        switch (canonicalType) {
          case 'status_code':
            evalResult = evaluateStatusCode(item, response);
            break;

          case 'response_time':
            evalResult = evaluateResponseTime(item, response);
            break;

          case 'header':
            evalResult = evaluateHeader(item, response);
            break;

          case 'body_text':
            evalResult = evaluateBodyText(item, response);
            break;

          case 'json_path':
            evalResult = evaluateJsonPath(item, response);
            break;

          default:
            evalResult = {
              passed: false,
              actual: null,
              expected: item.expected !== undefined ? item.expected : null,
              message: `Unknown or unsupported assertion type: '${item.type}'`
            };
        }

        if (evalResult.passed) {
          passedCount++;
        } else {
          failedCount++;
        }

        results.push({
          id,
          type: canonicalType,
          property,
          operator,
          expected: evalResult.expected,
          actual: evalResult.actual,
          passed: evalResult.passed,
          message: evalResult.message
        });

      } catch (err) {
        // Guarantee isolation: an uncaught exception in one assertion never crashes evaluation of others
        failedCount++;
        results.push({
          id,
          type: canonicalType || 'unknown',
          property,
          operator,
          expected: item.expected !== undefined ? item.expected : null,
          actual: null,
          passed: false,
          message: `Evaluation error: ${err.message}`
        });
      }
    }

    const totalEvaluated = passedCount + failedCount;

    let overallStatus = 'unevaluated';
    if (totalEvaluated > 0) {
      overallStatus = failedCount === 0 ? 'passed' : 'failed';
    }

    return {
      summary: {
        total: totalEvaluated,
        passed: passedCount,
        failed: failedCount,
        status: overallStatus
      },
      results
    };
  }

  // Export engine methods
  return {
    evaluateAssertions,
    evaluateStatusCode,
    evaluateResponseTime,
    evaluateHeader,
    evaluateBodyText,
    evaluateJsonPath,
    parseJsonPath,
    resolveJsonPath,
    extractParsedJson,
    extractBodyText,
    findHeaderCaseInsensitive,
    redactValue,
    sanitizeMessage,
    SENSITIVE_HEADERS,
    PURE_SECRET_PROPERTY_PATTERN
  };
});

