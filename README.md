# DevProbe — API Testing and Documentation Platform

DevProbe is a lightweight, modern platform designed for API testing, inspection, and documentation.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
- **Backend:** Node.js, Express.js
- **Database:** MySQL (planned)
- **Version Control:** Git & GitHub

---

## 📅 Current Status

**Day 1 — Project Setup**
- Initial project architecture and directory skeleton established.
- Express server configured with static file serving and health check endpoint.
- Environment variable configuration setup (`.env` / `.env.example`).
- Starter frontend structure prepared.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone or open the repository:
   ```bash
   cd DevProbe
   ```

2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

---

## 💻 Running the Server

### Development Mode (with auto-reload via Nodemon)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

---

## 🌐 Local Endpoints

Once the server is running, you can access:

- **Homepage:** [http://localhost:3000/](http://localhost:3000/)
- **Health Check Endpoint:** [http://localhost:3000/api/health](http://localhost:3000/api/health)
  - Expected response:
    ```json
    {
      "success": true,
      "message": "DevProbe server is running"
    }
    ```

---

## 📌 Upcoming Features (Planned)

- [ ] **UI Dashboard (Day 2):** Interactive API request builder with method selector, headers, and body tabs.
- [ ] **API Execution Engine:** Ability to execute HTTP requests (GET, POST, PUT, DELETE, PATCH) directly from the browser.
- [ ] **Response Inspector:** Syntax-highlighted response viewer with status codes, headers, and response times.
- [ ] **Collections & Folders:** Save and organize endpoints into categorized workspaces.
- [ ] **MySQL Integration:** Store request histories, environment variables, and saved collections.
- [ ] **API Documentation Generator:** Automatically generate shareable docs from tested endpoints.
