const { setTimeout: delay } = require('node:timers/promises');

class Bridge {
  constructor(address, token) {
    const url = new URL(address);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || !token) throw new Error('Oppgi en adresse til den lokale bridgen og et paringstoken.');
    this.origin = url.origin;
    this.token = token;
  }

  async response(route, query, body, signal, method = body === undefined ? 'GET' : 'POST') {
    const url = new URL(route, this.origin);
    const installing = route === '/api/adb/install' || body?.action === 'install-skill' ||
      (body?.action === 'enable' && body?.target === 'device-control');
    for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
    const response = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + this.token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal || AbortSignal.timeout(['/api/prompt', '/api/model'].includes(route) ? 540000 : installing ? 120000 : 70000),
      redirect: 'error'
    }).catch(error => {
      if (signal?.aborted) throw error;
      const code = error.cause?.code || error.name;
      throw new Error('Kunne ikke koble til OMP Bridge på ' + this.origin + ' (' + code + ').', { cause: error });
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const error = new Error(result.error || 'OMP Bridge svarte med HTTP ' + response.status + '.');
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async get(route, query) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await (await this.response(route, query)).json(); }
      catch (error) {
        if (!error.cause || attempt === 2) throw error;
        await delay(200 * (attempt + 1));
      }
    }
  }

  async post(route, body) {
    return (await this.response(route, null, body)).json();
  }

  async delete(route, query) {
    return (await this.response(route, query, undefined, undefined, 'DELETE')).json();
  }

  async subscribe(cwd, handle, signal, file) {
    while (!signal.aborted) {
      try {
        const response = await this.response('/api/events', { cwd, ...(file && { file }) }, undefined, signal);
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let index;
          while ((index = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (line.startsWith('data: ')) {
              let frame;
              try { frame = JSON.parse(line.slice(6)); } catch { continue; }
              handle(frame);
            }
          }
          if (buffer.length > 4 * 1024 * 1024) throw new Error('For stor bridge-hendelse.');
        }
      } catch {
        if (!signal.aborted) handle({ type: 'bridge_reconnecting' });
      }
      await delay(1500, undefined, { signal }).catch(() => {});
    }
  }
}

module.exports = { Bridge };
