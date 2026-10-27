// EduStream LMS - Modern Frontend Application (ES6+, Fetch API, Async/Await, DOM)

const app = document.getElementById('app');
const navRight = document.getElementById('navRight');
const globalAlert = document.getElementById('globalAlert');

// State
let token = localStorage.getItem('lms_token') || localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('lms_user') || localStorage.getItem('user') || 'null');
let currentLesson = null;
let currentCourseId = null;
let lastProgressSent = 0;
let videoPlayerInstance = null;

// Helper: API Request Wrapper with Fetch & Async/Await
async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  try {
    const res = await fetch('/api' + url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg =
        data.error ||
        (data.errors && data.errors.map((e) => `${e.field || ''}: ${e.message}`).join(', ')) ||
        `Request failed with status ${res.status}`;
      throw new Error(errMsg);
    }
    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

// Helper: Show Dismissible Alert
function showAlert(message, type = 'danger') {
  globalAlert.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show shadow-sm" role="alert">
      <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'info' ? 'info-circle' : 'exclamation-triangle'}-fill me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearAlert() {
  globalAlert.innerHTML = '';
}

// Helper: Format Seconds into mm:ss
function formatTime(seconds) {
  const sec = Math.floor(seconds || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

// -------------------------------------------------------------
// Navigation Bar Rendering & Role Handling
// -------------------------------------------------------------

async function renderNav() {
  // Toggle role-specific navigation tabs
  const myCoursesLink = document.getElementById('navMyCourses');
  const instructorLink = document.getElementById('navInstructor');
  const adminLink = document.getElementById('navAdmin');

  if (myCoursesLink) myCoursesLink.style.display = user && user.role === 'student' ? 'block' : 'none';
  if (instructorLink) instructorLink.style.display = user && user.role === 'instructor' ? 'block' : 'none';
  if (adminLink) adminLink.style.display = user && user.role === 'admin' ? 'block' : 'none';

  if (!user) {
    navRight.innerHTML = `
      <button class="btn btn-primary btn-sm px-3 shadow-sm" onclick="showAuth('login')">
        <i class="bi bi-box-arrow-in-right me-1"></i> Sign In / Register
      </button>
    `;
    return;
  }

  // Fetch unread notifications count
  let notifCount = 0;
  try {
    const meData = await api('/auth/me');
    if (meData && meData.notifications) {
      notifCount = meData.notifications.filter((n) => !n.read).length;
    }
  } catch (e) {
    // Non-fatal
  }

  const roleBadgeClass =
    user.role === 'admin' ? 'bg-danger' : user.role === 'instructor' ? 'bg-warning text-dark' : 'bg-primary';

  navRight.innerHTML = `
    <div class="dropdown me-2">
      <button class="btn btn-outline-light btn-sm position-relative" type="button" data-bs-toggle="dropdown" onclick="markNotificationsRead()">
        <i class="bi bi-bell"></i>
        ${notifCount > 0 ? `<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">${notifCount}</span>` : ''}
      </button>
      <ul class="dropdown-menu dropdown-menu-end shadow" style="min-width: 280px;" id="notifDropdown">
        <li class="dropdown-header">System Notifications</li>
        <li class="px-3 py-2 text-muted small" id="notifList">Loading notifications...</li>
      </ul>
    </div>

    <div class="d-flex align-items-center text-white me-3">
      <div class="me-2 text-end d-none d-sm-block">
        <div class="fw-semibold small">${user.name}</div>
        <span class="badge ${roleBadgeClass} text-uppercase" style="font-size: 0.65rem;">${user.role}</span>
      </div>
      <div class="rounded-circle bg-secondary d-flex align-items-center justify-content-center text-white fw-bold" style="width: 34px; height: 34px;">
        ${user.name.charAt(0).toUpperCase()}
      </div>
    </div>

    <button class="btn btn-outline-light btn-sm" onclick="logout()" title="Sign Out">
      <i class="bi bi-box-arrow-right"></i>
    </button>
  `;

  loadNotifications();
}

async function loadNotifications() {
  try {
    const meData = await api('/auth/me');
    const container = document.getElementById('notifList');
    if (!container) return;

    if (!meData.notifications || !meData.notifications.length) {
      container.innerHTML = '<span class="text-muted small">No notifications yet.</span>';
      return;
    }

    container.innerHTML = meData.notifications
      .map(
        (n) => `
        <div class="border-bottom py-1 mb-1">
          <p class="mb-0 small text-dark">${n.message}</p>
          <small class="text-muted" style="font-size:0.7rem;">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      `
      )
      .join('');
  } catch (e) {}
}

async function markNotificationsRead() {
  try {
    await api('/auth/notifications/read-all', { method: 'PATCH' });
  } catch (e) {}
}

function logout() {
  localStorage.removeItem('lms_token');
  localStorage.removeItem('lms_user');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token = null;
  user = null;
  renderNav();
  showAlert('You have been logged out successfully.', 'info');
  showCatalogue();
}

// -------------------------------------------------------------
// Authentication View (Login, Register & Demo Quick Logins)
// -------------------------------------------------------------

function showAuth(mode = 'login') {
  clearAlert();
  app.innerHTML = `
    <div class="row justify-content-center mt-4">
      <div class="col-md-6 col-lg-5">
        <div class="card shadow-sm border-0">
          <div class="card-body p-4">
            <h4 class="card-title fw-bold text-center mb-1">
              ${mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h4>
            <p class="text-muted text-center small mb-4">
              ${mode === 'login' ? 'Sign in to continue to your LMS courses' : 'Join as a student or instructor today'}
            </p>

            <div id="authMsg"></div>

            <form id="authForm" onsubmit="event.preventDefault(); submitAuth('${mode}');">
              ${
                mode === 'register'
                  ? `
                <div class="mb-3">
                  <label class="form-label small fw-semibold">Full Name</label>
                  <input id="authName" class="form-control" placeholder="Rahul Sharma" required>
                </div>
                <div class="mb-3">
                  <label class="form-label small fw-semibold">I want to join as</label>
                  <select id="authRole" class="form-select">
                    <option value="student">Student (Learn &amp; Take Courses)</option>
                    <option value="instructor">Instructor (Publish &amp; Teach)</option>
                  </select>
                </div>
              `
                  : ''
              }

              <div class="mb-3">
                <label class="form-label small fw-semibold">Email Address</label>
                <input id="authEmail" type="email" class="form-control" placeholder="user@example.com" required>
              </div>

              <div class="mb-3">
                <label class="form-label small fw-semibold">Password</label>
                <input id="authPassword" type="password" class="form-control" placeholder="••••••••" required>
              </div>

              <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold shadow-sm mb-3">
                ${mode === 'login' ? 'Sign In' : 'Register Now'}
              </button>
            </form>

            <div class="text-center small mb-3">
              ${
                mode === 'login'
                  ? `Don't have an account? <a href="#" onclick="showAuth('register')">Register here</a>`
                  : `Already have an account? <a href="#" onclick="showAuth('login')">Sign in</a>`
              }
            </div>

            <hr>
            <div class="mt-3">
              <label class="form-label small fw-bold text-secondary text-uppercase" style="font-size:0.75rem;">1-Click Demo Logins</label>
              <div class="d-grid gap-2">
                <button class="btn btn-outline-primary btn-sm text-start" onclick="quickLogin('student@lms.com', 'Student@123')">
                  <i class="bi bi-person-fill me-1"></i> <strong>Student Demo:</strong> student@lms.com (Rahul)
                </button>
                <button class="btn btn-outline-warning text-dark btn-sm text-start" onclick="quickLogin('teacher@lms.com', 'Teacher@123')">
                  <i class="bi bi-person-video3 me-1"></i> <strong>Instructor Demo:</strong> teacher@lms.com (Dr. John)
                </button>
                <button class="btn btn-outline-danger btn-sm text-start" onclick="quickLogin('admin@lms.com', 'Admin@123')">
                  <i class="bi bi-shield-lock-fill me-1"></i> <strong>Admin Demo:</strong> admin@lms.com (System Admin)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function quickLogin(email, password) {
  const emailInput = document.getElementById('authEmail');
  const passInput = document.getElementById('authPassword');
  if (emailInput && passInput) {
    emailInput.value = email;
    passInput.value = password;
  }
  await submitAuth('login', { email, password });
}

async function submitAuth(mode, overridePayload) {
  const msgBox = document.getElementById('authMsg');
  if (msgBox) msgBox.innerHTML = '';

  try {
    let payload;
    if (overridePayload) {
      payload = overridePayload;
    } else {
      payload = {
        email: document.getElementById('authEmail').value,
        password: document.getElementById('authPassword').value
      };
      if (mode === 'register') {
        payload.name = document.getElementById('authName').value;
        payload.role = document.getElementById('authRole').value;
      }
    }

    const data = await api('/auth/' + mode, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    token = data.token;
    user = data.user;
    localStorage.setItem('lms_token', token);
    localStorage.setItem('lms_user', JSON.stringify(user));
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));

    renderNav();
    showAlert(`Welcome, ${user.name}! Successfully signed in as ${user.role}.`, 'success');

    if (user.role === 'student') showMyCourses();
    else if (user.role === 'instructor') showInstructor();
    else if (user.role === 'admin') showAdmin();
    else showCatalogue();
  } catch (err) {
    if (msgBox) {
      msgBox.innerHTML = `<div class="alert alert-danger py-2 small">${err.message}</div>`;
    } else {
      showAlert(err.message, 'danger');
    }
  }
}

// -------------------------------------------------------------
// Course Catalogue View
// -------------------------------------------------------------

async function showCatalogue(page = 1) {
  clearAlert();
  const searchInput = document.getElementById('filterSearch');
  const levelSelect = document.getElementById('filterLevel');
  const catSelect = document.getElementById('filterCategory');
  const priceSelect = document.getElementById('filterPrice');

  const search = searchInput ? searchInput.value : '';
  const level = levelSelect ? levelSelect.value : '';
  const category = catSelect ? catSelect.value : '';
  const price = priceSelect ? priceSelect.value : '';

  try {
    const data = await api(
      `/courses?page=${page}&limit=6&search=${encodeURIComponent(search)}&level=${level}&category=${encodeURIComponent(category)}&price=${price}`
    );

    app.innerHTML = `
      <!-- Hero Banner -->
      <div class="hero-banner">
        <div class="row align-items-center">
          <div class="col-lg-8">
            <h1 class="display-6 fw-bold mb-2">Advance Your Career with Video Courses</h1>
            <p class="lead mb-3 text-light opacity-75">
              Secure media streaming, hands-on quizzes, assignments, and verified certificates designed for developers.
            </p>
            <div class="d-flex flex-wrap gap-2">
              <span class="badge bg-primary px-3 py-2"><i class="bi bi-shield-check me-1"></i> Signed Expiring URLs</span>
              <span class="badge bg-info text-dark px-3 py-2"><i class="bi bi-play-btn me-1"></i> HTTP 206 Byte Streaming</span>
              <span class="badge bg-success px-3 py-2"><i class="bi bi-award me-1"></i> Auto-Issued Certificates</span>
            </div>
          </div>
          <div class="col-lg-4 text-center d-none d-lg-block">
            <i class="bi bi-mortarboard display-1 text-primary opacity-50"></i>
          </div>
        </div>
      </div>

      <!-- Filters & Search Toolbar -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-body p-3">
          <div class="row g-2 align-items-center">
            <div class="col-md-4">
              <div class="input-group">
                <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
                <input id="filterSearch" class="form-control border-start-0" placeholder="Search by title, topic..." value="${search}" oninput="debounceCatalogue()">
              </div>
            </div>
            <div class="col-md-3">
              <select id="filterCategory" class="form-select" onchange="showCatalogue(1)">
                <option value="">All Categories</option>
                ${(data.categories || []).map((cat) => `<option value="${cat}" ${category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
              </select>
            </div>
            <div class="col-md-2">
              <select id="filterLevel" class="form-select" onchange="showCatalogue(1)">
                <option value="">All Levels</option>
                <option value="beginner" ${level === 'beginner' ? 'selected' : ''}>Beginner</option>
                <option value="intermediate" ${level === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                <option value="advanced" ${level === 'advanced' ? 'selected' : ''}>Advanced</option>
              </select>
            </div>
            <div class="col-md-2">
              <select id="filterPrice" class="form-select" onchange="showCatalogue(1)">
                <option value="">All Pricing</option>
                <option value="free" ${price === 'free' ? 'selected' : ''}>Free Only</option>
                <option value="paid" ${price === 'paid' ? 'selected' : ''}>Paid Only</option>
              </select>
            </div>
            <div class="col-md-1 text-end">
              <button class="btn btn-outline-secondary w-100" onclick="resetFilters()" title="Reset Filters">
                <i class="bi bi-arrow-counterclockwise"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Course Cards Grid -->
      <div class="row g-4 mb-4">
        ${
          data.courses && data.courses.length
            ? data.courses
                .map(
                  (c) => `
              <div class="col-md-6 col-lg-4">
                <div class="card course-card h-100">
                  <div class="course-thumbnail-placeholder">
                    <i class="bi bi-${c.category && c.category.includes('Node') ? 'filetype-js' : c.category && c.category.includes('React') ? 'filetype-jsx' : 'laptop'}"></i>
                  </div>
                  <div class="card-body d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <span class="badge bg-light text-dark border">${c.category || 'General'}</span>
                      <span class="badge bg-secondary-subtle text-secondary text-capitalize">${c.level}</span>
                    </div>
                    <h5 class="card-title fw-bold text-dark mb-1">${c.title}</h5>
                    <p class="text-muted small mb-2">By ${c.instructorName}</p>
                    <p class="card-text text-secondary small flex-grow-1" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                      ${c.description}
                    </p>

                    <div class="d-flex align-items-center justify-content-between pt-2 border-top mt-2">
                      <div>
                        <span class="text-warning"><i class="bi bi-star-fill"></i> ${c.avgRating || '5.0'}</span>
                        <span class="text-muted small">(${c.reviewCount || 0}) &bull; ${c.totalLessons || 0} lessons</span>
                      </div>
                      <div class="fs-5 fw-bold text-primary">
                        ${c.price ? `&#8377;${c.price}` : '<span class="badge bg-success">Free</span>'}
                      </div>
                    </div>
                  </div>
                  <div class="card-footer bg-white border-0 pt-0 pb-3">
                    <button class="btn btn-primary w-100 fw-semibold" onclick="showCourse(${c.id})">
                      View Syllabus &amp; Enrol
                    </button>
                  </div>
                </div>
              </div>
            `
                )
                .join('')
            : `
            <div class="col-12 text-center py-5">
              <i class="bi bi-search display-3 text-muted"></i>
              <h5 class="mt-3 text-secondary">No matching courses found</h5>
              <p class="text-muted small">Try altering your search query or reset your filters.</p>
              <button class="btn btn-outline-primary btn-sm" onclick="resetFilters()">Reset Filters</button>
            </div>
          `
        }
      </div>

      <!-- Pagination Controls -->
      ${
        data.totalPages > 1
          ? `
        <div class="d-flex justify-content-between align-items-center py-3">
          <small class="text-muted">Showing page ${data.page} of ${data.totalPages} (${data.total} courses total)</small>
          <div class="btn-group">
            <button class="btn btn-outline-secondary btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="showCatalogue(${data.page - 1})">
              &laquo; Previous
            </button>
            <button class="btn btn-outline-secondary btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="showCatalogue(${data.page + 1})">
              Next &raquo;
            </button>
          </div>
        </div>
      `
          : ''
      }
    `;
  } catch (err) {
    showAlert('Failed to load courses catalogue: ' + err.message, 'danger');
  }
}

let searchDebounceTimeout = null;
function debounceCatalogue() {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => showCatalogue(1), 350);
}

function resetFilters() {
  const s = document.getElementById('filterSearch');
  const l = document.getElementById('filterLevel');
  const c = document.getElementById('filterCategory');
  const p = document.getElementById('filterPrice');
  if (s) s.value = '';
  if (l) l.value = '';
  if (c) c.value = '';
  if (p) p.value = '';
  showCatalogue(1);
}

// -------------------------------------------------------------
// Course Detail & Preview View
// -------------------------------------------------------------

async function showCourse(id) {
  clearAlert();
  try {
    const c = await api('/courses/' + id);

    // Check if current user is enrolled
    let isStudentEnrolled = false;
    if (user && user.role === 'student') {
      try {
        const myCourses = await api('/my-courses');
        isStudentEnrolled = myCourses.some((item) => item.courseId === c.id);
      } catch (e) {}
    }

    app.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-outline-secondary btn-sm" onclick="showCatalogue()">
          <i class="bi bi-arrow-left me-1"></i> Back to Courses
        </button>
      </div>

      <div class="row g-4">
        <!-- Left: Course Overview & Syllabus -->
        <div class="col-lg-8">
          <div class="card border-0 shadow-sm p-4 mb-4">
            <div class="d-flex flex-wrap gap-2 mb-2">
              <span class="badge bg-primary">${c.category}</span>
              <span class="badge bg-secondary text-capitalize">${c.level}</span>
              <span class="badge bg-info text-dark">${c.enrollCount || 0} students enrolled</span>
            </div>
            <h2 class="fw-bold mb-2">${c.title}</h2>
            <p class="text-muted">Instructor: <strong>${c.instructorName}</strong> &bull; Rating: <i class="bi bi-star-fill text-warning"></i> ${c.avgRating} (${c.reviewCount} reviews)</p>
            <hr>
            <h5 class="fw-bold">About this Course</h5>
            <p class="text-secondary leading-relaxed">${c.description}</p>
          </div>

          <!-- Curriculum Sections & Lessons -->
          <div class="card border-0 shadow-sm p-4 mb-4">
            <h5 class="fw-bold mb-3"><i class="bi bi-collection-play me-2 text-primary"></i>Course Curriculum (${c.lessons ? c.lessons.length : 0} items)</h5>
            
            ${
              c.sections && c.sections.length
                ? c.sections
                    .map((s) => {
                      const sectionLessons = (c.lessons || []).filter((l) => l.sectionId === s.id);
                      return `
                  <div class="mb-3">
                    <h6 class="fw-bold bg-light p-2 rounded border-start border-4 border-primary">
                      ${s.title}
                    </h6>
                    <ul class="list-group list-group-flush mb-2">
                      ${
                        sectionLessons.length
                          ? sectionLessons
                              .map(
                                (l) => `
                        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
                          <div>
                            <i class="bi bi-${l.type === 'video' ? 'play-circle text-primary' : l.type === 'quiz' ? 'patch-question text-warning' : 'journal-code text-success'} me-2"></i>
                            <span>${l.title}</span>
                          </div>
                          <div>
                            ${l.isPreview ? '<span class="badge bg-success-subtle text-success me-2">Free Preview</span>' : ''}
                            <span class="badge bg-light text-secondary text-uppercase">${l.type}</span>
                          </div>
                        </li>
                      `
                              )
                              .join('')
                          : '<li class="list-group-item text-muted small">No lessons in this module yet.</li>'
                      }
                    </ul>
                  </div>
                `;
                    })
                    .join('')
                : `
                <ul class="list-group list-group-flush">
                  ${(c.lessons || [])
                    .map(
                      (l) => `
                    <li class="list-group-item d-flex justify-content-between align-items-center py-2">
                      <div>
                        <i class="bi bi-${l.type === 'video' ? 'play-circle text-primary' : l.type === 'quiz' ? 'patch-question text-warning' : 'journal-code text-success'} me-2"></i>
                        <span>${l.title}</span>
                      </div>
                      <span class="badge bg-light text-secondary">${l.type}</span>
                    </li>
                  `
                    )
                    .join('')}
                </ul>
              `
            }
          </div>

          <!-- Student Reviews & Feedback -->
          <div class="card border-0 shadow-sm p-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0"><i class="bi bi-chat-heart me-2 text-danger"></i>Student Reviews</h5>
              ${
                isStudentEnrolled
                  ? `
                <button class="btn btn-outline-primary btn-sm" onclick="showReviewModal(${c.id})">
                  <i class="bi bi-pencil me-1"></i> Write Review
                </button>
              `
                  : ''
              }
            </div>

            ${
              c.reviews && c.reviews.length
                ? c.reviews
                    .map(
                      (r) => `
                <div class="border-bottom py-2">
                  <div class="d-flex justify-content-between">
                    <strong>${r.userName}</strong>
                    <span class="text-warning">
                      ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
                    </span>
                  </div>
                  <p class="text-secondary small mb-1 mt-1">${r.comment}</p>
                  <small class="text-muted" style="font-size:0.75rem;">${new Date(r.createdAt).toLocaleDateString()}</small>
                </div>
              `
                    )
                    .join('')
                : '<p class="text-muted small">No reviews written yet. Be the first to review after enrolling!</p>'
            }
          </div>
        </div>

        <!-- Right: Enrolment Action Card -->
        <div class="col-lg-4">
          <div class="card border-0 shadow-sm sticky-top" style="top: 80px;">
            <div class="card-body p-4 text-center">
              <div class="display-6 fw-bold text-primary mb-2">
                ${c.price ? `&#8377;${c.price}` : '<span class="text-success">Free Enrolment</span>'}
              </div>
              <p class="text-muted small mb-4">Full lifetime access &bull; Certificate included &bull; Q&amp;A support</p>

              ${
                isStudentEnrolled
                  ? `
                <div class="alert alert-success py-2 small mb-3">
                  <i class="bi bi-check-circle-fill me-1"></i> You are enrolled in this course!
                </div>
                <button class="btn btn-success w-100 py-2 fw-semibold mb-2" onclick="showLearn(${c.id})">
                  <i class="bi bi-play-circle me-1"></i> Go to Learning Room
                </button>
              `
                  : user && user.role === 'student'
                  ? `
                <div class="card bg-light p-3 mb-3 text-start small border">
                  <label class="form-label fw-semibold mb-1">Payment Verification (Test Card)</label>
                  <input id="checkoutCard" class="form-control form-control-sm mb-1" value="4242 4242 4242 4242" placeholder="4242 4242 4242 4242">
                  <small class="text-muted">Test payment gateway prefilled for convenience.</small>
                </div>
                <button class="btn btn-primary w-100 py-2 fw-bold shadow-sm" onclick="processEnrollment(${c.id})">
                  <i class="bi bi-credit-card me-1"></i> ${c.price ? `Pay &#8377;${c.price} &amp; Enrol` : 'Enrol for Free'}
                </button>
              `
                  : user && user.role === 'instructor'
                  ? `
                <div class="alert alert-warning py-2 small mb-0">
                  You are logged in as an instructor.
                </div>
              `
                  : `
                <p class="text-muted small">Please sign in as a student to enrol in this course.</p>
                <button class="btn btn-primary w-100 py-2 fw-semibold" onclick="showAuth('login')">
                  Sign In to Enrol
                </button>
              `
              }

              <div class="mt-4 pt-3 border-top text-start text-secondary small">
                <div class="mb-2"><i class="bi bi-shield-check text-success me-2"></i>100% verified curriculum</div>
                <div class="mb-2"><i class="bi bi-phone text-primary me-2"></i>Access on mobile, tablet &amp; desktop</div>
                <div><i class="bi bi-patch-check text-warning me-2"></i>Certificate upon completion</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    showAlert('Error loading course details: ' + err.message, 'danger');
  }
}

async function processEnrollment(courseId) {
  const cardInput = document.getElementById('checkoutCard');
  const cardNumber = cardInput ? cardInput.value : '';

  try {
    const res = await api('/enrollments', {
      method: 'POST',
      body: JSON.stringify({ courseId, cardNumber })
    });
    showAlert('Congratulations! Enrolment successful.', 'success');
    showLearn(courseId);
  } catch (err) {
    showAlert('Enrolment failed: ' + err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Student Dashboard ("My Learning")
// -------------------------------------------------------------

async function showMyCourses() {
  clearAlert();
  if (!user || user.role !== 'student') {
    return showAuth('login');
  }

  try {
    const list = await api('/my-courses');
    app.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 class="fw-bold mb-1">My Enrolled Courses</h2>
          <p class="text-muted small mb-0">Track your video progress, complete assessments, and claim certificates.</p>
        </div>
        <button class="btn btn-outline-primary btn-sm" onclick="showCatalogue()">
          <i class="bi bi-plus-circle me-1"></i> Explore More Courses
        </button>
      </div>

      <div class="row g-4">
        ${
          list.length
            ? list
                .map(
                  (item) => `
              <div class="col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm border-0">
                  <div class="course-thumbnail-placeholder" style="height: 100px;">
                    <i class="bi bi-journal-code"></i>
                  </div>
                  <div class="card-body d-flex flex-column">
                    <span class="badge bg-light text-dark border align-self-start mb-2">${item.course ? item.course.category : 'General'}</span>
                    <h5 class="fw-bold mb-2">${item.course ? item.course.title : 'Course'}</h5>
                    <p class="text-muted small flex-grow-1">Instructor: ${item.course ? item.course.instructorName : 'Instructor'}</p>

                    <div class="mb-3">
                      <div class="d-flex justify-content-between small mb-1">
                        <span>Progress</span>
                        <span class="fw-bold">${item.progressPercent}%</span>
                      </div>
                      <div class="progress" style="height: 8px;">
                        <div class="progress-bar ${item.progressPercent === 100 ? 'bg-success' : 'bg-primary'}" style="width: ${item.progressPercent}%;"></div>
                      </div>
                    </div>

                    <div class="d-grid gap-2">
                      <button class="btn btn-primary btn-sm fw-semibold" onclick="showLearn(${item.courseId})">
                        <i class="bi bi-play-circle me-1"></i> Continue Learning
                      </button>
                      ${
                        item.progressPercent === 100
                          ? `
                        <button class="btn btn-warning btn-sm text-dark fw-bold" onclick="showCertificate(${item.courseId})">
                          <i class="bi bi-award-fill me-1"></i> View Certificate
                        </button>
                      `
                          : ''
                      }
                    </div>
                  </div>
                </div>
              </div>
            `
                )
                .join('')
            : `
            <div class="col-12 text-center py-5">
              <i class="bi bi-mortarboard display-3 text-muted"></i>
              <h5 class="mt-3">You haven't enrolled in any courses yet</h5>
              <p class="text-muted small">Explore our catalogue to begin learning video courses with interactive assessments.</p>
              <button class="btn btn-primary" onclick="showCatalogue()">Browse Courses</button>
            </div>
          `
        }
      </div>
    `;
  } catch (err) {
    showAlert('Error loading your courses: ' + err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Interactive Learning Room (Video Player, Quiz, Notes, Q&A)
// -------------------------------------------------------------

async function showLearn(courseId) {
  clearAlert();
  currentCourseId = courseId;

  try {
    const data = await api('/learn/' + courseId);
    const { course, lessons, progressPercent } = data;

    // Pick first incomplete lesson, or first lesson by default
    const targetLesson = lessons.find((l) => !l.isCompleted) || lessons[0];

    app.innerHTML = `
      <!-- Top Room Bar -->
      <div class="card border-0 shadow-sm p-3 mb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <a href="#" class="text-decoration-none text-muted small" onclick="showMyCourses()">
              <i class="bi bi-arrow-left me-1"></i> Back to My Courses
            </a>
            <h4 class="fw-bold mb-0 text-dark">${course.title}</h4>
          </div>
          <div class="d-flex align-items-center gap-3">
            <div style="min-width: 140px;">
              <div class="d-flex justify-content-between small fw-semibold mb-1">
                <span>Course Progress</span>
                <span>${progressPercent}%</span>
              </div>
              <div class="progress" style="height: 6px;">
                <div class="progress-bar ${progressPercent === 100 ? 'bg-success' : 'bg-primary'}" style="width: ${progressPercent}%;"></div>
              </div>
            </div>
            ${
              progressPercent === 100
                ? `
              <button class="btn btn-warning btn-sm text-dark fw-bold shadow-sm" onclick="showCertificate(${courseId})">
                <i class="bi bi-award-fill me-1"></i> Get Certificate
              </button>
            `
                : ''
            }
          </div>
        </div>
      </div>

      <div class="row g-4">
        <!-- Left: Lesson Content / Video Player / Quiz Pane -->
        <div class="col-lg-8" id="lessonPlayerPane">
          <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 text-muted small">Loading lesson...</p>
          </div>
        </div>

        <!-- Right: Curriculum Lesson List Sidebar -->
        <div class="col-lg-4">
          <div class="card border-0 shadow-sm">
            <div class="card-header bg-white py-3 fw-bold d-flex justify-content-between align-items-center">
              <span><i class="bi bi-list-nested me-1"></i> Course Lessons</span>
              <span class="badge bg-secondary-subtle text-secondary">${lessons.length} Total</span>
            </div>
            <div class="list-group list-group-flush lesson-list-group" id="lessonSidebarList" style="max-height: 580px; overflow-y: auto;">
              ${lessons
                .map(
                  (l) => `
                <div class="list-group-item d-flex justify-content-between align-items-center py-3 ${l.id === (targetLesson ? targetLesson.id : 0) ? 'active-lesson' : ''} ${l.isCompleted ? 'completed-lesson' : ''}" id="lessonNavItem-${l.id}" onclick="loadLesson(${l.id}, ${courseId})">
                  <div class="d-flex align-items-start">
                    <i class="bi bi-${l.isCompleted ? 'check-circle-fill text-success' : l.type === 'video' ? 'play-circle' : l.type === 'quiz' ? 'patch-question' : 'journal-code'} me-2 fs-5"></i>
                    <div>
                      <div class="fw-semibold small">${l.order}. ${l.title}</div>
                      <small class="text-muted text-capitalize">${l.type} ${l.durationSec ? '&bull; ' + formatTime(l.durationSec) : ''}</small>
                    </div>
                  </div>
                  <div>
                    ${l.isCompleted ? '<span class="badge bg-success-subtle text-success small">Done</span>' : ''}
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    if (targetLesson) {
      loadLesson(targetLesson.id, courseId);
    }
  } catch (err) {
    showAlert('Error accessing learning room: ' + err.message, 'danger');
  }
}

async function loadLesson(lessonId, courseId) {
  const pane = document.getElementById('lessonPlayerPane');
  if (!pane) return;

  // Highlight active lesson in sidebar
  document.querySelectorAll('.lesson-list-group .list-group-item').forEach((el) => {
    el.classList.remove('active-lesson');
  });
  const navItem = document.getElementById(`lessonNavItem-${lessonId}`);
  if (navItem) navItem.classList.add('active-lesson');

  try {
    const courseData = await api('/learn/' + courseId);
    const lesson = courseData.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new Error('Lesson not found');
    currentLesson = lesson;

    if (lesson.type === 'video') {
      renderVideoLesson(lesson, courseId);
    } else if (lesson.type === 'quiz') {
      renderQuizLesson(lesson, courseId);
    } else if (lesson.type === 'assignment') {
      renderAssignmentLesson(lesson, courseId);
    }
  } catch (err) {
    pane.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// Video Lesson Player with Throttled Progress & Timestamped Notes
// -------------------------------------------------------------

async function renderVideoLesson(lesson, courseId) {
  const pane = document.getElementById('lessonPlayerPane');
  pane.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted small">Generating signed stream token...</p></div>`;

  try {
    // Request short-lived signed URL (expires in 2 minutes)
    const { url } = await api(`/lessons/${lesson.id}/stream-url`);

    pane.innerHTML = `
      <div class="card border-0 shadow-sm overflow-hidden mb-3">
        <!-- Secure Video Player Frame -->
        <div class="video-wrapper position-relative">
          <video id="activeVideoPlayer" controls controlsList="nodownload" preload="metadata" src="${url}"></video>
        </div>

        <!-- Video Controls Bar -->
        <div class="card-body p-3 bg-light border-top d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="small fw-semibold text-secondary">Playback Speed:</span>
            <select id="videoSpeedSelect" class="form-select form-select-sm w-auto" onchange="changePlaybackSpeed(this.value)">
              <option value="0.75">0.75x</option>
              <option value="1" selected>1.0x (Normal)</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-secondary-subtle text-secondary small">
              <i class="bi bi-clock-history me-1"></i> Resumable Position
            </span>
            <button class="btn btn-outline-success btn-sm" onclick="markLessonManualComplete(${lesson.id}, ${courseId})">
              <i class="bi bi-check2-circle me-1"></i> Mark as Completed
            </button>
          </div>
        </div>
      </div>

      <!-- Video Details & Tabs (Overview, Notes, Q&A, Resources) -->
      <div class="card border-0 shadow-sm">
        <div class="card-header bg-white border-bottom">
          <ul class="nav nav-tabs card-header-tabs" id="lessonTabs" role="tablist">
            <li class="nav-item">
              <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tabOverview">Overview</button>
            </li>
            <li class="nav-item">
              <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabNotes" onclick="loadLessonNotes(${lesson.id})">
                <i class="bi bi-journal-text me-1"></i> Timestamp Notes
              </button>
            </li>
            <li class="nav-item">
              <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabQA" onclick="loadLessonQA(${lesson.id})">
                <i class="bi bi-chat-dots me-1"></i> Q&amp;A Discussion
              </button>
            </li>
            <li class="nav-item">
              <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabResources">
                <i class="bi bi-paperclip me-1"></i> Resources (${lesson.resources ? lesson.resources.length : 0})
              </button>
            </li>
          </ul>
        </div>
        <div class="card-body tab-content p-4">
          <!-- Overview Tab -->
          <div class="tab-pane fade show active" id="tabOverview">
            <h5 class="fw-bold mb-2">${lesson.title}</h5>
            <p class="text-secondary small leading-relaxed">
              ${lesson.transcript || 'Welcome to this video lesson. Take notes at key moments and ask any questions in the Q&A tab below.'}
            </p>
          </div>

          <!-- Notes Tab -->
          <div class="tab-pane fade" id="tabNotes">
            <div class="d-flex gap-2 mb-3">
              <input id="noteInput" class="form-control form-control-sm" placeholder="Write a note at current playback time...">
              <button class="btn btn-primary btn-sm text-nowrap" onclick="saveNoteAtCurrentTime(${lesson.id})">
                <i class="bi bi-plus-circle me-1"></i> Add Note
              </button>
            </div>
            <div id="notesContainer">
              <p class="text-muted small">Loading your notes...</p>
            </div>
          </div>

          <!-- Q&A Discussion Tab -->
          <div class="tab-pane fade" id="tabQA">
            <div class="mb-3">
              <label class="form-label small fw-semibold">Ask a question regarding this lesson</label>
              <div class="input-group">
                <textarea id="qaQuestionInput" class="form-control" rows="2" placeholder="e.g. Can you explain why we use HTTP Range 206 for video streaming?"></textarea>
                <button class="btn btn-primary" onclick="submitQuestion(${lesson.id})">
                  <i class="bi bi-send-fill"></i>
                </button>
              </div>
            </div>
            <hr>
            <div id="qaThreadsContainer">
              <p class="text-muted small">Loading Q&A discussions...</p>
            </div>
          </div>

          <!-- Resources Tab -->
          <div class="tab-pane fade" id="tabResources">
            <h6 class="fw-bold mb-3">Downloadable Materials &amp; Cheatsheets</h6>
            ${
              lesson.resources && lesson.resources.length
                ? `<ul class="list-group">
                  ${lesson.resources
                    .map(
                      (r) => `
                    <li class="list-group-item d-flex justify-content-between align-items-center py-2">
                      <div>
                        <i class="bi bi-file-earmark-arrow-down text-primary me-2 fs-5"></i>
                        <span class="small fw-semibold">${r.title}</span>
                      </div>
                      <a href="/api/resources/${r.id}/download" class="btn btn-outline-primary btn-sm" download>
                        <i class="bi bi-download me-1"></i> Download
                      </a>
                    </li>
                  `
                    )
                    .join('')}
                </ul>`
                : '<p class="text-muted small">No external resource attachments for this lesson.</p>'
            }
          </div>
        </div>
      </div>
    `;

    // Initialize HTML5 Video Player events
    const video = document.getElementById('activeVideoPlayer');
    videoPlayerInstance = video;

    // Resumable playback: restore last watched position
    video.onloadedmetadata = () => {
      if (lesson.lastPosition && lesson.lastPosition > 0) {
        video.currentTime = lesson.lastPosition;
      }
    };

    // Throttled progress updates: writes to DB at most once per 10 seconds
    video.ontimeupdate = () => {
      const now = Date.now();
      if (now - lastProgressSent > 10000) {
        lastProgressSent = now;
        api('/progress', {
          method: 'POST',
          body: JSON.stringify({ lessonId: lesson.id, position: video.currentTime })
        }).catch(() => {});
      }
    };

    // Auto-completion on video end
    video.onended = async () => {
      try {
        await api('/progress', {
          method: 'POST',
          body: JSON.stringify({ lessonId: lesson.id, position: video.currentTime, completed: true })
        });
        showAlert(`Great job! You completed "${lesson.title}".`, 'success');
        showLearn(courseId);
      } catch (e) {}
    };
  } catch (err) {
    pane.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function changePlaybackSpeed(rate) {
  if (videoPlayerInstance) {
    videoPlayerInstance.playbackRate = parseFloat(rate);
  }
}

async function markLessonManualComplete(lessonId, courseId) {
  try {
    const curTime = videoPlayerInstance ? videoPlayerInstance.currentTime : 0;
    await api('/progress', {
      method: 'POST',
      body: JSON.stringify({ lessonId, position: curTime, completed: true })
    });
    showAlert('Lesson marked as completed!', 'success');
    showLearn(courseId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Timestamped Notes
// -------------------------------------------------------------

async function loadLessonNotes(lessonId) {
  const container = document.getElementById('notesContainer');
  if (!container) return;

  try {
    const notes = await api(`/lessons/${lessonId}/notes`);
    if (!notes.length) {
      container.innerHTML = '<p class="text-muted small">You haven\'t added any notes for this lesson yet.</p>';
      return;
    }

    container.innerHTML = `
      <div class="list-group">
        ${notes
          .map(
            (n) => `
          <div class="list-group-item d-flex justify-content-between align-items-center py-2">
            <div>
              <span class="timestamp-pill me-2" onclick="seekVideoTo(${n.timestampSec})" title="Click to jump to this video time">
                <i class="bi bi-play-fill"></i> ${formatTime(n.timestampSec)}
              </span>
              <span class="small text-dark">${n.text}</span>
            </div>
            <button class="btn btn-outline-danger btn-sm border-0" onclick="deleteNote(${n.id}, ${lessonId})" title="Delete Note">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<small class="text-danger">${err.message}</small>`;
  }
}

function seekVideoTo(seconds) {
  if (videoPlayerInstance) {
    videoPlayerInstance.currentTime = seconds;
    videoPlayerInstance.play();
  }
}

async function saveNoteAtCurrentTime(lessonId) {
  const input = document.getElementById('noteInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const timestampSec = videoPlayerInstance ? videoPlayerInstance.currentTime : 0;

  try {
    await api(`/lessons/${lessonId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text, timestampSec })
    });
    input.value = '';
    loadLessonNotes(lessonId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

async function deleteNote(noteId, lessonId) {
  try {
    await api(`/notes/${noteId}`, { method: 'DELETE' });
    loadLessonNotes(lessonId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Q&A Lesson Discussion
// -------------------------------------------------------------

async function loadLessonQA(lessonId) {
  const container = document.getElementById('qaThreadsContainer');
  if (!container) return;

  try {
    const threads = await api(`/lessons/${lessonId}/qa`);
    if (!threads.length) {
      container.innerHTML = '<p class="text-muted small">No questions posted yet. Ask a question to start the discussion!</p>';
      return;
    }

    container.innerHTML = threads
      .map(
        (t) => `
        <div class="card bg-light border-0 p-3 mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <strong>${t.userName} <span class="badge bg-secondary-subtle text-secondary small text-capitalize">${t.userRole}</span></strong>
            <small class="text-muted" style="font-size:0.75rem;">${new Date(t.createdAt).toLocaleDateString()}</small>
          </div>
          <p class="text-dark small mb-2">${t.question}</p>

          <!-- Replies -->
          <div class="ms-3 border-start ps-3 mt-2">
            ${
              t.replies && t.replies.length
                ? t.replies
                    .map(
                      (r) => `
                <div class="bg-white p-2 rounded mb-2 border small">
                  <div class="fw-semibold text-primary">${r.userName} <span class="badge bg-primary-subtle text-primary">${r.userRole}</span></div>
                  <div class="text-secondary">${r.text}</div>
                </div>
              `
                    )
                    .join('')
                : '<div class="text-muted small fst-italic">Waiting for instructor response...</div>'
            }

            <div class="input-group input-group-sm mt-2">
              <input id="replyInput-${t.id}" class="form-control" placeholder="Write a reply...">
              <button class="btn btn-outline-primary" onclick="submitReply(${t.id}, ${lessonId})">Reply</button>
            </div>
          </div>
        </div>
      `
      )
      .join('');
  } catch (err) {
    container.innerHTML = `<small class="text-danger">${err.message}</small>`;
  }
}

async function submitQuestion(lessonId) {
  const input = document.getElementById('qaQuestionInput');
  const question = input ? input.value.trim() : '';
  if (!question) return;

  try {
    await api(`/lessons/${lessonId}/qa`, {
      method: 'POST',
      body: JSON.stringify({ question })
    });
    input.value = '';
    loadLessonQA(lessonId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

async function submitReply(threadId, lessonId) {
  const input = document.getElementById(`replyInput-${threadId}`);
  const reply = input ? input.value.trim() : '';
  if (!reply) return;

  try {
    await api(`/qa/${threadId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply })
    });
    loadLessonQA(lessonId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Interactive Quiz Assessment View
// -------------------------------------------------------------

function renderQuizLesson(lesson, courseId) {
  const pane = document.getElementById('lessonPlayerPane');

  pane.innerHTML = `
    <div class="card border-0 shadow-sm p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <span class="badge bg-warning text-dark mb-1">Knowledge Assessment</span>
          <h4 class="fw-bold mb-0">${lesson.title}</h4>
        </div>
        <span class="badge bg-light text-secondary border">Max 3 Attempts &bull; 50% to Pass</span>
      </div>

      <div id="quizResultAlert"></div>

      <form id="quizForm" onsubmit="event.preventDefault(); submitQuizAnswers(${lesson.id}, ${courseId});">
        ${(lesson.questions || [])
          .map(
            (q, qIdx) => `
          <div class="card mb-3 border">
            <div class="card-body">
              <h6 class="fw-bold text-dark mb-3">${qIdx + 1}. ${q.q}</h6>
              <div class="d-flex flex-column gap-2">
                ${(q.options || [])
                  .map(
                    (opt, optIdx) => `
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="quiz_q_${qIdx}" id="q_${qIdx}_opt_${optIdx}" value="${optIdx}" required>
                    <label class="form-check-label" for="q_${qIdx}_opt_${optIdx}">
                      ${opt}
                    </label>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>
        `
          )
          .join('')}

        <div class="d-flex justify-content-end mt-3">
          <button type="submit" class="btn btn-primary px-4 fw-semibold shadow-sm">
            <i class="bi bi-send-check me-1"></i> Submit Quiz Answers
          </button>
        </div>
      </form>
    </div>
  `;
}

async function submitQuizAnswers(lessonId, courseId) {
  const resultBox = document.getElementById('quizResultAlert');
  const answers = [];
  let qIdx = 0;

  while (true) {
    const selected = document.querySelector(`input[name="quiz_q_${qIdx}"]:checked`);
    if (!selected) {
      if (document.querySelector(`input[name="quiz_q_${qIdx}"]`)) {
        showAlert('Please answer all questions before submitting.', 'warning');
        return;
      }
      break;
    }
    answers.push(Number(selected.value));
    qIdx++;
  }

  try {
    const attempt = await api(`/quizzes/${lessonId}/attempt`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    });

    const isPassed = attempt.score / attempt.total >= 0.5;
    resultBox.innerHTML = `
      <div class="alert alert-${isPassed ? 'success' : 'danger'} shadow-sm">
        <h5 class="fw-bold">${isPassed ? '🎉 Assessment Passed!' : '❌ Assessment Failed'}</h5>
        <p class="mb-0">
          You scored <strong>${attempt.score} out of ${attempt.total}</strong> (${Math.round((attempt.score / attempt.total) * 100)}%).
          Attempt ${attempt.attemptNo} of 3.
        </p>
      </div>
    `;

    if (isPassed) {
      setTimeout(() => showLearn(courseId), 1800);
    }
  } catch (err) {
    resultBox.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// Assignment Lesson View
// -------------------------------------------------------------

async function renderAssignmentLesson(lesson, courseId) {
  const pane = document.getElementById('lessonPlayerPane');

  try {
    const data = await api(`/lessons/${lesson.id}/assignment`);
    const sub = data.submission;

    pane.innerHTML = `
      <div class="card border-0 shadow-sm p-4">
        <span class="badge bg-success align-self-start mb-2">Hands-On Capstone Assignment</span>
        <h4 class="fw-bold mb-3">${lesson.title}</h4>

        <div class="card bg-light border-0 p-3 mb-4">
          <h6 class="fw-bold text-dark">Instructions:</h6>
          <p class="text-secondary small leading-relaxed mb-0">${lesson.instructions}</p>
        </div>

        ${
          sub
            ? `
          <div class="alert alert-info border-0 shadow-sm p-3 mb-4">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="fw-bold mb-0">Current Submission Status:</h6>
              <span class="badge bg-${sub.status === 'Passed' ? 'success' : sub.status === 'Needs Revision' ? 'warning text-dark' : 'primary'} fs-6">
                ${sub.status}
              </span>
            </div>
            <p class="small mb-1"><strong>Submitted URL:</strong> <a href="${sub.submissionUrl}" target="_blank" class="text-decoration-underline">${sub.submissionUrl}</a></p>
            ${sub.feedback ? `<p class="small mb-0 text-dark"><strong>Instructor Feedback:</strong> ${sub.feedback}</p>` : ''}
          </div>
        `
            : ''
        }

        <form id="assignmentForm" onsubmit="event.preventDefault(); submitAssignment(${lesson.id}, ${courseId});">
          <div class="mb-3">
            <label class="form-label small fw-semibold">GitHub Repository or Live Project Link</label>
            <input id="assignUrl" class="form-control" placeholder="https://github.com/username/project" value="${sub ? sub.submissionUrl : ''}" required>
          </div>
          <div class="mb-3">
            <label class="form-label small fw-semibold">Submission Notes / Documentation</label>
            <textarea id="assignComments" class="form-control" rows="3" placeholder="Describe architecture decisions, test coverage, and key features...">${sub ? sub.comments : ''}</textarea>
          </div>
          <button type="submit" class="btn btn-primary fw-semibold px-4">
            <i class="bi bi-cloud-arrow-up me-1"></i> ${sub ? 'Update Submission' : 'Submit Assignment'}
          </button>
        </form>
      </div>
    `;
  } catch (err) {
    pane.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

async function submitAssignment(lessonId, courseId) {
  const submissionUrl = document.getElementById('assignUrl').value;
  const comments = document.getElementById('assignComments').value;

  try {
    await api(`/lessons/${lessonId}/assignment-submit`, {
      method: 'POST',
      body: JSON.stringify({ submissionUrl, comments })
    });
    showAlert('Assignment submitted successfully for instructor review!', 'success');
    showLearn(courseId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Certificate of Completion View
// -------------------------------------------------------------

async function showCertificate(courseId) {
  clearAlert();
  try {
    const cert = await api('/certificates/' + courseId);

    app.innerHTML = `
      <div class="mb-4 d-flex justify-content-between align-items-center no-print">
        <button class="btn btn-outline-secondary btn-sm" onclick="showLearn(${courseId})">
          <i class="bi bi-arrow-left me-1"></i> Back to Course Room
        </button>
        <button class="btn btn-primary btn-sm px-3" onclick="window.print()">
          <i class="bi bi-printer me-1"></i> Print / Save as PDF
        </button>
      </div>

      <div class="certificate-container">
        <div class="certificate-seal">
          <i class="bi bi-patch-check-fill"></i>
        </div>
        <h1 class="display-6 fw-bold text-dark text-uppercase tracking-wide mb-1">Certificate of Completion</h1>
        <p class="text-muted small text-uppercase mb-4">EduStream Certified Full-Stack &amp; Node.js Engineering</p>

        <p class="lead mb-1">This is proudly presented to</p>
        <h2 class="display-5 fw-bold text-primary mb-3" style="font-family: Georgia, serif;">
          ${cert.student}
        </h2>

        <p class="text-secondary mb-1">for successfully completing all curriculum modules, assessments &amp; projects in</p>
        <h3 class="fw-bold text-dark mb-4">${cert.course}</h3>

        <div class="row pt-4 border-top text-secondary small align-items-center">
          <div class="col-4 text-start">
            <strong>Issued Date:</strong><br>
            ${new Date(cert.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div class="col-4 text-center">
            <strong>Verification ID:</strong><br>
            <code>${cert.certificateId}</code>
          </div>
          <div class="col-4 text-end">
            <strong>Instructor:</strong><br>
            ${cert.instructor}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Course Review Modal
// -------------------------------------------------------------

function showReviewModal(courseId) {
  const modalHtml = `
    <div class="modal fade" id="reviewModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fw-bold">Leave a Course Review</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label small fw-semibold">Rating (1 to 5 Stars)</label>
              <select id="reviewRating" class="form-select">
                <option value="5">★★★★★ (5 Stars - Excellent)</option>
                <option value="4">★★★★☆ (4 Stars - Very Good)</option>
                <option value="3">★★★☆☆ (3 Stars - Average)</option>
                <option value="2">★★☆☆☆ (2 Stars - Poor)</option>
                <option value="1">★☆☆☆☆ (1 Star - Terrible)</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Feedback Comment</label>
              <textarea id="reviewComment" class="form-control" rows="3" placeholder="Share your experience with other learners..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="submitReview(${courseId})">Submit Review</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = new bootstrap.Modal(document.getElementById('reviewModal'));
  modal.show();
}

async function submitReview(courseId) {
  const rating = document.getElementById('reviewRating').value;
  const comment = document.getElementById('reviewComment').value;

  try {
    await api(`/courses/${courseId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment })
    });
    const modalEl = document.getElementById('reviewModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    modalEl.remove();
    showAlert('Thank you for your review!', 'success');
    showCourse(courseId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Instructor Studio (Curriculum Builder & Grading)
// -------------------------------------------------------------

async function showInstructor(tab = 'courses') {
  clearAlert();
  if (!user || user.role !== 'instructor') {
    return showAuth('login');
  }

  try {
    const courses = await api('/instructor/courses');
    const submissions = await api('/instructor/submissions');

    app.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 class="fw-bold mb-1">Instructor Studio</h2>
          <p class="text-muted small mb-0">Build structured curricula, upload video lessons via Multer, create quizzes, and review assignments.</p>
        </div>
        <button class="btn btn-primary btn-sm shadow-sm" onclick="showCreateCourseModal()">
          <i class="bi bi-plus-lg me-1"></i> Create New Course
        </button>
      </div>

      <!-- Instructor Tabs -->
      <ul class="nav nav-pills mb-4">
        <li class="nav-item">
          <button class="nav-link ${tab === 'courses' ? 'active' : ''}" onclick="showInstructor('courses')">
            <i class="bi bi-collection-play me-1"></i> My Courses (${courses.length})
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link ${tab === 'grading' ? 'active' : ''}" onclick="showInstructor('grading')">
            <i class="bi bi-check2-square me-1"></i> Submissions to Grade (${submissions.filter((s) => s.status === 'Submitted').length})
          </button>
        </li>
      </ul>

      ${
        tab === 'courses'
          ? `
        <div class="row g-4">
          ${
            courses.length
              ? courses
                  .map(
                    (c) => `
                <div class="col-lg-6">
                  <div class="card shadow-sm border-0 h-100">
                    <div class="card-body p-4">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-${c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning text-dark'} text-uppercase">
                          ${c.status}
                        </span>
                        <span class="fw-bold text-primary">&#8377;${c.price}</span>
                      </div>
                      <h5 class="fw-bold mb-1">${c.title}</h5>
                      <p class="text-muted small mb-3">${c.category} &bull; ${c.level} &bull; ${c.lessonsCount} lessons</p>
                      
                      <div class="d-flex flex-wrap gap-2 mb-3">
                        <button class="btn btn-outline-primary btn-sm" onclick="showAddSectionModal(${c.id})">
                          <i class="bi bi-folder-plus me-1"></i> Add Module
                        </button>
                        <button class="btn btn-outline-primary btn-sm" onclick="showUploadVideoModal(${c.id})">
                          <i class="bi bi-camera-video me-1"></i> Upload Video
                        </button>
                        <button class="btn btn-outline-warning text-dark btn-sm" onclick="showAddQuizModal(${c.id})">
                          <i class="bi bi-patch-question me-1"></i> Add Quiz
                        </button>
                        <button class="btn btn-outline-success btn-sm" onclick="showAddAssignmentModal(${c.id})">
                          <i class="bi bi-journal-code me-1"></i> Add Assignment
                        </button>
                      </div>

                      <div class="border-top pt-2">
                        <small class="text-muted fw-semibold">Lessons in this course:</small>
                        <ul class="list-group list-group-flush small mt-1">
                          ${(c.lessons || [])
                            .map(
                              (l) => `
                            <li class="list-group-item d-flex justify-content-between align-items-center px-0 py-1">
                              <span>${l.order}. ${l.title} <span class="badge bg-light text-secondary">${l.type}</span></span>
                              <button class="btn btn-outline-danger btn-sm py-0 px-1 border-0" onclick="deleteLesson(${l.id})">
                                <i class="bi bi-trash"></i>
                              </button>
                            </li>
                          `
                            )
                            .join('')}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              `
                  )
                  .join('')
              : `
              <div class="col-12 text-center py-5">
                <i class="bi bi-folder2-open display-4 text-muted"></i>
                <h5 class="mt-3">No courses created yet</h5>
                <p class="text-muted small">Click "Create New Course" above to begin authoring curriculum modules.</p>
              </div>
            `
          }
        </div>
      `
          : `
        <!-- Grading Tab -->
        <div class="card border-0 shadow-sm p-4">
          <h5 class="fw-bold mb-3">Student Project Submissions</h5>
          <div class="table-responsive">
            <table class="table align-middle">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course / Lesson</th>
                  <th>Submission Link</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${
                  submissions.length
                    ? submissions
                        .map(
                          (s) => `
                      <tr>
                        <td><strong>${s.userName}</strong></td>
                        <td>${s.courseTitle}<br><small class="text-muted">${s.lessonTitle}</small></td>
                        <td><a href="${s.submissionUrl}" target="_blank" class="text-decoration-underline">${s.submissionUrl}</a></td>
                        <td><span class="badge bg-${s.status === 'Passed' ? 'success' : s.status === 'Needs Revision' ? 'warning text-dark' : 'primary'}">${s.status}</span></td>
                        <td>
                          <button class="btn btn-outline-success btn-sm me-1" onclick="gradeSubmission(${s.id}, 'Passed')">Pass</button>
                          <button class="btn btn-outline-warning btn-sm text-dark" onclick="gradeSubmission(${s.id}, 'Needs Revision')">Revise</button>
                        </td>
                      </tr>
                    `
                        )
                        .join('')
                    : '<tr><td colspan="5" class="text-muted text-center py-4">No submissions pending review.</td></tr>'
                }
              </tbody>
            </table>
          </div>
        </div>
      `
      }
    `;
  } catch (err) {
    showAlert('Error in Instructor Studio: ' + err.message, 'danger');
  }
}

// Instructor Modals: Create Course
function showCreateCourseModal() {
  const modalHtml = `
    <div class="modal fade" id="createCourseModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fw-bold">Create New Course</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label small fw-semibold">Course Title</label>
              <input id="cTitle" class="form-control" placeholder="Mastering Node.js Streams &amp; Buffers" required>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Description</label>
              <textarea id="cDesc" class="form-control" rows="3" placeholder="Explain what students will build and learn..." required></textarea>
            </div>
            <div class="row g-2 mb-3">
              <div class="col-6">
                <label class="form-label small fw-semibold">Price (&#8377;)</label>
                <input id="cPrice" type="number" class="form-control" value="499" min="0">
              </div>
              <div class="col-6">
                <label class="form-label small fw-semibold">Level</label>
                <select id="cLevel" class="form-select">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Category</label>
              <input id="cCategory" class="form-control" placeholder="Web Development" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="submitCreateCourse()">Create Course</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = new bootstrap.Modal(document.getElementById('createCourseModal'));
  modal.show();
}

async function submitCreateCourse() {
  const title = document.getElementById('cTitle').value;
  const description = document.getElementById('cDesc').value;
  const price = document.getElementById('cPrice').value;
  const level = document.getElementById('cLevel').value;
  const category = document.getElementById('cCategory').value;

  try {
    await api('/instructor/courses', {
      method: 'POST',
      body: JSON.stringify({ title, description, price, level, category })
    });
    const modalEl = document.getElementById('createCourseModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    modalEl.remove();
    showAlert('Course created and submitted for admin approval!', 'success');
    showInstructor();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Instructor Modals: Add Section
function showAddSectionModal(courseId) {
  const title = prompt('Enter module / section title:');
  if (!title) return;
  api(`/instructor/courses/${courseId}/sections`, {
    method: 'POST',
    body: JSON.stringify({ title })
  })
    .then(() => {
      showAlert('Section added!', 'success');
      showInstructor();
    })
    .catch((err) => showAlert(err.message, 'danger'));
}

// Instructor Modals: Upload Video Lesson via Multer
function showUploadVideoModal(courseId) {
  const modalHtml = `
    <div class="modal fade" id="uploadVideoModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fw-bold">Upload Video Lesson (Multer)</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label small fw-semibold">Lesson Title</label>
              <input id="vTitle" class="form-control" placeholder="01. Event Loop &amp; Microtasks" required>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Select Video File (.mp4, .webm)</label>
              <input id="vFile" type="file" class="form-control" accept="video/*" required>
            </div>
            <div class="form-check mb-3">
              <input class="form-check-input" type="checkbox" id="vPreview">
              <label class="form-check-label small" for="vPreview">Allow Free Preview without enrolment</label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="submitUploadVideo(${courseId})">Upload Video</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = new bootstrap.Modal(document.getElementById('uploadVideoModal'));
  modal.show();
}

async function submitUploadVideo(courseId) {
  const title = document.getElementById('vTitle').value;
  const fileInput = document.getElementById('vFile');
  const isPreview = document.getElementById('vPreview').checked;

  if (!fileInput.files.length) {
    showAlert('Please select a video file.', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('video', fileInput.files[0]);
  formData.append('isPreview', isPreview);

  try {
    await api(`/instructor/courses/${courseId}/lessons`, {
      method: 'POST',
      body: formData
    });
    const modalEl = document.getElementById('uploadVideoModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    modalEl.remove();
    showAlert('Video lesson uploaded successfully via Multer!', 'success');
    showInstructor();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Instructor Modals: Add Quiz
function showAddQuizModal(courseId) {
  const modalHtml = `
    <div class="modal fade" id="addQuizModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fw-bold">Create Quiz Assessment</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label small fw-semibold">Quiz Title</label>
              <input id="qTitle" class="form-control" placeholder="Quick Quiz: Node &amp; Express" required>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Question 1</label>
              <input id="q1Text" class="form-control mb-1" placeholder="What is the purpose of Buffers in Node.js?">
              <input id="q1Opt0" class="form-control form-control-sm mb-1" placeholder="Option 0: Memory storage for raw binary data">
              <input id="q1Opt1" class="form-control form-control-sm mb-1" placeholder="Option 1: CSS styling container">
              <select id="q1Ans" class="form-select form-select-sm">
                <option value="0">Correct Answer is Option 0</option>
                <option value="1">Correct Answer is Option 1</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="submitAddQuiz(${courseId})">Save Quiz</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = new bootstrap.Modal(document.getElementById('addQuizModal'));
  modal.show();
}

async function submitAddQuiz(courseId) {
  const title = document.getElementById('qTitle').value;
  const qText = document.getElementById('q1Text').value;
  const opt0 = document.getElementById('q1Opt0').value;
  const opt1 = document.getElementById('q1Opt1').value;
  const answer = document.getElementById('q1Ans').value;

  const questions = [
    {
      q: qText,
      options: [opt0, opt1],
      answer: parseInt(answer, 10)
    }
  ];

  try {
    await api(`/instructor/courses/${courseId}/quizzes`, {
      method: 'POST',
      body: JSON.stringify({ title, questions })
    });
    const modalEl = document.getElementById('addQuizModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    modalEl.remove();
    showAlert('Quiz assessment saved!', 'success');
    showInstructor();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Instructor Modals: Add Assignment
function showAddAssignmentModal(courseId) {
  const title = prompt('Enter Assignment Title:');
  if (!title) return;
  const instructions = prompt('Enter Assignment Instructions:');
  if (!instructions) return;

  api(`/instructor/courses/${courseId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ title, instructions })
  })
    .then(() => {
      showAlert('Assignment added to curriculum!', 'success');
      showInstructor();
    })
    .catch((err) => showAlert(err.message, 'danger'));
}

async function deleteLesson(lessonId) {
  if (!confirm('Are you sure you want to delete this lesson?')) return;
  try {
    await api(`/instructor/lessons/${lessonId}`, { method: 'DELETE' });
    showAlert('Lesson deleted.', 'info');
    showInstructor();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

async function gradeSubmission(submissionId, grade) {
  const feedback = prompt(`Enter optional feedback for student (${grade}):`, 'Good effort, concepts applied correctly.');
  try {
    await api(`/instructor/submissions/${submissionId}/grade`, {
      method: 'POST',
      body: JSON.stringify({ grade, feedback })
    });
    showAlert(`Submission marked as ${grade}!`, 'success');
    showInstructor('grading');
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Admin Console (Course Approvals, User Management, Revenue & Payouts)
// -------------------------------------------------------------

async function showAdmin(tab = 'overview') {
  clearAlert();
  if (!user || user.role !== 'admin') {
    return showAuth('login');
  }

  try {
    const stats = await api('/admin/stats');
    const courses = await api('/admin/courses');
    const users = await api('/admin/users');
    const rev = await api('/admin/reports/revenue');

    app.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 class="fw-bold mb-1">Admin Console</h2>
          <p class="text-muted small mb-0">Platform governance, course verification, financial reporting, and instructor payouts.</p>
        </div>
      </div>

      <!-- KPI Overview Cards -->
      <div class="row g-3 mb-4">
        <div class="col-md-3">
          <div class="card border-0 shadow-sm p-3 bg-white">
            <span class="text-muted small text-uppercase fw-bold">Total Platform Revenue</span>
            <div class="display-6 fw-bold text-success">&#8377;${stats.totalRevenue}</div>
            <small class="text-muted">Platform cut (20%): &#8377;${stats.platformRevenue}</small>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card border-0 shadow-sm p-3 bg-white">
            <span class="text-muted small text-uppercase fw-bold">Total Courses</span>
            <div class="display-6 fw-bold text-primary">${stats.totalCourses}</div>
            <small class="text-warning fw-semibold">${stats.pendingCoursesCount} pending verification</small>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card border-0 shadow-sm p-3 bg-white">
            <span class="text-muted small text-uppercase fw-bold">Registered Users</span>
            <div class="display-6 fw-bold text-dark">${stats.totalUsers}</div>
            <small class="text-muted">${stats.studentsCount} Students &bull; ${stats.instructorsCount} Instructors</small>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card border-0 shadow-sm p-3 bg-white">
            <span class="text-muted small text-uppercase fw-bold">Total Enrolments</span>
            <div class="display-6 fw-bold text-info">${stats.totalEnrollments}</div>
            <small class="text-muted">Across all published courses</small>
          </div>
        </div>
      </div>

      <!-- Admin Navigation Tabs -->
      <ul class="nav nav-pills mb-4">
        <li class="nav-item">
          <button class="nav-link ${tab === 'overview' ? 'active' : ''}" onclick="showAdmin('overview')">
            <i class="bi bi-patch-check me-1"></i> Course Approvals (${courses.filter((c) => c.status === 'pending').length} Pending)
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link ${tab === 'users' ? 'active' : ''}" onclick="showAdmin('users')">
            <i class="bi bi-people me-1"></i> User Management (${users.length})
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link ${tab === 'revenue' ? 'active' : ''}" onclick="showAdmin('revenue')">
            <i class="bi bi-cash-stack me-1"></i> Revenue &amp; Instructor Payouts
          </button>
        </li>
      </ul>

      ${
        tab === 'overview'
          ? `
        <!-- Course Approvals Table -->
        <div class="card border-0 shadow-sm p-4">
          <h5 class="fw-bold mb-3">Courses Verification Table</h5>
          <div class="table-responsive">
            <table class="table align-middle">
              <thead>
                <tr>
                  <th>Course Title</th>
                  <th>Instructor</th>
                  <th>Category / Level</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${courses
                  .map(
                    (c) => `
                  <tr>
                    <td><strong>${c.title}</strong><br><small class="text-muted">${c.lessonsCount} lessons</small></td>
                    <td>${c.instructorName}</td>
                    <td>${c.category} <span class="badge bg-light text-secondary">${c.level}</span></td>
                    <td>&#8377;${c.price}</td>
                    <td><span class="badge bg-${c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning text-dark'}">${c.status}</span></td>
                    <td>
                      ${
                        c.status !== 'approved'
                          ? `<button class="btn btn-success btn-sm me-1" onclick="setCourseStatus(${c.id}, 'approved')"><i class="bi bi-check-lg"></i> Approve</button>`
                          : ''
                      }
                      ${
                        c.status !== 'rejected'
                          ? `<button class="btn btn-outline-danger btn-sm" onclick="setCourseStatus(${c.id}, 'rejected')"><i class="bi bi-x-lg"></i> Reject</button>`
                          : ''
                      }
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
          : tab === 'users'
          ? `
        <!-- User Management Table -->
        <div class="card border-0 shadow-sm p-4">
          <h5 class="fw-bold mb-3">User Directory &amp; RBAC Control</h5>
          <div class="table-responsive">
            <table class="table align-middle">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${users
                  .map(
                    (u) => `
                  <tr>
                    <td><strong>${u.name}</strong></td>
                    <td>${u.email}</td>
                    <td><span class="badge bg-${u.role === 'admin' ? 'danger' : u.role === 'instructor' ? 'warning text-dark' : 'primary'}">${u.role}</span></td>
                    <td><span class="badge bg-${u.status === 'active' ? 'success' : 'danger'}">${u.status}</span></td>
                    <td>
                      ${
                        u.role !== 'admin'
                          ? `
                        <button class="btn btn-outline-${u.status === 'active' ? 'danger' : 'success'} btn-sm" onclick="toggleUserStatus(${u.id}, '${u.status === 'active' ? 'blocked' : 'active'}')">
                          ${u.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      `
                          : '<small class="text-muted">Protected Admin</small>'
                      }
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
          : `
        <!-- Revenue & Payouts -->
        <div class="card border-0 shadow-sm p-4 mb-4">
          <h5 class="fw-bold mb-3">Instructor Payouts Accounting</h5>
          <p class="text-muted small">Platform retains a 20% platform commission; 80% is allocated to course instructors.</p>
          <div class="table-responsive">
            <table class="table align-middle">
              <thead>
                <tr>
                  <th>Instructor</th>
                  <th>Gross Sales</th>
                  <th>Instructor Share (80%)</th>
                  <th>Already Paid</th>
                  <th>Balance Due</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${
                  Object.values(rev.instructorPayouts || {}).length
                    ? Object.values(rev.instructorPayouts)
                        .map(
                          (po) => `
                      <tr>
                        <td><strong>${po.instructorName}</strong></td>
                        <td>&#8377;${po.grossSales}</td>
                        <td class="text-success fw-bold">&#8377;${po.earnedPayout}</td>
                        <td>&#8377;${po.alreadyPaid}</td>
                        <td class="fw-bold text-danger">&#8377;${po.balanceDue}</td>
                        <td>
                          ${
                            po.balanceDue > 0
                              ? `<button class="btn btn-primary btn-sm" onclick="processPayout(${po.instructorId}, ${po.balanceDue})">Process Payout</button>`
                              : '<span class="badge bg-success-subtle text-success">Settled</span>'
                          }
                        </td>
                      </tr>
                    `
                        )
                        .join('')
                    : '<tr><td colspan="6" class="text-muted text-center py-4">No instructor earnings recorded yet.</td></tr>'
                }
              </tbody>
            </table>
          </div>
        </div>
      `
      }
    `;
  } catch (err) {
    showAlert('Error loading admin console: ' + err.message, 'danger');
  }
}

async function setCourseStatus(id, status) {
  let feedback = '';
  if (status === 'rejected') {
    feedback = prompt('Enter feedback reason for rejecting course:', 'Requires more comprehensive video demonstrations.');
    if (feedback === null) return;
  }

  try {
    await api(`/admin/courses/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, feedback })
    });
    showAlert(`Course status updated to ${status}.`, 'success');
    showAdmin();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

async function toggleUserStatus(id, status) {
  try {
    await api(`/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    showAlert(`User status set to ${status}.`, 'info');
    showAdmin('users');
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

async function processPayout(instructorId, amount) {
  const reference = prompt(`Enter payment reference / UTR for &#8377;${amount} payout:`, `UTR-${Date.now().toString().slice(-6)}`);
  if (!reference) return;

  try {
    await api('/admin/payouts', {
      method: 'POST',
      body: JSON.stringify({ instructorId, amount, reference })
    });
    showAlert(`Payout of &#8377;${amount} processed successfully!`, 'success');
    showAdmin('revenue');
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
renderNav();
showCatalogue();
