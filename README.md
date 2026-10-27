# Learning Management System (LMS) with Video Courses & Payments

> **CE1 Capstone Project &bull; Project 15: Learning Management System**  
> Built strictly according to the **CE1 Syllabus** (Web Fundamentals, Node.js Core Modules & Architecture, Frontend UI/UX, and Express REST APIs with JWT & Multer).

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18+ or v24+
- **NPM**: v9+

### 2. Setup & Installation
```bash
# Clone or navigate to the project directory
cd LMS_Project_Code

# Install dependencies
npm install

# Start the application
npm start
```
The server will boot at: **`http://localhost:3000`**

---

## 🔑 Pre-Seeded Demo Accounts (1-Click Login in UI)

| Role | Email | Password | Features Accessible |
| :--- | :--- | :--- | :--- |
| **Student** | `student@lms.com` | `Student@123` | Enrol in courses, watch video lessons with resumable position, take auto-graded quizzes, submit assignments, write timestamped notes, participate in lesson Q&A, download certificates. |
| **Instructor** | `teacher@lms.com` | `Teacher@123` | Instructor Studio: create courses, build sections, upload video lessons with Multer, create quizzes, post assignments, grade student submissions, view earnings. |
| **Admin** | `admin@lms.com` | `Admin@123` | Admin Console: view platform revenue & KPI cards, approve/reject submitted courses, manage users (activate/deactivate), review 20% commission & process instructor payouts. |

> 💳 **Test Payment Card for Paid Courses**:  
> `4242 4242 4242 4242`

---

## 🌟 Key Features Implemented

1. **Secure Video Delivery**:
   - Short-lived signed URLs with 2-minute JWT token expiry (`GET /api/lessons/:id/stream-url`).
   - Zero full-file memory buffering: streams byte slices via Node.js `fs.createReadStream()` with `HTTP 206 Partial Content`.
   - Playback speed adjustment (0.75x, 1x, 1.25x, 1.5x, 2x) and resumable watch position.

2. **Timestamped Notes & Q&A Discussion**:
   - Students can save personal notes tagged to specific video timestamps. Clicking any note instantly seeks the video to that moment.
   - Interactive Q&A thread per lesson with questions and instructor responses.

3. **Curriculum Builder & File Uploads**:
   - Instructors can author courses organized by modules/sections.
   - Video lessons uploaded via **Multer** with MIME validation and size guards.
   - Quizzes with question banks, pass mark calculation, and attempt limits (max 3).
   - Hands-on assignments with student submission links and instructor grading.

4. **Progress Tracking & Verified Certificates**:
   - Throttled progress reporting (sent at most once every 10–15 seconds to prevent database overload).
   - Certificate of Completion automatically issued upon 100% course completion.
   - Includes printable certificate layout and public verification link (`/api/certificates/verify/:certId`).

5. **Financial Accounting & Admin Controls**:
   - Automatic 80/20 revenue calculation (80% to instructor, 20% platform commission).
   - Instructor payout recording and balance settlement.
   - Course verification workflow (Approve / Reject with feedback).

---

## 📚 CE1 Syllabus Mapping Overview

| Syllabus Topic | Technical Implementation |
| :--- | :--- |
| **Web Fundamentals** | Responsive HTML5, Bootstrap 5 UI, ES6+ JavaScript, Fetch API with `async`/`await`. |
| **Node.js Core Modules** | `fs` and `path` for data and uploads, `stream` and `buffer` for HTTP 206 range streaming, `events` (`EventEmitter`) for system notifications. |
| **Express & REST APIs** | Modular routers, `express-validator` input validation & sanitization, centralized 4-parameter error handler. |
| **Authentication & RBAC** | `bcryptjs` password hashing with salt factor 10, `jsonwebtoken` with 3 distinct roles (`student`, `instructor`, `admin`). |
| **File Uploads** | `multer` disk storage with file type filtering and limits. |
| **API Testing** | Exportable Postman Collection: `LMS_API_Collection.postman_collection.json`. |

👉 *For the full detailed line-by-line topic breakdown and viva interview answers, read [CE1_SYLLABUS_MAPPING.md](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/CE1_SYLLABUS_MAPPING.md).*

---

## 🧪 Postman API Testing

1. Open Postman or Insomnia.
2. Click **Import** and select `LMS_API_Collection.postman_collection.json`.
3. Run the **Login** request; the test script automatically captures and sets the `{{token}}` variable for all subsequent requests.
4. Execute tests across all folders:
   - `1. Authentication`
   - `2. Public Course Catalogue`
   - `3. Enrolments & Learning Room`
   - `4. Instructor Studio`
   - `5. Admin Console`
# Learning-Management-System-with-Video-Courses-Payments
