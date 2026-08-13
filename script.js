/* =========================================================================
   رفقاء القرآن والنحو — script.js
   كل منطق الموقع: الاتصال بالشيت، التخزين الاحتياطي، الشخصية الكرتونية الإنمي،
   تأكيد المهام وقفل التكرار اليومي، لوحة تحكم المعلم وتصدير CSV.
   ========================================================================= */

/* ================== 1) الإعدادات ================== */
const CONFIG = {
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbysU1eTb3pL-Pg3tY8oIl5udm8hYTIwjbCSM29GHLjaZHCG_5lMmUNbUH8iM42kKpoU/exec",
  CLASS_CODE: "student95",
  TEACHER_PASSWORD_HASH: "6fba5c6e010bdde8084a8326d2151f9e8b130823316d39de651e18ae8933ebd2",
  HISTORY_DAYS: 14,
  SYNC_RETRY_INTERVAL_MS: 20000,
};

const TASKS = [
  { key: "wird",  label: "حفظ الورد اليومي" },
  { key: "tuhfa", label: "حفظ تحفة الأطفال" },
  { key: "irab",  label: "إعراب الجملة" },
];

/* ================== 2) أدوات عامة ================== */
function todayStr() {
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

// توحيد أي صيغة تاريخ قادمة من الخادم (قد تحتوي وقتًا/منطقة زمنية) إلى YYYY-MM-DD
// فقط، حتى تنجح المقارنات النصية بين التواريخ دائمًا.
function normalizeDateStr(d) {
  if (!d) return "";
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
window.sha256Hex = sha256Hex;

function showToast(msg, ms = 2400) {
  const t = document.getElementById("toast");
  if (!t) return;
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
function writeQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
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
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  if (remaining.length === 0 && q.length > 0) {
    showToast("✅ تمت مزامنة إنجازك المحفوظ محليًا");
  }
}
window.addEventListener("online", flushQueue);
setInterval(flushQueue, CONFIG.SYNC_RETRY_INTERVAL_MS);

/* ================== 5) الشخصية الكرتونية الإنمي (Mascot) ================== */
const Mascot = {
  el: null, pupilL: null, pupilR: null,
  eyesNeutral: null, eyesHappy: null,
  mouthNeutral: null, mouthHappy: null,
  speechBubble: null,
  eyeLCenter: { x: 77, y: 92 }, eyeRCenter: { x: 127, y: 92 },
  maxOffset: 4,
  
  init() {
    this.el = document.getElementById("mascotSvg");
    this.pupilL = document.getElementById("pupilL");
    this.pupilR = document.getElementById("pupilR");
    this.eyesNeutral = document.getElementById("eyesNeutral");
    this.eyesHappy = document.getElementById("eyesHappy");
    this.mouthNeutral = document.getElementById("mouthNeutral");
    this.mouthHappy = document.getElementById("mouthHappy");
    this.speechBubble = document.getElementById("speechBubble");
  },

  lookAt(clientX, clientY) {
    if (!this.el || !this.pupilL || !this.pupilR) return;
    const rect = this.el.getBoundingClientRect();
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
    if (this.pupilL) this.pupilL.setAttribute("transform", "translate(0,0)");
    if (this.pupilR) this.pupilR.setAttribute("transform", "translate(0,0)");
  },

  happy(studentName) {
    if (this.eyesNeutral) this.eyesNeutral.classList.add("hidden-feature");
    if (this.eyesHappy) this.eyesHappy.classList.remove("hidden-feature");
    if (this.mouthNeutral) this.mouthNeutral.classList.add("hidden-feature");
    if (this.mouthHappy) this.mouthHappy.classList.remove("hidden-feature");
    if (this.speechBubble && studentName) {
      this.speechBubble.textContent = `أهلاً بك يا ${studentName}! جاهز لإنجاز مهامك اليوم؟ اضغط ابدأ 🚀`;
    }
  },

  confused() {
    this.neutral();
    if (this.speechBubble) this.speechBubble.textContent = "عذراً، حدث خطأ ما! تحقق من الاتصال بالحاسوب/الهاتف.";
  },

  neutral() {
    if (this.eyesNeutral) this.eyesNeutral.classList.remove("hidden-feature");
    if (this.eyesHappy) this.eyesHappy.classList.add("hidden-feature");
    if (this.mouthNeutral) this.mouthNeutral.classList.remove("hidden-feature");
    if (this.mouthHappy) this.mouthHappy.classList.add("hidden-feature");
    if (this.speechBubble) this.speechBubble.textContent = "مرحباً بك! اختر اسمك لنبدأ رحلة الإنجاز اليومية ✨";
  }
};

/* ================== 6) الكونفيتي ================== */
function fireConfetti(count = 26) {
  const layer = document.getElementById("confettiLayer");
  if (!layer) return;
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
  today: { wird: false, tuhfa: false, irab: false, submitted: false },
  history: [],
  streak: 0,
  isSubmittedToday: false, // للتحقق من قفل اليوم
  justSubmitted: false     // true فقط خلال نفس الجلسة التي تم فيها التأكيد للتو
};
const STUDENT_KEY = "rq_selected_student_v1";

function getLockStorageKey(name) {
  return `rq_lock_${name}_${todayStr()}`;
}

/* ================== 8) تهيئة شاشة الترحيب وتوجيهات الجهاز ================== */
async function initWelcomeScreen() {
  Mascot.init();
  initDeviceInstructions();
  
  const select = document.getElementById("studentSelect");
  const startBtn = document.getElementById("startBtn");
  const wrap = document.getElementById("selectWrap");

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
      Mascot.happy(select.value);
      fireConfetti(18); // زينة احتفال خفيفة عند اختيار الاسم
    } else {
      startBtn.disabled = true;
      startBtn.classList.remove("active");
      Mascot.neutral();
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
    Mascot.neutral();
    setScreen("screen-welcome");
  });

  document.querySelectorAll("[data-retry]").forEach(btn => {
    btn.addEventListener("click", loadNamesList);
  });

  document.getElementById("closeSuccessModalBtn")?.addEventListener("click", () => {
    document.getElementById("successModal").classList.add("hidden");
    // بعد إغلاق رسالة التهنئة، نعود مباشرة إلى الصفحة الرئيسية
    Mascot.neutral();
    setScreen("screen-welcome");
  });

  await loadNamesList();

  const savedStudent = localStorage.getItem(STUDENT_KEY);
  if (savedStudent) {
    enterStudentFlow(savedStudent);
  }
}

