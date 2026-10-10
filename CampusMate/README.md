# CampusMate — Smart Campus Management Platform

> **One Smart Platform for a Better Campus.**

| | |
|---|---|
| **Live website** | `PASTE YOUR RENDER LINK HERE` |
| **Source code** | `PASTE YOUR GITHUB REPOSITORY LINK HERE` |
| **Submitted by** | `Your Name` · `Register No.` · `Department / Year` · `College Name` |

**Demo logins (for evaluators)**

| Role | Email | Password |
|---|---|---|
| Admin | `PASTE ADMIN EMAIL` | `PASTE ADMIN PASSWORD` |
| Student | `priya@student.edu` | `Student@123` |

> A new student account can also be created from the **Register** tab.
> The live site is on free hosting: if it has been idle, the **first page load can take up to a minute** to wake up. Please wait and refresh once.

---

## 1. About the project

Students face everyday problems on campus: broken fans and lights in classrooms, leaking taps and dirty washrooms in hostels, and parcels that are missed or collected by the wrong person. These problems are usually reported on paper or WhatsApp, so nothing is tracked, urgent issues are not noticed, and the same problem is reported many times.

**CampusMate** is a full-stack web application that brings three services into one platform:

| Module | Purpose |
|---|---|
| 🔧 **FIXORA** | Report and track **maintenance** problems (electrical, plumbing, fan/AC, furniture, Wi-Fi/IT, building/civil). |
| 🧹 **CLEANWISE** | Report and track **cleanliness** problems (garbage, washrooms, dirty rooms, pests, drinking-water hygiene). |
| 📦 **HOSTELHUB** | Hostel **parcel management**: the desk registers a parcel, the student is notified and collects it with a **one-time OTP**. |

It works for every place on campus: **Classroom, Hostel, Library, Canteen, Washroom, Lab, Ground and Other.**

---

## 2. Features at a glance

### Public home page
- Live campus overview: number of maintenance reports, cleanliness reports and parcels waiting (read from the database, not hard-coded).
- **AI Priority Insight**: a sentence generated from the data, e.g. which place currently has the most open issues.
- Recent campus activity table with search.
- Explanation of the three services and how the platform works.

### Accounts and security
- Student **registration** and **login** (email + password).
- Two roles: **Student** and **Admin**. Each role sees only its own pages and data.
- Admin accounts cannot be created from the website; only the system owner can create them.

### Student options
| Option | What the student can do |
|---|---|
| **My Complaints** | See total / open / resolved counts and parcels waiting. Search and filter their complaints by status and service. Click a complaint to see the full details, the AI analysis and the progress timeline. |
| **Report an Issue** | Choose the place (classroom, hostel, canteen…), enter the exact location and description, and **upload a photo** (optional, JPG/PNG/WEBP/GIF, up to 5 MB). An **AI preview** shows the category and priority while typing. |
| **Withdraw** | Delete a complaint while it is still in "Reported" status. |
| **My Parcels** | See parcels that arrived, with the **pickup OTP** for each. See the collected history. |
| **Notifications 🔔** | Live notifications when a complaint status changes, a complaint is escalated, or a parcel arrives or is collected. |

### Admin options (warden / maintenance office)
| Option | What the admin can do |
|---|---|
| **Analytics** | Live dashboard: total, open, critical, resolved, average resolution time, students, parcels waiting/collected. Charts for status, last-7-days trend, place and category. **Hotspots** (places with most open issues) and **Repeated problems**. |
| **Complaints** | View all complaints. Search and filter by status, priority, service and place. Open a complaint to see the photo, AI analysis and who reported it. **Update status** (Reported → Under Review → Assigned → In Progress → Resolved), change priority, assign a staff member/team, add a note for the student, or delete it. |
| **Parcels (HOSTELHUB)** | Register an incoming parcel by student roll number or email (with name suggestions). View all parcels with search and filter. **Verify the OTP** the student tells at the desk to hand the parcel over. |
| **Notifications 🔔** | Live alert whenever a new complaint arrives. |

### Real-time updates
Dashboards and notifications update **instantly without refreshing the page** (WebSockets using Socket.IO).

---

## 3. The "smart" part: AI complaint engine

Every complaint is analysed automatically by the server:

