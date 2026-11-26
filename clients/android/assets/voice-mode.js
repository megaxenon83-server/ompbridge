window.createVoiceMode = function createVoiceMode({ button, indicator, language, request, conversation, send, answer }) {
  let active;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const setStatus = text => { indicator.textContent = text; };
  const stop = () => {
    const mode = active;
    if (!mode) return;
    active = null;
    mode.stream?.getTracks().forEach(track => track.stop());
    mode.audio?.pause();
    mode.finishPlayback?.();
    mode.context?.close().catch(() => {});
    button.setAttribute('aria-pressed', 'false');
    setStatus('');
    request('/stop', {}).catch(() => {});
  };

  async function listen(mode, playback) {
    const frames = [];
    const samples = new Float32Array(mode.analyser.fftSize);
    let began = 0;
    let lastVoice = 0;
    let firstLoud = 0;
    mode.capture = frame => {
      frames.push(new Float32Array(frame));
      if (!began && frames.length * frame.length > mode.context.sampleRate / 2) frames.shift();
    };
    const started = performance.now();
    try {
      while (active === mode && conversation() === mode.conversation) {
        mode.analyser.getFloatTimeDomainData(samples);
        const level = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        const now = performance.now();
        if (playback?.done && !began) break;
        if (level > (playback && !began ? .032 : .018)) {
          if (!firstLoud) firstLoud = now;
          if (!began && (!playback || now - firstLoud >= 150)) {
            began = now;
            if (playback) {
              playback.interrupted = true;
              mode.audio?.pause();
              mode.finishPlayback?.();
              setStatus('Lytter …');
            }
          }
          if (began) lastVoice = now;
        } else firstLoud = 0;
        if (began && (now - lastVoice > 780 || now - began > 18000)) break;
        if (!playback && !began && now - started > 10000) break;
        await sleep(50);
      }
    } finally { mode.capture = null; }
    if (!began || !frames.length) return null;
    return wav(frames, mode.context.sampleRate);
  }

  function wav(frames, rate) {
    const length = frames.reduce((total, frame) => total + frame.length, 0);
    const data = new DataView(new ArrayBuffer(44 + length * 2));
    const label = (offset, text) => {
      for (let i = 0; i < text.length; i++) data.setUint8(offset + i, text.charCodeAt(i));
    };
    label(0, 'RIFF');
    data.setUint32(4, 36 + length * 2, true);
    label(8, 'WAVE');
    label(12, 'fmt ');
    data.setUint32(16, 16, true);
    data.setUint16(20, 1, true);
    data.setUint16(22, 1, true);
    data.setUint32(24, rate, true);
    data.setUint32(28, rate * 2, true);
    data.setUint16(32, 2, true);
    data.setUint16(34, 16, true);
    label(36, 'data');
    data.setUint32(40, length * 2, true);
    let offset = 44;
    for (const frame of frames) {
      for (const sample of frame) {
        data.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 32767, true);
        offset += 2;
      }
    }
    return new Blob([data.buffer], { type: 'audio/wav' });
  }

  async function base64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function start(mode) {
    const pack = await request('/local');
    if (!pack.ready) {
      if (!pack.installing && !window.confirm('Installere lokal tale på PC-en? Modellene lastes ned én gang.')) return;
      if (!pack.installing) await request('/local', {});
      setStatus('Installerer talepakken på PC-en …');
      while (active === mode) {
        await sleep(2000);
        const state = await request('/local');
        if (state.ready) break;
        if (!state.installing) throw new Error(state.error || 'Installasjonen ble avbrutt.');
      }
    }
    if (active !== mode) return;
    mode.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (active !== mode) { mode.stream.getTracks().forEach(track => track.stop()); return; }
    mode.context = new AudioContext();
    await mode.context.resume();
    mode.analyser = mode.context.createAnalyser();
    const source = mode.context.createMediaStreamSource(mode.stream);
    source.connect(mode.analyser);
    const processor = mode.context.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = event => mode.capture?.(event.inputBuffer.getChannelData(0));
    source.connect(processor);
    // Connecting keeps capture running. The processor's output stays silent.
    processor.connect(mode.context.destination);
    await request('/start', {});
    let interruption;
    while (active === mode && conversation() === mode.conversation) {
      setStatus('Lytter …');
      const recording = interruption || await listen(mode);
      interruption = null;
      if (!recording || active !== mode) continue;
      setStatus('Tolker talen …');
      let transcript;
      try {
        transcript = await request('/transcribe', { audio: await base64(recording), language: language.value });
      } catch (error) {
        if (/invalid data|invalid input|1094995529/i.test(error.message)) {
          setStatus('Lydopptaket kunne ikke leses. Prøv å si det igjen.');
          await sleep(1400);
          continue;
        }
        throw error;
      }
      const text = transcript.text?.trim();
      if (!text || active !== mode || conversation() !== mode.conversation) continue;
      setStatus('OMP tenker …');
      await send(text);
      let reply;
      const until = Date.now() + 180000;
      while (active === mode && conversation() === mode.conversation && Date.now() < until) {
        reply = answer(text);
        if (reply) break;
        await sleep(400);
      }
      if (active !== mode || conversation() !== mode.conversation) return;
      if (!reply) throw new Error('OMP ga ikke et svar i tide.');
      setStatus('Snakker …');
      const playback = { done: false, interrupted: false };
      const microphone = listen(mode, playback);
      try {
        for (const sentence of reply.match(/[^\n.!?]+[.!?]*|[.!?]+/g) || [reply]) {
          if (active !== mode || conversation() !== mode.conversation || playback.interrupted) break;
          const output = await request('/speak', { text: sentence, language: language.value, inline: true });
          if (active !== mode || playback.interrupted) break;
          mode.audio = new Audio('data:audio/wav;base64,' + output.audio);
          const played = new Promise(resolve => {
            mode.finishPlayback = resolve;
            mode.audio.onended = mode.audio.onerror = resolve;
          });
          try { await mode.audio.play(); }
          catch (error) { if (!playback.interrupted && active === mode) throw error; }
          await played;
          mode.audio = mode.finishPlayback = null;
        }
      } finally {
        playback.done = true;
        interruption = await microphone;
      }
    }
  }

  button.onclick = async () => {
    if (active) { stop(); return; }
    const id = conversation();
    if (!id) { setStatus('Åpne en delt samtale først.'); return; }
    const mode = { conversation: id };
    active = mode;
    button.setAttribute('aria-pressed', 'true');
    let failure;
    try { await start(mode); }
    catch (error) { failure = error.message; }
    finally {
      if (active === mode) {
        stop();
        if (failure) setStatus(failure);
      }
    }
  };
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden && active?.stream) stop(); });
  return { stop };
};
