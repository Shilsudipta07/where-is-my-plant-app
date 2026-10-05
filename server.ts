import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

// Calculate Haversine distance in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // API endpoint for nearby plant nurseries using verified OpenStreetMap Overpass
  app.get('/api/nurseries', async (req, res) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radiusMeters = parseInt(req.query.radius as string, 10) || 25000;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ nurseries: [], error: 'Invalid coordinates' });
    }

    const clampedRadius = Math.max(1000, Math.min(radiusMeters, 50000));
    const query = `[out:json][timeout:18];(nwr["shop"="garden_centre"](around:${clampedRadius},${lat},${lng});nwr["shop"="plant_nursery"](around:${clampedRadius},${lat},${lng});nwr["landuse"="plant_nursery"](around:${clampedRadius},${lat},${lng}););out center 40;`;

    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'BotanicaApp/1.0 (Botanical Exploration and Conservation; contact: info@botanica.app)',
            'Referer': 'https://overpass-turbo.eu/',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        if (!data || !Array.isArray(data.elements)) {
          continue;
        }

        const results = [];
        const seenCoords = new Set<string>();

        for (const el of data.elements) {
          const itemLat = el.lat ?? el.center?.lat;
          const itemLng = el.lon ?? el.center?.lon;
          if (itemLat == null || itemLng == null) continue;

          const coordKey = `${itemLat.toFixed(4)},${itemLng.toFixed(4)}`;
          if (seenCoords.has(coordKey)) continue;
          seenCoords.add(coordKey);

          const tags = el.tags || {};
          const name =
            tags.name ||
            tags['name:en'] ||
            tags.brand ||
            (tags.shop === 'garden_centre' ? 'Garden Centre & Nursery' : 'Plant Nursery');

          let address: string | undefined;
          if (tags['addr:full']) {
            address = tags['addr:full'];
          } else {
            const parts: string[] = [];
            if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
            if (tags['addr:street']) parts.push(tags['addr:street']);
            if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
            if (tags['addr:city']) parts.push(tags['addr:city']);
            if (parts.length > 0) address = parts.join(', ');
          }

          const phone = tags.phone || tags['contact:phone'] || undefined;
          const openingHours = tags.opening_hours || undefined;
          const website = tags.website || tags['contact:website'] || undefined;
          const type = (tags.landuse === 'plant_nursery' || tags.shop === 'plant_nursery') ? 'plant_nursery' : 'garden_centre';
          const distanceMeters = calculateDistanceMeters(lat, lng, itemLat, itemLng);

          results.push({
            id: `osm-${el.type}-${el.id}`,
            name,
            coordinates: { lat: itemLat, lng: itemLng },
            address,
            phone,
            openingHours,
            website,
            type,
            distanceMeters,
          });
        }

        results.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
        return res.json({ nurseries: results });
      } catch (err) {
        // Fall back to next endpoint
      }
    }

    return res.json({ nurseries: [] });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Botanica Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
