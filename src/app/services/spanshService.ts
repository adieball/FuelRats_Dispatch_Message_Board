import { FSD_STATS, GUARDIAN_BOOSTER_LY } from './fsdData';
import { bridgeProxyUrl } from './bridgeUrls';

/**
 * Jump estimates via Spansh's galaxy plotter.
 *
 * Everything goes through the local proxy. Spansh serves no
 * Access-Control-Allow-Origin header at all -- its preflight returns 204 with no
 * CORS headers -- so the browser cannot call spansh.co.uk directly. node.py
 * exposes /spansh-proxy for this.
 *
 * The plotter is a job queue, not a request/response API: POST returns a job id
 * and the result is polled. A single plot takes roughly 10 seconds, which is why
 * results are cached and routes are only plotted on demand rather than for every
 * case x account pair.
 */

const PROXY = () => bridgeProxyUrl();

/** Above this, neutron supercharging is assumed; below it, plain jumps. */
export const NEUTRON_THRESHOLD_LY = 1000;

/**
 * Drives whose neutron supercharge differs from the usual multiplier. Taken from
 * Spansh's own fsd_mapping -- coriolis-data does not carry this field at all.
 * Anything absent here uses Spansh's default, so we simply omit the parameter.
 */
export const SUPERCHARGE_MULTIPLIERS: Record<string, number> = {
  int_hyperdrive_overcharge_size8_class5_overchargebooster_mkii: 6,
};

export interface ShipParams {
  /** Display only, so the UI can show which build produced an estimate. */
  shipName: string;
  optimalMass: number;
  baseMass: number;
  tankSize: number;
  internalTankSize: number;
  maxFuelPerJump: number;
  fuelPower: number;
  fuelMultiplier: number;
  rangeBoost: number;
  /**
   * Tonnage actually carried, which drives the range calculation. Defaults to
   * the build's capacity but is usually lower -- a rat with a 64t hold might
   * only run 16t of limpets, and the difference is worth several ly per jump.
   */
  cargo: number;
  /** The build's maximum, kept so the editor can bound and label the cargo field. */
  cargoCapacity: number;
  /**
   * Neutron supercharge multiplier, when the drive is not the standard one.
   * Auto-filled from SUPERCHARGE_MULTIPLIERS where known, and overridable in the
   * ship editor -- these values change with game updates and only affect routes
   * long enough to use neutrons. Left undefined means "use Spansh's default".
   */
  superchargeMultiplier?: number;
  /** EDSY's own figure, used as a sanity check against what we derive. */
  maxJumpRange?: number;
  /**
   * The export this was parsed from, kept so reopening the editor can show what
   * is already saved instead of an empty box. Not used for any calculation --
   * the parsed fields above are authoritative, so a later change to the FSD
   * table cannot silently alter an estimate that has already been acted on.
   */
  sourceJson?: string;
}

export interface PlotOptions {
  /** Route to scoopable secondary stars. Off by default -- they are slow to reach. */
  scoopSecondary?: boolean;
  /** Force neutron use on/off instead of deciding from distance. */
  useSupercharge?: boolean;
  /**
   * Already sitting on a charged neutron star, so the first jump is boosted --
   * common when waiting at somewhere like Jackson's Lighthouse.
   */
  startSupercharged?: boolean;
}

interface JournalModule {
  Slot: string;
  Item: string;
  On?: boolean;
  Engineering?: {
    Modifiers?: { Label: string; Value: number; OriginalValue?: number }[];
  };
}

interface JournalLoadout {
  event?: string;
  Ship?: string;
  ShipName?: string;
  UnladenMass?: number;
  CargoCapacity?: number;
  MaxJumpRange?: number;
  FuelCapacity?: { Main?: number; Reserve?: number };
  Modules?: JournalModule[];
}

function modifier(m: JournalModule, label: string): number | undefined {
  return m.Engineering?.Modifiers?.find(x => x.Label === label)?.Value;
}

/**
 * Turn an EDSY export into the numbers Spansh wants.
 *
 * Accepts either the raw array EDSY puts on the clipboard ([{header, data}]) or
 * a bare journal Loadout event, since people paste both.
 */
