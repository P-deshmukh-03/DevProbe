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
| MySQL / MariaDB | Relational database persistence (collections, saved requests) |
| mysql2 | High-performance Promise-based MySQL driver with connection pooling |
| Git & GitHub | Version control and collaboration |

## 📅 Current Development Status

**Day 14 of 16 — Automated API Response Assertion & Testing Engine**

Completed Milestones:
- **Day 1**: Project setup, initial Express server, health-check endpoint, and Git integration.
- **Day 2**: Modern Postman-inspired dark-mode workspace UI with responsive sidebar, request bar, tabs, and response viewer.
- **Day 3**: Centralized client-side request state management, parameter parsing, header validation, variable resolution (`{{base_url}}`), and in-memory credential handling.
- **Day 4**: Layered backend architecture, preparation-only validation endpoint (`POST /api/requests/validate`), security configuration & initial SSRF defense layer, execution limits, centralized error handling, and automated test suite.
- **Day 5**: Real outbound HTTP request execution engine (`POST /api/requests/execute`), DNS pre-resolution with comprehensive IP range checking, DNS rebinding protection via socket-level connection pinning, manual redirect loop with destination re-validation and credential stripping, response streaming size limit enforcement (5 MB), monotonic latency measurement, response viewer integration, and complete automated verification suite.
- **Day 6**: Response viewer syntax highlighting, safe XSS-free DOM rendering, Copy Body and Copy Headers actions with clipboard fallback, multi-state response handling (JSON, text, empty 204, malformed, binary preview suppression), and consecutive request state resetting.
- **Day 7**: Advanced error handling, standardized AppError classification, CRLF injection prevention, duplicate header detection, security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-Powered-By` disabling), and regression test suite.
- **Day 8**: Security audit, IPv6 tunneling/transition defenses (6to4, NAT64, Teredo), trailing-dot domain bypass prevention, sensitive response header redaction (`Set-Cookie`), socket timeout cleanup, and response viewer layout clipping resolution.
- **Day 9**: MySQL database connection layer with `mysql2/promise` connection pooling, configuration via environment variables, initial relational schema (`collections`, `saved_requests`), safe error handling without credential leakage, database readiness health-check endpoint (`GET /api/health/db`), and automated Day 9 test suite.
- **Day 10**: Collections and saved requests persistence in MySQL (`GET`/`POST /api/collections`, `GET`/`POST /api/requests/saved`), collection filtering, modal dialogs for collection and request creation, strict credential protection (bearer tokens and passwords stripped before persistence), and safe non-dispatch request loading.
- **Day 11**: Full collection and saved request management: updating collections (`PUT /api/collections/:id`), safe collection deletion (`DELETE /api/collections/:id`) with automatic foreign key disassociation (`ON DELETE SET NULL`), saved request modification (`PUT /api/requests/saved/:id`), saved request deletion (`DELETE /api/requests/saved/:id`), interactive dark-theme workspace modals, and frontend non-dispatch verification.
- **Day 12**: Complete Postman-style environment management: relational MySQL schema (`environments`, `environment_variables`) with `ON DELETE CASCADE`, AES-256-GCM secret encryption at rest via dedicated `DEVPROBE_ENCRYPTION_KEY`, API response secret masking (`••••••••`), secret preservation on update, atomic environment activation/deactivation, dynamic variable resolution across URLs, query params, headers, body, and auth on cloned execution payloads, SSRF integration blocking resolved loopback/metadata targets, dark-theme Environment Manager modal, and Quick View popover.
- **Day 13**: Request execution history persistence and response comparison engine: relational MySQL schema (`request_history`), non-blocking fire-and-forget execution recording for both successful and failed outbound requests, multi-tier sanitization and redaction (Basic auth, query secrets, Authorization, Cookie, Set-Cookie, passwords, tokens), hard 64 KB response body storage cap with truncation flag, RESTful History API (`GET`/`DELETE /api/history`, `GET`/`DELETE /api/history/:id`), dynamic History sidebar with pagination, History Detail inspection modal, workspace loading, single and clear-all deletion, and side-by-side Response Comparison with delta summary, case-insensitive header matching, LCS line-by-line diffing for JSON/plain-text, and truncation safeguards.
- **Day 14**: Automated API response testing and declarative assertion evaluation engine: schema migrations adding `saved_requests.assertions` JSON column and `request_history.test_results` JSON column; centralized backend validation service (`assertionService`) supporting 5 assertion categories (`status_code`, `response_time`, `header`, `body_text`, `json_path`) with strict operator and prototype-pollution enforcement; client-side assertion evaluation engine (`public/js/assertionEngine.js`) executing across browser and Node environments with 100% declarative safety (no eval/Function), credential redaction (`[REDACTED]`), and fault isolation; interactive Assertion Builder UI in request editor with live count badge, category-specific fields, and sensitive property existence restriction; live Test Results panel in response inspector with PASS/FAIL counters, status banners, individual cards, and expected/actual comparison rows; non-blocking execution recording of `test_results` in `request_history`; historical test results display in History Detail Modal without re-evaluation; and 183 automated verification tests with zero regressions.

## ✨ Features

- [x] **Frontend Request Workspace** — Interactive workspace UI with request bar, query params, headers, body, and auth panels.
- [x] **Request State & Config Engine** — Centralized client request state and live URL preview with environment variable resolution.
- [x] **Preparation Validation Endpoint** — Server-side syntax and SSRF verification without outbound dispatch (`POST /api/requests/validate`).
- [x] **Real Outbound Execution Engine** — Secure HTTP/HTTPS dispatching with DNS pinning, manual redirects, and response capture (`POST /api/requests/execute`).
- [x] **Live Response Inspector** — Inspect upstream status, latency (ms), payload size, headers table, raw/pretty JSON body, and cookie security policies.
- [x] **Request Collections & Saved Requests** — Save, organize, edit, and delete requests into persistent collections (Day 10 & Day 11).
- [x] **Environment Management & Dynamic Variables** — Postman-style environments with AES-256-GCM encrypted secrets, Quick Look popover, and variable resolution across URLs, headers, body, and auth (Day 12).
- [x] **Request Execution History & Audit Trail** — Non-blocking recording of successful and failed outbound API executions in relational MySQL (`request_history`), pagination, 64 KB storage caps, and multi-tier credential sanitization (Day 13).
- [x] **Side-by-Side Response Comparison** — Developer comparison engine comparing two saved history executions side-by-side with delta summary, case-insensitive header matching, LCS line-by-line diffing for JSON/plain-text, and truncation safeguards (Day 13).
- [x] **Automated API Response Testing** — Automated declarative response testing across status codes, response latencies, response headers, body text, and JSON paths with builder UI and inspector results panel (Day 14).
- [ ] **User Authentication & Workspaces** — Multi-user authentication and private workspaces.
- [ ] **API Documentation Generator** — Generate shareable documentation from saved requests.
- [ ] **Import / Export** — Import and export Postman / OpenAPI collections.

## 📁 Project Structure

```text
DevProbe/
│
├── database/
│   ├── schema.sql                  # Initial MySQL/MariaDB DDL schema (collections, saved_requests)
│   └── init.js                     # Safe database initialization & migration script
│
├── public/
│   ├── index.html                  # DevProbe workspace HTML interface
│   ├── css/
│   │   └── style.css               # Dark-theme CSS design system & response viewer styles
│   └── js/
│       ├── app.js                  # Frontend state management, Send button dispatch, assertion builder & response renderer
│       └── assertionEngine.js      # Client-side declarative assertion evaluation engine
│
├── src/
│   ├── app.js                      # Express application entry point, health check, & database readiness
│   ├── config/
│   │   ├── database.js             # MySQL connection pool, health check, & sanitized error handling
│   │   └── security.js             # Security policies, SSRF defenses, DNS validation, & execution limits
│   ├── controllers/
│   │   ├── collectionController.js # Collection CRUD and management controller
│   │   ├── environmentController.js # Environment and variables CRUD controller
│   │   ├── historyController.js    # Request execution history controller (list, detail, delete, clear)
│   │   ├── requestController.js    # Request controller (validate, execute, & auto-history recording)
│   │   └── savedRequestController.js # Saved request CRUD and management controller
│   ├── middleware/
│   │   ├── errorHandler.js         # Centralized error handler and 404 handler
│   │   └── validateRequest.js      # Request payload validation middleware
│   ├── routes/
│   │   ├── collectionRoutes.js     # Collection routes (GET, POST, PUT, DELETE)
│   │   ├── environmentRoutes.js    # Environment routes (GET, POST, PUT, DELETE, activate, variables)
│   │   ├── historyRoutes.js        # History API routes (GET, DELETE)
│   │   ├── requestRoutes.js        # Request configuration route definitions
│   │   └── savedRequestRoutes.js   # Saved request routes (GET, POST, PUT, DELETE)
│   └── services/
│       ├── assertionService.js     # Assertion validation, category operator rules, prototype-pollution guards & test results sanitization
│       ├── collectionService.js    # Collection persistence & safe deletion service
│       ├── environmentService.js   # Environment & variable CRUD, AES-256-GCM encryption, & masking service
│       ├── historyService.js       # Execution recording, multi-tier redaction, 64 KB truncation, & pagination service
│       ├── requestService.js       # Real execution engine, DNS pinning, & normalization service
│       └── savedRequestService.js  # Saved requests persistence, credential scrubbing, & update service
│
├── test-day3.js                    # Day 3 automated verification test suite (34 tests)
├── test-day4.js                    # Day 4 automated verification test suite (67 tests)
├── test-day5.js                    # Day 5 automated verification test suite (68 tests)
├── test-day6.js                    # Day 6 automated verification test suite (118 tests)
├── test-day7.js                    # Day 7 automated verification test suite (63 tests)
├── test-day8.js                    # Day 8 automated verification test suite (71 tests)
├── test-day9.js                    # Day 9 automated database integration test suite (61 tests)
├── test-day10.js                   # Day 10 automated persistence test suite (88 tests)
├── test-day11.js                   # Day 11 automated management test suite (83 tests)
├── test-day12.js                   # Day 12 automated environment management test suite (101 tests)
├── test-day13.js                   # Day 13 automated history & comparison test suite (274 tests)
├── test-day14.js                   # Day 14 automated response assertions & testing test suite (183 tests)
├── .env                            # Local environment configuration
├── .env.example                    # Environment configuration template
├── .gitignore                      # Git ignored files & directories
├── package.json                    # Project metadata, scripts, and dependencies
├── package-lock.json               # Locked dependency tree
└── README.md                       # Project documentation
```

## 🏗️ Backend Architecture

DevProbe adheres to a structured, layered architecture:

- **`src/app.js`**: Bootstraps the Express application, configures security headers (`nosniff`, `DENY`), serves public assets, mounts API routes (`/api/requests`, `/api/collections`, `/api/requests/saved`, `/api/environments`), provides application health check (`GET /api/health`) and database readiness check (`GET /api/health/db`), and manages graceful shutdown.
- **`src/config/database.js`**: Manages the MySQL connection pool singleton via `mysql2/promise`, reads configuration from environment variables, provides connectivity test and health check helpers, enforces parameterized query safety, and translates raw database errors into sanitized user-safe diagnostics.
- **`src/config/security.js`**: Defines execution limits (timeouts, payload sizes, redirects), permitted methods/protocols, sensitive header classifications, hop-by-hop header lists, and SSRF defense logic (inspects hostnames, IPv4 ranges, IPv6 representations, IPv4-mapped IPv6, and cloud metadata addresses).
- **`src/middleware/validateRequest.js`**: Validates incoming request payloads for both `/validate` and `/execute`. Rejects unsupported methods, malformed URLs, non-HTTP protocols, embedded credentials, restricted destinations, invalid RFC 7230 headers, and oversized payloads.
- **`src/middleware/errorHandler.js`**: Intercepts JSON syntax errors, payload size limits (413), validation errors (400), unknown routes (404), and upstream network errors. Guarantees consistent JSON error structures and prevents leakage of internal stack traces, filesystem paths, or secrets.
- **`src/services/requestService.js`**: Implements the real outbound HTTP/HTTPS execution engine with DNS pre-resolution, socket-level connection pinning, manual redirect loop with cross-origin credential stripping, streaming response size caps, and monotonic latency measurement. Also provides the preparation-only normalization service for `/validate`.
- **`src/controllers/requestController.js`**: Handles incoming API requests for validation and execution, delegating to `requestService` and returning structured responses.
- **`src/services/assertionService.js`**: Centralized assertion validation service: validates and normalizes assertion definitions across all 5 supported categories (`status_code`, `response_time`, `header`, `body_text`, `json_path`), enforces category-specific operators and type coercions, blocks prototype pollution (`__proto__`, `constructor`, `prototype`), rejects code injection attempts (`eval`, `Function`, `process.*`), and sanitizes sensitive credentials in test results.
- **`src/services/collectionService.js`**: Provides collection business logic: creating collections, querying all collections or single collection by ID, updating name and description, and deleting collections safely while preserving child requests by setting `collection_id = NULL`.
- **`src/controllers/collectionController.js`**: Handles collection HTTP requests (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`).
- **`src/services/savedRequestService.js`**: Manages saved request persistence: validation, header and credential scrubbing (stripping tokens, passwords, cookies), creating, listing with optional `collectionId` filter, fetching by ID, updating request definitions, and deleting saved requests.
- **`src/controllers/savedRequestController.js`**: Handles saved request HTTP requests (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`).
- **`src/services/environmentService.js`**: Manages environment and variable business logic: CRUD, unique key enforcement, atomic activation/deactivation, AES-256-GCM encryption at rest for sensitive secrets, safe masking (`••••••••`), and secret preservation during updates.
- **`src/controllers/environmentController.js`**: Handles environment HTTP requests (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `/activate`, `/deactivate`, and nested variable routes).
- **`src/services/historyService.js`**: Implements non-blocking execution persistence into MySQL (`request_history`), multi-tier credential redaction (embedded URL basic auth, query secrets, Authorization, Cookie, Set-Cookie, JSON secrets), hard 64 KB response body truncation with truncation flag, and paginated query engine.
- **`src/controllers/historyController.js`**: Handles execution history HTTP endpoints (`GET /api/history`, `GET /api/history/:id`, `DELETE /api/history/:id`, `DELETE /api/history`).
- **`src/routes/historyRoutes.js`**: Defines RESTful routes for history listing, detail inspection, single deletion, and clear-all operations with input validation.

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

### 1. Application Health Check (Liveness)
- **Route**: `GET /api/health`
- **Status**: `200 OK`
- **Response**:
  ```json
  {
    "success": true,
    "message": "DevProbe server is running"
  }
  ```

### 2. Database Readiness Check (Day 9)
- **Route**: `GET /api/health/db`
- **Status**: `200 OK` (when connected) or `503 Service Unavailable` (when database service is offline)
- **Example Response (Connected)**:
  ```json
  {
    "success": true,
    "database": {
      "isConnected": true,
      "status": "connected",
      "message": "Database connection established successfully",
      "timestamp": "2026-10-28T11:40:00.000Z",
      "database": "devprobe_db"
    }
  }
  ```
- **Example Response (Disconnected / Offline MySQL)**:
  ```json
  {
    "success": false,
    "database": {
      "isConnected": false,
      "status": "disconnected",
      "message": "Database server refused connection. Verify MySQL service is running.",
      "timestamp": "2026-10-28T11:40:00.000Z",
      "database": "devprobe_db"
    }
  }
  ```

### 3. Request Configuration Validation (Preparation-Only)
- **Route**: `POST /api/requests/validate`
- **Description**: Validates request parameters and produces a normalized execution plan. **Does not perform any outbound network calls.**
- **Status**: `200 OK`

### 4. Real HTTP Request Execution
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

### 5. Collections API (Day 10 & Day 11)
- **List Collections**: `GET /api/collections`
  - **Status**: `200 OK`
  - **Response**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": 1,
          "name": "Users API",
          "description": "Endpoints for user management",
          "created_at": "2026-10-29T14:00:00.000Z",
          "updated_at": "2026-10-29T14:00:00.000Z"
        }
      ]
    }
    ```
- **Create Collection**: `POST /api/collections`
  - **Status**: `201 Created`
  - **Body**: `{ "name": "Auth API", "description": "Optional notes" }`
  - **Validation**: Requires non-empty string name between 1 and 255 characters.

- **Retrieve Collection by ID**: `GET /api/collections/:id`
  - **Status**: `200 OK` or `404 Not Found`

- **Update Collection (Day 11)**: `PUT /api/collections/:id`
  - **Status**: `200 OK`
  - **Body**: `{ "name": "Updated Collection Name", "description": "Updated notes" }`
  - **Validation**: Requires string name between 1 and 255 characters. Returns 404 if collection not found.

- **Delete Collection (Day 11)**: `DELETE /api/collections/:id`
  - **Status**: `200 OK`
  - **Safe Disassociation**: Deletes the collection while safely keeping child requests (`UPDATE saved_requests SET collection_id = NULL WHERE collection_id = ?`). The requests remain accessible as unassigned requests. Returns 404 if collection not found.

### 6. Saved Requests API (Day 10 & Day 11)
- **List Saved Requests**: `GET /api/requests/saved`
  - **Query Filter**: Optional `?collectionId=<id>` to retrieve requests belonging to a specific collection.
  - **Status**: `200 OK`
  - **Response**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": 1,
          "collection_id": 1,
          "name": "Get User Profile",
          "method": "GET",
          "url": "https://jsonplaceholder.typicode.com/users/1",
          "headers": [{ "key": "Accept", "value": "application/json", "enabled": true }],
          "params": [{ "key": "active", "value": "true", "enabled": true }],
          "body": null,
          "body_type": "none",
          "auth_type": "bearer",
          "created_at": "2026-10-29T14:05:00.000Z",
          "updated_at": "2026-10-29T14:05:00.000Z"
        }
      ]
    }
    ```

- **Create Saved Request**: `POST /api/requests/saved`
  - **Status**: `201 Created`
  - **Example Request Body**:
    ```json
    {
      "name": "Create Post Item",
      "collection_id": 1,
      "method": "POST",
      "url": "https://jsonplaceholder.typicode.com/posts",
      "headers": [{ "key": "Accept", "value": "application/json" }],
      "params": [],
      "body": "{\"title\":\"My Post\"}",
      "body_type": "json",
      "auth": { "type": "bearer", "bearerToken": "secret-token-will-be-stripped" }
    }
    ```
  - **Strict Secret Protection Policy**: Plaintext bearer tokens, basic passwords, cookies, and `Authorization` headers are **purged** prior to persistence. Only safe metadata (`auth_type`) is saved to MySQL.

- **Retrieve Saved Request by ID**: `GET /api/requests/saved/:id`
  - **Status**: `200 OK` or `404 Not Found`

- **Update Saved Request (Day 11)**: `PUT /api/requests/saved/:id`
  - **Status**: `200 OK`
  - **Example Request Body**:
    ```json
    {
      "name": "Updated Post Item",
      "collection_id": 2,
      "method": "PUT",
      "url": "https://jsonplaceholder.typicode.com/posts/1",
      "headers": [{ "key": "Content-Type", "value": "application/json" }],
      "params": [],
      "body": "{\"title\":\"Updated Title\"}",
      "body_type": "json",
      "auth": { "type": "bearer", "bearerToken": "secret-stripped" }
    }
    ```
  - **Validation & Scrubbing**: Validates request name, HTTP method, valid HTTP/HTTPS URL, and foreign key collection ID. Strips sensitive tokens/passwords/cookies so secrets are never saved to MySQL.

- **Delete Saved Request (Day 11)**: `DELETE /api/requests/saved/:id`
  - **Status**: `200 OK`
  - **Behavior**: Permanently deletes the specified saved request record. Returns 404 if request does not exist. Leaves all other requests and collections intact.

### 7. Environments API (Day 12)
- **List Environments**: `GET /api/environments`
  - **Status**: `200 OK`
  - **Response**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": 1,
          "name": "Staging",
          "description": "Staging API cluster",
          "is_active": true,
          "created_at": "2026-10-30T10:00:00.000Z",
          "updated_at": "2026-10-30T10:00:00.000Z",
          "variable_count": 3
        }
      ]
    }
    ```

