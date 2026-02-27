// TeamOrchestrator - manages the full agent team lifecycle
import { mkdir, writeFile, readFile, rm, access } from 'fs/promises';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { PtyManager } from './pty-manager';
import { TeamCreateRequest, TeamLaunchOptions } from '@/types/team';

const TEAMS_DIR = join(homedir(), '.claude', 'teams');

interface StoredTeamConfig {
  name: string;
  description?: string;
  leadAgentId?: string;
  leadSessionId?: string;
  cwd?: string;
  env?: Record<string, string>;
  members: Array<{
    agentId: string;
    name: string;
    agentType: string;
    model: string;
    color?: string;
    cwd?: string;
    backendType?: string;
    task?: string;
  }>;
}

export interface DispatchUpdate {
  teamId: string;
  taskId: string;
  memberName: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  detail?: string;
}

/** Convert Windows absolute path to Git Bash POSIX path (e.g. C:\foo\bar → /c/foo/bar) */
function toGitBashPath(winPath: string): string {
  return winPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
}


async function resolveCwd(preferredCwd?: string): Promise<string> {
  if (preferredCwd) {
    try {
      await access(preferredCwd);
      return preferredCwd;
    } catch {
      console.warn(`⚠️ [TeamOrchestrator] cwd "${preferredCwd}" not accessible, falling back to homedir`);
    }
  }
  return homedir();
}

export interface LaunchedTeamInfo {
  teamId: string;
  processIds: string[];
}

// Use globalThis to survive Next.js HMR module re-evaluation
const _g = globalThis as typeof globalThis & { __teamOrchestratorInstance?: TeamOrchestrator };

export class TeamOrchestrator {
  private ptyManager: PtyManager;
  // teamId -> processIds
  private teamProcessMap = new Map<string, string[]>();
  // teamId -> memberName -> processId
  private teamMemberProcessMap = new Map<string, Map<string, string>>();
  // teamId -> leader processId
  private teamLeaderProcessMap = new Map<string, string>();
  // teamId -> stored config
  private teamConfigCache = new Map<string, StoredTeamConfig>();
  private leaderPrimed = new Set<string>();
  private dispatchEmitter = new EventEmitter();
  private leaderOutputBuffers = new Map<string, string>();
  private processTaskBuffers = new Map<string, string>();
  // processId -> taskId: tracks which task a member is currently executing
  private memberActiveTask = new Map<string, string>();
  // processId -> Set<taskId>: tracks whether first output has been seen
  private memberFirstOutputSeen = new Set<string>();

  private constructor() {
    this.ptyManager = PtyManager.getInstance();
    this.dispatchEmitter.setMaxListeners(200);
    this.ptyManager.onAnyData((processId, data) => {
      this.handleProcessOutput(processId, data);
    });
  }

  static getInstance(): TeamOrchestrator {
    if (!_g.__teamOrchestratorInstance) {
      _g.__teamOrchestratorInstance = new TeamOrchestrator();
    }
    return _g.__teamOrchestratorInstance;
  }

  private getLeaderMember(config: StoredTeamConfig): StoredTeamConfig['members'][number] | undefined {
    if (config.leadAgentId) {
      const exact = config.members.find((m) => m.agentId === config.leadAgentId);
      if (exact) return exact;
    }
    return config.members.find((m) => m.agentType === 'orchestrator') ?? config.members[0];
  }

  private normalizeMemberKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private resolveMemberName(teamId: string, requestedName: string): string | null {
    const memberMap = this.teamMemberProcessMap.get(teamId);
    if (!memberMap || memberMap.size === 0) return null;

    // Exact match first — always respect leader's explicit choice
    const exact = memberMap.get(requestedName);
    if (exact) return requestedName;

    // Case-insensitive fallback (model may vary casing)
    const entries = Array.from(memberMap.keys());
    const caseInsensitive = entries.find(
      (name) => name.toLowerCase() === requestedName.toLowerCase()
    );
    if (caseInsensitive) return caseInsensitive;

    // Normalized (strip hyphens/underscores) — only when unambiguous
    const targetKey = this.normalizeMemberKey(requestedName);
    if (!targetKey) return null;
    const normalizedMatches = entries.filter(
      (name) => this.normalizeMemberKey(name) === targetKey
    );
    if (normalizedMatches.length === 1) return normalizedMatches[0];

    return null;
  }

