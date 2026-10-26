# DevProbe — API Testing and Documentation Platform

DevProbe is a lightweight, full-stack web application designed to help developers test HTTP APIs, inspect responses, organize requests, and generate API documentation.

The project provides a simple, developer-friendly workspace for configuring, testing, and managing API requests with enterprise-grade SSRF defense and connection security.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Frontend workspace structure |
| CSS3 | Dark-theme styling and responsive workspace layout |
| JavaScript | Frontend reactivity, state engine & backend server logic |
| Node.js | Backend JavaScript runtime |
| Express.js | Backend server, API routes, and middleware pipeline |
| MySQL | Database for persistent storage (planned) |
| Git & GitHub | Version control and collaboration |

## 📅 Current Development Status

**Day 5 of 16 — Real HTTP Request Execution Engine**

Completed Milestones:
- **Day 1**: Project setup, initial Express server, health-check endpoint, and Git integration.
- **Day 2**: Modern Postman-inspired dark-mode workspace UI with responsive sidebar, request bar, tabs, and response viewer.
- **Day 3**: Centralized client-side request state management, parameter parsing, header validation, variable resolution (`{{base_url}}`), and in-memory credential handling.
- **Day 4**: Layered backend architecture, preparation-only validation endpoint (`POST /api/requests/validate`), security configuration & initial SSRF defense layer, execution limits, centralized error handling, and automated test suite.
- **Day 5**: Real outbound HTTP request execution engine (`POST /api/requests/execute`), DNS pre-resolution with comprehensive IP range checking, DNS rebinding protection via socket-level connection pinning, manual redirect loop with destination re-validation and credential stripping, response streaming size limit enforcement (5 MB), monotonic latency measurement, response viewer integration, and complete automated verification suite (80 tests).

## ✨ Features

- [x] **Frontend Request Workspace** — Interactive workspace UI with request bar, query params, headers, body, and auth panels.
- [x] **Request State & Config Engine** — Centralized client request state and live URL preview with environment variable resolution.
- [x] **Preparation Validation Endpoint** — Server-side syntax and SSRF verification without outbound dispatch (`POST /api/requests/validate`).
- [x] **Real Outbound Execution Engine** — Secure HTTP/HTTPS dispatching with DNS pinning, manual redirects, and response capture (`POST /api/requests/execute`).
- [x] **Live Response Inspector** — Inspect upstream status, latency (ms), payload size, headers table, raw/pretty JSON body, and cookie security policies.
- [ ] **Request Collections & History** — Save and organize requests into persistent collections (Day 9).
- [ ] **User Authentication & Workspaces** — Multi-user authentication and private workspaces.
- [ ] **Automated API Testing** — Assert status codes, response times, and JSON schema.
- [ ] **API Documentation Generator** — Generate shareable documentation from saved requests.
- [ ] **Import / Export** — Import and export Postman / OpenAPI collections.

## 📁 Project Structure

```text
DevProbe/
│
├── public/
│   ├── index.html                  # DevProbe workspace HTML interface
│   ├── css/
│   │   └── style.css               # Dark-theme CSS design system & response viewer styles
│   └── js/
│       └── app.js                  # Frontend state management, Send button dispatch, & response renderer
│
├── src/
│   ├── app.js                      # Express application entry point & middleware pipeline
│   ├── config/
│   │   └── security.js             # Security policies, SSRF defenses, DNS validation, & execution limits
│   ├── controllers/
│   │   └── requestController.js    # Request controller (validate & execute endpoints)
│   ├── middleware/
│   │   ├── errorHandler.js         # Centralized error handler and 404 handler
│   │   └── validateRequest.js      # Request payload validation middleware
│   ├── routes/
│   │   └── requestRoutes.js        # Request configuration route definitions
│   └── services/
│       └── requestService.js       # Real execution engine, DNS pinning, & normalization service
│
├── test-day3.js                    # Day 3 automated verification test suite (34 tests)
├── test-day4.js                    # Day 4 automated verification test suite (67 tests, Tests A-M)
├── test-day5.js                    # Day 5 automated verification test suite (80 tests, Tests A-R)
├── .env                            # Local environment configuration
├── .env.example                    # Environment configuration template
├── .gitignore                      # Git ignored files & directories
├── package.json                    # Project metadata, scripts, and dependencies
├── package-lock.json               # Locked dependency tree
└── README.md                       # Project documentation
```

## 🏗️ Backend Architecture

DevProbe adheres to a structured, layered architecture:

