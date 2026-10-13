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

    // 2. OpenStreetMap Nominatim Bounding Box Query for real nurseries and garden centres across India
    try {
      const R = 6371; // Earth radius in km
      const radiusKm = clampedRadius / 1000;
      const deltaLat = (radiusKm / R) * (180 / Math.PI);
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const deltaLon = (radiusKm / (R * (Math.abs(cosLat) > 0.0001 ? cosLat : 1))) * (180 / Math.PI);

      const minLon = +(lng - deltaLon).toFixed(4);
      const maxLat = +(lat + deltaLat).toFixed(4);
      const maxLon = +(lng + deltaLon).toFixed(4);
      const minLat = +(lat - deltaLat).toFixed(4);
      const viewboxStr = `${minLon},${maxLat},${maxLon},${minLat}`;

      const queries = ['garden centre', 'plant nursery', 'plant shop'];
      const results: any[] = [];
      const seenCoords = new Set<string>();

      for (const q of queries) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            q
          )}&format=json&limit=50&viewbox=${viewboxStr}&bounded=1&addressdetails=1&extratags=1`;

          const response = await fetch(nomUrl, {
            headers: {
              'User-Agent': 'WhereIsMyPlant/1.0 (Botanical Discovery Platform; contact: info@botanica.app)',
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) continue;

          const items = await response.json();
          if (!Array.isArray(items)) continue;

          for (const item of items) {
            const itemLat = parseFloat(item.lat);
            const itemLng = parseFloat(item.lon);
            if (isNaN(itemLat) || isNaN(itemLng)) continue;

            // Reject educational schools, daycares, kindergartens
            if (item.class === 'amenity' || item.type === 'kindergarten' || item.type === 'school') {
              continue;
            }

            const nameRaw = (item.name || item.display_name?.split(',')?.[0] || '').trim();
            const lowerName = nameRaw.toLowerCase();
            if (
              lowerName.includes('school') ||
              lowerName.includes('preschool') ||
              lowerName.includes('kindergarten') ||
              lowerName.includes('creche') ||
              lowerName.includes('play school') ||
              lowerName.includes('child study') ||
              lowerName.includes('climbing')
            ) {
              continue;
            }

            const coordKey = `${itemLat.toFixed(4)},${itemLng.toFixed(4)}`;
            if (seenCoords.has(coordKey)) continue;
            seenCoords.add(coordKey);

            const distanceMeters = calculateDistanceMeters(lat, lng, itemLat, itemLng);
            if (distanceMeters > clampedRadius) {
              continue; // Requirement 3 & 7: Strictly filter by radius
            }

            let type = 'plant_nursery';
            if (item.type === 'garden_centre' || (item.class === 'shop' && item.type === 'garden_centre')) {
              type = 'garden_centre';
            } else if (item.type === 'florist' || lowerName.includes('florist') || lowerName.includes('flower')) {
              type = 'plant_shop';
            }

            let address: string | undefined;
            if (item.address && typeof item.address === 'object') {
              const parts: string[] = [];
              const addr = item.address;
              if (addr.road) parts.push(addr.road);
              if (addr.neighbourhood && addr.neighbourhood !== addr.road) parts.push(addr.neighbourhood);
              if (addr.suburb && !parts.includes(addr.suburb)) parts.push(addr.suburb);
              if (addr.city_district && !parts.includes(addr.city_district)) parts.push(addr.city_district);
              if (addr.city && !parts.includes(addr.city)) parts.push(addr.city);
              if (addr.state && !parts.includes(addr.state)) parts.push(addr.state);
              if (addr.postcode) parts.push(addr.postcode);
              if (parts.length > 0) address = parts.join(', ');
            }
            if (!address && item.display_name) {
              address = item.display_name;
            }

            const extratags = item.extratags || {};
            const phone =
              extratags.phone ||
              extratags['contact:phone'] ||
              extratags['contact:mobile'] ||
              undefined;
            const openingHours = extratags.opening_hours || undefined;
            const website = extratags.website || extratags['contact:website'] || undefined;

            const defaultName =
              type === 'garden_centre'
                ? 'Garden Centre & Nursery'
                : type === 'plant_shop'
                ? 'Plant & Flower Shop'
                : 'Plant Nursery';
            const finalName = nameRaw || defaultName;

            const destinationQuery = `${itemLat},${itemLng}+(${encodeURIComponent(finalName)})`;
            const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destinationQuery}&travelmode=driving`;

            results.push({
              id: `osm-${item.osm_type || 'node'}-${item.osm_id || item.place_id}`,
              name: finalName,
              coordinates: { lat: itemLat, lng: itemLng },
              address,
              phone,
              openingHours,
              website,
              type,
              distanceMeters,
              googleMapsDirectionsUrl,
            });
          }
        } catch (_nomErr) {
          // Continue to next query
        }
      }

      if (results.length > 0) {
        results.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
        return res.json({ nurseries: results });
      }
    } catch (_err) {
      // Fall through to Overpass
    }

    // 3. OpenStreetMap Overpass query fallback
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
            'User-Agent': 'WhereIsMyPlant/1.0 (Botanical Exploration and Conservation; contact: info@botanica.app)',
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

          if (distanceMeters > clampedRadius) continue;

          const destinationQuery = `${itemLat},${itemLng}+(${encodeURIComponent(name)})`;
          const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destinationQuery}&travelmode=driving`;

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
            googleMapsDirectionsUrl,
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