- **Retrieve Environment by ID**: `GET /api/environments/:id`
  - **Status**: `200 OK` or `404 Not Found`
  - **Security Guarantee**: Sensitive variables marked `is_secret = true` return masked values (`••••••••`) and `has_value: true` to prevent accidental screen or inspection exposure.

- **Create Environment**: `POST /api/environments`
  - **Status**: `201 Created`
  - **Body**:
    ```json
    {
      "name": "Production",
      "description": "Live production environment",
      "variables": [
        { "key": "base_url", "value": "https://api.example.com", "is_secret": false },
        { "key": "api_key", "value": "sk_live_secret123", "is_secret": true }
      ]
    }
    ```
  - **Secret Encryption**: Sensitive variables are encrypted at rest via AES-256-GCM before MySQL insertion. Plaintext secrets never touch the database.

- **Update Environment**: `PUT /api/environments/:id`
  - **Status**: `200 OK`
  - **Secret Preservation**: If a client submits a masked placeholder (`••••••••`) for an unchanged secret, DevProbe preserves the existing encrypted ciphertext rather than overwriting it with bullet dots.

- **Delete Environment**: `DELETE /api/environments/:id`
  - **Status**: `200 OK`
  - **Cascade Guarantee**: Child variables in `environment_variables` are automatically pruned by MySQL via foreign key `ON DELETE CASCADE`.

