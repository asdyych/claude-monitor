'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ServerMessage } from '@/types/ws';
import { useWebSocket } from '@/hooks/useWebSocket';

interface TerminalViewProps {
  processId: string;
  memberName: string;
  focused?: boolean;
  onFocus?: () => void;
}

// xterm.js types (loaded dynamically)
type XTerminal = import('@xterm/xterm').Terminal;
type FitAddon = import('@xterm/addon-fit').FitAddon;

let xtermLoaded = false;
let XTermClass: typeof import('@xterm/xterm').Terminal;
let FitAddonClass: typeof import('@xterm/addon-fit').FitAddon;

async function loadXterm() {
  if (xtermLoaded) return;
  const [xtermMod, fitMod] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ]);
  XTermClass = xtermMod.Terminal;
  FitAddonClass = fitMod.FitAddon;
  xtermLoaded = true;
}

export function TerminalView({ processId, memberName, focused, onFocus }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Pre-mount buffer: messages that arrive before xterm is ready
  const pendingChunks = useRef<string[]>([]);
  const { subscribe, unsubscribe, sendInput, sendResize, addMessageHandler } = useWebSocket();

  const fitTerminal = useCallback(() => {
    if (!fitAddonRef.current || !termRef.current) return;
    try {
      fitAddonRef.current.fit();
      const { cols, rows } = termRef.current;
      sendResize(processId, cols, rows);
    } catch {
      // ignore fit errors
    }
  }, [processId, sendResize]);

  useEffect(() => {
    if (!containerRef.current) return;

    // `active` guards against React Strict Mode double-invocation: when the
    // cleanup runs before the async loadXterm() resolves, we mark this effect
    // instance as stale so the resolved promise won't create a second xterm.
    let active = true;
    let term: XTerminal;
    let fitAddon: FitAddon;
    let resizeObserver: ResizeObserver;

    // Subscribe & register handler BEFORE loading xterm so no output is missed.
    // Chunks arriving before the terminal is ready are buffered in pendingChunks.
    subscribe(processId);

    const removeHandler = addMessageHandler((msg: ServerMessage) => {
      // Only messages with a processId field are relevant here
      if (!('processId' in msg) || msg.processId !== processId) return;

      if (msg.type === 'history' || msg.type === 'output') {
        if (termRef.current) {
          termRef.current.write(msg.data);
        } else {
          pendingChunks.current.push(msg.data);
        }
      } else if (msg.type === 'process_exit') {
        const exitMsg = `\r\n\x1b[33m[Process exited with code ${msg.exitCode}]\x1b[0m`;
        if (termRef.current) {
          termRef.current.writeln(exitMsg);
        } else {
          pendingChunks.current.push(exitMsg);
        }
      }
    });

    loadXterm().then(() => {
      // Bail out if cleanup already ran (Strict Mode) or container was removed
      if (!active || !containerRef.current) return;

      term = new XTermClass({
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: {
          background: '#0d1117',
          foreground: '#e6edf3',
          cursor: '#58a6ff',
          selectionBackground: '#264f78',
          black: '#484f58',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39d353',
          white: '#b1bac4',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d364',
          brightWhite: '#f0f6fc',
        },
        scrollback: 5000,
        cursorBlink: true,
        allowProposedApi: true,
      });

      fitAddon = new FitAddonClass();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Flush any output that arrived before xterm was ready
      const buffered = pendingChunks.current.splice(0);
      for (const chunk of buffered) {
        term.write(chunk);
      }

      // Forward keyboard input via WebSocket
      term.onData((data: string) => {
        sendInput(processId, data);
      });

      // Auto-resize on container size change
      resizeObserver = new ResizeObserver(() => {
        fitTerminal();
      });
      resizeObserver.observe(containerRef.current!);
    });

    return () => {
      active = false;
      removeHandler();
      unsubscribe(processId);
      pendingChunks.current = [];
      resizeObserver?.disconnect();
      term?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId]);

  // Focus terminal when focused prop changes
  useEffect(() => {
    if (focused && termRef.current) {
      termRef.current.focus();
    }
  }, [focused]);

  return (
    <div
      className={`flex flex-col h-full bg-[#0d1117] rounded overflow-hidden border transition-colors ${
        focused ? 'border-blue-500' : 'border-gray-700'
      }`}
      onClick={onFocus}
    >
      {/* Terminal title bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-gray-700 flex-shrink-0">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs text-gray-400 font-mono truncate">{memberName}</span>
        <span className="ml-auto text-xs text-gray-600 font-mono">{processId.slice(0, 8)}</span>
      </div>
      {/* xterm container */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-1" />
    </div>
  );
}
