import { bridgeProxyUrl } from './bridgeUrls';

export interface LanAccessUrl {
  host: string;
  board: string;
  ws: string;
  proxy: string;
}

export interface LanAccessStatus {
  enabled: boolean;
  bind: string;
  ports: { board: number; ws: number; proxy: number };
  urls: LanAccessUrl[];
}

async function parse(res: Response): Promise<LanAccessStatus> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<LanAccessStatus>;
}

export async function fetchLanStatus(): Promise<LanAccessStatus> {
  return parse(await fetch(`${bridgeProxyUrl()}/lan`));
}

export async function setLanAccess(enabled: boolean): Promise<LanAccessStatus> {
  return parse(await fetch(`${bridgeProxyUrl()}/lan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }));
}
