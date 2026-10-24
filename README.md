# DevProbe — API Testing and Documentation Platform

DevProbe is a lightweight, full-stack web application designed to help developers test HTTP APIs, inspect responses, organize requests, and generate API documentation.

The project aims to provide a simple, developer-friendly workspace for testing and managing API requests.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Frontend structure |
| CSS3 | Styling and responsive design |
| JavaScript | Frontend functionality & backend logic |
| Node.js | Backend JavaScript runtime |
| Express.js | Backend server, API routes, and middleware |
| MySQL | Database for persistent storage (planned) |
| Git & GitHub | Version control and collaboration |

## 📅 Current Development Status

**Day 4 of 16 — Backend Architecture and API Execution Preparation**

Completed Milestones:
- **Day 1**: Project setup, initial Express server, health-check endpoint, and Git integration.
- **Day 2**: Modern Postman-inspired dark-mode workspace UI with responsive sidebar, request bar, tabs, and response viewer.
- **Day 3**: Centralized client-side request state management, parameter parsing, header validation, variable resolution (`{{base_url}}`), and in-memory credential handling.
- **Day 4**: Layered backend architecture, request validation endpoint (`POST /api/requests/validate`), security configuration & SSRF defense layer, execution limits, centralized error handling, and automated test suite.

The application is currently under active development.

## ✨ Planned Features

The following features will be implemented progressively during development:

- [x] **Frontend Request Workspace** — Interactive workspace UI with request bar, params, headers, body, and auth tabs.
- [x] **Request State & Config** — Centralized client request state and live URL preview.
- [x] **Backend Architecture & Validation** — Clean layered backend with robust request configuration validation and SSRF guards.
- [ ] **Outbound API Request Engine** — Safe dispatching of HTTP requests and live response capture (Day 5).
- [ ] **Response Inspector** — Inspect response body, status code, headers, and latency metrics.
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
│   │   └── style.css               # Dark-theme CSS design system
│   └── js/
│       └── app.js                  # Frontend state management & UI synchronization
│
├── src/
│   ├── app.js                      # Express application entry point & middleware pipeline
│   ├── config/
│   │   └── security.js             # Security policies, SSRF defenses, and execution limits
│   ├── controllers/
│   │   └── requestController.js    # Request endpoint controller
│   ├── middleware/
│   │   ├── errorHandler.js         # Centralized error handler and 404 handler
│   │   └── validateRequest.js      # Request payload validation middleware
│   ├── routes/
│   │   └── requestRoutes.js        # Request configuration route definitions
│   └── services/
│       └── requestService.js       # Request normalization & preparation service
│
├── test-day3.js                    # Day 3 automated verification test suite
├── test-day4.js                    # Day 4 automated verification test suite (Tests A-M)
├── .env                            # Local environment configuration
├── .env.example                    # Environment configuration template
├── .gitignore                      # Git ignored files & directories
├── package.json                    # Project metadata, scripts, and dependencies
├── package-lock.json               # Locked dependency tree
└── README.md                       # Project documentation
```

## 🏗️ Backend Architecture

DevProbe backend adheres to standard separation of concerns:

- **`src/app.js`**: Bootstraps the Express application, configures body-parsers with payload limits (`1mb`), serves public assets, mounts API routes, registers the 404 handler for unknown routes, and registers the centralized error-handling middleware. Ensures servers only bind when run directly (`require.main === module`).
- **`src/config/security.js`**: Contains execution limits (timeouts, payload sizes, redirects), permitted HTTP methods/protocols, sensitive header classifications, and SSRF defense logic (inspects hostnames, IPv4 ranges, IPv6 representations, IPv4-mapped IPv6, and cloud metadata addresses).
- **`src/middleware/validateRequest.js`**: Validates incoming request payloads for `POST /api/requests/validate`. Rejects unsupported HTTP methods, invalid URLs, non-HTTP protocols, embedded credentials, restricted destinations, malformed RFC 7230 headers, and oversized payloads.
- **`src/middleware/errorHandler.js`**: Intercepts JSON syntax errors, payload size limits (413), validation errors (400), unknown routes (404), and internal server errors (500). Guarantees consistent JSON error structures and prevents leakage of internal stack traces, filesystem paths, or secrets.
- **`src/services/requestService.js`**: Normalizes request configurations and prepares execution metadata for Day 5 without dispatching network calls. Redacts sensitive authentication tokens and headers.
- **`src/controllers/requestController.js`**: Reads validated request descriptors, calls the normalization service, and formats HTTP 200 responses.

## 🔒 Security Architecture & SSRF Defenses

DevProbe is an API testing platform designed to execute requests specified by developers. Consequently, target URL handling is high-risk.

### Current Defenses (Day 4 Configuration Validation)
- **Protocol Enforcement**: Strictly allows `http:` and `https:`. Rejects `file:`, `ftp:`, `javascript:`, `data:`, etc.
- **Embedded Credentials Block**: Rejects URLs containing `user:password@host` to prevent credential smuggling.
- **Hostname Restrictions**: Disallows `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.lan`, and `*.home.arpa`.
- **Cloud Metadata Defense**: Blocks access to cloud instance metadata services (e.g., `169.254.169.254`, `100.100.100.200`, `metadata.google.internal`, `instance-data`).
- **Private & Reserved IP Ranges**: Blocks loopback (`127.0.0.0/8`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), multicast (`224.0.0.0/4`), and reserved addresses (`240.0.0.0/4`).
- **IPv6 and Alternate Encodings**: Handles standard IPv6, expanded words, IPv6 loopback (`::1`), IPv6 private/unique local (`fc00::/7`), and IPv4-mapped IPv6 formats (`::ffff:127.0.0.1`, `::ffff:7f00:1`).
- **Zero Credential Exposure**: Authorization headers, cookies, and tokens are scrubbed and replaced with `[REDACTED]` in preparation responses and are never logged to console or persisted.

> [!WARNING]
> **SSRF Protection Notice for Outbound Execution (Day 5)**:
> Server-side URL validation at configuration time is only the first line of defense. Hostname validation alone is **INSUFFICIENT** to prevent DNS rebinding attacks (where a public hostname resolves to a public IP during validation, but resolves to a private IP at connection time).
>
> Prior to enabling real outbound requests in Day 5, the execution engine will implement:
> 1. Real-time DNS pre-resolution immediately prior to socket connection.
> 2. IP address verification against private/restricted ranges.
> 3. Connection pinning directly to the verified IP address.
> 4. Mandatory re-validation of each redirect target.
> 5. Hard socket timeouts and response stream size caps.

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

### 2. Request Configuration Validation
- **Route**: `POST /api/requests/validate`
- **Description**: Validates and prepares an HTTP request configuration for Day 5 execution. **Does NOT send an outbound HTTP request.**
- **Request Headers**: `Content-Type: application/json`
- **Example Request Body**:
  ```json
  {
    "method": "GET",
    "url": "https://jsonplaceholder.typicode.com/users/1",
    "headers": {
      "Accept": "application/json",
      "Authorization": "Bearer sample-token"
    },
    "body": null
  }
  ```
- **Example Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Request configuration validated successfully",
    "data": {
      "method": "GET",
      "url": "https://jsonplaceholder.typicode.com/users/1",
      "readyForExecution": true,
      "headers": {
        "Accept": "application/json",
        "Authorization": "[REDACTED]"
      },
      "body": {
        "present": false,
        "sizeBytes": 0,
        "mediaType": null
      },
      "settings": {
        "timeoutMs": 10000,
        "maxRedirects": 5,
        "maxResponseSizeBytes": 5242880
      },
      "executionStatus": "NOT_EXECUTED",
      "message": "Configuration validated and prepared for Day 5 execution engine. No outbound HTTP requests were dispatched."
    }
  }
  ```

