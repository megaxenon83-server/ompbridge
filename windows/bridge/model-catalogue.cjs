const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function catalogueRevision(directory) {
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
