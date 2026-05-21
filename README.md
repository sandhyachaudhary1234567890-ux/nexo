# Nexo — AI-Powered B2B Lead Generation & CRM Platform

## Prerequisites

- **Node.js** v20+
- **Docker** & **Docker Compose** v2+
- **npm** v9+

---

## Quick Start

### 1. Clone & navigate

```bash
git clone https://github.com/your-org/nexo.git
cd nexo
```

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
```

Open `server/.env` and fill in all required values. At minimum you need:

| Variable | Description |
|---|---|
| `JWT_SECRET` | 64-char random string |
| `JWT_REFRESH_SECRET` | 64-char random string (different from above) |
| `OPENAI_API_KEY` | From platform.openai.com |
| `GEMINI_API_KEY` | From aistudio.google.com |
| `SMTP_*` | Mail server credentials |

Generate strong secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Start infrastructure (MongoDB + Redis)

```bash
docker-compose up -d
```

Verify services are running:
```bash
docker-compose ps
```

Wait for health checks to pass (typically 10–20 seconds).

### 4. Install server dependencies

```bash
cd server
npm install
```

### 5. Start development server

```bash
npm run dev
```

The server will start on `http://localhost:5000`.

---

## Available Endpoints

| Path | Description |
|---|---|
| `GET /api/health` | Health check |
| `POST /api/auth/register` | Register new user |
| `POST /api/auth/login` | Login |
| `POST /api/auth/refresh` | Refresh access token |
| `GET /api/leads` | List leads (auth required) |
| `GET /api/crm/pipeline` | CRM pipeline (auth required) |
| `GET /api/campaigns` | Campaigns (auth required) |
| `GET /api/ai/enrich` | AI enrichment (auth required) |
| `GET /admin/queues` | Bull Board dashboard |

---

## Bull Board (Job Queue Dashboard)

Navigate to `http://localhost:5000/admin/queues`

- **Username**: set in `BULL_BOARD_USERNAME` (default: `admin`)
- **Password**: set in `BULL_BOARD_PASSWORD` (default: `admin123`)

---

## Project Structure

```
nexo/
├── docker-compose.yml
├── README.md
└── server/
    ├── package.json
    ├── .env.example
    └── src/
        ├── app.js              # Express app setup
        ├── server.js           # Entry point + Socket.io
        ├── config/
        │   ├── env.js          # Zod-validated env
        │   ├── db.js           # Mongoose connection
        │   ├── redis.js        # IORedis client
        │   └── logger.js       # Winston logger
        ├── models/             # Mongoose models
        ├── routes/             # Express routers
        ├── controllers/        # Route handlers
        ├── services/           # Business logic
        ├── jobs/               # BullMQ workers & queues
        ├── middleware/         # Express middleware
        └── utils/              # Helpers & validators
```

---

## Running Tests

```bash
cd server
npm test
```

---

## Stopping Services

```bash
# Stop dev server: Ctrl+C

# Stop Docker services
docker-compose down

# Stop and remove volumes (resets DB)
docker-compose down -v
```

---

## Environment Variables Reference

See [`server/.env.example`](server/.env.example) for full documentation of all environment variables.
