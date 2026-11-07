const { existsSync, statSync, readdirSync, mkdirSync, openSync, readSync, closeSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function isLibrary(directory) {
  try {
    if (!statSync(join(directory, 'library')).isDirectory()) return false;
    const handle = openSync(join(directory, 'soriseojae.sqlite'), 'r');
    try { const header = Buffer.alloc(16); readSync(handle, header, 0, 16, 0); if (header.toString() !== 'SQLite format 3\0') return false; }
    finally { closeSync(handle); }
    const db = new DatabaseSync(join(directory, 'soriseojae.sqlite'), { readOnly: true });
    try { db.prepare('SELECT id, title FROM tracks LIMIT 0').all(); db.prepare('SELECT managed_path FROM audio_files LIMIT 0').all(); return true; }
    finally { db.close(); }
  } catch { return false; }
}

// Choosing a new location never turns an arbitrary populated folder into a library.
function createLibraryDirectory(directory, t = message => message) {
  if (existsSync(directory) && readdirSync(directory).some(name => name !== '.DS_Store')) throw Error(t('음악 보관용 빈 폴더를 선택해주세요. 기존 Cove 폴더라면 ‘기존 Cove 폴더 열기’를 선택하세요.'));
  mkdirSync(directory, { recursive: true });
  return resolve(directory);
}

async function chooseLibrary({ settings, legacyDefault, defaultDirectory, override, dialog, t = message => message }) {
  if (override) return resolve(override);
  const previous = settings.dataDirectory || legacyDefault;
  if (previous && isLibrary(resolve(previous))) return resolve(previous);
  let proposed = defaultDirectory;
  for (;;) {
    const choice = await dialog.showMessageBox({
      type: previous ? 'warning' : 'info', title: 'Cove',
      message: previous ? t('음악 폴더를 다시 연결해주세요') : t('음악 폴더를 정해주세요'),
      detail: (previous ? t('이전에 사용한 폴더를 찾지 못했습니다. 폴더 위치를 확인하거나 새 폴더로 시작하세요.\n\n') : '') + t('음악 보관 위치\n') + proposed + t('\n\n추가한 음악과 가사, 기록을 여기에 저장합니다. 원본 파일은 그대로 둡니다.'),
      buttons: [previous ? t('새 음악 폴더로 시작') : t('이 폴더로 시작'), t('다른 폴더 선택'), previous ? t('이전 폴더 찾기') : t('기존 Cove 폴더 열기'), t('종료')], defaultId: previous ? 2 : 0, cancelId: 3
    });
    if (choice.response === 3) return null;
    try {
      if (choice.response === 0) return createLibraryDirectory(proposed, t);
      const existing = choice.response === 2;
      const result = await dialog.showOpenDialog({ title: existing ? t('기존 Cove 폴더 열기') : t('음악 보관 폴더 선택'), message: existing ? t('이전에 Cove에서 사용한 폴더를 선택하세요. 음악과 기록을 그대로 이어서 사용합니다.') : t('새 음악을 보관할 빈 폴더를 선택하세요. 음악 파일은 시작한 뒤 추가합니다.'), defaultPath: proposed, properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled || !result.filePaths[0]) continue;
      const selected = resolve(result.filePaths[0]);
      if (existing) { if (!isLibrary(selected)) throw Error(t('Cove에서 사용한 음악 폴더가 아닙니다. 새로 시작한 뒤 ‘음악 추가’로 파일을 넣어주세요.')); return selected; }
      proposed = selected;
    } catch (error) { await dialog.showMessageBox({ type: 'error', message: error.message, buttons: [t('다시 선택')] }); }
  }
}
module.exports = { chooseLibrary, isLibrary, createLibraryDirectory };
