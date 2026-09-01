import React, { useState, useEffect, useRef } from 'react';
import { CaseWindow } from './CaseWindow';
import { RatBoard } from './RatBoard';
import { MessageEditorPage } from './MessageEditorPage';
import { CopyableSystem } from './CopyableSystem';
import { UpdateBadge } from './UpdateBadge';
import { Button } from '@/app/components/ui/button';
import { Eye, EyeOff, Sidebar, User, MapPin, AlertTriangle, Clock, LogOut, Plus, Shield, ChevronDown, MessageSquare, Settings, Bell, Search, Palette } from 'lucide-react';
import {
  ALERT_PLATFORMS, alertNewCase, desktopPermission, loadAlertSettings,
  requestDesktopPermission, saveAlertSettings, testAlert,
  type AlertSettings,
} from '../services/alertService';
import { fuelRatsApi, apiDebug } from '../services/fuelRatsApi';
import { ircWebSocket, IRCMessage, IRCConnectionStatus } from '../services/ircWebSocket';
import { IRCConnectionPanel } from './IRCConnectionPanel';
import { openEdsmPopout } from '../services/edsmPopout';
import { bridgeWsUrl } from '../services/bridgeUrls';
import { fetchLanStatus, setLanAccess, type LanAccessStatus } from '../services/lanAccessService';
import { findLatestGrabDuration, parseManualInput } from '../services/codeRedTimerService';
import { readRatMessage } from '../services/ratMessageService';
import fuelRatsLogo from './image/TransparentBackgroundRatto.png';
import disconnectIcon from './image/Disconnect_Icon.png';
import { dispatchMessages, rescueMessages } from '../config/quickMessages';
import type { QuickMessageGroup } from '../config/quickMessages';
import { BUTTON_GROUPS_KEY, DISPATCH_CONFIG_KEY, RESCUE_CONFIG_KEY } from '../config/messageTreeHelpers';

// Helper component for displaying elapsed time
function CaseTimer({ startTime }: { startTime: Date }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
      const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
      setElapsed(seconds);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return <span>{formatElapsedTime(elapsed)}</span>;
}

/**
 * The O2 countdown badge: mm:ss, dimmed while paused so a frozen count reads
 * differently from a live one. Click it to type a correction when the grab
 * parser read the client's line wrong -- `onManualSet` is optional so this
 * still works read-only anywhere it's just informational.
 *
 * `isCodeRed` keeps the box on screen even before any estimate has been
 * parsed -- a code red with no timer yet still needs a place to look for
 * one and to type a manual correction into, rather than the badge just not
 * existing until the first qualifying grab shows up.
 */
export function CodeRedTimerBadge({
  timer,
  isCodeRed = false,
  onManualSet,
}: {
  timer: Case['codeRedTimer'];
  isCodeRed?: boolean;
  onManualSet?: (seconds: number) => void;
}) {
  const [, forceTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!timer?.running) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [timer?.running]);

  if (!timer && !isCodeRed) return null;

  const remaining = timer
    ? Math.max(0, Math.round(
        timer.baseSeconds - timer.accumulatedSeconds -
        (timer.running && timer.runningSince ? (Date.now() - timer.runningSince.getTime()) / 1000 : 0)
      ))
    : null;
  const display = remaining !== null
    ? `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}`
    : '--:--';

  const commit = () => {
    const seconds = parseManualInput(draft);
    if (seconds !== null) onManualSet?.(seconds);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="m:ss"
        className="text-xs text-white border border-red-500/60 bg-red-500/10 rounded px-1.5 py-0.5 font-mono w-14"
      />
    );
  }

  /*
   * Running and paused used to differ by opacity-60 alone -- a dimmed red
   * against a red, on a badge two characters wide. Whether the number in front
   * of you is still falling is the single most important thing about it, and it
   * was the hardest thing to see.
   *
   * They are now different colours rather than different brightnesses of one.
   * Red is reserved for a countdown actually running; a paused one goes slate,
   * the same inert grey the rest of the board uses for things that are not
   * happening. Waiting on a first estimate keeps red but dashed, since that is
   * a code red with a number still missing rather than a stopped clock.
   *
   * The dot carries the same distinction without relying on colour, which
   * matters for the reds and greys specifically -- they are the pair most often
   * confused, and this badge is read in a hurry.
   */
  const state = !timer ? 'awaiting' : timer.running ? 'running' : 'paused';
  const tone = {
    running: 'border-red-500 bg-red-500/20 text-white',
    paused: 'border-slate-500 bg-slate-700/50 text-slate-300',
    awaiting: 'border-dashed border-red-500/60 bg-red-500/5 text-red-200',
  }[state];
  const hover = onManualSet
    ? state === 'paused' ? 'cursor-pointer hover:bg-slate-600/60' : 'cursor-pointer hover:bg-red-500/30'
    : '';

  return (
    <div
      onClick={onManualSet ? (e) => { e.stopPropagation(); setDraft(remaining !== null ? display : ''); setEditing(true); } : undefined}
      className={`inline-flex items-center gap-1.5 text-xs border rounded px-1.5 py-0.5 font-mono ${tone} ${hover}`}
      title={
        (timer ? (timer.running ? 'O2 estimate counting down' : 'O2 estimate (paused)') : 'Code red -- no O2 estimate yet') +
        (timer?.manualOverride ? ' -- manually set' : '') +
        (onManualSet ? '. Click to set.' : '')
      }
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          state === 'running' ? 'bg-red-400 animate-pulse'
            : state === 'paused' ? 'bg-slate-400'
            : 'bg-red-400/50'
        }`}
      />
      {display}
    </div>
  );
}

// Helper component for displaying UTC time with Elite Dangerous year (3312)
function UTCClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUTCTime = (date: Date) => {
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = monthNames[date.getUTCMonth()];
    
    const edYear = date.getUTCFullYear() + 1286;
    return `${hours}:${minutes}:${seconds} UTC | ${day} ${month} ${edYear}`;
  };

  return <span className="text-slate-300 font-mono text-base">{formatUTCTime(time)}</span>;
}

export type CaseStatus = 'open' | 'assigned' | 'code-red' | 'inactive' | 'closed';

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isSystem?: boolean;
  isIRC?: boolean; // Flag to identify IRC messages
  isNotice?: boolean; // Flag for IRC NOTICE messages (e.g. translations)
  translation?: string; // Translated text attached to the original message
}

/**
 * A note attached to the case with `!inject` or `!grab`, carried by the API as a
 * "quote". These are the dispatcher's curated record of what is actually known
 * about a rescue -- where the client is sitting, which landmark they are near --
 * as distinct from the live chat they were pieced together from.
 */
export interface Injection {
  id: string;
  author: string;
  text: string;
  createdAt: Date;
  /**
   * Recorded by a bot rather than typed by a person. MechaSqueak records the rat
   * call-ins and RatMama the opening signal; a dispatcher's own !inject and
   * !grab entries are the ones worth reading first, so these are dimmed rather
   * than dropped.
   */
  isBot?: boolean;
  /** Set only when the note was later edited by someone other than its author. */
  lastAuthor?: string;
}

export interface Case {
  id: string;
  apiId?: string; // The API's internal UUID for this rescue
  clientName: string;
  ircNick?: string; // The client's IRC nickname (may differ from clientName)
  system: string;
  platform: string;
  language?: string;
  status: CaseStatus;
  messages: Message[];
  /** Case notes from `!inject`/`!grab`, kept apart from the chat log. */
  injections: Injection[];
  assignedRats: string[];
  ratIrcNicks: Record<string, string>; // CMDR name → IRC nick, derived from relay messages
  oxygenStatus?: string;
  landmark?: { name: string; distance: number };
  scoopable?: boolean;
  nearestScoopableStar?: { name: string; distance: number };
  scDistance?: { ls: number; timestamp: Date };
  /**
   * Everywhere in the rescue system a ship can dock without landing, nearest
   * first. Surface ports are left out: a client who needs a station needs
   * somewhere to dock, not somewhere to land.
   *
   * When the system has nothing suitable, this falls back to the nearest large
   * pad -- and, if the system has no stations at all, the nearest small/medium
   * -- from a populated system within 50ly. Those entries carry systemName and
   * systemDistance and are listed after the in-system ones.
   */
  stationOptions?: { name: string; distanceToArrival: number; type: string; systemName?: string; systemDistance?: number }[];
  ratProgress?: Record<string, {
    fr?: '+' | '-';
    wr?: '+' | '-';
    bc?: '+' | '-';
    fuel?: boolean;
  }>;
  jumpCalls?: Record<string, { jumps: number; text: string; timestamp: Date }>;
  /**
   * O2 countdown sourced from a `!grab`'d client quote. Only ticks while a rat
   * is actually with the client (wr/bc/"open"); freezes on fuel+ or the client
   * quitting to the main menu, which can happen well before the case is over
   * if the rat is still a long way out. See codeRedTimerService.ts.
   */
  codeRedTimer?: {
    baseSeconds: number;
    /** The newest qualifying grab this timer has already reacted to -- a later
     *  grab with a different id always wins, even over a manual correction. */
    lastSeenGrabInjectionId?: string;
    /** True when baseSeconds came from the dispatcher typing a correction rather
     *  than the grab parser, purely for display -- does not affect precedence. */
    manualOverride?: boolean;
    running: boolean;
    runningSince?: Date;
    accumulatedSeconds: number;
  };
  clientInChannel: boolean;
  createdAt: Date;
}

const initialCases: Case[] = [];

/**
 * Oldest first, with inactive cases pushed to the end.
 *
 * An inactive case is parked -- the client has gone quiet or logged off -- so it
 * should not sit between two cases someone is actively working. Age still orders
 * within each group, so the relative order of the active cases is unchanged.
 */
export function compareCases(a: Case, b: Case): number {
  const aInactive = a.status === 'inactive' ? 1 : 0;
  const bInactive = b.status === 'inactive' ? 1 : 0;
  if (aInactive !== bInactive) return aInactive - bInactive;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export const isLPadStation = (type: string) => !['Outpost', 'Planetary Outpost'].includes(type);
const isFleetCarrier = (type: string) => type === 'Fleet Carrier';
/**
 * Sits on a planet rather than in orbit -- Planetary Outpost/Port/Settlement,
 * Planetary Engineer Base, Odyssey Settlement. Matched on the words because
 * EDSM spells these several ways and keeps adding more.
 *
 * Excluded from the station suggestion: a client who needs a station needs
 * somewhere to dock without putting a ship on a surface.
 */
const isPlanetaryStation = (type: string) => /planetary|settlement/i.test(type);
const isColonizationStation = (type: string) =>
  type.toLowerCase().includes('colonisation') || type.toLowerCase().includes('construction');
const canSeeColonization = (platform: string) =>
  platform.includes('Odyssey') || platform.includes('Horizons');

/**
 * The O2 countdown a case starts life with, read straight from its grabbed
 * quotes.
 *
 * The merge path below only derives a timer when there is an existing case to
 * merge against, so a case had no badge until something else happened on it --
 * which on a refresh, or when opening the board mid-case, could be a long wait
 * for a number that was already sitting in the quotes.
 *
 * Starts paused, matching what the merge path does when there is no prior
 * timer. Whether a rat is actually with the client is IRC-derived, and at this
 * point there is no IRC history to replay; it starts ticking on the next
 * wr+/bc+/open.
 */
function initialCodeRedTimer(c: Case): Case['codeRedTimer'] {
  const grab = findLatestGrabDuration(c.injections, c.clientName, c.ircNick);
  if (!grab) return undefined;
  return {
    baseSeconds: grab.seconds,
    lastSeenGrabInjectionId: grab.injectionId,
    manualOverride: false,
    running: false,
    accumulatedSeconds: 0,
  };
}

const RESCUE_DEFAULT: QuickMessageGroup = { label: 'RESCUE', messages: rescueMessages };
/**
 * The FuelRats hourly request allowance.
 *
 * Only used to colour the counter. The live figures come from the API on
 * every response -- `meta.rateLimitTotal` alongside `rateLimitRemaining` --
 * so this is a fallback for the shading, not the number on screen.
 */
const RATE_LIMIT_TOTAL = 3600;

/** "52m" or "8m 20s" once it is close, since the last minute is the tense one. */
function formatResetIn(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 10 ? `${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** How far back the burn rate looks: what is being spent now, not this hour. */
const BURN_WINDOW_MS = 60_000;

/** A full window before the first figure, so every figure is measured alike. */
const BURN_MIN_SPAN_S = 60;

/**
 * Readings of the remaining allowance, newest last.
 *
 * Deliberately outside the component. React unmounts the board entirely when
 * the case search opens, which took the samples with it and left the estimate
 * blank for a minute on the way back. At module scope they outlive any
 * mounting, so navigating away and returning costs nothing.
 */
let burnSamples: Array<{ t: number; remaining: number }> = [];

/**
 * Requests per hour, measured over the last minute.
 *
 * Called once a second with the current reading. Returns null until a full
 * window has been gathered.
 *
 * The allowance refills in one step on the hour, so a rise in `remaining` is
 * the reset rather than negative spending. The samples are dropped at that
 * point and the estimate starts afresh -- there is no honest way to average
 * across a boundary where the meter went backwards.
 */
function trackBurnRate(remaining: number): number | null {
  const now = Date.now();
  const last = burnSamples[burnSamples.length - 1];

  if (last && remaining > last.remaining) {
    burnSamples = [];
  }

  burnSamples.push({ t: now, remaining });

  // One sample from beyond the cutoff is kept, so the span stays a full
  // minute instead of shrinking to whatever survived the trim.
  while (burnSamples.length > 2 && burnSamples[1].t <= now - BURN_WINDOW_MS) {
    burnSamples.shift();
  }

  const oldest = burnSamples[0];
  const span = (now - oldest.t) / 1000;
  if (span < BURN_MIN_SPAN_S) return null;

  return Math.round(((oldest.remaining - remaining) / span) * 3600);
}

const DEFAULT_BUTTON_GROUPS: QuickMessageGroup[] = [RESCUE_DEFAULT, dispatchMessages];

function loadButtonGroups(): QuickMessageGroup[] {
  try {
    const s = localStorage.getItem(BUTTON_GROUPS_KEY);
    if (s) return JSON.parse(s) as QuickMessageGroup[];
  } catch {}
  // Migrate from old separate keys
  if (localStorage.getItem(RESCUE_CONFIG_KEY) !== null || localStorage.getItem(DISPATCH_CONFIG_KEY) !== null) {
    const rescue = (() => { try { const s = localStorage.getItem(RESCUE_CONFIG_KEY); return s ? JSON.parse(s) : RESCUE_DEFAULT; } catch { return RESCUE_DEFAULT; } })();
    const dispatch = (() => { try { const s = localStorage.getItem(DISPATCH_CONFIG_KEY); return s ? JSON.parse(s) : dispatchMessages; } catch { return dispatchMessages; } })();
    const groups = [rescue, dispatch];
    localStorage.setItem(BUTTON_GROUPS_KEY, JSON.stringify(groups));
    return groups;
  }
  return DEFAULT_BUTTON_GROUPS;
}

/** Checkbox row used by the alert settings below. */
function AlertToggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-center gap-2 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700/50 rounded cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="accent-orange-500"
      />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-slate-600">{hint}</span>}
    </label>
  );
}

