const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const catalog = require('./skill-catalog.cjs');

const revision = /^[a-f0-9]{40}$/;
const slug = /^[a-z0-9-]{1,100}$/;
const lockName = 'omp-skills.lock.json';
const normalize = cwd => process.platform === 'win32' ? path.resolve(cwd).toLowerCase() : path.resolve(cwd);
const key = cwd => createHash('sha256').update(normalize(cwd)).digest('hex');

function read(file, fallback) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Forventet en vanlig JSON-fil under 2 MiB.');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}

function createSkillLibrary(root, legacySettings) {
  const metadata = path.join(root, 'skill-library.json');
  const legacyFolder = cwd => path.join(root, key(cwd) + '.skills');
  const archive = (name, sha) => path.join(root, 'skill-revisions', sha, name);
  let mutations = Promise.resolve();

  function state() {
    return read(metadata, { global: {}, projects: {}, packs: {} });
  }

  function project(data, cwd) {
    const id = key(cwd);
    const info = data.projects[id] ||= { cwd, skills: {}, overrides: {}, removed: [] };
    for (const item of legacySettings(cwd).externalSkills || []) {
      if (!slug.test(item.name) || Object.hasOwn(Object.prototype, item.name) || !revision.test(item.sha) ||
          info.removed.includes(item.name) || Object.hasOwn(info.skills, item.name)) continue;
      info.skills[item.name] = { ...item, legacy: true, previous: [] };
    }
    return info;
  }

  function list(cwd, data = state()) {
    const current = project(data, cwd);
    const names = new Set([...Object.keys(data.global), ...Object.keys(current.skills)]);
    return [...names].sort().map(name => {
      const local = current.skills[name];
      const global = data.global[name];
      const selected = local || global;
      const override = current.overrides[name];
      const enabled = local ? !!local.enabled : override ?? !!global.enabled;
      return { name, ref: selected.ref, sha: selected.sha, kind: 'skill', source: 'skills.sh', enabled,
        detail: selected.ref + ' · ' + selected.sha.slice(0, 8), scope: local ? 'project' : 'global',
        local: local || null, global: global || null, override: override ?? null,
        folder: selected.legacy ? path.join(legacyFolder(cwd), name) : archive(name, selected.sha) };
    });
  }

  function scoped(input) {
    if (!['global', 'project'].includes(input.scope)) throw new Error('Velg prosjekt eller global installasjon.');
    return input.scope;
  }

  function records(items, maximum = 20) {
    if (!Array.isArray(items) || !items.length || items.length > maximum) throw new Error('Velg mellom 1 og ' + maximum + ' skills.');
    const names = new Set();
    return items.map(item => {
      const ref = catalog.parseRef(item.ref);
      const name = ref.split('/').at(-1);
      if (names.has(name) || !revision.test(item.sha || '') || typeof item.enabled !== 'boolean') {
        throw new Error('Oppsettet inneholder en duplikat eller en ugyldig revisjon.');
      }
      names.add(name);
      return { ref, sha: item.sha, enabled: item.enabled };
    });
  }

  function usages(data, name, known = []) {
    const folders = new Map([...Object.values(data.projects).map(item => item.cwd), ...known].map(cwd => [key(cwd), cwd]));
    return [...folders.values()].filter(cwd => fs.existsSync(cwd))
      .filter(cwd => list(cwd, data).some(skill => skill.name === name && skill.scope === 'global' && skill.enabled));
  }

  async function install(cwd, input, data, current, native) {
    const selected = catalog.selection(cwd, input.target);
    const scope = scoped({ scope: input.scope ?? 'project' });
    const target = scope === 'global' ? data.global : current.skills;
    if (native.includes(selected.name)) throw new Error('OMP har allerede en uavhengig skill med dette navnet i prosjektet.');
    const existing = target[selected.name];
    if (existing && existing.ref.toLowerCase() !== selected.ref.toLowerCase()) throw new Error('Dette navnet er allerede i bruk fra en annen kilde.');
    if (!existing || existing.sha !== selected.sha) {
      const dir = archive(selected.name, selected.sha);
      if (!fs.existsSync(path.join(dir, selected.name, 'SKILL.md'))) {
        await catalog.install(cwd, input.target, path.dirname(dir));
      }
      const previous = existing ? [existing, ...(existing.previous || [])].slice(0, 3)
        .map(({ ref, sha, legacy }) => ({ ref, sha, legacy })) : [];
      target[selected.name] = { name: selected.name, ref: selected.ref, sha: selected.sha, enabled: existing?.enabled ?? false, previous };
    }
    // A reviewed lock/pack may include saved activation state. New ordinary imports start disabled.
    if (typeof input.restoreEnabled === 'boolean') target[selected.name].enabled = input.restoreEnabled;
    return target[selected.name];
  }

  async function change(cwd, input, native, known) {
    const data = state();
    const current = project(data, cwd);
    const effective = list(cwd, data);
    const name = input.name;
    if (['set-skill', 'rollback-skill', 'remove-skill'].includes(input.action) &&
        (!slug.test(name || '') || Object.hasOwn(Object.prototype, name))) {
      throw new Error('Ugyldig skillnavn.');
    }
    let result;
    switch (input.action) {
      case 'install-skill':
        result = { skill: await install(cwd, input, data, current, native) };
        break;
      case 'set-skill': {
        const scope = scoped(input);
        const selected = scope === 'global' ? data.global[name] : current.skills[name];
        if (input.enabled !== null && typeof input.enabled !== 'boolean') throw new Error('Velg en gyldig status.');
        if (selected && typeof input.enabled === 'boolean') selected.enabled = input.enabled;
        else if (scope === 'project' && data.global[name] && !current.skills[name]) {
          if (input.enabled === null) delete current.overrides[name];
          else current.overrides[name] = input.enabled;
        } else throw new Error('Skillen er ikke installert i dette omfanget.');
        break;
      }
      case 'rollback-skill': {
        const table = scoped(input) === 'global' ? data.global : current.skills;
        const selected = table[name];
        const [prior, ...older] = selected?.previous || [];
        if (!prior) throw new Error('Ingen tidligere revisjon å gjenopprette.');
        table[name] = { ...selected, ...prior, previous: older, legacy: !!prior.legacy };
        break;
      }
      case 'remove-skill': {
        if (scoped(input) === 'global') {
          if (!data.global[name]) throw new Error('Skillen er ikke global.');
          const used = usages(data, name, known);
          if (JSON.stringify(used.sort()) !== JSON.stringify((Array.isArray(input.affected) ? input.affected : []).slice().sort())) {
            throw new Error('Prosjektlisten har endret seg. Gjennomgå avinstalleringen på nytt.');
          }
          delete data.global[name];
          for (const info of Object.values(data.projects)) delete info.overrides[name];
        } else {
          if (!current.skills[name]) throw new Error('Skillen er ikke installert i prosjektet.');
          delete current.skills[name];
          current.removed.push(name);
        }
        break;
      }
      case 'write-lock': {
        const file = path.join(cwd, lockName);
        read(file, null);
        const skills = effective.map(({ ref, sha, enabled }) => ({ ref, sha, enabled }));
        write(file, { format: 1, skills });
        result = { file: lockName, count: skills.length };
        break;
      }
      case 'save-pack': {
        const label = typeof input.label === 'string' ? input.label.trim() : '';
        if (!label || label.length > 80) throw new Error('Skriv et pakkenavn på 1–80 tegn.');
        const pack = { label, skills: records(input.skills), id: randomUUID() };
        data.packs[pack.id] = pack;
        result = { pack };
        break;
      }
      default: throw new Error('Ukjent skillhandling.');
    }
    write(metadata, data);
    return { ok: true, ...result };
  }

  return {
    list,
    summary(cwd, known) {
      const data = state();
      const items = list(cwd, data);
      let expected = [];
      let lockError = '';
      try {
        const lock = read(path.join(cwd, lockName), null);
        if (lock && (lock.format !== 1 || !Array.isArray(lock.skills))) throw new Error('Ukjent låsefilformat.');
        if (lock?.skills.length) expected = records(lock.skills, 1000);
      } catch (error) { lockError = error.message; }
      return { items: items.map(({ folder, ...item }) => ({
        ...item, affected: item.global ? usages(data, item.name, known) : []
      })), packs: Object.values(data.packs), lockError, lock: expected.map(item => ({
        ...item, matches: items.some(candidate => candidate.ref === item.ref && candidate.sha === item.sha && candidate.enabled === item.enabled)
      })) };
    },
    installedMarkdown(cwd, name, scope) {
      const data = state();
      const item = (scope === 'global' ? data.global : project(data, cwd).skills)[name];
      if (!item) return '';
      const dir = item.legacy ? path.join(legacyFolder(cwd), name) : archive(name, item.sha);
      return fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
    },
    change(cwd, input, native = [], known) {
      const next = mutations.then(() => change(cwd, input, native, known));
      mutations = next.catch(() => {});
      return next;
    }
  };
}

module.exports = { createSkillLibrary };
