# How to Run the App

## First Time Only

### Step 1 — Start MongoDB
Press `Win + R`, type `services.msc`, press Enter.
Find **MongoDB Server** in the list → right-click → **Start**.

### Step 2 — Open a terminal in the project folder
Open PowerShell or Command Prompt and run:
```
cd "C:\Users\ebrun\OneDrive - NVIDIA Corporation\Meetings\Documents\Study\P1\Code"
```

### Step 3 — Install dependencies (only once)
```
npm install
```

### Step 4 — Seed the database (only once)
```
npm run seed
```

### Step 5 — Start the server
```
npm start
```

### Step 6 — Open the browser
Go to: **http://localhost:3000**

---

## Every Time After That

Just make sure MongoDB is running, then:
```
npm start
```

---

## Login Credentials

| Role     | Username    | Password      |
|----------|-------------|---------------|
| Editor   | `editor1`   | `editor123`   |
| Reporter | `reporter1` | `reporter123` |
| Reporter | `reporter2` | `reporter123` |
| Reporter | `reporter3` | `reporter123` |
