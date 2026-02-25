// Network connection service - Cross-platform
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProxyStatus, ConnectionInfo } from '@/types/connection';
import { PROXY_PORT } from '@/lib/constants';
import { getPlatform, isWindows, isMacOS } from '@/lib/platform';

const execAsync = promisify(exec);

/**
 * Parse address:port string, handling both IPv4 and IPv6
 */
function parseAddressPort(addrPort: string): { address: string; port: number } {
  // IPv6 format: [::1]:15721 or :::15721
  if (addrPort.startsWith('[')) {
    const match = addrPort.match(/^\[([^\]]+)\]:(\d+)$/);
    if (match) {
      return { address: match[1], port: parseInt(match[2], 10) };
    }
  }

  // IPv6 without brackets (common on macOS): ::1.15721 or *.15721
  if (addrPort.includes(':') && !addrPort.match(/^\d+\.\d+\.\d+\.\d+:/)) {
    // Could be IPv6 address, extract port (last segment after . or :)
    const lastDot = addrPort.lastIndexOf('.');
    const lastColon = addrPort.lastIndexOf(':');
    const separator = lastDot > lastColon ? lastDot : lastColon;

    if (separator > 0) {
      const address = addrPort.substring(0, separator);
      const port = parseInt(addrPort.substring(separator + 1), 10);
      if (!isNaN(port)) {
        return { address: address || '*', port };
      }
    }
  }

  // IPv4 format: 127.0.0.1:15721 or *:15721
  const lastColon = addrPort.lastIndexOf(':');
  if (lastColon > 0) {
    const address = addrPort.substring(0, lastColon);
    const port = parseInt(addrPort.substring(lastColon + 1), 10);
    if (!isNaN(port)) {
      return { address: address || '*', port };
    }
  }

  return { address: addrPort, port: 0 };
}

/**
 * Get proxy status on Windows using netstat
 */
async function getProxyStatusWindows(port: number): Promise<ProxyStatus> {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr ":${port}"`, {
      timeout: 5000
    });

    const lines = stdout.trim().split('\n').filter(Boolean);
    const connections: ConnectionInfo[] = [];
    let isListening = false;
    let establishedCount = 0;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const local = parts[1];
        const foreign = parts[2];
        const state = parts[3];
        const pidStr = parts[4];

        const { port: localPort } = parseAddressPort(local);
        const { address: remoteAddress, port: remotePort } = parseAddressPort(foreign);

        if (state === 'LISTENING') {
          isListening = true;
        } else if (state === 'ESTABLISHED') {
          establishedCount++;
          connections.push({
            localPort,
            remoteAddress,
            remotePort,
            state: 'ESTABLISHED',
            pid: pidStr ? parseInt(pidStr, 10) : undefined
          });
        }
      }
    }

    return {
      port,
      isListening,
      activeConnections: establishedCount,
      connections,
      lastChecked: new Date()
    };
  } catch {
    return {
      port,
      isListening: false,
      activeConnections: 0,
      connections: [],
      lastChecked: new Date()
    };
  }
}

/**
 * Get proxy status on macOS/Linux using lsof or netstat
 */
async function getProxyStatusUnix(port: number): Promise<ProxyStatus> {
  try {
    // Try lsof first (more reliable on macOS)
    const { stdout } = await execAsync(`lsof -i :${port} 2>/dev/null || true`, {
      timeout: 5000
    });

    const lines = stdout.trim().split('\n').filter(Boolean);
    const connections: ConnectionInfo[] = [];
    let isListening = false;
    let establishedCount = 0;

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.trim().split(/\s+/);

      if (parts.length >= 9) {
        const command = parts[0];
        const pid = parseInt(parts[1], 10);
        const name = parts[8]; // e.g., *:15721, localhost:15721

        // Parse the address
        const { address: remoteAddress, port: remotePort } = parseAddressPort(name);

        // Check if listening (usually has (LISTEN) in the name field or state)
        const state = parts.length > 9 ? parts[9] : '';

        if (state.includes('LISTEN') || name.includes(`*:${port}`)) {
          isListening = true;
        } else if (state.includes('ESTABLISHED') || name.includes('->')) {
          establishedCount++;
          connections.push({
            localPort: port,
            remoteAddress,
            remotePort,
            state: 'ESTABLISHED',
            pid
          });
        }
      }
    }

    // If lsof didn't find anything, try netstat as fallback
    if (lines.length <= 1) {
      return getProxyStatusNetstatFallback(port);
    }

    return {
      port,
      isListening,
      activeConnections: establishedCount,
      connections,
      lastChecked: new Date()
    };
  } catch {
    return getProxyStatusNetstatFallback(port);
  }
}

/**
 * Fallback using netstat on Unix systems
 */
async function getProxyStatusNetstatFallback(port: number): Promise<ProxyStatus> {
  try {
    const { stdout } = await execAsync(`netstat -an | grep "${port}" 2>/dev/null || true`, {
      timeout: 5000
    });

    const lines = stdout.trim().split('\n').filter(Boolean);
    const connections: ConnectionInfo[] = [];
    let isListening = false;
    let establishedCount = 0;

    for (const line of lines) {
      // Common formats:
      // tcp4 0 0 *.15721 *.* LISTEN
      // tcp  0 0 127.0.0.1.15721 127.0.0.1.52857 ESTABLISHED
      const parts = line.trim().split(/\s+/);

      // Find the local address (usually index 3 on macOS, varies)
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes(`.${port}`) || parts[i].includes(`:${port}`)) {
          const { address: remoteAddress, port: remotePort } = parseAddressPort(parts[i]);

          if (line.includes('LISTEN')) {
            isListening = true;
          } else if (line.includes('ESTABLISHED')) {
            establishedCount++;
            connections.push({
              localPort: port,
              remoteAddress,
              remotePort,
              state: 'ESTABLISHED'
            });
          }
          break;
        }
      }
    }

    return {
      port,
      isListening,
      activeConnections: establishedCount,
      connections,
      lastChecked: new Date()
    };
  } catch {
    return {
      port,
      isListening: false,
      activeConnections: 0,
      connections: [],
      lastChecked: new Date()
    };
  }
}

/**
 * Get proxy status - automatically selects the right implementation for the platform
 */
export async function getProxyStatus(port: number = PROXY_PORT): Promise<ProxyStatus> {
  const platform = getPlatform();

  if (platform === 'win32') {
    return getProxyStatusWindows(port);
  } else {
    return getProxyStatusUnix(port);
  }
}
