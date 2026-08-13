/* =========================================================================
   رفقاء القرآن والنحو — script.js
   كل منطق الموقع: الاتصال بالشيت، التخزين الاحتياطي، الشخصية الكرتونية،
   الكونفيتي، الرسم البياني، وتصدير CSV.
   ========================================================================= */

/* ================== 1) الإعدادات (يجب تعديلها من طرفك) ================== */
const CONFIG = {
  // رابط تطبيق الويب (Web App) الذي ستحصل عليه بعد نشر Code.gs
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycby0oMaYQi6Hy_LvD-fZcY9fxUEEgloCrsv8CX4svRfhlvQCU2Q6IL3kGWswNrGhohJyNQ/exec",

  // "رمز الصف" - تخفيف بسيط جدًا وليس حماية حقيقية.
  // سيكون ظاهرًا لأي شخص يفتح كود الموقع على GitHub.
  CLASS_CODE: "student95",

  // تجزئة (SHA-256) لكلمة مرور الأستاذ - وليست كلمة المرور نفسها.
  // هذه أيضًا حماية شكلية فقط (client-side) وليست حماية حقيقية،
  // لأن أي شخص يمكنه قراءة كود JS ومحاولة كسر التجزئة نظريًا.
  // لتوليد تجزئة كلمة مرورك: افتح Console بالمتصفح ونفّذ:
  //   await sha256Hex("كلمة_المرور_التي_تريدها")
  // (الدالة sha256Hex معرّفة أسفل هذا الملف)
  TEACHER_PASSWORD_HASH: "6fba5c6e010bdde8084a8326d2151f9e8b130823316d39de651e18ae8933ebd2",

  HISTORY_DAYS: 14,          // عدد أيام تقويم النجوم
  SYNC_RETRY_INTERVAL_MS: 20000, // محاولة مزامنة قائمة الانتظار كل 20 ثانية
};

const TASKS = [
  { key: "wird",  label: "حفظ الورد اليومي" },
  { key: "tuhfa", label: "حفظ تحفة الأطفال" },
  { key: "irab",  label: "إعراب الجملة" },
];

/* ================== 2) أدوات عامة ================== */

function todayStr() {
  // نستخدم صيغة yyyy-MM-dd محليًا (بدون اعتماد على منطقة زمنية للسيرفر)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateStrDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
// نعرّضها على window لتسهيل توليد التجزئة من الـ Console عند الإعداد
window.sha256Hex = sha256Hex;

function showToast(msg, ms = 2400) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), ms);
}

function setScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  const target = document.getElementById(id);
  if (target) target.classList.remove("hidden");
}

/* ================== 3) طبقة الاتصال بالشيت (GET/POST) ================== */