  private notifyLeaderUnknownMember(teamId: string, memberName: string): void {
    const leaderProcessId = this.teamLeaderProcessMap.get(teamId);
    if (!leaderProcessId) return;

    const availableMembers = Array.from(
      this.teamMemberProcessMap.get(teamId)?.keys() || []
    );
    const hint = [
      '',
      `[System] Dispatch failed: member "${memberName}" not found.`,
      `[System] Available members: ${availableMembers.join(', ') || '(none)'}.`,
      '[System] Format: [[DISPATCH member="<exact-name>" task="<task>"]]',
      '',
    ].join('\n');
    this.ptyManager.write(leaderProcessId, `${hint}\r`);
  }

  private isLeaderProcess(teamId: string, processId: string): boolean {
    return this.teamLeaderProcessMap.get(teamId) === processId;
  }

  private emitDispatchUpdate(update: DispatchUpdate): void {
    this.dispatchEmitter.emit('dispatch_update', update);
    const emoji =
      update.status === 'queued'
        ? '🟡'
        : update.status === 'running'
        ? '🔵'
        : update.status === 'succeeded'
        ? '🟢'
        : '🔴';
    console.log(
      `${emoji} [TeamOrchestrator] dispatch ${update.status} team=${update.teamId} task=${update.taskId} member=${update.memberName}`
    );
  }

  onDispatchUpdate(callback: (update: DispatchUpdate) => void): () => void {
    this.dispatchEmitter.on('dispatch_update', callback);
    return () => this.dispatchEmitter.off('dispatch_update', callback);
  }

  getLeaderProcessId(teamId: string): string | undefined {
    return this.teamLeaderProcessMap.get(teamId);
  }

