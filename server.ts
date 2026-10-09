import 'dotenv/config';
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

// Parse Geoapify Places API features into nursery objects
function parseGeoapifyFeatures(features: any[], originLat: number, originLng: number) {
  const results = [];
  const seenCoords = new Set<string>();

  for (const feature of features) {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const itemLat = typeof props.lat === 'number' ? props.lat : geom.coordinates?.[1];
    const itemLng = typeof props.lon === 'number' ? props.lon : geom.coordinates?.[0];

    if (itemLat == null || itemLng == null || isNaN(itemLat) || isNaN(itemLng)) continue;

    const coordKey = `${Number(itemLat).toFixed(4)},${Number(itemLng).toFixed(4)}`;
    if (seenCoords.has(coordKey)) continue;
    seenCoords.add(coordKey);

    const categories: string[] = Array.isArray(props.categories) ? props.categories : [];
    const isGardenCentre = categories.some((c: string) => c.includes('garden_centre'));

    // commercial.garden_centre -> garden_centre; commercial.florist -> plant_shop
    const type = isGardenCentre ? 'garden_centre' : 'plant_shop';
    const defaultName = isGardenCentre ? 'Garden Centre & Nursery' : 'Plant & Flower Shop';
    const name = props.name || props.address_line1 || defaultName;

    const address = props.formatted || props.address_line2 || undefined;
    const phone = props.contact?.phone || props.phone || undefined;
    const openingHours = props.opening_hours || undefined;
    const website = props.website || props.contact?.url || undefined;
    const distanceMeters =
      typeof props.distance === 'number'
        ? Math.round(props.distance)
        : calculateDistanceMeters(originLat, originLng, itemLat, itemLng);

    const placeId = props.place_id || `geoapify-${itemLat}-${itemLng}`;

    results.push({
      id: `geo-${placeId}`,
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
  return results;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // API endpoint for nearby plant nurseries
  app.get('/api/nurseries', async (req, res) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radiusMeters = parseInt(req.query.radius as string, 10) || 25000;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ nurseries: [], error: 'Invalid coordinates' });
    }

    const clampedRadius = Math.max(1000, Math.min(radiusMeters, 50000));

    // 1. Try Geoapify Places API if key is available in environment
    const geoapifyKey = (process.env.VITE_GEOAPIFY_API_KEY || process.env.GEOAPIFY_API_KEY || '').trim();
    if (geoapifyKey && geoapifyKey !== 'MY_GEOAPIFY_API_KEY') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const geoUrl = `https://api.geoapify.com/v2/places?categories=commercial.garden_centre,commercial.florist&filter=circle:${encodeURIComponent(lng)},${encodeURIComponent(lat)},${encodeURIComponent(clampedRadius)}&bias=proximity:${encodeURIComponent(lng)},${encodeURIComponent(lat)}&limit=50&apiKey=${encodeURIComponent(geoapifyKey)}`;

        const geoRes = await fetch(geoUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData && Array.isArray(geoData.features) && geoData.features.length > 0) {
            const nurseries = parseGeoapifyFeatures(geoData.features, lat, lng);
            return res.json({ nurseries });
          }
        }
      } catch (_geoErr) {
        // Fall through to Overpass
      }
    }

    // 2. OpenStreetMap Overpass query using verified endpoints
    const query = `[out:json][timeout:20];(nw["landuse"="plant_nursery"](around:${clampedRadius},${lat},${lng});nw["shop"="garden_centre"](around:${clampedRadius},${lat},${lng});nw["shop"="plant_nursery"](around:${clampedRadius},${lat},${lng});nw["shop"="nursery"](around:${clampedRadius},${lat},${lng}););out center 40;`;

    const endpoints = [
      'https://overpass.maprva.org/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass-api.de/api/interpreter',
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

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
          const type = (tags.landuse === 'plant_nursery' || tags.shop === 'plant_nursery' || tags.shop === 'nursery') ? 'plant_nursery' : 'garden_centre';
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
      } catch (_err) {
        // Fall back to next endpoint
      }
    }

    return res.json({ nurseries: [] });
  });

  // Dedicated route for sitemap.xml ensuring valid XML Content-Type and HTTP 200
  app.get('/sitemap.xml', (_req, res) => {
    const sitemapDist = path.resolve(process.cwd(), 'dist', 'sitemap.xml');
    const sitemapPublic = path.resolve(process.cwd(), 'public', 'sitemap.xml');
    const targetFile = process.env.NODE_ENV === 'production' ? sitemapDist : sitemapPublic;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.sendFile(targetFile, (err) => {
      if (err) {
        // Fallback to public directory if dist is not yet built
        res.sendFile(sitemapPublic, (fallbackErr) => {
          if (fallbackErr) {
            res.status(500).type('text/plain').send('Sitemap not found');
          }
        });
      }
    });
  });

  // Dedicated route for robots.txt ensuring text/plain Content-Type and HTTP 200
  app.get('/robots.txt', (_req, res) => {
    const robotsDist = path.resolve(process.cwd(), 'dist', 'robots.txt');
    const robotsPublic = path.resolve(process.cwd(), 'public', 'robots.txt');
    const targetFile = process.env.NODE_ENV === 'production' ? robotsDist : robotsPublic;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    res.sendFile(targetFile, (err) => {
      if (err) {
        res.sendFile(robotsPublic, (fallbackErr) => {
          if (fallbackErr) {
            res.status(500).type('text/plain').send('Robots.txt not found');
          }
        });
      }
    });
  });

  // Redirect /sitemap and trailing-slash variations to /sitemap.xml
  app.get(['/sitemap', '/sitemap/', '/sitemap.xml/'], (_req, res) => {
    res.redirect(301, '/sitemap.xml');
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