### 3. API Error Status Codes
- `200 OK`: Request configuration validated and ready for execution.
- `400 Bad Request`: Malformed JSON, unsupported HTTP method, invalid URL, prohibited target, or invalid header names/values.
- `413 Payload Too Large`: Request body exceeds maximum allowed size (1 MB).
- `404 Not Found`: Unknown API endpoint.
- `500 Internal Server Error`: Unexpected server fault (stack traces and secrets suppressed).

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)
- [Git](https://git-scm.com/)

### 1. Clone the Repository

```bash
git clone https://github.com/P-deshmukh-03/DevProbe.git
cd DevProbe
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default contents:
```dotenv
PORT=3000
NODE_ENV=development
DEVPROBE_ALLOW_LOCAL_TARGETS=false
```

### 4. Start the Application

- **Development Mode (with auto-reload)**:
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

Open your browser at: `http://localhost:3000`

## 🧪 Running Automated Tests

DevProbe includes comprehensive automated test suites covering both frontend state logic and backend API validation:

```bash
# Run both Day 3 and Day 4 test suites
npm test

# Run Day 3 frontend state & parameter tests (34 tests)
npm run test:day3

# Run Day 4 backend architecture, SSRF, & validation tests (67 tests, Tests A-M)
npm run test:day4
```

### Day 4 Test Coverage (Tests A through M)
- **TEST A**: Health check endpoint (`GET /api/health`).
- **TEST B**: Valid request configuration preparation (`POST /api/requests/validate`).
- **TEST C**: Rejection of unsupported HTTP methods (`TRACE`, etc.).
- **TEST D**: Rejection of malformed URLs.
- **TEST E**: Rejection of unsupported protocols (`file:`, `ftp:`).
- **TEST F**: Rejection of embedded credentials (`user:pass@host`).
- **TEST G**: Rejection of unsafe destinations (localhost, private IPv4/IPv6, metadata IMDS).
- **TEST H**: Rejection of invalid header names and non-string header values.
- **TEST I**: Rejection of missing required fields (URL, method).
- **TEST J**: Controlled 404 response for unknown API routes.
- **TEST K**: Controlled error handling for malformed JSON and oversized bodies (413).
- **TEST L**: Complete redaction and non-leakage of bearer tokens, cookies, and passwords.
- **TEST M**: Verification that zero outbound HTTP requests are dispatched during validation.

## 🗺️ Development Roadmap

| Phase | Planned Work | Status |
|---|---|---|
| Days 1–2 | Project setup and frontend interface | Completed |
| Days 3–4 | Request state management & backend validation architecture | Completed |
| Days 5–8 | API execution, response inspection, and database schema | Upcoming |
| Days 9–12 | Collections, saved requests, authentication, and request history | Planned |
| Days 13–16 | Environment variables, automated tests, documentation, and final verification | Planned |

## 👨‍💻 Developer

**Prasad Nilkanth Deshmukh**  
MCA Student | Full-Stack Development Enthusiast

## 📌 Project Status

**In Development** — Day 4 completed. All backend architecture, validation rules, SSRF protections, and automated test suites implemented and verified.