- **`src/app.js`**: Bootstraps the Express application, configures body-parsers with payload limits (`1mb`), serves public assets, mounts API routes, registers the 404 handler, and registers centralized error handling.
- **`src/config/security.js`**: Defines execution limits (timeouts, payload sizes, redirects), permitted methods/protocols, sensitive header classifications, hop-by-hop header lists, and SSRF defense logic (inspects hostnames, IPv4 ranges, IPv6 representations, IPv4-mapped IPv6, and cloud metadata addresses).
- **`src/middleware/validateRequest.js`**: Validates incoming request payloads for both `/validate` and `/execute`. Rejects unsupported methods, malformed URLs, non-HTTP protocols, embedded credentials, restricted destinations, invalid RFC 7230 headers, and oversized payloads.
- **`src/middleware/errorHandler.js`**: Intercepts JSON syntax errors, payload size limits (413), validation errors (400), unknown routes (404), and upstream network errors. Guarantees consistent JSON error structures and prevents leakage of internal stack traces, filesystem paths, or secrets.
- **`src/services/requestService.js`**: Implements the real outbound HTTP/HTTPS execution engine with DNS pre-resolution, socket-level connection pinning, manual redirect loop with cross-origin credential stripping, streaming response size caps, and monotonic latency measurement. Also provides the preparation-only normalization service for `/validate`.
- **`src/controllers/requestController.js`**: Handles incoming API requests for validation and execution, delegating to `requestService` and returning structured responses.

## 🔒 Security Architecture & SSRF Defenses

DevProbe executes developer-configured HTTP requests against external APIs. Outbound request engines represent a high-risk attack surface if not properly defended.

### Comprehensive Outbound Security Strategy

1. **Strict Protocol Enforcement**:
   - Only `http:` and `https:` schemes are accepted.
   - All other protocols (`file:`, `ftp:`, `gopher:`, `data:`, `javascript:`) are rejected immediately.
2. **Embedded Credentials Prohibited**:
   - URLs containing embedded credentials (e.g., `https://user:pass@host`) are rejected to prevent credential smuggling.
