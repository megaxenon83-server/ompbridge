const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { TextDecoder } = require('node:util');

const exclusions = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'target', '.gradle', '.venv']);
const modifyingTools = new Set(['write', 'edit', 'patch', 'apply_patch', 'delete', 'rename', 'multi_edit']);
const maxFileBytes = 384 * 1024;
const maxWorkspaceBytes = 32 * 1024 * 1024;
const maxTurnBytes = 12 * 1024 * 1024;
const maxFiles = 1400;
const maxCards = 24;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const key = value => process.platform === 'win32' ? value.toLowerCase() : value;

function stat(file) {
  return fs.lstatSync(file, { throwIfNoEntry: false });
}

function safePath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Ugyldig prosjektsti.');
  const segments = relative.split(/[\\/]/);
  if (segments.some(part => !part || part === '.' || part === '..' || part.includes(':') || exclusions.has(part.toLowerCase()))) {
    throw new Error('Ugyldig prosjektsti.');
  }
  let target = root;
  for (const part of segments) {
    target = path.join(target, part);
    const metadata = stat(target);
    if (metadata?.isSymbolicLink()) throw new Error('Stien inneholder en filkobling.');
  }
  return target;
}

// Reading and hashing every file in the workspace is the expensive part of a
// turn snapshot, and it used to run for every tool call. Unchanged files are
// reused by stat stamp, so a capture over a large project becomes a stat pass.
const contentCache = new Map();
let contentCacheBytes = 0;

function snapshotFile(root, relative) {
  const file = safePath(root, relative);
  const info = stat(file);
  if (!info) return null;
  if (!info.isFile() || info.size > maxFileBytes) return undefined;
  const stamp = info.mtimeMs + ':' + info.size;
  const cached = contentCache.get(file);
  if (cached && cached.stamp === stamp) return cached.value;
  const content = fs.readFileSync(file);
  if (content.length > maxFileBytes) return undefined;
  const value = { bytes: content.toString('base64'), hash: hash(content), mode: info.mode & 0o777 };
  contentCache.set(file, { stamp, value });
  contentCacheBytes += content.length;
  if (contentCacheBytes > 64 * 1024 * 1024) {
    contentCache.clear();
    contentCache.set(file, { stamp, value });
    contentCacheBytes = content.length;
  }
  return value;
}

function sameFile(before, after) {
  return before === after || (!!before && !!after && before.hash === after.hash && before.mode === after.mode);
}

function listWorkspace(root) {
  const git = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'],
    { encoding: 'utf8', windowsHide: true, timeout: 1800, maxBuffer: 1024 * 1024 });
  if (git.status === 0) return { names: [...new Set(git.stdout.split('\0').filter(Boolean))], complete: true };
  if (git.error?.code === 'ETIMEDOUT' || git.error?.code === 'ENOBUFS') return { names: [], complete: false };
  const names = [];
  const queue = [''];
  let dirs = 0;
  while (queue.length && names.length <= maxFiles && dirs++ < maxFiles) {
    const relative = queue.pop();
    for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (item.name.startsWith('.') || exclusions.has(item.name.toLowerCase())) continue;
      const name = relative ? relative + '/' + item.name : item.name;
      if (item.isDirectory()) queue.push(name);
      else if (item.isFile()) names.push(name);
      if (names.length > maxFiles || queue.length > maxFiles) return { names, complete: false };
    }
  }
  return { names, complete: !queue.length };
}

function capture(root) {
  const listing = listWorkspace(root);
  const files = new Map();
  let bytes = 0;
  let complete = listing.complete && listing.names.length <= maxFiles;
  for (const file of listing.names.slice(0, maxFiles)) {
    const name = file.replaceAll('\\', '/');
    if (name.split('/').some(part => exclusions.has(part.toLowerCase()))) continue;
    try {
      const contents = snapshotFile(root, name);
      if (contents === undefined) { files.set(name, undefined); complete = false; continue; }
      bytes += contents?.bytes.length || 0;
      if (bytes > maxWorkspaceBytes) { complete = false; break; }
      if (contents) files.set(name, contents);
    } catch { files.set(name, undefined); complete = false; }
  }
  return { files, complete };
}

function affectedPaths(root, args = {}) {
  const inputs = [args, ...(Array.isArray(args.edits) ? args.edits : []), ...(Array.isArray(args.operations) ? args.operations : [])];
  const paths = inputs.flatMap(item => [item?.path, item?.filePath, item?.file, item?.oldPath, item?.newPath]);
  for (const value of [args.patch, args.input]) if (typeof value === 'string') {
    for (const match of value.matchAll(/^\*\*\* (?:Update File:|Add File:|Delete File:|Move to:) (.+)$/gm)) paths.push(match[1].trim());
  }
  return [...new Set(paths.filter(value => typeof value === 'string').map(value =>
    path.relative(root, path.resolve(root, value)).split(path.sep).join('/')))];
}