- **Activate Environment**: `POST /api/environments/:id/activate`
  - **Status**: `200 OK`
  - **Atomic Switch**: Sets targeted environment to `is_active = true` and deactivates all other environments atomically within a transaction.

- **Deactivate All Environments**: `POST /api/environments/deactivate`
  - **Status**: `200 OK` (Switches to "No Environment").

- **Granular Variable Endpoints**:
  - `POST /api/environments/:id/variables`: Add single variable (rejects duplicate keys with `400 DUPLICATE_VARIABLE_KEY`).
  - `PUT /api/environments/:id/variables/:varId`: Update variable key, value, secret flag, or enabled flag.
  - `DELETE /api/environments/:id/variables/:varId`: Delete single variable.

### 8. Request Execution History API (Day 13)
DevProbe automatically records outbound HTTP executions into relational MySQL (`request_history`) to provide a complete audit trail without blocking developer productivity.

- **Non-Blocking Persistence**: History recording uses fire-and-forget execution (`recordHistorySafely`) so that database logging failures never alter or delay the original HTTP response.
- **Multi-Tier Credential Redaction**:
  - Embedded basic authentication in URLs (`https://user:pass@host`) is stripped.
  - Query parameter secrets (`api_key`, `token`, `secret`, `access_token`, etc.) are masked as `[REDACTED]`.
  - Sensitive request/response headers (`Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`) are redacted.
  - Sensitive body keys (`password`, `token`, `secret`, `client_secret`) are recursively redacted in JSON payloads.
