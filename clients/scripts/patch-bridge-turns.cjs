const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [, , sourceName, destination] = process.argv;
if (!sourceName || !destination || path.basename(sourceName) !== 'omp-bridge.mjs') {
  throw new Error('Bruk: node scripts/patch-bridge-turns.cjs <omp-bridge.mjs> <testfil eller --apply>');
}
const source = path.resolve(sourceName);
const moduleSource = path.join(__dirname, '..', 'turn-changes.cjs');
const moduleName = 'omp-turn-changes.cjs';
const install = destination === '--apply';
const output = install ? source : path.resolve(destination);
if (!install && output === source) throw new Error('Bruk en egen testfil.');
let content = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
const marker = '/* OMP Desktop turn changes */';

function replaceOnce(target, replacement) {
  if (content.split(target).length !== 2) throw new Error('Bridge-versjonen har endret seg ved: ' + target.slice(0, 65));
  content = content.replace(target, () => replacement);
}

if (!content.includes(marker)) {
  if (!content.includes('const VERSION = "2.9.31";')) throw new Error('Denne patchen gjelder Bridge 2.9.31.');
  replaceOnce('const VERSION = "2.9.31";', String.raw`import turnModule from "./omp-turn-changes.cjs";
${marker}
const VERSION = "2.9.31";`);
  replaceOnce('const HERE = path.dirname(fileURLToPath(import.meta.url));', String.raw`const HERE = path.dirname(fileURLToPath(import.meta.url));
const turnChanges = turnModule.createTurnChanges(path.join(HERE, "turn-changes"));

function finishTurn(runtime) {
  if (!turnChanges.isActive(runtime)) return;
  const finish = () => {
    try {
      const card = turnChanges.finish(runtime, runtime.sessionFile);
      if (card) runtime.broadcast({ type: "turn_changes", sessionFile: runtime.sessionFile, cwd: runtime.cwd, card });
    } catch (error) { log("warn", "Endringskort: " + error.message); }
  };
  if (runtime.sessionFile) finish();
  else runtime.refreshState().then(finish, () => turnChanges.cancel(runtime));
}`);
  replaceOnce('  onFrame(frame) {\n    this.lastUsed = Date.now();', String.raw`  onFrame(frame) {
    this.lastUsed = Date.now();
    turnChanges.observe(this, frame);
    if (frame.type === "tool_execution_end" && frame.toolName === "todo" &&
        !frame.isError && Array.isArray(frame.result?.details?.phases)) {
      this.broadcast({ type: "todo_phases", cwd: this.cwd, sessionFile: this.sessionFile, phases: frame.result.details.phases });
    }
    if (frame.type === "agent_end" || frame.type === "prompt_result" || frame.type === "session_settled") finishTurn(this);`);
  const promptMarker = '        const images = Array.isArray(body.images) ? body.images : [];\n        const ack = await runtime.rpc("prompt", { message: body.text, ...(images.length ? { images } : {}), ...(body.streamingBehavior ? { streamingBehavior: body.streamingBehavior } : {}) }, 60000);';
  replaceOnce(promptMarker, String.raw`        const images = Array.isArray(body.images) ? body.images : [];
        const inProgress = turnChanges.isActive(runtime);
        if (inProgress && !body.streamingBehavior) return json(res, 409, { error: "Vent til det aktive svaret er ferdig." });
        if (inProgress) turnChanges.invalidate(runtime);
        else {
          try {
            const old = runtime.sessionFile ? toAppMessages(entriesFor(runtime.sessionFile)) : [];
            turnChanges.start(runtime, runtime.cwd, old.filter(item => item.role === "user").length);
          } catch (error) { log("warn", "Endringskort: " + error.message); }
        }
        let ack;
        try {
          ack = await runtime.rpc("prompt", { message: body.text, ...(images.length ? { images } : {}), ...(body.streamingBehavior ? { streamingBehavior: body.streamingBehavior } : {}) }, 60000);
          if (ack?.agentInvoked === false && !inProgress) turnChanges.cancel(runtime);
        } catch (error) {
          if (!inProgress) turnChanges.cancel(runtime);
          throw error;
        }`);
  replaceOnce('      case "GET /api/session/messages": {', String.raw`      case "GET /api/omp/turns":
      case "GET /api/omp/turn-diff":
      case "POST /api/omp/turn-undo": {
        const body = req.method === "POST" ? await readBody(req) : null;
        const supplied = body?.file || url.searchParams.get("file");
        if (typeof supplied !== "string" || !path.isAbsolute(supplied)) {
          return json(res, 400, { error: "Velg en delt tråd." });
        }
        let file, relative;
        try {
          file = fs.realpathSync(supplied);
          relative = path.relative(fs.realpathSync(SESSIONS_ROOT), file);
        } catch { return json(res, 404, { error: "Fant ikke den delte tråden." }); }
        if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) ||
            !file.toLowerCase().endsWith(".jsonl") || !fs.statSync(file).isFile()) {
          return json(res, 404, { error: "Fant ikke den delte tråden." });
        }
        if (route === "GET /api/omp/turns") {
          return json(res, 200, { cards: turnChanges.list(file), todos: turnModule.todoFromEntries(entriesFor(file)) });
        }
        try {
          if (route === "GET /api/omp/turn-diff") {
            return json(res, 200, turnChanges.diff(file, url.searchParams.get("id"), url.searchParams.get("path")));
          }
          const session = loadSession(file);
          if (!session?.cwd) return json(res, 404, { error: "Fant ikke arbeidsmappen til tråden." });
          const runtime = [...runtimes.values()].find(item => samePath(item.cwd, session.cwd));
          if (runtime?.state?.isStreaming || runtime?.pendingUi.size) {
            return json(res, 409, { error: "Vent til prosjektet er ledig før du angrer." });
          }
          const card = turnChanges.undo(file, session.cwd, body.id);
          runtime?.broadcast({ type: "turn_changes", cwd: session.cwd, sessionFile: file, card });
          return json(res, 200, { card });
        } catch (error) { return json(res, 409, { error: error.message }); }
      }

      case "GET /api/session/messages": {`);
}

