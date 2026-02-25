// Team config and message parsing service
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { TeamConfig, TeamState, TeamMessage, TeamMember } from '@/types/team';
import { MESSAGE_PREVIEW_LIMIT } from '@/lib/constants';

const TEAMS_DIR = join(homedir(), '.claude', 'teams');

interface RawTeamConfig {
  name: string;
  description?: string;
  createdAt: number;
  leadAgentId: string;
  leadSessionId: string;
  members: Array<{
    agentId: string;
    name: string;
    agentType: string;
    model: string;
    color?: string;
    tmuxPaneId?: string;
    cwd?: string;
    backendType?: string;
  }>;
}

interface RawMessage {
  from: string;
  text: string;
  summary?: string;
  timestamp: string;
  color?: string;
  read?: boolean;
}

async function readJsonSafe<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function getTeamConfigs(): Promise<Map<string, TeamConfig>> {
  const configs = new Map<string, TeamConfig>();

  try {
    const teamDirs = await readdir(TEAMS_DIR, { withFileTypes: true });

    for (const dir of teamDirs.filter(d => d.isDirectory())) {
      const teamId = dir.name;
      const configPath = join(TEAMS_DIR, teamId, 'config.json');
      const raw = await readJsonSafe<RawTeamConfig>(configPath);

      if (raw) {
        configs.set(teamId, {
          name: raw.name || teamId,
          description: raw.description,
          createdAt: raw.createdAt,
          leadAgentId: raw.leadAgentId,
          leadSessionId: raw.leadSessionId,
          members: (raw.members || []).map((m) => ({
            agentId: m.agentId,
            name: m.name,
            agentType: m.agentType,
            model: m.model,
            color: m.color,
            status: 'idle' as const,
            tmuxPaneId: m.tmuxPaneId,
            cwd: m.cwd,
            backendType: m.backendType
          }))
        });
      }
    }
  } catch (error) {
    console.error('Failed to read team configs:', error);
  }

  return configs;
}

export async function getTeamMessages(teamId: string): Promise<TeamMessage[]> {
  const inboxDir = join(TEAMS_DIR, teamId, 'inboxes');
  const allMessages: TeamMessage[] = [];

  try {
    const files = await readdir(inboxDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const raw = await readJsonSafe<RawMessage[]>(join(inboxDir, file));
      if (Array.isArray(raw)) {
        allMessages.push(...raw.map((m) => ({
          from: m.from,
          text: m.text,
          summary: m.summary,
          timestamp: m.timestamp,
          color: m.color,
          read: m.read
        })));
      }
    }

    // Sort by timestamp descending
    return allMessages
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MESSAGE_PREVIEW_LIMIT);
  } catch {
    return [];
  }
}

export async function getAllTeamsState(): Promise<TeamState[]> {
  const configs = await getTeamConfigs();
  const states: TeamState[] = [];

  const configEntries = Array.from(configs.entries());

  for (const [teamId, config] of configEntries) {
    const recentMessages = await getTeamMessages(teamId);

    // Calculate member activity status
    const memberLastActivity = new Map<string, Date>();
    for (const msg of recentMessages) {
      const existing = memberLastActivity.get(msg.from);
      const msgTime = new Date(msg.timestamp);
      if (!existing || msgTime > existing) {
        memberLastActivity.set(msg.from, msgTime);
      }
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    let activeMembers = 0;

    const membersWithStatus: TeamMember[] = config.members.map((m) => {
      const lastActivity = memberLastActivity.get(m.name);
      const isActive = lastActivity && lastActivity.getTime() > fiveMinutesAgo;
      const isIdle = lastActivity && lastActivity.getTime() <= fiveMinutesAgo;

      if (isActive) activeMembers++;

      return {
        ...m,
        status: isActive ? 'active' : isIdle ? 'idle' : 'offline',
        lastActivity
      };
    });

    states.push({
      id: teamId,
      config: { ...config, members: membersWithStatus },
      messageCount: recentMessages.length,
      lastMessage: recentMessages[0],
      recentMessages,
      activeMembers,
      inboxPath: join(TEAMS_DIR, teamId, 'inboxes')
    });
  }

  // Sort by activity (most active first)
  return states.sort((a, b) => b.activeMembers - a.activeMembers);
}