async function apiGet(action, params = {}) {
  const url = new URL(CONFIG.WEB_APP_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error("network");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(payload) {
  // نستخدم text/plain لتفادي CORS Preflight مع Google Apps Script
  const res = await fetch(CONFIG.WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("network");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* ================== 4) قائمة الانتظار المحلية (Sync Queue) ================== */

const QUEUE_KEY = "rq_sync_queue_v1";

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }
  catch { return []; }
}
function writeQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
function enqueueUpdate(item) {
  const q = readQueue();
  q.push(item);
  writeQueue(q);
}

async function flushQueue() {
  if (!navigator.onLine) return;
  let q = readQueue();
  if (!q.length) return;
  const remaining = [];
  for (const item of q) {
    try {
      await apiPost({ action: "updateTask", classCode: CONFIG.CLASS_CODE, ...item });
    } catch (e) {
      remaining.push(item); // نبقيها لمحاولة لاحقة
    }
  }
  writeQueue(remaining);
  if (remaining.length === 0 && q.length > 0) {
    showToast("✅ تمت مزامنة إنجازك المحفوظ محليًا");
  }
}

window.addEventListener("online", flushQueue);
setInterval(flushQueue, CONFIG.SYNC_RETRY_INTERVAL_MS);

/* ================== 5) الشخصية الكرتونية (Mascot) ================== */

const Mascot = {
  el: null, pupilL: null, pupilR: null, mouth: null,
  eyeLCenter: { x: 78, y: 90 }, eyeRCenter: { x: 122, y: 90 },
  maxOffset: 4.2,

  init() {
    this.el = document.getElementById("mascotSvg");
    this.pupilL = document.getElementById("pupilL");
    this.pupilR = document.getElementById("pupilR");
    this.mouth = document.getElementById("mascotMouth");
  },

  // يحرك بؤبؤ العين نحو نقطة (clientX/clientY) بشكل ديناميكي محسوب
  lookAt(clientX, clientY) {
    if (!this.el) return;
    const rect = this.el.getBoundingClientRect();
    // موقع المؤشر نسبيًا داخل الـ SVG (بمقياس viewBox 200x200)
    const relX = ((clientX - rect.left) / rect.width) * 200;
    const relY = ((clientY - rect.top) / rect.height) * 200;

    [ ["pupilL", this.eyeLCenter], ["pupilR", this.eyeRCenter] ].forEach(([key, center]) => {
      const dx = relX - center.x;
      const dy = relY - center.y;
      const dist = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(this.maxOffset, dist / 8);
      const ox = (dx / dist) * clamped;
      const oy = (dy / dist) * clamped;
      this[key].setAttribute("transform", `translate(${ox.toFixed(2)},${oy.toFixed(2)})`);
    });
  },

  resetLook() {
    this.pupilL.setAttribute("transform", "translate(0,0)");
    this.pupilR.setAttribute("transform", "translate(0,0)");
  },

  happy() {
    this.mouth.setAttribute("d", "M82 110 Q100 128 118 110 Q100 120 82 110 Z");
    this.mouth.setAttribute("fill", "#1F3B4D");
    this.el.classList.remove("mascot-happy-jump");
    void this.el.offsetWidth; // إعادة تشغيل الأنيميشن
    this.el.classList.add("mascot-happy-jump");
  },

  confused() {
    this.mouth.setAttribute("d", "M88 116 Q100 110 112 116");
    this.mouth.setAttribute("fill", "none");
    this.resetLook();
  },

  neutral() {
    this.mouth.setAttribute("d", "M85 112 Q100 122 115 112");
    this.mouth.setAttribute("fill", "none");
  },
};

/* ================== 6) الكونفيتي ================== */

function fireConfetti(count = 26) {
  const layer = document.getElementById("confettiLayer");
  const colors = ["#4FB6E8", "#5FD3A3", "#FFC94A", "#FF9B6A", "#FF7A7A"];
  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    c.className = "confetto";
    const size = 6 + Math.random() * 6;
    c.style.width = size + "px";
    c.style.height = size * 0.6 + "px";
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(c);
    setTimeout(() => c.remove(), 3200);
  }
}

/* ================== 7) حالة التطبيق ================== */

const State = {
  student: null,
  today: { wird: false, tuhfa: false, irab: false },
  history: [], // [{date, wird, tuhfa, irab}]
  streak: 0,
};

const STUDENT_KEY = "rq_selected_student_v1";

/* ================== 8) تهيئة شاشة الترحيب ================== */

async function initWelcomeScreen() {
  Mascot.init();

  const select = document.getElementById("studentSelect");
  const startBtn = document.getElementById("startBtn");
  const wrap = document.getElementById("selectWrap");

  // تتبع بؤبؤ العين عند مرور المؤشر/اللمس فوق القائمة
  wrap.addEventListener("mousemove", (e) => Mascot.lookAt(e.clientX, e.clientY));
  wrap.addEventListener("mouseleave", () => Mascot.resetLook());
  wrap.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    if (t) Mascot.lookAt(t.clientX, t.clientY);
  }, { passive: true });

  select.addEventListener("change", () => {
    if (select.value) {
      startBtn.disabled = false;
      startBtn.classList.add("active");
      Mascot.happy();
    } else {
      startBtn.disabled = true;
      startBtn.classList.remove("active");
    }
  });

  startBtn.addEventListener("click", () => {
    const name = select.value;
    if (!name) return;
    localStorage.setItem(STUDENT_KEY, name);
    enterStudentFlow(name);
  });

  document.getElementById("changeStudentBtn")?.addEventListener("click", () => {
    localStorage.removeItem(STUDENT_KEY);
    State.student = null;
    setScreen("screen-welcome");
  });

  document.querySelectorAll("[data-retry]").forEach(btn => {
    btn.addEventListener("click", loadNamesList);
  });

  await loadNamesList();

  // إن كان هناك تلميذ محفوظ مسبقًا في هذا الجهاز، ندخل مباشرة لصفحة مهامه
  const savedStudent = localStorage.getItem(STUDENT_KEY);
  if (savedStudent) {
    enterStudentFlow(savedStudent);
  }
}

