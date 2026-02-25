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
}
