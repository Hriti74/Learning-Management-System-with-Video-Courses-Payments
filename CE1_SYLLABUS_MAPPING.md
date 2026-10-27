# CE1 Syllabus Mapping & Placement Interview Guide

> **Important Note on Scope Adherence:**  
> This project has been developed strictly within the boundaries of the **CE1 Syllabus** (Topics 1 through 4).  
> It intentionally **avoids all out-of-syllabus technologies** such as external cloud providers (AWS S3, CloudFront), external databases (MongoDB, Mongoose, Redis), heavy job queue orchestrators (BullMQ), or frontend frameworks (React, Vite).  
> All requirements are solved natively using **Node.js Core Modules**, **Express.js**, **Vanilla JavaScript**, and **Bootstrap 5**.

---

## 🛑 Strict Scope Verification: What is Included vs Excluded

| CE1 Syllabus Domain | Included in this Project | Strictly Excluded (Out of Syllabus) |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3, Bootstrap 5 CDN, Vanilla ES6+ JS, DOM APIs, Fetch API with `async`/`await` | ❌ No React, No Vite, No Redux, No Tailwind build steps |
| **Data Persistence** | Node.js core `fs` and `path` storing structured JSON in [`data/db.json`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/data/db.json) | ❌ No MongoDB, No Mongoose, No SQL, No Redis |
| **Media & File Delivery** | Local `uploads/` directory, Multer disk storage, HTTP 206 byte-range streaming via `fs.createReadStream()` | ❌ No AWS S3, No CloudFront CDN, No Cloudinary, No ffmpeg CLI dependencies |
| **Event Architecture** | Node.js core `EventEmitter` (`src/events/eventBus.js`) | ❌ No BullMQ, No RabbitMQ, No Kafka |
| **Authentication & Security** | `bcryptjs` password hashing, `jsonwebtoken` (JWT), custom role-based middleware (`student`, `instructor`, `admin`) | ❌ No external OAuth providers, No Passport session stores |
| **Payments** | Mock payment gateway logic verifying test card `4242 4242 4242 4242` and logging financial accounting | ❌ No real Stripe / Razorpay API keys or webhooks required |
| **Testing & Debugging** | Exportable Postman Collection ([`LMS_API_Collection.postman_collection.json`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/LMS_API_Collection.postman_collection.json)), `morgan('dev')` logging | ❌ No heavy test runners |

---

## 1. Web Fundamentals (18 Sessions &bull; 15% Weightage)

