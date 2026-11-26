const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const vm = require('node:vm');

test('speech during playback stops audio and forwards the interruption as the next message', async () => {
  const button = { setAttribute() {} };
  const indicator = {};
  const messages = [];
  let clock = 100;
  let playbackAt = 0;
  let paused = false;
  let spoken = 0;
  let stopped = false;
  const processor = { connect() {} };
  const analyser = {
    fftSize: 32,
    getFloatTimeDomainData(samples) {
      const speaking = !playbackAt ? clock < 300 : clock > playbackAt && clock < playbackAt + 375;
      samples.fill(speaking ? .12 : 0);
    }
  };
  const context = {
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    setTimeout: callback => setImmediate(() => {
      clock += 50;
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(800).fill(.12) } });
      callback();
    }),
    performance: { now: () => clock },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { stopped = true; } }] }) } },
    AudioContext: class {
      sampleRate = 16000;
      async resume() {}
      async close() {}
      createAnalyser() { return analyser; }
      createScriptProcessor() { return processor; }
      createMediaStreamSource() { return { connect() {} }; }
    },
    Audio: class {
      async play() { playbackAt = clock; }
      pause() { paused = true; }
    },
    FileReader: class {
      async readAsDataURL(blob) {
        this.result = 'data:audio/wav;base64,' + Buffer.from(await blob.arrayBuffer()).toString('base64');
        this.onload();
      }
    },
    Blob
  };
  vm.runInNewContext(readFileSync(require.resolve('../android/assets/voice-mode.js'), 'utf8'), context);
  let mode;
  mode = context.window.createVoiceMode({
    button, indicator, language: { value: 'no' },
    conversation: () => 'test',
    request: async (route, body) => {
      if (route === '/local') return { ready: true };
      if (route === '/transcribe') {
        const wav = Buffer.from(body.audio.split(',')[1], 'base64');
        assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
        assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
        assert.equal(wav.readUInt32LE(24), 16000);
        assert.equal(wav.readUInt32LE(40), wav.length - 44);
        assert(wav.length > 44);
        return { text: messages.length ? 'Vent litt' : 'Hei OMP' };
      }
      if (route === '/speak') { spoken++; return { audio: 'AA==' }; }
    },
    send: async text => {
      messages.push(text);
      if (messages.length === 2) mode.stop();
    },
    answer: () => 'Her kommer det første svaret. Denne setningen skal ikke spilles.'
  });
  const deadline = new AbortController();
  try {
    await Promise.race([
      button.onclick(),
      delay(2000, undefined, { signal: deadline.signal }).then(() => { throw new Error('Timed out'); })
    ]);
    assert.deepEqual(messages, ['Hei OMP', 'Vent litt']);
    assert.equal(spoken, 1);
    assert.equal(paused, true);
    assert.equal(stopped, true);
  } finally {
    deadline.abort();
    mode.stop();
  }
});