function AlertSettingsMenu({
  settings,
  onChange,
}: {
  settings: AlertSettings;
  onChange: (next: AlertSettings) => void;
}) {
  const [permission, setPermission] = React.useState(desktopPermission());

  const setDesktop = async (on: boolean) => {
    // Asked for at the moment it is switched on: a permission prompt on page
    // load, before anyone has asked for notifications, gets dismissed reflexively
    // and Chrome then refuses to ask again.
    if (on) {
      const granted = await requestDesktopPermission();
      setPermission(desktopPermission());
      if (!granted) return; // leave the toggle off rather than lie about it
    }
    onChange({ ...settings, desktop: on });
  };

  return (
    <>
      <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        New case alerts
      </div>
      <AlertToggle
        label="Windows notification"
        checked={settings.desktop}
        onChange={on => void setDesktop(on)}
        hint={
          permission === 'unsupported' ? 'n/a'
          : permission === 'denied'    ? 'blocked'
          : undefined
        }
      />
      {permission === 'denied' && (
        <p className="px-3 pb-1 text-[10px] text-slate-600 leading-snug max-w-56">
          Blocked for this site — allow notifications in the browser's address-bar
          site settings, then re-enable here.
        </p>
      )}
      <AlertToggle
        label="Sound"
        checked={settings.sound}
        onChange={on => onChange({ ...settings, sound: on })}
      />
      <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Alert on platform
      </div>
      {ALERT_PLATFORMS.map(({ key, label }) => (
        <AlertToggle
          key={key}
          label={label}
          checked={settings.platforms[key]}
          onChange={on => onChange({ ...settings, platforms: { ...settings.platforms, [key]: on } })}
        />
      ))}
      <button
        onClick={() => testAlert(settings)}
        disabled={!settings.desktop && !settings.sound}
        className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/50 disabled:text-slate-600 disabled:hover:bg-transparent transition-colors"
      >
        <Bell className="w-3 h-3" />
        Test alert
      </button>
    </>
  );
}

/**
 * Opt-in bind of the board, WebSocket and proxy onto the LAN.
 *
 * Off until asked: those sockets used to be localhost-only so that anyone on
 * the same network could not send IRC as you, read your journals, or fire the
 * updater. Turning this on rebinds them to 0.0.0.0. AdiIRC and HexChat stay
 * on 127.0.0.1 -- this process is the relay, so a browser on another machine
 * talks to us and we talk to the IRC client on this one.
 *
 * Hidden when the bridge is not reachable, rather than showing a broken
 * toggle: there is nothing to rebind if FRBoard.exe is not running.
 */
function LanAccessMenu() {
  const [status, setStatus] = React.useState<LanAccessStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchLanStatus()
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, []);

  if (!status) return null;

  const onToggle = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const next = await setLanAccess(on);
      setStatus(next);
      if (next.rebound) {
        // The POST returns before the listener is back. Wait, then open a
        // fresh socket with a full retry budget -- the drop from rebind
        // otherwise burns the existing reconnect attempts and stays red.
        await new Promise((r) => window.setTimeout(r, 800));
        ircWebSocket.reconnect(bridgeWsUrl());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change LAN access');
    } finally {
      setBusy(false);
    }
  };

  const url = status.urls[0]?.board;
  const copyUrl = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      <div className="my-1 border-t border-slate-700/60" />
      <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Network
      </div>
      <AlertToggle
        label="Allow LAN access"
        checked={status.enabled}
        onChange={on => { if (!busy) void onToggle(on); }}
        hint={busy ? '…' : undefined}
      />
      {status.enabled && url && (
        <button
          type="button"
          onClick={copyUrl}
          title="Copy address"
          className="block w-full text-left px-3 pb-1 text-[10px] text-slate-500 leading-snug max-w-56 hover:text-slate-300"
        >
          Open on another machine:{' '}
          <span className="text-slate-400 select-text">{url}</span>
          {copied ? ' — copied' : ''}
        </button>
      )}
      {status.enabled && (
        <p className="px-3 pb-1 text-[10px] text-slate-600 leading-snug max-w-56">
          IRC stays on this PC. Windows Firewall may ask, or block ports{' '}
          {status.ports.board}/{status.ports.ws}/{status.ports.proxy}.
        </p>
      )}
      {error && (
        <p className="px-3 pb-1 text-[10px] text-red-400 leading-snug max-w-56">{error}</p>
      )}
    </>
  );
}

