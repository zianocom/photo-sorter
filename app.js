/* 점검서류 사진 분류기
 * 1) 사진 업로드(순서 유지)
 * 2) Claude Vision으로 사업명 · 서류 제목 · 표지 여부 추출
 * 3) 사업명이 없는 사진은 직전 표지의 사업명으로 묶음
 * 4) 서류 제목을 파일명으로, 사업명 폴더에 저장
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_EDGE = 1568; // Claude 권장 최대 변, 비용/속도 절감을 위해 리사이즈
const UNCLASSIFIED = "미분류";

// 화면 요소
const els = {
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
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
};

// 업로드된 항목: { file, url, businessName, title, isCover, error }
let items = [];

/* ---------- API 키 기억 ---------- */
els.apiKey.value = localStorage.getItem("anthropic_api_key") || "";
els.apiKey.addEventListener("change", () =>
  localStorage.setItem("anthropic_api_key", els.apiKey.value.trim())
);
const savedModel = localStorage.getItem("anthropic_model");
if (savedModel) els.model.value = savedModel;
els.model.addEventListener("change", () =>
  localStorage.setItem("anthropic_model", els.model.value.trim())
);

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
  items.forEach((it) => URL.revokeObjectURL(it.url));
  items = [];
  renderThumbs();
  els.resultCard.hidden = true;
  els.progress.textContent = "";
});

/* ---------- 이미지 → 리사이즈된 base64 (JPEG) ---------- */
function fileToBase64(file) {
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
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ mediaType: "image/jpeg", data: dataUrl.split(",")[1] });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

/* ---------- Claude 호출 ---------- */
const EXTRACT_PROMPT = `당신은 점검 서류 사진을 정리하는 전문가입니다. 첨부한 이미지 한 장을 보고 아래 항목을 JSON 객체로만 답하세요. 설명이나 코드블록 없이 순수 JSON만 출력하세요.

- businessName: 서류에 적힌 "사업명"(사업 이름/현장명/공사명). 사진 안에 명확히 보이지 않으면 반드시 null.
- title: 이 서류의 내용을 나타내는 제목(문서명/서식명). 파일명으로 쓸 것이므로 간결하고 명확하게. 예: "소방시설 점검표", "전기안전 점검 결과서".
- isCover: 이 사진이 표지(겉표지/속표지 등 제목만 크게 있는 페이지)로 보이면 true, 일반 내용 페이지면 false.
- documentType: 서류 종류(선택, 모르면 null).

반드시 이 형식의 JSON 하나만 출력하세요:
{"businessName": null, "title": "...", "isCover": false, "documentType": null}`;

async function analyzeOne(item, apiKey, model) {
  const img = await fileToBase64(item.file);
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
            { type: "text", text: EXTRACT_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API 오류 ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || "").join("").trim();
  return parseJson(text);
}

function parseJson(text) {
  // 코드블록/여분 텍스트가 섞여도 첫 JSON 객체를 추출
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("JSON 파싱 실패: " + text.slice(0, 120));
  return JSON.parse(match[0]);
}

/* ---------- 분석 실행 ---------- */
els.analyzeBtn.addEventListener("click", async () => {
  const apiKey = els.apiKey.value.trim();
  const model = els.model.value.trim() || "claude-sonnet-5";
  if (!apiKey) {
    alert("Anthropic API 키를 입력하세요.");
    return;
  }

  els.analyzeBtn.disabled = true;
  els.clearBtn.disabled = true;

  for (let i = 0; i < items.length; i++) {
    els.progress.textContent = `분석 중… (${i + 1}/${items.length})`;
    try {
      const r = await analyzeOne(items[i], apiKey, model);
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

// File System Access 미지원 브라우저: 파일명 앞에 [사업명]을 붙여 개별 다운로드
async function saveByDownload() {
  const used = {};
  for (const it of items) {
    const folder = sanitize(it.businessName || UNCLASSIFIED);
    const base = sanitize(it.title);
    const ext = extOf(it.file);
    const key = folder + "/" + base;
    used[key] = (used[key] || 0) + 1;
    const suffix = used[key] > 1 ? `_${used[key]}` : "";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(it.file);
    a.download = `[${folder}] ${base}${suffix}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 150)); // 다운로드 순차 처리
  }
  els.saveHint.textContent =
    "✅ 다운로드했습니다. (이 브라우저는 폴더 저장을 지원하지 않아 파일명에 [사업명]을 붙였습니다. Chrome/Edge에서는 폴더로 저장됩니다.)";
}
