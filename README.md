# The Daily Web — News Management System

A full-stack web application for writing, editing, approving and publishing news articles, in the style of a modern news site. Built with Node.js, Express, MongoDB, EJS and Vanilla JavaScript, following the MVC pattern.

## Technologies

- **Server:** Node.js, Express (MVC: models / views / controllers / routes)
- **Database:** MongoDB with Mongoose
- **Views:** EJS (server-rendered pages), HTML5 semantic tags, CSS with Flexbox (responsive)
- **Client:** Vanilla JavaScript with `fetch` (AJAX) — no front-end framework
- **Analytics graph:** Chart.js, installed with npm and served locally by the app
- **Sessions:** express-session stored in MongoDB (connect-mongo); passwords hashed with bcrypt
- **Logging:** custom file logger + morgan HTTP access log
- **Weather:** [Open-Meteo](https://open-meteo.com/) — free for non-commercial use, no API key and no credit card; its data is licensed CC BY 4.0, so the widget credits Open-Meteo

## Prerequisites

- **Node.js 18 or later** (LTS) — https://nodejs.org/en/download
- **MongoDB 7 (Community Edition)** running on `localhost:27017`. Any of these works:
  - **Windows:** install from https://www.mongodb.com/try/download/community with "Install MongoDB as a Service" checked
  - **macOS (Homebrew):** `brew services start mongodb-community`
  - **Docker (any OS):** `docker run -d -p 27017:27017 --name mongo mongo:7`

## Installation and Running

Run all commands from the project root (the folder containing `package.json`).

```bash
# 1. Install dependencies from the lockfile
npm ci

# 2. Load the demo data (only needed once)
npm run seed

# 3. Start the server
npm start
```

Open **http://localhost:3000**. For development with auto-restart, use `npm run dev`.

> ⚠️ **`npm run seed` deletes all existing data** in the target database before inserting the demo data. It asks for confirmation; `node seed/seed.js --yes` skips the prompt.

### Demo accounts (created by the seed)

| Role | Username | Password |
|------|----------|----------|
| Editor | `editor1` (also `editor2`) | `editor123` |
| Reporter | `reporter1` … `reporter5` | `reporter123` |

These are fictional local demonstration accounts.

### Demo data

The seed creates 2 editors, 5 reporters and **500 articles** across 8 categories: 300 published, 100 waiting for approval, 50 drafts and 50 returned for corrections. Fifty published articles also have a pending update. It adds 30 days of hourly view statistics, several articles with multiple approved updates after publication, and comments.

To add three more update-history examples **without** deleting anything (for example, to an existing database), run `npm run demo:updates`. It adds three fictional articles titled `Demo: …`, each with an initial publication, two approved updates and 72 hours of views.

### Configuration (optional)

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `MONGO_URI` | `mongodb://localhost:27017/the-daily-web` | MongoDB connection string |
| `SESSION_SECRET` | random, saved to `config/session-secret.key` | Secret for signing sessions |

If `SESSION_SECRET` is not set, a random secret is generated on first start and kept in `config/session-secret.key` (ignored by Git), so logged-in users stay logged in after a restart. Use the same `MONGO_URI` for the seed, the demo command and the server.

Examples — macOS/Linux: `PORT=3100 npm start` · Windows PowerShell: `$env:PORT=3100; npm start`

## Project Structure

```
├── app.js                     # Express entry point: middleware, sessions, routes, error handling
├── config/
│   └── db.js                  # MongoDB connection
├── models/                    # Mongoose models (the four main models)
│   ├── User.js                # reporters and editors (bcrypt password hash)
│   ├── Article.js             # article content, workflow status, auto-save and pending update
│   ├── Comment.js             # article comments
│   └── ViewStat.js            # hourly view counters + publish/update events for analytics
├── controllers/
│   ├── publicController.js    # home page, articles API (search/filter/sort/paging), article page
│   ├── commentController.js   # add comment
│   ├── authController.js      # login / logout
│   ├── reporterController.js  # reporter dashboard, create/auto-save/submit articles and updates
│   ├── editorController.js    # editor dashboard, review, edit, publish/return/delete, analytics
│   └── managementController.js# CRUD for users, comments and view records (editor only)
├── routes/
│   ├── index.js               # public routes
│   ├── auth.js                # /login, /logout
│   ├── reporter.js            # /reporter/* (reporter role only)
│   └── editor.js              # /editor/* (editor role only)
├── middleware/
│   ├── auth.js                # requireRole — server-side permission checks
│   └── rateLimit.js           # comment limit: 3 per minute per device and IP
├── utils/
│   ├── logger.js              # writes logs/app.log
│   ├── weather.js             # Open-Meteo client with a shared, self-refreshing cache
│   ├── secret.js              # session secret (environment variable or local file)
│   └── validation.js          # input validation and consistent error responses
├── views/                     # EJS templates
│   ├── index.ejs              # home page / news feed
│   ├── article.ejs            # full article page (rendered on the server for SEO)
│   ├── login.ejs, error.ejs
│   ├── partials/              # header, footer, weather widget
│   ├── reporter/              # dashboard, article editor
│   └── editor/                # dashboard, review, edit, analytics, data management
├── public/
│   ├── css/                   # style.css (shared), home.css, article.css
│   ├── js/                    # client-side scripts (one per page, see below)
│   └── images/                # placeholder image for missing/broken article images
├── seed/
│   ├── seed.js                # full demo data (deletes existing data)
│   └── add-demo-updates.js    # adds update-history examples without deleting data
└── logs/                      # app.log and access.log (created automatically)
```

Client scripts in `public/js/`: `home.js` (feed, infinite scroll, filters), `article.js` (comments), `article-editor.js` (reporter auto-save and submit), `editor.js` (delete), `editor-review.js` (approve/return), `editor-edit.js` (editor edits), `analytics.js` (graph), `management.js` (CRUD screen), `weather.js` (weather widget refresh/expiry), `image-fallback.js` (broken images).

## Main Features

### Public site (guests)

- **News feed with infinite scroll** — 20 more articles load automatically near the bottom, via AJAX, without reloading the page
- **Search** by title and summary, **filter** by category and viewed / not viewed (per visitor), **sort** by publish date or popularity. The current filters are kept in the URL
- Each card shows title, image, summary, category, reporter and publish date
- **Article page** — the full article is rendered on the server, so it is in the initial HTML (search-engine friendly). Every visit is counted for statistics
- **Comments** appear immediately after posting, without reloading the list
- **Comment limit** — at most 3 comments per minute from the same device; the server blocks more and returns a clear message. The limit is checked per signed device cookie and per IP address and is stored in MongoDB, so clearing cookies or restarting the server does not reset it
- **Weather widget** in the sidebar (Open-Meteo). The server refreshes one shared cache in the background, so thousands of visitors cause one provider request every 15 minutes and pages never wait for the provider. Weather is shown only while the observation is at most 15 minutes old; otherwise the widget shows "Currently unavailable" and keeps retrying

### Reporter

- Dashboard with own articles and their status: **Draft**, **Pending review**, **Published**, **Returned for corrections**
- Create articles, edit own drafts, submit for review, see the editor's note on returned articles, fix and resubmit
- **Auto-save** — work is saved to the server while typing, without pressing Save. Closing the browser, refreshing or switching computers does not lose saved work; reopening the article shows the latest version. A local backup also protects the last keystrokes before the server confirms them
- **Edit published articles** — changes are saved as a pending update. Readers keep seeing the published version until an editor approves the update

### Editor

- Dashboard of all articles with search, filter by status and category, and paging (50 per page)
- Review a submitted article: **publish** it, **return** it to the reporter with a required note, **edit** it, or **delete** it
- **Pending updates** to published articles are shown side by side (currently published vs. pending), with changed fields marked. Approving makes the new content public
- **Edit any article** — published articles are edited through a pending update, which the editor then approves
- **Impact Analytics** — a Chart.js graph of views per hour over time (24h / 7 days / 30 days / all), with a marker at every publish or approved update, to compare views before and after each update
- **Data management** screen — list, search, create, update and delete users, comments and view records

### Security and reliability

- Three user types: guest, reporter, editor. **All permission checks run on the server** — reporters can only edit their own articles and cannot publish
- Passwords are stored as bcrypt hashes. Failed logins are limited (10 per 15 minutes per IP) and the session ID is regenerated on login
- Sessions are stored in MongoDB, so **users stay logged in after a server restart**
- Invalid input, invalid IDs and unauthorized actions return clear errors without crashing the server. Article workflow changes use optimistic concurrency to reject stale saves
- Errors and important events are logged to `logs/app.log`; HTTP requests to `logs/access.log`
- Indexes and server-side paging keep the feed, dashboards and analytics fast with thousands of articles

## Troubleshooting

- **"MongoDB connection error"** — start MongoDB (Windows: `services.msc` → MongoDB Server → Start; macOS: `brew services start mongodb-community`; Docker: see Prerequisites).
- **"Port 3000 already in use"** — start on another port: `PORT=3001 npm start` (PowerShell: `$env:PORT=3001; npm start`).
- **Empty home page / cannot log in** — run `npm run seed` against the same `MONGO_URI` the server uses.
- **Weather shows "Currently unavailable"** — the provider is unreachable or has not published a fresh observation yet; the widget retries automatically.

## Submission

`node_modules`, logs and the local session secret are not committed. Create the ZIP from the submitted commit with:

```bash
git archive --format=zip --output=../daily-web-submission.zip HEAD
```
