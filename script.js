/* =========================================================================
   رفقاء القرآن والنحو — script.js
   منطق الصفحات الثلاث: الرئيسية، التلميذ، الأستاذ.
   البيانات الحيّة (الأسماء/الإنجاز اليومي/السجل التاريخي) تأتي من Supabase
   (PostgreSQL عبر REST API)، بينما إدارة الواجبات/البرنامج/الحضور تُحفظ
   محليًا في هذا الإصدار (localStorage) لحين ربطها بالخادم لاحقًا.
   ========================================================================= */

/* ================== 1) الإعدادات ================== */
const CONFIG = {
  SUPABASE_URL: "https://jgjebubnrfokeszlatcb.supabase.co", // مثال: https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnamVidWJucmZva2VzemxhdGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4ODQxMzksImV4cCI6MjEwMjQ2MDEzOX0.6sujYqlPQX5o5SSrrz-Yx0TqVTdieVgButW5JCinZRY",
  TEACHER_PASSWORD_HASH: "6fba5c6e010bdde8084a8326d2151f9e8b130823316d39de651e18ae8933ebd2",
  HISTORY_DAYS: 370, // نطاق كافٍ لحساب النقاط التراكمية والأوسمة بشكل صحيح
  SYNC_RETRY_INTERVAL_MS: 20000,
};

const TASKS = [
  { key: "wird",  label: "حفظ الورد اليومي",  subject: "quran" },
  { key: "tuhfa", label: "حفظ الدرس المحدد",   subject: "tuhfa" },
  { key: "irab",  label: "إنجاز التمرين",      subject: "nahw"  },
];

const POINTS_PER_TASK = 10;

const RANKS = [
  { min: 0,   max: 49,      emoji: "🌱", name: "المبتدئ" },
  { min: 50,  max: 149,     emoji: "🌿", name: "المجتهد" },
  { min: 150, max: 299,     emoji: "⭐", name: "المتقدم" },
  { min: 300, max: 499,     emoji: "🌟", name: "المتميز" },
  { min: 500, max: 799,     emoji: "🏆", name: "بطل الإنجاز" },
  { min: 800, max: Infinity,emoji: "👑", name: "نجم رفقاء القرآن والنحو" },
];

const BADGE_DEFS = {
  streak: [
    { t: 1,   e: "🔥", n: "بداية المشوار" },
    { t: 3,   e: "🔥", n: "المثابر الصغير" },
    { t: 7,   e: "🔥", n: "أسبوع من الإنجاز" },
    { t: 14,  e: "🔥", n: "أسبوعان من المثابرة" },
    { t: 30,  e: "🔥", n: "شهر من الإنجاز" },
    { t: 60,  e: "🔥", n: "المثابر بلا توقف" },
    { t: 100, e: "👑", n: "أسطورة الاستمرارية" },
  ],
  quran: [
    { t: 1,   e: "📖", n: "رفيق القرآن" },
    { t: 5,   e: "🌱", n: "خطوة مباركة" },
    { t: 10,  e: "🌿", n: "محب القرآن" },
    { t: 25,  e: "⭐", n: "نجم القرآن" },
    { t: 50,  e: "🌟", n: "صديق القرآن" },
    { t: 100, e: "🏆", n: "بطل القرآن" },
    { t: 250, e: "👑", n: "رفيق القرآن المميز" },
  ],
  tuhfa: [
    { t: 1,  e: "📜", n: "بداية التحفة" },
    { t: 5,  e: "🌱", n: "محب التحفة" },
    { t: 10, e: "⭐", n: "رفيق التحفة" },
    { t: 25, e: "🌟", n: "نجم التحفة" },
    { t: 50, e: "🏆", n: "بطل التحفة" },
  ],
  nahw: [
    { t: 1,   e: "✏️", n: "خطوتي الأولى في النحو" },
    { t: 10,  e: "📝", n: "محب النحو" },
    { t: 25,  e: "⭐", n: "نجم النحو" },
    { t: 50,  e: "🌟", n: "بطل الإعراب" },
    { t: 100, e: "🏆", n: "خبير النحو الصغير" },
  ],
};

const GROUP_LABELS = {
  streak: "🔥 أوسمة الاستمرارية", quran: "📖 أوسمة القرآن",
  tuhfa: "📜 أوسمة تحفة الأطفال", nahw: "✍️ أوسمة النحو",
};

// أوسمة سرية (شروطها مرتبطة بالحضور — تُعرض دائمًا مقفلة إلى أن يُربط نظام
// الحضور بالخادم؛ هذا يطابق فكرة الأوسمة السرية أصلًا: لا تُكشف شروطها للطفل)
const SECRET_BADGES = [
  "🏫 رفيق الدروس", "🌟 الحاضر المميز", "🏆 وفيّ لرحلتي",
  "📖 رفيق الثلاثاء", "📚 رفيق الخميس", "💪 ما استسلمتش", "🌱 العودة القوية",
];

const MOTIVATE_LINES = [
  "🌟 استمر، أنت تقوم بعمل رائع!", "💙 كل يوم خطوة جديدة نحو النجاح!",
  "✨ رحلتك جميلة، تابعها بحماس!", "🚀 أنت أقرب لهدفك من الأمس!",
];

const TASK_MESSAGES = {
  quran: ["🌟 أحسنت! واصل بهذا الحماس!", "📖 بارك الله فيك، إنجاز رائع!", "✨ ما شاء الله، استمر هكذا!"],
  tuhfa: ["📚 رائع! أنت تتقدم كل يوم!", "📜 أحسنت! حفظ جميل!", "🌿 ممتاز، واصل التقدم!"],
  nahw:  ["✨ ممتاز! بارك الله في اجتهادك!", "✍️ رائع! إعراب صحيح ومتقن!", "⭐ أحسنت في النحو!"],
};

/* ================== 2) أدوات عامة ================== */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateStrDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
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
  // لا يظهر زر "الأستاذ" داخل صفحة التلميذ إطلاقًا
  const teacherBtn = document.getElementById("teacherBtn");
  if (teacherBtn) teacherBtn.classList.toggle("hidden", id === "screen-tasks");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function pickRandom(arr, avoid) {
  if (arr.length === 1) return arr[0];
  let choice;
  do { choice = arr[Math.floor(Math.random() * arr.length)]; } while (choice === avoid);
  return choice;
}
function rankForPoints(points) {
  return RANKS.find(r => points >= r.min && points <= r.max) || RANKS[0];
}

/* ================== 3) طبقة الاتصال بـ Supabase ==================
   نستعمل واجهة PostgREST المدمجة في Supabase مباشرة عبر fetch، دون أي
   مكتبة إضافية. القراءة (SELECT) تُستعمل للأسماء/الإنجاز اليومي/السجل
   التاريخي، بينما التأكيد يمرّ عبر دالة RPC واحدة (confirm_assignments)
   تُنفَّذ بأمان وذرّية داخل قاعدة البيانات (تمنع التأكيد المزدوج).
   ========================================================================= */

function sbHeaders(extra = {}) {
  return {
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

async function sbSelect(pathAndQuery) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: "GET",
    headers: sbHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || "network");
  return data; // مصفوفة صفوف دائمًا
}

async function sbRpc(fnName, params) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || "network");
  return data;
}

async function sbInsert(table, obj) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(obj),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || "network");
  return data;
}