3. **Pre-Connection DNS Resolution & SSRF Address Validation**:
   - Hostnames are resolved using `dns.promises.lookup(hostname, { all: true })` prior to establishing any network connection.
   - **All** resolved addresses (IPv4 and IPv6) are validated. If **any** returned IP address falls within a private, loopback, link-local, multicast, or reserved range, the destination is rejected before socket connection.
   - Prohibited destinations include:
     - Loopback: `127.0.0.0/8`, `::1`
     - Private networks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`
     - Link-local: `169.254.0.0/16`, `fe80::/10`
     - Multicast: `224.0.0.0/4`, `ff00::/8`
     - Reserved & unspecified: `0.0.0.0/8`, `240.0.0.0/4`, `::`
     - Shared address space (CGNAT): `100.64.0.0/10`
     - Documentation prefixes: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `2001:db8::/32`
     - Prohibited hostnames: `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.lan`, `*.home.arpa`
     - Cloud metadata endpoints: `169.254.169.254`, `100.100.100.200`, `metadata.google.internal`, `instance-data`
4. **DNS Rebinding Defense (Connection Pinning)**:
   - Hostname validation alone is vulnerable to Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding attacks, where a hostname resolves to a public IP during verification but switches to a loopback/private IP during socket connection.
   - DevProbe eliminates this vulnerability by passing a custom `lookup` function into `http.request` / `https.request`. The socket establishes its connection directly to the specific IP address that passed SSRF validation, preventing secondary DNS resolution.
5. **SNI and TLS Hostname Verification Preservation**:
   - Even though the connection is pinned to a validated IP, `options.servername` and `options.hostname` retain the original target domain name.
   - TLS Server Name Indication (SNI) correctly passes the hostname during TLS handshakes, and Node's certificate verification verifies that the upstream certificate matches the requested domain.
6. **Controlled Manual Redirects**:
   - Automatic client redirects are disabled. Redirects (`301`, `302`, `303`, `307`, `308`) are processed manually in an execution loop.
   - Every redirect target URL is parsed and re-validated against the full SSRF policy and DNS resolution checks.
   - Redirect count is capped at 5 by default (`TOO_MANY_REDIRECTS`).
   - If redirecting across origins, sensitive authentication headers (`Authorization`, `Cookie`, `Proxy-Authorization`) are stripped to prevent credential leakage.
7. **Streaming Response Size Cap**:
   - Enforces a hard 5 MB limit (`5,242,880 bytes`) while streaming incoming response chunks (`res.on('data')`), aborting the connection immediately if the limit is exceeded (`RESPONSE_TOO_LARGE`).
8. **Request & Connection Timeouts**:
   - Monotonic timeout timers (default 10 seconds, maximum 30 seconds) destroy the request if the remote server fails to respond (`REQUEST_TIMEOUT`).
9. **Credential Scrubbing**:
   - Authentication tokens, passwords, and sensitive cookies are never logged to console, never stored in URLs or browser storage, and filtered from response metadata (`Set-Cookie` filtered).

## ⚙️ Request & Response Limits

| Setting | Default Value | Description |
|---|---|---|
| Request Timeout | `10,000 ms` (10s) | Maximum roundtrip duration before aborting (`504 Gateway Timeout`) |
| Max Request Timeout | `30,000 ms` (30s) | Hard ceiling for custom timeout configurations |
| Max Response Size | `5 MB` (`5,242,880 B`) | Hard streaming limit for response body payloads (`413 Payload Too Large`) |
| Max Request Body | `1 MB` (`1,048,576 B`) | Incoming client payload limit |
| Max Redirects | `5` | Maximum number of redirect hops followed before aborting (`502 Bad Gateway`) |

### GET & DELETE Request Body Policy

In HTTP/1.1 (RFC 7231), payloads on GET and DELETE requests have undefined semantics and may be rejected by some intermediaries. DevProbe preserves and sends user-configured bodies on GET and DELETE requests if explicitly provided, computing `Content-Length` and writing the payload to the wire to support custom or legacy APIs that require request bodies on these methods.

## 🌐 API Endpoints

### 1. Health Check
- **Route**: `GET /api/health`
- **Status**: `200 OK`
- **Response**:
  ```json
  {
    "success": true,
    "message": "DevProbe server is running"
  }
  ```

### 2. Request Configuration Validation (Preparation-Only)
- **Route**: `POST /api/requests/validate`
- **Description**: Validates request parameters and produces a normalized execution plan. **Does not perform any outbound network calls.**
- **Status**: `200 OK`

### 3. Real HTTP Request Execution
- **Route**: `POST /api/requests/execute`
- **Description**: Safely executes an outbound HTTP/HTTPS request against the target API and returns real status, headers, body, and latency metrics.
- **Request Headers**: `Content-Type: application/json`
- **Example Request Body**:
  ```json
  {
    "method": "POST",
    "url": "https://jsonplaceholder.typicode.com/posts",
    "headers": {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    "body": "{\"title\":\"Hello DevProbe\",\"body\":\"Testing Day 5\",\"userId\":1}",
    "auth": {
      "type": "bearer",
      "bearerToken": "sample-auth-token"
    }
  }
  ```
- **Example Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "status": 201,
      "statusText": "Created",
      "timeMs": 142,
      "sizeBytes": 65,
      "headers": {
        "content-type": "application/json; charset=utf-8",
        "x-powered-by": "Express"
      },
      "body": {
        "title": "Hello DevProbe",
        "body": "Testing Day 5",
        "userId": 1,
        "id": 101
      }
    }
  }
  ```

### 4. Execution Error Response Format
When destination validation fails or limits are exceeded, a structured error is returned:
```json
{
  "success": false,
  "message": "Access to prohibited hostname 'localhost' is blocked for SSRF protection.",
  "error": {
    "message": "Access to prohibited hostname 'localhost' is blocked for SSRF protection.",
    "code": "BLOCKED_DESTINATION"
  }
}
```

Common Error Codes:
- `BLOCKED_DESTINATION` (`400`): SSRF target, private IP, link-local, or cloud metadata destination.
- `DNS_RESOLUTION_FAILED` (`502`): Domain name could not be resolved.
- `REQUEST_TIMEOUT` (`504`): Connection or overall request exceeded timeout threshold.
- `RESPONSE_TOO_LARGE` (`413`): Upstream response exceeded 5 MB streaming limit.
- `TOO_MANY_REDIRECTS` (`502`): Exceeded maximum redirect limit (5).
- `CONNECTION_ERROR` (`502`): Connection refused, reset, or broken pipe.
- `TLS_ERROR` (`502`): TLS handshake failure or invalid certificate.

## 📦 Supported Response Media Types & Known Limitations

### Supported Response Formats
- **JSON**: Parsed into structured JavaScript objects. The response viewer provides both **Pretty** (formatted indentation) and **Raw** views.
- **Plain Text / HTML / XML**: Preserved as text strings and rendered safely using `textContent` (preventing script execution or HTML injection in the application).
- **Empty Responses** (`204 No Content`): Handled safely and displayed with status code without errors.
- **Binary Data** (`images`, `audio`, `video`, `application/octet-stream`, `PDF`): Safely captured and returned as a descriptive binary metadata object (`{ isBinary: true, contentType, sizeBytes, preview }`). Binary streams are not corrupted by forcing UTF-8 decoding.

### Known Limitations
- **Cookie Jar / Ambient Cookie Persistence**: For security, DevProbe does not store or replay response cookies between requests.
- **HTTP/2 & HTTP/3**: Current engine dispatches requests using HTTP/1.1. Native HTTP/2 connection multiplexing is scheduled for a future release.
- **Client Certificate (mTLS) Authentication**: Mutual TLS authentication is not yet exposed via the workspace UI.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)
- [Git](https://git-scm.com/)

### 1. Clone & Install

```bash
git clone https://github.com/P-deshmukh-03/DevProbe.git
cd DevProbe
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Contents:
```dotenv
PORT=3000
NODE_ENV=development
DEVPROBE_ALLOW_LOCAL_TARGETS=false
```

### 3. Start Application

- **Development Mode**:
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

Open browser at `http://localhost:3000`.

## 🧪 Automated Testing

DevProbe features a multi-tiered test suite with 181 automated tests verifying frontend state, backend validation, SSRF defenses, and real outbound request execution:

```bash
# Run all test suites (Day 3, Day 4, Day 5, and Day 6 — 277 total tests)
npm test

# Run Day 3 frontend state & parameter parsing tests (34 tests)
npm run test:day3

# Run Day 4 backend architecture & SSRF validation tests (67 tests)
npm run test:day4

# Run Day 5 real HTTP execution & connection security tests (80 tests)
npm run test:day5

# Run Day 6 response viewer improvements & state tests (96 tests)
npm run test:day6
```

### Day 6 Test Coverage (Tests A through M — 96 Tests)
- **TEST A**: Valid JSON formatting with 2-space indentation and full syntax highlighting tokenization (`json-key`, `json-string`, `json-number`, `json-boolean`, `json-null`, `json-punct`).
- **TEST B**: Safe rendering and HTML-escaping to prevent XSS when response bodies contain `<script>`, `<img>`, or HTML tags.
- **TEST C**: Graceful fallback when parsing malformed JSON payloads, displaying original raw text without crashing and setting `isMalformedJson: true`.
- **TEST D**: Plain-text response display with correct status, time, size, and Content-Type metrics.
- **TEST E**: Empty response handling for HTTP 204 No Content and 0-byte responses (`isEmpty: true`).
- **TEST F**: Binary and unsupported media handling (`isBinary: true`), safe textual representation, and UI card preview suppression.
- **TEST G**: Upstream non-2xx HTTP responses (`404 Not Found`, `500 Internal Server Error`) preserved as valid execution results rather than transport errors.
- **TEST H**: Network error and request timeout states with status clearing, warning banner, and troubleshooting notes.
- **TEST I**: Response metadata extraction (case-insensitive Content-Type) and consecutive request state resetting (`resetResponseViewer`).
- **TEST J**: Copy Body logic with pretty/raw format selection, empty body detection, and Clipboard API fallback.
- **TEST K**: Copy Headers formatting into RFC-compliant key-value text lines.
- **TEST L**: End-to-end integration with local DevProbe execution engine and mock upstream server (`rawText` return contract).
- **TEST M**: Regression checks ensuring Day 3, Day 4, and Day 5 exports and request state structures remain intact.

## 🗺️ Development Roadmap

| Phase | Planned Work | Status |
|---|---|---|
| Days 1–2 | Project setup and frontend workspace interface | Completed |
| Days 3–4 | Request state management & backend validation architecture | Completed |
| Days 5–6 | Real HTTP execution engine, SSRF defense & response inspector improvements | Completed |
| Days 7–8 | Database schema and query optimization | Upcoming |
| Days 9–12 | Collections, saved requests, authentication, and request history | Planned |
| Days 13–16 | Environment variables, automated tests, documentation, and final deployment | Planned |

## 👨‍💻 Developer

**Prasad Nilkanth Deshmukh**  
MCA Student | Full-Stack Development Enthusiast

## 📌 Project Status

**In Active Development** — Day 6 complete. Response Viewer Improvements implemented with lightweight JSON syntax highlighting, safe XSS-free DOM rendering, Copy Body and Copy Headers with Clipboard API fallback, 7 distinct response states (JSON, text, 204/empty, malformed JSON, non-2xx, network/timeout, binary card), live metadata metrics, and comprehensive regression test suites. 277 automated tests passing.