function text(buffer) {
  if (buffer.includes(0)) return null;
  try { return decoder.decode(buffer); } catch { return null; }
}

function makeDiff(before, after, temp) {
  const left = Buffer.from(before?.bytes || '', 'base64');
  const right = Buffer.from(after?.bytes || '', 'base64');
  const a = text(left);
  const b = text(right);
  if (a === null || b === null) return { added: null, removed: null, binary: true, diff: '' };
  if (a === b) return { added: 0, removed: 0, diff: '' };
  fs.writeFileSync(path.join(temp, 'before'), left);
  fs.writeFileSync(path.join(temp, 'after'), right);
  const output = spawnSync('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff', '--no-color', '--text', '--', 'before', 'after'],
    { cwd: temp, encoding: 'utf8', windowsHide: true, timeout: 2000, maxBuffer: 2 * 1024 * 1024 });
  const lines = output.status === 1 ? output.stdout.split('\n') : [];
  const index = lines.findIndex(line => line.startsWith('@@'));
  if (index >= 0) {
    const body = lines.slice(index);
    const diff = body.join('\n');
    return { added: body.filter(line => line.startsWith('+')).length, removed: body.filter(line => line.startsWith('-')).length,
      diff: diff.slice(0, 80000), truncated: diff.length > 80000 };
  }
  return { added: null, removed: null, diff: '', unavailable: true };
}