function initDeviceInstructions() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                || window.innerWidth <= 768;
  const desk = document.getElementById("instructionsDesktop");
  const mob = document.getElementById("instructionsMobile");
  if (isMobile) {
    if (desk) desk.classList.add("hidden-feature");
    if (mob) mob.classList.remove("hidden-feature");
  } else {
    if (desk) desk.classList.remove("hidden-feature");
    if (mob) mob.classList.add("hidden-feature");
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
    setScreen("screen-error-offline");
    Mascot.confused();
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
  State.justSubmitted = false; // كل دخول جديد للحساب يُعتبر "زيارة" وليس "تأكيدًا للتو"
  setScreen("screen-loading");
  document.getElementById("studentHello").textContent = `أهلاً يا ${name} 🌟`;

  // التحقق مما إذا كان الطالب قد أرسل مهامه سابقاً اليوم (كخط دفاع احتياطي محلي)
  const isLockedLocally = localStorage.getItem(getLockStorageKey(name)) === "true";

  try {
    // مهم: يجب تحميل حالة اليوم أولاً قبل حساب السلسلة المتتالية، حتى لا يتم
    // حسابها ببيانات فارغة (سبب ظهور "0 يوم متتالي" خطأً عند الدخول من جديد).
    await loadTodayState();
    await loadHistoryState();

    // القفل الحقيقي يعتمد على بيانات الخادم (وليس فقط على الجهاز الحالي)،
    // بذلك يُمنع التسجيل مرتين سواء من الحاسوب أو من الهاتف.
    const hasAnyDone = State.today.wird || State.today.tuhfa || State.today.irab;
    const hasSubmittedFlag = State.today.submitted === true;
    State.isSubmittedToday = hasSubmittedFlag || hasAnyDone || isLockedLocally;

    renderTasksScreen();
    setScreen("screen-tasks");
    bindTaskCards();
    await flushQueue();
  } catch (err) {
    const cachedToday = getLocalTodayCache(name);
    if (cachedToday) {
      State.today = cachedToday;
      State.history = [];
      State.isSubmittedToday = isLockedLocally || cachedToday.submitted === true ||
        cachedToday.wird || cachedToday.tuhfa || cachedToday.irab;
      computeStreak(); // كانت مفقودة هنا، فتبقى السلسلة المتتالية 0 دائماً في وضع عدم الاتصال
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
    submitted: !!data.submitted,
  };
  setLocalTodayCache(State.student, State.today);
}

async function loadHistoryState() {
  const data = await apiGet("getHistory", { student: State.student, days: CONFIG.HISTORY_DAYS });
  State.history = (data.history || []).map(h => ({ ...h, date: normalizeDateStr(h.date) }));
  computeStreak();
}

function computeStreak() {
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
  
  const confirmBtn = document.getElementById("confirmTasksBtn");
  const alreadyBanner = document.getElementById("alreadySubmittedBanner");

  // شريط "لقد قمت بالتأكيد مسبقاً" يظهر فقط عند العودة لاحقاً إلى الحساب،
  // وليس مباشرة بعد الضغط على زر التأكيد في نفس الجلسة.
  const showAlreadyBanner = State.isSubmittedToday && !State.justSubmitted;

  if (showAlreadyBanner) {
    if (alreadyBanner) alreadyBanner.classList.remove("hidden");
  } else {
    if (alreadyBanner) alreadyBanner.classList.add("hidden");
  }

  if (State.isSubmittedToday) {
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.style.display = "none";
    }
  } else {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.style.display = "block";
    }
  }

  TASKS.forEach(t => {
    const card = document.querySelector(`.task-card[data-task="${t.key}"]`);
    if (!card) return;
    const check = card.querySelector("[data-check]");
    const done = !!State.today[t.key];
    
    card.classList.toggle("done", done);
    card.classList.toggle("disabled-card", State.isSubmittedToday);

    if (State.isSubmittedToday) {
      // وضع العرض فقط: شارة بدل مربع الاختيار التفاعلي
      check.classList.remove("checked");
      check.classList.add("readonly");
      check.classList.toggle("missed-badge", !done);
      check.textContent = done ? "✅" : "➖";
    } else {
      // وضع التعبئة النشطة: مربع اختيار تفاعلي
      check.classList.remove("readonly", "missed-badge");
      check.classList.toggle("checked", done);
      check.textContent = done ? "✓" : "";
    }
  });

  const doneCount = TASKS.filter(t => State.today[t.key]).length;
  document.querySelectorAll(".progress-dot").forEach((dot, i) => {
    dot.classList.toggle("done", i < doneCount);
  });

  renderStarCalendar();
}

