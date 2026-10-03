# The Daily Web — News Management System

A full-stack web application for managing, editing, and publishing news articles. Built with Node.js, Express, MongoDB, EJS, and Vanilla JavaScript.

## Prerequisites

- **Node.js** v18+
- **MongoDB** running locally on port 27017 (or set `MONGO_URI` env var)

## Installation

```bash
cd the-daily-web
npm install
```

## Running the Application

```bash
# Start the server
npm start

# Or with auto-reload (development)
npm run dev
```

Open http://localhost:3000

## Seeding Demo Data

Before the first run, populate the database with 500+ demo articles, users, and statistics:

```bash
npm run seed
```

> ⚠️ **WARNING:** seeding **deletes all existing data** in the target database before inserting the demo data. The script asks for confirmation; pass `--yes` to skip the prompt.

**Demo login credentials:**

| Role | Username | Password |
|------|----------|----------|
| Editor | `editor1` | `editor123` |
| Reporter 1 | `reporter1` | `reporter123` |
| Reporter 2 | `reporter2` | `reporter123` |
| Reporter 3–5 | `reporter3`–`reporter5` | `reporter123` |

## Project Structure

```
the-daily-web/
├── app.js                  # Express entry point
├── config/
│   └── db.js               # MongoDB connection
├── controllers/
│   ├── authController.js   # Login / logout
│   ├── publicController.js # Home, article page, articles API
│   ├── commentController.js# Add comment
│   ├── reporterController.js # Reporter dashboard, article editing
│   └── editorController.js # Editor dashboard, approve/return, analytics
├── models/
│   ├── User.js             # users (reporter / editor)
│   ├── Article.js          # articles with state machine
│   ├── Comment.js          # article comments
│   └── ViewStat.js         # hourly view buckets for analytics
├── middleware/
│   ├── auth.js             # requireAuth / requireRole guards
│   └── rateLimit.js        # comment rate limiting (3/min per device)
├── routes/
│   ├── index.js            # public routes
│   ├── auth.js             # /login, /logout
│   ├── reporter.js         # /reporter/* (requires reporter role)
│   └── editor.js           # /editor/* (requires editor role)
├── utils/
│   ├── logger.js           # file + console logger
│   └── weather.js          # Open-Meteo weather API with 15-min cache
├── views/                  # EJS templates
│   ├── index.ejs           # Home / news feed
│   ├── article.ejs         # Full article page (SSR for SEO)
│   ├── login.ejs
│   ├── error.ejs
│   ├── reporter/           # Reporter area views
│   └── editor/             # Editor area views
├── public/
│   ├── css/                # Stylesheets
│   └── js/                 # Client-side JavaScript
├── seed/
│   └── seed.js             # Demo data seeder
└── logs/                   # Server & access logs (created automatically)
```

## Key Features

### Public

- **Infinite-scroll news feed** — loads 20 articles at a time via AJAX, no full page reload
- **Search** — full-text search on title and summary
- **Filters** — by category, viewed/not-viewed; sort by date or popularity
- **Article page** — full SSR content for SEO; comments section with live-appending (no reload)
- **Comment rate limiting** — server-enforced max 3 comments per minute per device
- **Weather widget** — powered by Open-Meteo (no API key required), cached 15 minutes

### Reporter

- Dashboard: view own articles and their status
- Create, auto-save, and edit articles
- **Auto-save** — work persists to the server every 3 seconds; safe across browser close/device switch
- Article workflow: Draft → Pending Review → (Published or Returned)
- Edit already-published articles: current version stays live until the update is approved

### Editor

- View and filter all articles by status and category
- Approve / publish articles; return them with notes to the reporter
- Handle pending updates to published articles (side-by-side diff view)
- **Analytics dashboard** — Chart.js graph of hourly views with vertical markers at each publish/update event
- Delete articles

### Technical

- **MVC architecture** — controllers, models, routes fully separated
- **REST API** — all AJAX interactions follow REST conventions
- **Sessions in MongoDB** (connect-mongo) — survive server restarts
- **bcrypt** password hashing
- **Server-side authorization** — all permission checks on the server, not just UI
- **Responsive** — Flexbox-based layout, works on mobile/tablet/desktop
- **Semantic HTML5** — proper `<article>`, `<header>`, `<aside>`, `<time>`, `<figure>` tags
- **Error logging** — `logs/app.log` and `logs/access.log`