function writeRecord(file, value) {
  const temp = file + '-' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(value), { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}

function restore(root, file, value) {
  const target = safePath(root, file);
  if (!value) { fs.unlinkSync(target); return; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = path.join(path.dirname(target), '.omp-' + randomUUID() + '.tmp');
  try {
    fs.writeFileSync(temp, Buffer.from(value.bytes, 'base64'), { flag: 'wx', mode: value.mode });
    fs.renameSync(temp, target);
  } finally { fs.rmSync(temp, { force: true }); }
}

function createTurnChanges(directory) {
  const active = new Map();
  const homes = [os.homedir(), process.env.SystemRoot].filter(Boolean).map(value => key(path.resolve(value)));
  const vault = session => path.join(directory, hash(key(path.resolve(session))));
  const cardFile = (session, id, suffix) => {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Ugyldig endringskort.');
    return path.join(vault(session), id + '.' + suffix + '.json');
  };
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

  function list(session) {
    if (!session || !fs.existsSync(vault(session))) return [];
    return fs.readdirSync(vault(session)).filter(name => name.endsWith('.meta.json'))
      .map(name => read(path.join(vault(session), name))).sort((a, b) => a.at - b.at);
  }

  return {
    checks(session) {
      try { return read(path.join(vault(session), 'checks.json')); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    },
    saveCheck(session, check) {
      const { id, at, duration, exitCode, userIndex } = check || {};
      if (!/^[a-f0-9-]{36}$/.test(id || '') || !Number.isSafeInteger(at) || at < 0 ||
          !Number.isSafeInteger(duration) || duration < 0 ||
          !(exitCode === null || (Number.isSafeInteger(exitCode) && exitCode >= 0)) ||
          !Number.isSafeInteger(userIndex) || userIndex < 0) throw new Error('Ugyldig testresultat.');
      const record = { id, at, duration, exitCode, userIndex };
      const checks = this.checks(session).filter(item => item.id !== id);
      fs.mkdirSync(vault(session), { recursive: true });
      writeRecord(path.join(vault(session), 'checks.json'), [...checks, record].sort((a, b) => a.at - b.at).slice(-24));
      return record;
    },
    isActive(owner) { return active.has(owner); },
    invalidate(owner) { if (active.has(owner)) active.get(owner).uncertain = true; },
    start(owner, cwd, userIndex) {
      const root = fs.realpathSync(cwd);
      const location = key(root);
      if (location === key(path.parse(root).root) || homes.includes(location) ||
          (process.env.SystemRoot && location.startsWith(key(path.resolve(process.env.SystemRoot)) + path.sep))) return false;
      if ([...active.values()].some(turn => key(turn.root) === location)) throw new Error('En annen oppgave bruker prosjektmappen.');
      active.set(owner, { root, userIndex, before: capture(root), tools: new Map(), writes: new Map() });
      return true;
    },
    observe(owner, frame) {
      if (frame.type === 'ready') { active.delete(owner); return; }
      const turn = active.get(owner);
      if (!turn) return;
      if (['tool_execution_start', 'tool_start'].includes(frame.type) && modifyingTools.has(frame.toolName)) {
        const before = new Map();
        for (const file of affectedPaths(turn.root, frame.args)) {
          try { before.set(file, snapshotFile(turn.root, file)); } catch {}
        }
        turn.tools.set(frame.toolCallId, before);
      }
      if (!['tool_execution_end', 'tool_end'].includes(frame.type)) return;
      const before = turn.tools.get(frame.toolCallId);
      turn.tools.delete(frame.toolCallId);
      if (!before || frame.isError) return modifyingTools.has(frame.toolName) || frame.toolName === 'bash';
      for (const [file, prior] of before) {
        try {
          const after = snapshotFile(turn.root, file);
          if (prior === undefined || after === undefined || sameFile(prior, after)) continue;
          const existing = turn.writes.get(file);
          turn.writes.set(file, { before: existing ? existing.before : prior, after,
            contiguous: !existing || (existing.contiguous && sameFile(existing.after, prior)) });
        } catch {}
      }
      return true;
    },
    finish(owner, session, anchorToolId) {
      const turn = active.get(owner);
      const live = Boolean(anchorToolId);
      if (!live) active.delete(owner);
      if (!turn || !session) return null;
      const after = capture(turn.root);
      const names = new Set([...turn.before.files.keys(), ...after.files.keys()]);
      const changed = [];
      let bytes = 0;
      let incomplete = !!turn.uncertain || !turn.before.complete || !after.complete;
      for (const file of names) {
        const before = turn.before.files.has(file) ? turn.before.files.get(file) : null;
        const next = after.files.has(file) ? after.files.get(file) : null;
        if (before === undefined || next === undefined || sameFile(before, next)) continue;
        if ((!turn.before.complete && !before) || (!after.complete && !next)) { incomplete = true; continue; }
        bytes += (before?.bytes.length || 0) + (next?.bytes.length || 0);
        if (bytes > maxTurnBytes || changed.length >= 80) { incomplete = true; break; }
        const write = turn.writes.get(file);
        changed.push({ file, before, after: next, verified: !!write && write.contiguous &&
          sameFile(write.before, before) && sameFile(write.after, next) });
      }
      if (!turn.card && !changed.length && (live || !incomplete)) return null;
      const id = turn.card?.id || randomUUID();
      const at = turn.card?.at || Date.now();
      const anchor = turn.card?.anchorToolId || anchorToolId;
      const dir = vault(session);
      fs.mkdirSync(dir, { recursive: true });
      const temp = fs.mkdtempSync(path.join(dir, 'diff-'));
      try {
        const files = changed.map(item => {
          const stats = makeDiff(item.before, item.after, temp);
          item.diff = stats.diff;
          delete stats.diff;
          return { file: item.file, ...stats, verified: item.verified };
        });
        const card = { id, at, userIndex: turn.userIndex, anchorToolId: anchor, files, incomplete, live,
          undoable: !live && files.length > 0 && !incomplete && files.every(item => item.verified), undone: false };
        turn.card = card;
        writeRecord(cardFile(session, id, 'data'), { root: turn.root, changed });
        writeRecord(cardFile(session, id, 'meta'), card);
        for (const old of list(session).slice(0, -maxCards)) {
          fs.rmSync(cardFile(session, old.id, 'meta'), { force: true });
          fs.rmSync(cardFile(session, old.id, 'data'), { force: true });
        }
        return card;
      } finally { fs.rmSync(temp, { recursive: true, force: true }); }
    },
    cancel(owner) { active.delete(owner); },
    list,
    diff(session, id, file) {
      const record = read(cardFile(session, id, 'data'));
      const entry = record.changed.find(item => item.file === file);
      if (!entry) throw new Error('Filen finnes ikke på endringskortet.');
      return { diff: entry.diff };
    },
    undo(session, cwd, id) {
      const meta = cardFile(session, id, 'meta');
      const card = read(meta);
      if (!card.undoable || card.undone) throw new Error('Dette kortet kan ikke angres automatisk.');
      const record = read(cardFile(session, id, 'data'));
      const root = fs.realpathSync(cwd);
      if (key(root) !== key(record.root) || [...active.values()].some(turn => key(turn.root) === key(root))) {
        throw new Error('Vent til prosjektet er ledig før du angrer.');
      }
      for (const item of record.changed) {
        if (!sameFile(snapshotFile(root, item.file), item.after)) throw new Error('Filen er endret etter svaret: ' + item.file);
      }
      const restored = [];
      try {
        for (const item of record.changed) {
          if (!sameFile(snapshotFile(root, item.file), item.after)) throw new Error('Filen ble endret mens du angret: ' + item.file);
          restore(root, item.file, item.before);
          restored.push(item);
        }
        writeRecord(meta, { ...card, undone: true });
      } catch (error) {
        for (const item of restored.reverse()) {
          if (sameFile(snapshotFile(root, item.file), item.before)) restore(root, item.file, item.after);
        }
        throw error;
      }
      return { ...card, undone: true };
    }
  };
}

function todoFromEntries(entries) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.customType === 'user_todo_edit' && Array.isArray(entry.data?.phases)) return entry.data.phases;
    const message = entry.message || entry;
    if (message.toolName === 'todo' && !message.isError && Array.isArray(message.details?.phases)) return message.details.phases;
  }
  return [];
}

module.exports = { createTurnChanges, todoFromEntries };
