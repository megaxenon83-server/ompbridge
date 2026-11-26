const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

class OmpSession {
  constructor(executable, cwd, sessionFile, onEvent, environment = {}, extraArgs = []) {
    this.pending = new Map();
    this.nextId = 0;
    this.diagnostics = '';
    const args = ['--mode', 'rpc', ...extraArgs];
    if (sessionFile) args.push('--resume', sessionFile);
    this.process = spawn(executable, args, { cwd, env: { ...process.env, ...environment }, windowsHide: true });
    this.closed = new Promise(resolve => this.process.once('close', resolve));
    this.process.stderr.setEncoding('utf8').on('data', chunk => {
      this.diagnostics = (this.diagnostics + chunk).slice(-4000);
    });
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('OMP svarte ikke innen tidsfristen.'));
        this.close();
      }, 30000);
      const fail = error => {
        clearTimeout(timer);
        reject(error);
        this.failure = error;
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
      };
      this.process.on('error', fail);
      this.process.stdin.on('error', fail);
      this.process.on('close', code => {
        fail(new Error(`OMP avsluttet (${code ?? 'stoppet'}). ${this.diagnostics}`));
        if (!this.closing) onEvent({ type: 'disconnected', error: `OMP avsluttet (${code}). ${this.diagnostics}` });
      });
      createInterface({ input: this.process.stdout }).on('line', line => {
        let frame;
        try { frame = JSON.parse(line); } catch { return; }
        if (frame.type === 'ready') {
          this.maxFrameBytes = frame.maxFrameBytes || 1048576;
          clearTimeout(timer);
          resolve();
        } else if (frame.type === 'response') {
          const request = this.pending.get(frame.id);
          this.pending.delete(frame.id);
          if (frame.success) request?.resolve(frame.data);
          else if (request) request.reject(new Error(frame.error || 'OMP avviste forespørselen.'));
          else if (!this.closing) onEvent({ type: 'rpc_error', command: frame.command, error: frame.error });
        } else if (!this.closing) {
          if (this.commandOutput && frame.type === 'command_output') this.commandOutput.push(frame.text || '');
          else onEvent(frame);
        }
      });
    });
  }

  async localCommand(message) {
    if (this.commandOutput) throw new Error('OMP kjører allerede en administrasjonskommando.');
    const output = [];
    this.commandOutput = output;
    try {
      const result = await this.request('prompt', { message });
      if (result?.agentInvoked !== false) throw new Error('OMP svarte ikke med en lokal kommando.');
      return output.join('\n');
    } finally { this.commandOutput = null; }
  }

  async send(type, fields = {}) {
    await this.ready;
    if (this.failure) throw this.failure;
    const frame = JSON.stringify({ ...fields, type }) + '\n';
    if (Buffer.byteLength(frame) > this.maxFrameBytes) throw new Error('Meldingen er for stor for OMP.');
    this.process.stdin.write(frame);
  }

  async request(type, fields = {}) {
    await this.ready;
    const id = String(++this.nextId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OMP svarte ikke på ${type}.`));
      }, 90000);
      this.pending.set(id, {
        resolve: data => { clearTimeout(timer); resolve(data); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.send(type, { ...fields, id }).catch(error => {
        this.pending.get(id)?.reject(error);
        this.pending.delete(id);
      });
    });
  }

  close() {
    if (this.closing) return this.closed;
    this.closing = true;
    this.process.stdin.end();
    const timer = setTimeout(() => { if (this.process.exitCode === null) this.process.kill(); }, 3000);
    timer.unref();
    this.closed.then(() => clearTimeout(timer));
    return this.closed;
  }
}

module.exports = { OmpSession };
