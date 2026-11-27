'use strict';
// How many bytes a streamed answer costs on the bridge -> client wire.
//
// Mirrors the snapshot policy in windows/bridge/omp-bridge.mjs
// (OmpRuntime.snapshotDue): the bridge used to attach a full copy of the message
// so far to every token delta, which is quadratic in the answer length and forces
// the clients to re-render per copy.
//
// Run: node clients/scripts/stream-bandwidth.bench.cjs
const deltasPerSecond = 50;   // ~50 tokens/s, one frame per token
const charsPerDelta = 4;      // chars per token, mixed prose and code
const envelope = 120;         // JSON overhead per frame (ids, kind, trace, ...)

function simulate(chars, throttle) {
  const frames = Math.ceil(chars / charsPerDelta);
  const step = 1000 / deltasPerSecond;
  let streamed = 0;
  let snapshotAt = 0;
  let sinceSnapshot = 0;
  let bytes = 0;
  let snapshots = 0;
  for (let frame = 0; frame < frames; frame++) {
    const now = frame * step;
    streamed += charsPerDelta;
    sinceSnapshot += charsPerDelta;
    bytes += envelope;
    let include = true;
    if (throttle) {
      const interval = streamed < 16384 ? 150 : streamed < 65536 ? 500 : 2000;
      include = now - snapshotAt >= interval || sinceSnapshot >= 4096;
    }
    if (include) {
      bytes += streamed;   // partial.text + partial.segments copies of the message so far
      snapshots++;
      snapshotAt = now;
      sinceSnapshot = 0;
    }
  }
  return { bytes, snapshots, seconds: frames * step / 1000 };
}

console.log('answer size   | before (per-token snapshot) | after (throttled snapshots) | reduction');
for (const chars of [2000, 8000, 20000, 60000]) {
  const before = simulate(chars, false);
  const after = simulate(chars, true);
  console.log(
    String(chars).padStart(6) + ' chars | ' +
    (before.bytes / 1e6).toFixed(2).padStart(8) + ' MB, ' + String(before.snapshots).padStart(5) + ' copies | ' +
    (after.bytes / 1e6).toFixed(2).padStart(7) + ' MB, ' + String(after.snapshots).padStart(4) + ' copies | ' +
    (before.bytes / after.bytes).toFixed(1).padStart(6) + 'x'
  );
}
console.log('\n(one frame per token at ' + deltasPerSecond + ' tokens/s, ' + charsPerDelta + ' chars/token)');
