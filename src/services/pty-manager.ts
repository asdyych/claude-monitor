// PtyManager - singleton service managing all node-pty instances
import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { ManagedProcess, SpawnOptions } from '@/types/managed-process';

const BUFFER_MAX_BYTES = 50 * 1024; // 50KB ring buffer per process

interface PtyEntry {
  pty: pty.IPty;
  process: ManagedProcess;
  outputBuffer: string;
  emitter: EventEmitter;
}

// Use globalThis to survive Next.js HMR module re-evaluation
const _g = globalThis as typeof globalThis & { __ptyManagerInstance?: PtyManager };

export class PtyManager {
  private processes = new Map<string, PtyEntry>();
  private globalEmitter = new EventEmitter();

  private constructor() {
    this.globalEmitter.setMaxListeners(100);
  }

  static getInstance(): PtyManager {
    if (!_g.__ptyManagerInstance) {
      _g.__ptyManagerInstance = new PtyManager();
    }
    return _g.__ptyManagerInstance;
  }

  spawn(options: SpawnOptions): ManagedProcess {
    const {
      id,
      teamId,
      memberName,
      command,
      args = [],
      cwd,
      env = {},
      cols = 220,
      rows = 50,
    } = options;

    if (this.processes.has(id)) {
      throw new Error(`Process with id "${id}" already exists`);
    }

    const shell = command;
    const mergedEnv = {
      ...process.env,
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>;

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: mergedEnv,
    });

    const managedProcess: ManagedProcess = {
      id,
      teamId,
      memberName,
      pid: ptyProcess.pid,
      status: 'running',
      startedAt: new Date(),
      cwd,
      command,
      cols,
      rows,
    };

    const emitter = new EventEmitter();
    emitter.setMaxListeners(50);

    const entry: PtyEntry = {
      pty: ptyProcess,
      process: managedProcess,
      outputBuffer: '',
      emitter,
    };

    this.processes.set(id, entry);

    ptyProcess.onData((data: string) => {
      entry.outputBuffer += data;
      if (entry.outputBuffer.length > BUFFER_MAX_BYTES) {
        entry.outputBuffer = entry.outputBuffer.slice(
          entry.outputBuffer.length - BUFFER_MAX_BYTES
        );
      }
      emitter.emit('data', data);
      this.globalEmitter.emit('data', id, data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      managedProcess.status = 'exited';
      managedProcess.exitCode = exitCode;
      emitter.emit('exit', exitCode);
      this.globalEmitter.emit('exit', id, exitCode);
    });

    this.globalEmitter.emit('process_started', id, managedProcess);
    console.log(`🚀 [PtyManager] Spawned process "${memberName}" (id=${id}, pid=${ptyProcess.pid})`);
    return managedProcess;
  }

  write(id: string, data: string): void {
    const entry = this.processes.get(id);
    if (!entry) throw new Error(`Process "${id}" not found`);
    if (entry.process.status !== 'running') return;
    entry.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.processes.get(id);
    if (!entry) return;
    if (entry.process.status !== 'running') return;
    try {
      entry.pty.resize(cols, rows);
      entry.process.cols = cols;
      entry.process.rows = rows;
    } catch {
      // ignore resize errors on exited processes
    }
  }

  kill(id: string): void {
    const entry = this.processes.get(id);
    if (!entry) return;
    try {
      entry.pty.kill();
    } catch {
      // already dead
    }
    console.log(`🛑 [PtyManager] Killed process "${entry.process.memberName}" (id=${id})`);
  }

  killAll(): void {
    for (const id of Array.from(this.processes.keys())) {
      this.kill(id);
    }
  }

  getHistory(id: string): string {
    const entry = this.processes.get(id);
    return entry?.outputBuffer ?? '';
  }

  onData(id: string, callback: (data: string) => void): () => void {
    const entry = this.processes.get(id);
    if (!entry) return () => {};
    entry.emitter.on('data', callback);
    return () => entry.emitter.off('data', callback);
  }

  onExit(id: string, callback: (exitCode: number) => void): () => void {
    const entry = this.processes.get(id);
    if (!entry) return () => {};
    entry.emitter.on('exit', callback);
    return () => entry.emitter.off('exit', callback);
  }

  onAnyData(callback: (id: string, data: string) => void): () => void {
    this.globalEmitter.on('data', callback);
    return () => this.globalEmitter.off('data', callback);
  }

  onAnyExit(callback: (id: string, exitCode: number) => void): () => void {
    this.globalEmitter.on('exit', callback);
    return () => this.globalEmitter.off('exit', callback);
  }

  onProcessStarted(callback: (id: string, process: ManagedProcess) => void): () => void {
    this.globalEmitter.on('process_started', callback);
    return () => this.globalEmitter.off('process_started', callback);
  }

  getAll(): ManagedProcess[] {
    return Array.from(this.processes.values()).map((e) => e.process);
  }

  getById(id: string): ManagedProcess | undefined {
    return this.processes.get(id)?.process;
  }

  getByTeamId(teamId: string): ManagedProcess[] {
    return this.getAll().filter((p) => p.teamId === teamId);
  }

  remove(id: string): void {
    this.processes.delete(id);
  }
}