  async createTeam(request: TeamCreateRequest): Promise<string> {
    const teamId = randomUUID();
    const teamDir = join(TEAMS_DIR, teamId);
    const inboxDir = join(teamDir, 'inboxes');

    await mkdir(teamDir, { recursive: true });
    await mkdir(inboxDir, { recursive: true });

    const members = request.members.map((m) => ({
      agentId: randomUUID(),
      name: m.name,
      agentType: m.agentType || 'subagent',
      model: m.model || 'claude-opus-4-5',
      color: m.color,
      cwd: m.cwd || request.cwd,
      backendType: m.backendType || 'claude-code',
      task: m.task,
    }));

    const leader = members.find((m) => m.agentType === 'orchestrator') ?? members[0];
    const config = {
      name: request.name,
      description: request.description,
      createdAt: Date.now(),
      leadAgentId: leader?.agentId ?? '',
      leadSessionId: '',
      cwd: request.cwd,
      env: request.env || {},
      members,
    };

    await writeFile(join(teamDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ [TeamOrchestrator] Created team "${request.name}" (id=${teamId})`);
    return teamId;
  }

  async launchTeam(teamId: string, options: TeamLaunchOptions = {}): Promise<LaunchedTeamInfo> {
    const configPath = join(TEAMS_DIR, teamId, 'config.json');

    let config: StoredTeamConfig;
    try {
      const raw = await readFile(configPath, 'utf-8');
      config = JSON.parse(raw) as StoredTeamConfig;
    } catch {
      throw new Error(`Team config not found for teamId="${teamId}"`);
    }
    const existingProcessIds = this.teamProcessMap.get(teamId) || [];
    const runningProcessIds = existingProcessIds.filter((pid) => {
      const proc = this.ptyManager.getById(pid);
      return proc?.status === 'running';
    });

    if (runningProcessIds.length > 0) {
      throw new Error(`Team "${teamId}" already has running processes`);
    }

    const teamEnv: Record<string, string> = {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      CLAUDE_TEAM_ID: teamId,
      ...(config.env || {}),
      ...(options.env || {}),
    };

    const processIds: string[] = [];
    const memberProcessMap = new Map<string, string>();
    const teamCwd = await resolveCwd(config.cwd);
    const leaderMember = this.getLeaderMember(config);
    const leaderAgentId = leaderMember?.agentId;

    if (!leaderMember) {
      throw new Error(`Team "${teamId}" has no members`);
    }

    for (const member of config.members) {
      const processId = randomUUID();
      const memberCwd = await resolveCwd(member.cwd || config.cwd);

      const memberEnv: Record<string, string> = {
        ...teamEnv,
        CLAUDE_AGENT_NAME: member.name,
        CLAUDE_AGENT_TYPE: member.agentType,
      };

      // Spawn bash, then send "claude --dangerously-skip-permissions -p '$(cat task.txt)'" via bash.
      // Running claude through bash ensures PTY output is captured correctly (direct spawn loses output
      // on Windows ConPTY). The task is written to a temp file to avoid shell quoting issues.
      const shellCommand = process.platform === 'win32'
        ? 'C:\\Program Files\\Git\\bin\\bash.exe'
        : '/bin/bash';
      const shellArgs = ['--login', '-i'];

      const isLeader = member.agentId === leaderAgentId;
      // Leader runs interactive Claude session; members stay in shell waiting for delegated jobs.
      let startupCmd = '';
      if (isLeader) {
        startupCmd = 'claude --dangerously-skip-permissions';
      } else if (member.task) {
        const taskFile = join(tmpdir(), `claude-task-${processId}.txt`);
        await writeFile(taskFile, member.task, 'utf-8');
        const taskPath = process.platform === 'win32' ? toGitBashPath(taskFile) : taskFile;
        startupCmd = `claude --dangerously-skip-permissions -p "$(cat '${taskPath}')"`;
      } else {
        startupCmd = `echo "🟢 ${member.name} ready for delegated tasks"`;
      }

      this.ptyManager.spawn({
        id: processId,
        teamId,
        memberName: member.name,
        command: shellCommand,
        args: shellArgs,
        cwd: memberCwd,
        env: memberEnv,
        cols: 220,
        rows: 50,
      });

      // Send the claude command after bash --login initializes (~1.5s)
      const write = (data: string) => {
        try {
          this.ptyManager.write(processId, data);
        } catch { /* process may have exited */ }
      };
      const cmd = startupCmd;
      setTimeout(() => {
        write(cmd + '\r');
        console.log(`📨 [TeamOrchestrator] Sent claude cmd to ${member.name}`);
      }, 1500);

      console.log(`🐚 [TeamOrchestrator] Spawned bash for ${member.name} in ${memberCwd}`);
      processIds.push(processId);
      memberProcessMap.set(member.name, processId);
      if (isLeader) {
        this.teamLeaderProcessMap.set(teamId, processId);
      }
    }

    this.teamConfigCache.set(teamId, config);
    this.teamProcessMap.set(teamId, processIds);
    this.teamMemberProcessMap.set(teamId, memberProcessMap);
    this.leaderPrimed.delete(teamId);
    console.log(`📁 [TeamOrchestrator] Team cwd resolved: ${teamCwd}`);
    console.log(`🚀 [TeamOrchestrator] Launched team "${teamId}" with ${processIds.length} processes`);

    return { teamId, processIds };
  }

  private getLeaderPromptEnvelope(teamId: string, userText: string): string {
    const config = this.teamConfigCache.get(teamId);
    const members = config?.members || [];
    const leaderName = config ? this.getLeaderMember(config)?.name : undefined;

    // Only list non-leader members as dispatchable targets
    const dispatchableMembers = members.filter((m) => m.name !== leaderName);

    // Build per-member context lines so leader knows each member's role/skills
    const memberContext = dispatchableMembers
      .map((m) => {
        const role = m.agentType ? ` (${m.agentType})` : '';
        const hint = m.task ? ` — "${m.task.slice(0, 120)}"` : '';
        return `  - ${m.name}${role}${hint}`;
      })
      .join('\n');

    // Pick the first non-leader member for the dispatch example
    const exampleMember = dispatchableMembers[0];
    const exampleName = exampleMember?.name ?? 'member-name';

    // NOTE: Do NOT include literal [[DISPATCH ...]] examples here — the PTY may echo
    // injected text back, which would be parsed as real dispatch commands.
    return [
      'You are the team lead orchestrator. Coordinate the team to complete the user request.',
      `Delegate work using machine-readable tags: DOUBLE-BRACKET DISPATCH member="<name>" task="<task>" DOUBLE-BRACKET`,
      `(Replace DOUBLE-BRACKET with [[ and ]] respectively)`,
      `IMPORTANT: NEVER dispatch to yourself (${leaderName ?? 'team-lead'}). Only dispatch to:`,
      memberContext || '  (no members available)',
      'When a member finishes, their result is relayed back to you automatically.',
      '',
      `User request: ${userText}`,
    ].join('\n');
  }

  sendUserMessageToLeader(teamId: string, text: string): { accepted: boolean; message: string } {
    const trimmed = text.trim();
    if (!trimmed) {
      return { accepted: false, message: 'Message cannot be empty' };
    }

    const leaderProcessId = this.teamLeaderProcessMap.get(teamId);
    if (!leaderProcessId) {
      return { accepted: false, message: `Leader process not found for team "${teamId}"` };
    }

    const leaderProcess = this.ptyManager.getById(leaderProcessId);
    if (!leaderProcess || leaderProcess.status !== 'running') {
      return { accepted: false, message: 'Leader process is not running' };
    }

    const input = this.leaderPrimed.has(teamId) ? trimmed : this.getLeaderPromptEnvelope(teamId, trimmed);
    this.leaderPrimed.add(teamId);
    this.ptyManager.write(leaderProcessId, `${input}\r`);
    console.log(`📩 [TeamOrchestrator] Sent user message to leader (team=${teamId})`);
    return { accepted: true, message: 'Message delivered to leader' };
  }

  private createDispatchCommand(taskId: string, memberTask: string): Promise<string> {
    return (async () => {
      const wrappedTask = [
        memberTask,
        '',
        `Return final answer wrapped exactly as: [[RESULT task_id="${taskId}"]]...[[/RESULT]]`,
      ].join('\n');
      const taskFile = join(tmpdir(), `claude-member-task-${taskId}.txt`);
      await writeFile(taskFile, wrappedTask, 'utf-8');
      const taskPath = process.platform === 'win32' ? toGitBashPath(taskFile) : taskFile;
      return `claude --dangerously-skip-permissions -p "$(cat '${taskPath}')"`;
    })();
  }

  private async dispatchTaskToMember(
    teamId: string,
    memberName: string,
    taskId: string,
    task: string
  ): Promise<void> {
    const memberMap = this.teamMemberProcessMap.get(teamId);
    const processId = memberMap?.get(memberName);
    if (!processId) {
      this.emitDispatchUpdate({
        teamId,
        taskId,
        memberName,
        status: 'failed',
        detail: `Member "${memberName}" process not found`,
      });
      return;
    }

    // Self-dispatch guard: writing a subprocess command into an interactive Claude PTY corrupts it.
    // Dual check: by processId AND by member name (belt-and-suspenders, in case processId maps diverge).
    const leaderProcessId = this.teamLeaderProcessMap.get(teamId);
    const leaderConfig = this.teamConfigCache.get(teamId);
    const leaderName = leaderConfig ? this.getLeaderMember(leaderConfig)?.name : undefined;
    const isSelfDispatch = processId === leaderProcessId || memberName === leaderName;
    if (isSelfDispatch) {
      this.emitDispatchUpdate({
        teamId,
        taskId,
        memberName,
        status: 'failed',
        detail: 'Self-dispatch not supported (cannot run a subprocess inside your own session)',
      });
      if (leaderProcessId) {
        const delegateNames = Array.from(memberMap?.keys() ?? []).filter(
          (n) => n !== leaderName && memberMap?.get(n) !== leaderProcessId
        );
        this.ptyManager.write(
          leaderProcessId,
          `\n[System] Cannot dispatch to yourself. Delegate to a team member: ${delegateNames.join(', ')}\n\r`
        );
      }
      return;
    }

    const proc = this.ptyManager.getById(processId);
    if (!proc || proc.status !== 'running') {
      this.emitDispatchUpdate({
        teamId,
        taskId,
        memberName,
        status: 'failed',
        detail: `Member "${memberName}" is not running`,
      });
      return;
    }

    this.emitDispatchUpdate({ teamId, taskId, memberName, status: 'queued' });
    try {
      const command = await this.createDispatchCommand(taskId, task);
      const marker = `__DISPATCH_DONE__ task_id=${taskId}`;
      // Track active task so first-output handler can emit running status
      this.memberActiveTask.set(processId, taskId);
      this.memberFirstOutputSeen.delete(processId);
      this.ptyManager.write(processId, `${command}; echo "${marker}"\r`);
      // queued → waiting: command written, waiting for first output byte
      this.emitDispatchUpdate({
        teamId,
        taskId,
        memberName,
        status: 'running',
        detail: 'waiting for first output',
      });
    } catch (error) {
      this.memberActiveTask.delete(processId);
      this.emitDispatchUpdate({
        teamId,
        taskId,
        memberName,
        status: 'failed',
        detail: String(error),
      });
    }
  }

  private handleLeaderOutput(teamId: string, processId: string, data: string): void {
    const previous = this.leaderOutputBuffers.get(processId) ?? '';
    const buffer = `${previous}${data}`.slice(-20000);
    this.leaderOutputBuffers.set(processId, buffer);

    const dispatchRegex = /\[\[DISPATCH\s+([\s\S]*?)\]\]/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = dispatchRegex.exec(buffer)) !== null) {
      const attrSource = match[1];
      const attrs = new Map<string, string>();
      const attrRegex = /(\w+)=(?:"([\s\S]*?)"|'([\s\S]*?)')/g;
      let attr: RegExpExecArray | null;
      while ((attr = attrRegex.exec(attrSource)) !== null) {
        attrs.set(attr[1], (attr[2] ?? attr[3] ?? '').trim());
      }
      const requestedMemberName = (attrs.get('member') || '').trim();
      const task = (attrs.get('task') || '').trim();
      if (requestedMemberName && task) {
        const resolvedName = this.resolveMemberName(teamId, requestedMemberName);
        const taskId = randomUUID();

        // Early self-dispatch guard: check at parse level before passing to dispatchTaskToMember
        const leaderConfig = this.teamConfigCache.get(teamId);
        const leaderName = leaderConfig ? this.getLeaderMember(leaderConfig)?.name : undefined;
        const leaderProcessId = this.teamLeaderProcessMap.get(teamId);
        const resolvedProcessId = resolvedName
          ? this.teamMemberProcessMap.get(teamId)?.get(resolvedName)
          : undefined;
        const isSelfByName = resolvedName === leaderName || requestedMemberName === leaderName;
        const isSelfByProcessId = !!resolvedProcessId && resolvedProcessId === leaderProcessId;
        console.log(
          `🔍 [TeamOrchestrator] dispatch parse: requested="${requestedMemberName}" resolved="${resolvedName}" leaderName="${leaderName}" leaderPid="${leaderProcessId}" resolvedPid="${resolvedProcessId}" isSelfByName=${isSelfByName} isSelfByPid=${isSelfByProcessId}`
        );

        if (isSelfByName || isSelfByProcessId) {
          console.warn(
            `🚫 [TeamOrchestrator] Blocked self-dispatch to leader "${requestedMemberName}" in team=${teamId}`
          );
          // Tell the leader which members it CAN dispatch to
          const delegateNames = Array.from(
            this.teamMemberProcessMap.get(teamId)?.keys() ?? []
          ).filter((n) => n !== leaderName);
          if (leaderProcessId) {
            const hint = [
              '',
              `[System] Self-dispatch is not allowed. You cannot dispatch tasks to yourself (${leaderName}).`,
              `[System] Available members to dispatch to: ${delegateNames.join(', ') || '(none)'}`,
              `[System] Use format: [[DISPATCH member="<member-name>" task="<task>"]]`,
              '',
            ].join('\n');
            try { this.ptyManager.write(leaderProcessId, `${hint}\r`); } catch { /* ignore */ }
          }
          // Skip the dispatch entirely — do not call dispatchTaskToMember
          lastIndex = dispatchRegex.lastIndex;
          continue;
        }

        if (!resolvedName) {
          // Unknown member — inform leader but do not alter the intent
          console.warn(
            `⚠️ [TeamOrchestrator] dispatch target "${requestedMemberName}" not found in team=${teamId}`
          );
          this.emitDispatchUpdate({
            teamId,
            taskId,
            memberName: requestedMemberName,
            status: 'failed',
            detail: `Member "${requestedMemberName}" not found`,
          });
          this.notifyLeaderUnknownMember(teamId, requestedMemberName);
        } else {
          const corrected = resolvedName !== requestedMemberName;
          console.log(
            `📤 [TeamOrchestrator] dispatch task=${taskId} requested="${requestedMemberName}" resolved="${resolvedName}"${corrected ? ' (name normalized)' : ''}`
          );
          void this.dispatchTaskToMember(teamId, resolvedName, taskId, task);
        }
      }
      lastIndex = dispatchRegex.lastIndex;
    }

    if (lastIndex > 0) {
      this.leaderOutputBuffers.set(processId, buffer.slice(lastIndex));
    }
  }

  private handleMemberOutput(teamId: string, processId: string, data: string): void {
    const proc = this.ptyManager.getById(processId);
    if (!proc) return;

    // Emit running on first output byte to give immediate feedback
    const activeTaskId = this.memberActiveTask.get(processId);
    if (activeTaskId && !this.memberFirstOutputSeen.has(processId)) {
      this.memberFirstOutputSeen.add(processId);
      this.emitDispatchUpdate({
        teamId,
        taskId: activeTaskId,
        memberName: proc.memberName,
        status: 'running',
        detail: 'receiving output',
      });
    }

    const leaderProcessId = this.teamLeaderProcessMap.get(teamId);

    const previous = this.processTaskBuffers.get(processId) ?? '';
    const buffer = `${previous}\n${data}`.slice(-30000);
    this.processTaskBuffers.set(processId, buffer);

    const resultRegex = /\[\[RESULT task_id="([^"]+)"\]\]([\s\S]*?)\[\[\/RESULT\]\]/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = resultRegex.exec(buffer)) !== null) {
      const taskId = match[1].trim();
      const resultText = match[2].trim();
      if (leaderProcessId) {
        const relay = [
          '',
          `[Member Result] ${proc.memberName} finished task ${taskId}`,
          resultText,
          '',
        ].join('\n');
        this.ptyManager.write(leaderProcessId, `${relay}\r`);
      }
      this.memberActiveTask.delete(processId);
      this.memberFirstOutputSeen.delete(processId);
      this.emitDispatchUpdate({
        teamId,
        taskId,
        memberName: proc.memberName,
        status: 'succeeded',
      });
      lastIndex = resultRegex.lastIndex;
    }

    const doneMarker = /__DISPATCH_DONE__\s+task_id=([^\s]+)/g;
    while ((match = doneMarker.exec(buffer)) !== null) {
      const taskId = match[1].trim();
      // Command shell finished but no structured RESULT tag — mark as done anyway
      const wasTracked = this.memberActiveTask.get(processId) === taskId;
      if (wasTracked) {
        this.memberActiveTask.delete(processId);
        this.memberFirstOutputSeen.delete(processId);
        this.emitDispatchUpdate({
          teamId,
          taskId,
          memberName: proc.memberName,
          status: 'succeeded',
          detail: 'command completed',
        });
      }
      lastIndex = Math.max(lastIndex, doneMarker.lastIndex);
    }

    if (lastIndex > 0) {
      this.processTaskBuffers.set(processId, buffer.slice(lastIndex));
    }
  }

  private handleProcessOutput(processId: string, data: string): void {
    const proc = this.ptyManager.getById(processId);
    if (!proc) return;
    const { teamId } = proc;
    if (this.isLeaderProcess(teamId, processId)) {
      this.handleLeaderOutput(teamId, processId, data);
      return;
    }
    this.handleMemberOutput(teamId, processId, data);
  }

  stopTeam(teamId: string): void {
    const processIds = this.teamProcessMap.get(teamId) || [];
    for (const pid of processIds) {
      this.ptyManager.kill(pid);
      this.leaderOutputBuffers.delete(pid);
      this.processTaskBuffers.delete(pid);
      this.memberActiveTask.delete(pid);
      this.memberFirstOutputSeen.delete(pid);
    }
    this.teamLeaderProcessMap.delete(teamId);
    this.teamMemberProcessMap.delete(teamId);
    this.leaderPrimed.delete(teamId);
    console.log(`🛑 [TeamOrchestrator] Stopped team "${teamId}"`);
  }

  async destroyTeam(teamId: string): Promise<void> {
    this.stopTeam(teamId);
    this.teamProcessMap.delete(teamId);
    this.teamConfigCache.delete(teamId);

    const teamDir = join(TEAMS_DIR, teamId);
    await rm(teamDir, { recursive: true, force: true });
    console.log(`🗑️ [TeamOrchestrator] Destroyed team "${teamId}"`);
  }

  getTeamProcessIds(teamId: string): string[] {
    return this.teamProcessMap.get(teamId) || [];
  }

  isTeamRunning(teamId: string): boolean {
    const processIds = this.teamProcessMap.get(teamId) || [];
    return processIds.some((pid) => {
      const proc = this.ptyManager.getById(pid);
      return proc?.status === 'running';
    });
  }

  getAllRunningTeamIds(): string[] {
    const result: string[] = [];
    for (const [teamId, processIds] of Array.from(this.teamProcessMap.entries())) {
      const hasRunning = (processIds as string[]).some((pid: string) => {
        const proc = this.ptyManager.getById(pid);
        return proc?.status === 'running';
      });
      if (hasRunning) result.push(teamId);
    }
    return result;
  }
}
