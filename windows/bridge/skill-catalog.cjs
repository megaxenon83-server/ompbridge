const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const catalog = [
  ['vercel-labs/skills/find-skills', 'La OMP finne skills', 'Agenten foreslår relevante skills fra en OMP-samtale.'],
  ['vercel-labs/agent-browser/agent-browser', 'Nettleserautomatisering', 'Veiledning for å styre nettleseren.', 'agent-browser'],
  ['anthropics/skills/frontend-design', 'Frontend-design'],
  ['obra/superpowers/using-superpowers', 'Superpowers'],
  ['caidanw/skills/karpathy-guidelines', 'Karpathy Guidelines'],
  ['mattpocock/skills/grill-me', 'Krav og avklaringer'],
  ['mattpocock/skills/tdd', 'Testdrevet utvikling'],
  ['remotion-dev/skills/remotion-best-practices', 'Remotion'],
  ['microsoft/skills/azure-prepare', 'Azure'],
  ['hashicorp/agent-skills/terraform-style-guide', 'Terraform'],
  ['mattpocock/skills/code-review', 'Kodegjennomgang'],
  ['cloudflare/skills/workers-best-practices', 'Cloudflare Workers'],
  ['terminalskills/skills/ui-ux-pro-max', 'Design og UX']
].map(([ref, category, description, requires]) => ({ ref, category, description, requires }));
const previews = new Map();
const maxMarkdown = 256 * 1024;
const segment = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const portable = value => segment.test(value) && !value.endsWith('.') && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(value);

