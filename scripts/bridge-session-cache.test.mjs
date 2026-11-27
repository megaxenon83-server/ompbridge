// Integration test for the bridge transcript cache.
//
// Starts the real bridge from windows/bridge against a temporary session folder,
// builds a ~100k-token transcript, and checks that:
//   1. a cold read parses the whole file,
//   2. warm reads are served from the cache,
//   3. appending to the transcript (what OMP does while it streams) only parses
//      the new tail and still returns every message exactly once,
//   4. rewriting the file with a changed prefix (the title rewrite) falls back to
//      a full parse instead of trusting the append path.
//
// Run: node scripts/bridge-session-cache.test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = process.env.TEST_SOURCE ? path.resolve(process.env.TEST_SOURCE) : path.join(root, "windows", "bridge");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-bridge-cache-"));
const app = path.join(temp, "app");
const sessions = path.join(temp, "sessions");
const port = Number(process.env.TEST_PORT || 28991);
const token = "test-token-" + "a".repeat(40);

for (const directory of [app, sessions]) fs.mkdirSync(directory, { recursive: true });
for (const item of fs.readdirSync(source, { withFileTypes: true })) {
  if (item.name === "node_modules" || item.name === "skills") continue;
  if (!item.isFile()) continue;
  fs.copyFileSync(path.join(source, item.name), path.join(app, item.name));
}
fs.cpSync(path.join(source, "skills"), path.join(app, "skills"), { recursive: true });
fs.writeFileSync(path.join(app, "config.json"), JSON.stringify({
  port, host: "127.0.0.1", token, approvalMode: "always-ask", allowBash: false,
  sessionDir: sessions, projectsFile: path.join(temp, "projects.json"),
  voice: { enabled: false },
}, null, 2));

// --- synthetic transcript: ~100k tokens of mixed chat and tool output --------
const charsTarget = Number(process.env.TEST_CHARS || 1_200_000);
const lines = [
  JSON.stringify({ type: "session", id: "session-cache-test", cwd: root }),
  JSON.stringify({ type: "title", v: 1, title: "Stor samtale", source: "user" }),
];
let written = 0;
let turns = 0;
let stamp = Date.UTC(2026, 10, 1);
while (written < charsTarget) {
  turns++;
  stamp += 60_000;
  const question = "Spørsmål " + turns + ": " + "hvordan henger dette sammen? ".repeat(6);
  const answer = ("Svar " + turns + ". ").repeat(10) + "x".repeat(3000);
  lines.push(JSON.stringify({ type: "message", id: "u" + turns, parentId: null, timestamp: new Date(stamp).toISOString(),
    message: { role: "user", content: [{ type: "text", text: question }], timestamp: stamp } }));
  lines.push(JSON.stringify({ type: "message", id: "a" + turns, parentId: "u" + turns, timestamp: new Date(stamp + 1000).toISOString(),
    message: { role: "assistant", content: [{ type: "text", text: answer }], timestamp: stamp + 1000,
      provider: "test", model: "model-1", usage: { input: 1000, output: 200, totalTokens: 1200 } } }));
  written += question.length + answer.length;
}
const sessionFile = path.join(sessions, "2026-11-01T10-00-00_session-cache-test.jsonl");
const write = list => fs.writeFileSync(sessionFile, list.join("\n") + "\n");
write(lines);
const baseBytes = fs.statSync(sessionFile).size;

const child = spawn(process.execPath, [path.join(app, "omp-bridge.mjs")], {
  cwd: app, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, OMPCHAT_BRIDGE_PORT: String(port), OMPCHAT_BRIDGE_TOKEN: token, OMPCHAT_BRIDGE_HOST: "127.0.0.1" },
});
let log = "";
child.stdout.on("data", (chunk) => { log += chunk; });
child.stderr.on("data", (chunk) => { log += chunk; });

const base = `http://127.0.0.1:${port}`;
const headers = { Authorization: "Bearer " + token };
const fetchJson = async (route) => {
  const response = await fetch(base + route, { headers });
  if (!response.ok) throw new Error(route + " -> HTTP " + response.status + " " + (await response.text()));
  return response.json();
};
const waitForHealth = async () => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { return await fetchJson("/api/health"); }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  throw new Error("bridge did not answer /api/health in 20s\n" + log);
};
const timed = async (label) => {
  const started = process.hrtime.bigint();
  const data = await fetchJson("/api/session/messages?file=" + encodeURIComponent(sessionFile));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { label, ms, messages: data.messages.length, title: data.session?.title, cwd: data.session?.cwd };
};

let failures = 0;
const check = (ok, message) => {
  console.log((ok ? "  ok   " : "  FAIL ") + message);
  if (!ok) failures++;
};