async function loadNamesList() {
  const select = document.getElementById("studentSelect");
  setScreen("screen-loading");
  try {
    if (!navigator.onLine) throw { offline: true };
    const data = await apiGet("getNames");
    const names = data.names || [];
    if (!names.length) {
      setScreen("screen-error-empty");
      Mascot.confused();
      return;
    }
    select.innerHTML = `<option value="">-- اختر اسمك --</option>` +
      names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    select.disabled = false;
    setScreen("screen-welcome");
  } catch (err) {
    if (!navigator.onLine || (err && err.offline)) {
      setScreen("screen-error-offline");
    } else {
      setScreen("screen-error-offline"); // فشل الاتصال بالشيت نعامله كخطأ اتصال أيضًا
    }
    Mascot.init();
    Mascot.confused && Mascot.confused();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

/* ================== 9) شاشة المهام اليومية ================== */

async function enterStudentFlow(name) {
  State.student = name;
  setScreen("screen-loading");
  document.getElementById("studentHello").textContent = `أهلاً يا ${name} 🌟`;

  try {
    await Promise.all([loadTodayState(), loadHistoryState()]);
    renderTasksScreen();
    setScreen("screen-tasks");
    bindTaskCards();
    await flushQueue();
  } catch (err) {
    // في حال تعذّر الجلب، نحاول الاعتماد على أي نسخة محلية محفوظة كحد أدنى
    const cachedToday = getLocalTodayCache(name);
    if (cachedToday) {
      State.today = cachedToday;
      State.history = [];
      renderTasksScreen();
      setScreen("screen-tasks");
      bindTaskCards();
      showToast("⚠️ نعرض آخر بيانات محفوظة، لا يوجد اتصال حاليًا");
    } else {
      setScreen("screen-error-offline");
    }
  }
}

function localTodayCacheKey(name) { return `rq_today_cache_${name}_${todayStr()}`; }
function getLocalTodayCache(name) {
  try { return JSON.parse(localStorage.getItem(localTodayCacheKey(name))); }
  catch { return null; }
}
function setLocalTodayCache(name, obj) {
  localStorage.setItem(localTodayCacheKey(name), JSON.stringify(obj));
}

async function loadTodayState() {
  const data = await apiGet("getToday", { student: State.student });
  State.today = {
    wird: !!data.wird,
    tuhfa: !!data.tuhfa,
    irab: !!data.irab,
  };
  setLocalTodayCache(State.student, State.today);
}

async function loadHistoryState() {
  const data = await apiGet("getHistory", { student: State.student, days: CONFIG.HISTORY_DAYS });
  State.history = data.history || [];
  computeStreak();
}

function computeStreak() {
  // نحسب أيام متتالية (بما فيها اليوم) أُنجزت فيها كل المهام الثلاث
  const map = {};
  State.history.forEach(h => { map[h.date] = h; });
  const todayAll = State.today.wird && State.today.tuhfa && State.today.irab;
  let streak = todayAll ? 1 : 0;
  let cursor = 1;
  while (true) {
    const ds = dateStrDaysAgo(cursor);
    const rec = map[ds];
    if (rec && rec.wird && rec.tuhfa && rec.irab) {
      streak++;
      cursor++;
    } else break;
  }
  State.streak = streak;
}

function renderTasksScreen() {
  document.getElementById("streakCount").textContent = State.streak;

  TASKS.forEach(t => {
    const card = document.querySelector(`.task-card[data-task="${t.key}"]`);
    const check = card.querySelector("[data-check]");
    const done = !!State.today[t.key];
    card.classList.toggle("done", done);
    check.classList.toggle("checked", done);
    check.textContent = done ? "✓" : "";
  });

  const doneCount = TASKS.filter(t => State.today[t.key]).length;
  document.querySelectorAll(".progress-dot").forEach((dot, i) => {
    dot.classList.toggle("done", i < doneCount);
  });

  document.getElementById("celebrateAllMsg").classList.toggle("hidden", doneCount < 3);

  renderStarCalendar();
}

function renderStarCalendar() {
  const wrap = document.getElementById("starCalendar");
  wrap.innerHTML = "";
  const map = {};
  State.history.forEach(h => { map[h.date] = h; });

  const days = [];
  for (let i = CONFIG.HISTORY_DAYS - 1; i >= 0; i--) days.push(dateStrDaysAgo(i));

  const weekdayFmt = new Intl.DateTimeFormat("ar", { weekday: "short" });

  days.forEach(ds => {
    const isToday = ds === todayStr();
    const rec = isToday ? State.today : map[ds];
    let cls = "empty";
    if (rec) {
      const doneCount = [rec.wird, rec.tuhfa, rec.irab].filter(Boolean).length;
      if (doneCount === 3) cls = "full";
      else if (doneCount > 0) cls = "partial";
    }
    const dayCol = document.createElement("div");
    dayCol.className = "cal-day";
    const label = weekdayFmt.format(new Date(ds));
    dayCol.innerHTML = `<div class="cal-dot ${cls}" title="${ds}"></div><div class="cal-label">${label}</div>`;
    wrap.appendChild(dayCol);
  });
}

function bindTaskCards() {
  document.querySelectorAll(".task-card").forEach(card => {
    const key = card.dataset.task;
    const check = card.querySelector("[data-check]");
    // نزيل أي مستمعين سابقين عبر استنساخ العنصر (لتفادي تكرار الربط عند إعادة الدخول)
    const newCheck = check.cloneNode(true);
    check.replaceWith(newCheck);
    newCheck.addEventListener("click", () => onToggleTask(key, card, newCheck));
  });
}

async function onToggleTask(key, card, checkEl) {
  const newValue = !State.today[key];
  State.today[key] = newValue;
  setLocalTodayCache(State.student, State.today);
  computeStreak();
  renderTasksScreen();

  if (newValue) {
    fireConfetti(TASKS.every(t => State.today[t.key]) ? 60 : 24);
    if (TASKS.every(t => State.today[t.key])) {
      showToast("🎉 ما شاء الله! أنجزت كل مهامك اليوم");
    } else {
      showToast("✅ أحسنت! تم تسجيل الإنجاز");
    }
  } else {
    showToast("تم إلغاء التحديد");
  }

  card.classList.add("saving");
  const payload = {
    studentName: State.student,
    task: key,
    completed: newValue,
    clientTimestamp: new Date().toISOString(),
  };

  try {
    if (!navigator.onLine) throw new Error("offline");
    await apiPost({ action: "updateTask", classCode: CONFIG.CLASS_CODE, ...payload });
  } catch (e) {
    // فشل الإرسال: نحفظ في قائمة الانتظار المحلية ونحاول لاحقًا
    enqueueUpdate(payload);
    showToast("💾 لا يوجد اتصال، تم الحفظ محليًا وسيتم إرساله تلقائيًا");
  } finally {
    card.classList.remove("saving");
  }
}

/* ================== 10) واجهة الأستاذ ================== */

const Teacher = {
  loggedIn: false,
  records: [],   // كل السجلات من getRecords
  students: [],  // كل الأسماء
  period: "today",
  sortKey: "name",
  sortDir: "asc",
};

function initTeacherUI() {
  document.getElementById("teacherBtn").addEventListener("click", openTeacherLogin);
  document.getElementById("teacherCancelBtn").addEventListener("click", closeTeacherLogin);
  document.getElementById("teacherConfirmBtn").addEventListener("click", attemptTeacherLogin);
  document.getElementById("teacherPassInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptTeacherLogin();
  });
  document.getElementById("closeDashBtn").addEventListener("click", () => {
    document.getElementById("teacherDashboard").classList.add("hidden");
  });
  document.getElementById("dashSearch").addEventListener("input", renderLeaderboard);
  document.querySelectorAll("#periodSeg .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#periodSeg .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      Teacher.period = btn.dataset.period;
      renderLeaderboard();
      renderChart();
    });
  });
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
}

