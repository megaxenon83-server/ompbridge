const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Recomputing the catalogue revision re-reads config files and queries SQLite,
// and getRuntime() used to do it on every request (including each /api/state
// poll). Cache it and only re-hash when one of the inputs changed.
const cachedRevisions = new Map();

function catalogueRevision(directory) {
  let stamp = '';
  for (const name of ['models.yml', 'config.yml', 'auth.json', 'agent.db', 'agent.db-wal']) {
    try {
      const stat = fs.statSync(path.join(directory, name), { throwIfNoEntry: false });
      if (stat) stamp += name + ':' + stat.mtimeMs + ':' + stat.size + ';';
    } catch {}
  }
  const cached = cachedRevisions.get(directory);
  if (cached && cached.stamp === stamp) return cached.revision;
  const revision = computeRevision(directory);
  cachedRevisions.set(directory, { stamp, revision });
  return revision;
}

function computeRevision(directory) {
  const hash = createHash('sha256');
  for (const name of ['models.yml', 'config.yml', 'auth.json']) {
    try { hash.update(fs.readFileSync(path.join(directory, name))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const file = path.join(directory, 'agent.db');
  if (fs.existsSync(file)) {
    let db;
    try {
      db = new (require('node:sqlite').DatabaseSync)(file, { readOnly: true, timeout: 1000 });
      const table = db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'auth_credentials'").get();
      if (table) hash.update(JSON.stringify(db.prepare(
        'SELECT id, provider, credential_type, data, disabled_cause FROM auth_credentials ORDER BY id'
      ).all()));
    } catch {
      for (const name of [file, file + '-wal']) {
        const stat = fs.statSync(name, { throwIfNoEntry: false });
        if (stat) hash.update(String(stat.mtimeMs) + ':' + stat.size);
      }
    } finally { db?.close(); }
  }
  return hash.digest('hex');
}

module.exports = { catalogueRevision };
