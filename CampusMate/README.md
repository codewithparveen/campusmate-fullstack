# CampusMate — Smart Campus Management Platform

One web app for students and campus staff, covering **classrooms, hostels and parcel receiving**:

| Module | What it does |
|---|---|
| **FIXORA** | Maintenance complaints (fans, lights, plumbing, furniture, Wi-Fi, structure…) |
| **CLEANWISE** | Cleanliness complaints (garbage, washrooms, pests, dirty rooms…) |
| **HOSTELHUB** | Parcel arrival, student notification and **OTP-based pickup** |

Stack: HTML/CSS/JavaScript frontend · Node.js + Express backend · MongoDB (Mongoose) · JWT auth · Socket.IO (live updates) · Chart.js (analytics).

> Read **HOW_IT_WORKS.md** for the full explanation (architecture, database, APIs, AI engine, security, viva Q&A).

## Run it (5 minutes)

1. Install **Node.js 18+** and create a free **MongoDB Atlas** cluster (or use a local MongoDB).
2. In the `backend` folder:
   ```bash
   npm install
   cp .env.example .env        # Windows: copy .env.example .env
   ```
   Open `.env` and put your `MONGO_URI` and a long random `JWT_SECRET`.
3. Create the admin account (and optional demo data):
   ```bash
   npm run seed          # admin only
   npm run seed:demo     # admin + 2 demo students + demo complaints/parcel
   ```
4. Start:
   ```bash
   npm start
   ```
5. Open **http://localhost:5000** — the backend also serves the website, so nothing else is needed.

### Default logins (change them in `.env` before seeding!)
| Role | Email | Password |
|---|---|---|
| Admin | `admin@campus.edu` | `Admin@12345` |
| Student (demo) | `priya@student.edu` | `Student@123` |

Students can also register themselves on the Register tab. **Admin accounts can only be created by the seed script.**

### Automated test
With the server running: `npm test` → runs 50 checks through the real API (auth, roles, uploads, AI, duplicates, OTP, notifications, analytics, realtime).

## Folder structure
```
CampusMate/
├── frontend/            index.html (landing) · auth.html · student.html · admin.html
│                        app.js (shared) · student.js · admin.js · style.css
└── backend/
    ├── server.js        app setup, security headers, routes, Socket.IO
    ├── config/db.js     MongoDB connection
    ├── models/          User · Complaint · Parcel · Notification
    ├── routes/          auth · complaints · parcels · notifications · users · dashboard
    ├── middleware/      auth (JWT + roles) · upload (multer) · error handling
    ├── services/        ai.js (classification, priority, duplicates) · notify.js · realtime.js
    ├── scripts/         seed.js · smoke-test.js
    └── uploads/         complaint photos
```

## Hosting the frontend separately (optional)
If you put `frontend/` on GitHub Pages, edit `API_BASE` at the top of `frontend/app.js` to your deployed backend URL, and set `CLIENT_ORIGIN` in the backend `.env` to your Pages URL. The backend (Node) must be hosted somewhere that runs Node, e.g. Render or Railway.