const chatMarker = '/* OMP shared chat management */';
const assignedRuntime = String.raw`  const key = session.cwd ? runtimeKey(session.cwd) : "";
  const runtime = runtimes.get(key);
  const assigned = runtime && samePath(runtime.sessionFile, file);`;
const assignedRuntimes = String.raw`  const key = session.cwd ? managedProjectKey(session.cwd) : "";
  const assigned = [...runtimes].filter(([, runtime]) => samePath(runtime.sessionFile, file));`;
const runtimeGuard = String.raw`(assigned && (runtime.state?.isStreaming ||
      runtime.restarting || runtime.pending.size || runtime.pendingUi.size || turnChanges.isActive(runtime)))`;
const runtimesGuard = String.raw`assigned.some(([, runtime]) => runtime.state?.isStreaming ||
      runtime.restarting || runtime.pending.size || runtime.pendingUi.size || turnChanges.isActive(runtime))`;
const stopRuntime = String.raw`    if (assigned) {
      await runtime.stop();
      if (runtimes.get(key) === runtime) runtimes.delete(key);
    }`;
const stopRuntimes = String.raw`    for (const [runtimeId, runtime] of assigned) {
      await runtime.stop();
      if (runtimes.get(runtimeId) === runtime) runtimes.delete(runtimeId);
    }`;
