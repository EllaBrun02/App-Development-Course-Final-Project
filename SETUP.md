# Setup & Installation Guide — The Daily Web

## 1. Install Node.js

**Download:** https://nodejs.org/en/download  
**Choose:** LTS version (v18 or higher)

To verify installation:
```bash
node --version   # should print v18.x.x or higher
npm --version    # should print 9.x.x or higher
```

---

## 2. Install MongoDB (Community Edition)

**Download:** https://www.mongodb.com/try/download/community  
**Choose:** Version 7.x, Windows, .msi installer

During installation:
- Check "Install MongoDB as a Service" — this makes it start automatically with Windows
- Check "Install MongoDB Compass" (optional GUI tool to browse the database)

To verify MongoDB is running:
```bash
mongod --version   # should print db version v7.x.x
```

If it's not running as a service, start it manually:
```bash
mongod
```

---

## 3. Project npm Dependencies

These are installed automatically by `npm install`. Listed here for reference:

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18.2 | Web server framework |
| `ejs` | ^3.1.10 | Server-side HTML templating |
| `mongoose` | ^8.0.3 | MongoDB object modeling |
| `express-session` | ^1.17.3 | User session management |
| `connect-mongo` | ^5.1.0 | Store sessions in MongoDB (survives server restarts) |
| `bcrypt` | ^5.1.1 | Password hashing (never stores plain text) |
| `morgan` | ^1.10.0 | HTTP request logging |
| `node-fetch` | ^2.7.0 | HTTP client for weather API calls |

**Dev dependency:**

| Package | Version | Purpose |
|---|---|---|
| `nodemon` | ^3.0.2 | Auto-restart server on file changes (dev only) |

**Frontend library (loaded via CDN, no install needed):**

| Library | Purpose |
|---|---|
| Chart.js v4.4.0 | Analytics graphs (loaded from jsDelivr CDN) |

---

## 4. First-Time Setup Steps

Open a terminal (PowerShell or Command Prompt) in the project folder:

```
C:\Users\ebrun\OneDrive - NVIDIA Corporation\Meetings\Documents\Study\P1\Code
```

**Step 1 — Install all npm packages:**
```bash
npm install
```

**Step 2 — Seed the database with demo data:**
```bash
npm run seed
```
This creates:
- 500 articles in various states
- 1 editor user + 5 reporter users
- Comments on articles
- 30 days of view statistics

**Step 3 — Start the server:**
```bash
npm start
```
Open your browser at: **http://localhost:3000**

---

## 5. Login Credentials (after seeding)

| Role | Username | Password |
|---|---|---|
| Editor | `editor1` | `editor123` |
| Reporter 1 | `reporter1` | `reporter123` |
| Reporter 2 | `reporter2` | `reporter123` |
| Reporter 3 | `reporter3` | `reporter123` |
| Reporter 4 | `reporter4` | `reporter123` |
| Reporter 5 | `reporter5` | `reporter123` |

---

## 6. Environment Variables (Optional)

By default the app runs with sensible defaults. You can override them by setting environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `MONGO_URI` | `mongodb://localhost:27017/the-daily-web` | MongoDB connection string |
| `SESSION_SECRET` | `thedailyweb_secret_2024` | Secret key for signing sessions |

To set them temporarily (PowerShell):
```powershell
$env:PORT = "4000"
npm start
```

---

## 7. Troubleshooting

**"Cannot connect to MongoDB"**
→ Make sure `mongod` is running. Open Services (Win+R → `services.msc`) and start **MongoDB Server**.

**"npm is not recognized"**
→ Node.js is not installed or not in PATH. Reinstall Node.js and restart your terminal.

**"Port 3000 already in use"**
→ Set a different port: `$env:PORT=3001; npm start`

**Blank page / no articles**
→ Make sure you ran `npm run seed` before starting the server.