- **64 KB Storage Cap & Truncation Safeguard**: Response bodies exceeding 64 KB are automatically truncated and stored with `response_body_truncated = 1` to prevent database bloat.
- **List Execution History**: `GET /api/history?page=1&limit=20`
  - **Status**: `200 OK`
  - **Parameters**: `page` (default: 1), `limit` (default: 20, max: 100).
  - **Payload Structure**:
    ```json
    {
      "success": true,
      "data": {
        "items": [
          {
            "id": 142,
            "request_name": "Get User Profile",
            "method": "GET",
            "url": "https://api.example.com/users/1",
            "response_status": 200,
            "response_time": 45,
            "response_body_truncated": false,
            "error_message": null,
            "created_at": "2026-11-06T12:00:00.000Z"
          }
        ],
        "pagination": {
          "page": 1,
          "limit": 20,
          "total": 1,
          "totalPages": 1
        }
      }
    }
    ```
- **Retrieve Full History Record**: `GET /api/history/:id`
  - **Status**: `200 OK` or `404 Not Found`
  - **Payload**: Full execution record including redacted `request_headers`, `request_body`, `response_headers`, and `response_body`.
- **Delete Single History Record**: `DELETE /api/history/:id`
  - **Status**: `200 OK` or `404 Not Found`
  - **Response**: `{ "success": true, "message": "History record deleted successfully.", "data": { "id": 142, "deleted": true } }`
- **Clear All Execution History**: `DELETE /api/history`
  - **Status**: `200 OK`
  - **Response**: `{ "success": true, "message": "All execution history records cleared successfully.", "data": { "deletedCount": 42 } }`