const managedKey = String.raw`const managingProjects = new Set();
const managedProjectKey = cwd => IS_WINDOWS ? runtimeKey(cwd).toLowerCase() : runtimeKey(cwd);`;
if (content.includes(chatMarker) && content.includes(assignedRuntime)) {
  replaceOnce('const managingProjects = new Set();', managedKey);
  replaceOnce(assignedRuntime, assignedRuntimes);
  replaceOnce(runtimeGuard, runtimesGuard);
  replaceOnce(stopRuntime, stopRuntimes);
  replaceOnce('managingProjects.has(runtimeKey(cwd))', 'managingProjects.has(managedProjectKey(cwd))');
}
if (!content.includes(chatMarker)) {
  replaceOnce('          runtimes: [...runtimes.values()].map((r) => ({', '          sharedChatManagement: true,\n          runtimes: [...runtimes.values()].map((r) => ({');
  replaceOnce('const runtimes = new Map();', String.raw`const runtimes = new Map();
${chatMarker}
${managedKey}

function managedChatFile(value, root) {
  try {
    const file = fs.realpathSync(value);
    const relative = path.relative(fs.realpathSync(root), file);
    if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) ||
        !file.toLowerCase().endsWith(".jsonl") || !fs.statSync(file).isFile()) return "";
    return file;
  } catch { return ""; }
}

async function manageChat(res, file, action) {
  const session = loadSession(file);
  if (!session) return json(res, 404, { error: "Fant ikke samtalen." });
${assignedRuntimes}
  const tuiActive = !!ompActive && (Date.now() - ompActive.reportedAt < 120000) &&
    samePath(ompActive.sessionFile, file);
  if (managingProjects.has(key) || tuiActive || ${runtimesGuard}) {
    return json(res, 409, { error: "Samtalen er i bruk. Vent til OMP er ferdig og prøv igjen." });
  }
  managingProjects.add(key);
  try {
${stopRuntimes}
    return await action();
  } finally { managingProjects.delete(key); }
}`);
  replaceOnce('async function getRuntime(cwd, { create = true } = {}) {', String.raw`async function getRuntime(cwd, { create = true } = {}) {
  if (managingProjects.has(managedProjectKey(cwd))) throw new Error("En samtale oppdateres. Prøv igjen om et øyeblikk.");`);
  const archiveStart = content.indexOf('      case "POST /api/sessions/archive": {');
  const archiveMeta = content.indexOf('        metaFor(file).archived =', archiveStart);
  if (archiveStart < 0 || archiveMeta < 0) throw new Error('Fant ikke arkivruten.');
  const archiveEnd = content.indexOf('\n      }', archiveMeta);
  const archiveAction = content.slice(archiveMeta, archiveEnd).replace(/^/gm, '  ');
  replaceOnce(content.slice(archiveStart, archiveEnd), String.raw`      case "POST /api/sessions/archive": {
        const body = await readBody(req);
        const file = managedChatFile(body.file, SESSIONS_ROOT);
        if (!file || managedChatFile(file, TRASH_ROOT)) return json(res, 404, { error: "Fant ikke samtalen." });
        return await manageChat(res, file, () => {
${archiveAction}
        });`);
  const trashStart = content.indexOf('      case "DELETE /api/session": {');
  const trashStamp = content.indexOf('        const stamp = ', trashStart);
  if (trashStart < 0 || trashStamp < 0) throw new Error('Fant ikke papirkurvruten.');
  const trashEnd = content.indexOf('\n      }', trashStamp);
  const trashAction = content.slice(trashStamp, trashEnd).replace(/^/gm, '  ');
  replaceOnce(content.slice(trashStart, trashEnd), String.raw`      case "DELETE /api/session": {
        const resolved = managedChatFile(url.searchParams.get("file"), SESSIONS_ROOT);
        if (!resolved || managedChatFile(resolved, TRASH_ROOT)) return json(res, 404, { error: "Fant ikke samtalen." });
        return await manageChat(res, resolved, async () => {
${trashAction}
        });`);
  const restoreMarker = '      case "POST /api/trash/restore": {\n        const body = await readBody(req);\n        const file = body.file ? path.resolve(body.file) : "";';
  replaceOnce(restoreMarker, String.raw`      case "POST /api/trash/restore": {
        const body = await readBody(req);
        const file = managedChatFile(body.file, TRASH_ROOT);`);
}

