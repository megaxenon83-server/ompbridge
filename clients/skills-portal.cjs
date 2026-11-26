const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const pages = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['portal.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['portal.css', 'text/css; charset=utf-8']]
]);
const actions = new Set(['catalog', 'skill-library', 'preview-skill', 'install-skill', 'set-skill',
  'rollback-skill', 'remove-skill', 'write-lock', 'save-pack', 'try-skill']);

function createSkillsPortal() {
  const grants = new Map();
  let listening;
  let origin;
  const server = http.createServer(async (req, res) => {
    const send = (status, data, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, {
        'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
      });
      res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    try {
      if (!origin || req.headers.host !== new URL(origin).host || !req.url.startsWith('/')) return send(403, { error: 'Lokal adresse kreves.' });
      const route = new URL(req.url, origin);
      const page = pages.get(route.pathname);
      if (req.method === 'GET' && page) {
        return send(200, await fs.readFile(path.join(__dirname, 'skills-portal', page[0])), page[1]);
      }
      if (req.method !== 'POST' || route.pathname !== '/api') return send(404, { error: 'Ukjent side.' });
      const grant = grants.get(req.headers['x-omp-page']);
      if (!grant || grant.expires < Date.now() || req.headers.origin !== origin ||
          !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
        return send(403, { error: 'Åpne Skills på nytt fra OMP Desktop.' });
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 65536) return send(413, { error: 'Forespørselen er for stor.' });
      }
      const input = JSON.parse(body);
      if (!input || !actions.has(input.action)) return send(400, { error: 'Ukjent handling.' });
      grant.expires = Date.now() + 90 * 60 * 1000;
      send(200, await grant.handle(input));
    } catch (error) { if (!res.headersSent) send(400, { error: error.message }); }
  });
  return {
    async open(handle) {
      listening ||= new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          origin = 'http://127.0.0.1:' + server.address().port;
          resolve();
        });
      });
      await listening;
      for (const [id, item] of grants) if (item.expires < Date.now()) grants.delete(id);
      if (grants.size >= 16) grants.delete(grants.keys().next().value);
      const secret = randomBytes(32).toString('hex');
      grants.set(secret, { handle, expires: Date.now() + 90 * 60 * 1000 });
      return origin + '/#' + secret;
    },
    close() { grants.clear(); server.close(); server.closeAllConnections(); }
  };
}

module.exports = { createSkillsPortal };
