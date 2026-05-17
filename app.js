(() => {
  const STORAGE_KEY = 'bg-note:v2';
  const LEGACY_KEY = 'bg-note:v1';

  const DEFAULT_SETTINGS = {
    fastingMin: 80,
    fastingMax: 130,
    afterMealMax: 180,
    lowThreshold: 70,
    urgentHigh: 180,
    criticalHigh: 250,
    criticalLow: 54,
    alertOnOutOfRange: true,
  };

  const DEFAULT_PROFILE = {
    name: '',
    birthYear: null,
    diagnosisDate: '',
    diagnosisGlucose: null,
    hospital: '',
    doctor: '',
  };

  const DEFAULT_PRESCRIPTION = {
    startDate: '',
    endDate: '',
    reminderTime: '08:00',
    medications: [],
  };

  const CONTEXT_LABEL = {
    fasting: '공복',
    before_meal: '식전',
    after_meal: '식후',
    after_meal_4h: '식후4h',
    bedtime: '취침전',
    random: '기타',
  };

  const TYPE_LABEL = {
    glucose: '혈당',
    meal: '식사',
    exercise: '운동',
    medication: '약',
  };

  const KEYWORD_RULES = [
    { match: ['비빔국수'], level: 'high', msg: '비빔국수: 식후 178 사례. 식후 30분 걷기 필수' },
    { match: ['라면', '우동', '소면'], level: 'high', msg: '면류: 즉시 200+ 위험. 가급적 피하세요' },
    { match: ['떡볶이'], level: 'mid', msg: '떡볶이: 5/4 사고 사례. 양 조절' },
    { match: ['만두'], level: 'mid', msg: '만두: 5/11 사고 사례' },
    { match: ['소주'], level: 'high', msg: '소주: 자디앙 + 음주 = 다음날 +70 상승, 케톤산증 위험' },
    { match: ['맥주'], level: 'high', msg: '맥주: 탄수 + 알코올, 자디앙 복용 중 위험' },
    { match: ['치킨'], level: 'mid', msg: '치킨: 밤에 드시면 위험' },
    { match: ['야식'], level: 'high', msg: '야식: 다음날 공복 +50~70 상승 가능' },
    { match: ['회식'], level: 'mid', msg: '회식: 약 거르지 마세요. 회·샤브샤브 추천' },
    { match: ['늦잠'], level: 'mid', msg: '늦잠 시 약 복용 시간 확인' },
    { match: ['짜장', '짬뽕', '칼국수'], level: 'mid', msg: '면 외식: 흰밀가루 주의' },
  ];

  // --- state ---
  let state = load();

  function load() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // legacy migration
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const p = JSON.parse(legacy);
          const migrated = {
            records: Array.isArray(p.records) ? p.records : [],
            settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}) },
            profile: { ...DEFAULT_PROFILE },
            prescription: { ...DEFAULT_PRESCRIPTION },
            medicationLogs: {},
            seedLoaded: false,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }
        return blankState();
      }
      const parsed = JSON.parse(raw);
      return {
        records: Array.isArray(parsed.records) ? parsed.records : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        profile: { ...DEFAULT_PROFILE, ...(parsed.profile || {}) },
        prescription: { ...DEFAULT_PRESCRIPTION, ...(parsed.prescription || {}) },
        medicationLogs: parsed.medicationLogs || {},
        seedLoaded: !!parsed.seedLoaded,
      };
    } catch {
      return blankState();
    }
  }

  function blankState() {
    return {
      records: [],
      settings: { ...DEFAULT_SETTINGS },
      profile: { ...DEFAULT_PROFILE },
      prescription: { ...DEFAULT_PRESCRIPTION },
      medicationLogs: {},
      seedLoaded: false,
    };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // --- seed ---
  function applySeed(force) {
    if (!window.BG_SEED) return;
    if (state.seedLoaded && !force) return;
    const seed = window.BG_SEED;
    // dedupe: skip if id already present
    const have = new Set(state.records.map((r) => r.id));
    for (const r of seed.records) {
      if (!have.has(r.id)) state.records.push({ ...r });
    }
    if (!state.profile.name) state.profile = { ...DEFAULT_PROFILE, ...seed.profile };
    if (!state.prescription.startDate) state.prescription = { ...DEFAULT_PRESCRIPTION, ...seed.prescription };
    state.seedLoaded = true;
    save();
  }

  // --- helpers ---
  function fmtTime(tsv) {
    const d = new Date(tsv);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (sameDay) return `오늘 ${hh}:${mm}`;
    if (isYesterday) return `어제 ${hh}:${mm}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  }

  function dayKey(tsv) {
    const d = new Date(tsv);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function toLocalInput(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function classifyGlucose(value, context, settings) {
    const v = Number(value);
    if (!Number.isFinite(v)) return { level: 'unknown', msg: '' };
    if (v < settings.criticalLow) return { level: 'critical-low', msg: '🚨 응급 저혈당 (54↓). 즉시 사탕/주스, 의식 흐리면 119' };
    if (v < settings.lowThreshold) return { level: 'low', msg: '⚠️ 저혈당. 사탕·주스 즉시' };
    if (context === 'fasting' || context === 'before_meal') {
      if (v >= settings.criticalHigh) return { level: 'critical-high', msg: '🚨🚨 응급실 권유 (250↑)' };
      if (v >= settings.urgentHigh) return { level: 'urgent-high', msg: '🚨 의사 연락 + 산책 30분 (180↑)' };
      if (v >= 140) return { level: 'high', msg: '⚠️ 식단 점검 필요 (140↑)' };
      if (v >= 126) return { level: 'high', msg: '⚠️ 당뇨 진단선 초과 (126↑)' };
      if (v >= settings.fastingMax) return { level: 'caution', msg: '⚠️ 목표 초과' };
      return { level: 'ok', msg: '✅ 정상 범위' };
    }
    if (context === 'after_meal' || context === 'after_meal_4h') {
      if (v >= settings.criticalHigh) return { level: 'critical-high', msg: '🚨 즉시 산책 + 의사 (250↑)' };
      if (v >= 200) return { level: 'urgent-high', msg: '🚨 식후 200↑. 식단 + 운동 점검' };
      if (v >= settings.afterMealMax) return { level: 'high', msg: '⚠️ 식후 목표 초과' };
      if (v < settings.lowThreshold) return { level: 'low', msg: '⚠️ 저혈당 주의' };
      return { level: 'ok', msg: '✅ 정상' };
    }
    if (v >= settings.criticalHigh) return { level: 'critical-high', msg: '🚨 250↑' };
    if (v >= settings.afterMealMax) return { level: 'high', msg: '⚠️ 높음' };
    return { level: 'ok', msg: '✅ 정상' };
  }

  function detectKeywords(text) {
    if (!text) return [];
    const lower = String(text);
    const hits = [];
    for (const rule of KEYWORD_RULES) {
      if (rule.match.some((m) => lower.includes(m))) hits.push(rule);
    }
    return hits;
  }

  function toast(msg, duration) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), duration || 2200);
  }

  // --- views / nav ---
  const titleMap = { home: '홈', log: '기록', meds: '약', stats: '통계', settings: '설정' };

  function setView(name) {
    document.querySelectorAll('.view').forEach((v) => {
      v.classList.toggle('active', v.dataset.view === name);
    });
    document.querySelectorAll('.navbtn').forEach((b) => {
      b.classList.toggle('active', b.dataset.nav === name);
    });
    document.getElementById('page-title').textContent = titleMap[name] || '';
    if (name === 'home') renderHome();
    if (name === 'meds') renderMeds();
    if (name === 'stats') renderStats();
    if (name === 'settings') fillSettings();
    if (name === 'log') setLogTime();
  }

  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.nav));
  });

  // --- log forms ---
  function setLogTime() {
    const now = toLocalInput(new Date());
    document.querySelectorAll('.form input[name="at"]').forEach((i) => {
      if (!i.value) i.value = now;
    });
  }

  document.querySelectorAll('.tab[data-tab]').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-tab]').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.form[data-form]').forEach((f) => {
        f.classList.toggle('hidden', f.dataset.form !== t.dataset.tab);
      });
    });
  });

  // keyword hint on glucose note
  const glucoseNoteInput = document.querySelector('#form-glucose input[name="note"]');
  const keywordHint = document.getElementById('keyword-hint');
  if (glucoseNoteInput) {
    glucoseNoteInput.addEventListener('input', () => {
      const hits = detectKeywords(glucoseNoteInput.value);
      if (hits.length === 0) {
        keywordHint.classList.add('hidden');
        return;
      }
      const level = hits.some((h) => h.level === 'high') ? 'high' : 'mid';
      keywordHint.className = `hint-box ${level}`;
      keywordHint.innerHTML = hits.map((h) => `<div>${h.msg}</div>`).join('');
      keywordHint.classList.remove('hidden');
    });
  }

  function addRecord(rec) {
    state.records.push({ id: uid(), ...rec });
    save();
  }

  function readForm(form) {
    const data = new FormData(form);
    const obj = {};
    for (const [k, v] of data.entries()) obj[k] = v;
    return obj;
  }

  document.getElementById('form-glucose').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const value = Number(f.value);
    if (!Number.isFinite(value) || value < 20 || value > 600) return toast('혈당값을 확인하세요');
    const at = f.at ? new Date(f.at).getTime() : Date.now();
    addRecord({ type: 'glucose', at, value, context: f.context, note: f.note || '' });
    const cls = classifyGlucose(value, f.context, state.settings);
    e.target.reset();
    keywordHint.classList.add('hidden');
    setLogTime();
    if (state.settings.alertOnOutOfRange && cls.msg && cls.level !== 'ok') {
      toast(cls.msg, 4000);
    } else {
      toast('저장됨');
    }
    renderHome();
  });

  document.getElementById('form-meal').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const at = f.at ? new Date(f.at).getTime() : Date.now();
    addRecord({ type: 'meal', at, value: f.value, carbs: f.carbs ? Number(f.carbs) : null, note: f.note || '' });
    const hits = detectKeywords(`${f.value} ${f.note || ''}`);
    e.target.reset();
    setLogTime();
    if (hits.length) toast(hits[0].msg, 3500);
    else toast('저장됨');
    renderHome();
  });

  document.getElementById('form-exercise').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const at = f.at ? new Date(f.at).getTime() : Date.now();
    addRecord({ type: 'exercise', at, value: f.value, duration: f.duration ? Number(f.duration) : null, note: f.note || '' });
    e.target.reset();
    setLogTime();
    toast('운동 기록 저장됨');
    renderHome();
  });

  // --- quick add (home) ---
  document.querySelectorAll('.quick').forEach((b) => {
    b.addEventListener('click', () => {
      const ctx = b.dataset.quick;
      const raw = prompt(`${CONTEXT_LABEL[ctx]} 혈당 (mg/dL)`);
      if (raw === null) return;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 20 || value > 600) return toast('값을 확인하세요');
      addRecord({ type: 'glucose', at: Date.now(), value, context: ctx, note: '' });
      const cls = classifyGlucose(value, ctx, state.settings);
      if (state.settings.alertOnOutOfRange && cls.msg && cls.level !== 'ok') {
        toast(cls.msg, 4000);
      } else {
        toast('저장됨');
      }
      renderHome();
    });
  });

  // --- home ---
  function timeAlerts() {
    const now = new Date();
    const dow = now.getDay(); // 0 Sun ~ 6 Sat
    const hour = now.getHours();
    const alerts = [];
    if (dow === 5 && hour >= 17 && hour < 23) {
      alerts.push({ level: 'warn', text: '🍻 금요일 저녁 — 회식 자제하세요. 마시면 반 병 이내' });
    }
    if (dow === 6 && hour >= 8 && hour < 12) {
      alerts.push({ level: 'info', text: '🌅 주말 첫날 — 식단 조절 시작' });
    }
    if (hour >= 22) {
      alerts.push({ level: 'warn', text: '🌙 야식 시간 — 면류·맥주 충동 주의. 양치하세요' });
    }
    return alerts;
  }

  function patternAlerts(glucoseRecs) {
    const alerts = [];
    // 7일 평균 130 이상
    const since7 = Date.now() - 7 * 86400000;
    const last7 = glucoseRecs.filter((r) => r.at >= since7 && (r.context === 'fasting' || r.context === 'before_meal'));
    if (last7.length >= 3) {
      const avg = last7.reduce((s, r) => s + Number(r.value), 0) / last7.length;
      if (avg >= 130) {
        alerts.push({ level: 'warn', text: `📈 최근 7일 공복 평균 ${Math.round(avg)} — 의사 상담 권장` });
      }
    }
    // 3일 연속 우상향 (공복 기준)
    const fastings = glucoseRecs
      .filter((r) => r.context === 'fasting')
      .sort((a, b) => b.at - a.at)
      .slice(0, 3);
    if (fastings.length === 3 && fastings[0].value > fastings[1].value && fastings[1].value > fastings[2].value) {
      alerts.push({ level: 'warn', text: `⚠️ 공복 3일 연속 상승 (${fastings[2].value}→${fastings[1].value}→${fastings[0].value}) — 식단·운동 점검` });
    }
    return alerts;
  }

  function renderAlerts(extra) {
    const wrap = document.getElementById('alerts-wrap');
    wrap.innerHTML = '';
    const all = [...extra, ...timeAlerts()];
    // 약 처방 만료 D-day
    if (state.prescription.endDate) {
      const end = new Date(state.prescription.endDate);
      const days = Math.ceil((end - new Date()) / 86400000);
      if (days >= 0 && days <= 7) all.unshift({ level: 'warn', text: `💊 처방 D-${days} — 진료 예약 확인` });
      else if (days < 0) all.unshift({ level: 'warn', text: `💊 처방 만료 ${-days}일 경과 — 진료 필요` });
    }
    for (const a of all) {
      const div = document.createElement('div');
      div.className = `alert ${a.level}`;
      div.textContent = a.text;
      wrap.appendChild(div);
    }
  }

  function renderHome() {
    const greet = state.profile.name ? `안녕하세요, ${state.profile.name}님 👋` : '안녕하세요 👋';
    document.getElementById('hero-greet').textContent = greet;

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const todayGlucose = state.records.filter(
      (r) => r.type === 'glucose' && r.at >= startToday.getTime()
    );
    const avg = todayGlucose.length
      ? Math.round(todayGlucose.reduce((s, r) => s + Number(r.value), 0) / todayGlucose.length)
      : null;
    document.getElementById('today-avg').textContent = avg ?? '--';

    const since7 = Date.now() - 7 * 86400000;
    const last7 = state.records.filter((r) => r.type === 'glucose' && r.at >= since7);
    const avg7 = last7.length
      ? Math.round(last7.reduce((s, r) => s + Number(r.value), 0) / last7.length)
      : null;
    document.getElementById('week-avg').textContent = avg7 ?? '--';

    // 약 복용 today
    const today = dayKey(Date.now());
    const meds = state.prescription.medications || [];
    const log = state.medicationLogs[today] || {};
    const takenCount = meds.filter((m) => log[m.id]).length;
    document.getElementById('med-today').textContent = `${takenCount}/${meds.length || 0}`;

    // pattern alerts
    const glucoseRecs = state.records.filter((r) => r.type === 'glucose').sort((a, b) => a.at - b.at);
    renderAlerts(patternAlerts(glucoseRecs));

    // med today list (homecard)
    const medList = document.getElementById('med-today-list');
    medList.innerHTML = '';
    if (meds.length === 0) {
      medList.innerHTML = '<li class="list-empty">처방 정보가 없습니다. 설정에서 등록하세요.</li>';
    } else {
      for (const m of meds) {
        const li = document.createElement('li');
        li.className = 'med-row';
        const checked = !!log[m.id];
        li.innerHTML = `
          <label class="check">
            <input type="checkbox" data-med="${escapeHtml(m.id)}" ${checked ? 'checked' : ''} />
            <span class="${checked ? 'done' : ''}">${escapeHtml(m.name)} ${escapeHtml(m.dose)}</span>
          </label>
          <span class="meta">${escapeHtml(m.timing)}</span>
        `;
        medList.appendChild(li);
      }
      medList.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', () => toggleMed(today, cb.dataset.med, cb.checked));
      });
    }

    // recent list
    const list = document.getElementById('recent-list');
    list.innerHTML = '';
    const recent = [...state.records].sort((a, b) => b.at - a.at).slice(0, 8);
    if (recent.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'list-empty';
      empty.textContent = '아직 기록이 없습니다.';
      list.appendChild(empty);
      return;
    }
    for (const r of recent) {
      const li = document.createElement('li');
      li.className = 'list-item';
      const left = document.createElement('div');
      left.className = 'left';
      if (r.type === 'glucose') {
        const cls = classifyGlucose(r.value, r.context, state.settings);
        const klass = cls.level === 'ok' ? 'ok' : (cls.level === 'low' || cls.level === 'critical-low') ? 'low' : 'high';
        const badge = document.createElement('span');
        badge.className = `badge ${klass}`;
        badge.textContent = CONTEXT_LABEL[r.context] || '혈당';
        left.appendChild(badge);
        const main = document.createElement('div');
        main.innerHTML = `<div class="main">${r.value} mg/dL${r.note ? ' · ' + escapeHtml(r.note) : ''}</div><div class="meta">${fmtTime(r.at)}</div>`;
        left.appendChild(main);
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = TYPE_LABEL[r.type] || r.type;
        left.appendChild(badge);
        const detail =
          r.type === 'exercise' && r.duration ? `${r.value} · ${r.duration}분` :
          r.type === 'medication' && r.dose ? `${r.value} · ${r.dose}` :
          r.type === 'meal' && r.carbs ? `${r.value} · 탄수 ${r.carbs}g` :
          r.value;
        const main = document.createElement('div');
        main.innerHTML = `<div class="main">${escapeHtml(detail)}</div><div class="meta">${fmtTime(r.at)}</div>`;
        left.appendChild(main);
      }
      const del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '×';
      del.title = '삭제';
      del.addEventListener('click', () => {
        if (!confirm('이 기록을 삭제할까요?')) return;
        state.records = state.records.filter((x) => x.id !== r.id);
        save();
        renderHome();
      });
      li.appendChild(left);
      li.appendChild(del);
      list.appendChild(li);
    }
  }

  function toggleMed(date, medId, taken) {
    if (!state.medicationLogs[date]) state.medicationLogs[date] = {};
    if (taken) state.medicationLogs[date][medId] = Date.now();
    else delete state.medicationLogs[date][medId];
    save();
    renderHome();
    // also update meds view if open
    if (document.querySelector('section[data-view="meds"].active')) renderMeds();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- meds view ---
  function renderMeds() {
    document.getElementById('rx-start').textContent = state.prescription.startDate || '--';
    document.getElementById('rx-end').textContent = state.prescription.endDate || '--';
    document.getElementById('rx-hospital').textContent = state.profile.hospital || '--';

    if (state.prescription.endDate) {
      const days = Math.ceil((new Date(state.prescription.endDate) - new Date()) / 86400000);
      document.getElementById('rx-dday').textContent = days >= 0 ? `D-${days}` : `D+${-days} (만료)`;
    } else {
      document.getElementById('rx-dday').textContent = '--';
    }

    const today = dayKey(Date.now());
    document.getElementById('med-date-label').textContent = today;
    const meds = state.prescription.medications || [];
    const log = state.medicationLogs[today] || {};

    const full = document.getElementById('med-full-list');
    full.innerHTML = '';
    if (meds.length === 0) {
      full.innerHTML = '<li class="list-empty">처방 정보가 없습니다.</li>';
    } else {
      for (const m of meds) {
        const li = document.createElement('li');
        li.className = 'med-row tall';
        const checked = !!log[m.id];
        li.innerHTML = `
          <label class="check">
            <input type="checkbox" data-med="${escapeHtml(m.id)}" ${checked ? 'checked' : ''} />
            <div>
              <div class="med-name ${checked ? 'done' : ''}">${escapeHtml(m.name)} <span class="meta">${escapeHtml(m.dose)}</span></div>
              <div class="meta">${escapeHtml(m.timing)}</div>
              ${m.warning ? `<div class="med-warn">⚠️ ${escapeHtml(m.warning)}</div>` : ''}
            </div>
          </label>
        `;
        full.appendChild(li);
      }
      full.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', () => toggleMed(today, cb.dataset.med, cb.checked));
      });
    }

    // adherence 7d
    const adh = document.getElementById('med-adherence');
    adh.innerHTML = '';
    const total = meds.length;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d.getTime());
      const taken = total ? meds.filter((m) => (state.medicationLogs[key] || {})[m.id]).length : 0;
      const pct = total ? Math.round((taken / total) * 100) : 0;
      const li = document.createElement('li');
      li.className = 'adh-row';
      li.innerHTML = `
        <span class="adh-date">${key.slice(5)}</span>
        <div class="adh-bar"><div class="adh-fill" style="width:${pct}%"></div></div>
        <span class="adh-val">${taken}/${total}</span>
      `;
      adh.appendChild(li);
    }
  }

  // --- stats ---
  let chartTrend, chartContext;
  let statsRangeDays = 7;

  document.querySelectorAll('.tab[data-range]').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-range]').forEach((x) => x.classList.toggle('active', x === t));
      statsRangeDays = Number(t.dataset.range);
      renderStats();
    });
  });

  function renderStats() {
    const since = Date.now() - statsRangeDays * 86400000;
    const recs = state.records
      .filter((r) => r.type === 'glucose' && r.at >= since)
      .sort((a, b) => a.at - b.at);

    if (recs.length === 0) {
      ['stat-avg','stat-min','stat-max','stat-inrange','stat-low','stat-high','stat-hba1c'].forEach((id) => {
        document.getElementById(id).textContent = '--';
      });
    } else {
      const values = recs.map((r) => Number(r.value));
      const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
      const min = Math.min(...values);
      const max = Math.max(...values);
      let ok = 0, low = 0, high = 0;
      for (const r of recs) {
        const c = classifyGlucose(r.value, r.context, state.settings).level;
        if (c === 'ok') ok++;
        else if (c === 'low' || c === 'critical-low') low++;
        else high++;
      }
      // eAG: HbA1c = (avg + 46.7) / 28.7
      const a1c = ((avg + 46.7) / 28.7).toFixed(1);
      document.getElementById('stat-avg').textContent = avg;
      document.getElementById('stat-min').textContent = min;
      document.getElementById('stat-max').textContent = max;
      document.getElementById('stat-inrange').textContent = `${Math.round((ok / recs.length) * 100)}%`;
      document.getElementById('stat-low').textContent = low;
      document.getElementById('stat-high').textContent = high;
      document.getElementById('stat-hba1c').textContent = `${a1c}%`;
    }

    drawTrend(recs);
    drawByContext(recs);
  }

  function drawTrend(recs) {
    const ctx = document.getElementById('chart-trend');
    const labels = recs.map((r) => {
      const d = new Date(r.at);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });
    const data = recs.map((r) => Number(r.value));
    const colors = recs.map((r) => {
      const c = classifyGlucose(r.value, r.context, state.settings).level;
      if (c === 'critical-high' || c === 'urgent-high') return '#dc2626';
      if (c === 'high' || c === 'caution') return '#f59e0b';
      if (c === 'low' || c === 'critical-low') return '#6366f1';
      return '#16a34a';
    });

    if (chartTrend) chartTrend.destroy();
    chartTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '혈당',
            data,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,0.1)',
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: colors,
            pointBorderColor: colors,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: false, suggestedMin: 50, suggestedMax: 260 },
          x: { ticks: { maxTicksLimit: 6 } },
        },
      },
    });
  }

  function drawByContext(recs) {
    const ctx = document.getElementById('chart-context');
    const groups = { fasting: [], before_meal: [], after_meal: [], after_meal_4h: [], bedtime: [], random: [] };
    for (const r of recs) (groups[r.context] || groups.random).push(Number(r.value));
    const labels = ['공복', '식전', '식후2h', '식후4h', '취침전', '기타'];
    const keys = ['fasting', 'before_meal', 'after_meal', 'after_meal_4h', 'bedtime', 'random'];
    const data = keys.map((k) => {
      const arr = groups[k];
      return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
    });
    if (chartContext) chartContext.destroy();
    chartContext = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: '#4f46e5' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }

  // --- settings ---
  function fillSettings() {
    const form = document.getElementById('form-settings');
    form.fastingMin.value = state.settings.fastingMin;
    form.fastingMax.value = state.settings.fastingMax;
    form.afterMealMax.value = state.settings.afterMealMax;
    form.lowThreshold.value = state.settings.lowThreshold;
    form.alertOnOutOfRange.checked = !!state.settings.alertOnOutOfRange;

    const p = document.getElementById('form-profile');
    p.name.value = state.profile.name || '';
    p.diagnosisDate.value = state.profile.diagnosisDate || '';
    p.hospital.value = state.profile.hospital || '';
    p.doctor.value = state.profile.doctor || '';
  }

  document.getElementById('form-settings').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    state.settings.fastingMin = Number(f.fastingMin) || DEFAULT_SETTINGS.fastingMin;
    state.settings.fastingMax = Number(f.fastingMax) || DEFAULT_SETTINGS.fastingMax;
    state.settings.afterMealMax = Number(f.afterMealMax) || DEFAULT_SETTINGS.afterMealMax;
    state.settings.lowThreshold = Number(f.lowThreshold) || DEFAULT_SETTINGS.lowThreshold;
    state.settings.alertOnOutOfRange = e.target.alertOnOutOfRange.checked;
    save();
    toast('설정 저장됨');
  });

  document.getElementById('form-profile').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    state.profile.name = f.name || '';
    state.profile.diagnosisDate = f.diagnosisDate || '';
    state.profile.hospital = f.hospital || '';
    state.profile.doctor = f.doctor || '';
    save();
    toast('프로필 저장됨');
    renderHome();
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `bg-note-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.records)) throw new Error('형식 오류');
      if (!confirm(`${parsed.records.length}개 기록을 가져옵니다. 현재 데이터에 합칠까요?`)) return;
      const existing = new Set(state.records.map((r) => r.id));
      for (const r of parsed.records) {
        if (!r.id || !existing.has(r.id)) state.records.push({ ...r, id: r.id || uid() });
      }
      if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
      if (parsed.profile) state.profile = { ...state.profile, ...parsed.profile };
      if (parsed.prescription) state.prescription = { ...state.prescription, ...parsed.prescription };
      if (parsed.medicationLogs) state.medicationLogs = { ...state.medicationLogs, ...parsed.medicationLogs };
      save();
      toast('가져오기 완료');
      renderHome();
    } catch (err) {
      toast('가져오기 실패');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('seed-btn').addEventListener('click', () => {
    if (!confirm('실측 시드 데이터(35일)를 현재 데이터에 합칠까요? 같은 id는 건너뜁니다.')) return;
    applySeed(true);
    toast('시드 데이터 적용됨');
    renderHome();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('모든 기록과 설정을 삭제할까요? 되돌릴 수 없습니다.')) return;
    state = blankState();
    save();
    toast('초기화 완료');
    fillSettings();
    renderHome();
  });

  // --- PWA install ---
  let deferredPrompt = null;
  const installBtn = document.getElementById('install-btn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove('hidden');
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
  });

  // --- service worker ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // --- init ---
  applySeed(false);
  setView('home');
  setLogTime();
})();