### 9. Side-by-Side Response Comparison (Day 13)
DevProbe allows developers to inspect regressions and evaluate API variations by comparing the full responses of any two historical executions.

- **Record Selection Workflow**:
  - In the **Request History** sidebar, each record displays a selection checkbox.
  - Alternatively, click **"Select for Compare"** inside the **History Details** modal.
  - The sticky **Comparison Toolbar** (`#history-compare-bar`) tracks active selections (`1/2` or `2/2 selected`).
  - Exactly two records can be selected. Attempting to select a 3rd record is prevented.
  - Selected records are labeled with visual indicator tags (`A` and `B`).
  - Clicking **"Compare"** launches the side-by-side comparison modal.
- **Comparison Engine**:
  - **Request Context**: Displays request names, HTTP methods, target URLs, and execution timestamps side-by-side.
  - **Delta Summary Banner**: Summarizes high-level differences at a glance:
    - Status code equivalence (e.g. `Status: 200 (Identical)` or `Status: 200 vs 500`).
    - Roundtrip duration delta (e.g. `Latency: 45ms vs 50ms (Δ +5ms)`).
    - Header difference count.
    - Body equivalence flag (`Identical`, `Differences Found`, or `Truncated (64 KB limit)`).
  - **Case-Insensitive Header Matching**:
    - Aligns response headers by lowercased key names.
    - Categorizes each header as `Identical`, `Modified`, `Record A only`, or `Record B only`.
  - **LCS Line-by-Line Body Diff**:
    - Formats JSON payloads with consistent 2-space indentation.
    - Computes Longest Common Subsequence (LCS) line diffs with colored syntax highlights (`diff-same`, `diff-added`, `diff-removed`).
    - Identifies fully identical payloads and displays an equivalence banner.
  - **Truncation Safeguards**:
    - If either response was truncated at the 64 KB storage boundary, a prominent warning informs the user that comparison is incomplete and refuses to claim full equivalence.
  - **Failure Comparison**:
    - Failed outbound executions (network refusal, timeouts, SSRF blocks) display error diagnostics instead of empty bodies.

