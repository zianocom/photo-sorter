/* 점검서류 사진 분류기
 * 1) 사진 업로드(순서 유지)
 * 2) 브라우저 내장 OCR(Tesseract.js, 오프라인)로 사업명 라벨 · 서류 제목 · 표지 여부 추출
 * 3) 사업명이 없는 사진은 직전 표지의 사업명으로 묶음
 * 4) 서류 제목을 파일명으로, 사업명 폴더에 저장
 */

const MAX_EDGE = 2000; // OCR 인식률을 위한 최대 변(비용 제약이 없으므로 기존보다 크게)
const UNCLASSIFIED = "미분류";

// 화면 요소
const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  thumbs: document.getElementById("thumbs"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  clearBtn: document.getElementById("clearBtn"),
  progress: document.getElementById("progress"),
  resultCard: document.getElementById("resultCard"),
  resultBody: document.querySelector("#resultTable tbody"),
  saveBtn: document.getElementById("saveBtn"),
  saveHint: document.getElementById("saveHint"),
  savedTag: document.getElementById("savedTag"),
};

// 업로드된 항목: { file, url, businessName, title, isCover, error }
let items = [];

/* ---------- 기기 저장 (IndexedDB) ----------
 * 사진과 분석 결과를 브라우저에 저장해, 앱을 닫았다 다시 열어도 이어서 볼 수 있게 한다.
 * (이 기기·이 브라우저에만 저장됨) */
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("seolyu-db", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveSession() {
  try {
    const recs = items.map((it) => ({
      name: it.file.name,
      type: it.file.type,
      blob: it.file, // 원본 이미지 그대로 저장
      businessName: it.businessName,
      title: it.title,
      isCover: it.isCover,
      error: it.error,
    }));
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(recs, "current");
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    markSaved();
  } catch (e) {
    console.warn("자동 저장 실패:", e);
  }
}
async function loadSession() {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readonly");
    const rq = tx.objectStore("kv").get("current");
    rq.onsuccess = () => res(rq.result || []);
    rq.onerror = () => rej(rq.error);
  });
}
async function clearSession() {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").delete("current");
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.warn("저장 삭제 실패:", e);
  }
}
let savedTimer = null;
function markSaved() {
  if (!els.savedTag) return;
  els.savedTag.textContent = "기기에 저장됨 ✓";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (els.savedTag.textContent = ""), 2500);
}

/* ---------- 업로드 (드래그 & 클릭) ---------- */
els.dropzone.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (e) => addFiles(e.target.files));

["dragover", "dragenter"].forEach((ev) =>
  els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("drag");
  })
);
els.dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
});

function addFiles(fileList) {
  const images = [...fileList].filter((f) => f.type.startsWith("image/"));
  for (const file of images) {
    items.push({ file, url: URL.createObjectURL(file), businessName: "", title: "", isCover: false, error: null });
  }
  renderThumbs();
  saveSession(); // 올린 사진을 즉시 저장
}

function renderThumbs() {
  els.thumbs.innerHTML = "";
  items.forEach((it, i) => {
    const d = document.createElement("div");
    d.className = "thumb";
    d.innerHTML = `<span class="idx">${i + 1}</span><img src="${it.url}" alt="" />`;
    els.thumbs.appendChild(d);
  });
  const has = items.length > 0;
  els.analyzeBtn.disabled = !has;
  els.clearBtn.disabled = !has;
}

els.clearBtn.addEventListener("click", () => {
  if (!confirm("올린 사진과 분석 결과를 모두 지울까요? (기기 저장분도 삭제됩니다)")) return;
  items.forEach((it) => URL.revokeObjectURL(it.url));
  items = [];
  renderThumbs();
  els.resultCard.hidden = true;
  els.progress.textContent = "";
  clearSession();
});

/* ---------- 이미지 → 리사이즈된 데이터 URL (JPEG) ---------- */
function resizeToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

/* ---------- OCR 결과 → 사업명 · 제목 · 표지 여부 추출 ----------
 * Claude Vision과 달리 문맥 유추가 안 되므로, 서류에 "사업명:" 같은
 * 라벨이 인쇄되어 있어야 인식된다. */
