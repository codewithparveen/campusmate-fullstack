# How CampusMate works

## 1. The problem
Students face three everyday problems: broken things in classrooms/hostels, unclean areas, and missed or insecure parcel collection. Reporting is usually informal (WhatsApp, paper) so nothing is tracked, urgent problems are not noticed, and the same issue is reported many times. CampusMate gives one place to **report → analyse → track**, and a safe OTP system for parcels.

## 2. Architecture
```
 Browser (HTML/CSS/JS)                Node.js + Express                 MongoDB
 ┌────────────────────┐   HTTPS/JSON  ┌────────────────────────┐        ┌───────────┐
 │ index / auth /     │ ────────────► │ routes → middleware →   │ ─────► │ users     │
 │ student / admin    │ ◄──────────── │ services (AI, notify)   │ ◄───── │ complaints│
 │ Chart.js           │               │                        │        │ parcels   │
 │ Socket.IO client   │ ◄══ live ════ │ Socket.IO server       │        │ notifs    │
 └────────────────────┘   WebSocket   └────────────────────────┘        └───────────┘
```
* **Frontend** never touches the database. It calls the REST API with a JWT token.
* **Backend** validates every request, checks the user's role, runs the business logic and talks to MongoDB.
* **Socket.IO** pushes events (new complaint, status change, notification) instantly, so dashboards update without refreshing.

## 3. Roles and login
* **Student** — registers on the website. Can report issues, see only *their own* complaints, see their parcels and OTPs.
* **Admin** (warden / maintenance office) — created only by `npm run seed`. Sees everything, changes status, registers parcels, verifies OTPs, sees analytics.
* Login returns a **JWT** (valid 7 days). The browser sends it as `Authorization: Bearer <token>`. The `auth` middleware verifies it and loads the user; `adminOnly` blocks students from admin routes (HTTP 403).
* Passwords are hashed with **bcrypt** (never stored or returned in plain text). Self-registration always creates a *student*, so nobody can make themselves admin.

## 4. Database (MongoDB collections)
| Collection | Important fields |
|---|---|
| **users** | name, email (unique), password (hash), role, studentId, department, year, hostelBlock, roomNo |
| **complaints** | userId, module (FIXORA/CLEANWISE), category, **area** (Classroom/Hostel/Library/Canteen/Washroom/Lab/Ground/Other), location, description, image, **priority, severityScore, aiReason, aiKeywords, duplicateOf, similarity, reportCount**, status, assignedTo, adminNote, statusHistory[] |
| **parcels** | studentId, parcelName, courierName, trackingNumber, status (Ready for Pickup/Collected), otp, otpAttempts, collectedDate, handedOverBy |
| **notifications** | userId, type, title, message, link, read |

## 5. Complaint life cycle (FIXORA / CLEANWISE)
1. Student opens *Report an Issue*, picks the place (classroom, hostel…), writes the location + description, optionally adds a photo.
   While typing, the page calls `POST /api/complaints/analyze` and shows an **AI preview** (category + priority).
2. `POST /api/complaints` (multipart form). The server:
   1. validates the data and saves the photo (only JPG/PNG/WEBP/GIF, max 5 MB, random file name);
   2. runs the **AI engine** → category, severity, priority, written reason;
   3. looks for an **already reported, still-open complaint** in the same place → duplicate detection;
   4. saves the complaint with its first `statusHistory` entry;
   5. notifies every admin and pushes `complaint:new` live.
3. Admin opens the complaint, changes **status** (Reported → Under Review → Assigned → In Progress → Resolved), priority, assigned staff and a note.
4. The student gets a **notification** (bell + live toast). Students who reported the *same* problem are updated too.
5. A student may withdraw a complaint only while it is still "Reported".

## 6. The AI engine (`backend/services/ai.js`)
It runs inside the server — no paid API key needed — and every result is stored with an explanation.
1. **Classification** — the text is tokenised and stemmed (leaking/leaks/leakage → *leak*). Each category has weighted keyword lists (e.g. *spark, shock* count double for Electrical). The category with the highest score wins, which also decides FIXORA vs CLEANWISE.
2. **Severity & priority** — score 0-100 from: danger phrases (fire, shock, gas, flooding, collapse = very high; leakage/broken = medium; dirty = low), a small bonus for busy places (classroom, canteen, hostel) and a bonus for every extra student who reported the same thing. Score → **Low (<25) · Medium · High (≥45) · Critical (≥70)**. The text reason (e.g. "fire risk, classroom is used by many students") is saved in `aiReason`.
3. **Duplicate detection** — the new complaint is compared with open complaints in the same module + area. If the *location* matches (generic words like "block/hostel/room" are ignored, so "Block A" ≠ "Block B") and the **cosine similarity** of the word vectors ≥ 0.45, it is linked via `duplicateOf` and the original's `reportCount` increases, which can **escalate its priority**. The original reporter is notified.
4. **Insights** — admin analytics show hotspots (places with most open issues) and repeated problems; the landing page shows a live insight sentence.

