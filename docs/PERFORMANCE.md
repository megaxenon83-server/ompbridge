# Why the apps get slow in long conversations

This is the analysis behind the performance pass in the "Unreleased" changelog
entry. It explains what was slow, why it got worse with context length, what was
changed and what is still worth doing.

## Symptom

OMP Desktop and Chat OMP OMP become unusably slow while OMP is answering in a
conversation with a large context (roughly above 100k tokens). The model itself is
also slower there — prefill cost grows with the prompt — but the UI stops
responding independently of the model: typing lags, scrolling stutters and the
phone heats up while the answer streams.

## Root causes

Measured with `node clients/scripts/context-perf.bench.cjs` (real `turn-ui.js`
against a DOM shim) and `node clients/scripts/stream-bandwidth.bench.cjs`.

### 1. The whole transcript was rebuilt on every animation frame

`renderConversation()` (Desktop) and `render()` (Android) called
`container.replaceChildren()` and then re-created every message, tool block, card
and action row. Both were driven from `message_delta` inside a
`requestAnimationFrame`, so the work happened up to 60 times per second.

At a 100k-token conversation (≈400k characters, 266 messages) one frame was
**1 287 DOM nodes and 382 000 characters of text**. That is the direct reason the
app degrades as the conversation grows: the per-frame cost is linear in context,
at 60 fps.

Two smaller hotspots in the same path:

- `turn-ui.js timeline()` built a de-duplication key with
  `JSON.stringify([role, timestamp, text])` for **every** user/assistant message on
  **every** frame, so the full transcript text was serialised 60 times per second.
- `usageTotals()` re-summed usage over the whole history on every frame, and
  `conversationScroll.restore()` looked its anchor up with a `querySelector` scan
  over all rows.

### 2. Every streamed token carried a full copy of the message

`OmpRuntime.onFrame('message_update')` attached
`partial: summariseAssistant(...)` — a complete copy of the text and segments
accumulated so far — to **every** `text_delta`. The payload is therefore
quadratic in the answer length:

| answer | before | after |
| --- | --- | --- |
| 8k chars | 8.2 MB | 1.2 MB |
| 20k chars | 50.6 MB | 5.4 MB |
| 60k chars | 452 MB | 23 MB |

Every one of those copies also made the clients re-render (cause 1), so the bytes
and the rendering multiplied each other.

### 3. Android crossed the JNI boundary and compiled JS once per token

`MainActivity.subscribe()` called `web.evaluateJavascript("window.onBridgeEvent(" + JSONObject.quote(frame) + ")")`
for every SSE event, through `runOnUiThread`. Each token therefore cost a
UI-thread hop, a JSON string escape of the whole frame, and a fresh script
compilation in the WebView.

### 4. Quadratic string scanning in the stream parsers

`OmpRuntime.onStdout()` re-scanned and re-copied the buffer for every line
(`indexOf("\n")` from 0 + `slice` per line), and `clients/bridge.cjs` did the same
per SSE line. With large frames this is O(n²) in the frame size.

### 5. Transcript files were re-parsed whole on every change

`entriesFor()`/`loadSession()` re-read and re-parsed the entire session JSONL
whenever mtime/size moved — i.e. after every message, for every
`/api/session/messages`, `/api/omp/turns`, `/api/state` consumer. OMP only ever
appends, so almost all of that work was redundant.

### 6. Workspace snapshots ran synchronously on every tool call

`turnChanges.observe()` returns true for any modifying tool *and* every `bash`
command, which called `finishTurn()` → `capture()`: `spawnSync('git ls-files')`,
then `readFileSync` + SHA-256 of up to 1 400 files / 32 MB, then one
`spawnSync('git diff')` per changed file. All of it on the event loop, so SSE
deltas, heartbeats and `/api/state` stalled while OMP worked. The desktop copy
(`clients/turn-changes.cjs`) did the same on the Electron main thread, freezing
the window itself.

## What changed

- `clients/android/assets/turn-ui.js`: new `syncRows()` reconciliation (keep
  unchanged rows, rebuild the changed tail), cached de-duplication keys, memoised
  usage totals, scroll anchors keeping their element.
- `clients/app.js`, `clients/android/assets/mobile.js`: render through
  `syncRows()`; tool `details` open state is tracked instead of queried.
- `windows/bridge/omp-bridge.mjs`: `snapshotDue()` rate-limits partial snapshots
  (150 ms / 500 ms / 2 s as the answer grows; always at tool-call boundaries),
  incremental JSONL parsing with a verified append fast path, memoised
  `toAppMessages()`, linear stdout framing.
- `clients/bridge.cjs`: linear SSE framing.
- `clients/android/src/net/nimay/chatompomp/MainActivity.java`: frames are queued
  and delivered in one `window.onBridgeBatch([...])` call every ~32 ms.
- `windows/bridge/omp-turn-changes.cjs` (+ `clients/turn-changes.cjs`): file
  contents are reused by mtime/size stamp; live cards are refreshed at most every
  2.5 s instead of after every tool call.

Result: one frame at a 100k-token context now creates **15 nodes and 4k
characters** instead of 1 287 nodes and 382k characters.

## Remaining work worth doing

1. **Encode only once.** Deltas could be applied by identity (`messageId` +
   `contentIndex`) instead of re-rendering rows at all, and the bridge could send
   an explicit "text reset" marker instead of snapshots.
2. **Don't ship the whole transcript on every turn.** `/api/session/messages`
   returns all messages as JSON; an incremental `since=<entryIndex>` variant would
   cut the 60–100 ms/turn serialisation cost at large contexts.
3. **Virtualise very long conversations** (render only visible rows). Not needed
   at 400k characters any more, but it is the next ceiling.
4. **Move workspace snapshots off the main thread.** The desktop's local
   turn-changes snapshot (`clients/turn-changes.cjs`) and the bridge's diff step
   still run `spawnSync('git diff')` synchronously on the event loop / main
   process; they are throttled and content-cached now, but not yet async.

(Items that were also fixed in the same pass and are no longer open: SSE
backpressure (progress is dropped while a client is congested), `runGit()` output
cap, `catalogueRevision()`/`signature()` memoisation, the transcript-cache size
bound, and the double live-stream subscription in Desktop.)

## How to verify

```bash
node clients/scripts/context-perf.bench.cjs      # render cost per frame
node clients/scripts/stream-bandwidth.bench.cjs  # bytes per streamed answer
node --test clients/scripts/turn-ui-rows.test.cjs
node scripts/bridge-session-cache.test.mjs       # real bridge, real transcript
```

`scripts/bridge-session-cache.test.mjs` starts the bridge from `windows/bridge`
on a spare port against a temporary session folder, builds a ~300k-token
transcript and checks cold/warm/append/rewrite reads, upload, protected paths and
project hiding. Stop the installed bridge (port 27778) before running a modified
one by hand.