function parseRef(input) {
  if (typeof input !== 'string' || input.length > 350) throw new Error('Lim inn en gyldig skills.sh-lenke.');
  let ref = input.trim().replace(/^((?:npx\s+skills\s+add\s+)?["']?https)\\:/, '$1:');
  if (/^npx\s/.test(ref)) {
    const command = /^npx\s+skills\s+add\s+["']?(https:\/\/github\.com\/[\w.-]+\/[\w.-]+)["']?\s+--skill(?:\s+|=)["']?([a-z0-9-]+)["']?$/i.exec(ref);
    if (!command) throw new Error('Lim inn én skills.sh-lenke eller «npx skills add … --skill navn».');
    const url = new URL(command[1]);
    ref = url.pathname.slice(1).replace(/\.git$/i, '') + '/' + command[2];
  }
  if (ref.startsWith('https://')) {
    const url = new URL(ref);
    if (!['skills.sh', 'www.skills.sh'].includes(url.hostname) || url.username || url.password || url.port) {
      throw new Error('Bruk en lenke fra skills.sh.');
    }
    ref = url.pathname.replace(/^\/|\/$/g, '');
  }
  const parts = ref.split('/');
  if (parts.length !== 3 || !parts.every(portable) || !/^[a-z0-9-]+$/.test(parts[2]) ||
      Object.hasOwn(Object.prototype, parts[2])) throw new Error('Bruk en skills.sh-lenke til én GitHub-skill.');
  return parts.join('/');
}

async function download(url, limit) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'OMP-Desktop', Accept: 'application/json, text/plain, */*' } });
  if (!response.ok || !response.body) throw new Error('Kunne ikke hente originalkilden (HTTP ' + response.status + ').');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Kilden er for stor.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function markdown(repo, sha, entry) {
  const file = await download('https://raw.githubusercontent.com/' + repo + '/' + sha + '/' +
    entry.path.split('/').map(encodeURIComponent).join('/'), maxMarkdown);
  const digest = createHash('sha1').update('blob ' + file.length + '\0').update(file).digest('hex');
  if (digest !== entry.sha) throw new Error('Innholdet samsvarer ikke med GitHub-revisjonen.');
  return new TextDecoder('utf-8', { fatal: true }).decode(file);
}

async function preview(cwd, input, revision) {
  const ref = parseRef(input);
  const name = ref.split('/').at(-1);
  const repo = ref.slice(0, -(name.length + 1));
  const api = 'https://api.github.com/repos/' + repo;
  if (revision != null && !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Ugyldig GitHub-revisjon.');
  const sha = revision || JSON.parse(await download(api + '/commits/HEAD', 512 * 1024)).sha;
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('GitHub gav ingen gyldig revisjon.');
  const listing = JSON.parse(await download(api + '/git/trees/' + sha + '?recursive=1', 12 * 1024 * 1024));
  if (listing.truncated) throw new Error('Repoet er for stort til å finne skillen sikkert.');
  const candidates = listing.tree.filter(item => item.type === 'blob' && item.path.endsWith('/' + name + '/SKILL.md'));
  if (!candidates.length) candidates.push(...listing.tree.filter(item => item.type === 'blob' && item.path === name + '/SKILL.md'));
  if (listing.tree.some(item => item.path === 'SKILL.md' && item.type === 'blob')) {
    if (!candidates.length) candidates.push(listing.tree.find(item => item.path === 'SKILL.md'));
  }
  candidates.sort((a, b) => Number(b.path === 'skills/' + name + '/SKILL.md') -
    Number(a.path === 'skills/' + name + '/SKILL.md') || a.path.length - b.path.length);
  const entry = candidates[0];
  if (!entry || entry.mode === '120000') throw new Error('Fant ingen vanlig SKILL.md for ' + name + '.');
  const document = await markdown(repo, sha, entry);
  const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(document)?.[1] || '';
  const actual = /^name:\s*["']?([a-z0-9-]+)["']?\s*$/m.exec(header)?.[1];
  if (actual !== name) throw new Error('Navnet i SKILL.md samsvarer ikke med katalogen.');
  const prefix = entry.path.slice(0, -'SKILL.md'.length);
  const siblings = prefix ? listing.tree.filter(item => item.path.startsWith(prefix) && item.type === 'blob' && item.path !== entry.path) : [];
  const extras = siblings.filter(item => /^100(644|755)$/.test(item.mode) && item.size <= maxMarkdown &&
    item.path.endsWith('.md') && item.path.slice(prefix.length).split('/').every(portable)).slice(0, 40);
  for (const [id, item] of previews) if (Date.now() - item.created > 600000) previews.delete(id);
  if (previews.size >= 25) previews.delete(previews.keys().next().value);
  const ticket = randomUUID();
  const info = { cwd, ref, repo, name, sha, document, prefix, extras, created: Date.now() };
  previews.set(ticket, info);
  const recommended = catalog.find(item => item.ref === ref);
  const required = /^allowed-tools:\s*(.+)$/m.exec(header)?.[1];
  return { ticket, ref, name, sha, markdown: document, requires: recommended?.requires || required || '',
    files: extras.map(item => item.path.slice(prefix.length)),
    omitted: siblings.length - extras.length };
}

function selection(cwd, ticket) {
  const item = previews.get(ticket);
  if (!item || item.cwd !== cwd || Date.now() - item.created > 600000) throw new Error('Åpne forhåndsvisningen på nytt før installasjon.');
  return item;
}

async function install(cwd, ticket, directory, existing = []) {
  const item = selection(cwd, ticket);
  if (existing.includes(item.name)) throw new Error('Prosjektet har allerede en skill med dette navnet.');
  await fs.mkdir(directory, { recursive: true });
  const staging = await fs.mkdtemp(path.join(directory, 'import-'));
  const destination = path.join(staging, item.name);
  try {
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, 'SKILL.md'), item.document, { flag: 'wx' });
    for (let start = 0; start < item.extras.length; start += 5) {
      const results = await Promise.allSettled(item.extras.slice(start, start + 5).map(async entry => {
        const file = path.join(destination, ...entry.path.slice(item.prefix.length).split('/'));
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, await markdown(item.repo, item.sha, entry), { flag: 'wx' });
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
    const target = path.join(directory, item.name);
    await fs.rename(staging, target);
    previews.delete(ticket);
    return { name: item.name, ref: item.ref, sha: item.sha, enabled: false };
  } finally { await fs.rm(staging, { force: true, recursive: true }); }
}

module.exports = { catalog, parseRef, preview, selection, install };
