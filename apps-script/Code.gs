/**
 * 가사 바꾸기 — 제출 저장용 구글 Apps Script
 * 구글 시트 > 확장 프로그램 > Apps Script 에 이 내용을 통째로 붙여넣고
 * '배포 > 새 배포 > 웹 앱'(액세스: 모든 사용자)으로 배포하세요.
 */
const SHEET_NAME = '제출';
const HEADERS = ['학급코드', '노래', '모둠', '바꾼 말(JSON)', '제출 시각', '전체 가사'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange('A:C').setNumberFormat('@'); // 0403 이 403 으로 바뀌지 않도록 글자로 저장
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 목록 불러오기: ?action=list&classCode=0403&songId=together-road
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== 'list') return json_({ ok: true, message: '가사 바꾸기 서버가 동작 중이에요.' });

  const rows = getSheet_().getDataRange().getValues().slice(1);
  const items = rows
    .filter(r => String(r[0]) === String(p.classCode) && String(r[1]) === String(p.songId))
    .map(r => ({
      group: String(r[2]),
      answers: safeParse_(r[3]),
      updatedAt: r[4] instanceof Date ? r[4].toISOString() : String(r[4]),
    }));
  return json_({ ok: true, items: items });
}

// 제출하기: 같은 학급·노래·모둠이면 덮어씀
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action !== 'save') return json_({ ok: false, error: 'unknown action' });

    const classCode = String(body.classCode || '').slice(0, 20);
    const songId = String(body.songId || '').slice(0, 50);
    const group = String(body.group || '').slice(0, 5);
    const answers = {};
    Object.keys(body.answers || {}).slice(0, 50).forEach(k => {
      answers[k] = String(body.answers[k]).slice(0, 30);
    });
    const fullText = String(body.fullText || '').slice(0, 5000);
    if (!classCode || !songId || !group) return json_({ ok: false, error: 'missing fields' });

    const now = new Date();
    const row = [classCode, songId, group, JSON.stringify(answers), now, fullText];
    const sh = getSheet_();
    const values = sh.getDataRange().getValues();
    let target = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === classCode && String(values[i][1]) === songId && String(values[i][2]) === group) {
        target = i + 1;
        break;
      }
    }
    if (target === -1) target = sh.getLastRow() + 1;
    sh.getRange(target, 1, 1, 3).setNumberFormat('@');
    sh.getRange(target, 1, 1, row.length).setValues([row]);
    return json_({ ok: true, updatedAt: now.toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function safeParse_(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
