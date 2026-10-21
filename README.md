# DevProbe — API Testing and Documentation Platform

DevProbe is a lightweight, full-stack web application designed to help developers test HTTP APIs, inspect responses, organize requests, and generate API documentation.

The project aims to provide a simple, developer-friendly workspace for testing and managing API requests.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Frontend structure |
| CSS3 | Styling and responsive design |
| JavaScript | Frontend functionality |
| Node.js | Backend JavaScript runtime |
| Express.js | Backend server and API routes |
| MySQL | Database for persistent storage (planned) |
| Git & GitHub | Version control and collaboration |

## 📅 Current Development Status

**Day 1 of 16 — Project Setup**

Completed:
- Established the initial project structure.
- Configured the Node.js project.
- Set up Express.js and environment variables.
- Created the initial Express server.
- Added a health-check endpoint.
- Prepared the starter frontend.
- Configured Git and GitHub.

The application is currently under development.

## ✨ Planned Features

The following features will be implemented progressively during development.

- [ ] **API Request Builder** — Create HTTP requests using GET, POST, PUT, PATCH, and DELETE methods.
- [ ] **Response Inspector** — View response bodies, HTTP status codes, headers, and response times.
- [ ] **Query Parameters and Headers** — Configure request parameters and custom headers.
- [ ] **Request Body Editor** — Send JSON request bodies.
- [ ] **Request Collections** — Save and organize API requests into collections.
- [ ] **User Authentication** — Provide individual user accounts and private workspaces.
- [ ] **Request History** — Review and reuse previously executed requests.
- [ ] **Environment Variables** — Manage different API environments.
- [ ] **Automated API Testing** — Validate status codes, response fields, and response times.
- [ ] **API Documentation Generator** — Generate documentation from saved requests.
- [ ] **Import and Export** — Transfer collections using JSON files.

## 📁 Project Structure

```text
DevProbe/
│
├── public/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
│
├── src/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   ├── config/
│   └── app.js
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

Install the following tools:

- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)
- [Git](https://git-scm.com/)

### 1. Clone the Repository

```bash
git clone https://github.com/P-deshmukh-03/DevProbe.git
```

Navigate to the project directory:

```bash
cd DevProbe
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root directory.

Add the following configuration:

```dotenv
PORT=3000
NODE_ENV=development
```

Alternatively, copy `.env.example` to `.env` and verify the values.

**Important:** Never commit your `.env` file or private credentials to GitHub.

### 4. Start the Development Server

Run:

```bash
npm run dev
```

The development server should start at:

`http://localhost:3000`

If Nodemon is not installed, install it as a development dependency:

```bash
npm install --save-dev nodemon
```

### 5. Start the Server Normally

To run the application without Nodemon, use:

```bash
npm start
```

## 🌐 Local Endpoints

When the server is running, the following endpoints should be available.

| Endpoint | Description |
|---|---|
| `http://localhost:3000/` | DevProbe homepage |
| `http://localhost:3000/api/health` | Backend health-check endpoint |

### Health-Check Response

The `/api/health` endpoint should return:

```json
{
  "success": true,
  "message": "DevProbe server is running"
}
```

This endpoint helps verify that the Express server is running correctly.

## 🗺️ Development Roadmap

| Phase | Planned Work |
|---|---|
| Days 1–4 | Project setup and frontend interface |
| Days 5–8 | API execution, response inspection, and database schema |
| Days 9–12 | Collections, saved requests, authentication, and request history |
| Days 13–16 | Environment variables, automated tests, documentation, and final verification |

The roadmap is a development target. Features will be marked as complete as they are implemented and tested.

## 🎯 Project Goal

The goal of DevProbe is to build a practical API testing and documentation tool while learning full-stack development, backend architecture, database integration, authentication, and software testing.

## 👨‍💻 Developer

**Prasad Nilkanth Deshmukh**

MCA Student | Full-Stack Development Enthusiast

## 📌 Project Status

**In Development**

This project is being developed incrementally, with regular updates pushed to GitHub.

More features and improvements will be added throughout the development process.