const BUSINESS_LABELS = ["사업명", "공사명", "현장명", "사업장명", "건명"];
const BUSINESS_RE = new RegExp(`(?:${BUSINESS_LABELS.join("|")})\\s*[:：]?\\s*(.+)`);
const TITLE_KEYWORDS = [
  "점검표", "점검 결과서", "점검결과서", "확인서", "성적서", "검사성적서",
  "보고서", "판정서", "검사조서", "완료보고서", "사용전검사", "정기검사",
  "정밀점검", "안전점검",
];

function extractFields(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let businessName = "";
  for (const line of lines) {
    const m = line.match(BUSINESS_RE);
    if (m && m[1].trim()) {
      businessName = m[1].trim();
      break;
    }
  }

  let title = "";
  for (const line of lines) {
    if (TITLE_KEYWORDS.some((k) => line.includes(k))) {
      title = line;
      break;
    }
  }

  return { businessName, title, isCover: !!businessName };
}

let ocrWorker = null;
async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker("kor", 1, {
      workerPath: "vendor/tesseract/worker.min.js",
      corePath: "vendor/tesseract/tesseract-core-lstm.js",
      langPath: "vendor/tesseract/lang",
      workerBlobURL: false,
      gzip: true,
    });
  }
  return ocrWorker;
}

async function analyzeOne(item, worker) {
  const dataUrl = await resizeToDataUrl(item.file);
  const { data } = await worker.recognize(dataUrl);
  return extractFields(data.text || "");
}

/* ---------- 분석 실행 ---------- */
els.analyzeBtn.addEventListener("click", async () => {
  els.analyzeBtn.disabled = true;
  els.clearBtn.disabled = true;
  els.progress.textContent = "OCR 엔진 준비 중…";

  let worker;
  try {
    worker = await getOcrWorker();
  } catch (e) {
    els.progress.textContent = "OCR 엔진을 불러오지 못했습니다: " + e.message;
    els.analyzeBtn.disabled = false;
    els.clearBtn.disabled = false;
    return;
  }

  for (let i = 0; i < items.length; i++) {
    els.progress.textContent = `분석 중… (${i + 1}/${items.length})`;
    try {
      const r = await analyzeOne(items[i], worker);
      items[i].businessName = (r.businessName || "").trim();
      items[i].title = (r.title || "").trim();
      items[i].isCover = !!r.isCover;
      items[i].error = null;
    } catch (err) {
      items[i].error = err.message;
      items[i].title = items[i].title || "";
    }
  }

  applyGrouping();
  renderResults();
  els.progress.textContent = `완료 (${items.length}장)`;
  els.analyzeBtn.disabled = false;
  els.clearBtn.disabled = false;
  els.resultCard.hidden = false;
  saveSession(); // 분석 결과 저장
});

/* ---------- 그룹핑: 사업명 없으면 직전 표지의 사업명으로 ---------- */
function applyGrouping() {
  let current = "";
  for (const it of items) {
    if (it.businessName) {
      current = it.businessName; // 새 사업(대개 표지)
    } else {
      it.businessName = current || UNCLASSIFIED; // 표지 이후 연결 사진
    }
    if (!it.title) it.title = it.isCover ? "표지" : "서류";
  }
}