async function sbUpsert(table, obj, conflictCols) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCols}`, {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(obj),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || "network");
  return data;
}

async function sbDelete(pathAndQuery) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: "DELETE",
    headers: sbHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data && data.message) || "network");
  }
}

/* ================== 4) قائمة الانتظار المحلية ================== */

const QUEUE_KEY = "rq_sync_queue_v1";
function readQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; } }
function writeQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
function enqueueUpdate(item) { const q = readQueue(); q.push(item); writeQueue(q); }

async function flushQueue() {
  if (!navigator.onLine) return;
  let q = readQueue();
  if (!q.length) return;
  const remaining = [];
  for (const item of q) {
    try {
      // كل عناصر قائمة الانتظار في هذا الإصدار هي طلبات تأكيد مؤجَّلة فقط
      await sbRpc("confirm_assignments", {
        p_student: item.studentName,
        p_date: item.date,
        p_wird: !!item.wird,
        p_tuhfa: !!item.tuhfa,
        p_irab: !!item.irab,
      });
    } catch (e) { remaining.push(item); }
  }
  writeQueue(remaining);
  if (remaining.length === 0 && q.length > 0) showToast("✅ تمت مزامنة إنجازك المحفوظ محليًا");
}
window.addEventListener("online", flushQueue);
setInterval(flushQueue, CONFIG.SYNC_RETRY_INTERVAL_MS);

/* ================== 5) الشخصية الكرتونية (Mascot) ================== */

function createMascotController(ids) {
  return {
    el: null, pupilL: null, pupilR: null, mouth: null,
    eyeLCenter: { x: 78, y: 102 }, eyeRCenter: { x: 122, y: 102 },
    maxOffset: 3.4,

    init() {
      this.el = document.getElementById(ids.svg);
      this.pupilL = document.getElementById(ids.pupilL);
      this.pupilR = document.getElementById(ids.pupilR);
      this.mouth = document.getElementById(ids.mouth);
    },
    lookAt(clientX, clientY) {
      if (!this.el) return;
      const rect = this.el.getBoundingClientRect();
      const relX = ((clientX - rect.left) / rect.width) * 200;
      const relY = ((clientY - rect.top) / rect.height) * 200;
      [["pupilL", this.eyeLCenter], ["pupilR", this.eyeRCenter]].forEach(([key, center]) => {
        const dx = relX - center.x, dy = relY - center.y;
        const dist = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(this.maxOffset, dist / 8);
        this[key].setAttribute("transform", `translate(${((dx / dist) * clamped).toFixed(2)},${((dy / dist) * clamped).toFixed(2)})`);
      });
    },
    resetLook() {
      if (!this.pupilL) return;
      this.pupilL.setAttribute("transform", "translate(0,0)");
      this.pupilR.setAttribute("transform", "translate(0,0)");
    },
    happy() {
      if (!this.mouth) return;
      this.mouth.setAttribute("d", "M86 121 Q100 140 114 121 Q100 132 86 121 Z");
      this.mouth.setAttribute("fill", "#B8654F");
      this.el.classList.remove("mascot-happy-jump");
      void this.el.offsetWidth;
      this.el.classList.add("mascot-happy-jump");
    },
    confused() {
      if (!this.mouth) return;
      this.mouth.setAttribute("d", "M92 127 Q100 122 108 127");
      this.mouth.setAttribute("fill", "none");
      this.resetLook();
    },
    neutral() {
      if (!this.mouth) return;
      this.mouth.setAttribute("d", "M90 123 Q100 129 110 123");
      this.mouth.setAttribute("fill", "none");
    },
  };
}

// شخصية شاشة الترحيب
const Mascot = createMascotController({ svg: "mascotSvg", pupilL: "pupilL", pupilR: "pupilR", mouth: "mascotMouth" });
// شخصية مصاحبة صغيرة داخل صفحة التلميذ (تتفاعل مع الإنجاز والأوسمة والترقية)
const StudentMascot = createMascotController({ svg: "mascotSvg2", pupilL: "pupilL2", pupilR: "pupilR2", mouth: "mascotMouth2" });

/* ================== 6) الكونفيتي ================== */

function fireConfetti(count = 26) {
  const layer = document.getElementById("confettiLayer");
  const colors = ["#4FB6E8", "#5FD3A3", "#FFC94A", "#FF9B6A", "#FF7A7A", "#9B8CF2"];
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

/* ================== 7) حالة التطبيق (صفحة التلميذ) ================== */

const State = {
  student: null,
  today: { wird: false, tuhfa: false, irab: false },
  history: [],
  streak: 0,
  confirmed: false,
  totalPoints: 0, totalWird: 0, totalTuhfa: 0, totalNahw: 0,
  lastMsgBySubject: {},
};

const STUDENT_KEY = "rq_selected_student_v1";

/* ================== 8) الصفحة الرئيسية (الترحيب) ================== */

async function initWelcomeScreen() {
  Mascot.init();
  const select = document.getElementById("studentSelect");
  const startBtn = document.getElementById("startBtn");
  const wrap = document.getElementById("selectWrap");
  const bubble = document.getElementById("speechBubble");

  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  if (!isTouchDevice) {
    wrap.addEventListener("mousemove", (e) => Mascot.lookAt(e.clientX, e.clientY));
    wrap.addEventListener("mouseleave", () => Mascot.resetLook());
  } else {
    wrap.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (t) Mascot.lookAt(t.clientX, t.clientY);
    }, { passive: true });
    wrap.addEventListener("touchend", () => Mascot.resetLook());
  }

  select.addEventListener("change", () => {
    if (select.value) {
      startBtn.disabled = false;
      startBtn.classList.add("active");
      Mascot.happy();
      bubble.innerHTML = `أهلاً بك يا <strong>${escapeHtml(select.value)}</strong>!<br>جاهز لإنجاز مهامك اليوم؟ اضغط ابدأ 🚀`;
      fireConfetti(16);
    } else {
      startBtn.disabled = true;
      startBtn.classList.remove("active");
      bubble.textContent = "مرحباً بك! اختر اسمك لنبدأ رحلة الإنجاز اليومية ✨";
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

  document.querySelectorAll("[data-retry]").forEach(btn => btn.addEventListener("click", loadNamesList));

  await loadNamesList();

  const savedStudent = localStorage.getItem(STUDENT_KEY);
  if (savedStudent) enterStudentFlow(savedStudent);
}

async function loadNamesList() {
  const select = document.getElementById("studentSelect");
  setScreen("screen-loading");
  try {
    if (!navigator.onLine) throw { offline: true };
    const rows = await sbSelect("students?select=name&order=name.asc");
    const names = rows.map(r => r.name);
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
    setScreen("screen-error-offline");
    Mascot.init();
    Mascot.confused && Mascot.confused();
  }
}

/* ================== 9) الصفحة الثانية: صفحة التلميذ ================== */

async function enterStudentFlow(name) {
  State.student = name;
  setScreen("screen-loading");
  document.getElementById("studentHello").textContent = `👋 أهلاً يا ${name}!`;
  document.getElementById("motivateLine").textContent = pickRandom(MOTIVATE_LINES);

  try {
    await Promise.all([loadTodayState(), loadHistoryState()]);
    finalizeStudentEntry();
  } catch (err) {
    const cached = getLocalTodayCache(name);
    if (cached) {
      const { confirmed, ...todayVals } = cached;
      State.today = todayVals;
      State.confirmed = !!confirmed;
      State.history = [];
      finalizeStudentEntry();
      showToast("⚠️ نعرض آخر بيانات محفوظة، لا يوجد اتصال حاليًا");
    } else {
      setScreen("screen-error-offline");
    }
  }
}

function finalizeStudentEntry() {
  StudentMascot.init();
  computeTotals();
  renderTasksScreen();
  setScreen("screen-tasks");
  bindTaskCards();
  flushQueue();
}

function localTodayCacheKey(name) { return `rq_today_cache_${name}_${todayStr()}`; }
function getLocalTodayCache(name) {
  try { return JSON.parse(localStorage.getItem(localTodayCacheKey(name))); } catch { return null; }
}
function setLocalTodayCache(name, todayObj, confirmed) {
  localStorage.setItem(localTodayCacheKey(name), JSON.stringify({ ...todayObj, confirmed: !!confirmed }));
}

async function loadTodayState() {
  const today = todayStr();
  const rows = await sbSelect(
    `records?student_name=eq.${encodeURIComponent(State.student)}&date=eq.${today}&select=wird,tuhfa,irab,confirmed`
  );
  const row = rows[0];
  State.today = { wird: !!(row && row.wird), tuhfa: !!(row && row.tuhfa), irab: !!(row && row.irab) };
  State.confirmed = !!(row && row.confirmed);
  setLocalTodayCache(State.student, State.today, State.confirmed);
}
async function loadHistoryState() {
  const cutoff = dateStrDaysAgo(CONFIG.HISTORY_DAYS - 1);
  const rows = await sbSelect(
    `records?student_name=eq.${encodeURIComponent(State.student)}&date=gte.${cutoff}&select=date,wird,tuhfa,irab&order=date.asc`
  );
  State.history = rows.map(r => ({ date: r.date, wird: !!r.wird, tuhfa: !!r.tuhfa, irab: !!r.irab }));
  computeStreak();
}

// الـ Streak: يكفي إنجاز مهمة واحدة على الأقل في اليوم لاعتباره يوم إنجاز
function computeStreak() {
  const map = {};
  State.history.forEach(h => { map[h.date] = h; });
  const todayDone = State.today.wird || State.today.tuhfa || State.today.irab;
  let streak = (State.confirmed && todayDone) ? 1 : 0;
  let cursor = 1;
  while (true) {
    const ds = dateStrDaysAgo(cursor);
    const rec = map[ds];
    if (rec && (rec.wird || rec.tuhfa || rec.irab)) { streak++; cursor++; } else break;
  }
  State.streak = streak;
}

// النقاط التراكمية: نجمعها من كل السجل التاريخي + اليوم إن كان مؤكَّدًا
function computeTotals() {
  const map = {};
  State.history.forEach(h => { map[h.date] = h; });
  if (State.confirmed) map[todayStr()] = { date: todayStr(), ...State.today };
  let points = 0, w = 0, t = 0, n = 0;
  Object.values(map).forEach(e => {
    if (e.wird)  { w++; points += POINTS_PER_TASK; }
    if (e.tuhfa) { t++; points += POINTS_PER_TASK; }
    if (e.irab)  { n++; points += POINTS_PER_TASK; }
  });
  State.totalPoints = points; State.totalWird = w; State.totalTuhfa = t; State.totalNahw = n;
}

/* ---- الأوسمة: منطق عام قابل لإعادة الاستخدام في صفحة الأستاذ أيضًا ---- */
function badgeGroupsForStats(totalWird, totalTuhfa, totalNahw, streak) {
  const build = (defs, value) => defs.map(d => ({ id: `${d.n}`, emoji: d.e, name: d.n, earned: value >= d.t, threshold: d.t }));
  return {
    streak: build(BADGE_DEFS.streak, streak),
    quran: build(BADGE_DEFS.quran, totalWird),
    tuhfa: build(BADGE_DEFS.tuhfa, totalTuhfa),
    nahw: build(BADGE_DEFS.nahw, totalNahw),
  };
}

function earnedBadgesKey(name) { return `rq_badges_${name}`; }
function getEarnedBadgesLocal(name) {
  try { return JSON.parse(localStorage.getItem(earnedBadgesKey(name))) || []; } catch { return []; }
}
function setEarnedBadgesLocal(name, ids) { localStorage.setItem(earnedBadgesKey(name), JSON.stringify(ids)); }

function renderBadgesAndJourney() {
  const groups = badgeGroupsForStats(State.totalWird, State.totalTuhfa, State.totalNahw, State.streak);
  const wrap = document.getElementById("badgesWrap");
  let html = "";
  Object.entries(groups).forEach(([key, items]) => {
    html += `<div class="badges-group"><div class="badges-group-title">${GROUP_LABELS[key]}</div><div class="badges-grid">`;
    items.forEach(b => {
      html += `<div class="badge-item ${b.earned ? "" : "locked"}"><div class="b-emoji">${b.emoji}</div><div class="b-name">${escapeHtml(b.name)}</div></div>`;
    });
    html += `</div></div>`;
  });
  html += `<div class="badges-group"><div class="badges-group-title">🔒 أوسمة سرية</div><div class="badges-grid">`;
  SECRET_BADGES.forEach(() => {
    html += `<div class="badge-item secret locked"><div class="b-emoji">🔒</div><div class="b-name">وسام سري</div></div>`;
  });
  html += `</div></div>`;
  wrap.innerHTML = html;

  // نتحقق من أوسمة جديدة تم كسر حاجزها منذ آخر مرة (باستثناء الأوسمة السرية)
  const allEarnedIds = [];
  Object.values(groups).forEach(items => items.forEach(b => { if (b.earned) allEarnedIds.push(b.id); }));
  const prevIds = getEarnedBadgesLocal(State.student);
  const newlyEarned = allEarnedIds.filter(id => !prevIds.includes(id));
  setEarnedBadgesLocal(State.student, allEarnedIds);

  const rank = rankForPoints(State.totalPoints);
  const rankIdx = RANKS.indexOf(rank);

  const journeySteps = [
    { label: "🌱 البداية", done: true },
    { label: "⭐ 50 نقطة", done: State.totalPoints >= 50 },
    { label: "🏅 أول وسام", done: allEarnedIds.length >= 1 },
    { label: "🔥 7 أيام متتالية", done: State.streak >= 7 },
    { label: "💎 250 نقطة", done: State.totalPoints >= 250 },
    { label: "📖 إنجازات القرآن", done: State.totalWird >= 1 },
    { label: "📜 تحفة الأطفال", done: State.totalTuhfa >= 1 },
    { label: "✍️ النحو", done: State.totalNahw >= 1 },
    { label: "🏆 مراحل متقدمة", done: rankIdx >= 4 },
    { label: "👑 نجم رفقاء القرآن والنحو", done: rankIdx >= 5 },
  ];
  document.getElementById("journeyList").innerHTML = journeySteps.map(s => `
    <li class="journey-item ${s.done ? "done" : ""}">
      <div class="journey-dot">${s.done ? "✓" : "•"}</div>
      <div class="journey-text">${s.label}</div>
    </li>`).join("");

  return newlyEarned.map(id => {
    for (const items of Object.values(groups)) {
      const found = items.find(b => b.id === id);
      if (found) return found;
    }
    return null;
  }).filter(Boolean);
}

function showBadgeUnlock(newBadges) {
  if (!newBadges.length) return;
  document.getElementById("badgeUnlockEmoji").textContent = newBadges[0].emoji;
  document.getElementById("badgeUnlockName").textContent = newBadges.map(b => b.name).join("، ");
  document.getElementById("badgeUnlockOverlay").classList.remove("hidden");
  StudentMascot.happy();
  fireConfetti(40);
}

function renderRankCard() {
  const rank = rankForPoints(State.totalPoints);
  const idx = RANKS.indexOf(rank);
  document.getElementById("rankEmoji").textContent = rank.emoji;
  document.getElementById("rankName").textContent = rank.name;
  document.getElementById("rankEmojiSmall").textContent = rank.emoji;
  document.getElementById("rankNameSmall").textContent = rank.name;
  document.getElementById("pointsValue").textContent = State.totalPoints;

  const next = RANKS[idx + 1];
  const bar = document.getElementById("rankBarFill");
  const nextEl = document.getElementById("rankNext");
  if (next) {
    const span = next.min - rank.min;
    const progressed = State.totalPoints - rank.min;
    bar.style.width = Math.min(100, Math.max(4, (progressed / span) * 100)) + "%";
    nextEl.textContent = `${next.min - State.totalPoints} نقطة للوصول إلى مرتبة ${next.name} ${next.emoji}`;
  } else {
    bar.style.width = "100%";
    nextEl.textContent = "وصلت لأعلى مرتبة! 👑";
  }
}

function renderTasksScreen() {
  document.getElementById("streakCount").textContent = State.streak;

  TASKS.forEach(t => {
    const card = document.querySelector(`.task-card[data-task="${t.key}"]`);
    const check = card.querySelector("[data-check]");
    const done = !!State.today[t.key];
    card.classList.toggle("done", done);
    card.classList.toggle("locked", State.confirmed);
    if (State.confirmed) {
      // بعد التأكيد: ✅ للمنجز، ➖ لغير المنجز، بدون إمكانية تعديل
      check.classList.remove("checked");
      check.textContent = done ? "✅" : "➖";
      check.style.background = "transparent";
      check.style.border = "none";
      check.style.fontSize = "1.3rem";
    } else {
      check.style.background = ""; check.style.border = ""; check.style.fontSize = "";
      check.classList.toggle("checked", done);
      check.textContent = done ? "✓" : "";
    }
  });

  const doneCount = TASKS.filter(t => State.today[t.key]).length;
  document.querySelectorAll(".progress-dot").forEach((dot, i) => dot.classList.toggle("done", i < doneCount));

  const confirmBtn = document.getElementById("confirmBtn");
  const lockedNotice = document.getElementById("lockedNotice");
  const hintMsg = document.getElementById("celebrateAllMsg");

  if (State.confirmed) {
    confirmBtn.classList.add("hidden");
    lockedNotice.classList.remove("hidden");
    hintMsg.classList.add("hidden");
  } else {
    confirmBtn.classList.remove("hidden");
    lockedNotice.classList.add("hidden");
    hintMsg.classList.toggle("hidden", doneCount < 3);
  }

  renderRankCard();
  renderStarCalendar();
  renderBadgesAndJourney();
}

function renderStarCalendar() {
  const wrap = document.getElementById("starCalendar");
  wrap.innerHTML = "";
  const map = {};
  State.history.forEach(h => { map[h.date] = h; });
  const days = [];
  for (let i = CONFIG.HISTORY_DAYS - 1; i >= 0; i--) days.push(dateStrDaysAgo(i));
  // نعرض فقط آخر 14 يومًا في الشريط (لتفادي شريط طويل جدًا) رغم أن الحساب يغطي فترة أوسع
  const visibleDays = days.slice(-14);
  const weekdayFmt = new Intl.DateTimeFormat("ar", { weekday: "short" });

  visibleDays.forEach(ds => {
    const isToday = ds === todayStr();
    const rec = isToday ? (State.confirmed ? State.today : null) : map[ds];
    let cls = "none";
    if (rec) {
      const doneCount = [rec.wird, rec.tuhfa, rec.irab].filter(Boolean).length;
      cls = doneCount === 3 ? "three" : doneCount === 2 ? "two" : doneCount === 1 ? "one" : "zero";
    }
    const dayCol = document.createElement("div");
    dayCol.className = "cal-day";
    dayCol.innerHTML = `<div class="cal-dot ${cls}" title="${ds}"></div><div class="cal-label">${weekdayFmt.format(new Date(ds))}</div>`;
    wrap.appendChild(dayCol);
  });
}

function bindTaskCards() {
  document.querySelectorAll(".task-card").forEach(card => {
    const key = card.dataset.task;
    const subject = card.dataset.subject;
    const check = card.querySelector("[data-check]");
    const newCheck = check.cloneNode(true);
    check.replaceWith(newCheck);
    newCheck.addEventListener("click", () => onToggleTask(key, subject));
  });
  const confirmBtn = document.getElementById("confirmBtn");
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirmBtn);
  newConfirmBtn.addEventListener("click", onConfirmAssignments);
}

function onToggleTask(key, subject) {
  if (State.confirmed) return;
  const newValue = !State.today[key];
  State.today[key] = newValue;
  setLocalTodayCache(State.student, State.today, State.confirmed);
  renderTasksScreen();

  const msgBox = document.getElementById("taskMsgBox");
  if (newValue) {
    const msg = pickRandom(TASK_MESSAGES[subject], State.lastMsgBySubject[subject]);
    State.lastMsgBySubject[subject] = msg;
    msgBox.textContent = msg;
    msgBox.classList.remove("hidden");
    StudentMascot.happy();
  } else {
    msgBox.classList.add("hidden");
    StudentMascot.neutral();
  }
}

/* ================== 9ب) تأكيد الواجبات (لا يمكن التراجع بعده) ================== */

async function onConfirmAssignments() {
  if (State.confirmed) return;
  const confirmBtn = document.getElementById("confirmBtn");
  confirmBtn.disabled = true;
  const originalLabel = confirmBtn.textContent;
  confirmBtn.textContent = "جارٍ الحفظ…";

  const payload = {
    studentName: State.student, wird: State.today.wird, tuhfa: State.today.tuhfa,
    irab: State.today.irab, date: todayStr(),
  };

  try {
    if (!navigator.onLine) throw new Error("offline");
    const res = await sbRpc("confirm_assignments", {
      p_student: payload.studentName, p_date: payload.date,
      p_wird: payload.wird, p_tuhfa: payload.tuhfa, p_irab: payload.irab,
    });
    if (res && res.alreadyConfirmed) {
      State.confirmed = true;
      setLocalTodayCache(State.student, State.today, true);
      computeTotals();
      renderTasksScreen();
      showToast("لقد قمت بتسجيل واجباتك مسبقًا اليوم ✅");
    } else if (res && res.success === false) {
      showToast("⚠️ تعذّر الحفظ: " + (res.message || "خطأ غير معروف"));
    } else {
      handleConfirmSuccess(false);
    }
  } catch (e) {
    enqueueUpdate(payload);
    handleConfirmSuccess(true);
    showToast("💾 لا يوجد اتصال، سيتم إرسال تأكيدك تلقائيًا عند عودة الاتصال");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = originalLabel;
  }
}

function handleConfirmSuccess(offline) {
  State.confirmed = true;
  setLocalTodayCache(State.student, State.today, true);

  const idx = State.history.findIndex(h => h.date === todayStr());
  const todayRecord = { date: todayStr(), ...State.today };
  if (idx >= 0) State.history[idx] = todayRecord; else State.history.push(todayRecord);

  const prevRankIdx = RANKS.indexOf(rankForPoints(State.totalPoints));

  computeStreak();
  computeTotals();
  renderTasksScreen();

  const doneCount = TASKS.filter(t => State.today[t.key]).length;
  StudentMascot.happy();
  if (!offline) fireConfetti(doneCount === 3 ? 70 : 40);
  showCelebration();

  const newBadges = renderBadgesAndJourney();
  if (newBadges.length) setTimeout(() => showBadgeUnlock(newBadges), 900);

  // 👑 هل ارتقى التلميذ إلى رتبة جديدة؟
  const newRankIdx = RANKS.indexOf(rankForPoints(State.totalPoints));
  if (newRankIdx > prevRankIdx) {
    const rank = RANKS[newRankIdx];
    setTimeout(() => {
      StudentMascot.happy();
      fireConfetti(50);
      showToast(`👑 لقد ارتقيت إلى مرتبة ${rank.name} ${rank.emoji}`, 3200);
    }, newBadges.length ? 1900 : 900);
  }
}

function showCelebration() {
  const doneCount = TASKS.filter(t => State.today[t.key]).length;
  const stars = "⭐".repeat(doneCount) + "☆".repeat(3 - doneCount);
  document.getElementById("celebrationStars").textContent = stars;
  const emoji = document.getElementById("celebrationEmoji");
  const title = document.getElementById("celebrationTitle");
  const text = document.getElementById("celebrationText");

  if (doneCount === 0) {
    emoji.textContent = "💙";
    title.textContent = "لا بأس يا بطل!";
    text.textContent = "اليوم لم تنجز أي مهمة، لكن غداً فرصة جديدة لتبدأ من جديد! 🌱";
  } else if (doneCount === 1) {
    emoji.textContent = "🌟";
    title.textContent = "بداية جميلة!";
    text.textContent = "أنجزت مهمة واحدة اليوم، واصل المحاولة لتحقق المزيد غداً! 💪";
  } else if (doneCount === 2) {
    emoji.textContent = "⭐";
    title.textContent = "رائع جداً!";
    text.textContent = "أنجزت مهمتين اليوم، بقيت خطوة واحدة فقط نحو الإنجاز الكامل! 🚀";
  } else {
    emoji.textContent = "🎉";
    title.textContent = "يا لها من نتيجة رائعة!";
    text.textContent = "أنجزت جميع مهامك اليوم! أنت بطل الإنجاز! 🏆✨";
  }
  document.getElementById("celebrationOverlay").classList.remove("hidden");
}

/* ================== 10) صفحة الأستاذ ================== */

const Teacher = {
  loggedIn: false, records: [], students: [], period: "today", activeTab: "overview", selectedStudent: null,
};

/* ---- تخزين محلي لإدارة الواجبات/البرنامج/الحضور (لحين ربطها بالخادم) ---- */
function initTeacherUI() {
  document.getElementById("teacherBtn").addEventListener("click", openTeacherLogin);
  document.getElementById("teacherCancelBtn").addEventListener("click", closeTeacherLogin);
  document.getElementById("teacherConfirmBtn").addEventListener("click", attemptTeacherLogin);
  document.getElementById("teacherPassInput").addEventListener("keydown", (e) => { if (e.key === "Enter") attemptTeacherLogin(); });
  document.getElementById("closeDashBtn").addEventListener("click", () => document.getElementById("teacherDashboard").classList.add("hidden"));
  document.getElementById("dashLogoutBtn").addEventListener("click", () => { Teacher.loggedIn = false; document.getElementById("teacherDashboard").classList.add("hidden"); });

  document.getElementById("dashHamburger").addEventListener("click", () => document.getElementById("dashSidebar").classList.toggle("open"));

  document.querySelectorAll("#dashNav button").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("dashSearch").addEventListener("input", renderLeaderboard);
  document.getElementById("studentsSearch").addEventListener("input", renderStudentsTable);
  document.querySelectorAll("#periodSeg .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#periodSeg .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      Teacher.period = btn.dataset.period;
      renderLeaderboard(); renderAnalytics();
    });
  });
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("exportPdfBtn").addEventListener("click", exportPdf);
  document.getElementById("profileCloseBtn").addEventListener("click", () => document.getElementById("profileDrawerBackdrop").classList.add("hidden"));

  // إدارة الواجبات
  document.getElementById("asgAddBtn").addEventListener("click", addAssignment);
  // البرنامج الأسبوعي
  document.getElementById("schAddBtn").addEventListener("click", addScheduleItem);
  // الحضور
  const attDate = document.getElementById("attDate");
  attDate.value = todayStr();
  attDate.addEventListener("change", renderAttendance);

  document.getElementById("badgeUnlockCloseBtn").addEventListener("click", () => document.getElementById("badgeUnlockOverlay").classList.add("hidden"));
}

function switchTab(tab) {
  Teacher.activeTab = tab;
  document.querySelectorAll("#dashNav button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".dash-tab").forEach(t => t.classList.add("hidden"));
  document.getElementById(`tab-${tab}`).classList.remove("hidden");
  document.getElementById("dashSidebar").classList.remove("open");

  const titles = {
    overview: "📊 لوحة التحكم", students: "👥 التلاميذ", assignments: "📚 الواجبات",
    schedule: "🗓️ البرنامج الأسبوعي", attendance: "🏫 الحضور والغياب", leaderboard: "🏆 لوحة الصدارة",
    analytics: "📈 الإحصائيات", badges: "🏅 الأوسمة", settings: "⚙️ الإعدادات",
  };
  document.getElementById("dashPageTitle").textContent = titles[tab] || "";

  if (tab === "overview") renderOverview();
  else if (tab === "students") renderStudentsTable();
  else if (tab === "assignments") renderAssignmentsList();
  else if (tab === "schedule") renderScheduleList();
  else if (tab === "attendance") renderAttendance();
  else if (tab === "leaderboard") renderLeaderboard();
  else if (tab === "analytics") renderAnalytics();
  else if (tab === "badges") renderAllBadgesTab();
}

function openTeacherLogin() {
  document.getElementById("teacherLoginModal").classList.remove("hidden");
  document.getElementById("teacherPassInput").value = "";
  document.getElementById("teacherLoginError").textContent = "";
  document.getElementById("teacherPassInput").focus();
}
function closeTeacherLogin() { document.getElementById("teacherLoginModal").classList.add("hidden"); }

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
  document.getElementById("dashDate").textContent = new Intl.DateTimeFormat("ar-MA", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  try {
    const [studentRows, recordRows] = await Promise.all([
      sbSelect("students?select=name&order=name.asc"),
      sbSelect("records?select=student_name,date,wird,tuhfa,irab&order=date.asc"),
    ]);
    Teacher.students = studentRows.map(r => r.name);
    Teacher.records = recordRows.map(r => ({ studentName: r.student_name, date: r.date, wird: !!r.wird, tuhfa: !!r.tuhfa, irab: !!r.irab }));
    switchTab("overview");
  } catch (e) {
    document.getElementById("overviewCards").innerHTML = `<div class="empty-note">تعذّر جلب البيانات، تحقق من الاتصال</div>`;
  }
}

function filteredRecordsForPeriod() {
  const today = todayStr(), weekAgo = dateStrDaysAgo(6);
  return Teacher.records.filter(r => {
    if (Teacher.period === "today") return r.date === today;
    if (Teacher.period === "week") return r.date >= weekAgo && r.date <= today;
    return true;
  });
}

function studentStatsFromRecords(name) {
  const recs = Teacher.records.filter(r => r.studentName === name).sort((a, b) => a.date.localeCompare(b.date));
  let points = 0, w = 0, t = 0, n = 0;
  recs.forEach(r => { if (r.wird) { w++; points += 10; } if (r.tuhfa) { t++; points += 10; } if (r.irab) { n++; points += 10; } });

  // streak: من اليوم إلى الوراء عبر السجلات المتوفرة
  const map = {}; recs.forEach(r => { map[r.date] = r; });
  let streak = 0, cursor = 0;
  while (true) {
    const ds = dateStrDaysAgo(cursor);
    const rec = map[ds];
    if (rec && (rec.wird || rec.tuhfa || rec.irab)) { streak++; cursor++; } else break;
  }
  const lastActive = recs.length ? recs[recs.length - 1].date : null;
  const daysSince = lastActive ? Math.round((new Date(todayStr()) - new Date(lastActive)) / 86400000) : 999;
  const totalTasks = recs.length * 3;
  const doneTasks = w + t + n;
  const completion = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return { name, points, wird: w, tuhfa: t, irab: n, streak, daysSince, completion, records: recs };
}

/* ---- تبويب: لوحة التحكم (Overview) ---- */
async function renderOverview() {
  const today = todayStr();
  const total = Teacher.students.length;
  const completedToday = Teacher.students.filter(s => Teacher.records.some(r => r.studentName === s && r.date === today && (r.wird || r.tuhfa || r.irab))).length;
  const streakHolders = Teacher.students.filter(s => studentStatsFromRecords(s).streak >= 1).length;
  const needAttention = Teacher.students.filter(s => studentStatsFromRecords(s).daysSince >= 3);

  let attToday = null, presentCount = null;
  try {
    const rows = await sbSelect(`attendance?date=eq.${today}&select=student_name,status`);
    if (rows.length) {
      attToday = {};
      rows.forEach(r => { attToday[r.student_name] = r.status; });
      presentCount = rows.filter(r => r.status === "present").length;
    }
  } catch (e) { /* نتجاهل الخطأ هنا فقط، البطاقة تظهر "لم يُسجَّل بعد" */ }

  const cards = [
    { emoji: "👥", value: total, label: "التلاميذ" },
    { emoji: "✅", value: `${completedToday}/${total}`, label: "أنجزوا اليوم" },
    { emoji: "🔥", value: streakHolders, label: "لديهم Streak" },
    { emoji: "🏫", value: attToday ? `${presentCount}/${total}` : "لم يُسجَّل بعد", label: "الحاضرون" },
    { emoji: "⚠️", value: needAttention.length, label: "يحتاجون للمتابعة", alert: needAttention.length > 0 },
  ];
  document.getElementById("overviewCards").innerHTML = cards.map(c => `
    <div class="dcard ${c.alert ? "alert" : ""}">
      <div class="dc-emoji">${c.emoji}</div>
      <div class="dc-value">${c.value}</div>
      <div class="dc-label">${c.label}</div>
    </div>`).join("");

  const attnWrap = document.getElementById("attentionList");
  if (!needAttention.length) {
    attnWrap.innerHTML = `<div class="empty-note">لا يوجد تلاميذ بحاجة للمتابعة 🎉</div>`;
  } else {
    attnWrap.innerHTML = needAttention.map(name => {
      const st = studentStatsFromRecords(name);
      return `<div class="attn-item">
        <span class="attn-name">🔴 ${escapeHtml(name)}</span>
        <span class="attn-days">لم يسجل أي إنجاز منذ ${st.daysSince >= 999 ? "فترة طويلة" : st.daysSince + " أيام"}</span>
        <button class="icon-btn" data-open-profile="${escapeHtml(name)}">👤</button>
      </div>`;
    }).join("");
    attnWrap.querySelectorAll("[data-open-profile]").forEach(btn => btn.addEventListener("click", () => openStudentProfile(btn.dataset.openProfile)));
  }
}

/* ---- تبويب: التلاميذ ---- */
function renderStudentsTable() {
  const search = (document.getElementById("studentsSearch").value || "").trim();
  const names = Teacher.students.filter(n => !search || n.includes(search));
  const wrap = document.getElementById("studentsTableWrap");
  if (!names.length) { wrap.innerHTML = `<div class="empty-note">لا توجد نتائج</div>`; return; }

  let html = `<table class="students-table"><thead><tr>
    <th>التلميذ</th><th>إنجاز اليوم</th><th>Streak</th><th>النقاط</th><th>الرتبة</th><th>الحالة</th>
  </tr></thead><tbody>`;
  const today = todayStr();
  names.forEach(name => {
    const st = studentStatsFromRecords(name);
    const rank = rankForPoints(st.points);
    const todayRec = Teacher.records.find(r => r.studentName === name && r.date === today);
    const todayCount = todayRec ? [todayRec.wird, todayRec.tuhfa, todayRec.irab].filter(Boolean).length : 0;
    const warn = st.daysSince >= 3;
    html += `<tr data-name="${escapeHtml(name)}">
      <td class="name-tag">${escapeHtml(name)}</td>
      <td>${todayCount}/3</td>
      <td>🔥 ${st.streak}</td>
      <td>💎 ${st.points}</td>
      <td>${rank.emoji} ${rank.name}</td>
      <td><span class="status-pill ${warn ? "warn" : "ok"}">${warn ? "⚠️ متابعة" : "✅ جيد"}</span></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
  wrap.querySelectorAll("tr[data-name]").forEach(row => row.addEventListener("click", () => openStudentProfile(row.dataset.name)));
}

