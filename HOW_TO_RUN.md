# How to Run the App

Works on Windows, macOS and Linux. All commands run from the **project root folder** (the folder containing `package.json`).

## First Time Only

### Step 1 — Start MongoDB
- **Windows:** press `Win + R`, type `services.msc`, press Enter. Find **MongoDB Server** → right-click → **Start**.
- **macOS (Homebrew):** `brew services start mongodb-community`
- **Docker (any OS):** `docker run -d -p 27017:27017 --name mongo mongo:7`

By default the app connects to `mongodb://localhost:27017/the-daily-web`. If your MongoDB runs elsewhere (different port or database name), set `MONGO_URI` before starting.

### Step 2 — Install dependencies (only once)
```
npm install
```

### Step 3 — Seed the database (only once)
```
npm run seed
```
> ⚠️ **WARNING:** seeding **deletes all existing data** in the target database and replaces it with demo data. The script asks for confirmation; pass `--yes` to skip the prompt (`node seed/seed.js --yes`).

### Step 4 — Start the server
```
npm start
```

### Step 5 — Open the browser
Go to: **http://localhost:3000** (or the port you set with `PORT`).

---

## Every Time After That

Just make sure MongoDB is running, then:
```
npm start
```

---

## Common Settings

| Env variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port (use a different one if 3000 is taken) |
| `MONGO_URI` | `mongodb://localhost:27017/the-daily-web` | MongoDB connection string |
| `SESSION_SECRET` | auto-generated & stored locally | Session signing secret |

Example with a different port and database:
- **macOS/Linux:** `PORT=3100 MONGO_URI=mongodb://localhost:27017/dailyweb npm start`
- **Windows (PowerShell):** `$env:PORT=3100; $env:MONGO_URI='mongodb://localhost:27017/dailyweb'; npm start`

---

## Login Credentials (after seeding)

| Role     | Username    | Password      |
|----------|-------------|---------------|
| Editor   | `editor1`   | `editor123`   |
| Reporter | `reporter1` | `reporter123` |
| Reporter | `reporter2` | `reporter123` |
| Reporter | `reporter3` | `reporter123` |
| Reporter | `reporter4` | `reporter123` |
| Reporter | `reporter5` | `reporter123` |
