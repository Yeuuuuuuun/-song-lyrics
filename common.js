/* 학생 화면과 교사 화면이 함께 쓰는 코드 */
const CFG = window.APP_CONFIG;

/* ---------- 가사 해석 ---------- */
// 결과: { verses: [ [ [token, ...] (한 줄), ... ] (한 절), ... ], blanks: [{id, original}] }
function parseLyrics(text) {
  const blanks = [];
  const idByOriginal = {};
  const verses = text.trim().split(/\n\s*\n/).map(verse =>
    verse.split("\n").map(line => {
      const tokens = [];
      const re = /\[([^\]]+)\]|\{([^}]+)\}/g;
      let last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) tokens.push({ type: "text", text: line.slice(last, m.index) });
        if (m[1] !== undefined) {
          const id = blanks.length;
          blanks.push({ id, original: m[1] });
          idByOriginal[m[1]] = id;
          tokens.push({ type: "blank", id });
        } else {
          tokens.push({ type: "ref", original: m[2] });
        }
        last = re.lastIndex;
      }
      if (last < line.length) tokens.push({ type: "text", text: line.slice(last) });
      return tokens;
    })
  );
  // {이름} 을 같은 이름의 [이름] 칸과 연결
  verses.flat(2).forEach(t => {
    if (t.type !== "ref") return;
    t.id = idByOriginal[t.original];
    if (t.id === undefined) { t.type = "text"; t.text = t.original; }
  });
  return { verses, blanks };
}

const SONG = parseLyrics(CFG.lyrics);

// 글자 수 (띄어쓰기 제외)
function syllables(s) {
  return [...(s || "").replace(/\s/g, "")].length;
}

// 바꾼 가사 전체를 글로 만들기 (구글 시트에 보기 좋게 저장)
function lyricsToText(answers) {
  return SONG.verses.map(verse => verse.map(line => line.map(t =>
    t.type === "text" ? t.text : (answers[t.id] || SONG.blanks[t.id].original)
  ).join("")).join("\n")).join("\n\n");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = n => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 저장소 ----------
 * apiUrl 이 있으면 구글 시트, 없으면 이 기기(localStorage)에 저장 */
const Store = {
  isLocal: !CFG.apiUrl,
  localKey: `lyrics:${CFG.classCode}:${CFG.songId}`,

  readLocal() {
    try { return JSON.parse(localStorage.getItem(this.localKey)) || {}; } catch { return {}; }
  },

  // 모든 모둠의 제출 목록 → { "1": {group, answers, updatedAt}, ... }
  async list() {
    if (this.isLocal) return this.readLocal();
    const url = `${CFG.apiUrl}?action=list&classCode=${encodeURIComponent(CFG.classCode)}&songId=${encodeURIComponent(CFG.songId)}&t=${Date.now()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "불러오기 실패");
    const map = {};
    data.items.forEach(it => { map[it.group] = it; });
    return map;
  },

  async get(group) {
    return (await this.list())[group] || null;
  },

  async save(group, answers) {
    const updatedAt = new Date().toISOString();
    if (this.isLocal) {
      const all = this.readLocal();
      all[group] = { group: String(group), answers, updatedAt };
      localStorage.setItem(this.localKey, JSON.stringify(all));
      return { updatedAt };
    }
    // text/plain 으로 보내야 Apps Script 에서 막히지 않아요
    const res = await fetch(CFG.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "save",
        classCode: CFG.classCode,
        songId: CFG.songId,
        group: String(group),
        answers,
        fullText: lyricsToText(answers),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "제출 실패");
    return data;
  },

  // 지우기 (교사용): group 에 모둠 번호 또는 "all"
  async remove(group) {
    if (this.isLocal) {
      const all = group === "all" ? {} : this.readLocal();
      delete all[group];
      localStorage.setItem(this.localKey, JSON.stringify(all));
      return { ok: true };
    }
    const res = await fetch(CFG.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "delete", classCode: CFG.classCode, songId: CFG.songId, group: String(group) }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "삭제 실패");
    return data;
  },
};

// 악보 이미지 영역 채우기 (파일이 없으면 안내 문구)
function renderSheets(container) {
  container.innerHTML = "";
  CFG.sheetImages.forEach((src, i) => {
    const img = new Image();
    img.src = src;
    img.alt = `${CFG.songTitle} 악보 ${i + 1}`;
    img.className = "sheet-img";
    img.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "sheet-placeholder";
      ph.innerHTML = `악보 이미지가 아직 없어요<br><small>${escapeHtml(src)} 위치에 파일을 넣어 주세요</small>`;
      img.replaceWith(ph);
    };
    img.onclick = () => window.open(src, "_blank");
    container.appendChild(img);
  });
}

// 출처 표시
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".credits").forEach(el => { el.textContent = CFG.credits || ""; });
});
