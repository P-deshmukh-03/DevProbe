/**
 * DevProbe — Centralized Assertion & Test Results Service
 * Day 14: Automated Response Assertion & Testing Engine
 *
 * Provides centralized validation, normalization, and credential sanitization
 * for assertion definitions and evaluation test results.
 */

const { AppError } = require('../middleware/errorHandler');
const { SENSITIVE_HEADERS } = require('../config/security');

/**
 * Architectural limits for assertions
 */
const MAX_ASSERTIONS_PER_REQUEST = 50;
const MAX_ID_LENGTH = 100;
const MAX_PROPERTY_LENGTH = 256;
const MAX_STRING_EXPECTED_LENGTH = 16384;
const MAX_JSON_PATH_DEPTH = 20;

/**
 * Standard placeholder for redacted sensitive credentials
 */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Supported assertion categories
 */
const SUPPORTED_ASSERTION_TYPES = new Set([
  'status_code',
  'response_time',
  'header',
  'body_text',
  'json_path'
]);

/**
 * Type aliases normalized to canonical internal type
 */
const TYPE_ALIASES = {
  status: 'status_code'
};

/**
 * Supported operators per assertion category
 */
const OPERATORS_BY_TYPE = {
  status_code: new Set([
    'equals',
    'not_equals',
    'less_than',
    'greater_than',
    'less_than_or_equal',
    'greater_than_or_equal'
  ]),
  response_time: new Set([
    'less_than',
    'greater_than',
    'less_than_or_equal',
    'greater_than_or_equal',
    'equals',
    'not_equals'
  ]),
  header: new Set([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'exists',
    'not_exists'
  ]),
  body_text: new Set([
    'contains',
    'not_contains',
    'equals',
    'not_equals'
  ]),
  json_path: new Set([
    'equals',
    'not_equals',
    'exists',
    'not_exists',
    'contains',
    'not_contains',
    'less_than',
    'greater_than',
    'less_than_or_equal',
    'greater_than_or_equal'
  ])
};

/**
 * RFC 7230 token pattern for HTTP header field names
 */
const RFC_7230_HEADER_PATTERN = /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/;

/**
 * JSON path syntax validation pattern (dot notation + array index brackets)
 */
const JSON_PATH_REGEX = /^([a-zA-Z_$][a-zA-Z0-9_$]*|\[\d+\])(\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[\d+\])*$/;

/**
 * Prototype pollution pattern
 */
const PROTOTYPE_POLLUTION_PATTERN = /(__proto__|prototype|constructor)/i;

/**
 * Forbidden code injection patterns in assertion fields
 */
