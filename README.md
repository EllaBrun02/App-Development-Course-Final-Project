# The Daily Web — News Management System

A full-stack web application for managing, editing, and publishing news articles. Built with Node.js, Express, MongoDB, EJS, and Vanilla JavaScript.

## Prerequisites

- **Node.js** v18+
- **MongoDB** running locally on port 27017 (or set `MONGO_URI` env var)

## Installation

```bash
# Run from the folder containing package.json
npm ci
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

These are fictional local demonstration accounts, not production credentials.

### Add update-history examples to an existing database

```bash
npm run demo:updates
```

This adds three clearly labelled fictional stories, each with an initial publication, two approved-update markers and 72 hourly view buckets. It preserves existing users, comments and articles, and skips completed examples when run again. A reporter account must already exist. To demonstrate the graphs, search for `Demo:` in the editor dashboard and select **Analytics → Last 7 days**.

Set `MONGO_URI` to the same database for setup, demo preparation and application startup. For the existing local demo, use `mongodb://127.0.0.1:27017/ella_daily_web`. Unlike `npm run seed`, `npm run demo:updates` does not clear the database.

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
│   ├── editorController.js # Editor dashboard, approve/return, analytics
│   └── managementController.js # Protected users/comments/view-stat CRUD
├── models/
│   ├── User.js             # users (reporter / editor)
│   ├── Article.js          # articles with state machine
│   ├── Comment.js          # article comments
│   └── ViewStat.js         # hourly view buckets for analytics
├── middleware/
│   ├── auth.js             # requireAuth / requireRole guards
│   └── rateLimit.js        # Persistent rolling comment limits
├── routes/
│   ├── index.js            # public routes
│   ├── auth.js             # /login, /logout
│   ├── reporter.js         # /reporter/* (requires reporter role)
│   └── editor.js           # /editor/* (requires editor role)
├── utils/
│   ├── logger.js           # file + console logger
│   ├── weather.js          # Shared refresh, observation expiry, retry backoff
│   ├── secret.js           # Environment or persistent local signing secret
│   └── validation.js       # Input, URL, ID, revision and error validation
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
│   ├── seed.js             # Destructive full demonstration seed
│   └── add-demo-updates.js # Add repeatable update examples without a wipe
└── logs/                   # Server & access logs (created automatically)
```

Client scripts under `public/js/`: `home.js` handles the feed and URL filters; `article.js` appends comments; `article-editor.js` handles reporter drafts and recovery; `editor-edit.js` saves editor corrections; `editor.js` handles dashboard deletion; `editor-review.js` handles comparison and approval/return actions; `analytics.js` renders hourly graphs; `management.js` implements protected CRUD forms; `weather.js` refreshes and expires weather; `image-fallback.js` handles failed image loads. CSS is split between shared, home and article styles; `public/images/` contains the article placeholder.

Reporter templates are `dashboard.ejs` and `article-editor.ejs`. Editor templates are `dashboard.ejs`, `article-review.ejs`, `article-edit.ejs`, `analytics.ejs` and `manage.ejs`. Shared header, footer and weather templates live in `views/partials/`. Design references live in `design-system/`; `docs/` records audit changes and verification notes.

The four domain models are User, Article, Comment and ViewStat. MongoDB also holds infrastructure collections: sessions (managed by connect-mongo) and `commentLimits` (short-lived, hashed limiter keys). They are not editable newsroom content.

## Key Features

### Public

- **Infinite-scroll news feed** — loads 20 articles at a time via AJAX, no full page reload
- **Search** — full-text search on title and summary
- **Filters** — by category, viewed/not-viewed; sort by date or popularity
- **Article page** — full SSR content for SEO; comments section with live-appending (no reload)
- **Comment rate limiting** — at most three attempts in a rolling minute per signed device and IP address, stored in MongoDB. Cookie resets and server restarts do not grant a new allowance. People sharing an IP address also share the network allowance; attempts can count even if validation or a later write fails. If the limiter store is unavailable, posting temporarily returns 503.
- **Weather widget** — powered by Open-Meteo, with no API key. The provider's GMT observation time determines a 15-minute expiry. Expired values disappear, including on open/resumed pages; failures display “Currently unavailable.” Concurrent refreshes share one request, with a one-minute retry backoff after failures. See the [provider's timestamp documentation](https://open-meteo.com/en/docs).

### Reporter

- Dashboard: view own articles and their status
- Create, auto-save, and edit articles
- **Auto-save** — new partial drafts are created automatically. Saves are queued after typing pauses; acknowledged server saves survive reload, a new device and server restart. Local recovery protects edits not yet acknowledged by the server on the same browser. Unsent local edits are not available on another computer. Save/error status and navigation warnings identify outstanding work.
- Article workflow: Draft → Pending Review → (Published or Returned)
- Edit already-published articles: current version stays live until the update is approved

### Editor

- View/search/filter all articles, including pending updates, with 50 results per page
- Approve / publish articles; return them with notes to the reporter
- Handle pending updates to published articles (side-by-side diff view)
- **Analytics dashboard** — Chart.js graph of hourly views with vertical markers at each publish/update event
- Delete articles
- **Data management** — list/search/create/update/delete users, comments and hourly view records, with server-side permissions and validation. Referenced users and the current editor cannot be deleted; view-record changes keep article totals aligned.

### Technical

- **MVC architecture** — controllers, models, routes fully separated
- **REST API** — all AJAX interactions follow REST conventions
- **Sessions in MongoDB** (connect-mongo) — survive server restarts
- **bcrypt** password hashing
- **Server-side authorization** — all permission checks on the server, not just UI
- **Responsive** — Flexbox-based layout, works on mobile/tablet/desktop
- **Semantic HTML5** — proper `<article>`, `<header>`, `<aside>`, `<time>`, `<figure>` tags
- **Error logging** — `logs/app.log` and `logs/access.log`

## Configuration and submission

`PORT` defaults to `3000`; `MONGO_URI` defaults to `mongodb://localhost:27017/the-daily-web`. `SESSION_SECRET` can be supplied in the environment; otherwise a random secret is saved in the ignored `config/session-secret.key`. Keep that file for local restart continuity. Multiple app instances must share the same database and `SESSION_SECRET`.

Dependencies, generated logs, local secrets and verification scripts are excluded from Git and the source hand-in. Install dependencies with `npm ci`; do not copy another machine's `node_modules`. Verification is performed separately from the submitted source, as requested by the project team.

Prepare the ZIP from the exact submitted commit using `git archive --format=zip --output=../daily-web-submission.zip HEAD`. Give the lecturer a repository link identifying the same commit, and verify installation, roles, drafts, comments and analytics on every team member's machine. The source package includes the seed and additive demo command; MongoDB data itself is not part of `git archive`.