export function parseEdsyBuild(raw: string): ShipParams {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Not valid JSON — paste the whole EDSY export.');
  }

  const loadout: JournalLoadout = Array.isArray(parsed)
    ? (parsed[0] as { data?: JournalLoadout })?.data ?? (parsed[0] as JournalLoadout)
    : ((parsed as { data?: JournalLoadout }).data ?? (parsed as JournalLoadout));

  const modules = loadout?.Modules;
  if (!modules?.length) {
    throw new Error('No modules found — is this an EDSY "Journal" export?');
  }

  const fsd = modules.find(m => m.Slot === 'FrameShiftDrive');
  if (!fsd) throw new Error('No frame shift drive in this build.');

  const stats = FSD_STATS[fsd.Item?.toLowerCase()];
  if (!stats) throw new Error(`Unknown drive "${fsd.Item}" — the FSD table may need regenerating.`);

  // Engineering overrides optimal mass; the rest are properties of the drive
  // model and are never modified by blueprints.
  const optimalMass = modifier(fsd, 'FSDOptimalMass') ?? stats.optmass;

  const booster = modules.find(m => m.Item?.toLowerCase().includes('guardianfsdbooster'));
  const boosterSize = booster ? Number(booster.Item.match(/size(\d)/i)?.[1] ?? 0) : 0;
  // A powered-off booster contributes nothing.
  const rangeBoost = booster && booster.On !== false ? GUARDIAN_BOOSTER_LY[boosterSize] ?? 0 : 0;

  return {
    // Trimmed before falling back: an unnamed ship comes through as a single
    // space rather than an empty string, which is truthy, so the ship type was
    // never reached and the build showed up nameless.
    shipName: loadout.ShipName?.trim() || loadout.Ship || 'ship',
    sourceJson: raw,
    superchargeMultiplier: SUPERCHARGE_MULTIPLIERS[fsd.Item?.toLowerCase()],
    optimalMass,
    baseMass: loadout.UnladenMass ?? 0,
    tankSize: loadout.FuelCapacity?.Main ?? 0,
    internalTankSize: loadout.FuelCapacity?.Reserve ?? 0,
    maxFuelPerJump: stats.maxfuel,
    fuelPower: stats.fuelpower,
    fuelMultiplier: stats.fuelmul,
    rangeBoost,
    cargo: loadout.CargoCapacity ?? 0,
    cargoCapacity: loadout.CargoCapacity ?? 0,
    maxJumpRange: loadout.MaxJumpRange,
  };
}

function rangeAtMass(s: ShipParams, mass: number): number {
  if (mass <= 0) return 0;
  return (
    (s.optimalMass / mass) *
      Math.pow(s.maxFuelPerJump / s.fuelMultiplier, 1 / s.fuelPower) +
    s.rangeBoost
  );
}

/**
 * Realistic range: full tank, carrying whatever cargo is configured. This is
 * the figure EDSY shows as JUMP MIN.
 *
 * Verified against a Mandalay with a 5A overcharge drive and a size-5 Guardian
 * booster: EDSY reports MIN 77.98 / MAX 87.23, and these two functions return
 * 77.98 and 87.23 respectively. Worth re-checking if the FSD table is
 * regenerated -- that drive has a duplicate entry in coriolis-data whose
 * fuelmul differs (0.012 vs the correct 0.013), and picking the wrong one
 * shifts every estimate without any obvious symptom.
 */
export function jumpRange(s: ShipParams, cargo = s.cargo): number {
  return rangeAtMass(s, s.baseMass + s.tankSize + cargo);
}

/**
 * Best-case range: one jump of fuel, no cargo. This is the figure EDSY reports
 * as MaxJumpRange, so it doubles as a check that the build parsed correctly --
 * see verifyBuild below.
 */
export function maxJumpRange(s: ShipParams): number {
  return rangeAtMass(s, s.baseMass + s.maxFuelPerJump);
}

