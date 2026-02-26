// Team-related types
export interface TeamMember {
  agentId: string;
  name: string;
  agentType: string;
  model: string;
  color?: string;
  status: 'active' | 'idle' | 'offline';
  lastActivity?: Date;
  tmuxPaneId?: string;
  cwd?: string;
  backendType?: string;
  processId?: string;
}

export interface TeamMessage {
  from: string;
  text: string;
  summary?: string;
  timestamp: string;
  color?: string;
  read?: boolean;
}

export interface TeamConfig {
  name: string;
  description?: string;
  createdAt: number;
  leadAgentId: string;
  leadSessionId: string;
  members: TeamMember[];
}

export interface TeamState {
  id: string;
  config: TeamConfig;
  messageCount: number;
  lastMessage?: TeamMessage;
  recentMessages: TeamMessage[];
  activeMembers: number;
  inboxPath: string;
  isRunning?: boolean;
  processIds?: string[];
}

// Request types for creating/configuring teams
export interface TeamMemberConfig {
  name: string;
  agentType: string;
  model: string;
  color?: string;
  cwd?: string;
  backendType?: string;
  task?: string;
}

export interface TeamCreateRequest {
  name: string;
  description?: string;
  cwd: string;
  members: TeamMemberConfig[];
  env?: Record<string, string>;
  launchImmediately?: boolean;
}

export interface TeamLaunchOptions {
  env?: Record<string, string>;
}