function HeaderMenu({
  view,
  onSetView,
  onAddCase,
  onLogout,
  alertSettings,
  onAlertSettingsChange,
}: {
  view: string;
  onSetView: (v: 'board' | 'rat' | 'editor') => void;
  onAddCase: () => void;
  onLogout?: () => void;
  alertSettings: AlertSettings;
  onAlertSettingsChange: (next: AlertSettings) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-700 rounded text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
      >
        <ChevronDown className="w-3 h-3" />
        Menu
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-slate-900 border border-slate-600 rounded shadow-xl p-1 min-w-max">
          <button
            onClick={() => { onSetView(view === 'rat' ? 'board' : 'rat'); setOpen(false); }}
            className={`flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${view === 'rat' ? 'text-orange-400 bg-orange-500/10' : 'text-slate-300 hover:bg-slate-700/50'}`}
          >
            <Shield className="w-3 h-3" />
            {view === 'rat' ? 'Dispatch Mode' : 'Rat Mode'}
          </button>
          <button
            onClick={() => { onSetView('editor'); setOpen(false); }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            Edit Messages
          </button>
          <button
            onClick={() => { onAddCase(); setOpen(false); }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Case
          </button>
          <div className="my-1 border-t border-slate-700/60" />
          <AlertSettingsMenu settings={alertSettings} onChange={onAlertSettingsChange} />
          <LanAccessMenu />
          <div className="my-1 border-t border-slate-700/60" />
          <button
            onClick={() => { window.location.hash = '#search'; setOpen(false); }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
          >
            <Search className="w-3 h-3" />
            Case search
          </button>
          <div className="my-1 border-t border-slate-700/60" />
          <button
            onClick={() => { window.location.hash = '#colors'; setOpen(false); }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
          >
            <Palette className="w-3 h-3" />
            Message Colors
          </button>
          <button
            onClick={() => { window.location.hash = '#deepl'; setOpen(false); }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
          >
            <Settings className="w-3 h-3" />
            DeepL Settings
          </button>
          <button
            onClick={() => { window.location.hash = '#langbly'; setOpen(false); }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
          >
            <Settings className="w-3 h-3" />
            Langbly Settings
          </button>
          {onLogout && (
            <>
              <div className="my-1 border-t border-slate-700/60" />
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-3 h-3" />
                Sign out
              </button>
            </>
          )}
          {/* Costs nothing on screen until the menu is opened, which is where
              someone goes when they want to know what they are running.
              Selectable so it can be pasted into a bug report. */}
          <div className="my-1 border-t border-slate-700/60" />
          <p className="px-3 pb-0.5 text-[10px] text-slate-600 select-text cursor-text">
            v{__APP_VERSION__}
          </p>
        </div>
      )}
    </div>
  );
}

export function DispatchBoard({ onLogout }: { onLogout?: () => void }) {
  const [view, setView] = useState<'board' | 'rat' | 'editor'>('board');
  const [buttonGroups, setButtonGroups] = useState<QuickMessageGroup[]>(loadButtonGroups);
  const [useApiData] = useState(true); // API active by default
  const [cases, setCases] = useState<Case[]>(initialCases);
  const [toggledCaseIds, setToggledCaseIds] = useState<Set<string>>(
    new Set(initialCases.map((c) => c.id))
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [unreadCases, setUnreadCases] = useState<Set<string>>(new Set());
  const [isLoadingApi, setIsLoadingApi] = useState(false);
  const [rateLimitRemaining, setRateLimitRemaining] = useState(0);
  const [secondsToReset, setSecondsToReset] = useState(0);
  const [rateLimitTotal, setRateLimitTotal] = useState(RATE_LIMIT_TOTAL);
  // Seeded from the samples that survived the last unmount, so returning from
  // the case search shows a figure immediately rather than after a minute.
  const [burnPerHour, setBurnPerHour] = useState<number | null>(null);
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(loadAlertSettings);
  /** Cases already alerted for, so a re-render or refetch cannot ping twice. */
  const alertedRef = useRef<Set<string>>(new Set());
  /**
   * Whether the first batch of cases has been absorbed. Every case is "new" on
   * load, and firing for all of them would mean a burst of notifications for
   * rescues that are already underway.
   */
  const alertsPrimedRef = useRef(false);
  const seenCaseIdsRef = useRef<Set<string>>(
    new Set(initialCases.map((c) => c.id))
  ); // Track which cases we've already seen to avoid flashing on every poll
  const scoopableFetchedRef = useRef<Map<string, string>>(new Map()); // caseId → system name last fetched
  const nearestStationFetchedRef = useRef<Map<string, string>>(new Map()); // caseId → system name last fetched
  // Tracks the rat IRC nick used in the most recent !gofr/!go command per case,
  // so we can correlate with MechaSqueak's response to learn nick → CMDR name
  const lastRatCommandRef = useRef<Map<string, { nicks: string[]; time: number }>>(new Map());
  // Previous status per case, so the inactive-triggered auto-hide below only
  // fires on the open/assigned/code-red → inactive transition, not on every
  // render while a case sits inactive.
  const prevStatusRef = useRef<Map<string, CaseStatus>>(new Map());

  // IRC state
  const [ircStatus, setIrcStatus] = useState<IRCConnectionStatus>('disconnected');
  const [ircError, setIrcError] = useState<string | undefined>();
  const [ircChannel, setIrcChannel] = useState('#fuelrats'); // Default IRC channel

  const [debriefMessages, setDebriefMessages] = useState<Message[]>([]);

  const [showAddCase, setShowAddCase] = useState(false);
  const [addCaseForm, setAddCaseForm] = useState({
    ircName: '',
    cmdrName: '',
    system: '',
    platform: 'pc' as 'pc' | 'xb' | 'ps',
    gameMode: '' as '' | 'l' | 'h' | 'o',
    language: 'en',
    codeRed: false,
    forceMecha: false,
  });
  const [isConnectionPanelOpen, setIsConnectionPanelOpen] = useState(false);
  const ircFailCountRef = useRef(0);

  // Effect to handle API WebSocket connection when useApiData is enabled
  useEffect(() => {
    if (!useApiData) return;

    setIsLoadingApi(true);

    fuelRatsApi.connect((fetchedCases) => {
      setIsLoadingApi(false);
      
      // Merge with existing cases to preserve local state like messages added by dispatch
      setCases((prevCases) => {
        // Create a map of existing cases by ID
        const prevCasesMap = new Map(prevCases.map((c) => [c.id, c]));
        
        // Track which cases are actually NEW (not seen before)
        const newCaseIds: string[] = [];
        
        // Update or add fetched cases
        const updatedCases = fetchedCases.map((fetchedCase) => {
          const existingCase = prevCasesMap.get(fetchedCase.id);
          
          // Check if this is a brand new case we haven't seen
          if (!seenCaseIdsRef.current.has(fetchedCase.id)) {
            newCaseIds.push(fetchedCase.id);
            seenCaseIdsRef.current.add(fetchedCase.id);
          }
          
          if (existingCase) {
            // If same case number but different API UUID, it's a new rescue reusing the number
            // Discard the old closed case and treat this as brand new
            if (existingCase.apiId && fetchedCase.apiId && existingCase.apiId !== fetchedCase.apiId) {
              newCaseIds.push(fetchedCase.id);
              seenCaseIdsRef.current.add(fetchedCase.id);
              return { ...fetchedCase, codeRedTimer: initialCodeRedTimer(fetchedCase) };
            }

            // Merge messages: keep existing + add any new ones from API
            // Deduplicate by id, or by text only within a 15-second window to handle
            // the IRC/API race where the same content can arrive via both streams.
            const existingMessageIds = new Set(existingCase.messages.map((m) => m.id));
            const newMessages = fetchedCase.messages.filter((msg) => {
              if (existingMessageIds.has(msg.id)) return false;
              const recentDupe = existingCase.messages.some(
                (m) => m.text === msg.text &&
                  m.sender === msg.sender &&
                  Math.abs(m.timestamp.getTime() - msg.timestamp.getTime()) < 30000
              );
              return !recentDupe;
            });

            // The O2 estimate itself comes fresh off the just-fetched quotes, but
            // whether the countdown is running/paused is IRC-derived state that
            // has to carry over like ratProgress does. Only replace the base
            // figure when a newer qualifying grab has actually shown up -- and
            // when it has, it wins even over a dispatcher's manual correction,
            // since a fresh grab is presumably the more current word from the client.
            let codeRedTimer = existingCase.codeRedTimer;
            const latestGrab = findLatestGrabDuration(fetchedCase.injections, fetchedCase.clientName, fetchedCase.ircNick);
            if (latestGrab && latestGrab.injectionId !== codeRedTimer?.lastSeenGrabInjectionId) {
              codeRedTimer = {
                baseSeconds: latestGrab.seconds,
                lastSeenGrabInjectionId: latestGrab.injectionId,
                manualOverride: false,
                running: codeRedTimer?.running ?? false,
                runningSince: codeRedTimer?.running ? new Date() : undefined,
                accumulatedSeconds: 0,
              };
            }

            return {
              ...fetchedCase,
              // Reuse the existing array when nothing arrived. Allocating a new
              // one every refetch changes its identity, which wakes up every
              // effect that depends on it even though the content is unchanged.
              messages: newMessages.length > 0
                ? [...existingCase.messages, ...newMessages]
                : existingCase.messages,
              scoopable: existingCase.scoopable,
              nearestScoopableStar: existingCase.nearestScoopableStar,
              scDistance: existingCase.scDistance,
              stationOptions: existingCase.stationOptions,
              ratProgress: existingCase.ratProgress,
              jumpCalls: existingCase.jumpCalls,
              codeRedTimer,
              // Merge ratIrcNicks: live IRC-derived mappings take precedence over API-derived
              ratIrcNicks: { ...fetchedCase.ratIrcNicks, ...existingCase.ratIrcNicks },
            };
          }

          // First time we have seen this case -- including every case on the
          // very first poll after a load or refresh.
          return { ...fetchedCase, codeRedTimer: initialCodeRedTimer(fetchedCase) };
        });

        // Auto-toggle all new cases to make them visible
        if (newCaseIds.length > 0) {
          setToggledCaseIds((prev) => {
            const newSet = new Set(prev);
            newCaseIds.forEach((id) => newSet.add(id));
            return newSet;
          });
        }
        
        // Auto-remove cases the API no longer returns (closed/resolved on the API side)
        // Clear them from seenCaseIdsRef so the case number can be reused later
        const fetchedIds = new Set(fetchedCases.map((c) => c.id));
        prevCases
          .filter((c) => !fetchedIds.has(c.id))
          .forEach((c) => seenCaseIdsRef.current.delete(c.id));

        if (apiDebug()) {
          console.log(
            '[merge]  in:', fetchedCases.map(c => `${c.id}=${c.status}`).join(' '),
            '\n[merge] out:', updatedCases.map(c => `${c.id}=${c.status}`).join(' '),
          );
        }

        return updatedCases;
      });
    });

    // Cleanup: disconnect WebSocket when component unmounts or useApiData is disabled
    return () => {
      fuelRatsApi.disconnect();
    };
  }, [useApiData]);

  // Fetch scoopable star status from EDSM; re-fetches if a case's system name changes
  useEffect(() => {
    cases.forEach((c) => {
      const system = c.system;
      if (!system || system === 'Unknown') return;
      if (scoopableFetchedRef.current.get(c.id) === system) return; // already fetched for this system
      scoopableFetchedRef.current.set(c.id, system);
      fetch(`https://www.edsm.net/api-v1/system?systemName=${encodeURIComponent(system)}&showPrimaryStar=1`)
        .then((r) => r.json())
        .then(async (data) => {
          if (typeof data?.primaryStar?.isScoopable !== 'boolean') return;
          const isScoopable: boolean = data.primaryStar.isScoopable;

          let nearestScoopableStar: { name: string; distance: number } | undefined;
          if (!isScoopable) {
            try {
              // sphere-systems doesn't support showPrimaryStar, so do a two-step lookup:
              // 1) get nearby system names+distances, 2) bulk-query their primary stars
              const sphereRes = await fetch(
                `https://www.edsm.net/api-v1/sphere-systems?systemName=${encodeURIComponent(system)}&radius=50`
              );
              const nearbySystems: { name: string; distance: number }[] = await sphereRes.json();
              const candidates = nearbySystems
                .filter((s) => s.name !== system)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 15);

              if (candidates.length > 0) {
                const params = new URLSearchParams({ showPrimaryStar: '1' });
                candidates.forEach((s) => params.append('systemName[]', s.name));
                const bulkRes = await fetch(`https://www.edsm.net/api-v1/systems?${params}`);
                const bulkData: { name: string; primaryStar?: { isScoopable?: boolean } }[] = await bulkRes.json();

                const closest = bulkData
                  .filter((s) => s.primaryStar?.isScoopable === true)
                  .map((s) => {
                    const c = candidates.find((c) => c.name === s.name);
                    return c ? { name: s.name, distance: c.distance } : null;
                  })
                  .filter(Boolean)
                  .sort((a, b) => a!.distance - b!.distance)[0];

                if (closest) nearestScoopableStar = closest as { name: string; distance: number };
              }
            } catch {}
          }

          setCases((prev) =>
            prev.map((pc) =>
              pc.id === c.id && pc.system === system
                ? { ...pc, scoopable: isScoopable, nearestScoopableStar }
                : pc
            )
          );
        })
        .catch(() => {});
    });
  }, [cases]);

  // Fetch nearest L-pad and S/M-only stations from EDSM separately.
  // S/M station is only stored if it's closer than the nearest L station.
  // Colonisation stations are hidden for Legacy/console clients.
  // Falls back to a 50ly sphere search when the rescue system has no stations.
  useEffect(() => {
    cases.forEach((c) => {
      const system = c.system;
      if (!system || system === 'Unknown') return;
      if (nearestStationFetchedRef.current.get(c.id) === system) return;
      nearestStationFetchedRef.current.set(c.id, system);

      type StationData = { name: string; distanceToArrival: number; type: string; systemName?: string; systemDistance?: number };
      const showColonization = canSeeColonization(c.platform);

      fetch(`https://www.edsm.net/api-system-v1/stations?systemName=${encodeURIComponent(system)}`)
        .then((r) => r.json())
        .then(async (data) => {
          const rawStations: { name: string; distanceToArrival: number; type: string }[] = data?.stations ?? [];
          const stations = rawStations.filter(s =>
            !isFleetCarrier(s.type)
            && !isPlanetaryStation(s.type)
            && (showColonization || !isColonizationStation(s.type))
          );

          // Everything dockable in the rescue system itself, nearest first.
          const inSystem: StationData[] = [...stations]
            .sort((a, b) => a.distanceToArrival - b.distanceToArrival);

          // Only used to decide whether the sphere search is needed, and to
          // collect what it finds. Anything from a nearby system is appended
          // after the in-system list, tagged with the system it is in.
          let nearestL: StationData | null = inSystem.find(s => isLPadStation(s.type)) ?? null;
          let nearestSm: StationData | null = inSystem.find(s => !isLPadStation(s.type)) ?? null;
          const fromNearbySystems: StationData[] = [];

          const needLSphere = !nearestL;
          // Only search sphere for SM if there are no stations in system at all
          const needSmSphere = stations.length === 0;

          if (needLSphere || needSmSphere) {
            const sphereRes = await fetch(
              `https://www.edsm.net/api-v1/sphere-systems?systemName=${encodeURIComponent(system)}&radius=50&showInformation=1`
            );
            const nearbySystems: { name: string; distance: number; information?: { population?: number } }[] =
              await sphereRes.json();

            const candidates = nearbySystems
              .filter((s) => (s.information?.population ?? 0) > 0)
              .sort((a, b) => a.distance - b.distance);

            for (const candidate of candidates) {
              if ((!needLSphere || nearestL) && (!needSmSphere || nearestSm)) break;

              const stnRes = await fetch(
                `https://www.edsm.net/api-system-v1/stations?systemName=${encodeURIComponent(candidate.name)}`
              );
              const stnData = await stnRes.json();
              const nearbyRaw: { name: string; distanceToArrival: number; type: string }[] = stnData?.stations ?? [];
              const nearbyStations = nearbyRaw.filter(s =>
                !isFleetCarrier(s.type)
                && !isPlanetaryStation(s.type)
                && (showColonization || !isColonizationStation(s.type))
              );

              if (needLSphere && !nearestL) {
                const nearbyL = nearbyStations.filter(s => isLPadStation(s.type));
                if (nearbyL.length > 0) {
                  const best = nearbyL.reduce((a, b) => a.distanceToArrival <= b.distanceToArrival ? a : b);
                  nearestL = { ...best, systemName: candidate.name, systemDistance: candidate.distance };
                  fromNearbySystems.push(nearestL);
                }
              }

              if (needSmSphere && !nearestSm) {
                const nearbySm = nearbyStations.filter(s => !isLPadStation(s.type));
                if (nearbySm.length > 0) {
                  const best = nearbySm.reduce((a, b) => a.distanceToArrival <= b.distanceToArrival ? a : b);
                  nearestSm = { ...best, systemName: candidate.name, systemDistance: candidate.distance };
                  fromNearbySystems.push(nearestSm);
                }
              }
            }
          }

          // In-system first, then anything the sphere search had to go and find,
          // ordered by how far out of the way that system is.
          const stationOptions: StationData[] = [
            ...inSystem,
            ...fromNearbySystems.sort((a, b) => (a.systemDistance ?? 0) - (b.systemDistance ?? 0)),
          ];

          setCases((prev) =>
            prev.map((pc) =>
              pc.id === c.id && pc.system === system
                ? { ...pc, stationOptions }
                : pc
            )
          );
        })
        .catch(() => {});
    });
  }, [cases]);

  // Sync toggledCaseIds and unreadCases when cases are removed from state
  useEffect(() => {
    const caseIds = new Set(cases.map((c) => c.id));
    setToggledCaseIds((prev) => {
      const filtered = new Set([...prev].filter((id) => caseIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
    setUnreadCases((prev) => {
      const filtered = new Set([...prev].filter((id) => caseIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [cases]);

  // Auto-hide a case the moment it goes inactive, same as toggling it off in
  // the sidebar. One-shot on the transition, not a standing rule: if a
  // dispatcher (or the client) brings it back active, it stays hidden until
  // someone opts back in by clicking it in the sidebar. Reusing the ordinary
  // toggle state means a manual re-toggle just works, with nothing here to
  // fight it on the next case update.
  useEffect(() => {
    const goneInactive: string[] = [];
    cases.forEach((c) => {
      const prevStatus = prevStatusRef.current.get(c.id);
      if (prevStatus && prevStatus !== 'inactive' && c.status === 'inactive') {
        goneInactive.push(c.id);
      }
      prevStatusRef.current.set(c.id, c.status);
    });
    const currentIds = new Set(cases.map((c) => c.id));
    for (const id of prevStatusRef.current.keys()) {
      if (!currentIds.has(id)) prevStatusRef.current.delete(id);
    }
    if (goneInactive.length > 0) {
      setToggledCaseIds((prev) => {
        const next = new Set(prev);
        goneInactive.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [cases]);

  // Effect to update rate limit display every second
  useEffect(() => {
    if (!useApiData) {
      setRateLimitRemaining(0);
      setSecondsToReset(0);
      return;
    }

    const updateRateLimit = () => {
      const info = fuelRatsApi.getRateLimitInfo();
      setRateLimitRemaining(info.remaining);
      // The API states its own allowance, so prefer it to the constant.
      if (info.total > 0) setRateLimitTotal(info.total);

      if (info.resetDate) {
        const now = new Date();
        const seconds = Math.max(0, Math.floor((info.resetDate.getTime() - now.getTime()) / 1000));
        setSecondsToReset(seconds);
      }

      setBurnPerHour(trackBurnRate(info.remaining));
    };

    updateRateLimit();
    const interval = setInterval(updateRateLimit, 1000);

    return () => clearInterval(interval);
  }, [useApiData]);

  // IRC WebSocket setup
  useEffect(() => {
    // Set up IRC message handler
    ircWebSocket.onMessage = (ircMsg: IRCMessage) => {
      handleIRCMessage(ircMsg);
    };

    // Set up status change handler
    ircWebSocket.onStatusChange = (status: IRCConnectionStatus) => {
      setIrcStatus(status);
      if (status === 'connected') {
        setIrcError(undefined);
        ircFailCountRef.current = 0;
        setIsConnectionPanelOpen(false);
      }
    };

    // Set up error handler
    ircWebSocket.onError = (error: string) => {
      setIrcError(error);
    };

    // Each failed connection attempt increments the counter;
    // after 2 failures open the connection status panel
    ircWebSocket.onConnectionFailed = () => {
      ircFailCountRef.current += 1;
      if (ircFailCountRef.current >= 2) {
        setIsConnectionPanelOpen(true);
      }
    };

    // Auto-connect using the saved URL, falling back to this page's host so a
    // tab opened from another machine reaches the process serving it rather
    // than its own localhost.
    ircWebSocket.connect(bridgeWsUrl());

    return () => {
      ircWebSocket.disconnect();
    };
  }, []);

  const handleIRCMessage = (ircMsg: IRCMessage) => {
    if (ircMsg.type === 'system') return;

    if (ircMsg.channel === '#debrief' && ircMsg.nick && ircMsg.text) {
      setDebriefMessages(prev => [...prev, {
        id: `debrief-${Date.now()}-${Math.random()}`,
        sender: ircMsg.nick!,
        text: ircMsg.text,
        timestamp: ircMsg.timestamp,
        isIRC: true,
      }]);
      return;
    }

    if ((ircMsg.type !== 'message' && ircMsg.type !== 'notice') || !ircMsg.nick || !ircMsg.text) return;

    const isNotice = ircMsg.type === 'notice';

    setCases((prev) => {
      // For notices with <SenderNick> format, pre-compute the single best-matching case
      // (the one where that sender most recently spoke) to avoid attaching translations
      // to every case window where the dispatcher has ever sent a message.
      let singleNoticeTargetId: string | null = null;
      const innerNickForNotice = isNotice ? ircMsg.text.match(/^<([^>]+)>/) : null;
      if (innerNickForNotice) {
        const senderNick = innerNickForNotice[1].toLowerCase();
        let latestTime = -1;
        for (const c of prev) {
          const lastMsg = [...c.messages].reverse().find(
            (m) => !m.isSystem && m.sender.toLowerCase() === senderNick
          );
          if (lastMsg && lastMsg.timestamp.getTime() > latestTime) {
            latestTime = lastMsg.timestamp.getTime();
            singleNoticeTargetId = c.id;
          }
        }
      }

      return prev.map((c) => {
        // Match by case number, IRC nick (exact), fuzzy client name, or text mention
        const nickLower = ircMsg.nick!.toLowerCase();
        const textLower = ircMsg.text.toLowerCase();

        // For translation notices like "<PlzDontKillDave> translated text",
        // extract the inner sender nick so we can match by who originally spoke
        let effectiveNickLower = nickLower;
        if (isNotice) {
          const innerNickMatch = ircMsg.text.match(/^<([^>]+)>/);
          if (innerNickMatch) {
            effectiveNickLower = innerNickMatch[1].toLowerCase();
          }
        }

        // Prefer exact IRC nick match when available from the API
        const ircNickLower = c.ircNick?.toLowerCase();
        const exactNickMatch = ircNickLower && (effectiveNickLower === ircNickLower || textLower.includes(ircNickLower));

        // Fallback: fuzzy match client name (handles spaces, underscores, periods)
        const clientNameLower = c.clientName.toLowerCase();
        const normalizedClientName = clientNameLower.replace(/[. _]+/g, '[. _]*');
        const namePattern = new RegExp(normalizedClientName);
        const fuzzyMatch = namePattern.test(effectiveNickLower) || namePattern.test(textLower);

        // Check if the message sender is an assigned rat (e.g. "Dr Leo" → matches IRC nick "Dr_Leo")
        const matchedRatName = c.assignedRats.find((ratName) => {
          const normalizedRat = ratName.toLowerCase().replace(/[. _]+/g, '[. _]*');
          return new RegExp(`^${normalizedRat}$`).test(effectiveNickLower) || new RegExp(normalizedRat).test(textLower);
        });
        const isAssignedRat = !!matchedRatName;

        // For private notices (e.g. MechaSqueak translations), match by text content
        // since they aren't sent to a channel
        const isPrivateNotice = isNotice && !ircMsg.channel?.startsWith('#');

        // For <SenderNick> notices, restrict to the single most-recently-active case for
        // that sender; otherwise any case where the dispatcher has sent a message matches.
        const hasRecentMessage = isNotice && (
          singleNoticeTargetId
            ? c.id === singleNoticeTargetId
            : c.messages.some((msg) => !msg.isSystem && msg.sender.toLowerCase() === effectiveNickLower)
        );

        const isForThisCase =
          (ircMsg.caseId && c.id === ircMsg.caseId) ||
          (ircMsg.channel === '#fuelrats' && (exactNickMatch || fuzzyMatch || isAssignedRat || hasRecentMessage)) ||
          (isPrivateNotice && (exactNickMatch || fuzzyMatch || isAssignedRat || hasRecentMessage));

        if (!isForThisCase) return c;

        // Strip [#N] case prefix from outbound messages that bounced back via IRC
        const displayText = ircMsg.text.replace(/^\[#\d{1,2}\]\s*/, '');

        // For translation notices, attach to the most recent message from that sender
        // Notice format: "<SenderNick> translated text"
        if (isNotice) {
          const senderMatch = displayText.match(/^<([^>]+)>\s*(.+)$/s);
          if (senderMatch) {
            const [, originalSender, translatedText] = senderMatch;
            // Find the most recent message from this sender (fuzzy match nick)
            const normalizedSender = originalSender.toLowerCase().replace(/[. _]+/g, '[. _]*');
            const senderPattern = new RegExp(`^${normalizedSender}$`, 'i');
            const lastMsgIndex = [...c.messages].reverse().findIndex(
              (msg) => !msg.isSystem && senderPattern.test(msg.sender.toLowerCase())
            );
            if (lastMsgIndex !== -1) {
              const actualIndex = c.messages.length - 1 - lastMsgIndex;
              const updatedMessages = [...c.messages];
              updatedMessages[actualIndex] = {
                ...updatedMessages[actualIndex],
                translation: translatedText.trim(),
              };
              return { ...c, messages: updatedMessages };
            }
          }
          // If we can't match to an original message, fall through and add as separate notice
        }

        // Deduplicate against API-sourced messages AND same-sender IRC messages.
        // Same-sender check prevents echo of locally-sent messages showing twice,
        // while still allowing two different rats to say identical text (e.g. "fr+").
        const incomingNick = (ircMsg.nick || '').toLowerCase();
        const isDuplicate = c.messages.some(
          (msg) => msg.text === displayText &&
            (Date.now() - msg.timestamp.getTime()) < 5000 &&
            (!msg.isIRC || msg.sender.toLowerCase() === incomingNick)
        );

        if (isDuplicate) return c;

        const newMessage: Message = {
          id: `irc-${Date.now()}-${Math.random()}`,
          sender: ircMsg.nick || 'IRC',
          text: displayText,
          timestamp: ircMsg.timestamp,
          isIRC: true,
          isNotice,
        };

        // Mark as unread if window is not visible
        if (!toggledCaseIds.has(c.id)) {
          setUnreadCases((prev) => new Set(prev).add(c.id));
        }

        let updatedRatIrcNicks = c.ratIrcNicks;

        // PRIMARY: learn nick → CMDR from MechaSqueak's response to !gofr/!go
        // Response format (any language): ... "CMDR Name 1" "CMDR Name 2"
        // Zip quoted names from the response with nicks from the command by index
        if (ircMsg.nick?.toLowerCase().includes('mechasqueak')) {
          const lastCmd = lastRatCommandRef.current.get(c.id);
          if (lastCmd && Date.now() - lastCmd.time < 30000) {
            const quotedNames = [...displayText.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
            quotedNames.forEach((cmdrName, i) => {
              const nick = lastCmd.nicks[i];
              if (nick && c.assignedRats.includes(cmdrName) && !updatedRatIrcNicks[cmdrName]) {
                updatedRatIrcNicks = { ...updatedRatIrcNicks, [cmdrName]: nick };
              }
            });
          }
        }

        // BACKUP: learn from direct rat attribution (e.g. nick matches assigned rat name)
        if (matchedRatName && ircMsg.nick && !updatedRatIrcNicks[matchedRatName]) {
          updatedRatIrcNicks = { ...updatedRatIrcNicks, [matchedRatName]: ircMsg.nick };
        }

        // Distance reports, jump calls, rat status and the O2 countdown, all
        // read by readRatMessage so the client test page can reach exactly the
        // same logic instead of an approximation of it.
        const effects = readRatMessage(c, {
          text: displayText,
          nick: ircMsg.nick,
          timestamp: ircMsg.timestamp,
          matchedRatName,
          isAssignedRat,
          ratIrcNicks: updatedRatIrcNicks,
        });

        return {
          ...c,
          ratIrcNicks: updatedRatIrcNicks,
          ...effects,
          messages: [...c.messages, newMessage],
        };
      });
    });
  };

  const handleIRCConnect = (url: string) => {
    setIrcError(undefined);
    ircWebSocket.connect(url);
  };

  const handleIRCDisconnect = () => {
    ircWebSocket.disconnect();
  };

  // Sort cases oldest-first (by createdAt ascending)
  const shortPlatform = (platform: string): string => {
    const platformMap: Record<string, string> = { 'PC': 'PC', 'Xbox': 'XB', 'PlayStation': 'PS' };
    const expansionMap: Record<string, string> = { 'Odyssey': 'ODY', 'Horizons': 'HOR', 'Legacy': 'LEG' };
    const [plat, exp] = platform.split(' - ');
    const short = platformMap[plat] ?? plat;
    return exp ? `${short}-${expansionMap[exp] ?? exp}` : short;
  };

  // New-case alerts.
  //
  // Driven off the case list rather than from inside the merge, so it stays
  // idempotent: the merge's updater can run more than once for a single refetch,
  // and a notification that fires twice is very obvious.
  useEffect(() => {
    if (isLoadingApi) return;

    if (!alertsPrimedRef.current) {
      cases.forEach(c => alertedRef.current.add(c.id));
      alertsPrimedRef.current = true;
      return;
    }

    // Forget cases that have gone, so a reused case number alerts again rather
    // than being mistaken for one already seen.
    const present = new Set(cases.map(c => c.id));
    alertedRef.current.forEach(id => {
      if (!present.has(id)) alertedRef.current.delete(id);
    });

    for (const c of cases) {
      if (alertedRef.current.has(c.id)) continue;
      alertedRef.current.add(c.id);
      alertNewCase(c, alertSettings);
    }
  }, [cases, isLoadingApi, alertSettings]);

  const updateAlertSettings = (next: AlertSettings) => {
    setAlertSettings(next);
    saveAlertSettings(next);
  };

  const sortedCases = [...cases].sort(compareCases);
  const visibleCases = sortedCases.filter((c) => toggledCaseIds.has(c.id));

  const addMessage = (caseId: string, text: string, channel?: string, original?: string) => {
    if (!text.trim()) return;
    const targetChannel = channel || ircChannel;
    // Commands like /tr are executed by AdiIRC directly, not wrapped in PRIVMSG
    if (text.startsWith('/')) {
      // /me is rewritten to name its channel.
      //
      // A raw /me acts on whichever window AdiIRC has focused, which is not
      // necessarily the channel this case is in -- so an action typed into a
      // case window could land in another channel, or in a private query, with
      // nothing to say it had. /describe takes the target explicitly and is
      // otherwise the same command.
      //
      // Only /me. Every other command is passed through untouched, because the
      // rest are AdiIRC's or MechaSqueak's and the board has no business
      // guessing what they act on.
      const action = /^\/me\s+(.+)/is.exec(text);
      ircWebSocket.sendRaw(action ? `/describe ${targetChannel} ${action[1]}` : text);
    } else {
      ircWebSocket.sendMessage(targetChannel, text);

      // Track rat nicks used in !gofr/!go commands (including -a translated variants)
      // Format: !gofr[-a] <caseNumber> <nick1> [nick2 ...]
      const ratCmdMatch = text.match(/^!(?:gofr|go)-?a?\s+\d+(?:\s+(.+))?/i);
      if (ratCmdMatch) {
        // "-a" alone is the re-announce flag (no new nicks given), not a rat nick
        const nicks = (ratCmdMatch[1] ?? '').trim().split(/\s+/).filter((n) => n && n.toLowerCase() !== '-a');
        if (nicks.length > 0) {
          lastRatCommandRef.current.set(caseId, { nicks, time: Date.now() });
        }
      }

      // Add the message to this case window immediately so it appears right away
      // The deduplication logic will prevent it from showing twice when it bounces back via IRC
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== caseId) return c;
          const newMessage: Message = {
            id: `local-${Date.now()}-${Math.random()}`,
            sender: ircWebSocket.myNick || 'You',
            text,
            timestamp: new Date(),
            isIRC: true,
            ...(original ? { translation: original } : {}),
          };
          return { ...c, messages: [...c.messages, newMessage] };
        })
      );
    }
  };

  const clearUnread = (caseId: string) => {
    setUnreadCases((prev) => {
      const newSet = new Set(prev);
      newSet.delete(caseId);
      return newSet;
    });
  };

  const setMessageTranslation = (caseId: string, messageId: string, translation: string) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId ? { ...m, translation } : m
          ),
        };
      })
    );
  };

  const updateCaseStatus = (caseId: string, status: CaseStatus) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, status } : c))
    );
  };

  /** Dispatcher typed a correction into the O2 timer badge -- the regex read the grab wrong. */
  const setCodeRedTimerManual = (caseId: string, seconds: number) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const existing = c.codeRedTimer;
        return {
          ...c,
          codeRedTimer: {
            baseSeconds: seconds,
            lastSeenGrabInjectionId: existing?.lastSeenGrabInjectionId,
            manualOverride: true,
            running: existing?.running ?? false,
            runningSince: existing?.running ? new Date() : undefined,
            accumulatedSeconds: 0,
          },
        };
      })
    );
  };

  const closeCase = (caseId: string) => {
    // Mark as closed but keep in the board for debugging — use the X in the sidebar to remove
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, status: 'closed' } : c)));
  };

  const assignRat = (caseId: string, ratName: string) => {
    if (!ratName.trim()) return;
    
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId && !c.assignedRats.includes(ratName)
          ? { ...c, assignedRats: [...c.assignedRats, ratName] }
          : c
      )
    );
  };

  const removeRat = (caseId: string, ratName: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? { ...c, assignedRats: c.assignedRats.filter((rat) => rat !== ratName) }
          : c
      )
    );
  };

  const toggleCase = (caseId: string) => {
    setToggledCaseIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(caseId)) {
        newSet.delete(caseId);
      } else {
        newSet.add(caseId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: CaseStatus) => {
    switch (status) {
      case 'open':
        return 'bg-blue-500';
      case 'assigned':
        return 'bg-yellow-500';
      case 'code-red':
        return 'bg-red-500';
      case 'inactive':
        return 'bg-slate-500';
      case 'closed':
        return 'bg-slate-700';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <>
    <div className="size-full bg-black relative overflow-hidden flex flex-col">
      {/* Background Image */}
      <div 
        className="absolute inset-[10%] bg-contain bg-center bg-no-repeat opacity-20"
        style={{
          backgroundImage: `url(${fuelRatsLogo})`,
        }}
      />
      
      {/* Header */}
      <div className="bg-slate-900/90 backdrop-blur-sm border-b border-slate-700 px-6 py-4 flex-shrink-0 relative z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="bg-slate-800 border-slate-600 hover:bg-slate-700"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Sidebar className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-orange-500">FuelRats Dispatch Board</h1>
              <p className="text-sm text-slate-400 mt-1">
                Active Cases: {cases.length} | Viewing: {visibleCases.length} | Code Red:{' '}
                {/* oxygenStatus, not status: an inactive case can also be a code
                    red, and status only carries one of the two. */}
                {cases.filter((c) => c.oxygenStatus).length}
              </p>
            </div>
            <HeaderMenu
              view={view}
              onSetView={setView}
              onAddCase={() => setShowAddCase(true)}
              onLogout={onLogout}
              alertSettings={alertSettings}
              onAlertSettingsChange={updateAlertSettings}
            />
          </div>

          {/* Status Legend with UTC Time */}
          <div className="flex flex-col items-end gap-2">
            <UTCClock />
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-slate-300">Open</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-slate-300">Assigned</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-slate-300">Code Red</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-500"></div>
                <span className="text-slate-300">Inactive</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {view === 'rat' ? (
        <RatBoard cases={cases} debriefMessages={debriefMessages} />
      ) : (
      <div className="flex-1 flex min-h-0 relative z-10">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-80 bg-slate-900/80 backdrop-blur-sm border-r border-slate-700 flex flex-col flex-shrink-0">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="font-semibold text-white">Active Cases</h2>
              <p className="text-xs text-slate-400 mt-1">
                Click to toggle visibility
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sortedCases.map((caseData) => {
                const isVisible = toggledCaseIds.has(caseData.id);
                const hasUnread = unreadCases.has(caseData.id);
                // A parked case always reads as parked. Earlier attempts made the
                // greying conditional on there being nothing unread, which meant a
                // case could be labelled INACTIVE and still look exactly like an
                // active one -- unread is only cleared when the case window reports
                // a click, so the flag sticks around long after it stops meaning
                // anything.
                //
                // One appearance for every parked case, no exceptions. Varying it
                // by unread or visibility was tried twice and both times produced a
                // case that said INACTIVE while looking active.
                //
                // Applied to the row's contents rather than the row itself so the
                // coloured left border and the pulsing background survive at full
                // strength -- opacity on the button would take its own border with
                // it, which is what made the earlier attempts trade one signal off
                // against the other.
                const dimmed = caseData.status === 'inactive';
                return (
                  <button
                    key={caseData.id}
                    onClick={() => toggleCase(caseData.id)}
                    className={`relative w-full px-4 py-3 border-b border-slate-800 hover:bg-slate-800 transition-colors text-left ${
                      isVisible ? 'bg-slate-850' : 'bg-slate-900 opacity-60'
                    } ${hasUnread && isVisible ? 'animate-pulse bg-orange-500/10 border-l-4 border-l-orange-500' : ''} ${hasUnread && !isVisible ? 'animate-pulse bg-red-500/20 border-l-4 border-l-red-500 opacity-100' : ''}`}
                  >
                    {!caseData.clientInChannel && (
                      <img
                        src={disconnectIcon}
                        alt=""
                        className="absolute inset-0 h-full w-auto object-cover pointer-events-none"
                        style={{ opacity: 0.4 }}
                      />
                    )}
                    <div
                      style={dimmed ? { opacity: 0.45 } : undefined}
                      className={dimmed ? 'grayscale' : undefined}
                    >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              hasUnread && !isVisible ? 'bg-red-500 animate-pulse' : getStatusColor(caseData.status)
                            }`}
                          ></div>
                          <User className={`w-3 h-3 flex-shrink-0 ${hasUnread && !isVisible ? 'text-red-400' : isVisible ? 'text-slate-400' : 'text-slate-600'}`} />
                          <span className={`text-sm font-semibold truncate ${hasUnread && !isVisible ? 'text-white' : isVisible ? 'text-white' : 'text-slate-500'}`}>
                            CMDR {caseData.clientName}
                          </span>
                          {caseData.status === 'inactive' && (
                            <span className="text-[10px] font-semibold tracking-wider text-slate-400 border border-slate-600 rounded px-1 flex-shrink-0">
                              INACTIVE
                            </span>
                          )}
                          {/* oxygenStatus, not status: inactive outranks code-red
                              in status, but the client is still on fumes.
                              Shown regardless of visibility -- a hidden case has
                              no window on screen, so this strip is the only place
                              the code red can be seen at all. */}
                          {caseData.oxygenStatus && (
                            <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse flex-shrink-0" />
                          )}
                        </div>
                        <div className={`flex items-center gap-2 text-xs mb-1 ${isVisible ? 'text-slate-400' : 'text-slate-600'}`}>
                          <span title="Click to copy system name">
                            <MapPin
                              className="w-3 h-3 flex-shrink-0 cursor-pointer hover:text-orange-400 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(caseData.system);
                              }}
                            />
                          </span>
                          <CopyableSystem system={caseData.system} className="truncate" />
                        </div>
                        <div className={`flex items-center gap-2 text-xs mb-1 ${isVisible ? 'text-slate-400' : 'text-slate-600'}`}>
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <span className="font-semibold">
                            <CaseTimer startTime={caseData.createdAt} />
                          </span>
                        </div>
                        {caseData.assignedRats.length > 0 && (
                          <div className={`text-xs mt-1 ${isVisible ? 'text-slate-500' : 'text-slate-600'}`}>
                            Rats: {caseData.assignedRats.map(r => caseData.ratIrcNicks?.[r] ?? r).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdsmPopout(caseData);
                            }}
                            className="text-2xl font-bold text-orange-400 hover:underline"
                            title="View EDSM system data in a new window"
                          >
                            {caseData.id.split('-')[1]}
                          </button>
                          {isVisible ? (
                            <Eye className="w-4 h-4 text-orange-500" />
                          ) : hasUnread ? (
                            <EyeOff className="w-4 h-4 text-red-500 animate-pulse" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-slate-600" />
                          )}
                        </div>
                        <CodeRedTimerBadge
                          timer={caseData.codeRedTimer}
                          isCodeRed={caseData.status === 'code-red'}
                          onManualSet={(seconds) => setCodeRedTimerManual(caseData.id, seconds)}
                        />
                        <span className={`text-xs ${isVisible ? 'text-slate-400' : 'text-slate-600'}`}>
                          {shortPlatform(caseData.platform)}
                        </span>
                      </div>
                    </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Connection Status Panel */}
            <div className="border-t border-slate-700 flex-shrink-0">
              {/* Header toggle */}
              <div
                className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-slate-800/50"
                onClick={() => setIsConnectionPanelOpen(!isConnectionPanelOpen)}
              >
                <div className="flex items-center gap-3">
                  {/* API dot */}
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${isLoadingApi ? 'bg-yellow-400 animate-pulse' : useApiData ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className={`text-xs ${isLoadingApi ? 'text-yellow-400' : useApiData ? 'text-green-400' : 'text-red-400'}`}>API</span>
                  </div>
                  {/* IRC dot */}
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${ircStatus === 'connected' ? 'bg-green-400' : ircStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : ircStatus === 'error' ? 'bg-red-400' : 'bg-slate-500'}`} />
                    <span className={`text-xs ${ircStatus === 'connected' ? 'text-green-400' : ircStatus === 'connecting' ? 'text-yellow-400' : ircStatus === 'error' ? 'text-red-400' : 'text-slate-400'}`}>IRC</span>
                  </div>
                  {/* Renders nothing unless a newer release exists, so this row
                      is unchanged on almost every load. */}
                  <UpdateBadge />
                  {/* Requests left this hour. The API reports it on every
                      response and the board has tracked it all along; nothing
                      rendered it, so the figure was being kept and thrown away
                      once a second. Amber under a quarter left, red under a
                      tenth -- the board's own polling is about 10% of the
                      allowance, so anything near those is something else. */}
                  {useApiData && rateLimitRemaining > 0 && (() => {
                    const rate = burnPerHour;
                    return (
                      <div
                        className="flex items-center gap-1.5"
                        title={
                          `${rateLimitRemaining.toLocaleString()} of ${rateLimitTotal.toLocaleString()} ` +
                          `API requests left this hour` +
                          (rate === null ? '' : `\nSpending ${rate.toLocaleString()}/hour over the last minute`)
                        }
                      >
                        <span
                          className={`text-xs ${
                            rateLimitRemaining < rateLimitTotal * 0.1
                              ? 'text-red-400'
                              : rateLimitRemaining < rateLimitTotal * 0.25
                                ? 'text-yellow-400'
                                : 'text-slate-400'
                          }`}
                        >
                          {rateLimitRemaining.toLocaleString()}
                          <span className="text-slate-600"> left</span>
                        </span>
                        {secondsToReset > 0 && (
                          <span className="text-xs text-slate-600">
                            · {formatResetIn(secondsToReset)}
                          </span>
                        )}
                        {rate !== null && (
                          // Amber once the pace would spend three quarters of
                          // the allowance, red once it would spend all of it.
                          <span
                            className={`text-xs ${
                              rate >= rateLimitTotal
                                ? 'text-red-400'
                                : rate >= rateLimitTotal * 0.75
                                  ? 'text-yellow-400'
                                  : 'text-slate-600'
                            }`}
                          >
                            · ~{rate.toLocaleString()}/hr
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <span className="text-slate-500 text-xs">{isConnectionPanelOpen ? '▼︎' : '▶︎'}</span>
              </div>
              {/* Expanded config */}
              {isConnectionPanelOpen && (
                <div className="border-t border-slate-700/50 px-4 py-3 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-400 mb-1">FuelRats API</div>
                    <div className={`flex items-center gap-2 text-xs ${isLoadingApi ? 'text-yellow-400' : useApiData ? 'text-green-400' : 'text-red-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${isLoadingApi ? 'bg-yellow-400 animate-pulse' : useApiData ? 'bg-green-400' : 'bg-red-400'}`} />
                      {isLoadingApi ? 'Connecting...' : useApiData ? 'Connected' : 'Disconnected'}
                    </div>
                  </div>
                  <div className="border-t border-slate-700/50" />
                  <div>
                    <div className="text-xs font-semibold text-slate-400 mb-2">IRC Bridge</div>
                    <IRCConnectionPanel
                      status={ircStatus}
                      onConnect={handleIRCConnect}
                      onDisconnect={handleIRCDisconnect}
                      errorMessage={ircError}
                      channel={ircChannel}
                      onChannelChange={setIrcChannel}
                      embedded={true}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Case Windows */}
        <div className="flex-1 flex min-w-0">
          {visibleCases.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <EyeOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg">No cases selected</p>
                <p className="text-sm mt-1">Toggle cases from the sidebar to view them</p>
              </div>
            </div>
          ) : (
            visibleCases.map((caseData) => (
              <CaseWindow
                key={caseData.id}
                caseData={caseData}
                totalCases={visibleCases.length}
                caseIndex={cases.findIndex((c) => c.id === caseData.id)}
                onAddMessage={addMessage}
                onStatusChange={updateCaseStatus}
                onClose={closeCase}
                onAssignRat={assignRat}
                onRemoveRat={removeRat}
                hasUnread={unreadCases.has(caseData.id)}
                onClearUnread={clearUnread}
                ircConnected={ircStatus === 'connected'}
                clientInChannel={caseData.clientInChannel}
                buttonGroups={buttonGroups}
                onSetTranslation={setMessageTranslation}
                onSetCodeRedTimer={setCodeRedTimerManual}
              />
            ))
          )}
        </div>
      </div>
      )}

    </div>

      {view === 'editor' && (
        <MessageEditorPage
          onBack={() => {
            setButtonGroups(loadButtonGroups());
            setView('board');
          }}
        />
      )}

      {showAddCase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAddCase(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-orange-500">Add Case</h2>
              <button
                onClick={() => setAddCaseForm({ ircName: '', cmdrName: '', system: '', platform: 'pc', gameMode: '', language: 'en', codeRed: false, forceMecha: false })}
                className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-2 py-1 rounded transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">IRC NAME</label>
                <input
                  type="text"
                  value={addCaseForm.ircName}
                  onChange={(e) => setAddCaseForm((f) => ({ ...f, ircName: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                  placeholder="Client IRC nickname"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">CMDR NAME <span className="text-slate-600">(optional — if different from IRC name)</span></label>
                <input
                  type="text"
                  value={addCaseForm.cmdrName}
                  onChange={(e) => setAddCaseForm((f) => ({ ...f, cmdrName: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                  placeholder="Commander name"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">SYSTEM</label>
                <input
                  type="text"
                  value={addCaseForm.system}
                  onChange={(e) => setAddCaseForm((f) => ({ ...f, system: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                  placeholder="Star system name"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">PLATFORM</label>
                  <select
                    value={addCaseForm.platform}
                    onChange={(e) => setAddCaseForm((f) => ({ ...f, platform: e.target.value as 'pc' | 'xb' | 'ps', gameMode: '' }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="pc">PC</option>
                    <option value="xb">Xbox</option>
                    <option value="ps">PS4</option>
                  </select>
                </div>
                {addCaseForm.platform === 'pc' && (
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">GAME MODE</label>
                    <select
                      value={addCaseForm.gameMode}
                      onChange={(e) => setAddCaseForm((f) => ({ ...f, gameMode: e.target.value as '' | 'l' | 'h' | 'o' }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                    >
                      <option value="">— select —</option>
                      <option value="l">Legacy</option>
                      <option value="h">Horizons</option>
                      <option value="o">Odyssey</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">LANGUAGE</label>
                <select
                  value={addCaseForm.language}
                  onChange={(e) => setAddCaseForm((f) => ({ ...f, language: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="en">English - en</option>
                  <option value="zh">Mandarin Chinese - zh</option>
                  <option value="hi">Hindi - hi</option>
                  <option value="es">Spanish - es</option>
                  <option value="fr">French - fr</option>
                  <option value="de">German - de</option>
                  <option value="ru">Russian - ru</option>
                  <option value="ar">Arabic - ar</option>
                  <option value="it">Italian - it</option>
                  <option value="ko">Korean - ko</option>
                  <option value="pa">Punjabi - pa</option>
                  <option value="bn">Bengali - bn</option>
                  <option value="pt">Portuguese - pt</option>
                  <option value="id">Indonesian - id</option>
                  <option value="ur">Urdu - ur</option>
                  <option value="fa">Persian (Farsi) - fa</option>
                  <option value="vi">Vietnamese - vi</option>
                  <option value="pl">Polish - pl</option>
                  <option value="sm">Samoan - sm</option>
                  <option value="th">Thai - th</option>
                  <option value="uk">Ukrainian - uk</option>
                  <option value="tr">Turkish - tr</option>
                  <option value="mi">Maori - mi</option>
                  <option value="no">Norwegian - no</option>
                  <option value="nl">Dutch - nl</option>
                  <option value="el">Greek - el</option>
                  <option value="ro">Romanian - ro</option>
                  <option value="sw">Swahili - sw</option>
                  <option value="hu">Hungarian - hu</option>
                  <option value="he">Hebrew - he</option>
                  <option value="sv">Swedish - sv</option>
                  <option value="cs">Czech - cs</option>
                  <option value="fi">Finnish - fi</option>
                  <option value="am">Amharic - am</option>
                  <option value="tl">Tagalog - tl</option>
                  <option value="my">Burmese - my</option>
                  <option value="ta">Tamil - ta</option>
                  <option value="kn">Kannada - kn</option>
                  <option value="ps">Pashto - ps</option>
                  <option value="yo">Yoruba - yo</option>
                  <option value="ms">Malay - ms</option>
                  <option value="ht">Haitian Creole - ht</option>
                  <option value="ne">Nepali - ne</option>
                  <option value="si">Sinhala - si</option>
                  <option value="ca">Catalan - ca</option>
                  <option value="mg">Malagasy - mg</option>
                  <option value="lv">Latvian - lv</option>
                  <option value="lt">Lithuanian - lt</option>
                  <option value="et">Estonian - et</option>
                  <option value="so">Somali - so</option>
                  <option value="ti">Tigrinya - ti</option>
                  <option value="br">Breton - br</option>
                  <option value="fj">Fijian - fj</option>
                  <option value="mt">Maltese - mt</option>
                  <option value="co">Corsican - co</option>
                  <option value="lb">Luxembourgish - lb</option>
                  <option value="oc">Occitan - oc</option>
                  <option value="cy">Welsh - cy</option>
                  <option value="sq">Albanian - sq</option>
                  <option value="mk">Macedonian - mk</option>
                  <option value="is">Icelandic - is</option>
                  <option value="sl">Slovenian - sl</option>
                  <option value="gl">Galician - gl</option>
                  <option value="eu">Basque - eu</option>
                  <option value="az">Azerbaijani - az</option>
                  <option value="uz">Uzbek - uz</option>
                  <option value="kk">Kazakh - kk</option>
                  <option value="mn">Mongolian - mn</option>
                  <option value="bo">Tibetan - bo</option>
                  <option value="km">Khmer - km</option>
                  <option value="lo">Lao - lo</option>
                  <option value="te">Telugu - te</option>
                  <option value="mr">Marathi - mr</option>
                  <option value="ny">Chichewa - ny</option>
                  <option value="eo">Esperanto - eo</option>
                  <option value="ku">Kurdish - ku</option>
                  <option value="tg">Tajik - tg</option>
                  <option value="xh">Xhosa - xh</option>
                  <option value="yi">Yiddish - yi</option>
                  <option value="zu">Zulu - zu</option>
                  <option value="su">Sundanese - su</option>
                  <option value="tt">Tatar - tt</option>
                  <option value="qu">Quechua - qu</option>
                  <option value="ug">Uighur - ug</option>
                  <option value="wo">Wolof - wo</option>
                  <option value="tn">Tswana - tn</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addCaseForm.codeRed}
                    onChange={(e) => setAddCaseForm((f) => ({ ...f, codeRed: e.target.checked }))}
                    className="accent-red-500 w-4 h-4"
                  />
                  <span className="text-sm text-slate-300">CODE RED</span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addCaseForm.forceMecha}
                    onChange={(e) => setAddCaseForm((f) => ({ ...f, forceMecha: e.target.checked }))}
                    className="accent-orange-500 w-4 h-4 mt-0.5"
                  />
                  <span className="text-sm text-slate-300">
                    FORCE MECHA
                    <span className="block text-xs text-slate-500">Force mecha to add the case even if the client isn't in the channel</span>
                  </span>
                </label>
              </div>
            </div>

            {(() => {
              const parts = ['!addcase'];
              if (addCaseForm.forceMecha) parts.push('-f');
              if (addCaseForm.ircName) parts.push(addCaseForm.ircName);
              parts.push(`--${addCaseForm.platform}`);
              if (addCaseForm.platform === 'pc' && addCaseForm.gameMode) parts.push(`--mode ${addCaseForm.gameMode}`);
              if (addCaseForm.system) parts.push(`--sys ${addCaseForm.system}`);
              if (addCaseForm.cmdrName) parts.push(`--cmdr ${addCaseForm.cmdrName}`);
              if (addCaseForm.codeRed) parts.push('--cr');
              if (addCaseForm.language !== 'en') parts.push(`--lang ${addCaseForm.language}`);
              return (
                <div className="mt-4 bg-slate-950 border border-slate-700 rounded px-3 py-2">
                  <p className="text-xs text-slate-500 mb-1">Command preview</p>
                  <p className="font-mono text-xs text-orange-300 break-all">{parts.join(' ')}</p>
                </div>
              );
            })()}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  const parts = ['!addcase'];
                  if (addCaseForm.forceMecha) parts.push('-f');
                  parts.push(addCaseForm.ircName);
                  parts.push(`--${addCaseForm.platform}`);
                  if (addCaseForm.platform === 'pc' && addCaseForm.gameMode) parts.push(`--mode ${addCaseForm.gameMode}`);
                  if (addCaseForm.system) parts.push(`--sys ${addCaseForm.system}`);
                  if (addCaseForm.cmdrName) parts.push(`--cmdr ${addCaseForm.cmdrName}`);
                  if (addCaseForm.codeRed) parts.push('--cr');
                  if (addCaseForm.language !== 'en') parts.push(`--lang ${addCaseForm.language}`);
                  const command = parts.join(' ');
                  if (ircStatus === 'connected') {
                    ircWebSocket.sendMessage(ircChannel, command);
                  } else {
                    navigator.clipboard.writeText(command);
                  }
                  setShowAddCase(false);
                  setAddCaseForm({ ircName: '', cmdrName: '', system: '', platform: 'pc', gameMode: '', language: 'en', codeRed: false, forceMecha: false });
                }}
                disabled={!addCaseForm.ircName.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                {ircStatus === 'connected' ? 'Send to IRC' : 'Copy Command'}
              </button>
              <button
                onClick={() => setShowAddCase(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
