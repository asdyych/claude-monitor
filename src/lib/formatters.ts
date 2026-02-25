// Data formatting utilities
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatMemory(mb: number): string {
  if (mb >= 1024) {
    return (mb / 1024).toFixed(1) + ' GB';
  }
  return mb + ' MB';
}

export function formatCpu(cpu: number): string {
  return cpu.toFixed(1) + '%';
}

export function formatTimeAgo(date: Date | string | number): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diff = now.getTime() - dateObj.getTime();

  if (isNaN(diff)) return 'unknown';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function formatTimestamp(ts: string | number | Date): string {
  const date = new Date(ts);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