function openTeacherLogin() {
  document.getElementById("teacherLoginModal").classList.remove("hidden");
  document.getElementById("teacherPassInput").value = "";
  document.getElementById("teacherLoginError").textContent = "";
  document.getElementById("teacherPassInput").focus();
}
function closeTeacherLogin() {
  document.getElementById("teacherLoginModal").classList.add("hidden");
}

async function attemptTeacherLogin() {
  const val = document.getElementById("teacherPassInput").value;
  const hash = await sha256Hex(val);
  if (hash === CONFIG.TEACHER_PASSWORD_HASH) {
    closeTeacherLogin();
    Teacher.loggedIn = true;
    await openTeacherDashboard();
  } else {
    document.getElementById("teacherLoginError").textContent = "كلمة المرور غير صحيحة";
  }
}

async function openTeacherDashboard() {
  document.getElementById("teacherDashboard").classList.remove("hidden");
  document.getElementById("leaderboardWrap").innerHTML = `<div class="empty-note">جارٍ التحميل…</div>`;
  try {
    const data = await apiGet("getRecords", { classCode: CONFIG.CLASS_CODE });
    Teacher.records = data.records || [];
    Teacher.students = data.students || [];
    renderLeaderboard();
    renderChart();
  } catch (e) {
    document.getElementById("leaderboardWrap").innerHTML = `<div class="empty-note">تعذّر جلب البيانات، تحقق من الاتصال</div>`;
  }
}

