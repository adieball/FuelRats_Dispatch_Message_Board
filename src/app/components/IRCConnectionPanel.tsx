import { useState, useEffect } from 'react';
import { IRCConnectionStatus } from '../services/ircWebSocket';
import {
  IRC_URL_KEY, PROXY_URL_KEY,
  bridgeProxyUrl, bridgeWsUrl, defaultProxyUrl, defaultWsUrl,
} from '../services/bridgeUrls';

export { PROXY_URL_KEY };
export const DEFAULT_PROXY_URL = defaultProxyUrl();

interface IRCConnectionPanelProps {
  status: IRCConnectionStatus;
  onConnect: (url: string) => void;
  onDisconnect: () => void;
  errorMessage?: string;
  channel: string;
  onChannelChange: (channel: string) => void;
  forceExpanded?: boolean;
  embedded?: boolean; // When true: no header/toggle, always shows config content
}

export function IRCConnectionPanel({
  status,
  onConnect,
  onDisconnect,
  errorMessage,
  channel,
  onChannelChange,
  forceExpanded = false,
  embedded = false,
}: IRCConnectionPanelProps) {
  const [wsUrl, setWsUrl] = useState(() => bridgeWsUrl());
  const [proxyUrl, setProxyUrl] = useState(() => bridgeProxyUrl());
  const [isExpanded, setIsExpanded] = useState(false);
  const [launchHint, setLaunchHint] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(() => localStorage.getItem('fr_auto_launch') === 'true');

  useEffect(() => {
    if (forceExpanded) setIsExpanded(true);
  }, [forceExpanded]);

  useEffect(() => {
    if (status === 'connected') setLaunchHint(false);
  }, [status]);

  // Auto-launch and connect on page load if the option is enabled.
  // Guarded by a sessionStorage flag so that re-mounts caused by bridge failures
  // (which open this panel) do not re-trigger the launch.
  useEffect(() => {
    if (!autoLaunch || !wsUrl.trim()) return;
    if (sessionStorage.getItem('fr_bridge_launched')) return;
    sessionStorage.setItem('fr_bridge_launched', 'true');

    let timer: number;
    const probe = new WebSocket(wsUrl.trim());
    probe.onopen = () => {
      probe.onclose = () => onConnect(wsUrl.trim());
      probe.close();
    };
    probe.onerror = () => {
      window.location.href = 'fr-dispatch://launch';
      timer = window.setTimeout(() => onConnect(wsUrl.trim()), 3000);
    };
    return () => {
      clearTimeout(timer);
      if (probe.readyState === WebSocket.CONNECTING) probe.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = () => {
    if (wsUrl.trim()) {
      localStorage.setItem(IRC_URL_KEY, wsUrl.trim());
      if (proxyUrl.trim()) localStorage.setItem(PROXY_URL_KEY, proxyUrl.trim());
      onConnect(wsUrl.trim());
    }
  };

  const handleLaunch = () => {
    window.location.href = 'fr-dispatch://launch';
    setLaunchHint(false);
    setTimeout(() => setLaunchHint(true), 2500);
  };

  const handleAutoLaunchToggle = (checked: boolean) => {
    setAutoLaunch(checked);
    localStorage.setItem('fr_auto_launch', String(checked));
  };

  const dotColor =
    status === 'connected' ? 'bg-green-400' :
    status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
    status === 'error' ? 'bg-red-400' : 'bg-slate-500';

  const statusText =
    status === 'connected' ? 'Connected' :
    status === 'connecting' ? 'Connecting...' :
    status === 'error' ? 'Error' : 'Disconnected';

  const textColor =
    status === 'connected' ? 'text-green-400' :
    status === 'connecting' ? 'text-yellow-400' :
    status === 'error' ? 'text-red-400' : 'text-slate-400';

  const configContent = (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Bridge WebSocket URL</label>
        <input
          type="text"
          value={wsUrl}
          onChange={(e) => setWsUrl(e.target.value)}
          disabled={status === 'connected' || status === 'connecting'}
          placeholder={defaultWsUrl()}
          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white placeholder-slate-500 disabled:opacity-50"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">DeepL Proxy URL</label>
        <input
          type="text"
          value={proxyUrl}
          onChange={(e) => setProxyUrl(e.target.value)}
          onBlur={() => { if (proxyUrl.trim()) localStorage.setItem(PROXY_URL_KEY, proxyUrl.trim()); }}
          placeholder={defaultProxyUrl()}
          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white placeholder-slate-500"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">IRC Channel</label>
        <input
          type="text"
          value={channel}
          onChange={(e) => onChannelChange(e.target.value)}
          placeholder="#fuelrats"
          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white placeholder-slate-500"
        />
      </div>
      {errorMessage && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-700/50 rounded px-2 py-1">
          {errorMessage}
        </div>
      )}
      <div className="flex gap-2">
        {status === 'connected' ? (
          <button onClick={onDisconnect} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-1 rounded">
            Disconnect
          </button>
        ) : (
          <>
            <button
              onClick={handleLaunch}
              title="Launch bridge.exe via registered protocol handler"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-1 px-3 rounded"
            >
              Launch Bridge
            </button>
            <button
              onClick={handleConnect}
              disabled={status === 'connecting' || !wsUrl.trim()}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm py-1 rounded"
            >
              {status === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          </>
        )}
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoLaunch}
          onChange={(e) => handleAutoLaunchToggle(e.target.checked)}
          className="accent-blue-500"
        />
        <span className="text-xs text-slate-400">Auto-launch bridge on page load</span>
      </label>
      {launchHint && (
        <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/50 rounded px-2 py-1">
          Nothing happened? Run <code className="text-orange-400">bridge.exe --register</code> once first, then try Launch Bridge again.
        </div>
      )}
      <div className="text-xs text-slate-400 bg-slate-900/50 rounded p-2">
        <div className="font-semibold text-slate-300 mb-1">Setup Instructions:</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Download <code className="text-orange-400">bridge.exe</code></li>
          <li>Run once: <code className="text-orange-400">bridge.exe --register</code></li>
          <li>Click <span className="text-blue-400">Launch Bridge</span> above — browser will ask permission</li>
          <li>Click <span className="text-green-400">Connect</span> once the bridge is running</li>
        </ol>
      </div>
    </div>
  );

  // Embedded mode: just the config content, no wrapper/header
  if (embedded) return configContent;

  return (
    <div className="bg-slate-800/50 border border-slate-600 rounded">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-700/30"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-sm font-semibold ${textColor}`}>
            IRC Bridge: {statusText.toUpperCase()}
          </span>
        </div>
        <button className="text-slate-400 hover:text-white text-xs">
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>
      {isExpanded && (
        <div className="border-t border-slate-600 p-3">
          {configContent}
        </div>
      )}
    </div>
  );
}
