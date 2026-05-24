# BIOShield — AI-Powered Biosecurity Exercise Simulator

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-blue)](https://dev.mysql.com/)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.5--flash-orange)](https://ai.google.dev/)
[![Live Demo](https://img.shields.io/badge/Live-bio.digitalaashish.com-brightgreen)](https://bio.digitalaashish.com)

BIOShield is a real-time biosecurity emergency response training simulator built for biosecurity professionals, students, and organisations. It uses AI (Google Gemini 2.5 Flash) to evaluate participant responses during live exercise scenarios such as Foot-and-Mouth Disease (FMD) and Xylella fastidiosa outbreaks.

---

## Live Application

**[https://bio.digitalaashish.com](https://bio.digitalaashish.com)**

---

## Features

- **AI-Powered Scoring** — Gemini 2.5 Flash evaluates participant responses against biosecurity protocols in real time
- **Live Exercise Rooms** — Admin creates rooms; participants join with a room code and password via WebSocket
- **Scenario Builder** — Upload Word documents to auto-parse scenarios, or build them manually
- **Admin Dashboard** — Full control over rooms, scenarios, participants, and exercise flow
- **PDF Report Export** — Downloadable exercise summary with scores and AI feedback
- **API Status Monitor** — Real-time Gemini API health indicator for admins
- **Multi-scenario Support** — Supports FMD, Xylella, and custom biosecurity scenarios

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js (v18+), HTTP + WebSocket (ws) |
| Frontend | Vanilla JS, HTML5, CSS3, Chart.js |
| Database | MySQL 8.0 |
| AI | Google Gemini 2.5 Flash API |
| Deployment | Hostinger VPS, PM2, Nginx |

---

## Project Structure

```
bioshield/
├── api/
│   └── server.js          # Main backend — REST API + WebSocket server
├── src/
│   ├── index.html         # Login / participant join page
│   ├── game.js            # Participant exercise interface
│   ├── admin.html         # Admin dashboard
│   ├── admin.js           # Admin panel logic
│   ├── admin.css          # Admin styles
│   └── style.css          # Global styles
├── data/
│   ├── scenarios/
│   │   ├── scenario.json  # Default FMD scenario
│   │   └── xylella.json   # Xylella fastidiosa scenario
│   └── keywords.json      # Keyword fallback scoring
├── ecosystem.config.js    # PM2 process config
├── Procfile               # Heroku/deployment config
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8.0
- A Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### Installation

```bash
# Clone the repository
git clone https://github.com/digitalaashish/bioshield.git
cd bioshield

# Install dependencies
npm install

# Set up the database
mysql -u root -p -e "CREATE DATABASE bioshield;"

# Configure environment variables — edit ecosystem.config.js
# and fill in your DB credentials and Gemini API key
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MySQL host (default: `localhost`) |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name (default: `bioshield`) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `PORT` | Server port (default: `8000`) |

### Run with PM2 (Production)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

### Run Locally

```bash
node api/server.js
# Visit http://localhost:8000
```

---

## Security Notes

- Change the default admin password immediately after first login via **Admin Panel → Settings**
- Never commit your `.env` or `ecosystem.config.js` with real credentials
- The Gemini API key can also be set via the Admin Panel UI after deployment

---

## Team

Developed as a capstone project at **Charles Darwin University (CDU)**, May 2026.

| Member | Role |
|--------|------|
| Aashish | Lead Developer |
| Amanparteek | Requirements & Project Management |
| Taniya | Documentation |
| Rushabh Savaj | Testing & QA |

**Client:** Dr. Anne Walters — Director, NAPCaRN & CEO, Anima Co.

---

## License

Developed for academic and research purposes at Charles Darwin University.