### 10. Execution Error Response Format
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
- [MySQL](https://www.mysql.com/) / [MariaDB](https://mariadb.org/) (or [XAMPP](https://www.apachefriends.org/) with MySQL service)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/P-deshmukh-03/DevProbe.git
cd DevProbe
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Default configuration for local development with XAMPP:
```dotenv
PORT=3000
NODE_ENV=development

# Database Configuration (MySQL / XAMPP)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=devprobe_db
DB_USER=root
DB_PASSWORD=
DB_CONNECTION_LIMIT=10
DB_CONNECT_TIMEOUT=10000

# Security / SSRF configuration
DEVPROBE_ALLOW_LOCAL_TARGETS=false

# Day 12: Environment Secrets Encryption (AES-256-GCM)
DEVPROBE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### 3. Start MySQL in XAMPP

If you are using XAMPP for local MySQL development:
1. Open the **XAMPP Control Panel**.
2. Locate the **MySQL** module row.
3. Click the **Start** button next to MySQL.
4. Verify the status indicator turns green and displays Port **`3306`**.

### 4. Initialize Database Schema

You can apply the relational schema (`collections`, `saved_requests`, `environments`, `environment_variables`) using any of the following methods:

- **Method A (Node.js automated runner)**:
  ```bash
  npm run db:init
  ```
- **Method B (phpMyAdmin web interface)**:
  1. Open [http://localhost/phpmyadmin](http://localhost/phpmyadmin) in your browser.
  2. Create a new database named `devprobe_db` with collation `utf8mb4_unicode_ci`.
  3. Click **Import**, choose `database/schema.sql`, and click **Go**.
- **Method C (MySQL CLI / PowerShell)**:
  ```powershell
  # Using XAMPP's mysql binary
  & "C:\xampp\mysql\bin\mysql.exe" -u root < database/schema.sql
  ```

### 5. Start Application

- **Development Mode** (auto-restart with nodemon):
  ```bash
  npm run dev
  ```
- **Production / Standard Mode**:
  ```bash
  npm start
  ```

Open browser at `http://localhost:3000`.

To verify database readiness from the browser or curl:
```bash
curl http://localhost:3000/api/health/db
```

## 🧪 Automated Testing

DevProbe features a multi-tiered automated test suite with **1,211 passing tests** across 12 test suites, verifying client state, backend validation, SSRF security, real HTTP execution, response formatting, database integration, collections persistence, collection/request management, environment variable resolution, request execution history, side-by-side response comparison, and automated response assertions:

```bash
# Run full regression suite (Day 3 through Day 12 — 754 total tests)
npm test

# Run Day 13 verification suite (History & Comparison — 274 total tests)
npm run test:day13

# Run Day 14 verification suite (Response Assertions & Testing — 183 total tests)
npm run test:day14

# Run individual test suites
npm run test:day3    # Day 3: Frontend state & parameter parsing (34 tests)
npm run test:day4    # Day 4: Backend validation & SSRF defense (67 tests)
npm run test:day5    # Day 5: Real HTTP execution & socket pinning (68 tests)
npm run test:day6    # Day 6: Response viewer & formatting states (118 tests)
npm run test:day7    # Day 7: Error handling & security headers (63 tests)
npm run test:day8    # Day 8: Security hardening & IPv6 edge cases (71 tests)
npm run test:day9    # Day 9: MySQL database integration (61 tests)
npm run test:day10   # Day 10: Collections & saved requests persistence (88 tests)
npm run test:day11   # Day 11: Saved request & collection management (83 tests)
npm run test:day12   # Day 12: Environment management & dynamic variable resolution (101 tests)
npm run test:day13   # Day 13: Request execution history & response comparison (274 tests)
npm run test:day14   # Day 14: Automated response assertions & testing engine (183 tests)
```

### Day 10 Test Coverage (88 Tests)
- **TEST A**: Collection validation (rejects missing names, whitespace-only names, strings exceeding 255 characters).
- **TEST B**: Collection creation (`201 Created`), listing (`GET /api/collections`), ID retrieval, and 404 handling.
- **TEST C**: Saved request validation (missing names, empty strings, unsupported HTTP methods, malformed URLs, non-HTTP protocols, embedded credentials in URL, nonexistent `collection_id`).
- **TEST D**: Saved request creation (`201 Created`), foreign key association to collections, and unassigned request persistence (`collection_id: null`).
- **TEST E**: Saved requests listing, filtering by `?collectionId=`, single record retrieval, and 400/404 handling.
- **TEST F**: **Strict Authentication & Secret Protection**:
  - `Authorization: Bearer <token>` and `Cookie` headers are stripped from saved headers.
  - Plaintext `bearerToken` and `basicPassword` are strictly purged; only safe `auth_type` metadata is stored.
  - Direct MySQL verification confirms secret tokens never touch the database.
- **TEST G**: Parameterized SQL execution & injection resistance (`' OR '1'='1'`, `DROP TABLE`, `UNION SELECT` safely treated as string literals).
- **TEST H**: Safe database error handling (readiness check does not expose passwords, errors formatted securely).
- **TEST I**: Frontend non-dispatch verification (`convertSavedRequestToTemplate` and `loadRequestIntoState` safely populate the workspace editor and state without triggering outbound HTTP execution).

### Day 11 Test Coverage (83 Tests)
- **TEST A**: Collection update validation (rejects invalid IDs, missing collections 404, invalid names 400), valid updates (`PUT /api/collections/:id`), and SQL injection resistance.
- **TEST B**: Collection safe deletion (`DELETE /api/collections/:id`), 404 handling for missing collections, and foreign key unassigning verification (`saved_requests.collection_id` set to `NULL`).
- **TEST C**: Saved request update validation (rejects invalid IDs, 404 for missing request, invalid methods, non-HTTP URLs, embedded credentials, invalid collection IDs), payload updating, and secret credential stripping.
- **TEST D**: Saved request deletion (`DELETE /api/requests/saved/:id`), 404 on subsequent lookups, and isolation of unrelated saved requests.
- **TEST E**: Parameterized SQL execution & SQL injection resistance across all update and delete endpoints.
- **TEST F**: Frontend non-dispatch verification and modal function exports (`openEditCollectionModal`, `openDeleteCollectionModal`, `openEditSavedRequestModal`, `openDeleteSavedRequestModal`, and non-dispatch on request selection).

### Day 12 Test Coverage (101 Tests)
- **TEST A**: Environment validation (rejects missing names, whitespace names, strings > 255 chars, non-numeric IDs, and returns 404 for missing environments).
- **TEST B**: Environment CRUD operations (`POST /api/environments`, `GET /api/environments`, `GET /api/environments/:id`, `PUT /api/environments/:id`, and `DELETE /api/environments/:id`).
- **TEST C**: Variable CRUD operations, duplicate key rejection (`400 DUPLICATE_VARIABLE_KEY`), and foreign key cascade deletion (`ON DELETE CASCADE`).
- **TEST D**: Environment atomic activation (`POST /:id/activate`) and deactivation (`POST /deactivate`).
- **TEST E**: Secret protection: AES-256-GCM encryption at rest, API response masking (`••••••••`), secret preservation on update, and safe handling of missing/corrupted encryption keys.
- **TEST F**: Dynamic variable resolution across URLs, query params, headers, request bodies, and auth (Bearer and Basic). Missing/disabled variable interception without secret leakage.
- **TEST G**: SSRF protection integration: variables resolving to loopback (`127.0.0.1`), `localhost`, cloud metadata (`169.254.169.254`), or `file://` protocols are blocked.
- **TEST H**: SQL injection resistance across all environment endpoints.
- **TEST I**: Backward compatibility contracts with Day 3 verification test suite (`getEnvironmentVariable`, `resolveVariables`).

### Day 13 Test Coverage (274 Tests)
- **TEST A**: Multi-tier sanitization and redaction helpers (embedded URL credentials, sensitive query parameters `token`/`apiKey`, request/response headers `Authorization`/`Cookie`/`Set-Cookie`/`X-Api-Key`, recursive JSON keys `password`/`token`/`client_secret`, and AES-256-GCM token redaction).
- **TEST B**: Successful request recording in MySQL (`request_history`), preserving method, sanitized URL, headers, 200 status, response time, and un-truncated payload state.
- **TEST C**: Failed request recording capturing POST method, error descriptions, and null response headers/status for network failures and timeouts.
- **TEST D**: Hard 64 KB payload boundary enforcement, verifying truncation flag (`response_body_truncated: true`) and storage caps.
- **TEST E**: History list pagination (`page`, `limit`), sorting by `created_at DESC`, `totalPages` calculation, and query clamping (max limit: 100).
- **TEST F**: ID validation and missing record 404 handling.
- **TEST G**: Individual history record deletion (`DELETE /api/history/:id`).
- **TEST H**: Clear-all history execution (`DELETE /api/history`), table verification, and deleted record count reporting.
- **TEST I**: Database error sanitization preventing connection password exposure.
- **TEST J**: Automatic controller execution recording, non-blocking fire-and-forget execution timing (<500ms even with hanging DB promises), and single record guarantees.
- **TEST K**: REST API endpoint contracts (`GET /api/history`, `GET /api/history/:id`, `DELETE /api/history/:id`, `DELETE /api/history`).
- **TEST L**: Frontend history interface contracts, module exports, non-browser safety, and workspace state injection (`loadHistoryIntoWorkspace`) across JSON, plain-text, and empty payloads.
- **TEST M**: Side-by-side Response Comparison engine:
  - Identical response bodies detection.
  - Different JSON objects (added and removed field detection).
  - Different JSON arrays.
  - Plain-text diffing with line-by-line classification.
  - Empty body equivalence.
  - Response header diffing (added, removed, modified).
  - Case-insensitive response header matching.
  - Status code equivalence and roundtrip duration delta calculation.
  - Failed request comparison (error diagnostics vs successful responses).
  - Truncated payload safeguard (strictly refuses full equivalence on truncated bodies).
  - Large multi-line payload diffing performance (<200ms without thread blocking).
  - Malformed JSON fallback to raw text.
- **TEST N**: Comparison workflow and security verification:
  - Selecting records, selection capping at exactly 2 records, duplicate prevention, and toggling.
  - Input validation requiring two valid records.
  - Live retrieval via `GET /api/history/:id` and delta computation.
  - Missing record 404 handling.
  - Selection clearing.
  - Non-browser safety for comparison modal helpers.
  - HTML and script injection resistance (XSS payloads and script tags rendered safely as literal text).
  - Credential protection: comparison payloads never leak URL secrets, Authorization headers, passwords, or Set-Cookie session tokens.

### Day 14 Test Coverage (183 Tests)
- **Phase 1 & 2**: Database health check, schema file declarations (`saved_requests.assertions`, `request_history.test_results`).
- **Phase 3 & 4**: Live MySQL column inspection, nullable verification, and migration idempotency.
- **Phase 5**: Centralized Assertion Validation Service (`src/services/assertionService.js`):
  - Valid models for all 5 categories (`status_code`, `response_time`, `header`, `body_text`, `json_path`).
  - Aliases normalization (`status` to `status_code`).
  - Existence operators accepted without expected values (`exists`, `not_exists`).
  - Rejection of invalid types, unsupported operators, missing IDs/properties/expected values, and duplicate IDs.
  - Expected type validation (numeric status code, latency threshold, array lengths <= 50).
  - Prototype pollution blocking (`__proto__`, `constructor`, `prototype`).
  - Code injection rejection (`eval`, `process.*`, `<script>`) while preserving legitimate descriptive text.
- **Phase 6**: Saved request assertion persistence integration (`POST`, `GET`, `PUT`, clearing with `null`, clearing with `[]`, omitting assertions preservation, and requests without assertions).
- **Phase 7**: History test results persistence, structure validation, and multi-tier credential sanitization (`Bearer [REDACTED]`, `password`, `secret_key`, session cookies).
- **Phase 8**: Client-side assertion evaluation engine (`public/js/assertionEngine.js`):
  - Status code equality, inequality, and numeric boundaries (<, >, <=, >=).
  - Latency threshold checks.
  - Header matching case-insensitivity, equality, containment, and existence.
  - Body text containment and exact equality.
  - JSON path dot notation and bracket array indexing.
  - Missing JSON properties vs explicit null values.
  - Malformed JSON fallback and individual fault isolation.
  - Non-mutation of underlying HTTP response objects.
- **Phase 9**: Assertion Builder UI & Client-Side State Management:
  - ID generation with unique category prefixes.
  - Sensitive header and property detection with automatic security notice display.
  - Auto-detection and explicit parsing of expected values (number, string, boolean, null).
  - Form population, update-in-place, and active checkbox toggling.
  - Deletion, clearing, and deep-copy template conversion with state isolation.
- **Phase 10**: Test Results Panel & Execution Integration:
  - HTTP 200 with all assertions passing (green badges, summary counters).
  - HTTP 200 with failing assertions (red badges, preserved HTTP 200 status).
  - HTTP 404/500 upstream error evaluation against assertions.
  - Transport and network error handling (`ECONNREFUSED`, timeout) with diagnostic messages.
  - Empty and disabled assertion states.
  - Sensitive Authorization and JSON property masking in rendered result cards.
  - Persistence of `test_results` via `POST /api/requests/execute` and retrieval via `GET /api/history/:id`.
  - Legacy history records (`test_results: NULL`) handled gracefully in History Detail Modal.
  - Immutability of historical test results without re-evaluation.
  - Single history row guarantee (no duplicate logging).
  - Backward compatibility of response viewer tabs and response comparison engine.

## Automated API Response Testing

### 1. Feature Overview
DevProbe's Automated API Response Testing engine enables developers to configure declarative, contract-based assertions for HTTP requests without writing custom code or scripts. When an API request is dispatched, active assertions are evaluated in-memory against the actual HTTP response—verifying status codes, roundtrip latencies, response headers, body text, and nested JSON paths. Evaluation results are summarized live in the response inspector, badged in real time, and persisted immutably with execution history and saved requests.

### 2. Supported Assertion Types
DevProbe supports five specialized assertion categories:
- **Status Code (`status_code`)**: Evaluates HTTP response status codes (e.g. 200, 201, 404, 500) against expected integer values or numeric boundaries.
- **Response Time (`response_time`)**: Verifies roundtrip execution duration in milliseconds against performance SLA targets.
- **Response Header (`header`)**: Evaluates response header presence, absence, exact equality, or substring containment with case-insensitive header matching.
- **Response Body Text (`body_text`)**: Evaluates full response body text (raw or formatted) for substring presence or exact equality.
- **JSON Path (`json_path`)**: Navigates parsed JSON payloads using standard dot-notation (`data.user.id`) and array bracket indexing (`items[0].name`), evaluating values against primitives (numbers, strings, booleans, null) or presence conditions.

### 3. Supported Operators
Each assertion category provides a strictly validated set of operators:
- **Status Code**: `equals`, `not_equals`, `less_than`, `greater_than`, `less_than_or_equal`, `greater_than_or_equal`.
- **Response Time**: `less_than`, `greater_than`, `less_than_or_equal`, `greater_than_or_equal`, `equals`, `not_equals`.
- **Response Header**: `exists`, `not_exists`, `equals`, `not_equals`, `contains`, `not_contains`.
- **Response Body Text**: `contains`, `not_contains`, `equals`, `not_equals`.
- **JSON Path**: `exists`, `not_exists`, `equals`, `not_equals`, `contains`, `not_contains`, `less_than`, `greater_than`, `less_than_or_equal`, `greater_than_or_equal`.

### 4. Creating Assertions
1. Switch to the **Tests** tab in the main request configuration editor.
2. Click **+ Add Assertion** to open the interactive Assertion Builder card.
3. Select an assertion type from the category dropdown.
4. If testing headers or JSON paths, enter the target property name (e.g., `Content-Type` or `data.users[0].id`).
5. Select a comparison operator from the operator dropdown.
6. Enter the expected target value. The builder auto-detects numbers, booleans, and null, or honors explicit type overrides.
7. Click **Add to Request** (or **Update Assertion** when editing).
8. Assertions appear in the table with category badges, property paths, and action controls:
   - Checkbox: Quickly toggle assertions enabled or disabled without deletion.
   - Edit icon: Load an assertion back into the builder for modification.
   - Delete icon: Remove an individual assertion.
   - Clear All button: Empty all assertions from the active request.

### 5. Executing Assertions
When the user clicks **Send**:
1. Active request state and enabled assertions are packaged into the execution payload.
2. The outbound HTTP request executes securely via the backend execution engine.
3. Upon receiving the response, enabled assertions are evaluated against the response status, latency, headers, and body.
4. Evaluation runs safely in-memory without altering or mutating the underlying response object.
5. If no assertions are configured or all assertions are disabled, evaluation is safely bypassed.

### 6. Understanding Test Results
The **Test Results** panel in the response inspector displays comprehensive diagnostics:
- **PASS**: The assertion condition was fully satisfied by the response.
- **FAIL**: The assertion condition was violated (e.g., expected 200, received 404).
- **Unevaluated**: No assertions were configured or all assertions were disabled.
- **Evaluation Error**: A malformed assertion or unsupported payload structure was encountered; fault isolation guarantees that individual errors never abort the remaining evaluation suite.
- **HTTP Execution Error**: A network or transport failure occurred (e.g., `ECONNREFUSED` or timeout); assertions are not evaluated because no response was received.
- **HTTP Success vs. Assertion Failure**: An HTTP 200 OK response can still have failed assertions. The HTTP status code represents the upstream server's transport outcome, whereas assertions represent client-defined business rules. If an upstream endpoint returns HTTP 200 with `{"status": "error"}`, an assertion expecting `status === "success"` will fail. DevProbe guarantees that assertion failures never mutate HTTP status codes or turn successful network responses into errors.

### 7. Saved Request Integration
- **Persistence**: Configured assertions are automatically serialized into `saved_requests.assertions` JSON column upon saving or updating requests.
- **Workspace Restoration**: Opening a saved request loads its complete assertion suite into the workspace editor with deep cloning, ensuring clean state separation.
- **Workspace Isolation**: Creating a new request or switching between requests resets assertion state without cross-request leakage.

### 8. History Integration
- **Automated Recording**: Every execution records its evaluated test results into MySQL `request_history.test_results` via a fire-and-forget flow.
- **Historical Immutability**: Inspecting past executions via the History Detail Modal renders the exact recorded test results snapshot without re-running assertions against current state.
- **Backward Compatibility**: Legacy executions lacking test results display a clean informational empty state without runtime errors.

### 9. Security
- **Strictly Declarative**: Prohibits `eval()`, `Function()`, and dynamic code interpretation, eliminating script injection risks.
- **Prototype-Pollution Protection**: JSON path parsers strictly reject forbidden properties (`__proto__`, `constructor`, `prototype`).
- **Credential Redaction**: Sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`, `x-api-key`) and sensitive JSON paths (`password`, `access_token`, `client_secret`) are masked with `[REDACTED]` in actual/expected fields and diagnostic messages.
- **Sensitive Target Restrictions**: Sensitive headers and JSON properties are restricted to existence checks (`exists`, `not_exists`), preventing accidental leakages via value matching.
- **Safe HTML Escaping**: All rendered strings, values, and diagnostic messages are sanitized with `escapeHtml()` prior to DOM insertion.

### 10. Database Changes
- **`saved_requests.assertions` JSON NULL**: Stores array of declarative assertion definitions attached to saved requests.
- **`request_history.test_results` JSON NULL**: Stores structured evaluation summaries (`summary` and `results`) with historical execution records.
- **Idempotent Migrations**: `database/init.js` and `database/schema.sql` automatically verify and apply columns idempotently without data loss.

### 11. Testing Instructions
Execute the verification test suites using standard npm or node commands:
```powershell
# Day 14 Automated Assertion & Testing Verification Suite (183 tests)
node test-day14.js

# Day 13 History & Comparison Suite (274 tests)
node test-day13.js

# Full Regression Suite (Days 3-12 — 754 tests)
npm test
```

### 12. Example Assertion
A declarative status code assertion definition:
```json
{
  "id": "assert_status_1",
  "type": "status_code",
  "property": null,
  "operator": "equals",
  "expected": 200,
  "enabled": true
}
```

### Database Troubleshooting

| Error Code | Meaning | Solution |
|---|---|---|
| `ECONNREFUSED` | Database server refused connection | Start MySQL in XAMPP Control Panel and check that port 3306 is open. |
| `ER_ACCESS_DENIED_ERROR` | Incorrect credentials | Check `DB_USER` and `DB_PASSWORD` in `.env`. Default XAMPP user is `root` with empty password. |
| `ER_BAD_DB_ERROR` | Target database does not exist | Run `npm run db:init` to create `devprobe_db` and apply schema tables. |
| `ETIMEDOUT` | Connection timed out | Verify `DB_HOST` is reachable (e.g. `127.0.0.1`). |

## 🗺️ Development Roadmap

| Phase | Milestone | Status |
|---|---|---|
| Days 1–2 | Project setup and frontend workspace interface | Completed |
| Days 3–4 | Request state management & backend validation architecture | Completed |
| Days 5–6 | Real HTTP execution engine, SSRF defense & response inspector improvements | Completed |
| Days 7–8 | Advanced error handling, security hardening & response viewer clipping fix | Completed |
| Day 9 | MySQL database connection pool, initial schema & health checks | Completed |
| Day 10 | Collections and saved requests persistence with secret credential protection | Completed |
| Day 11 | Saved request & collection management (edit, delete, disassociation, modals) | Completed |
| Day 12 | Environment management & dynamic variable resolution (AES-256-GCM, modals) | Completed |
| Day 13 | Request execution history, audit trail & side-by-side response comparison | Completed |
| Day 14 | Automated API response testing & assertion evaluation engine | Completed |
| Days 15–16 | User authentication, private workspaces, documentation generator, & final deployment | Planned |

## 👨‍💻 Developer

**Prasad Nilkanth Deshmukh**  
MCA Student | Full-Stack Development Enthusiast

## 📌 Project Status

**In Active Development** — Day 14 complete. Automated API response testing, declarative assertion evaluation engine, Assertion Builder UI, real-time response inspector results panel, and non-blocking MySQL test result persistence fully implemented. Comprehensive verification confirmed across status codes, latencies, response headers, body text, and nested JSON paths with strict credential redaction (`[REDACTED]`), prototype-pollution prevention, and workspace isolation. All 1,211 automated tests (754 regression + 274 Day 13 + 183 Day 14) passing with 100% pass rate and zero regressions.