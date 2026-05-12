(() => {
  const STORAGE_KEY = 'bg-note:v1';
  const DEFAULT_SETTINGS = {
    fastingMin: 70,
    fastingMax: 130,
    afterMealMax: 180,
    lowThreshold: 70,
    alertOnOutOfRange: true,
  };

  const CONTEXT_LABEL = {
    fasting: '공복',
    before_meal: '식전',
    after_meal: '식후',
    bedtime: '취침전',
    random: '기타',
  };

  const TYPE_LABEL = {
    glucose: '혈당',
    meal: '식사',
    exercise: '운동',
    medication: '약',
  };

  // --- state ---
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { records: [], settings: { ...DEFAULT_SETTINGS } };
      const parsed = JSON.parse(raw);
      return {
        records: Array.isArray(parsed.records) ? parsed.records : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      };
    } catch {
      return { records: [], settings: { ...DEFAULT_SETTINGS } };
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // --- helpers ---
  function fmtTime(ts) {
    const d = new Date(ts);
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

  function toLocalInput(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function classifyGlucose(value, context, settings) {
    const v = Number(value);
    if (!Number.isFinite(v)) return 'unknown';
    if (v < settings.lowThreshold) return 'low';
    if (context === 'fasting' || context === 'before_meal') {
      if (v > settings.fastingMax) return 'high';
      if (v < settings.fastingMin) return 'low';
      return 'ok';
    }
    if (context === 'after_meal') {
      if (v > settings.afterMealMax) return 'high';
      return 'ok';
    }
    if (v > settings.afterMealMax) return 'high';
    return 'ok';
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // --- views / nav ---
  const titleMap = { home: '홈', log: '기록', stats: '통계', settings: '설정' };

  function setView(name) {
    document.querySelectorAll('.view').forEach((v) => {
      v.classList.toggle('active', v.dataset.view === name);
    });
    document.querySelectorAll('.navbtn').forEach((b) => {
      b.classList.toggle('active', b.dataset.nav === name);
    });
    document.getElementById('page-title').textContent = titleMap[name] || '';
    if (name === 'home') renderHome();
    if (name === 'stats') renderStats();
    if (name === 'settings') fillSettings();
    if (name === 'log') setLogTime();
  }

  document.querySelectorAll('.navbtn').forEach((b) => {
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
    e.target.reset();
    setLogTime();
    const cls = classifyGlucose(value, f.context, state.settings);
    if (state.settings.alertOnOutOfRange && (cls === 'high' || cls === 'low')) {
      toast(cls === 'high' ? `높음: ${value} mg/dL` : `낮음: ${value} mg/dL`);
    } else {
      toast('저장됨');
    }
  });

  document.getElementById('form-meal').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const at = f.at ? new Date(f.at).getTime() : Date.now();
    addRecord({ type: 'meal', at, value: f.value, carbs: f.carbs ? Number(f.carbs) : null, note: f.note || '' });
    e.target.reset();
    setLogTime();
    toast('저장됨');
  });

  document.getElementById('form-exercise').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const at = f.at ? new Date(f.at).getTime() : Date.now();
    addRecord({ type: 'exercise', at, value: f.value, duration: f.duration ? Number(f.duration) : null, note: f.note || '' });
    e.target.reset();
    setLogTime();
    toast('저장됨');
  });

  document.getElementById('form-medication').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const at = f.at ? new Date(f.at).getTime() : Date.now();
    addRecord({ type: 'medication', at, value: f.value, dose: f.dose || '', note: f.note || '' });
    e.target.reset();
    setLogTime();
    toast('저장됨');
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
      if (state.settings.alertOnOutOfRange && (cls === 'high' || cls === 'low')) {
        toast(cls === 'high' ? `높음: ${value} mg/dL` : `낮음: ${value} mg/dL`);
      } else {
        toast('저장됨');
      }
      renderHome();
    });
  });

  // --- home rendering ---
  function renderHome() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todayGlucose = state.records.filter(
      (r) => r.type === 'glucose' && r.at >= start.getTime()
    );
    const avg = todayGlucose.length
      ? Math.round(todayGlucose.reduce((s, r) => s + Number(r.value), 0) / todayGlucose.length)
      : null;
    document.getElementById('today-avg').textContent = avg ?? '--';
    document.getElementById('today-count').textContent = todayGlucose.length;
    const inRange = todayGlucose.filter((r) => classifyGlucose(r.value, r.context, state.settings) === 'ok').length;
    document.getElementById('today-inrange').textContent = todayGlucose.length
      ? `${Math.round((inRange / todayGlucose.length) * 100)}%`
      : '--';

    const list = document.getElementById('recent-list');
    list.innerHTML = '';
    const recent = [...state.records].sort((a, b) => b.at - a.at).slice(0, 8);
    if (recent.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'list-empty';
      empty.textContent = '아직 기록이 없습니다. 위 버튼으로 빠르게 기록해보세요.';
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
        const badge = document.createElement('span');
        badge.className = `badge ${cls === 'ok' ? 'ok' : cls === 'high' ? 'high' : cls === 'low' ? 'low' : ''}`;
        badge.textContent = CONTEXT_LABEL[r.context] || '혈당';
        left.appendChild(badge);
        const main = document.createElement('div');
        main.innerHTML = `<div class="main">${r.value} mg/dL</div><div class="meta">${fmtTime(r.at)}</div>`;
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

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    const since = Date.now() - statsRangeDays * 24 * 60 * 60 * 1000;
    const recs = state.records
      .filter((r) => r.type === 'glucose' && r.at >= since)
      .sort((a, b) => a.at - b.at);

    if (recs.length === 0) {
      document.getElementById('stat-avg').textContent = '--';
      document.getElementById('stat-min').textContent = '--';
      document.getElementById('stat-max').textContent = '--';
      document.getElementById('stat-inrange').textContent = '--';
      document.getElementById('stat-low').textContent = '--';
      document.getElementById('stat-high').textContent = '--';
    } else {
      const values = recs.map((r) => Number(r.value));
      const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
      const min = Math.min(...values);
      const max = Math.max(...values);
      let ok = 0, low = 0, high = 0;
      for (const r of recs) {
        const c = classifyGlucose(r.value, r.context, state.settings);
        if (c === 'ok') ok++;
        else if (c === 'low') low++;
        else if (c === 'high') high++;
      }
      document.getElementById('stat-avg').textContent = avg;
      document.getElementById('stat-min').textContent = min;
      document.getElementById('stat-max').textContent = max;
      document.getElementById('stat-inrange').textContent = `${Math.round((ok / recs.length) * 100)}%`;
      document.getElementById('stat-low').textContent = low;
      document.getElementById('stat-high').textContent = high;
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
      const c = classifyGlucose(r.value, r.context, state.settings);
      return c === 'high' ? '#ef4444' : c === 'low' ? '#6366f1' : '#16a34a';
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
          y: { beginAtZero: false, suggestedMin: 50, suggestedMax: 250 },
          x: { ticks: { maxTicksLimit: 6 } },
        },
      },
    });
  }

  function drawByContext(recs) {
    const ctx = document.getElementById('chart-context');
    const groups = { fasting: [], before_meal: [], after_meal: [], bedtime: [], random: [] };
    for (const r of recs) (groups[r.context] || groups.random).push(Number(r.value));
    const labels = ['공복', '식전', '식후', '취침전', '기타'];
    const keys = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random'];
    const data = keys.map((k) => {
      const arr = groups[k];
      return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
    });
    if (chartContext) chartContext.destroy();
    chartContext = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data, backgroundColor: '#4f46e5' }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
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
      save();
      toast('가져오기 완료');
      renderHome();
    } catch (err) {
      toast('가져오기 실패');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('모든 기록과 설정을 삭제할까요? 되돌릴 수 없습니다.')) return;
    state = { records: [], settings: { ...DEFAULT_SETTINGS } };
    save();
    toast('초기화 완료');
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
  setView('home');
  setLogTime();
})();