/**
 * Compare our derived range against the figure EDSY published in the same
 * export. A mismatch means the FSD table is stale or the build has a module we
 * mis-read, and the jump estimates would be quietly wrong -- better to surface
 * that than to show confident nonsense.
 */
export function verifyBuild(s: ShipParams): { ok: boolean; derived: number; reported?: number } {
  const derived = maxJumpRange(s);
  if (s.maxJumpRange === undefined) return { ok: true, derived };
  return {
    ok: Math.abs(derived - s.maxJumpRange) < 0.5,
    derived,
    reported: s.maxJumpRange,
  };
}

// ---------------------------------------------------------------- plotting

const cache = new Map<string, number>();
const CACHE_KEY = 'ratboard-spansh-cache';

try {
  const stored = localStorage.getItem(CACHE_KEY);
  if (stored) for (const [k, v] of Object.entries(JSON.parse(stored) as Record<string, number>)) {
    cache.set(k, v);
  }
} catch {
  /* a corrupt cache is not worth failing over */
}

function persist() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* quota — the in-memory cache still works for this session */
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Plot source -> destination and return the number of jumps.
 *
 * Systems are identified by id64, not name: the plotter rejects names. EDSM
 * supplies id64 via &showId=1.
 */
export async function plotJumps(
  sourceId64: number,
  destId64: number,
  distanceLy: number,
  ship: ShipParams,
  opts: PlotOptions = {},
  signal?: AbortSignal,
): Promise<number> {
  const supercharge =
    opts.useSupercharge ?? distanceLy >= NEUTRON_THRESHOLD_LY;

  const key = [
    sourceId64,
    destId64,
    supercharge ? 1 : 0,
    opts.startSupercharged ? 1 : 0,
    opts.scoopSecondary ? 1 : 0,
    ship.optimalMass,
    ship.baseMass,
    ship.cargo,
    ship.rangeBoost,
    ship.maxFuelPerJump,
  ].join(':');

  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const body = new URLSearchParams({
    source: String(sourceId64),
    destination: String(destId64),
    // "optimistic" is the plotter's own default. "fuel" optimises for fuel
    // burn instead and returns absurd routes -- 104 tiny hops across 380 ly.
    algorithm: 'optimistic',
    use_supercharge: supercharge ? '1' : '0',
    use_injections: '0',
    exclude_secondary: opts.scoopSecondary ? '0' : '1',
    is_supercharged: opts.startSupercharged ? '1' : '0',
    refuel_every_scoopable: '0',
    fuel_power: String(ship.fuelPower),
    fuel_multiplier: String(ship.fuelMultiplier),
    optimal_mass: String(ship.optimalMass),
    base_mass: String(ship.baseMass),
    tank_size: String(ship.tankSize),
    internal_tank_size: String(ship.internalTankSize),
    max_fuel_per_jump: String(ship.maxFuelPerJump),
    range_boost: String(ship.rangeBoost),
    cargo: String(ship.cargo),
  });

  // Only send it when the drive actually differs, so Spansh keeps applying its
  // own default for everything else. Irrelevant unless neutrons are in play.
  if (supercharge && ship.superchargeMultiplier) {
    body.set('supercharge_multiplier', String(ship.superchargeMultiplier));
  }

  const submit = await fetch(`${PROXY()}/spansh-proxy/api/generic/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal,
  });
  if (!submit.ok) throw new Error(`Spansh rejected the route (${submit.status})`);

  const { job } = (await submit.json()) as { job?: string };
  if (!job) throw new Error('Spansh returned no job id');

  // Plots usually land in well under 30s; give up rather than poll forever.
  for (let i = 0; i < 40; i++) {
    await sleep(i < 5 ? 500 : 1000);
    const res = await fetch(`${PROXY()}/spansh-proxy/api/results/${job}`, { signal });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      status?: string;
      result?: { jumps?: unknown[] };
    };
    if (data.status === 'ok') {
      const legs = data.result?.jumps?.length ?? 0;
      // The array includes the origin, so jumps is one fewer than entries.
      const jumps = Math.max(0, legs - 1);
      cache.set(key, jumps);
      persist();
      return jumps;
    }
  }
  throw new Error('Spansh timed out');
}