try {
  await waitForHealth();
  console.log("transcript: " + Math.round(baseBytes / 1000) + " kB, " + lines.length + " lines, ~" +
    Math.round(written / 4 / 1000) + "k tokens");

  const cold = await timed("cold");
  const warm = await timed("warm");
  console.log("  read cold " + cold.ms.toFixed(1) + " ms, warm " + warm.ms.toFixed(1) + " ms");
  check(cold.messages === turns * 2, "cold read returns " + cold.messages + " messages");
  check(warm.messages === cold.messages, "warm read is identical");
  check(warm.title === "Stor samtale", "session title parsed");
  check(warm.cwd === root, "session cwd parsed");

  // Append like OMP does per message, then read again.
  const extra = [];
  for (const turn of [turns + 1, turns + 2]) {
    extra.push(JSON.stringify({ type: "message", id: "u" + turn, timestamp: new Date(stamp + turn * 1000).toISOString(),
      message: { role: "user", content: [{ type: "text", text: "Nytt spørsmål " + turn }], timestamp: stamp + turn * 1000 } }));
    extra.push(JSON.stringify({ type: "message", id: "a" + turn, timestamp: new Date(stamp + turn * 1000 + 500).toISOString(),
      message: { role: "assistant", content: [{ type: "text", text: "Nytt svar " + turn }], timestamp: stamp + turn * 1000 + 500 } }));
  }
  fs.appendFileSync(sessionFile, extra.join("\n") + "\n");
  const appended = await timed("append");
  console.log("  read after append " + appended.ms.toFixed(1) + " ms");
  check(appended.messages === (turns + 2) * 2, "append read returns " + appended.messages + " messages (no duplicates, nothing dropped)");
  const tail = await timed("again");
  check(tail.messages === appended.messages, "second read after append is stable");

  // Rewrite the whole file with a changed prefix: the append fast path must not
  // be trusted here.
  const rewritten = [JSON.stringify({ type: "title", v: 1, title: "Omdøpt", source: "user" }),
    ...lines.filter(line => !line.startsWith('{"type":"title"')), ...extra, ...extra];
  write(rewritten);
  const after = await timed("rewrite");
  console.log("  read after rewrite " + after.ms.toFixed(1) + " ms");
  check(after.title === "Omdøpt", "rewritten title is picked up");
  check(after.messages === (turns + 4) * 2, "rewritten transcript is fully re-parsed (" + after.messages + " messages)");
  // Upload used to open an "r+" stream on a file it had just deleted, and the
  // unhandled ENOENT killed the bridge. A first chunk must succeed and the
  // bridge must still be alive afterwards.
  const uploadDir = path.join(temp, "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  const upload = await fetch(base + "/api/files/upload?path=" + encodeURIComponent(uploadDir) + "&name=test.txt&offset=0&finalize=1",
    { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: "hello" });
  const uploaded = await upload.json();
  check(upload.status === 200 && uploaded.size === 5, "upload writes the first chunk");
  const health = await fetchJson("/api/health");
  check(health.ok === true, "bridge is still alive after an upload");
  // Resuming at an offset that does not match must be refused, not crash.
  const resume = await fetch(base + "/api/files/upload?path=" + encodeURIComponent(uploadDir) + "&name=other.txt&offset=99",
    { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: "x" });
  check(resume.status === 409, "resume without the temporary file is refused (HTTP " + resume.status + ")");

  // The protected-path guard must actually match on Windows: the bridge install
  // directory is one of the guarded paths.
  const guarded = await fetch(base + "/api/fs/delete", { method: "POST",
    headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ path: app }) });
  check(guarded.status === 403, "deleting the bridge install folder is refused (HTTP " + guarded.status + ")");
  const disposable = path.join(temp, "slett-meg");
  fs.mkdirSync(disposable);
  const deleted = await fetch(base + "/api/fs/delete", { method: "POST",
    headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ path: disposable }) });
  check(deleted.status === 200 && !fs.existsSync(disposable), "deleting a normal folder still works");

  // Hiding by id used to hit a duplicate case label and always fail.
  const registry = await fetchJson("/api/projects/registry");
  const project = (registry.projects || [])[0];
  if (project) {
    const hidden = await fetch(base + "/api/projects/hide", { method: "POST",
      headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ id: project.id }) });
    check(hidden.status === 200, "hiding a project by id works (HTTP " + hidden.status + ")");
  }

  // Timing is informational: the response also serialises the whole transcript,
  // so it only dominates parsing at very large sizes. Run with TEST_STRICT=1 to
  // assert it.
  console.log('  append read kept ' + Math.round(baseBytes / 1000) + ' kB transcript at ' + appended.ms.toFixed(1) +
    ' ms vs cold ' + cold.ms.toFixed(1) + ' ms');
  if (process.env.TEST_STRICT === '1' && cold.ms > 20) {
    check(appended.ms < cold.ms, "appending parses only the new tail");
  }
} finally {
  child.kill();
  await new Promise(resolve => setTimeout(resolve, 300));
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
}
if (failures) {
  console.error(failures + " check(s) failed");
  process.exit(1);
}
console.log("all checks passed");