const projectGitMarker = '/* OMP automatic Git for new projects */';
if (!content.includes(projectGitMarker)) {
  replaceOnce('const managingProjects = new Set();', 'const managingProjects = new Set();\nconst creatingProjects = new Set();');
  const createStart = content.indexOf('      case "POST /api/projects/create": {');
  const gitStart = content.indexOf('        // Create directory if it doesn\'t exist (use existing if it does)', createStart);
  const gitEnd = content.indexOf('        const proj = ', gitStart);
  if (createStart < 0 || gitStart < 0 || gitEnd < 0) throw new Error('Fant ikke opprettelse av prosjektmapper.');
  replaceOnce(content.slice(gitStart, gitEnd), String.raw`        ${projectGitMarker}
        let git = "unchanged";
        const key = managedProjectKey(dir);
        if (creatingProjects.has(key)) return json(res, 409, { error: "Prosjektmappen opprettes allerede." });
        if (!fs.existsSync(dir)) {
          try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {
            return json(res, 500, { error: "Kunne ikke opprette mappe: " + e.message });
          }
          creatingProjects.add(key);
          try {
            const repo = await runGit(dir, ["rev-parse", "--git-dir"], 5000);
            if (repo.code === 0) git = "inherited";
            else if (/not a git repository/i.test(repo.stderr)) {
              const init = await runGit(dir, ["init"], 10000);
              git = init.code === 0 ? "initialized" : "unavailable";
            } else git = "unavailable";
          } finally { creatingProjects.delete(key); }
          if (git === "unavailable") log("warn", "Kunne ikke starte Git-sporing for ny prosjektmappe.");
        }
        const list = loadProjects();
        const registered = list.find(project => samePath(project.path, dir));
        if (registered) return json(res, 200, { ok: true, project: registered, git });
`);
  const projectResponse = content.indexOf('        return json(res, 200, { ok: true, project: proj });', createStart);
  if (projectResponse < 0) throw new Error('Fant ikke svaret for ny prosjektmappe.');
  const oldResponse = '        return json(res, 200, { ok: true, project: proj });';
  content = content.slice(0, projectResponse) + '        return json(res, 200, { ok: true, project: proj, git });' +
    content.slice(projectResponse + oldResponse.length);
}

const checkMarker = '/* OMP shared project checks */';
if (!content.includes(checkMarker)) {
  replaceOnce('      case "GET /api/omp/turns":\n      case "GET /api/omp/turn-diff":', String.raw`      case "GET /api/omp/turns":
      case "POST /api/omp/turn-check":
      case "GET /api/omp/turn-diff":`);
  replaceOnce('          return json(res, 200, { cards: turnChanges.list(file), todos: turnModule.todoFromEntries(entriesFor(file)) });\n        }', String.raw`          return json(res, 200, {
            cards: turnChanges.list(file), todos: turnModule.todoFromEntries(entriesFor(file)), checks: turnChanges.checks(file)
          });
        }
        ${checkMarker}
        if (route === "POST /api/omp/turn-check") {
          const userTurns = toAppMessages(entriesFor(file)).filter(item => item.role === "user").length;
          if (body.check?.userIndex > userTurns) return json(res, 400, { error: "Fant ikke svaret for denne testkjøringen." });
          try { return json(res, 200, { check: turnChanges.saveCheck(file, body.check) }); }
          catch (error) { return json(res, 400, { error: error.message }); }
        }`);
}

const temporary = output + '.turns-check.mjs';
try {
  fs.writeFileSync(temporary, content);
  execFileSync(process.execPath, ['--check', temporary], { stdio: 'inherit' });
  if (install && fs.readFileSync(source, 'utf8') !== content) {
    fs.copyFileSync(source, source + '.backup-turn-changes-' + Date.now(), fs.constants.COPYFILE_EXCL);
  }
  fs.copyFileSync(moduleSource, path.join(path.dirname(output), moduleName));
  fs.renameSync(temporary, output);
  console.log('Bridge-patch validert: ' + output);
} finally { fs.rmSync(temporary, { force: true }); }
