/**
 * DevProbe Day 3 Verification Test Suite
 * Tests all requirements from Section 12 (Tests A through I)
 */

const http = require('http');
const {
  activeRequest,
  ENVIRONMENTS,
  getEnvironmentVariable,
  resolveVariables,
  prepareRequestUrl,
  validateHeaders,
  validateJsonBody,
  beautifyJsonBody,
  loadRequestIntoState
} = require('./public/js/app.js');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - ${details}`);
    process.exitCode = 1;
  }
}

console.log('=== DevProbe Day 3 Verification Tests ===\n');

// -----------------------------------------------------------------------------
// TEST A — Query parameters
// -----------------------------------------------------------------------------
console.log('--- TEST A: Query parameters ---');
const testAParams = [
  { key: 'page', value: 2, enabled: true },
  { key: 'limit', value: 10, enabled: true },
  { key: 'debug', value: 'true', enabled: false }
];
const resA = prepareRequestUrl('https://example.com/users', testAParams, 'none');
assert(resA.isValid === true, 'TEST A: Result is valid');
assert(
  resA.url === 'https://example.com/users?page=2&limit=10',
  'TEST A: Prepared URL matches expected',
  `Got: ${resA.url}`
);

// -----------------------------------------------------------------------------
// TEST B — Existing query parameters
// -----------------------------------------------------------------------------
console.log('\n--- TEST B: Existing query parameters ---');
const testBParams = [
  { key: 'page', value: 2, enabled: true }
];
const resB = prepareRequestUrl('https://example.com/users?sort=name', testBParams, 'none');
assert(resB.isValid === true, 'TEST B: Result is valid');
assert(
  resB.url === 'https://example.com/users?sort=name&page=2',
  'TEST B: Preserves existing parameter and appends new one',
  `Got: ${resB.url}`
);

// -----------------------------------------------------------------------------
// TEST C — Special characters
// -----------------------------------------------------------------------------
console.log('\n--- TEST C: Special characters encoding ---');
const testCParams = [
  { key: 'search', value: 'hello & world', enabled: true },
  { key: 'tag', value: 'c++ / c# ?', enabled: true }
];
const resC = prepareRequestUrl('https://example.com/api', testCParams, 'none');
assert(resC.isValid === true, 'TEST C: Special characters parsed without error');
const parsedC = new URL(resC.url);
assert(
  parsedC.searchParams.get('search') === 'hello & world',
  'TEST C: Decodes spaces and ampersand properly',
  `Decoded search was: ${parsedC.searchParams.get('search')}`
);
assert(
  parsedC.searchParams.get('tag') === 'c++ / c# ?',
  'TEST C: Decodes plus, slash, and question mark properly',
  `Decoded tag was: ${parsedC.searchParams.get('tag')}`
);

// -----------------------------------------------------------------------------
// TEST D — Empty parameter
// -----------------------------------------------------------------------------
console.log('\n--- TEST D: Empty parameter handling ---');
const testDParams = [
  { key: '', value: 'emptyKey', enabled: true },
  { key: '   ', value: 'whitespaceKey', enabled: true },
  { key: 'valid', value: 'present', enabled: true },
  { key: 'zero', value: 0, enabled: true },
  { key: 'bool', value: false, enabled: true }
];
const resD = prepareRequestUrl('https://example.com/api', testDParams, 'none');
assert(resD.isValid === true, 'TEST D: Prepared successfully');
const parsedD = new URL(resD.url);
assert(!parsedD.searchParams.has(''), 'TEST D: Excludes empty key');
assert(!parsedD.searchParams.has('   '), 'TEST D: Excludes whitespace key');
assert(parsedD.searchParams.get('valid') === 'present', 'TEST D: Includes valid parameter');
assert(parsedD.searchParams.get('zero') === '0', 'TEST D: Preserves 0 as value');
assert(parsedD.searchParams.get('bool') === 'false', 'TEST D: Preserves false as value');

// -----------------------------------------------------------------------------
// TEST E — JSON validation
// -----------------------------------------------------------------------------
console.log('\n--- TEST E: JSON validation ---');
const validJsonText = '{"name":"Prasad","active":true}';
const invalidJsonText = '{"name":';

const valE1 = validateJsonBody(validJsonText, 'json', false);
assert(valE1.isValid === true, 'TEST E: Valid JSON passes');
assert(valE1.parsed && valE1.parsed.name === 'Prasad', 'TEST E: Parsed data matches');

const valE2 = validateJsonBody(invalidJsonText, 'json', false);
assert(valE2.isValid === false, 'TEST E: Invalid JSON fails gracefully');
assert(typeof valE2.message === 'string' && valE2.message.includes('JSON'), 'TEST E: Returns informative error message');

// -----------------------------------------------------------------------------
// TEST F — Headers
// -----------------------------------------------------------------------------
console.log('\n--- TEST F: Headers validation & duplicate detection ---');
const testFHeaders = [
  { key: 'Content-Type', value: 'application/json', enabled: true },
  { key: 'content-type', value: 'text/plain', enabled: true }
];
const valF1 = validateHeaders(testFHeaders, false);
assert(valF1.isValid === false, 'TEST F: Duplicate headers (case-insensitive) rejected');
assert(valF1.errors.some((e) => e.includes('Duplicate header')), 'TEST F: Explains duplicate conflict');

const testF2Headers = [
  { key: 'Invalid Header Name with Spaces', value: '123', enabled: true }
];
const valF2 = validateHeaders(testF2Headers, false);
assert(valF2.isValid === false, 'TEST F: Header with spaces rejected');

const testF3Headers = [
  { key: 'X-Valid-Header', value: 'good', enabled: true },
  { key: 'Authorization', value: 'Bearer token', enabled: true }
];
const valF3 = validateHeaders(testF3Headers, false);
assert(valF3.isValid === true, 'TEST F: Valid headers accepted');

// -----------------------------------------------------------------------------
// TEST G — Environment variables
// -----------------------------------------------------------------------------
console.log('\n--- TEST G: Environment variable resolution ---');
const resolvedDev = resolveVariables('{{base_url}}/users', 'dev');
assert(
  resolvedDev.resolvedText === 'http://localhost:3000/users',
  'TEST G: Resolves {{base_url}} in dev environment',
  `Got: ${resolvedDev.resolvedText}`
);
assert(resolvedDev.missingVariables.length === 0, 'TEST G: No missing variables in dev');

const resolvedMissing = resolveVariables('{{base_url}}/users/{{missing_var}}', 'dev');
assert(
  resolvedMissing.missingVariables.includes('missing_var'),
  'TEST G: Identifies missing variable',
  `Missing: ${resolvedMissing.missingVariables.join(', ')}`
);
assert(
  resolvedMissing.resolvedText.includes('{{missing_var}}'),
  'TEST G: Does not silently replace missing variable with empty string'
);

const resGUrl = prepareRequestUrl('{{base_url}}/users/{{missing_var}}', [], 'dev');
assert(resGUrl.isValid === false, 'TEST G: prepareRequestUrl fails when variables are missing');
assert(resGUrl.error.includes('missing_var'), 'TEST G: prepareRequestUrl returns helpful error message');

// -----------------------------------------------------------------------------
// TEST H — Regression & State Synchronization
// -----------------------------------------------------------------------------
console.log('\n--- TEST H: State synchronization & switching ---');
loadRequestIntoState({
  name: 'Test State Sync',
  method: 'POST',
  url: 'https://example.com/api/test',
  params: [
    { key: 'p1', value: 'v1', enabled: true }
  ],
  headers: [
    { key: 'X-Custom', value: 'custom-val', enabled: true }
  ],
  body: { type: 'json', text: '{"test":123}' },
  auth: { type: 'bearer', bearerToken: 'test-token-123' }
});

assert(activeRequest.name === 'Test State Sync', 'TEST H: activeRequest name updated');
assert(activeRequest.method === 'POST', 'TEST H: activeRequest method updated');
assert(activeRequest.auth.bearerToken === 'test-token-123', 'TEST H: activeRequest auth token preserved in state');
assert(activeRequest.body.type === 'json', 'TEST H: activeRequest body type preserved in state');

// -----------------------------------------------------------------------------
// TEST I — Backend Health Check
// -----------------------------------------------------------------------------
console.log('\n--- TEST I: Backend /api/health ---');
const app = require('./src/app.js');
const server = app.listen(0, () => {
  const port = server.address().port;
  http.get(`http://localhost:${port}/api/health`, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      server.close();
      try {
        const json = JSON.parse(data);
        assert(res.statusCode === 200, 'TEST I: Status code is 200');
        assert(json.success === true, 'TEST I: json.success is true');
        assert(json.message === 'DevProbe server is running', 'TEST I: Expected health message returned');
      } catch (err) {
        assert(false, 'TEST I: Health response is valid JSON', err.message);
      }

      console.log(`\n===========================================`);
      console.log(`Test Results: ${passedTests}/${totalTests} Passed`);
      console.log(`===========================================\n`);

      process.exit(passedTests === totalTests ? 0 : 1);
    });
  }).on('error', (err) => {
    server.close();
    console.error('TEST I: HTTP Request error:', err);
    process.exit(1);
  });
});