const CODE_INJECTION_PATTERNS = [
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bprocess\s*\.\s*(exit|env|mainModule|binding|cwd|kill)/i,
  /\brequire\s*\(/i,
  /<\s*script\b[^>]*>/i,
  /javascript\s*:/i
];

/**
 * Sensitive keys for credential redaction in test results
 */
const SENSITIVE_KEY_PATTERN = /^(authorization|bearer|token|access_token|refresh_token|api_key|apikey|key|secret|client_secret|password|passwd|pwd|private_key|session_token|sessionid|cookie|set-cookie)$/i;

/**
 * Pattern matching pure secret property keys (passwords, tokens, client secrets, private keys)
 */
const PURE_SECRET_PROPERTY_PATTERN = /(^|\.)(password|passwd|pwd|private_key|client_secret|secret_key|api_key|apikey|access_token|refresh_token)$/i;

/**
 * Pattern matching cookie or session token assignment strings
 */
const COOKIE_SESSION_ASSIGNMENT_PATTERN = /^(session|sessionid|connect\.sid|token|access_token|refresh_token|api_key|jwt|sid)=/i;

/**
 * Valid test results execution summary statuses
 */
const VALID_RESULT_STATUSES = new Set([
  'passed',
  'failed',
  'error',
  'unevaluated'
]);

/**
 * Sanitizes diagnostic failure messages to ensure they never leak credentials or tokens.
 *
 * @param {string} msg - Raw message
 * @returns {string} Sanitized message
 */
function sanitizeResultMessage(msg) {
  if (typeof msg !== 'string') return msg;
  return msg
    .replace(/Bearer\s+[a-zA-Z0-9_\-.~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/enc:v1:[a-f0-9:]+/gi, '[REDACTED]')
    .replace(/(password|passwd|pwd|token|secret|client_secret|api_key|session|sessionid)\s*[:=]\s*['"]?[^'",\s]+['"]?/gi, '$1=[REDACTED]');
}

/**
 * Recursively redacts sensitive credentials from test results actual/expected structures.
 *
 * @param {any} data - Raw data value
 * @returns {any} Redacted data
 */
function redactAssertionValue(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    if (
      /^Bearer\s+/i.test(data) ||
      data.startsWith('enc:v1:') ||
      data === '••••••••' ||
      COOKIE_SESSION_ASSIGNMENT_PATTERN.test(data)
    ) {
      return REDACTED_PLACEHOLDER;
    }
    if (/Bearer\s+[a-zA-Z0-9_\-.~+/]+=*/i.test(data)) {
      return data.replace(/Bearer\s+[a-zA-Z0-9_\-.~+/]+=*/gi, 'Bearer [REDACTED]');
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactAssertionValue(item));
  }

  if (typeof data === 'object') {
    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        clean[key] = REDACTED_PLACEHOLDER;
      } else if (typeof value === 'object' && value !== null) {
        clean[key] = redactAssertionValue(value);
      } else if (typeof value === 'string' && (
        /^Bearer\s+/i.test(value) ||
        value.startsWith('enc:v1:') ||
        value === '••••••••' ||
        COOKIE_SESSION_ASSIGNMENT_PATTERN.test(value)
      )) {
        clean[key] = REDACTED_PLACEHOLDER;
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  return data;
}

/**
 * Validates and normalizes a JSON path string.
 * Strictly prevents prototype pollution and malformed property paths.
 *
 * @param {string} pathStr - Raw JSON path input
 * @returns {string} Normalized path string
 */
function validateJsonPath(pathStr) {
  if (typeof pathStr !== 'string' || !pathStr.trim()) {
    throw new AppError('JSON path property must be a non-empty string', 400, 'INVALID_JSON_PATH', null, 'property');
  }

  let normalized = pathStr.trim();

  // Strip leading $. or $ if present
  if (normalized.startsWith('$.')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('$[')) {
    normalized = normalized.slice(1);
  } else if (normalized === '$') {
    return '$';
  }

  if (!normalized) {
    throw new AppError('JSON path property cannot be empty after prefix normalization', 400, 'INVALID_JSON_PATH', null, 'property');
  }

  if (normalized.length > MAX_PROPERTY_LENGTH) {
    throw new AppError(`JSON path exceeds maximum length of ${MAX_PROPERTY_LENGTH} characters`, 400, 'INVALID_JSON_PATH', null, 'property');
  }

  // Prevent prototype pollution attacks
  if (PROTOTYPE_POLLUTION_PATTERN.test(normalized)) {
    throw new AppError('Prototype pollution properties (__proto__, prototype, constructor) are strictly forbidden in JSON paths', 400, 'FORBIDDEN_PROPERTY_PATH', null, 'property');
  }

  // Check valid syntax structure
  if (!JSON_PATH_REGEX.test(normalized)) {
    throw new AppError(`Malformed JSON path syntax: '${pathStr}'. Use dot notation (user.name) and bracket indices (items[0])`, 400, 'INVALID_JSON_PATH', null, 'property');
  }

  // Check path depth
  const segments = normalized.split(/[.[]/).filter(Boolean);
  if (segments.length > MAX_JSON_PATH_DEPTH) {
    throw new AppError(`JSON path depth exceeds limit of ${MAX_JSON_PATH_DEPTH} segments`, 400, 'INVALID_JSON_PATH_DEPTH', null, 'property');
  }

  return normalized;
}

/**
 * Checks a string field for dangerous code execution or script injection patterns.
 *
 * @param {string} val - String to inspect
 * @param {string} fieldName - Field name for error reporting
 */
function checkCodeInjection(val, fieldName) {
  if (typeof val !== 'string') return;

  for (const pattern of CODE_INJECTION_PATTERNS) {
    if (pattern.test(val)) {
      throw new AppError(
        `Disallowed code execution or script pattern detected in '${fieldName}'. Assertions are strictly declarative.`,
        400,
        'CODE_INJECTION_DETECTED',
        null,
        fieldName
      );
    }
  }
}

/**
 * Validates and normalizes a single assertion definition object.
 *
 * @param {object} item - Raw assertion definition
 * @param {number} index - Position index in array
 * @param {Set<string>} seenIds - Set of already processed assertion IDs for uniqueness check
 * @returns {object} Validated, normalized, declarative assertion object
 */
function validateSingleAssertion(item, index, seenIds) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new AppError(`Assertion at index ${index} must be a JSON object`, 400, 'INVALID_ASSERTION_DEFINITION', null, `assertions[${index}]`);
  }

  // 1. Validate ID
  if (item.id === undefined || item.id === null || typeof item.id !== 'string') {
    throw new AppError(`Assertion at index ${index} must have a non-empty string 'id'`, 400, 'MISSING_ASSERTION_ID', null, `assertions[${index}].id`);
  }

  const trimmedId = item.id.trim();
  if (!trimmedId) {
    throw new AppError(`Assertion at index ${index} has empty 'id'`, 400, 'MISSING_ASSERTION_ID', null, `assertions[${index}].id`);
  }
  if (trimmedId.length > MAX_ID_LENGTH) {
    throw new AppError(`Assertion ID cannot exceed ${MAX_ID_LENGTH} characters`, 400, 'INVALID_ASSERTION_ID', null, `assertions[${index}].id`);
  }
  checkCodeInjection(trimmedId, `assertions[${index}].id`);

  if (seenIds.has(trimmedId)) {
    throw new AppError(`Duplicate assertion ID '${trimmedId}' detected. Assertion IDs must be unique within a request.`, 400, 'DUPLICATE_ASSERTION_ID', null, `assertions[${index}].id`);
  }
  seenIds.add(trimmedId);

  // 2. Validate Type
  if (!item.type || typeof item.type !== 'string') {
    throw new AppError(`Assertion '${trimmedId}' must have a valid 'type'`, 400, 'MISSING_ASSERTION_TYPE', null, `assertions[${index}].type`);
  }

  const rawType = item.type.trim().toLowerCase();
  const canonicalType = TYPE_ALIASES[rawType] || rawType;

  if (!SUPPORTED_ASSERTION_TYPES.has(canonicalType)) {
    throw new AppError(
      `Unsupported assertion type '${item.type}'. Supported types: ${Array.from(SUPPORTED_ASSERTION_TYPES).join(', ')}`,
      400,
      'UNSUPPORTED_ASSERTION_TYPE',
      null,
      `assertions[${index}].type`
    );
  }

  // 3. Validate Operator
  if (!item.operator || typeof item.operator !== 'string') {
    throw new AppError(`Assertion '${trimmedId}' must have an 'operator'`, 400, 'MISSING_ASSERTION_OPERATOR', null, `assertions[${index}].operator`);
  }

  const normalizedOp = item.operator.trim().toLowerCase();
  const allowedOps = OPERATORS_BY_TYPE[canonicalType];

  if (!allowedOps || !allowedOps.has(normalizedOp)) {
    throw new AppError(
      `Unsupported operator '${item.operator}' for assertion type '${canonicalType}'. Supported: ${Array.from(allowedOps || []).join(', ')}`,
      400,
      'UNSUPPORTED_OPERATOR',
      null,
      `assertions[${index}].operator`
    );
  }

  // 4. Validate Property
  let normalizedProperty = null;

  if (canonicalType === 'header') {
    if (item.property === undefined || item.property === null || typeof item.property !== 'string') {
      throw new AppError(`Assertion '${trimmedId}' of type 'header' requires a non-empty string 'property' specifying header name`, 400, 'MISSING_ASSERTION_PROPERTY', null, `assertions[${index}].property`);
    }
    const trimmedHeader = item.property.trim();
    if (!trimmedHeader) {
      throw new AppError(`Assertion '${trimmedId}' of type 'header' has empty 'property'`, 400, 'MISSING_ASSERTION_PROPERTY', null, `assertions[${index}].property`);
    }
    if (trimmedHeader.length > MAX_PROPERTY_LENGTH) {
      throw new AppError(`Header name cannot exceed ${MAX_PROPERTY_LENGTH} characters`, 400, 'INVALID_ASSERTION_PROPERTY', null, `assertions[${index}].property`);
    }
    if (!RFC_7230_HEADER_PATTERN.test(trimmedHeader)) {
      throw new AppError(`Invalid HTTP header name '${trimmedHeader}'. Header names must follow RFC 7230 token specifications.`, 400, 'INVALID_HEADER_NAME', null, `assertions[${index}].property`);
    }
    checkCodeInjection(trimmedHeader, `assertions[${index}].property`);

    const lowerHeader = trimmedHeader.toLowerCase();
    if (SENSITIVE_HEADERS.has(lowerHeader)) {
      if (normalizedOp !== 'exists' && normalizedOp !== 'not_exists') {
        throw new AppError(
          `Value-matching assertions on sensitive header '${trimmedHeader}' are prohibited to prevent storing credentials. Use 'exists' or 'not_exists' operators instead.`,
          400,
          'SENSITIVE_CREDENTIAL_PROHIBITED',
          null,
          `assertions[${index}].property`
        );
      }
    }
    normalizedProperty = trimmedHeader;
  } else if (canonicalType === 'json_path') {
    if (item.property === undefined || item.property === null || typeof item.property !== 'string') {
      throw new AppError(`Assertion '${trimmedId}' of type 'json_path' requires a non-empty string 'property'`, 400, 'MISSING_ASSERTION_PROPERTY', null, `assertions[${index}].property`);
    }
    checkCodeInjection(item.property, `assertions[${index}].property`);
    normalizedProperty = validateJsonPath(item.property);

    if (PURE_SECRET_PROPERTY_PATTERN.test(normalizedProperty)) {
      if (normalizedOp !== 'exists' && normalizedOp !== 'not_exists') {
        throw new AppError(
          `Value-matching assertions on sensitive property '${item.property}' are prohibited to prevent storing credentials. Use 'exists' or 'not_exists' operators instead.`,
          400,
          'SENSITIVE_CREDENTIAL_PROHIBITED',
          null,
          `assertions[${index}].property`
        );
      }
    }
  }

  // 5. Validate Expected Value
  let normalizedExpected = null;
  const isExistenceOp = normalizedOp === 'exists' || normalizedOp === 'not_exists';

  if (!isExistenceOp) {
    if (item.expected === undefined) {
      throw new AppError(`Assertion '${trimmedId}' with operator '${normalizedOp}' requires an 'expected' value`, 400, 'MISSING_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
    }

    // Security check: Reject raw credentials, Bearer tokens, ciphertexts, and cookie credentials in expected values
    if (typeof item.expected === 'string') {
      const strExpected = item.expected.trim();
      if (/^Bearer\s+\S+/i.test(strExpected)) {
        throw new AppError(
          `Assertion definition cannot contain live Bearer tokens in 'expected' value to prevent storing credentials.`,
          400,
          'SENSITIVE_CREDENTIAL_PROHIBITED',
          null,
          `assertions[${index}].expected`
        );
      }
      if (strExpected.startsWith('enc:v1:') || strExpected === '••••••••') {
        throw new AppError(
          `Assertion definition cannot contain encrypted credentials (enc:v1:) or secret masks in 'expected' value.`,
          400,
          'SENSITIVE_CREDENTIAL_PROHIBITED',
          null,
          `assertions[${index}].expected`
        );
      }
      if (COOKIE_SESSION_ASSIGNMENT_PATTERN.test(strExpected)) {
        throw new AppError(
          `Assertion definition cannot contain session tokens or cookie credentials in 'expected' value.`,
          400,
          'SENSITIVE_CREDENTIAL_PROHIBITED',
          null,
          `assertions[${index}].expected`
        );
      }
    }

    if (canonicalType === 'status_code') {
      const statusNum = Number(item.expected);
      if (!Number.isInteger(statusNum) || statusNum < 100 || statusNum > 599) {
        throw new AppError(`Expected status code for assertion '${trimmedId}' must be an integer between 100 and 599`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
      }
      normalizedExpected = statusNum;
    } else if (canonicalType === 'response_time') {
      const timeNum = Number(item.expected);
      if (Number.isNaN(timeNum) || timeNum < 0 || !Number.isFinite(timeNum)) {
        throw new AppError(`Expected response time for assertion '${trimmedId}' must be a non-negative number in milliseconds`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
      }
      normalizedExpected = timeNum;
    } else if (canonicalType === 'header') {
      if (typeof item.expected !== 'string' && typeof item.expected !== 'number') {
        throw new AppError(`Expected header value for assertion '${trimmedId}' must be a string or number`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
      }
      const strVal = String(item.expected);
      if (strVal.length > MAX_STRING_EXPECTED_LENGTH) {
        throw new AppError(`Expected value for header assertion cannot exceed ${MAX_STRING_EXPECTED_LENGTH} characters`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
      }
      checkCodeInjection(strVal, `assertions[${index}].expected`);
      normalizedExpected = strVal;
    } else if (canonicalType === 'body_text') {
      if (typeof item.expected !== 'string' && typeof item.expected !== 'number') {
        throw new AppError(`Expected body text for assertion '${trimmedId}' must be a string`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
      }
      const strVal = String(item.expected);
      if (strVal.length > MAX_STRING_EXPECTED_LENGTH) {
        throw new AppError(`Expected body text cannot exceed ${MAX_STRING_EXPECTED_LENGTH} characters`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
      }
      checkCodeInjection(strVal, `assertions[${index}].expected`);
      normalizedExpected = strVal;
    } else if (canonicalType === 'json_path') {
      const isNumericOp = ['less_than', 'greater_than', 'less_than_or_equal', 'greater_than_or_equal'].includes(normalizedOp);
      if (isNumericOp) {
        const numVal = Number(item.expected);
        if (Number.isNaN(numVal) || !Number.isFinite(numVal)) {
          throw new AppError(`Numeric operator '${normalizedOp}' requires a finite numeric expected value for assertion '${trimmedId}'`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
        }
        normalizedExpected = numVal;
      } else {
        const validTypes = ['string', 'number', 'boolean'];
        if (!validTypes.includes(typeof item.expected) && item.expected !== null) {
          throw new AppError(`Expected value for json_path assertion '${trimmedId}' must be a primitive (string, number, boolean, or null)`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
        }
        if (typeof item.expected === 'string') {
          if (item.expected.length > MAX_STRING_EXPECTED_LENGTH) {
            throw new AppError(`Expected value cannot exceed ${MAX_STRING_EXPECTED_LENGTH} characters`, 400, 'INVALID_ASSERTION_EXPECTED', null, `assertions[${index}].expected`);
          }
          checkCodeInjection(item.expected, `assertions[${index}].expected`);
        }
        normalizedExpected = item.expected;
      }
    }
  }

  // 6. Validate Enabled flag (default true)
  const isEnabled = item.enabled !== false;

  return {
    id: trimmedId,
    type: canonicalType,
    property: normalizedProperty,
    operator: normalizedOp,
    expected: normalizedExpected,
    enabled: isEnabled
  };
}

/**
 * Validates an array of assertion definitions for a saved request.
 * Returns a sanitized, normalized array ready for database persistence.
 *
 * @param {Array<object>|null|undefined} assertions - Candidate assertions array
 * @returns {Array<object>|null} Sanitized array or null if omitted/cleared
 */
function validateAssertions(assertions) {
  if (assertions === undefined || assertions === null) {
    return null;
  }

  if (!Array.isArray(assertions)) {
    throw new AppError('Field \'assertions\' must be an array of assertion objects or null', 400, 'INVALID_ASSERTIONS', null, 'assertions');
  }

  if (assertions.length === 0) {
    return [];
  }

  if (assertions.length > MAX_ASSERTIONS_PER_REQUEST) {
    throw new AppError(`Request cannot define more than ${MAX_ASSERTIONS_PER_REQUEST} assertions`, 400, 'ASSERTION_LIMIT_EXCEEDED', null, 'assertions');
  }

  const seenIds = new Set();
  return assertions.map((item, idx) => validateSingleAssertion(item, idx, seenIds));
}

/**
 * Validates and sanitizes a test_results evaluation structure before persistence.
 * Ensures credentials and secrets are stripped and structure matches specification.
 *
 * @param {object|null|undefined} testResults - Raw test results candidate
 * @returns {object|null} Sanitized test results object or null
 */
function validateAndSanitizeTestResults(testResults) {
  if (testResults === undefined || testResults === null) {
    return null;
  }

  if (typeof testResults !== 'object' || Array.isArray(testResults)) {
    throw new AppError('Test results must be a non-null object', 400, 'INVALID_TEST_RESULTS');
  }

  // 1. Validate summary
  if (!testResults.summary || typeof testResults.summary !== 'object' || Array.isArray(testResults.summary)) {
    throw new AppError('Test results must include a \'summary\' object', 400, 'INVALID_TEST_RESULTS', null, 'summary');
  }

  const { total, passed, failed, status } = testResults.summary;

  if (typeof total !== 'number' || total < 0 || !Number.isInteger(total)) {
    throw new AppError('summary.total must be a non-negative integer', 400, 'INVALID_TEST_RESULTS', null, 'summary.total');
  }
  if (typeof passed !== 'number' || passed < 0 || !Number.isInteger(passed)) {
    throw new AppError('summary.passed must be a non-negative integer', 400, 'INVALID_TEST_RESULTS', null, 'summary.passed');
  }
  if (typeof failed !== 'number' || failed < 0 || !Number.isInteger(failed)) {
    throw new AppError('summary.failed must be a non-negative integer', 400, 'INVALID_TEST_RESULTS', null, 'summary.failed');
  }
  if (!VALID_RESULT_STATUSES.has(status)) {
    throw new AppError(`Invalid summary.status '${status}'. Allowed: ${Array.from(VALID_RESULT_STATUSES).join(', ')}`, 400, 'INVALID_TEST_RESULTS', null, 'summary.status');
  }
  if (passed + failed > total) {
    throw new AppError('The sum of passed and failed assertions cannot exceed summary.total', 400, 'INVALID_TEST_RESULTS', null, 'summary');
  }

  // 2. Validate results array
  if (!Array.isArray(testResults.results)) {
    throw new AppError('test_results.results must be an array', 400, 'INVALID_TEST_RESULTS', null, 'results');
  }

  const sanitizedResults = testResults.results.map((res, idx) => {
    if (!res || typeof res !== 'object' || Array.isArray(res)) {
      throw new AppError(`Result entry at index ${idx} must be an object`, 400, 'INVALID_TEST_RESULTS', null, `results[${idx}]`);
    }
    if (typeof res.id !== 'string' || !res.id.trim()) {
      throw new AppError(`Result entry at index ${idx} must have a non-empty string 'id'`, 400, 'INVALID_TEST_RESULTS', null, `results[${idx}].id`);
    }
    if (typeof res.passed !== 'boolean') {
      throw new AppError(`Result entry at index ${idx} must have a boolean 'passed' field`, 400, 'INVALID_TEST_RESULTS', null, `results[${idx}].passed`);
    }
    if (typeof res.message !== 'string') {
      throw new AppError(`Result entry at index ${idx} must have a string 'message'`, 400, 'INVALID_TEST_RESULTS', null, `results[${idx}].message`);
    }

    const isSensitiveProp = (res.property && SENSITIVE_HEADERS.has(String(res.property).trim().toLowerCase())) ||
      (res.property && PURE_SECRET_PROPERTY_PATTERN.test(String(res.property).trim()));

    const safeExpected = isSensitiveProp ? REDACTED_PLACEHOLDER : redactAssertionValue(res.expected);
    const safeActual = isSensitiveProp ? REDACTED_PLACEHOLDER : redactAssertionValue(res.actual);

    return {
      id: res.id.trim(),
      type: res.type ? String(res.type).trim() : undefined,
      property: res.property ? String(res.property).trim() : null,
      operator: res.operator ? String(res.operator).trim() : undefined,
      expected: safeExpected,
      actual: safeActual,
      passed: res.passed,
      message: sanitizeResultMessage(res.message)
    };
  });

  return {
    summary: {
      total,
      passed,
      failed,
      status
    },
    results: sanitizedResults
  };
}

module.exports = {
  SUPPORTED_ASSERTION_TYPES,
  OPERATORS_BY_TYPE,
  MAX_ASSERTIONS_PER_REQUEST,
  validateJsonPath,
  validateSingleAssertion,
  validateAssertions,
  validateAndSanitizeTestResults,
  redactAssertionValue,
  sanitizeResultMessage,
  PURE_SECRET_PROPERTY_PATTERN,
  COOKIE_SESSION_ASSIGNMENT_PATTERN
};
