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

**Day 9 of 16 — MySQL Database Integration**

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
├── database/
│   ├── schema.sql                  # Initial MySQL/MariaDB DDL schema (collections, saved_requests)
│   └── init.js                     # Safe database initialization & migration script
│
├── public/
│   ├── index.html                  # DevProbe workspace HTML interface
│   ├── css/
│   │   └── style.css               # Dark-theme CSS design system & response viewer styles
│   └── js/
│       └── app.js                  # Frontend state management, Send button dispatch, & response renderer
│
├── src/
│   ├── app.js                      # Express application entry point, health check, & database readiness
│   ├── config/
│   │   ├── database.js             # MySQL connection pool, health check, & sanitized error handling
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
├── test-day4.js                    # Day 4 automated verification test suite (36 tests)
├── test-day5.js                    # Day 5 automated verification test suite (44 tests)
├── test-day6.js                    # Day 6 automated verification test suite (118 tests)
├── test-day7.js                    # Day 7 automated verification test suite (62 tests)
├── test-day8.js                    # Day 8 automated verification test suite (71 tests)
├── test-day9.js                    # Day 9 automated database integration test suite (61 tests)
├── .env                            # Local environment configuration
├── .env.example                    # Environment configuration template
├── .gitignore                      # Git ignored files & directories
├── package.json                    # Project metadata, scripts, and dependencies
├── package-lock.json               # Locked dependency tree
└── README.md                       # Project documentation
```

## 🏗️ Backend Architecture

DevProbe adheres to a structured, layered architecture:

- **`src/app.js`**: Bootstraps the Express application, configures security headers (`nosniff`, `DENY`), serves public assets, mounts API routes, provides application health check (`GET /api/health`) and database readiness check (`GET /api/health/db`), and manages graceful shutdown.
- **`src/config/database.js`**: Manages the MySQL connection pool singleton via `mysql2/promise`, reads configuration from environment variables, provides connectivity test and health check helpers, enforces parameterized query safety, and translates raw database errors into sanitized user-safe diagnostics.
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

### 5. Collections API (Day 10)
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

### 6. Saved Requests API (Day 10)
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
```

### 3. Start MySQL in XAMPP

If you are using XAMPP for local MySQL development:
1. Open the **XAMPP Control Panel**.
2. Locate the **MySQL** module row.
3. Click the **Start** button next to MySQL.
4. Verify the status indicator turns green and displays Port **`3306`**.

### 4. Initialize Database Schema

You can apply the initial relational schema (`collections`, `saved_requests`) using any of the following methods:

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

DevProbe features a multi-tiered automated test suite with **517 passing tests** across 8 test suites, verifying client state, backend validation, SSRF security, real HTTP execution, response formatting, database integration, collections, and saved requests persistence:

```bash
# Run all test suites (Day 3 through Day 10 — 517 total tests)
npm test

# Run individual test suites
npm run test:day3    # Day 3: Frontend state & parameter parsing (34 tests)
npm run test:day4    # Day 4: Backend validation & SSRF defense (67 tests)
npm run test:day5    # Day 5: Real HTTP execution & socket pinning (68 tests)
npm run test:day6    # Day 6: Response viewer & formatting states (65 tests)
npm run test:day7    # Day 7: Error handling & security headers (63 tests)
npm run test:day8    # Day 8: Security hardening & IPv6 edge cases (71 tests)
npm run test:day9    # Day 9: MySQL database integration (61 tests)
npm run test:day10   # Day 10: Collections & saved requests persistence (88 tests)
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
| Days 11–12 | Authentication headers, environments & request history persistence | Planned |
| Days 13–16 | Environment variables, automated tests, documentation, and final deployment | Planned |

## 👨‍💻 Developer

**Prasad Nilkanth Deshmukh**  
MCA Student | Full-Stack Development Enthusiast

## 📌 Project Status

**In Active Development** — Day 10 complete. Persistent MySQL collections and saved requests implemented with `GET`/`POST /api/collections` and `GET`/`POST /api/requests/saved`, collection filtering, secret credential protection (purging passwords, bearer tokens, and session cookies), interactive workspace dialogs, safe request loading without execution dispatch, and 517 automated tests passing with zero regressions.