*Why not a big model?* A transparent rule-based/NLP engine is explainable (you can show *why* it decided), is free, works offline and is deterministic for demos. An LLM call can be added later inside the same functions.

## 7. HOSTELHUB parcel flow with OTP
1. A parcel arrives. The warden (admin) opens *Parcels*, types the student's roll number/email (with search suggestions), parcel name and courier.
2. The server creates the parcel with a **random 6-digit OTP** (`crypto.randomInt`, not `Math.random`) and notifies the student.
3. **Only the student can see the OTP** (their *My Parcels* tab). It is never sent to the admin list.
4. At the desk the student tells the OTP; the admin types it and presses *Verify*.
5. Correct → status **Collected**, time + admin recorded, OTP deleted (cannot be reused), student notified.
   Wrong → rejected; after **5 wrong attempts** the parcel is locked (stops guessing).

## 8. Analytics (admin)
`GET /api/dashboard/admin` calculates from the database: totals, open/critical/resolved, average resolution time, status split, 7-day trend, complaints by place and category, hotspots, repeated problems, parcels waiting/collected. Chart.js draws them. Nothing is hard-coded.

## 9. API reference
| Method & path | Who | Purpose |
|---|---|---|
| POST `/api/auth/register` · `/login` | public | create student account / get token |
| GET/PUT `/api/auth/profile` · PUT `/password` | user | profile |
| POST `/api/complaints/analyze` | user | AI preview |
| POST `/api/complaints` | user | create (multipart, field `image`) |
| GET `/api/complaints?status=&module=&priority=&area=&q=&page=` | user/admin | list (students: own only) |
| GET `/api/complaints/:id` | owner/admin | details + timeline |
| PUT `/api/complaints/:id` | admin | status, priority, assignedTo, adminNote |
| DELETE `/api/complaints/:id` | owner (if Reported) / admin | remove |
| POST `/api/parcels` | admin | register parcel |
| GET `/api/parcels` | user/admin | students: own + OTP · admin: all, no OTP |
| PUT `/api/parcels/:id/verify-otp` | admin | hand over |
| GET `/api/notifications` · PUT `/read-all` · PUT `/:id/read` | user | notifications |
| GET `/api/users/students?q=` | admin | student search |
| GET `/api/dashboard/public` · `/student` · `/admin` | public/user/admin | statistics |
| Socket events | | `notification`, `complaint:new`, `complaint:updated`, `complaint:deleted`, `parcel:updated` |

## 10. Security measures (good to mention in the viva)
bcrypt password hashing · JWT auth with role checks on the server (not just hidden buttons) · students can only read their own data · rate limiting on login/register · helmet security headers · input validation · upload whitelist + size limit + random file names · all user text is HTML-escaped on the pages (prevents XSS) · OTP is random, hidden from admins, single-use and brute-force locked · Socket.IO connections require a valid token · secrets live in `.env` (never in code).

## 11. Possible questions and answers
* **Why MongoDB?** Flexible documents (complaint + history + AI fields together), easy with JavaScript, free Atlas tier.
* **How does the page update without refresh?** Socket.IO keeps a WebSocket open; the server emits an event and the page re-fetches.
* **Can a student see another's complaint?** No — the API returns 403; checked in the route, not the UI.
* **How is priority decided?** Section 6 — transparent scoring with a saved reason.
* **How are repeated complaints handled?** Cosine similarity + same place → linked, counted and escalated.
* **Future scope:** SMS/e-mail OTP delivery, mobile app, an LLM for text understanding, staff mobile view, QR codes for locations.

## 12. Suggested demo (5 minutes)
1. Landing page → live numbers. 2. Register a student. 3. Report "sparks near the switch board" in a Classroom → AI preview + photo → Critical.
4. Second student reports the same → *linked, priority raised*. 5. Admin dashboard: charts, hotspots → open complaint → set *In Progress* → student's bell rings live.
6. Admin registers a parcel → student sees OTP → admin verifies → Collected.