/* ---- ملف التلميذ (Drawer) ---- */
function openStudentProfile(name) {
  Teacher.selectedStudent = name;
  const st = studentStatsFromRecords(name);
  const rank = rankForPoints(st.points);
  document.getElementById("profileName").textContent = `👤 ${name}`;
  document.getElementById("profilePoints").textContent = st.points;
  document.getElementById("profileStreak").textContent = st.streak;
  document.getElementById("profileRankEmoji").textContent = rank.emoji;
  document.getElementById("profileRankName").textContent = rank.name;
  document.getElementById("profileCompletion").textContent = st.completion + "%";

  const last14 = st.records.slice(-14);
  document.getElementById("profileLineChart").innerHTML = sparklineSvg(last14.map(r => [r.wird, r.tuhfa, r.irab].filter(Boolean).length / 3 * 100));

  const groups = badgeGroupsForStats(st.wird, st.tuhfa, st.irab, st.streak);
  let bhtml = "";
  Object.entries(groups).forEach(([key, items]) => {
    const earned = items.filter(b => b.earned);
    if (!earned.length) return;
    bhtml += `<div class="badges-group"><div class="badges-group-title">${GROUP_LABELS[key]}</div><div class="badges-grid">`;
    earned.forEach(b => { bhtml += `<div class="badge-item"><div class="b-emoji">${b.emoji}</div><div class="b-name">${escapeHtml(b.name)}</div></div>`; });
    bhtml += `</div></div>`;
  });
  document.getElementById("profileBadges").innerHTML = bhtml || `<div class="empty-note">لا توجد أوسمة بعد</div>`;

  document.getElementById("profileDrawerBackdrop").classList.remove("hidden");
}