1. **Category detection**: the description is read and sorted into a category (for example *Electrical*, *Plumbing*, *Garbage / Waste*), which also decides whether it is FIXORA or CLEANWISE.
2. **Priority scoring**: a 0–100 severity score is calculated from danger words (fire, shock, flooding, collapse…), the place (classrooms, canteens and hostels affect many students) and how many students reported the same problem. The score becomes **Low / Medium / High / Critical**, and a **written reason** is saved so the decision is explainable.
3. **Duplicate detection**: if another student has already reported the same problem at the same place, the new report is linked to the first one, the report count increases and the **priority is raised automatically**. Everyone who reported it is notified when it is resolved.

The engine is rule-based and text-similarity based. It runs inside the server and needs no paid AI service.

---

## 4. Parcel pickup with OTP (HOSTELHUB)

1. The hostel desk registers the parcel for a student.
2. The system generates a **random 6-digit OTP**. **Only the student can see it** (not even the admin list).
3. At the desk, the student tells the OTP and the admin verifies it.
4. Correct OTP → parcel marked **Collected**; the OTP is deleted and cannot be reused.
5. **5 wrong attempts lock the parcel** to prevent guessing.

---

## 5. Technology used

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript, Chart.js (charts) |
| Backend | Node.js, Express.js |
| Database | MongoDB (MongoDB Atlas) with Mongoose |
| Authentication | JSON Web Tokens (JWT), bcrypt password hashing |
| Real-time | Socket.IO |
| File upload | Multer |
| Hosting | Render (backend + website), MongoDB Atlas (database) |

---

## 6. Security measures
- Passwords stored as bcrypt hashes; never returned by the API.
- JWT login, with **role checks on the server** (students cannot call admin APIs).
- Students can read only their own complaints and parcels.
- Rate limiting on login/registration; security headers (Helmet).
- Input validation; uploads limited to images up to 5 MB with random file names.
- All user text is escaped before display (prevents XSS).
- OTP is cryptographically random, hidden from admins, single-use and brute-force locked.
- Secrets are kept in a `.env` file and are never uploaded to GitHub.

---

## 7. Project structure
```
CampusMate/
├── frontend/                 Website pages
│   ├── index.html            Home page
│   ├── auth.html             Login / Register
│   ├── student.html          Student dashboard
│   ├── admin.html            Admin dashboard
│   ├── app.js  student.js  admin.js   Page logic
│   └── style.css
├── backend/
│   ├── server.js             Server entry point
│   ├── models/               User, Complaint, Parcel, Notification
│   ├── routes/               auth, complaints, parcels, notifications, users, dashboard
│   ├── middleware/           login/role check, file upload, error handling
│   ├── services/             ai.js (AI engine), notify.js, realtime.js
│   ├── scripts/              seed.js (create admin), smoke-test.js (50 automated checks)
│   └── .env.example          Template for settings
├── README.md                 This file
└── HOW_IT_WORKS.md           Detailed technical explanation, database design, API list, viva Q&A
```

---

## 8. How to run on your own computer

**Requirements:** Node.js 18 or newer, and a free MongoDB Atlas database.

```bash
cd backend
npm install
copy .env.example .env        # Mac/Linux: cp .env.example .env
```
Open `.env` and fill in:
```
PORT=5000
MONGO_URI=<your MongoDB Atlas connection link, ending with /campusmate?...>
JWT_SECRET=<any long random text, 32+ characters>
ADMIN_EMAIL=<admin login email>
ADMIN_PASSWORD=<admin login password>
```
Then:
```bash
npm run seed:demo      # creates the admin account + demo data
npm start              # starts the website
```
Open **http://localhost:5000**.

Optional: with the server running, `npm test` runs 50 automated checks covering login, roles, uploads, AI, duplicates, OTP, notifications, analytics and real-time updates.

---

## 9. How it was deployed
1. Database: MongoDB Atlas (free cluster).
2. Code: GitHub repository.
3. Hosting: Render *Web Service* — Root Directory `backend`, Build Command `npm install`, Start Command `npm start`, with `MONGO_URI` and `JWT_SECRET` set as environment variables.

---

## 10. Known limitations
- On free hosting the site sleeps after inactivity, so the first load can take up to a minute.
- Uploaded complaint photos are stored on the server's disk; on free hosting they are lost when the server restarts. Complaint text and all other data are safe in MongoDB.
- The OTP is shown inside the student's dashboard; it is not sent by SMS or email.
- The AI engine is rule-based; it understands English descriptions best.

## 11. Future scope
SMS / e-mail OTP delivery · permanent cloud image storage · mobile app · maintenance-staff login and task list · QR codes on classrooms and hostel rooms for one-tap reporting · LLM-based understanding of complaints in Tamil and other languages.

---

*For the full technical explanation (architecture, database design, every API, security, viva questions) see **HOW_IT_WORKS.md**.*