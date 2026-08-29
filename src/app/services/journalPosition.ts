/**
 * Live position from Elite's own journal, via the local bridge.
 *
 * Read straight off disk rather than from EDSM: the journal is written the
 * instant you arrive, needs no API key or public profile, and cannot go stale
 * behind a cache. EDSM only knows what EDMC uploaded and lags by however long
 * that takes -- while writing this it was three minutes and a system behind.
 *
 * The browser cannot read local files, so the bridge exposes /journal/position.
 * That also bounds the scope honestly: it reports whoever is playing on this
 * machine, which is exactly the account whose position is worth tracking.
 */

import { bridgeProxyUrl } from './bridgeUrls';

const PROXY = () => bridgeProxyUrl();

const KEY_ENABLED = 'ratboard-journal-enabled';

/**
 * Off until asked for.
 *
 * Reading the journals means adding every commander that has ever played on this
 * machine and then overwriting the system field on a timer. That is useful once
 * you want it and presumptuous before, and it also only works with a bridge new
 * enough to serve the endpoints -- so it stays quiet rather than looking broken.
 */
export function isJournalEnabled(): boolean {
  try {
    return localStorage.getItem(KEY_ENABLED) === '1';
  } catch {
    return false;
  }
}

export function setJournalEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY_ENABLED, '1');
    else localStorage.removeItem(KEY_ENABLED);
  } catch {
    /* private mode — the choice just will not persist */
  }
}

export interface JournalPosition {
  system: string;
  /** Commander currently loaded, so the right account gets updated. */
  cmdr?: string;
  /** ISO timestamp of the arrival event, not of this request. */
  timestamp?: string;
  docked?: boolean | null;
  journal?: string;
  /** Ship type of the newest Loadout event, e.g. "krait_mkii" -- for change detection. */
  ship?: string;
  shipName?: string;
  /** The raw Loadout event, same shape as DetectedCommander.loadout. */
  loadout?: unknown;
}

export type JournalResult =
  | { ok: true; position: JournalPosition }
  | { ok: false; reason: string };

export async function fetchJournalPosition(signal?: AbortSignal): Promise<JournalResult> {
  try {
    const res = await fetch(`${PROXY()}/journal/position`, { cache: 'no-store', signal });
    if (!res.ok) return { ok: false, reason: `bridge returned ${res.status}` };

    const data = (await res.json()) as JournalPosition & { error?: string };
    if (data.error) return { ok: false, reason: data.error };
    if (!data.system) return { ok: false, reason: 'no position yet' };
    return { ok: true, position: data };
  } catch {
    // Almost always the bridge not running. Not worth surfacing as an error --
    // the typed system stays and the next poll picks it up.
    return { ok: false, reason: 'bridge unreachable' };
  }
}

export interface DetectedCommander {
  cmdr: string;
  system?: string;
  timestamp?: string;
  docked?: boolean | null;
  /** The raw Loadout event, in the same shape EDSY's Journal export produces. */
  loadout?: unknown;
  ship?: string;
  shipName?: string;
}

export interface CommanderScan {
  commanders: DetectedCommander[];
  /** Owner of the most recently written journal. */
  active?: string;
  scanned?: number;
  total?: number;
}

/** Every commander the local journals know about, with their last ship and system. */
export async function fetchDetectedCommanders(
  signal?: AbortSignal,
): Promise<CommanderScan | null> {
  try {
    const res = await fetch(`${PROXY()}/journal/commanders`, { cache: 'no-store', signal });
    if (!res.ok) return null;
    const data = (await res.json()) as CommanderScan & { error?: string };
    if (data.error || !Array.isArray(data.commanders)) return null;
    return data;
  } catch {
    return null; // bridge not running
  }
}

/** How old the arrival is, in words, for the tooltip. */
export function positionAge(timestamp?: string): string {
  if (!timestamp) return 'unknown age';
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return 'unknown age';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * 5s. A local file read costs nothing, and the point of reading the journal
 * instead of EDSM is that it is current -- polling it slowly would give that up.
 */
export const POSITION_POLL_MS = 5_000;