/* ---------- 결과 표 (수정 가능) ---------- */
function renderResults() {
  els.resultBody.innerHTML = "";
  items.forEach((it, i) => {
    const tr = document.createElement("tr");
    if (it.isCover) tr.className = "cover";
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><img src="${it.url}" alt="" /></td>
      <td><input data-i="${i}" data-k="businessName" value="${escapeHtml(it.businessName)}" /></td>
      <td>
        <input data-i="${i}" data-k="title" value="${escapeHtml(it.title)}" />
        ${it.error ? `<div class="err">⚠ ${escapeHtml(it.error)}</div>` : ""}
      </td>
      <td style="text-align:center"><input type="checkbox" data-i="${i}" data-k="isCover" ${it.isCover ? "checked" : ""} /></td>
    `;
    els.resultBody.appendChild(tr);
  });

  els.resultBody.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const i = +e.target.dataset.i;
      const k = e.target.dataset.k;
      items[i][k] = k === "isCover" ? e.target.checked : e.target.value.trim();
      if (k === "isCover") renderResults();
      saveSession(); // 수정 내용 저장
    });
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---------- 파일/폴더 이름 정리 ---------- */
function sanitize(name) {
  return (name || "")
    .replace(/[\\/:*?"<>|]/g, " ") // 파일명 금지 문자
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "무제";
}

function extOf(file) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(file.name);
  return m ? m[1].toLowerCase() : "jpg";
}

/* ---------- 저장 ---------- */
els.saveBtn.addEventListener("click", async () => {
  if ("showDirectoryPicker" in window) {
    await saveToFolder();
  } else {
    await saveByDownload();
  }
});

// 사업명별 하위 폴더를 만들어 원본 파일을 제목.확장자로 저장 (Chrome/Edge)
async function saveToFolder() {
  let root;
  try {
    root = await window.showDirectoryPicker({ mode: "readwrite" });
  } catch {
    return; // 사용자가 취소
  }
  const used = {}; // 폴더별 파일명 중복 방지
  let saved = 0;
  for (const it of items) {
    const folderName = sanitize(it.businessName || UNCLASSIFIED);
    const dir = await root.getDirectoryHandle(folderName, { create: true });
    const base = sanitize(it.title);
    const ext = extOf(it.file);
    const key = folderName + "/" + base;
    used[key] = (used[key] || 0) + 1;
    const fileName = used[key] > 1 ? `${base}_${used[key]}.${ext}` : `${base}.${ext}`;
    const handle = await dir.getFileHandle(fileName, { create: true });
    const w = await handle.createWritable();
    await w.write(it.file); // 원본 이미지를 그대로 저장
    await w.close();
    saved++;
  }
  els.saveHint.textContent = `✅ ${saved}장을 사업명 폴더로 저장했습니다.`;
}

// File System Access 미지원(주로 모바일): 사업명 폴더 구조를 담은 ZIP 한 개로 다운로드
async function saveByDownload() {
  const used = {};
  const entries = [];
  for (const it of items) {
    const folder = sanitize(it.businessName || UNCLASSIFIED);
    const base = sanitize(it.title);
    const ext = extOf(it.file);
    const key = folder + "/" + base;
    used[key] = (used[key] || 0) + 1;
    const suffix = used[key] > 1 ? `_${used[key]}` : "";
    entries.push({ name: `${folder}/${base}${suffix}.${ext}`, data: it.file });
  }
  const blob = await buildZip(entries);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "점검서류_분류.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  els.saveHint.textContent =
    "✅ 사업명 폴더 구조를 담은 ZIP을 다운로드했습니다. 압축을 풀면 사업명별로 정리됩니다.";
}

/* ---------- 최소 ZIP 생성기 (압축 없음, store 방식) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function buildZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
  const u32 = (n) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const data = new Uint8Array(await e.data.arrayBuffer());
    const crc = crc32(data);

    // 로컬 파일 헤더
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), // UTF-8 이름 플래그
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), nameBytes, data,
    ]);
    chunks.push(local);

    // 중앙 디렉터리 항목
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBytes,
    ]));
    offset += local.length;
  }

  const centralBlob = concat(central);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(centralBlob.length), u32(offset), u16(0),
  ]);
  return new Blob([...chunks, centralBlob, end], { type: "application/zip" });
}

function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/* ---------- 앱 시작 시 저장된 작업 복원 ---------- */
(async function restore() {
  let recs = [];
  try {
    recs = await loadSession();
  } catch (e) {
    console.warn("복원 실패:", e);
    return;
  }
  if (!recs.length) return;

  items = recs.map((r) => {
    const file = new File([r.blob], r.name || "photo.jpg", { type: r.type || "image/jpeg" });
    return {
      file,
      url: URL.createObjectURL(file),
      businessName: r.businessName || "",
      title: r.title || "",
      isCover: !!r.isCover,
      error: r.error || null,
    };
  });

  renderThumbs();

  // 이미 분석된 결과가 있으면 결과 표까지 복원
  const analyzed = items.some((it) => it.title || it.businessName);
  if (analyzed) {
    renderResults();
    els.resultCard.hidden = false;
    els.progress.textContent = `이전 작업 복원됨 (${items.length}장) — 이어서 확인하거나 저장하세요`;
  } else {
    els.progress.textContent = `저장된 사진 ${items.length}장 복원됨`;
  }
})();