/* ---- تبويب: لوحة الصدارة ---- */
function buildLeaderboardRows() {
  const recs = filteredRecordsForPeriod();
  const byStudent = {};
  Teacher.students.forEach(name => { byStudent[name] = { name, wird: 0, tuhfa: 0, irab: 0 }; });
  recs.forEach(r => {
    if (!byStudent[r.studentName]) byStudent[r.studentName] = { name: r.studentName, wird: 0, tuhfa: 0, irab: 0 };
    const row = byStudent[r.studentName];
    if (r.wird) row.wird++; if (r.tuhfa) row.tuhfa++; if (r.irab) row.irab++;
  });
  const rows = Object.values(byStudent).map(row => {
    row.score = row.wird + row.tuhfa + row.irab;
    row.inactive = studentStatsFromRecords(row.name).daysSince >= 3;
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
  if (!rows.length) { wrap.innerHTML = `<div class="empty-note">لا توجد بيانات لعرضها</div>`; return; }
  let html = `<table class="leaderboard"><thead><tr><th>#</th><th>الاسم</th><th>📖</th><th>📜</th><th>✍️</th><th>المجموع</th></tr></thead><tbody>`;
  rows.forEach((r, i) => {
    html += `<tr class="${r.inactive ? "alert" : ""}">
      <td><span class="rank-badge">${i + 1}</span></td>
      <td><span class="name-tag">${escapeHtml(r.name)}</span>${r.inactive ? `<div class="alert-flag">⚠️ لم يُنجز منذ 3 أيام+</div>` : ""}</td>
      <td>${r.wird}</td><td>${r.tuhfa}</td><td>${r.irab}</td><td><strong>${r.score}</strong></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function exportCsv() {
  const rows = buildLeaderboardRows();
  const header = ["الاسم", "الورد", "تحفة الأطفال", "الإعراب", "المجموع"];
  const lines = [header.join(",")];
  rows.forEach(r => lines.push([r.name, r.wird, r.tuhfa, r.irab, r.score].join(",")));
  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `تقرير_${Teacher.period}_${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function exportPdf() {
  const rows = buildLeaderboardRows();
  const win = window.open("", "_blank");
  if (!win) { showToast("⚠️ يرجى السماح بالنوافذ المنبثقة لتصدير PDF"); return; }
  const periodLabel = { today: "اليوم", week: "الأسبوع", all: "كل الفترة" }[Teacher.period];
  win.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>لوحة الصدارة</title>
    <style>
      body{font-family:sans-serif;padding:24px;}
      h1{font-size:1.2rem;} table{width:100%;border-collapse:collapse;margin-top:14px;}
      th,td{border:1px solid #ccc;padding:8px;text-align:right;font-size:.9rem;}
      th{background:#f0f0f0;}
    </style></head><body>
    <h1>🏆 لوحة الصدارة — ${periodLabel} (${todayStr()})</h1>
    <table><thead><tr><th>#</th><th>الاسم</th><th>القرآن</th><th>تحفة الأطفال</th><th>النحو</th><th>المجموع</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${r.wird}</td><td>${r.tuhfa}</td><td>${r.irab}</td><td>${r.score}</td></tr>`).join("")}
    </tbody></table></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

/* ---- تبويب: الإحصائيات ---- */
function renderAnalytics() {
  const recs = filteredRecordsForPeriod();
  const total = recs.length || 1;
  const stats = TASKS.map(t => ({ label: t.label, pct: Math.round((recs.filter(r => r[t.key]).length / total) * 100) }));
  document.getElementById("chartBars").innerHTML = stats.map(s => `
    <div class="chart-col"><div class="chart-pct">${s.pct}%</div><div class="chart-bar" style="height:${Math.max(6, s.pct)}%"></div><div class="chart-label">${s.label}</div></div>
  `).join("");

  // توزيع إنجاز اليوم (Pie)
  const today = todayStr();
  const buckets = { 3: 0, 2: 0, 1: 0, 0: 0 };
  Teacher.students.forEach(name => {
    const rec = Teacher.records.find(r => r.studentName === name && r.date === today);
    const c = rec ? [rec.wird, rec.tuhfa, rec.irab].filter(Boolean).length : 0;
    buckets[c]++;
  });
  document.getElementById("pieChart").innerHTML = pieChartHtml([
    { label: "3/3", value: buckets[3], color: "var(--green)" },
    { label: "2/3", value: buckets[2], color: "var(--purple)" },
    { label: "1/3", value: buckets[1], color: "var(--orange)" },
    { label: "0/3", value: buckets[0], color: "var(--coral)" },
  ]);

  // تطور الإنجاز عبر آخر 10 أيام
  const days = []; for (let i = 9; i >= 0; i--) days.push(dateStrDaysAgo(i));
  const totalStudents = Teacher.students.length || 1;
  const trend = days.map(d => {
    const dayRecs = Teacher.records.filter(r => r.date === d);
    const done = dayRecs.reduce((sum, r) => sum + [r.wird, r.tuhfa, r.irab].filter(Boolean).length, 0);
    return Math.round((done / (totalStudents * 3)) * 100);
  });
  document.getElementById("lineChart").innerHTML = sparklineSvg(trend, days);

  // نسبة الإنجاز حسب التلميذ
  const hbarHtml = Teacher.students.map(name => {
    const st = studentStatsFromRecords(name);
    return `<div class="hbar-row"><div class="hbar-name">${escapeHtml(name)}</div><div class="hbar-track"><div class="hbar-fill" style="width:${st.completion}%"></div></div><div class="hbar-pct">${st.completion}%</div></div>`;
  }).join("");
  document.getElementById("hbarChart").innerHTML = hbarHtml || `<div class="empty-note">لا توجد بيانات</div>`;
}

function pieChartHtml(segments) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const r = 45, circ = 2 * Math.PI * r;
  const circles = segments.map(seg => {
    const frac = seg.value / total;
    const dash = frac * circ;
    const circle = `<circle r="${r}" cx="60" cy="60" fill="transparent" stroke="${seg.color}" stroke-width="20" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}"></circle>`;
    offset += dash;
    return circle;
  }).join("");
  const legend = segments.map(seg => `<span><i style="background:${seg.color}"></i>${seg.label}: ${seg.value}</span>`).join("");
  return `<div class="pie-wrap"><svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">${circles}</svg><div class="pie-legend">${legend}</div></div>`;
}

function sparklineSvg(values, labels) {
  if (!values.length) return `<div class="empty-note">لا توجد بيانات كافية</div>`;
  const w = 300, h = 120, pad = 10;
  const max = Math.max(100, ...values), min = 0;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const dots = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return `<circle cx="${x}" cy="${y}" r="3" fill="#2C86B8"></circle>`;
  }).join("");
  return `<svg class="line-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="#4FB6E8" stroke-width="2.5"></polyline>${dots}
  </svg>`;
}

/* ---- تبويب: الأوسمة (عرض شامل) ---- */
function renderAllBadgesTab() {
  let html = "";
  Object.entries(BADGE_DEFS).forEach(([key, defs]) => {
    html += `<div class="badges-group"><div class="badges-group-title">${GROUP_LABELS[key]}</div><div class="badges-grid">`;
    defs.forEach(d => { html += `<div class="badge-item"><div class="b-emoji">${d.e}</div><div class="b-name">${escapeHtml(d.n)} (${d.t})</div></div>`; });
    html += `</div></div>`;
  });
  html += `<div class="badges-group"><div class="badges-group-title">🔒 أوسمة سرية (شروطها غير معروضة للطفل)</div><div class="badges-grid">`;
  SECRET_BADGES.forEach(n => { html += `<div class="badge-item secret"><div class="b-emoji">🔒</div><div class="b-name">${escapeHtml(n)}</div></div>`; });
  html += `</div></div>`;
  document.getElementById("allBadgesList").innerHTML = html;
}

/* ---- تبويب: إدارة الواجبات (Supabase) ---- */
async function addAssignment() {
  const title = document.getElementById("asgTitle").value.trim();
  const subject = document.getElementById("asgSubject").value;
  const desc = document.getElementById("asgDesc").value.trim();
  const date = document.getElementById("asgDate").value || todayStr();
  if (!title) { showToast("⚠️ أدخل عنوان الواجب"); return; }
  try {
    await sbInsert("assignments", { title, subject, description: desc || null, date });
    document.getElementById("asgTitle").value = "";
    document.getElementById("asgDesc").value = "";
    showToast("✅ تمت إضافة الواجب");
    renderAssignmentsList();
  } catch (e) {
    showToast("⚠️ تعذّرت الإضافة، تحقق من الاتصال");
  }
}
async function deleteAssignment(id) {
  try {
    await sbDelete(`assignments?id=eq.${id}`);
    renderAssignmentsList();
  } catch (e) {
    showToast("⚠️ تعذّر الحذف");
  }
}
async function renderAssignmentsList() {
  const wrap = document.getElementById("assignmentsList");
  const subjectLabel = { quran: "📖 القرآن الكريم", tuhfa: "📜 تحفة الأطفال", nahw: "✍️ النحو" };
  try {
    const list = await sbSelect("assignments?select=*&order=date.desc");
    if (!list.length) { wrap.innerHTML = `<div class="empty-note">لا توجد واجبات مسجّلة بعد</div>`; return; }
    wrap.innerHTML = list.map(a => `
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-title">${escapeHtml(a.title)}</div>
          <div class="list-item-sub">${subjectLabel[a.subject] || ""} · ${a.date}${a.description ? " · " + escapeHtml(a.description) : ""}</div>
        </div>
        <button class="icon-btn danger" data-del="${a.id}">🗑️</button>
      </div>`).join("");
    wrap.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => deleteAssignment(Number(btn.dataset.del))));
  } catch (e) {
    wrap.innerHTML = `<div class="empty-note">تعذّر جلب الواجبات، تحقق من الاتصال</div>`;
  }
}

/* ---- تبويب: البرنامج الأسبوعي (Supabase) ---- */
async function addScheduleItem() {
  const day = document.getElementById("schDay").value;
  const lesson = document.getElementById("schLesson").value.trim();
  const time = document.getElementById("schTime").value;
  if (!lesson) { showToast("⚠️ أدخل الدرس"); return; }
  try {
    await sbInsert("schedule_items", { day, lesson, start_time: time || null });
    document.getElementById("schLesson").value = "";
    showToast("✅ تمت الإضافة إلى البرنامج");
    renderScheduleList();
  } catch (e) {
    showToast("⚠️ تعذّرت الإضافة، تحقق من الاتصال");
  }
}
async function deleteScheduleItem(id) {
  try {
    await sbDelete(`schedule_items?id=eq.${id}`);
    renderScheduleList();
  } catch (e) {
    showToast("⚠️ تعذّر الحذف");
  }
}
async function renderScheduleList() {
  const wrap = document.getElementById("scheduleList");
  try {
    const list = await sbSelect("schedule_items?select=*&order=id.asc");
    if (!list.length) { wrap.innerHTML = `<div class="empty-note">لا يوجد برنامج مسجّل بعد</div>`; return; }
    wrap.innerHTML = list.map(s => `
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-title">${escapeHtml(s.day)} — ${escapeHtml(s.lesson)}</div>
          <div class="list-item-sub">${s.start_time ? "⏰ " + escapeHtml(s.start_time) : ""}</div>
        </div>
        <button class="icon-btn danger" data-del="${s.id}">🗑️</button>
      </div>`).join("");
    wrap.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => deleteScheduleItem(Number(btn.dataset.del))));
  } catch (e) {
    wrap.innerHTML = `<div class="empty-note">تعذّر جلب البرنامج، تحقق من الاتصال</div>`;
  }
}

/* ---- تبويب: الحضور والغياب (Supabase) ---- */
async function setAttendance(date, name, status) {
  try {
    await sbUpsert("attendance", { date, student_name: name, status, updated_at: new Date().toISOString() }, "date,student_name");
    renderAttendance();
  } catch (e) {
    showToast("⚠️ تعذّر حفظ الحضور، تحقق من الاتصال");
  }
}
async function renderAttendance() {
  const date = document.getElementById("attDate").value || todayStr();
  const wrap = document.getElementById("attendanceList");
  if (!Teacher.students.length) { wrap.innerHTML = `<div class="empty-note">لا توجد بيانات تلاميذ بعد</div>`; return; }
  let dayData = {};
  try {
    const rows = await sbSelect(`attendance?date=eq.${date}&select=student_name,status`);
    rows.forEach(r => { dayData[r.student_name] = r.status; });
  } catch (e) {
    wrap.innerHTML = `<div class="empty-note">تعذّر جلب الحضور، تحقق من الاتصال</div>`;
    return;
  }
  wrap.innerHTML = Teacher.students.map(name => {
    const st = dayData[name] || "";
    return `<div class="att-row">
      <span class="att-name">${escapeHtml(name)}</span>
      <div class="att-opts">
        <button class="att-opt ${st === "present" ? "sel-present" : ""}" data-name="${escapeHtml(name)}" data-status="present">🟢 حاضر</button>
        <button class="att-opt ${st === "absent" ? "sel-absent" : ""}" data-name="${escapeHtml(name)}" data-status="absent">🔴 غائب</button>
        <button class="att-opt ${st === "late" ? "sel-late" : ""}" data-name="${escapeHtml(name)}" data-status="late">🟡 متأخر</button>
      </div>
    </div>`;
  }).join("");
  wrap.querySelectorAll(".att-opt").forEach(btn => btn.addEventListener("click", () => setAttendance(date, btn.dataset.name, btn.dataset.status)));
}

/* ================== 11) بدء التشغيل ================== */

document.addEventListener("DOMContentLoaded", () => {
  initWelcomeScreen();
  initTeacherUI();
  document.getElementById("celebrationCloseBtn").addEventListener("click", () => document.getElementById("celebrationOverlay").classList.add("hidden"));
  flushQueue();
});