function filteredRecordsForPeriod() {
  const today = todayStr();
  const weekAgo = dateStrDaysAgo(6);
  return Teacher.records.filter(r => {
    if (Teacher.period === "today") return r.date === today;
    if (Teacher.period === "week") return r.date >= weekAgo && r.date <= today;
    return true; // all
  });
}

function buildLeaderboardRows() {
  const recs = filteredRecordsForPeriod();
  const byStudent = {};
  Teacher.students.forEach(name => {
    byStudent[name] = { name, wird: 0, tuhfa: 0, irab: 0, lastDate: null };
  });
  recs.forEach(r => {
    if (!byStudent[r.studentName]) byStudent[r.studentName] = { name: r.studentName, wird: 0, tuhfa: 0, irab: 0, lastDate: null };
    const row = byStudent[r.studentName];
    if (r.wird) row.wird++;
    if (r.tuhfa) row.tuhfa++;
    if (r.irab) row.irab++;
    if (!row.lastDate || r.date > row.lastDate) row.lastDate = r.date;
  });

  // آخر يوم أُنجزت فيه أي مهمة (من كل السجلات وليس فقط الفترة) لتحديد "لم ينجز منذ 3 أيام"
  const lastActiveAll = {};
  Teacher.records.forEach(r => {
    if (r.wird || r.tuhfa || r.irab) {
      if (!lastActiveAll[r.studentName] || r.date > lastActiveAll[r.studentName]) {
        lastActiveAll[r.studentName] = r.date;
      }
    }
  });

  const today = todayStr();
  const rows = Object.values(byStudent).map(row => {
    row.score = row.wird + row.tuhfa + row.irab;
    const lastActive = lastActiveAll[row.name];
    let daysSince = null;
    if (lastActive) {
      daysSince = Math.round((new Date(today) - new Date(lastActive)) / 86400000);
    } else {
      daysSince = 999;
    }
    row.inactive = daysSince >= 3;
    return row;
  });

  const search = (document.getElementById("dashSearch").value || "").trim();
  const filtered = search ? rows.filter(r => r.name.includes(search)) : rows;

  filtered.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ar"));
  return filtered;
}

function renderLeaderboard() {
  const wrap = document.getElementById("leaderboardWrap");
  const rows = buildLeaderboardRows();
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty-note">لا توجد بيانات لعرضها</div>`;
    return;
  }
  let html = `<table class="leaderboard"><thead><tr>
    <th>#</th><th>الاسم</th><th>📖</th><th>📜</th><th>✍️</th><th>المجموع</th>
  </tr></thead><tbody>`;
  rows.forEach((r, i) => {
    html += `<tr class="${r.inactive ? "alert" : ""}">
      <td><span class="rank-badge">${i + 1}</span></td>
      <td><span class="name-tag">${escapeHtml(r.name)}</span>${r.inactive ? `<div class="alert-flag">⚠️ لم يُنجز منذ 3 أيام+</div>` : ""}</td>
      <td>${r.wird}</td><td>${r.tuhfa}</td><td>${r.irab}</td>
      <td><strong>${r.score}</strong></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function renderChart() {
  const recs = filteredRecordsForPeriod();
  const total = recs.length || 1;
  const stats = TASKS.map(t => {
    const count = recs.filter(r => r[t.key]).length;
    return { label: t.label, pct: Math.round((count / total) * 100) };
  });
  const holder = document.getElementById("chartBars");
  holder.innerHTML = stats.map(s => `
    <div class="chart-col">
      <div class="chart-pct">${s.pct}%</div>
      <div class="chart-bar" style="height:${Math.max(6, s.pct)}%"></div>
      <div class="chart-label">${s.label}</div>
    </div>
  `).join("");
}

function exportCsv() {
  const rows = buildLeaderboardRows();
  const header = ["الاسم", "الورد", "تحفة الأطفال", "الإعراب", "المجموع"];
  const lines = [header.join(",")];
  rows.forEach(r => {
    lines.push([r.name, r.wird, r.tuhfa, r.irab, r.score].join(","));
  });
  const csv = "\uFEFF" + lines.join("\n"); // BOM لدعم العربية في Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `تقرير_${Teacher.period}_${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ================== 11) بدء التشغيل ================== */

document.addEventListener("DOMContentLoaded", () => {
  initWelcomeScreen();
  initTeacherUI();
  flushQueue();
});
