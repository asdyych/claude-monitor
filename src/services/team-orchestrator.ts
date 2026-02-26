// TeamOrchestrator - manages the full agent team lifecycle
import { mkdir, writeFile, readFile, rm, access } from 'fs/promises';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { PtyManager } from './pty-manager';
import { TeamCreateRequest, TeamLaunchOptions } from '@/types/team';

const TEAMS_DIR = join(homedir(), '.claude', 'teams');

interface StoredTeamConfig {
  name: string;
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


function findExecutablePath(name: string): string {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return result.trim().split('\n')[0].trim().replace(/^"|"$/g, '');
  } catch {
    return name;
  }
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

  private constructor() {
    this.ptyManager = PtyManager.getInstance();
  }

  static getInstance(): TeamOrchestrator {
    if (!_g.__teamOrchestratorInstance) {
      _g.__teamOrchestratorInstance = new TeamOrchestrator();
    }
    return _g.__teamOrchestratorInstance;
  }

  async createTeam(request: TeamCreateRequest): Promise<string> {
    const teamId = randomUUID();
    const teamDir = join(TEAMS_DIR, teamId);
    const inboxDir = join(teamDir, 'inboxes');

    await mkdir(teamDir, { recursive: true });
    await mkdir(inboxDir, { recursive: true });

    const config = {
      name: request.name,
      description: request.description,
      createdAt: Date.now(),
      leadAgentId: '',
      leadSessionId: '',
      cwd: request.cwd,
      env: request.env || {},
      members: request.members.map((m) => ({
        agentId: randomUUID(),
        name: m.name,
        agentType: m.agentType || 'subagent',
        model: m.model || 'claude-opus-4-5',
        color: m.color,
        cwd: m.cwd || request.cwd,
        backendType: m.backendType || 'claude-code',
        task: m.task,
      })),
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
    const teamCwd = await resolveCwd(config.cwd);

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

      // Write task to a temp file before spawning
      let claudeCmd = 'claude --dangerously-skip-permissions';
      if (member.task) {
        const taskFile = join(tmpdir(), `claude-task-${processId}.txt`);
        await writeFile(taskFile, member.task, 'utf-8');
        const taskPath = process.platform === 'win32' ? toGitBashPath(taskFile) : taskFile;
        // Use -p flag with $(cat file) to avoid quoting issues with long task text
        claudeCmd = `claude --dangerously-skip-permissions -p "$(cat '${taskPath}')"`;
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
      const cmd = claudeCmd;
      setTimeout(() => {
        write(cmd + '\r');
        console.log(`📨 [TeamOrchestrator] Sent claude cmd to ${member.name}`);
      }, 1500);

      console.log(`🐚 [TeamOrchestrator] Spawned bash for ${member.name} in ${memberCwd}`);
      processIds.push(processId);
    }

    console.log(`📁 [TeamOrchestrator] Using claude directly (headless), cwd: ${teamCwd}`);

    this.teamProcessMap.set(teamId, processIds);
    console.log(`🚀 [TeamOrchestrator] Launched team "${teamId}" with ${processIds.length} processes`);

    return { teamId, processIds };
  }

  stopTeam(teamId: string): void {
    const processIds = this.teamProcessMap.get(teamId) || [];
    for (const pid of processIds) {
      this.ptyManager.kill(pid);
    }
    console.log(`🛑 [TeamOrchestrator] Stopped team "${teamId}"`);
  }

  async destroyTeam(teamId: string): Promise<void> {
    this.stopTeam(teamId);
    this.teamProcessMap.delete(teamId);

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