| Syllabus Requirement | Implementation in Project | File Reference |
| :--- | :--- | :--- |
| **HTML, CSS, Web Basics** | Semantic HTML5 structure with sticky navigation, hero banner, course card grids, video frames, and modals. | [`public/index.html`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/index.html), [`public/style.css`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/style.css) |
| **JavaScript Fundamentals & DOM** | Dynamic Single Page Application (SPA) rendering views without page refreshes, attaching event listeners. | [`public/app.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/app.js) |
| **Events** | `ontimeupdate` for video progress, `onended` for auto-completion, `click`, `submit`, `input` debounce. | [`public/app.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/app.js) |
| **ES6 Basics** | Arrow functions `() => {}`, template literals, destructuring, object spread `{ ...opts }`, `const`/`let`. | Throughout backend and frontend |
| **Async JavaScript, Fetch API, Promises, async/await** | Centralized `api(url, options)` helper using `fetch()` and `async/await` handling Bearer tokens and JSON payloads. | [`public/app.js#L14-L38`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/app.js#L14-L38) |
| **NPM, Node Basics, Modules, package.json** | Modular project dependencies, npm scripts (`start`, `dev`), clear separation of concerns. | [`package.json`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/package.json) |

---

## 2. Node.js Fundamentals and Core Modules (20 Sessions &bull; 17% Weightage)

| Syllabus Requirement | Implementation in Project | File Reference |
| :--- | :--- | :--- |
| **Node.js Setup & Global Objects** | Running on modern Node.js, using `__dirname`, `process.env`, `Buffer`, `setTimeout`. | [`server.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/server.js) |
| **CommonJS vs ES Modules** | Clean CommonJS `require()` and `module.exports` modularization across routes and middleware. | [`src/store.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/store.js) |
| **File System (`fs`) & Path (`path`)** | Reading database files, storing video uploads, atomic updates via `fs.writeFileSync` and `path.join`. | [`src/store.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/store.js), [`src/middleware/upload.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/middleware/upload.js) |
| **Streams & Buffers** | Video streaming using `fs.createReadStream()` with byte chunks piped to the response; zero full-file RAM buffering. | [`src/routes/learn.js#L236-L265`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/routes/learn.js#L236-L265) |
| **HTTP Module, Range Requests & Response** | HTTP `206 Partial Content`, `Content-Range: bytes start-end/total`, `Accept-Ranges: bytes`. | [`src/routes/learn.js#L236-L265`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/routes/learn.js#L236-L265) |
| **Events & EventEmitter** | Custom `LMSEventBus` extending Node's `events` module for audit trails, enrollment notifications, and status updates. | [`src/events/eventBus.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/events/eventBus.js) |
| **Error Handling** | Synchronous validation guards, async error forwarding with `next(err)`. | [`src/middleware/errorHandler.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/middleware/errorHandler.js) |

---

## 3. Frontend Development Basics & Node.js Debugging (18 Sessions &bull; 15% Weightage)

| Syllabus Requirement | Implementation in Project | File Reference |
| :--- | :--- | :--- |
| **Bootstrap 5 & Component Styling** | Responsive cards, badges, modal dialogues, sticky navbar, tabbed panels, custom video player frame. | [`public/index.html`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/index.html), [`public/style.css`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/style.css) |
| **Reusable UI Components** | Course card components, Quiz answer selectors, Timestamp pill notes, Print-ready Certificate card. | [`public/app.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/app.js) |
| **UI/UX Polishing** | Dismissible alert banners, loading spinners, debounce on search inputs, clean role-based dashboards. | [`public/app.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/app.js) |
| **Node.js Logging & Debugging** | `morgan('dev')` request logging, custom console event bus loggers, centralized error logging. | [`server.js#L14`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/server.js#L14), [`src/middleware/errorHandler.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/middleware/errorHandler.js) |

---

## 4. Express.js and REST APIs (16 Sessions &bull; 14% Weightage)

| Syllabus Requirement | Implementation in Project | File Reference |
| :--- | :--- | :--- |
| **Express Setup, Routing & Middleware** | Modular routers: `app.use('/api/auth')`, `app.use('/api/courses')`, `app.use('/api/learn')`, `app.use('/api/admin')`. | [`server.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/server.js) |
| **Route Params & Query Params** | `req.params.id` for courses/lessons, `req.query` for search, category, level, price, and pagination. | [`src/routes/courses.js#L10-L18`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/routes/courses.js#L10-L18) |
| **Validation & Sanitization** | `express-validator` rules (`body('email').isEmail().normalizeEmail()`, `escape()`). | [`src/routes/auth.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/routes/auth.js), [`src/routes/courses.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/routes/courses.js) |
| **Authentication & Password Hashing** | Salted `bcryptjs.hash()` with cost factor 10, comparison via `bcryptjs.compare()`. | [`src/routes/auth.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/routes/auth.js) |
| **JWT & Role-Based Access Control (RBAC)** | `jsonwebtoken` issuing tokens, `protect` middleware verifying tokens, and `allow('student'/'instructor'/'admin')`. | [`src/middleware/auth.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/middleware/auth.js) |
| **File Upload with Multer** | Multi-part form parsing with file size limits (200MB for video, 50MB for materials) and MIME type filtering. | [`src/middleware/upload.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/middleware/upload.js) |
| **HTTP Status Codes** | `200 OK`, `201 Created`, `206 Partial Content`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `429 Too Many Requests`, `500 Internal Error`. | Across all API endpoints |
| **Testing APIs with Postman** | Complete ready-to-import Postman Collection with automated test scripts and environment variables. | [`LMS_API_Collection.postman_collection.json`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/LMS_API_Collection.postman_collection.json) |

---

## 5. Placement Viva & Technical Interview Questions

### Q1: How do you stop a paying user from sharing the video URL with everyone?
> **Answer:**
> We never expose direct static URLs to raw video files in the browser. Instead, the client must call `GET /api/lessons/:id/stream-url`. The backend verifies that the requester has an active, paid enrollment in the course. Upon verification, the server generates a cryptographically signed JWT token (`STREAM_SECRET`) containing the lesson ID, user ID, a random nonce, and a strict **2-minute expiration timestamp**. 
> The HTML5 video player requests `/api/stream/:token`. When another user attempts to reuse or copy that URL after 2 minutes, `jwt.verify()` throws an expiration error, rejecting unauthorized streaming.

### Q2: Why stream videos with Node.js Streams (`fs.createReadStream`) and HTTP 206 instead of `fs.readFile()`?
> **Answer:**
> Video files are typically between 100MB and 2GB in size. If the backend used `fs.readFile()`, it would buffer the entire multi-gigabyte video into RAM before sending the first byte, causing massive memory spikes and server crashes under concurrent traffic.
> By reading the `Range: bytes=start-end` request header and using `fs.createReadStream({ start, end }).pipe(res)`, Node.js only reads small 64KB chunks from the disk and immediately streams them over the socket. When a user seeks to 15:30 in the video, the browser asks only for bytes starting at that timestamp, providing near-instant seek response times.

### Q3: How does Node.js handle I/O without blocking the Event Loop?
> **Answer:**
> Node.js delegates asynchronous I/O tasks (such as disk reads via `fs.createReadStream` and network requests) to the libuv thread pool and operating system kernel asynchronously. The single main JavaScript thread remains completely free to handle incoming HTTP requests and dispatch events via the Event Loop.

### Q4: How do you track watch progress without writing to the database every second?
> **Answer:**
> The video element fires the `ontimeupdate` event multiple times per second. Writing to the database on every tick would flood the database with hundreds of queries per student.
> In our application, we implement **client-side throttling** in [`public/app.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/public/app.js) and **server-side write throttling** in [`src/routes/learn.js`](file:///Users/ujjavalgoyal/Downloads/LMS_Project_Code/src/routes/learn.js). Progress updates are written at most once every 10 to 15 seconds. Only when the video ends (`onended`) or an assessment is submitted is an immediate write forced.

### Q5: How would you compute instructor payouts correctly including platform fees?
> **Answer:**
> For every successful course payment, the platform calculates gross transaction volume. Our platform applies an 80/20 revenue split:
> - Platform Commission: `Gross * 0.20`
> - Instructor Earned Share: `Gross * 0.80`
> The Admin Console tracks `earnedPayout` vs `alreadyPaid` in the ledger, computing `balanceDue`. When the admin triggers a payout (`POST /api/admin/payouts`), an immutable payout record is logged with the bank reference code and the balance is settled.