function renderStarCalendar() {
  const wrap = document.getElementById("starCalendar");
  if (!wrap) return;
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

// التحديد المحلي فقط (بدون تسجيل تلقائي بالسيرفر)
function bindTaskCards() {
  document.querySelectorAll(".task-card").forEach(card => {
    const key = card.dataset.task;
    const newCard = card.cloneNode(true);
    card.replaceWith(newCard);

    newCard.addEventListener("click", () => {
      if (State.isSubmittedToday) return; // منع التغيير في حال القفل
      
      State.today[key] = !State.today[key];
      setLocalTodayCache(State.student, State.today);
      renderTasksScreen();
    });
  });

  const confirmBtn = document.getElementById("confirmTasksBtn");
  if (confirmBtn) {
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirmBtn);
    newConfirmBtn.addEventListener("click", onConfirmAndSubmitAll);
  }
}

// التنسيق النهائي والحفظ الفعلي عند الضغط على زر "تأكيد وحفظ المهام"
async function onConfirmAndSubmitAll() {
  if (State.isSubmittedToday) return;

  State.isSubmittedToday = true;
  State.justSubmitted = true;
  localStorage.setItem(getLockStorageKey(State.student), "true");
  
  computeStreak();
  renderTasksScreen();

  const allCompleted = TASKS.every(t => State.today[t.key]);
  fireConfetti(allCompleted ? 60 : 30);

  // تظهر رسالة التهنئة فوراً مع الضغط على زر التأكيد، دون انتظار المزامنة مع الخادم
  const successModal = document.getElementById("successModal");
  if (successModal) {
    successModal.classList.remove("hidden");
  }

  // المزامنة مع الخادم تتم في الخلفية دون تعطيل الواجهة
  syncSubmissionInBackground();
}

async function syncSubmissionInBackground() {
  // إرسال كل مهمة على حدة
  for (const t of TASKS) {
    const payload = {
      studentName: State.student,
      task: t.key,
      completed: !!State.today[t.key],
      clientTimestamp: new Date().toISOString(),
    };
    try {
      if (!navigator.onLine) throw new Error("offline");
      await apiPost({ action: "updateTask", classCode: CONFIG.CLASS_CODE, ...payload });
    } catch (e) {
      enqueueUpdate(payload);
    }
  }

  // ملاحظة: تم إلغاء إرسال حقل "submitted" الإضافي (كان تجريبياً) لأنه على الأرجح
  // غير معروف لدى الخادم الحالي (Google Apps Script) وقد يتسبب في إفساد/إزاحة
  // أعمدة المهام الحقيقية (wird/tuhfa/irab) عند الكتابة في عمود غير موجود.
  // القفل بين الأجهزة يعتمد الآن فقط على: أي مهمة true في بيانات الخادم + القفل المحلي.
}

/* ================== 10) واجهة الأستاذ ================== */
const Teacher = {
  loggedIn: false,
  records: [],
  students: [],
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
    // توحيد صيغة التاريخ حتى تنجح مقارنات "اليوم/الأسبوع/الكل" دائماً
    Teacher.records = (data.records || []).map(r => ({ ...r, date: normalizeDateStr(r.date) }));
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
    return true;
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
  const csv = "\uFEFF" + lines.join("\n");
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
