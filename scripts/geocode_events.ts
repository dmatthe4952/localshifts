import { createDb } from '../src/db.js';

function readArg(name: string): string | null {
  const args = process.argv.slice(2);
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return typeof args[idx + 1] === 'string' ? args[idx + 1] : '';
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeocodeResult = { lat: number; lng: number } | null;

function parseCoordsFromMapUrl(rawUrl: string | null | undefined): GeocodeResult {
  const text = String(rawUrl ?? '').trim();
  if (!text) return null;

  const fromPair = (latRaw: string, lngRaw: string): GeocodeResult => {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  };

  // Common Google Maps forms:
  // .../@40.7128,-74.0060,15z
  // ...?q=40.7128,-74.0060
  // ...?ll=40.7128,-74.0060
  // ...?query=40.7128,-74.0060
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    const parsed = fromPair(m[1] ?? '', m[2] ?? '');
    if (parsed) return parsed;
  }
  return null;
}

async function geocodeLocationName(q: string): Promise<GeocodeResult> {
  const variants = Array.from(
    new Set(
      [
        q,
        q.replace(/\s*,\s*/g, ', '),
        `${q.replace(/\s*,\s*/g, ', ')}, USA`,
        q.replace(/,\s*([A-Z]{2})(\b|$)/, ', $1')
      ]
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    for (const candidate of variants) {
      const url =
        'https://nominatim.openstreetmap.org/search?' +
        `q=${encodeURIComponent(candidate)}&countrycodes=us&format=jsonv2&limit=1`;
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'LocalShifts/0.1 (https://www.trtechapp.com)'
        }
      });
      if (!res.ok) continue;
      const body = (await res.json()) as Array<Record<string, unknown>>;
      const first = Array.isArray(body) ? body[0] : null;
      if (!first) continue;
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) continue;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const includeExisting = hasFlag('--all');
  const limitRaw = readArg('--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const sleepMsRaw = readArg('--sleep-ms');
  const sleepMs = sleepMsRaw ? Number(sleepMsRaw) : 1100;

  if (limitRaw && (!Number.isFinite(limit as number) || (limit as number) <= 0)) {
    throw new Error('Invalid --limit value.');
  }
  if (!Number.isFinite(sleepMs) || sleepMs < 0) {
    throw new Error('Invalid --sleep-ms value.');
  }

  const db = createDb();
  try {
    let q = db
      .selectFrom('events')
      .select(['id', 'title', 'location_name', 'location_map_url', 'location_lat', 'location_lng'])
      .where((eb) =>
        eb.or([
          eb.and([eb('location_name', 'is not', null), eb('location_name', '!=', '')]),
          eb.and([eb('location_map_url', 'is not', null), eb('location_map_url', '!=', '')])
        ])
      );

    if (!includeExisting) {
      q = q.where((eb) =>
        eb.or([eb('location_lat', 'is', null), eb('location_lng', 'is', null)])
      );
    }

    const rows = await q.orderBy('updated_at', 'desc').execute();
    const selected = limit ? rows.slice(0, limit) : rows;

    // eslint-disable-next-line no-console
    console.log(
      `[geocode-events] starting candidates=${selected.length} dryRun=${dryRun} includeExisting=${includeExisting} sleepMs=${sleepMs}`
    );
    if (selected.length === 0) return;

    const cache = new Map<string, GeocodeResult>();
    let geocodeCalls = 0;
    let updated = 0;
    let skippedNoMatch = 0;
    let unchanged = 0;

    for (const row of selected) {
      const locationName = String(row.location_name ?? '').trim();
      const locationKey = locationName || String(row.location_map_url ?? '').trim();
      if (!locationKey) continue;

      let geo = cache.get(locationKey);
      if (geo === undefined) {
        // Fast path: use explicit coordinates from map URL if present.
        geo = parseCoordsFromMapUrl(row.location_map_url);
        if (!geo) {
          if (geocodeCalls > 0 && sleepMs > 0) await sleep(sleepMs);
          geo = locationName ? await geocodeLocationName(locationName) : null;
          geocodeCalls++;
        }
        cache.set(locationKey, geo);
      }

      if (!geo) {
        skippedNoMatch++;
        // eslint-disable-next-line no-console
        console.log(`[geocode-events] no-match id=${row.id} title="${row.title}" location="${locationName}"`);
        continue;
      }

      const currentLat = row.location_lat == null ? null : Number(row.location_lat);
      const currentLng = row.location_lng == null ? null : Number(row.location_lng);
      const alreadySame =
        currentLat != null &&
        currentLng != null &&
        Math.abs(currentLat - geo.lat) < 0.000001 &&
        Math.abs(currentLng - geo.lng) < 0.000001;

      if (alreadySame) {
        unchanged++;
        continue;
      }

      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(
          `[geocode-events] dry-run id=${row.id} title="${row.title}" -> lat=${geo.lat.toFixed(6)} lng=${geo.lng.toFixed(6)}`
        );
        updated++;
        continue;
      }

      await db
        .updateTable('events')
        .set({
          location_lat: geo.lat.toFixed(6),
          location_lng: geo.lng.toFixed(6)
        })
        .where('id', '=', row.id)
        .execute();

      updated++;
      // eslint-disable-next-line no-console
      console.log(
        `[geocode-events] updated id=${row.id} title="${row.title}" lat=${geo.lat.toFixed(6)} lng=${geo.lng.toFixed(6)}`
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      `[geocode-events] done candidates=${selected.length} geocodeCalls=${geocodeCalls} updated=${updated} unchanged=${unchanged} noMatch=${skippedNoMatch}`
    );
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
