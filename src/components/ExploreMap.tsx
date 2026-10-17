import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { Plant, Coordinates, CommunityObservation } from '../types/plant';
import { DEMO_CAMPUS_CENTER } from '../data/samplePlants';
import {
  INaturalistObservationRecord,
  INaturalistTaxon,
  searchINaturalistTaxa,
  fetchObservationsByTaxon,
  fetchNearbyPlantObservations,
  searchPlantObservations,
} from '../services/inaturalistService';
import { getStoredCommunityObservations, initCommunityObservationsSync } from '../services/observationStorage';
import { PlantNursery, fetchNearbyPlantNurseries } from '../services/nurseryService';
import { PlantOccurrenceRecord, fetchGbifIndiaOccurrences, IndiaSourceFilter } from '../services/gbifService';
import { calculateDistanceKm, formatDistance } from '../utils/geoUtils';
import {
  MapPin,
  Navigation,
  Eye,
  Info,
  Sparkles,
  Filter,
  Compass,
  Search,
  RotateCcw,
  RotateCw,
  Globe,
  Loader2,
  AlertCircle,
  ExternalLink,
  Database,
  Crosshair,
  Radio,
  LocateFixed,
  ShieldCheck,
  RefreshCw,
  Layers,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export type RadiusKmOption = 5 | 10 | 25 | 50;

interface ExploreMapProps {
  plants: Plant[];
  selectedPlant: Plant | null;
  selectedPlantId?: string | null;
  selectedPlantCoordinates?: Coordinates | null;
  onSelectPlant: (plant: Plant) => void;
  userLocation: Coordinates | null;
  onLocateUser: () => void;
  isLocating: boolean;
  locationError?: string | null;
  onClearLocationError?: () => void;
  initialInatSearch?: string;
  initialInatRecords?: INaturalistObservationRecord[];
  initialInatTaxon?: INaturalistTaxon | null;
  // Community observation props
  communityObservations?: CommunityObservation[];
  selectedCommunityObservation?: CommunityObservation | null;
  onSelectCommunityObservation?: (obs: CommunityObservation) => void;
  // Legacy / fallback props
  initialGbifSearch?: string;
  initialGbifRecords?: any[];
  initialGbifSpecies?: any;
  onUpdateUserLocation?: (coords: Coordinates | null) => void;
  autoStartTracking?: boolean;
  isActive?: boolean;
}

// Default India Geographic Coordinates for initial overview (when no user GPS or species search)
const DEFAULT_INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_INDIA_ZOOM = 5;

// Haversine distance in meters
const getHaversineDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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
  return R * c;
};

// Distance in meters from GPS point (pLat, pLng) to line segment (aLat, aLng) -> (bLat, bLng)
const getDistanceToSegmentMeters = (
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number => {
  const cosLat = Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  const x = (pLng - aLng) * cosLat * 111320;
  const y = (pLat - aLat) * 110540;
  const dx = (bLng - aLng) * cosLat * 111320;
  const dy = (bLat - aLat) * 110540;

  const segLengthSq = dx * dx + dy * dy;
  if (segLengthSq === 0) {
    return Math.sqrt(x * x + y * y);
  }

  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / segLengthSq));
  const projX = t * dx;
  const projY = t * dy;

  const distX = x - projX;
  const distY = y - projY;
  return Math.sqrt(distX * distX + distY * distY);
};

// Minimum distance from GPS point to polyline and index of closest segment
const getMinDistanceToRoute = (
  lat: number,
  lng: number,
  coords: [number, number][]
): { minDistance: number; closestSegmentIndex: number } => {
  let minDistance = Infinity;
  let closestSegmentIndex = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const dist = getDistanceToSegmentMeters(
      lat,
      lng,
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1]
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestSegmentIndex = i;
    }
  }

  return { minDistance, closestSegmentIndex };
};

// Safe HTML escaper for dynamic OpenStreetMap labels and popup strings
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Calculates 8-point compass cardinal direction from degrees (0 to 360)
const getCardinalDirection = (deg: number): string => {
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return 'N';
  if (normalized >= 22.5 && normalized < 67.5) return 'NE';
  if (normalized >= 67.5 && normalized < 112.5) return 'E';
  if (normalized >= 112.5 && normalized < 157.5) return 'SE';
  if (normalized >= 157.5 && normalized < 202.5) return 'S';
  if (normalized >= 202.5 && normalized < 247.5) return 'SW';
  if (normalized >= 247.5 && normalized < 292.5) return 'W';
  return 'NW';
};

// Determines if a plant record is a genuine user submission from Firestore or local creation
// Based strictly on trustworthy data schema fields rather than arbitrary ID assumptions
const isUserSubmittedPlant = (plant: Plant): boolean => {
  if (!plant) return false;
  // Trustworthy schema flags set by Firestore mapping and plant submission forms
  if (plant.isUserAdded === true) return true;
  if (typeof plant.ownerUid === 'string' && plant.ownerUid.trim().length > 0) return true;
  if (typeof plant.ownerUsername === 'string' && plant.ownerUsername.trim().length > 0) return true;
  if (plant.createdAt) return true;
  return false;
};

// Strict coordinate validator: validates latitude (-90 to 90) and longitude (-180 to 180)
// Preserves valid geographic coordinates without inventing false locations.
const getValidPlantCoordinates = (plant: Plant): Coordinates | null => {
  if (!plant || !plant.coordinates) return null;
  const rawLat = (plant.coordinates as any).lat;
  const rawLng = (plant.coordinates as any).lng;
  const lat = typeof rawLat === 'string' ? parseFloat(rawLat) : rawLat;
  const lng = typeof rawLng === 'string' ? parseFloat(rawLng) : rawLng;

  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    isNaN(lat) ||
    isNaN(lng) ||
    !isFinite(lat) ||
    !isFinite(lng)
  ) {
    return null;
  }

  // Standard geographic latitude (-90 to 90) and longitude (-180 to 180)
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng, accuracy: plant.coordinates.accuracy };
};


export const ExploreMap: React.FC<ExploreMapProps> = ({
  plants,
  selectedPlant,
  selectedPlantId,
  selectedPlantCoordinates,
  onSelectPlant,
  userLocation,
  onLocateUser,
  isLocating,
  locationError,
  onClearLocationError,
  initialInatSearch,
  initialInatRecords,
  initialInatTaxon,
  communityObservations: propCommunityObservations,
  selectedCommunityObservation,
  onSelectCommunityObservation,
  initialGbifSearch,
  initialGbifRecords,
  initialGbifSpecies,
  onUpdateUserLocation,
  autoStartTracking,
  isActive = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const demoMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const inatMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const communityMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const indiaMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const userPlantsLayerRef = useRef<L.LayerGroup | null>(null);
  const selectedPlantMarkerLayerRef = useRef<L.LayerGroup | null>(null);
  const nurseryMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);
  const userRadiusCircleRef = useRef<L.Circle | null>(null);
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  // Safely resolve selected plant record and coordinates
  const effectiveSelectedPlant = useMemo(() => {
    const fromList = selectedPlantId ? plants.find((p) => p.id === selectedPlantId) : null;
    if (selectedPlant && fromList) {
      return { ...fromList, ...selectedPlant };
    }
    if (selectedPlant) return selectedPlant;
    if (fromList) return fromList;
    return null;
  }, [selectedPlant, selectedPlantId, plants]);

  const targetCoordinates: Coordinates | null = useMemo(() => {
    const rawCoords = selectedPlantCoordinates || effectiveSelectedPlant?.coordinates;
    if (!rawCoords) return null;
    const lat = typeof rawCoords.lat === 'string' ? parseFloat(rawCoords.lat) : rawCoords.lat;
    const lng = typeof rawCoords.lng === 'string' ? parseFloat(rawCoords.lng) : rawCoords.lng;
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { lat, lng, accuracy: rawCoords.accuracy };
    }
    return null;
  }, [effectiveSelectedPlant, selectedPlantCoordinates]);

  // Plant Nurseries State
  const [nurseries, setNurseries] = useState<PlantNursery[]>([]);
  const nurseriesRef = useRef<PlantNursery[]>([]);
  const [isLoadingNurseries, setIsLoadingNurseries] = useState<boolean>(false);
  const [showNurseries, setShowNurseries] = useState<boolean>(false);
  const [nurseryNotice, setNurseryNotice] = useState<string | null>(null);
  const renderNurseryMarkersRef = useRef<((list: PlantNursery[]) => void) | null>(null);

  // Active Navigation Route State
  const [activeRoute, setActiveRoute] = useState<{
    destinationName: string;
    destinationCoords: Coordinates;
    distanceMeters: number;
    durationSeconds: number;
    coordinates: [number, number][];
    originalDistanceMeters?: number;
    originalDurationSeconds?: number;
  } | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isReroutingUI, setIsReroutingUI] = useState<boolean>(false);

  // Refs for real-time live navigation tracking without closure staleness
  const activeRouteRef = useRef<typeof activeRoute>(null);
  activeRouteRef.current = activeRoute;
  const isNavigatingRef = useRef<boolean>(false);
  const startedTrackingForNavRef = useRef<boolean>(false);
  const isReroutingRef = useRef<boolean>(false);
  const lastRerouteTimeRef = useRef<number>(0);
  const fetchAndDrawRouteRef = useRef<((start: Coordinates, dest: Coordinates, name: string, isAutoReroute?: boolean) => Promise<void>) | null>(null);

  // Tile layer references
  const streetTileLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteTileLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLabelsLayerRef = useRef<L.TileLayer | null>(null);

  // Map view mode: 'map' (OpenStreetMap) or 'satellite' (Esri World Imagery)
  const [mapStyle, setMapStyle] = useState<'map' | 'satellite'>('map');

  // Fullscreen expand / collapse mode
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);

  // Resize Leaflet and handle body scroll lock when expanding or collapsing fullscreen
  useEffect(() => {
    if (isMapFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    const timer1 = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);
    const timer2 = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 300);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      document.body.style.overflow = '';
    };
  }, [isMapFullscreen]);

  // Escape key collapses fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMapFullscreen) {
        setIsMapFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMapFullscreen]);

  // Real Observation Data State (iNaturalist Public Observations)
  const [inatRecords, setInatRecords] = useState<INaturalistObservationRecord[]>(() => initialInatRecords || []);
  const [inatTaxon, setInatTaxon] = useState<INaturalistTaxon | null>(() => initialInatTaxon || null);
  const [isLoadingObservations, setIsLoadingObservations] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Searching for observations...');
  const [observationError, setObservationError] = useState<string | null>(null);

  // Active data source: 'india' (GBIF India botanical observations), 'real' (iNaturalist), or 'demo' (Campus arboretum fallback)
  const [activeDataSource, setActiveDataSource] = useState<'india' | 'real' | 'demo'>('india');

  // India Observations State (GBIF Botanical Occurrences)
  const [indiaRecords, setIndiaRecords] = useState<PlantOccurrenceRecord[]>(() =>
    initialGbifRecords && Array.isArray(initialGbifRecords) ? initialGbifRecords : []
  );
  const [selectedIndiaObsId, setSelectedIndiaObsId] = useState<string | null>(null);
  const [indiaMeta, setIndiaMeta] = useState<{
    totalCount: number;
    georeferencedCount: number;
    missingCoordsCount: number;
    skippedCount: number;
  }>({
    totalCount: initialGbifRecords?.length || 0,
    georeferencedCount: initialGbifRecords?.length || 0,
    missingCoordsCount: 0,
    skippedCount: 0,
  });
  const [selectedIndiaSpeciesFilter, setSelectedIndiaSpeciesFilter] = useState<string>('All India Flora');
  const [selectedIndiaSourceFilter, setSelectedIndiaSourceFilter] = useState<IndiaSourceFilter>('all');
  const [, setIndiaOffset] = useState<number>(0);
  const [hasMoreIndia, setHasMoreIndia] = useState<boolean>(false);
  const [isLoadingMoreIndia, setIsLoadingMoreIndia] = useState<boolean>(false);

  // Nearby Mode & Search Terms
  const [isNearbyMode, setIsNearbyMode] = useState<boolean>(false);
  const [currentQueryName, setCurrentQueryName] = useState<string>(() => initialInatSearch || initialGbifSearch || 'India Flora');
  const [mapSearchTerm, setMapSearchTerm] = useState<string>(() => initialInatSearch || initialGbifSearch || '');

  // Radius options (Requirement 3: 1 km, 5 km, 10 km, 25 km, 50 km; starts with 10 km)
  const [radiusKm, setRadiusKm] = useState<RadiusKmOption>(10);

  // Interactive Map Rotation & Reset North State (Enabled ONLY during active road navigation)
  const [mapRotation, setMapRotation] = useState<number>(0);
  const [isTouchRotating, setIsTouchRotating] = useState<boolean>(false);
  const touchStartAngleRef = useRef<number>(0);
  const touchStartRotationRef = useRef<number>(0);

  // Automatically reset map to North-up (0°) whenever navigation is stopped, cleared, or finished
  useEffect(() => {
    if (!activeRoute) {
      setMapRotation(0);
      setIsTouchRotating(false);
    }
  }, [activeRoute]);

  const handleResetNorth = useCallback(() => {
    setIsTouchRotating(false);
    setMapRotation(0);
  }, []);

  const handleRotateBy = useCallback((deltaDeg: number) => {
    // Only allow rotation while road navigation is actively running
    if (!activeRoute) return;
    setIsTouchRotating(false);
    setMapRotation((prev) => {
      let next = (prev + deltaDeg) % 360;
      if (next < 0) next += 360;
      return next;
    });
  }, [activeRoute]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow two-finger rotation gesture while road navigation is actively running
    if (!activeRoute) return;

    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
      touchStartAngleRef.current = angle;
      touchStartRotationRef.current = mapRotation;
      setIsTouchRotating(true);
    }
  }, [activeRoute, mapRotation]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!activeRoute) {
      if (isTouchRotating) setIsTouchRotating(false);
      return;
    }
    if (isTouchRotating && e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
      const delta = currentAngle - touchStartAngleRef.current;
      let newRotation = (touchStartRotationRef.current + delta) % 360;
      if (newRotation < 0) newRotation += 360;
      setMapRotation(Math.round(newRotation));
    }
  }, [activeRoute, isTouchRotating]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2 && isTouchRotating) {
      setIsTouchRotating(false);
    }
  }, [isTouchRotating]);

  // Track window/orientation resize so aspect ratio dynamically recalculates
  const [, setViewportTick] = useState<number>(0);
  useEffect(() => {
    const handleResize = () => setViewportTick((t) => (t + 1) % 1000);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Compute exact geometric scale factor to guarantee the rotated Leaflet canvas
  // completely circumscribes and covers the rectangular viewport with zero black triangular corners
  const getRotationScale = useCallback((deg: number): number => {
    if (!activeRoute || deg === 0) return 1;
    const parent = mapContainerRef.current?.parentElement;
    const w = parent?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 360);
    const h = parent?.clientHeight || (typeof window !== 'undefined' ? (isMapFullscreen ? window.innerHeight : 480) : 480);
    const aspect = Math.max(w / Math.max(h, 1), h / Math.max(w, 1));
    const rad = (deg * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(rad));
    const absSin = Math.abs(Math.sin(rad));
    // Exact mathematical formula for a rotated rectangle to circumscribe the viewport:
    const requiredScale = absCos + aspect * absSin;
    // 2.5% anti-aliasing buffer to prevent subpixel hairline rounding artifacts
    return Math.max(1, requiredScale * 1.025);
  }, [activeRoute, isMapFullscreen]);

  // Community Observations List State
  const [communityObsList, setCommunityObsList] = useState<CommunityObservation[]>(() =>
    propCommunityObservations || getStoredCommunityObservations()
  );

  useEffect(() => {
    if (propCommunityObservations) {
      setCommunityObsList(propCommunityObservations);
    }
  }, [propCommunityObservations]);

  useEffect(() => {
    const unsubscribe = initCommunityObservationsSync((records: CommunityObservation[]) => {
      setCommunityObsList(records);
    });
    const handleUpdate = () => {
      setCommunityObsList(getStoredCommunityObservations());
    };
    window.addEventListener('community-observations-updated', handleUpdate);
    return () => {
      unsubscribe();
      window.removeEventListener('community-observations-updated', handleUpdate);
    };
  }, []);

  // Spotlight active item (including GBIF India observations)
  const [activeItem, setActiveItem] = useState<{
    type: 'plant' | 'inat' | 'community' | 'nursery' | 'gbif';
    plant?: Plant;
    inat?: INaturalistObservationRecord;
    community?: CommunityObservation;
    nursery?: PlantNursery;
    gbif?: PlantOccurrenceRecord;
  } | null>(null);

  // Real-time Geolocation tracking state (Continuous watchPosition)
  const [localUserLocation, setLocalUserLocation] = useState<Coordinates | null>(() => userLocation || null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [isLocatingInternal, setIsLocatingInternal] = useState<boolean>(false);
  const [internalLocationError, setInternalLocationError] = useState<string | null>(null);
  const [lowAccuracyWarning, setLowAccuracyWarning] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);

  // Refs for tracking handles and timestamps
  const watchIdRef = useRef<number | null>(null);
  const isFollowingRef = useRef<boolean>(false);
  const lastFixTimestampRef = useRef<number>(0);
  const userStoppedTrackingRef = useRef<boolean>(false);
  const hasAutoStartedTrackingRef = useRef<boolean>(false);
  const isNearbyModeRef = useRef<boolean>(false);
  const radiusKmRef = useRef<RadiusKmOption>(10);
  const pendingNearbySearchRef = useRef<boolean>(false);
  const pendingNurserySearchRef = useRef<boolean>(false);
  const appliedInitialKeyRef = useRef<string>('');
  const hasUserPannedOrZoomedRef = useRef<boolean>(false);

  useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);

  useEffect(() => {
    isNearbyModeRef.current = isNearbyMode;
  }, [isNearbyMode]);

  useEffect(() => {
    radiusKmRef.current = radiusKm;
  }, [radiusKm]);

  const activeUserLocation = localUserLocation || userLocation;

  /**
   * Stop continuous GPS location tracking safely
   */
  const stopLocationTracking = useCallback(() => {
    userStoppedTrackingRef.current = true;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setIsLocatingInternal(false);
    setGpsAccuracy(null);
    setIsFollowing(false);
    isFollowingRef.current = false;
  }, []);

  /**
   * Load real observations nearby given latitude, longitude, and radius (in km)
   */
  const loadNearbyObservations = useCallback(
    async (lat: number, lng: number, radius: RadiusKmOption) => {
      setIsLoadingObservations(true);
      setObservationError(null);
      setLoadingMessage('Searching for nearby observations...');
      setActiveDataSource('real');
      setIsNearbyMode(true);
      setCurrentQueryName(`Plants within ${radius} km`);

      try {
        const obs = await fetchNearbyPlantObservations(lat, lng, radius, { limit: 60 });
        setInatRecords(obs);
        setInatTaxon(null);

        const map = mapInstanceRef.current;
        if (map) {
          if (obs.length > 0) {
            const bounds = L.latLngBounds([
              [lat, lng],
              ...obs.map((r: INaturalistObservationRecord) => [r.coordinates.lat, r.coordinates.lng] as [number, number]),
            ]);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            setActiveItem({ type: 'inat', inat: obs[0] });
          } else {
            // Center map on user location if 0 observations found
            map.setView([lat, lng], 13, { animate: true });
            setActiveItem(null);
          }
        }
      } catch (err) {
        console.warn('[ExploreMap] Note on loading nearby observations:', err);
        setObservationError('Unable to load observations. Please try again.');
      } finally {
        setIsLoadingObservations(false);
      }
    },
    []
  );

  /**
   * Load verified India botanical observations from GBIF
   */
  const loadIndiaObservations = useCallback(
    async (
      speciesQuery?: string,
      keepBounds: boolean = false,
      offset: number = 0,
      sourceOverride?: IndiaSourceFilter
    ) => {
      const isAppend = offset > 0;
      const activeSource = sourceOverride !== undefined ? sourceOverride : selectedIndiaSourceFilter;
      const isSpecific = Boolean(speciesQuery && speciesQuery.trim() && speciesQuery !== 'All India Flora');
      const queryClean = isSpecific ? speciesQuery!.trim() : undefined;

      if (isAppend) {
        setIsLoadingMoreIndia(true);
      } else {
        setIsLoadingObservations(true);
        setObservationError(null);
        setLoadingMessage(
          queryClean
            ? `Searching verified Indian occurrences for "${queryClean}" on GBIF...`
            : activeSource === 'plantnet'
            ? 'Retrieving Pl@ntNet verified plant records in India from GBIF...'
            : activeSource === 'human_obs'
            ? 'Retrieving citizen science observations across India from GBIF...'
            : activeSource === 'specimens'
            ? 'Retrieving preserved herbarium specimen records across India from GBIF...'
            : 'Retrieving verified botanical occurrences across India from GBIF...'
        );
        setActiveDataSource('india');
        setIsNearbyMode(false);
        setCurrentQueryName(queryClean || 'All India Flora');
        setSelectedIndiaSpeciesFilter(speciesQuery || 'All India Flora');
        if (sourceOverride !== undefined) {
          setSelectedIndiaSourceFilter(sourceOverride);
        }
      }

      try {
        const result = await fetchGbifIndiaOccurrences(queryClean, 60, offset, activeSource);

        if (isAppend) {
          setIndiaRecords((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newRecords = result.records.filter((r) => !existingIds.has(r.id));
            return [...prev, ...newRecords];
          });
          setIndiaMeta((prev) => ({
            totalCount: result.totalCount,
            georeferencedCount: prev.georeferencedCount + result.georeferencedCount,
            missingCoordsCount: prev.missingCoordsCount + result.missingCoordsCount,
            skippedCount: prev.skippedCount + result.skippedCount,
          }));
          setIndiaOffset(offset + result.records.length);
          setHasMoreIndia(result.hasMore);
        } else {
          setIndiaRecords(result.records);
          setIndiaMeta({
            totalCount: result.totalCount,
            georeferencedCount: result.georeferencedCount,
            missingCoordsCount: result.missingCoordsCount,
            skippedCount: result.skippedCount,
          });
          setIndiaOffset(result.records.length);
          setHasMoreIndia(result.hasMore);

          const map = mapInstanceRef.current;
          const validCoordsList = result.records.filter(
            (r): r is PlantOccurrenceRecord & { coordinates: { lat: number; lng: number } } =>
              Boolean(r.hasValidCoordinates && r.coordinates && typeof r.coordinates.lat === 'number' && typeof r.coordinates.lng === 'number')
          );

          if (map && validCoordsList.length > 0 && !keepBounds) {
            const bounds = L.latLngBounds(
              validCoordsList.map((r) => [r.coordinates.lat, r.coordinates.lng] as [number, number])
            );
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
            setActiveItem({ type: 'gbif', gbif: result.records[0] });
            setSelectedIndiaObsId(result.records[0].id);
          } else if (result.records.length > 0) {
            setActiveItem({ type: 'gbif', gbif: result.records[0] });
            setSelectedIndiaObsId(result.records[0].id);
          } else {
            setActiveItem(null);
            setSelectedIndiaObsId(null);
          }
        }
      } catch (err) {
        console.warn('[ExploreMap] Error loading India observations from GBIF:', err);
        setObservationError('Unable to load India observations from GBIF. Please check your network and try again.');
      } finally {
        setIsLoadingObservations(false);
        setIsLoadingMoreIndia(false);
      }
    },
    [selectedIndiaSourceFilter]
  );

  /**
   * Load more India observations pagination action
   */
  const handleLoadMoreIndia = useCallback(() => {
    const currentSpecies = selectedIndiaSpeciesFilter !== 'All India Flora' ? selectedIndiaSpeciesFilter : undefined;
    loadIndiaObservations(currentSpecies, true, indiaRecords.length, selectedIndiaSourceFilter);
  }, [loadIndiaObservations, selectedIndiaSpeciesFilter, indiaRecords.length, selectedIndiaSourceFilter]);

  /**
   * Handle user clicking an observation card in the India observations list:
   * 1. Highlights marker on the map (if coordinates exist)
   * 2. Pans / zooms the map to the observation's recorded coordinates
   * 3. Opens the marker popup and updates detail inspector
   */
  const handleSelectIndiaCard = useCallback((record: PlantOccurrenceRecord) => {
    setSelectedIndiaObsId(record.id);
    setActiveItem({ type: 'gbif', gbif: record });

    const map = mapInstanceRef.current;
    if (map && record.hasValidCoordinates && record.coordinates) {
      map.setView([record.coordinates.lat, record.coordinates.lng], Math.max(map.getZoom(), 13), {
        animate: true,
      });

      const marker = markersMapRef.current.get(record.id);
      if (marker) {
        marker.openPopup();
      }
    }
  }, []);

  /**
   * Search real observations by plant name / taxon
   */
  const handleQuerySpecies = useCallback(
    async (speciesQuery: string, zoomToNearMe: boolean = false) => {
      const trimmed = speciesQuery.trim();
      if (!trimmed) return;

      setIsLoadingObservations(true);
      setObservationError(null);
      setLoadingMessage(`Searching for observations of "${trimmed}"...`);
      setCurrentQueryName(trimmed);
      setIsNearbyMode(false);

      try {
        const { taxon, observations } = await searchPlantObservations(
          trimmed,
          activeUserLocation,
          radiusKm
        );

        if (!taxon) {
          setInatRecords([]);
          setInatTaxon(null);
          setObservationError(`Species "${trimmed}" not found. Try searching by scientific binomial (e.g. "Ocimum tenuiflorum", "Mimosa pudica").`);
          return;
        }

        setInatTaxon(taxon);
        setInatRecords(observations);
        setActiveDataSource('real');

        const map = mapInstanceRef.current;
        if (map && observations.length > 0) {
          if (zoomToNearMe && activeUserLocation) {
            map.setView([activeUserLocation.lat, activeUserLocation.lng], 13, { animate: true });
          } else {
            const bounds = L.latLngBounds(
              observations.map((r: INaturalistObservationRecord) => [r.coordinates.lat, r.coordinates.lng] as [number, number])
            );
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
          }
          setActiveItem({ type: 'inat', inat: observations[0] });
        }
      } catch (err) {
        console.error('[ExploreMap] Species search error:', err);
        setObservationError('Unable to load observations. Please try again.');
      } finally {
        setIsLoadingObservations(false);
      }
    },
    [activeUserLocation, radiusKm]
  );

  /**
   * Helper to render or update user location marker and accuracy circle on the active Leaflet map
   */
  const renderOrUpdateUserLocationMarker = useCallback((coords: Coordinates) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const userIcon = L.divIcon({
      className: 'user-pulse-marker',
      html: `
        <div class="relative flex items-center justify-center pointer-events-none">
          <span class="animate-ping absolute inline-flex h-9 w-9 rounded-full bg-blue-500 opacity-60"></span>
          <span class="relative inline-flex rounded-full h-5 w-5 bg-blue-600 border-2 border-white shadow-lg items-center justify-center">
            <span class="w-2 h-2 rounded-full bg-white"></span>
          </span>
          <span class="absolute -bottom-5 whitespace-nowrap bg-blue-900/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs pointer-events-none">
            You are here
          </span>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([coords.lat, coords.lng], {
        icon: userIcon,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([coords.lat, coords.lng]);
    }

    // Update accuracy circle
    const accRadius = Math.max(coords.accuracy || 10, 5);
    if (!userAccuracyCircleRef.current) {
      userAccuracyCircleRef.current = L.circle([coords.lat, coords.lng], {
        radius: accRadius,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '3, 4',
      }).addTo(map);
    } else {
      userAccuracyCircleRef.current.setLatLng([coords.lat, coords.lng]);
      userAccuracyCircleRef.current.setRadius(accRadius);
    }
  }, []);

  /**
   * Start high-accuracy continuous GPS tracking using watchPosition()
   */
  const startLocationTracking = useCallback(
    (centerOnFirstFix: boolean = true) => {
      userStoppedTrackingRef.current = false;
      if (!navigator.geolocation) {
        setInternalLocationError('Geolocation is not supported by your browser.');
        return;
      }

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      setIsLocatingInternal(true);
      setInternalLocationError(null);
      let isFirstFix = centerOnFirstFix;

      const geoOptions: PositionOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      };

      try {
        const id = navigator.geolocation.watchPosition(
          (position) => {
            const fixTimestamp = position.timestamp || Date.now();
            if (fixTimestamp < lastFixTimestampRef.current) {
              return; // Discard stale/out-of-order reading
            }
            lastFixTimestampRef.current = fixTimestamp;

            const { latitude, longitude, accuracy } = position.coords;
            const newCoords: Coordinates = {
              lat: latitude,
              lng: longitude,
              accuracy: accuracy || undefined,
            };

            setLocalUserLocation(newCoords);
            setIsTracking(true);
            setIsLocatingInternal(false);
            setInternalLocationError(null);
            setGpsAccuracy(accuracy || null);

            if (onUpdateUserLocation) {
              onUpdateUserLocation(newCoords);
            }

            // Poor GPS accuracy warning (Requirement 13)
            if (accuracy && accuracy > 20) {
              setLowAccuracyWarning(
                `GPS accuracy is currently about ${Math.round(accuracy)} m. Move outdoors or wait a little for a better GPS signal.`
              );
            } else {
              setLowAccuracyWarning(null);
            }

            const map = mapInstanceRef.current;
            if (map) {
              // Update user location marker & accuracy circle
              renderOrUpdateUserLocationMarker(newCoords);

              // Update nearby radius boundary circle
              if (isNearbyModeRef.current) {
                const rMeters = radiusKmRef.current * 1000;
                if (!userRadiusCircleRef.current) {
                  userRadiusCircleRef.current = L.circle([latitude, longitude], {
                    radius: rMeters,
                    color: '#059669',
                    fillColor: '#10b981',
                    fillOpacity: 0.04,
                    weight: 1.5,
                    dashArray: '6, 6',
                  }).addTo(map);
                } else {
                  userRadiusCircleRef.current.setLatLng([latitude, longitude]);
                  userRadiusCircleRef.current.setRadius(rMeters);
                }
              }

              // Center map on first fix only if user has not already manually panned/zoomed
              if (isFirstFix) {
                if (!hasUserPannedOrZoomedRef.current) {
                  map.setView([latitude, longitude], Math.max(map.getZoom(), 15), { animate: true });
                }
                isFirstFix = false;
              } else if (isFollowingRef.current) {
                map.setView([latitude, longitude], Math.max(map.getZoom(), 16), { animate: true });
              }

              // Live Navigation Tracking: ETA/distance calculation & off-route auto-rerouting
              if (activeRouteRef.current && activeRouteRef.current.coordinates.length > 1) {
                const currentRoute = activeRouteRef.current;
                const { minDistance, closestSegmentIndex } = getMinDistanceToRoute(
                  latitude,
                  longitude,
                  currentRoute.coordinates
                );

                // Detect if user has moved significantly off-route (> 55 meters from the road path)
                const isOffRoute = minDistance > 55;
                const now = Date.now();

                if (
                  isOffRoute &&
                  !isReroutingRef.current &&
                  now - lastRerouteTimeRef.current > 5000 &&
                  fetchAndDrawRouteRef.current
                ) {
                  lastRerouteTimeRef.current = now;
                  isReroutingRef.current = true;
                  setIsReroutingUI(true);

                  fetchAndDrawRouteRef.current(
                    { lat: latitude, lng: longitude },
                    currentRoute.destinationCoords,
                    currentRoute.destinationName,
                    true
                  ).finally(() => {
                    isReroutingRef.current = false;
                    setIsReroutingUI(false);
                  });
                } else if (!isOffRoute) {
                  // User is on route: calculate updated remaining distance and duration along road
                  let remainingMeters = getHaversineDistanceMeters(
                    latitude,
                    longitude,
                    currentRoute.coordinates[closestSegmentIndex + 1][0],
                    currentRoute.coordinates[closestSegmentIndex + 1][1]
                  );
                  for (let i = closestSegmentIndex + 1; i < currentRoute.coordinates.length - 1; i++) {
                    remainingMeters += getHaversineDistanceMeters(
                      currentRoute.coordinates[i][0],
                      currentRoute.coordinates[i][1],
                      currentRoute.coordinates[i + 1][0],
                      currentRoute.coordinates[i + 1][1]
                    );
                  }

                  const avgSpeedMps =
                    currentRoute.originalDistanceMeters &&
                    currentRoute.originalDurationSeconds &&
                    currentRoute.originalDurationSeconds > 0
                      ? currentRoute.originalDistanceMeters / currentRoute.originalDurationSeconds
                      : 8.5; // fallback ~30 km/h

                  const remainingDurationSeconds = Math.max(
                    0,
                    Math.round(remainingMeters / Math.max(avgSpeedMps, 1))
                  );

                  setActiveRoute((prev) => {
                    if (!prev) return null;
                    const updated = {
                      ...prev,
                      distanceMeters: Math.round(remainingMeters),
                      durationSeconds: remainingDurationSeconds,
                    };
                    activeRouteRef.current = updated;
                    return updated;
                  });
                }
              }
            }

            // Trigger pending nearby search if user clicked "Find Plants Near Me" before fix
            if (pendingNearbySearchRef.current) {
              pendingNearbySearchRef.current = false;
              loadNearbyObservations(latitude, longitude, radiusKmRef.current);
            }

            // Trigger pending nursery search once location permission/fix is acquired
            if (pendingNurserySearchRef.current) {
              pendingNurserySearchRef.current = false;
              setIsLoadingNurseries(true);
              setNurseryNotice(null);
              fetchNearbyPlantNurseries(latitude, longitude, radiusKmRef.current * 1000)
                .then((results) => {
                  setNurseries(results);
                  renderNurseryMarkersRef.current?.(results);
                  if (results.length > 0) {
                    if (mapInstanceRef.current) {
                      const bounds = L.latLngBounds(results.map(r => [r.coordinates.lat, r.coordinates.lng] as [number, number]));
                      bounds.extend([latitude, longitude]);
                      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
                    }
                  } else {
                    setNurseryNotice(`No nearby plant nurseries or garden centres found within ${radiusKmRef.current} km. Try increasing the search radius to 25 km or 50 km.`);
                  }
                })
                .catch((err: any) => {
                  const msg =
                    err?.code === 'RATE_LIMIT' || (typeof err?.message === 'string' && err.message.includes('rate limited'))
                      ? 'OpenStreetMap Overpass API is temporarily busy or rate limited. Please wait a moment and try again.'
                      : err?.code === 'INVALID_COORDINATES'
                      ? 'Location coordinates were invalid. Please ensure GPS is active and retry.'
                      : 'Unable to reach OpenStreetMap nursery directory service at this moment. Please check your network connection and retry.';
                  setNurseryNotice(msg);
                })
                .finally(() => setIsLoadingNurseries(false));
            }
          },
          (err) => {
            console.warn('[ExploreMap] Geolocation watch error:', err.code, err.message);
            setIsLocatingInternal(false);
            if (pendingNurserySearchRef.current) {
              pendingNurserySearchRef.current = false;
              setIsLoadingNurseries(false);
              setNurseryNotice('Location permission is required to find nearby nurseries.');
            }
            if (err.code === 1) {
              setInternalLocationError('Location permission was denied. Please allow location access in your browser settings to find plants near you.');
              if (isNavigatingRef.current) {
                setRouteError('GPS permission was denied. Please allow location access in your browser to use live road navigation.');
              }
              stopLocationTracking();
            } else if (err.code === 2) {
              setInternalLocationError('Unable to determine your device position. Please ensure GPS is active.');
            } else if (err.code === 3) {
              setInternalLocationError('Location request timed out while connecting to GPS sensors.');
            }
          },
          geoOptions
        );

        watchIdRef.current = id;
      } catch (e: any) {
        console.warn('[ExploreMap] Geolocation initialization note:', e);
        setIsLocatingInternal(false);
        if (pendingNurserySearchRef.current) {
          pendingNurserySearchRef.current = false;
          setIsLoadingNurseries(false);
          setNurseryNotice('Location permission is required to find nearby nurseries.');
        }
        setInternalLocationError('Failed to initialize geolocation tracking.');
      }
    },
    [onUpdateUserLocation, stopLocationTracking, loadNearbyObservations, renderOrUpdateUserLocationMarker]
  );

  // Stop tracking when component is inactive or unmounted (Requirement 11)
  useEffect(() => {
    if (!isActive) {
      stopLocationTracking();
    }
    return () => {
      stopLocationTracking();
    };
  }, [isActive, stopLocationTracking]);

  // When "Plants Near Me" or "Explore Map" opens, request the user's GPS location
  useEffect(() => {
    if (!isActive) {
      hasAutoStartedTrackingRef.current = false;
      userStoppedTrackingRef.current = false;
      return;
    }
    if (!hasAutoStartedTrackingRef.current && !userStoppedTrackingRef.current && watchIdRef.current === null) {
      hasAutoStartedTrackingRef.current = true;
      const hasActiveSearch = Boolean(
        (initialInatRecords && initialInatRecords.length > 0) ||
        (initialGbifRecords && initialGbifRecords.length > 0) ||
        initialInatSearch?.trim() ||
        initialGbifSearch?.trim()
      );
      // Auto-center on first GPS fix only if user explicitly opened Plants Near Me (autoStartTracking)
      // or opened fresh Explore Map without species search results AND without a selected target plant
      const hasTargetPlant = Boolean(targetCoordinates);
      const centerOnFirst = !hasTargetPlant && Boolean(autoStartTracking || !hasActiveSearch);
      if (hasTargetPlant) {
        hasUserPannedOrZoomedRef.current = true;
        setIsFollowing(false);
        isFollowingRef.current = false;
      }
      startLocationTracking(centerOnFirst);
    }
  }, [isActive, autoStartTracking, initialInatRecords, initialGbifRecords, initialInatSearch, initialGbifSearch, targetCoordinates, startLocationTracking]);

  /**
   * Handle "Find Plants Near Me" button click (Requirement 3)
   */
  const handleFindPlantsNearMe = useCallback(() => {
    hasUserPannedOrZoomedRef.current = false;
    setIsNearbyMode(true);
    setRadiusKm(10); // Start with 10 km search radius per Requirement 3
    radiusKmRef.current = 10;
    onLocateUser();

    if (activeUserLocation) {
      loadNearbyObservations(activeUserLocation.lat, activeUserLocation.lng, 10);
    } else {
      pendingNearbySearchRef.current = true;
      startLocationTracking(true);
    }
  }, [activeUserLocation, onLocateUser, startLocationTracking, loadNearbyObservations]);

  /**
   * Handle radius change: 1 km, 5 km, 10 km, 25 km, 50 km (Requirement 3)
   */
  const handleChangeRadius = useCallback(
    (newRadius: RadiusKmOption) => {
      setRadiusKm(newRadius);
      radiusKmRef.current = newRadius;

      if (activeUserLocation) {
        // Update boundary circle immediately
        if (userRadiusCircleRef.current) {
          userRadiusCircleRef.current.setRadius(newRadius * 1000);
        }
        // Fetch observations matching the new radius
        loadNearbyObservations(activeUserLocation.lat, activeUserLocation.lng, newRadius);
      } else {
        // If no user location yet, request permission and tracking
        pendingNearbySearchRef.current = true;
        startLocationTracking(true);
      }

      // If nearby nurseries layer is visible, refresh them for the new radius
      if (showNurseries) {
        if (!activeUserLocation) {
          setIsLoadingNurseries(false);
          setNurseryNotice('Location permission is required to find nearby nurseries.');
          pendingNurserySearchRef.current = true;
          startLocationTracking(true);
        } else {
          setIsLoadingNurseries(true);
          setNurseryNotice(null);
          fetchNearbyPlantNurseries(activeUserLocation.lat, activeUserLocation.lng, newRadius * 1000)
            .then((results) => {
              setNurseries(results);
              renderNurseryMarkersRef.current?.(results);
              if (results.length === 0) {
                setNurseryNotice(`No nearby plant nurseries or garden centres found within ${newRadius} km. Try increasing the search radius to 25 km or 50 km.`);
              }
            })
            .catch((err: any) => {
              const msg =
                err?.code === 'RATE_LIMIT' || (typeof err?.message === 'string' && err.message.includes('rate limited'))
                  ? 'OpenStreetMap Overpass API is temporarily busy or rate limited. Please wait a moment and try again.'
                  : err?.code === 'INVALID_COORDINATES'
                  ? 'Location coordinates were invalid. Please ensure GPS is active and retry.'
                  : 'Unable to reach OpenStreetMap nursery directory service at this moment. Please check your network connection and retry.';
              setNurseryNotice(msg);
            })
            .finally(() => setIsLoadingNurseries(false));
        }
      }
    },
    [activeUserLocation, loadNearbyObservations, startLocationTracking, showNurseries]
  );

  /**
   * Handle "Refresh Nearby Plants" button (Requirement 12)
   */
  const handleRefreshNearby = useCallback(() => {
    if (activeUserLocation) {
      loadNearbyObservations(activeUserLocation.lat, activeUserLocation.lng, radiusKm);
    } else {
      pendingNearbySearchRef.current = true;
      startLocationTracking(true);
    }
  }, [activeUserLocation, radiusKm, loadNearbyObservations, startLocationTracking]);

  /**
   * Re-center on Me button (Requirement 12)
   */
  const handleRecenterOnMe = useCallback(() => {
    hasUserPannedOrZoomedRef.current = false;
    if (activeUserLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView(
        [activeUserLocation.lat, activeUserLocation.lng],
        Math.max(mapInstanceRef.current.getZoom(), 16),
        { animate: true }
      );
    } else {
      startLocationTracking(true);
    }
  }, [activeUserLocation, startLocationTracking]);

  const handleToggleFollowMe = useCallback(() => {
    setIsFollowing((prev) => {
      const next = !prev;
      isFollowingRef.current = next;
      if (next) {
        hasUserPannedOrZoomedRef.current = false;
        if (activeUserLocation && mapInstanceRef.current) {
          mapInstanceRef.current.setView(
            [activeUserLocation.lat, activeUserLocation.lng],
            Math.max(mapInstanceRef.current.getZoom(), 16),
            { animate: true }
          );
        } else if (!isTracking) {
          userStoppedTrackingRef.current = false;
          startLocationTracking(true);
        }
      }
      return next;
    });
  }, [activeUserLocation, isTracking, startLocationTracking]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = targetCoordinates ? targetCoordinates.lat : (activeUserLocation?.lat || DEFAULT_INDIA_CENTER.lat);
    const initialLng = targetCoordinates ? targetCoordinates.lng : (activeUserLocation?.lng || DEFAULT_INDIA_CENTER.lng);
    const initialZoom = targetCoordinates ? 17 : (activeUserLocation ? 14 : DEFAULT_INDIA_ZOOM);

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: initialZoom,
      maxZoom: 20,
      zoomControl: true,
      attributionControl: false,
    });

    const streetLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 20, maxNativeZoom: 19 }
    );
    streetTileLayerRef.current = streetLayer;

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, maxNativeZoom: 19 }
    );
    satelliteTileLayerRef.current = satelliteLayer;

    const satelliteLabelsLayer = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, maxNativeZoom: 19 }
    );
    satelliteLabelsLayerRef.current = satelliteLabelsLayer;

    if (mapStyle === 'satellite') {
      satelliteLayer.addTo(map);
      satelliteLabelsLayer.addTo(map);
    } else {
      streetLayer.addTo(map);
    }

    demoMarkersLayerRef.current = L.layerGroup().addTo(map);
    inatMarkersLayerRef.current = L.layerGroup().addTo(map);
    indiaMarkersLayerRef.current = L.layerGroup().addTo(map);
    communityMarkersLayerRef.current = L.layerGroup().addTo(map);
    userPlantsLayerRef.current = L.layerGroup().addTo(map);
    selectedPlantMarkerLayerRef.current = L.layerGroup().addTo(map);
    nurseryMarkersLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    // Only turn off Follow Me when the user manually drags/pans the map
    map.on('dragstart', () => {
      hasUserPannedOrZoomedRef.current = true;
      setIsFollowing(false);
      isFollowingRef.current = false;
    });

    mapInstanceRef.current = map;

    // Immediately render user location marker if GPS coordinates are already available
    if (activeUserLocation) {
      renderOrUpdateUserLocationMarker(activeUserLocation);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      demoMarkersLayerRef.current = null;
      inatMarkersLayerRef.current = null;
      if (indiaMarkersLayerRef.current) {
        indiaMarkersLayerRef.current.clearLayers();
        indiaMarkersLayerRef.current = null;
      }
      communityMarkersLayerRef.current = null;
      if (userPlantsLayerRef.current) {
        userPlantsLayerRef.current.clearLayers();
        userPlantsLayerRef.current = null;
      }
      if (selectedPlantMarkerLayerRef.current) {
        selectedPlantMarkerLayerRef.current.clearLayers();
        selectedPlantMarkerLayerRef.current = null;
      }
      nurseryMarkersLayerRef.current = null;
      userMarkerRef.current = null;
      userAccuracyCircleRef.current = null;
      userRadiusCircleRef.current = null;
      if (routeLayerRef.current) {
        routeLayerRef.current.clearLayers();
        routeLayerRef.current = null;
      }
    };
  }, []);

  // Synchronize user location marker whenever activeUserLocation is available and map is ready
  useEffect(() => {
    if (activeUserLocation && mapInstanceRef.current) {
      renderOrUpdateUserLocationMarker(activeUserLocation);
    }
  }, [activeUserLocation, renderOrUpdateUserLocationMarker]);

  // Core handler for switching base map tiles between OpenStreetMap and Esri World Imagery
  const handleSwitchMapStyle = useCallback((style: 'map' | 'satellite') => {
    setMapStyle(style);
    const map = mapInstanceRef.current;
    if (!map) return;

    const street = streetTileLayerRef.current;
    const sat = satelliteTileLayerRef.current;
    const labels = satelliteLabelsLayerRef.current;

    if (style === 'satellite') {
      if (street && map.hasLayer(street)) {
        map.removeLayer(street);
      }
      if (sat && !map.hasLayer(sat)) {
        map.addLayer(sat);
      }
      if (labels && !map.hasLayer(labels)) {
        map.addLayer(labels);
      }
      sat?.bringToBack();
    } else {
      if (sat && map.hasLayer(sat)) {
        map.removeLayer(sat);
      }
      if (labels && map.hasLayer(labels)) {
        map.removeLayer(labels);
      }
      if (street && !map.hasLayer(street)) {
        map.addLayer(street);
      }
      street?.bringToBack();
    }
  }, []);

  // Sync map layer whenever mapStyle state updates
  useEffect(() => {
    handleSwitchMapStyle(mapStyle);
  }, [mapStyle, handleSwitchMapStyle]);

  // Initial load: Only query observations if explicit initial records or search term was provided
  useEffect(() => {
    const initialKey = initialInatTaxon?.id
      ? `inat-taxon-${initialInatTaxon.id}`
      : initialInatRecords && initialInatRecords.length > 0
        ? `inat-records-${initialInatRecords[0].id || initialInatRecords[0].observationId}-${initialInatRecords.length}`
        : initialGbifRecords && initialGbifRecords.length > 0
          ? `gbif-records-${initialGbifRecords[0].id || initialGbifRecords[0].gbifKey}-${initialGbifRecords.length}`
          : initialInatSearch?.trim()
            ? `inat-search-${initialInatSearch.trim().toLowerCase()}`
            : initialGbifSearch?.trim()
              ? `gbif-search-${initialGbifSearch.trim().toLowerCase()}`
              : '';

    // If a specific target plant was requested, do not fit bounds to previous or initial search queries
    if (targetCoordinates) {
      return;
    }

    // If there is no explicit initial search/records or if this exact search view was already initialized,
    // prevent re-fitting bounds or re-querying so user zoom/pan is never overridden.
    if (!initialKey || appliedInitialKeyRef.current === initialKey) {
      return;
    }

    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    appliedInitialKeyRef.current = initialKey;

    if (initialInatRecords && initialInatRecords.length > 0) {
      setInatRecords(initialInatRecords);
      setActiveDataSource('real');
      if (initialInatTaxon) setInatTaxon(initialInatTaxon);
      const bounds = L.latLngBounds(
        initialInatRecords.map((r) => [r.coordinates.lat, r.coordinates.lng] as [number, number])
      );
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else if (initialGbifRecords && initialGbifRecords.length > 0) {
      // Direct GBIF India botanical observations
      setIndiaRecords(initialGbifRecords);
      setActiveDataSource('india');
      setIndiaMeta({
        totalCount: initialGbifRecords.length,
        georeferencedCount: initialGbifRecords.filter((r) => r.hasValidCoordinates && r.coordinates).length,
        missingCoordsCount: initialGbifRecords.filter((r) => !r.hasValidCoordinates || !r.coordinates).length,
        skippedCount: 0,
      });
      if (initialGbifRecords[0]) {
        setActiveItem({ type: 'gbif', gbif: initialGbifRecords[0] });
        setSelectedIndiaObsId(initialGbifRecords[0].id);
      }
      const georeferenced = initialGbifRecords.filter((r) => r.hasValidCoordinates && r.coordinates);
      if (georeferenced.length > 0) {
        const bounds = L.latLngBounds(
          georeferenced.map((r) => [r.coordinates.lat, r.coordinates.lng] as [number, number])
        );
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    } else if (initialGbifSearch?.trim()) {
      loadIndiaObservations(initialGbifSearch.trim());
    } else if (initialInatSearch?.trim()) {
      handleQuerySpecies(initialInatSearch.trim());
    }
  }, [initialInatRecords, initialInatTaxon, initialGbifRecords, initialInatSearch, initialGbifSearch, targetCoordinates, handleQuerySpecies, loadIndiaObservations]);

  // On mount: If in India mode and no records loaded yet, fetch verified occurrences across India from GBIF
  useEffect(() => {
    if (activeDataSource === 'india' && indiaRecords.length === 0 && !isLoadingObservations && !targetCoordinates) {
      loadIndiaObservations();
    }
  }, [activeDataSource, indiaRecords.length, isLoadingObservations, targetCoordinates, loadIndiaObservations]);

  // Render Map Markers (iNaturalist Observations vs Demo Fallback)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const inatGroup = inatMarkersLayerRef.current;
    const demoGroup = demoMarkersLayerRef.current;
    const indiaGroup = indiaMarkersLayerRef.current;

    if (!map || !inatGroup || !demoGroup) return;

    inatGroup.clearLayers();
    demoGroup.clearLayers();
    if (indiaGroup) indiaGroup.clearLayers();
    markersMapRef.current.clear();

    // Render GBIF India Observation Markers
    if (activeDataSource === 'india' && indiaGroup) {
      indiaRecords.forEach((record) => {
        if (!record.hasValidCoordinates || !record.coordinates || typeof record.coordinates.lat !== 'number' || typeof record.coordinates.lng !== 'number') {
          return;
        }

        const isSelected = selectedIndiaObsId === record.id || (activeItem?.type === 'gbif' && activeItem.gbif?.id === record.id);
        const hasPhoto = Boolean(record.imageUrl && record.mediaAttribution?.permitsReuse);

        const markerHtml = `
          <div class="relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-115">
            <div style="background-color: ${isSelected ? '#047857' : '#064e3b'};" class="w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-amber-300 shadow-md flex items-center justify-center text-white ${
              isSelected ? 'ring-4 ring-emerald-300 scale-110 shadow-xl' : ''
            }">
              <span style="font-size: 13px; line-height: 1;">${hasPhoto ? '📸' : '🌿'}</span>
            </div>
            <div style="border-top-color: ${isSelected ? '#047857' : '#064e3b'};" class="w-0 h-0 border-x-4 border-x-transparent border-t-[7px] -mt-0.5"></div>
            <div class="mt-0.5 bg-emerald-950/90 text-amber-200 text-[9px] font-bold px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap pointer-events-none border border-emerald-700/50">
              GBIF • IN
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          className: 'india-obs-pin',
          html: markerHtml,
          iconSize: [40, 50],
          iconAnchor: [20, 40],
          popupAnchor: [0, -38],
        });

        const marker = L.marker([record.coordinates.lat, record.coordinates.lng], {
          icon: customIcon,
          title: `India Observation: ${record.commonName || record.scientificName}`,
        });

        const photoSection = record.imageUrl && record.mediaAttribution?.permitsReuse
          ? `<div class="mb-2 relative rounded-lg overflow-hidden h-36 bg-stone-100 border border-stone-200">
              <img src="${record.imageUrl}" alt="${record.scientificName}" class="w-full h-full object-cover" />
              <div class="absolute bottom-0 inset-x-0 bg-black/70 backdrop-blur-xs text-white text-[9px] px-2 py-1 leading-tight flex items-center justify-between gap-1">
                <span class="truncate">Photo: ${record.mediaAttribution.creator || 'Observer'}</span>
                <span class="bg-emerald-600/90 px-1 py-0.2 rounded font-mono text-[8px] uppercase shrink-0">${record.mediaAttribution.licenseLabel}</span>
              </div>
            </div>`
          : `<div class="mb-2 p-2 bg-stone-50 rounded-lg border border-stone-200 text-[10px] text-stone-500 flex items-center gap-1.5">
              <span>🌿</span>
              <span>No open-license photo for this occurrence (respecting copyright)</span>
            </div>`;

        const sensitivityNotice = record.hasSensitiveLocation
          ? `<div class="text-[10px] text-amber-900 bg-amber-50 p-1.5 rounded-lg border border-amber-200 mb-2 leading-snug">
              ⚠️ <strong>Coordinate Note:</strong> Generalized location (~±${Math.round((record.coordinateUncertaintyInMeters || 10000)/1000)} km) to protect sensitive flora.
            </div>`
          : '';

        const popupHtml = `
          <div style="font-family: inherit; width: 290px;" class="p-3 text-stone-900">
            <div class="flex items-center justify-between gap-1 mb-2">
              <span class="text-[10px] uppercase font-bold tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <span>🇮🇳</span>
                GBIF India Observation
              </span>
              <span class="text-[10px] font-mono font-medium text-stone-600">
                #${record.gbifKey}
              </span>
            </div>

            ${photoSection}

            <div class="mb-2">
              <h4 class="font-serif-display text-base font-bold text-stone-900 leading-tight">
                ${record.commonName || record.scientificName}
              </h4>
              <p class="text-xs text-stone-600 italic">
                ${record.scientificName} · Family: ${record.family}
              </p>
            </div>

            <div class="space-y-1.5 text-xs text-stone-700 bg-stone-50 p-2.5 rounded-xl border border-stone-200 mb-2">
              <div class="flex items-start gap-1.5">
                <span class="text-stone-800 font-semibold shrink-0">📍 Location:</span>
                <span class="text-stone-700 line-clamp-2">${record.locality}</span>
              </div>
              ${record.eventDate ? `
                <div class="flex items-center gap-1.5">
                  <span class="text-stone-800 font-semibold shrink-0">📅 Date:</span>
                  <span class="text-stone-700">${record.eventDate}</span>
                </div>
              ` : ''}
              <div class="flex items-center gap-1.5">
                <span class="text-stone-800 font-semibold shrink-0">👤 Observer:</span>
                <span class="text-stone-700 truncate">${record.recordedBy || 'Field Naturalist'}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-stone-800 font-semibold shrink-0">🌐 Coordinates:</span>
                <span class="font-mono text-[11px] text-stone-700">${record.coordinates.lat.toFixed(4)}°, ${record.coordinates.lng.toFixed(4)}°</span>
              </div>
              <div class="flex items-center gap-1.5 pt-0.5 border-t border-stone-200 text-[10px] text-stone-700">
                <span>🏛️ Source: <strong>${record.sourcePlatform || 'GBIF Occurrence Network'}</strong></span>
              </div>
              <div class="flex items-center gap-1.5 text-[10px] text-stone-500">
                <span>📜 License: ${record.datasetLicenseLabel || 'CC BY-NC 4.0'}</span>
              </div>
            </div>

            ${sensitivityNotice}

            <div class="space-y-1.5">
              <button
                type="button"
                onclick="window.wimpStartNav && window.wimpStartNav(${record.coordinates.lat}, ${record.coordinates.lng}, '${(record.commonName || record.scientificName || 'Plant Observation').replace(/'/g, "\\'")}')"
                class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <span>🧭 Start Road Navigation</span>
              </button>

              ${record.originalRecordUrl && record.originalRecordUrl !== record.gbifUrl ? `
                <a
                  href="${record.originalRecordUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center justify-center gap-1.5 w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                >
                  <span>View Original Record (${(record.sourcePlatform || 'Provider').split(' ')[0]})</span>
                  <span class="text-[11px]">↗</span>
                </a>
              ` : ''}

              <a
                href="${record.gbifUrl}"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center justify-center gap-1.5 w-full py-1.5 bg-emerald-900 hover:bg-emerald-950 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <span>Open Source Record on GBIF</span>
                <span class="text-[11px]">↗</span>
              </a>
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, {
          closeButton: true,
          autoPan: true,
          className: 'botanical-map-popup',
        });

        marker.on('click', () => {
          setSelectedIndiaObsId(record.id);
          setActiveItem({ type: 'gbif', gbif: record });
          const cardEl = document.getElementById(`india-card-${record.id}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });

        marker.on('popupopen', () => {
          setSelectedIndiaObsId(record.id);
          setActiveItem({ type: 'gbif', gbif: record });
          const cardEl = document.getElementById(`india-card-${record.id}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });

        indiaGroup.addLayer(marker);
        markersMapRef.current.set(record.id, marker);
      });
      return;
    }

    if (activeDataSource === 'demo') {
      // Demo sandbox pins - only render demo plants here to prevent duplicate markers with user layer
      const demoPlants = plants.filter((plant) => !isUserSubmittedPlant(plant));
      demoPlants.forEach((plant) => {
        const isSelected = activeItem?.type === 'plant' && activeItem.plant?.id === plant.id;
        const markerHtml = `
          <div class="relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-110">
            <div style="background-color: ${isSelected ? '#047857' : '#064e3b'};" class="w-9 h-9 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white ${
              isSelected ? 'ring-4 ring-emerald-300 scale-110 shadow-xl' : ''
            }">
              <span style="font-size: 14px; line-height: 1;">🌿</span>
            </div>
            <div style="border-top-color: ${isSelected ? '#047857' : '#064e3b'};" class="w-0 h-0 border-x-4 border-x-transparent border-t-[6px] -mt-0.5"></div>
            <div class="mt-0.5 bg-amber-500 text-stone-950 font-bold text-[9px] px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap pointer-events-none">
              DEMO DATA
            </div>
          </div>
        `;
        const customIcon = L.divIcon({
          className: 'demo-pin',
          html: markerHtml,
          iconSize: [40, 48],
          iconAnchor: [20, 38],
          popupAnchor: [0, -35],
        });

        const marker = L.marker([plant.coordinates.lat, plant.coordinates.lng], { icon: customIcon });
        marker.bindPopup(`
          <div style="font-family: inherit; width: 250px;" class="p-3 text-stone-900">
            <div class="text-[10px] uppercase font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded mb-1.5 inline-block">
              DEMO TEST SPECIMEN
            </div>
            <div class="font-serif font-bold text-stone-900 text-base">${plant.commonName}</div>
            <div class="text-xs italic text-stone-500 mb-2">${plant.scientificName}</div>
            <div class="text-xs text-stone-600 mb-2">${plant.locationName}</div>
            <div class="text-[10px] text-stone-500 mb-2">Local campus demo data. Use "Switch to Real Observations" for live citizen science records.</div>
            <button
              type="button"
              onclick="window.wimpStartNav && window.wimpStartNav(${plant.coordinates.lat}, ${plant.coordinates.lng}, '${(plant.commonName || 'Plant').replace(/'/g, "\\'")}')"
              class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span>🧭 Start Now (Route)</span>
            </button>
          </div>
        `);
        marker.on('click', () => {
          setActiveItem({ type: 'plant', plant });
        });
        demoGroup.addLayer(marker);
      });
      return;
    }

    // Render REAL iNaturalist Observation Markers (Requirements 4, 5, 6, 7, 8)
    inatRecords.forEach((record) => {
      const isSelected = activeItem?.type === 'inat' && activeItem.inat?.id === record.id;

      const markerHtml = `
        <div class="relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-110">
          <div style="background-color: ${isSelected ? '#059669' : '#047857'};" class="w-9 h-9 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white ${
            isSelected ? 'ring-4 ring-emerald-300 scale-110 shadow-xl' : ''
          }">
            <span style="font-size: 14px; line-height: 1;">🌱</span>
          </div>
          <div style="border-top-color: ${isSelected ? '#059669' : '#047857'};" class="w-0 h-0 border-x-4 border-x-transparent border-t-[7px] -mt-0.5"></div>
          <div class="mt-0.5 bg-emerald-950/90 text-white text-[9px] font-semibold px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap pointer-events-none">
            iNat
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'real-inat-pin',
        html: markerHtml,
        iconSize: [40, 48],
        iconAnchor: [20, 38],
        popupAnchor: [0, -35],
      });

      const marker = L.marker([record.coordinates.lat, record.coordinates.lng], {
        icon: customIcon,
        title: `Observation: ${record.commonName || record.scientificName}`,
      });

      // Marker Popup per Requirements 5, 6, 8:
      // - Plant common name
      // - Scientific name
      // - Observation photograph when available
      // - Observation date when available
      // - Approximate observation location
      // - Link to the original iNaturalist observation
      // - Clearly labeled: "Public observations from iNaturalist"
      // - Disclaimer: "This is a recorded observation, not a guarantee that the plant is currently present."
      const popupHtml = `
        <div style="font-family: inherit; width: 280px;" class="p-3 text-stone-900">
          <div class="flex items-center justify-between gap-1 mb-2">
            <span class="text-[10px] uppercase font-bold tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              Public observations from iNaturalist
            </span>
            <span class="text-[10px] font-mono font-medium text-stone-600">
              #${record.observationId}
            </span>
          </div>

          ${
            record.imageUrl
              ? `<div class="mb-2 relative rounded-lg overflow-hidden h-36 bg-stone-100 border border-stone-200">
                  <img src="${record.imageUrl}" alt="${record.scientificName}" class="w-full h-full object-cover" />
                  <span class="absolute bottom-1 right-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded backdrop-blur-xs">iNaturalist Photo</span>
                </div>`
              : ''
          }

          <div class="mb-2">
            <h4 class="font-serif-display text-base font-bold text-stone-900 leading-tight">
              ${record.commonName || record.scientificName}
            </h4>
            <p class="text-xs text-stone-700 italic">
              ${record.scientificName}
            </p>
          </div>

          <div class="space-y-1.5 text-xs text-stone-700 bg-stone-50 p-2.5 rounded-xl border border-stone-200 mb-2">
            <div class="flex items-start gap-1.5">
              <span class="text-stone-700 font-semibold shrink-0">Approx. Location:</span>
              <span class="text-stone-700 line-clamp-2">${record.locality}</span>
            </div>
            ${
              record.eventDate
                ? `<div class="flex items-center gap-1.5">
                    <span class="text-stone-700 font-semibold shrink-0">Observed Date:</span>
                    <span class="text-stone-700">${record.eventDate}</span>
                  </div>`
                : ''
            }
            <div class="flex items-center gap-1.5">
              <span class="text-stone-700 font-semibold shrink-0">Coordinates:</span>
              <span class="font-mono text-[11px] text-stone-700">${record.coordinates.lat.toFixed(4)}°, ${record.coordinates.lng.toFixed(4)}°</span>
            </div>
          </div>

          <div class="text-[10px] text-amber-900 bg-amber-50/90 p-2 rounded-lg border border-amber-200 mb-2.5 leading-snug">
            ⚠️ <strong>Note:</strong> This is a recorded observation, not a guarantee that the plant is currently present.
          </div>

          <button
            type="button"
            onclick="window.wimpStartNav && window.wimpStartNav(${record.coordinates.lat}, ${record.coordinates.lng}, '${(record.commonName || record.scientificName || 'Plant Observation').replace(/'/g, "\\'")}')"
            class="w-full mb-2 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <span>🧭 Start Now (Route)</span>
          </button>

          <a
            href="${record.observationUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-1.5 w-full py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <span>View on iNaturalist</span>
            <span class="text-[11px]">↗</span>
          </a>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        autoPan: true,
        className: 'botanical-map-popup',
      });

      marker.on('click', () => {
        setActiveItem({ type: 'inat', inat: record });
      });

      marker.on('popupopen', () => {
        setActiveItem({ type: 'inat', inat: record });
      });

      inatGroup.addLayer(marker);
      markersMapRef.current.set(record.id, marker);
    });
  }, [inatRecords, indiaRecords, selectedIndiaObsId, activeDataSource, activeItem, plants]);

  // Render Community Observation Markers
  useEffect(() => {
    const communityGroup = communityMarkersLayerRef.current;
    if (!communityGroup) return;

    communityGroup.clearLayers();

    communityObsList.forEach((obs) => {
      const isSelected = activeItem?.type === 'community' && activeItem.community?.id === obs.id;

      const markerHtml = `
        <div class="relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-110">
          <div style="background-color: ${isSelected ? '#9333ea' : '#7e22ce'};" class="w-9 h-9 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white ${
            isSelected ? 'ring-4 ring-purple-300 scale-110 shadow-xl' : ''
          }">
            <span style="font-size: 14px; line-height: 1;">🌸</span>
          </div>
          <div style="border-top-color: ${isSelected ? '#9333ea' : '#7e22ce'};" class="w-0 h-0 border-x-4 border-x-transparent border-t-[7px] -mt-0.5"></div>
          <div class="mt-0.5 bg-purple-950/90 text-white text-[9px] font-bold px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap pointer-events-none">
            Community
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'community-obs-pin',
        html: markerHtml,
        iconSize: [44, 52],
        iconAnchor: [22, 42],
        popupAnchor: [0, -38],
      });

      const marker = L.marker([obs.coordinates.lat, obs.coordinates.lng], {
        icon: customIcon,
        title: `Community Observation: ${obs.commonName}`,
      });

      const popupHtml = `
        <div style="font-family: inherit; width: 280px;" class="p-3 text-stone-900">
          <div class="flex items-center justify-between gap-1 mb-2">
            <span class="text-[10px] uppercase font-bold tracking-wider text-purple-900 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
              Community Observation
            </span>
            <span class="text-[10px] font-mono font-medium text-stone-500">
              #${obs.id.slice(-6)}
            </span>
          </div>

          ${
            obs.imageUrl
              ? `<div class="mb-2 relative rounded-lg overflow-hidden h-36 bg-stone-100 border border-stone-200">
                  <img src="${obs.imageUrl}" alt="${obs.commonName}" class="w-full h-full object-cover" />
                  <span class="absolute bottom-1 right-1 text-[9px] bg-purple-950/80 text-white px-1.5 py-0.5 rounded backdrop-blur-xs">Community Photo</span>
                </div>`
              : ''
          }

          <div class="mb-2">
            <h4 class="font-serif-display text-base font-bold text-stone-900 leading-tight">
              ${obs.commonName}
            </h4>
            ${
              obs.scientificName
                ? `<p class="text-xs text-stone-700 italic font-serif">${obs.scientificName}</p>`
                : ''
            }
          </div>

          <div class="space-y-1.5 text-xs text-stone-700 bg-purple-50/50 p-2 rounded-lg border border-purple-100 mb-2">
            <div><strong>Observed Date:</strong> ${obs.date}</div>
            <div><strong>Coordinates:</strong> <span class="font-mono text-[11px]">${obs.coordinates.lat.toFixed(5)}°, ${obs.coordinates.lng.toFixed(5)}°</span></div>
            ${
              obs.coordinates.accuracy
                ? `<div class="text-[11px] text-stone-500"><strong>GPS Accuracy:</strong> ±${obs.coordinates.accuracy}m</div>`
                : ''
            }
            ${
              obs.notes
                ? `<div class="text-[11px] text-stone-600 pt-1 border-t border-purple-100 mt-1 italic">"${obs.notes}"</div>`
                : ''
            }
          </div>

          <div class="text-[10px] text-purple-900 font-medium text-center bg-purple-50 py-1 rounded mb-2">
            🌿 Recorded in Community Local Observation Database
          </div>

          <button
            type="button"
            onclick="window.wimpStartNav && window.wimpStartNav(${obs.coordinates.lat}, ${obs.coordinates.lng}, '${(obs.commonName || 'Community Observation').replace(/'/g, "\\'")}')"
            class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <span>🧭 Start Now (Route)</span>
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        autoPan: true,
        className: 'botanical-map-popup',
      });

      marker.on('click', () => {
        setActiveItem({ type: 'community', community: obs });
        if (onSelectCommunityObservation) onSelectCommunityObservation(obs);
      });

      marker.on('popupopen', () => {
        setActiveItem({ type: 'community', community: obs });
      });

      communityGroup.addLayer(marker);
      markersMapRef.current.set(obs.id, marker);
    });
  }, [communityObsList, activeItem, onSelectCommunityObservation]);

  // Render Firebase / User-Submitted Plant Markers independently of current data source
  useEffect(() => {
    const userLayer = userPlantsLayerRef.current;
    if (!userLayer) return;

    userLayer.clearLayers();

    // Filter for valid user-submitted plants with valid geographic coordinates
    const userPlants = plants.filter((plant) => {
      if (!isUserSubmittedPlant(plant)) return false;
      const coords = getValidPlantCoordinates(plant);
      return coords !== null;
    });

    userPlants.forEach((plant) => {
      const coords = getValidPlantCoordinates(plant);
      if (!coords) return;

      const isSelected = activeItem?.type === 'plant' && activeItem.plant?.id === plant.id;

      const markerHtml = `
        <div class="relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-115">
          <div style="background-color: ${isSelected ? '#0f766e' : '#0d9488'};" class="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white ${
            isSelected ? 'ring-4 ring-teal-300 scale-110 shadow-2xl' : ''
          }">
            <span style="font-size: 15px; line-height: 1;">🌱</span>
          </div>
          <div style="border-top-color: ${isSelected ? '#0f766e' : '#0d9488'};" class="w-0 h-0 border-x-4 border-x-transparent border-t-[7px] -mt-0.5"></div>
          <div class="mt-0.5 bg-teal-950/90 text-white font-bold text-[9px] px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap pointer-events-none border border-teal-500/40">
            User Flora
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'user-plant-pin',
        html: markerHtml,
        iconSize: [44, 52],
        iconAnchor: [22, 42],
        popupAnchor: [0, -38],
      });

      const marker = L.marker([coords.lat, coords.lng], {
        icon: customIcon,
        title: `User Plant Record: ${plant.commonName || 'Plant'}`,
      });

      const safeCommonName = escapeHtml(plant.commonName || 'Plant Record');
      const safeScientificName = plant.scientificName ? escapeHtml(plant.scientificName) : '';
      const safeFamily = plant.family ? escapeHtml(plant.family) : '';
      const safeLocation = plant.locationName ? escapeHtml(plant.locationName) : '';
      const safeUsername = plant.ownerUsername ? escapeHtml(plant.ownerUsername) : '';
      const safeCategory = plant.category ? escapeHtml(plant.category) : '';
      const safeNavName = (plant.commonName || 'Plant Record').replace(/'/g, "\\'");

      const popupHtml = `
        <div style="font-family: inherit; width: 280px;" class="p-3 text-stone-900">
          <div class="flex items-center justify-between gap-1 mb-2">
            <span class="text-[10px] uppercase font-bold tracking-wider text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
              User Flora Record
            </span>
            ${
              safeUsername
                ? `<span class="text-[10px] font-mono text-stone-600 font-medium">${safeUsername}</span>`
                : `<span class="text-[10px] font-mono text-stone-400">#${escapeHtml(plant.id.slice(-6))}</span>`
            }
          </div>

          ${
            plant.imageUrl
              ? `<div class="mb-2 relative rounded-lg overflow-hidden h-36 bg-stone-100 border border-stone-200">
                  <img src="${plant.imageUrl}" alt="${safeCommonName}" class="w-full h-full object-cover" />
                  <span class="absolute bottom-1 right-1 text-[9px] bg-teal-950/80 text-white px-1.5 py-0.5 rounded backdrop-blur-xs">Field Photo</span>
                </div>`
              : ''
          }

          <div class="mb-2">
            <h4 class="font-serif-display text-base font-bold text-stone-900 leading-tight">
              ${safeCommonName}
            </h4>
            ${
              safeScientificName
                ? `<p class="text-xs text-stone-700 italic font-serif">${safeScientificName}</p>`
                : ''
            }
            ${
              safeFamily
                ? `<p class="text-[11px] text-stone-500">Family: ${safeFamily}</p>`
                : ''
            }
          </div>

          <div class="space-y-1.5 text-xs text-stone-700 bg-teal-50/50 p-2.5 rounded-lg border border-teal-100 mb-2">
            ${
              safeLocation
                ? `<div><strong>Location:</strong> <span class="text-stone-800">${safeLocation}</span></div>`
                : ''
            }
            <div><strong>Coordinates:</strong> <span class="font-mono text-[11px] text-stone-700">${coords.lat.toFixed(5)}°, ${coords.lng.toFixed(5)}°</span></div>
            ${
              coords.accuracy
                ? `<div class="text-[11px] text-stone-500"><strong>GPS Accuracy:</strong> ±${coords.accuracy}m</div>`
                : ''
            }
            ${
              safeCategory
                ? `<div><strong>Category:</strong> ${safeCategory}</div>`
                : ''
            }
            ${
              plant.treeHeightM
                ? `<div><strong>Tree Height:</strong> ${plant.treeHeightM} m</div>`
                : ''
            }
            ${
              plant.trunkCircumferenceCm
                ? `<div><strong>Circumference:</strong> ${plant.trunkCircumferenceCm} cm</div>`
                : ''
            }
          </div>

          <button
            type="button"
            onclick="window.wimpStartNav && window.wimpStartNav(${coords.lat}, ${coords.lng}, '${safeNavName}')"
            class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <span>🧭 Start Road Navigation</span>
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        autoPan: true,
        className: 'botanical-map-popup',
      });

      marker.on('click', () => {
        setActiveItem({ type: 'plant', plant });
      });

      marker.on('popupopen', () => {
        setActiveItem({ type: 'plant', plant });
      });

      userLayer.addLayer(marker);
      markersMapRef.current.set(plant.id, marker);
    });
  }, [plants, activeItem]);

  // Handle selectedCommunityObservation change (center and open popup)
  useEffect(() => {
    if (!selectedCommunityObservation) return;
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setView(
      [selectedCommunityObservation.coordinates.lat, selectedCommunityObservation.coordinates.lng],
      16,
      { animate: true }
    );

    setActiveItem({ type: 'community', community: selectedCommunityObservation });

    const marker = markersMapRef.current.get(selectedCommunityObservation.id);
    if (marker) {
      setTimeout(() => {
        marker.openPopup();
      }, 300);
    }
  }, [selectedCommunityObservation]);

  // Render Plant Nursery POI Markers on Leaflet map
  const renderNurseryMarkers = useCallback((nurseryList: PlantNursery[]) => {
    const nurseryGroup = nurseryMarkersLayerRef.current;
    if (!nurseryGroup) return;

    nurseryGroup.clearLayers();

    nurseryList.forEach((nursery) => {
      const isSelected = activeItem?.type === 'nursery' && activeItem.nursery?.id === nursery.id;
      const markerHtml = `
        <div class="relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-115">
          <div style="background: linear-gradient(135deg, #d97706 0%, #b45309 100%);" class="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-amber-200 shadow-lg flex items-center justify-center text-white ${
            isSelected ? 'ring-4 ring-amber-400 scale-110 shadow-2xl' : ''
          }">
            <span style="font-size: 16px; line-height: 1;">🪴</span>
          </div>
          <div style="border-top-color: #b45309;" class="w-0 h-0 border-x-4 border-x-transparent border-t-[8px] -mt-0.5"></div>
          <div class="mt-0.5 bg-stone-900 text-amber-300 text-[9px] font-bold px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap pointer-events-none border border-amber-500/60">
            Nursery
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-nursery-marker-pin',
        html: markerHtml,
        iconSize: [48, 54],
        iconAnchor: [24, 46],
        popupAnchor: [0, -42],
      });

      const marker = L.marker([nursery.coordinates.lat, nursery.coordinates.lng], {
        icon: customIcon,
        title: `Plant Nursery: ${nursery.name}`,
      });

      const safeId = nursery.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const safeName = escapeHtml(nursery.name);
      const safeAddress = nursery.address ? escapeHtml(nursery.address) : '';
      const safePhone = nursery.phone ? escapeHtml(nursery.phone) : '';
      const safeHours = nursery.openingHours ? escapeHtml(nursery.openingHours) : '';

      const popupHtml = `
        <div style="font-family: inherit; width: 280px;" class="p-3 text-stone-900">
          <div class="flex items-center justify-between gap-1 mb-2">
            <span class="text-[10px] uppercase font-bold tracking-wider text-amber-950 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
              <span>🪴</span>
              ${
                nursery.type === 'garden_centre'
                  ? 'Garden Centre'
                  : nursery.type === 'plant_shop'
                  ? 'Plant & Flower Shop'
                  : 'Plant Nursery'
              }
            </span>
            <span class="text-[10px] text-stone-600 font-semibold flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
              OpenStreetMap POI
            </span>
          </div>

          <div class="mb-2">
            <h4 class="font-serif-display text-base font-bold text-stone-900 leading-tight">
              ${safeName}
            </h4>
          </div>

          <div class="space-y-1.5 text-xs text-stone-700 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100 mb-2">
            ${
              safeAddress
                ? `<div class="flex items-start gap-1.5">
                    <span class="text-stone-700 font-semibold shrink-0">📍 Address:</span>
                    <span class="text-stone-700">${safeAddress}</span>
                  </div>`
                : ''
            }
            ${
              safePhone
                ? `<div class="flex items-center gap-1.5">
                    <span class="text-stone-700 font-semibold shrink-0">📞 Phone:</span>
                    <a href="tel:${safePhone}" class="text-emerald-800 font-semibold hover:underline">${safePhone}</a>
                  </div>`
                : ''
            }
            ${
              safeHours
                ? `<div class="flex items-center gap-1.5">
                    <span class="text-stone-700 font-semibold shrink-0">🕒 Hours:</span>
                    <span class="text-stone-700">${safeHours}</span>
                  </div>`
                : ''
            }
            ${
              nursery.distanceMeters != null
                ? `<div class="flex items-center gap-1.5 text-[11px] text-stone-700 pt-1 border-t border-emerald-100">
                    <span>Distance:</span>
                    <span class="font-semibold text-emerald-900">${(nursery.distanceMeters / 1000).toFixed(1)} km away</span>
                  </div>`
                : ''
            }
            <div class="text-[9px] text-stone-500 pt-1 border-t border-stone-200 flex items-center justify-between">
              <span>OpenStreetMap Overpass (ODbL)</span>
              <span class="text-emerald-700 font-medium">Free Open Data</span>
            </div>
          </div>

          <div class="space-y-1.5 pt-1">
            <a
              href="${nursery.googleMapsDirectionsUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="w-full py-1.5 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span>🗺️ Google Maps Directions</span>
              <span class="text-[11px]">↗</span>
            </a>
            <button
              type="button"
              onclick="window.wimpStartNavNursery ? window.wimpStartNavNursery('${safeId}') : (window.wimpStartNav && window.wimpStartNav(${nursery.coordinates.lat}, ${nursery.coordinates.lng}, '${safeName.replace(/'/g, "\\'")}'))"
              class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span>🧭 In-App Road Route</span>
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        autoPan: true,
        className: 'botanical-map-popup',
      });

      marker.on('click', () => {
        setActiveItem({ type: 'nursery', nursery });
      });

      marker.on('popupopen', () => {
        setActiveItem({ type: 'nursery', nursery });
      });

      nurseryGroup.addLayer(marker);
      markersMapRef.current.set(nursery.id, marker);
    });
  }, []);

  renderNurseryMarkersRef.current = renderNurseryMarkers;

  // Keep nurseriesRef in sync with nurseries state
  useEffect(() => {
    nurseriesRef.current = nurseries;
  }, [nurseries]);

  // Synchronize nursery markers on map when showNurseries or nurseries update
  useEffect(() => {
    if (showNurseries) {
      renderNurseryMarkers(nurseries);
    } else if (nurseryMarkersLayerRef.current) {
      nurseryMarkersLayerRef.current.clearLayers();
    }
  }, [showNurseries, nurseries, renderNurseryMarkers]);

  // Toggle Nearby Plant Nurseries POI layer
  const handleToggleNurseries = useCallback(async () => {
    if (showNurseries) {
      setShowNurseries(false);
      setNurseryNotice(null);
      pendingNurserySearchRef.current = false;
      if (nurseryMarkersLayerRef.current) {
        nurseryMarkersLayerRef.current.clearLayers();
      }
      return;
    }

    setShowNurseries(true);

    if (!activeUserLocation) {
      setIsLoadingNurseries(false);
      setNurseryNotice('Location permission is required to find nearby nurseries.');
      pendingNurserySearchRef.current = true;
      startLocationTracking(true);
      return;
    }

    setIsLoadingNurseries(true);
    setNurseryNotice(null);

    const lat = activeUserLocation.lat;
    const lng = activeUserLocation.lng;

    try {
      const results = await fetchNearbyPlantNurseries(lat, lng, radiusKm * 1000);
      setNurseries(results);
      renderNurseryMarkers(results);

      if (results.length > 0) {
        const map = mapInstanceRef.current;
        if (map) {
          const bounds = L.latLngBounds(results.map(r => [r.coordinates.lat, r.coordinates.lng] as [number, number]));
          bounds.extend([lat, lng]);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      } else {
        setNurseryNotice(`No nearby plant nurseries or garden centres found within ${radiusKm} km. Try increasing the search radius to 25 km or 50 km.`);
      }
    } catch (err: any) {
      const msg =
        err?.code === 'RATE_LIMIT' || (typeof err?.message === 'string' && err.message.includes('rate limited'))
          ? 'OpenStreetMap Overpass API is temporarily busy or rate limited. Please wait a moment and try again.'
          : err?.code === 'INVALID_COORDINATES'
          ? 'Location coordinates were invalid. Please ensure GPS is active and retry.'
          : 'Unable to reach OpenStreetMap nursery directory service at this moment. Please check your network connection and retry.';
      setNurseryNotice(msg);
    } finally {
      setIsLoadingNurseries(false);
    }
  }, [showNurseries, activeUserLocation, radiusKm, renderNurseryMarkers, startLocationTracking]);

  // Synchronize local state when parent updates userLocation
  useEffect(() => {
    if (userLocation) {
      setLocalUserLocation(userLocation);
    }
  }, [userLocation]);

  // Render, center, and highlight selected plant marker (from Plant Details / Catalog)
  // Visibly shows the plant marker without removing existing map markers or changing filters
  useEffect(() => {
    const map = mapInstanceRef.current;
    const selectedGroup = selectedPlantMarkerLayerRef.current;
    if (!map || !selectedGroup) return;

    selectedGroup.clearLayers();

    // If no coordinates or invalid coordinates, handle safely without crashing or panning
    if (!targetCoordinates) {
      if (effectiveSelectedPlant) {
        setActiveItem({ type: 'plant', plant: effectiveSelectedPlant });
      }
      return;
    }

    const plant: Plant = effectiveSelectedPlant || {
      id: selectedPlantId || 'selected-plant',
      commonName: 'Selected Plant Specimen',
      scientificName: '',
      family: 'Flora',
      category: 'Tree',
      habitat: 'Campus',
      bloomSeason: 'All seasons',
      sunExposure: 'Full Sun',
      waterNeeds: 'Moderate',
      difficulty: 'Beginner',
      studentTip: 'Selected from botanical records',
      description: 'Recorded plant specimen',
      identificationKeys: {
        leafShape: 'Simple',
        leafArrangement: 'Alternate',
        flowerColor: 'Green',
        growthHabit: 'Tree',
      },
      imageUrl: '',
      locationName: 'Saved Botanical Location',
      coordinates: targetCoordinates,
      demoLocationDescription: 'Campus grounds',
      sightedCount: 1,
    };

    // Build prominent botanical pin with highlight ring
    const markerHtml = `
      <div class="relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-115">
        <div style="background-color: #047857;" class="w-10 h-10 rounded-full border-2 border-white shadow-2xl flex items-center justify-center text-white ring-4 ring-emerald-400 ring-offset-2 scale-110">
          <span style="font-size: 16px; line-height: 1;">🌿</span>
        </div>
        <div style="border-top-color: #047857;" class="w-0 h-0 border-x-4 border-x-transparent border-t-[8px] -mt-0.5"></div>
        <div class="mt-0.5 bg-emerald-950 text-white font-bold text-[9px] px-2 py-0.5 rounded-full shadow-md whitespace-nowrap border border-emerald-400/50 flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>${escapeHtml(plant.commonName || 'Plant')}</span>
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: 'selected-plant-highlight-pin',
      html: markerHtml,
      iconSize: [48, 56],
      iconAnchor: [24, 46],
      popupAnchor: [0, -42],
    });

    const marker = L.marker([targetCoordinates.lat, targetCoordinates.lng], {
      icon: customIcon,
      zIndexOffset: 1200, // render above normal markers
      title: `Plant: ${plant.commonName || 'Botanical Specimen'}`,
    });

    const safeCommonName = (plant.commonName || 'Plant Specimen').replace(/'/g, "\\'");

    const popupHtml = `
      <div style="font-family: inherit; width: 280px;" class="p-3 text-stone-900">
        <div class="flex items-center justify-between gap-1 mb-2">
          <span class="text-[10px] uppercase font-bold tracking-wider text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            ${escapeHtml(plant.category || 'Botanical')} Record
          </span>
          <span class="text-[10px] font-mono font-medium text-stone-500">
            #${escapeHtml(plant.id.slice(-6))}
          </span>
        </div>

        ${
          plant.imageUrl
            ? `<div class="mb-2 relative rounded-lg overflow-hidden h-36 bg-stone-100 border border-stone-200">
                <img src="${plant.imageUrl}" alt="${escapeHtml(plant.commonName)}" class="w-full h-full object-cover" />
              </div>`
            : ''
        }

        <div class="mb-2">
          <h4 class="font-serif-display text-base font-bold text-stone-900 leading-tight">
            ${escapeHtml(plant.commonName)}
          </h4>
          ${plant.scientificName ? `<p class="text-xs text-stone-600 italic mt-0.5">${escapeHtml(plant.scientificName)}</p>` : ''}
        </div>

        <div class="space-y-1.5 text-xs text-stone-700 bg-stone-50 p-2.5 rounded-xl border border-stone-200 mb-2">
          ${plant.locationName ? `<div><strong>Location:</strong> ${escapeHtml(plant.locationName)}</div>` : ''}
          <div><strong>Coordinates:</strong> <span class="font-mono text-[11px]">${targetCoordinates.lat.toFixed(5)}°, ${targetCoordinates.lng.toFixed(5)}°</span></div>
          ${
            plant.trunkCircumferenceCm
              ? `<div><strong>Circumference:</strong> ${plant.trunkCircumferenceCm} cm (DBH ≈ ${(plant.trunkCircumferenceCm / 3.1416).toFixed(1)} cm)</div>`
              : plant.trunkDiameterCm
              ? `<div><strong>Trunk DBH:</strong> ${plant.trunkDiameterCm} cm</div>`
              : ''
          }
        </div>

        <button
          type="button"
          onclick="window.wimpStartNav && window.wimpStartNav(${targetCoordinates.lat}, ${targetCoordinates.lng}, '${safeCommonName}')"
          class="w-full mb-1.5 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <span>🧭 Start Now (Route)</span>
        </button>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      closeButton: true,
      autoPan: true,
      className: 'botanical-map-popup',
    });

    marker.on('click', () => {
      setActiveItem({ type: 'plant', plant });
    });

    marker.on('popupopen', () => {
      setActiveItem({ type: 'plant', plant });
    });

    selectedGroup.addLayer(marker);
    markersMapRef.current.set(plant.id, marker);

    // Stop auto-following so GPS does not pull the map away from the plant
    setIsFollowing(false);
    isFollowingRef.current = false;
    hasUserPannedOrZoomedRef.current = true;

    // Center map smoothly on the plant's saved coordinates
    map.setView([targetCoordinates.lat, targetCoordinates.lng], 17, { animate: true });
    setActiveItem({ type: 'plant', plant });

    // Open popup after map layout settles and invalidate size for tab visibility
    const t1 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.setView([targetCoordinates.lat, targetCoordinates.lng], 17);
        marker.openPopup();
      }
    }, 250);

    const t2 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.setView([targetCoordinates.lat, targetCoordinates.lng], 17);
      }
    }, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [effectiveSelectedPlant, targetCoordinates, isActive]);

  // Formatters for route distance and duration
  const formatRouteDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatRouteDuration = (seconds: number): string => {
    if (seconds < 60) return '< 1 min';
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (remMins === 0) return `${hours} hr${hours === 1 ? '' : 's'}`;
    return `${hours} hr ${remMins} min`;
  };

  // Road Route Navigation Handler using OSRM
  const fetchAndDrawRoute = useCallback(async (
    start: Coordinates,
    destination: Coordinates,
    destName: string,
    isAutoReroute: boolean = false
  ) => {
    setIsCalculatingRoute(true);
    setRouteError(null);

    try {
      // Calculate real road-following route via OSRM public API
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Routing service responded with status ${res.status}`);
      }

      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error(data.message || 'No road route found to this location.');
      }

      const primaryRoute = data.routes[0];
      const rawCoordinates = primaryRoute.geometry?.coordinates;
      if (!rawCoordinates || rawCoordinates.length === 0) {
        throw new Error('Route geometry unavailable.');
      }

      // GeoJSON is [lng, lat] -> Leaflet requires [lat, lng]
      const latlngs: [number, number][] = rawCoordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      );

      const routeInfo = {
        destinationName: destName,
        destinationCoords: destination,
        distanceMeters: primaryRoute.distance,
        durationSeconds: primaryRoute.duration,
        coordinates: latlngs,
        originalDistanceMeters: primaryRoute.distance,
        originalDurationSeconds: primaryRoute.duration,
      };

      setActiveRoute(routeInfo);
      activeRouteRef.current = routeInfo;
      isNavigatingRef.current = true;

      // Render road line in vibrant Blue on Leaflet map
      const map = mapInstanceRef.current;
      const routeGroup = routeLayerRef.current;
      if (map && routeGroup) {
        routeGroup.clearLayers();

        // High contrast casing
        const casingLine = L.polyline(latlngs, {
          color: '#1d4ed8',
          weight: 8,
          opacity: 0.35,
          lineCap: 'round',
          lineJoin: 'round',
        });

        // Vibrant Blue primary road line
        const blueLine = L.polyline(latlngs, {
          color: '#2563eb', // Vibrant Blue
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        });

        routeGroup.addLayer(casingLine);
        routeGroup.addLayer(blueLine);

        // On initial navigation start, fit bounds to display entire route.
        // On auto-reroute, keep the map smoothly following user GPS.
        if (!isAutoReroute) {
          map.fitBounds(blueLine.getBounds(), { padding: [50, 50], maxZoom: 16 });
        }
      }
    } catch (err: any) {
      console.warn('[ExploreMap] Routing error:', err);
      if (!isAutoReroute) {
        setRouteError(err.message || 'Could not calculate road route.');
      }
    } finally {
      setIsCalculatingRoute(false);
    }
  }, []);

  fetchAndDrawRouteRef.current = fetchAndDrawRoute;

  const handleStartNavigation = useCallback((
    destinationCoords: Coordinates,
    destinationName: string
  ) => {
    setRouteError(null);
    isNavigatingRef.current = true;
    // Navigation session begins strictly North-up (0°) with rotation active for the session
    setMapRotation(0);
    setIsTouchRotating(false);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setRouteError('GPS geolocation is not supported by your browser.');
      isNavigatingRef.current = false;
      return;
    }

    setIsCalculatingRoute(true);

    // Always fetch a fresh, high-accuracy GPS fix directly from hardware/device sensors
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const freshCoords: Coordinates = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || undefined,
        };

        setLocalUserLocation(freshCoords);
        if (onUpdateUserLocation) onUpdateUserLocation(freshCoords);

        // Keep continuous GPS tracking running for turn updates if not already active
        if (!isTracking) {
          startedTrackingForNavRef.current = true;
          startLocationTracking();
        }

        // Start OSRM route strictly from this fresh latest GPS position
        fetchAndDrawRoute(freshCoords, destinationCoords, destinationName, false);
      },
      (err) => {
        setIsCalculatingRoute(false);
        isNavigatingRef.current = false;
        if (err.code === 1) {
          setRouteError('GPS permission was denied. Please allow location access in your browser to start navigation.');
        } else if (err.code === 2) {
          setRouteError('GPS position unavailable. Please check your device location settings.');
        } else if (err.code === 3) {
          setRouteError('GPS location request timed out. Please try again.');
        } else {
          setRouteError('Could not retrieve your GPS location to start navigation.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [fetchAndDrawRoute, isTracking, onUpdateUserLocation, startLocationTracking]);

  const handleClearRoute = useCallback(() => {
    setActiveRoute(null);
    activeRouteRef.current = null;
    isNavigatingRef.current = false;
    setRouteError(null);
    setIsReroutingUI(false);
    // Immediately reset map to North-up (0°) and disable active rotation
    setMapRotation(0);
    setIsTouchRotating(false);
    if (routeLayerRef.current) {
      routeLayerRef.current.clearLayers();
    }
    // Stop GPS watching when navigation is exited (if it was started for navigation)
    if (startedTrackingForNavRef.current) {
      startedTrackingForNavRef.current = false;
      stopLocationTracking();
    }
  }, [stopLocationTracking]);

  // Expose global callback for map popup "Start Now" buttons
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).wimpStartNav = (lat: number, lng: number, name: string) => {
        handleStartNavigation({ lat, lng }, name);
      };
      (window as any).wimpStartNavNursery = (id: string) => {
        const nursery = nurseriesRef.current.find((n) => n.id === id);
        if (nursery) {
          handleStartNavigation(nursery.coordinates, nursery.name);
        }
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).wimpStartNav;
        delete (window as any).wimpStartNavNursery;
      }
    };
  }, [handleStartNavigation]);

  const effectiveLocating = isLocating || isLocatingInternal;
  const displayLocationError = internalLocationError || locationError;

  return (
    <section id="explore-map" className="py-10 sm:py-12 bg-stone-50 border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 tracking-wider uppercase mb-1">
              <Compass className="w-3.5 h-3.5" />
              <span>Real Botanical Observations</span>
            </div>
            <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
              Explore Map
            </h2>
            <p className="text-sm text-stone-600 mt-1 max-w-2xl leading-relaxed">
              Real citizen science plant occurrences powered by <strong>iNaturalist</strong>. Discover verified public observations, 
              view observation photographs, inspect coordinates, and track plants near you.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Find Plants Near Me (Requirement 3) */}
            <button
              type="button"
              onClick={handleFindPlantsNearMe}
              disabled={effectiveLocating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap"
            >
              <Navigation className={`w-3.5 h-3.5 ${effectiveLocating ? 'animate-spin' : ''}`} />
              <span>{effectiveLocating ? 'Locating...' : 'Find Plants Near Me'}</span>
            </button>

            {/* Nearby Plant Nurseries Option */}
            <button
              type="button"
              onClick={handleToggleNurseries}
              disabled={isLoadingNurseries}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shadow-2xs border ${
                showNurseries
                  ? 'bg-amber-800 text-white border-amber-900 shadow-amber-200'
                  : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
              }`}
              title="Show nearby plant nurseries and garden centres on the map"
            >
              <span>🪴</span>
              <span>{isLoadingNurseries ? 'Searching Nurseries...' : 'Nearby Plant Nurseries'}</span>
              {showNurseries && nurseries.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-950/70 text-white rounded-full text-[10px]">
                  {nurseries.length}
                </span>
              )}
            </button>

            {/* Refresh Nearby Plants (Requirement 12) */}
            {activeUserLocation && (
              <button
                type="button"
                onClick={handleRefreshNearby}
                disabled={isLoadingObservations}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                title="Refresh nearby plant observations from iNaturalist"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-stone-600 ${isLoadingObservations ? 'animate-spin' : ''}`} />
                <span>Refresh Nearby Plants</span>
              </button>
            )}

            {/* Re-center on Me */}
            <button
              type="button"
              onClick={handleRecenterOnMe}
              disabled={effectiveLocating}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-900 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
              title="Center map on your latest coordinates"
            >
              <Crosshair className={`w-3.5 h-3.5 text-blue-600 ${effectiveLocating ? 'animate-spin' : ''}`} />
              <span>Re-center on Me</span>
            </button>

            {/* Start Live Location / Stop Location Tracking */}
            {!isTracking ? (
              <button
                type="button"
                onClick={() => startLocationTracking(true)}
                disabled={effectiveLocating}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap"
                title="Start continuous GPS location tracking with high-accuracy GPS"
              >
                <Radio className={`w-3.5 h-3.5 ${effectiveLocating ? 'animate-spin' : ''}`} />
                <span>{effectiveLocating ? 'Connecting GPS...' : 'Start Live Location'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopLocationTracking}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-stone-700 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap"
                title="Stop continuous GPS location tracking"
              >
                <span className="w-2 h-2 rounded-xs bg-rose-400"></span>
                <span>Stop Location Tracking</span>
              </button>
            )}

            {/* Follow Me Toggle */}
            <button
              type="button"
              onClick={handleToggleFollowMe}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shadow-2xs border ${
                isFollowing
                  ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200'
                  : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
              }`}
              title={isFollowing ? 'Follow Me is ON: Map auto-centers when you move' : 'Follow Me is OFF: Pan map freely'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isFollowing ? 'bg-white animate-pulse' : 'bg-stone-400'
                }`}
              />
              <span>Follow Me: {isFollowing ? 'ON' : 'OFF'}</span>
            </button>

            {/* Data Source Mode Switcher (India GBIF / Worldwide iNat / Campus Demo) */}
            <div className="flex items-center p-1 bg-stone-100 rounded-2xl border border-stone-300 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setActiveDataSource('india');
                  if (indiaRecords.length === 0) {
                    loadIndiaObservations();
                  } else if (mapInstanceRef.current) {
                    const valid = indiaRecords.filter(r => r.hasValidCoordinates && r.coordinates);
                    if (valid.length > 0) {
                      const bounds = L.latLngBounds(valid.map(r => [r.coordinates!.lat, r.coordinates!.lng] as [number, number]));
                      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
                    } else {
                      mapInstanceRef.current.setView([DEFAULT_INDIA_CENTER.lat, DEFAULT_INDIA_CENTER.lng], DEFAULT_INDIA_ZOOM, { animate: true });
                    }
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeDataSource === 'india'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
                title="Switch to verified India botanical observations from GBIF"
              >
                <span>🇮🇳</span>
                <span>India Flora (GBIF)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveDataSource('real');
                  if (inatRecords.length > 0 && mapInstanceRef.current) {
                    const bounds = L.latLngBounds(
                      inatRecords.map((r) => [r.coordinates.lat, r.coordinates.lng] as [number, number])
                    );
                    mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
                  } else {
                    handleQuerySpecies('Tulsi');
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeDataSource === 'real'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
                title="Switch to global observations from iNaturalist"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Worldwide (iNat)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveDataSource('demo');
                  const map = mapInstanceRef.current;
                  if (map) {
                    map.setView([DEMO_CAMPUS_CENTER.lat, DEMO_CAMPUS_CENTER.lng], 16, { animate: true });
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeDataSource === 'demo'
                    ? 'bg-amber-700 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
                title="Switch to campus demo plants"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Demo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Location Error Banner */}
        {displayLocationError && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start justify-between gap-3 text-xs text-rose-950">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold text-rose-900">Location Access Notice: </span>
                {displayLocationError}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setInternalLocationError(null);
                if (onClearLocationError) onClearLocationError();
              }}
              className="text-rose-700 hover:text-rose-900 font-bold text-xs cursor-pointer p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Low Accuracy Warning (Requirement 13) */}
        {lowAccuracyWarning && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-start sm:items-center justify-between gap-3 text-xs text-amber-950 animate-in fade-in shadow-2xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <div className="leading-relaxed">
                <strong className="text-amber-900 font-semibold">GPS Signal Note: </strong>
                <span>{lowAccuracyWarning}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLowAccuracyWarning(null)}
              className="text-amber-700 hover:text-amber-900 font-bold text-xs cursor-pointer p-1 shrink-0"
              aria-label="Dismiss GPS warning"
            >
              ✕
            </button>
          </div>
        )}

        {/* User GPS Active Banner (Requirements 6, 10, 11) */}
        {activeUserLocation && (
          <div className="bg-blue-50/95 border border-blue-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-950 shadow-2xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <span className="relative flex h-3 w-3 shrink-0 mt-0.5 sm:mt-0">
                {isTracking && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                )}
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-1.5 font-semibold text-blue-950">
                  <span>Current Position:</span>
                  <span className="font-mono bg-blue-100/80 px-1.5 py-0.5 rounded text-blue-900 text-[11px]">
                    {activeUserLocation.lat.toFixed(5)}°, {activeUserLocation.lng.toFixed(5)}°
                  </span>
                  {activeUserLocation.accuracy != null && (
                    <span className="text-blue-900 font-semibold ml-1">
                      • GPS accuracy: about {Math.round(activeUserLocation.accuracy)} m
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-blue-700 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>{isTracking ? '🟢 Continuous live tracking active' : '⚪ Live tracking stopped'}</span>
                  <span>• Follow Me: {isFollowing ? 'ON' : 'OFF'}</span>
                  <span className="text-blue-600/90 text-[10px]">
                    🔒 Privacy: Coordinates used strictly in browser memory for nearby calculations. Never saved permanently.
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleRecenterOnMe}
                className="px-3 py-1.5 bg-white border border-blue-300 text-blue-900 text-xs font-semibold rounded-xl hover:bg-blue-100 transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
              >
                <Crosshair className="w-3.5 h-3.5 text-blue-600" />
                <span>Re-center on Me</span>
              </button>

              {isTracking ? (
                <button
                  type="button"
                  onClick={stopLocationTracking}
                  className="px-3 py-1.5 bg-stone-100 border border-stone-300 text-stone-800 text-xs font-semibold rounded-xl hover:bg-stone-200 transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                >
                  <span>Stop Location Tracking</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startLocationTracking(true)}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                >
                  <span>Start Live Location</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Data Source Informational Banners */}
        {activeDataSource === 'india' ? (
          <div className="bg-emerald-50/95 border border-emerald-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950 shadow-2xs">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">🇮🇳</span>
              <div className="leading-relaxed">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-emerald-900 text-sm">
                    Verified India Botanical Observations (GBIF)
                  </span>
                  <span className="bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold">
                    {indiaRecords.length} records loaded {indiaMeta.georeferencedCount > 0 && `(${indiaMeta.georeferencedCount} on map)`}
                  </span>
                </div>
                <p className="text-stone-700 text-xs mt-1">
                  Authentic plant occurrences across India from the Global Biodiversity Information Facility (GBIF).
                  {selectedIndiaSpeciesFilter && selectedIndiaSpeciesFilter !== 'All India Flora' && (
                    <span> Current species filter: <strong>&quot;{selectedIndiaSpeciesFilter}&quot;</strong>.</span>
                  )}
                </p>
                <div className="text-stone-600 text-[11px] mt-1 flex flex-wrap items-center gap-2">
                  <span>🏛️ Academic Herbaria & Citizen Science</span>
                  <span>•</span>
                  <span>🔒 Respects open photo licenses</span>
                  {indiaMeta.missingCoordsCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-amber-800 font-medium">📍 {indiaMeta.missingCoordsCount} records without GPS coordinates (prevented false coordinates)</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => loadIndiaObservations(selectedIndiaSpeciesFilter !== 'All India Flora' ? selectedIndiaSpeciesFilter : undefined)}
                className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 text-xs rounded-xl font-semibold cursor-pointer transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-700" />
                <span>Refresh India Data</span>
              </button>
              <a
                href="https://www.gbif.org/country/IN/summary"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs rounded-xl font-semibold cursor-pointer transition-colors inline-flex items-center gap-1 shadow-2xs"
              >
                <span>GBIF India</span>
                <ExternalLink className="w-3 h-3 text-emerald-200" />
              </a>
            </div>
          </div>
        ) : activeDataSource === 'real' ? (
          <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950">
            <div className="flex items-start gap-3">
              <Globe className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold text-emerald-900">
                  Public observations from iNaturalist:
                </span>{' '}
                {currentQueryName ? (
                  <>
                    Displaying authentic recorded plant occurrences for{' '}
                    <span className="font-bold underline">{currentQueryName}</span>.
                  </>
                ) : (
                  <span>
                    Search for any botanical species above, select a Quick Species Test button, or tap <strong>&quot;Find Plants Near Me&quot;</strong> to explore verified occurrences.
                  </span>
                )}
                <span className="text-amber-900 font-medium text-[11px] block mt-1 bg-amber-100/70 px-2 py-0.5 rounded border border-amber-200/60 max-w-xl">
                  ⚠️ This is a recorded observation, not a guarantee that the plant is currently present.
                </span>
              </div>
            </div>

            <a
              href="https://www.inaturalist.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 text-xs rounded-xl font-semibold cursor-pointer shrink-0 transition-colors inline-flex items-center gap-1 self-start sm:self-auto shadow-2xs"
            >
              <span>Explore iNaturalist</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-start gap-3">
              <Database className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold text-amber-900">FALLBACK TEST MODE: </span>
                Displaying local simulated campus specimens.
              </div>
            </div>
            <button
              onClick={() => setActiveDataSource('india')}
              className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs rounded-xl font-semibold cursor-pointer shrink-0"
            >
              Switch to India Observations
            </button>
          </div>
        )}

        {/* Loading State (Requirement 9) */}
        {isLoadingObservations && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs text-emerald-900 shadow-2xs">
            <Loader2 className="w-4 h-4 text-emerald-700 animate-spin shrink-0" />
            <span className="font-medium">{loadingMessage}</span>
          </div>
        )}

        {/* Error State (Requirement 9 & 13) */}
        {observationError && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-950 animate-in fade-in shadow-2xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold text-rose-900">Unable to load observations. Please try again.</strong>
                <p className="text-rose-800 text-[11px] mt-0.5">{observationError}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (isNearbyMode && activeUserLocation) {
                    handleRefreshNearby();
                  } else {
                    handleQuerySpecies(currentQueryName);
                  }
                }}
                className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl font-semibold cursor-pointer shadow-2xs"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setActiveDataSource('demo')}
                className="px-3 py-1.5 bg-white border border-rose-200 text-rose-800 hover:bg-rose-100 rounded-xl font-medium cursor-pointer shadow-2xs"
              >
                View Demo Plants
              </button>
            </div>
          </div>
        )}

        {/* Search & Radius Filter Bar (Requirement 3: 1 km, 5 km, 10 km, 25 km, 50 km) */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
          {/* Live Plant / Species Search Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (mapSearchTerm.trim()) {
                if (activeDataSource === 'india') {
                  loadIndiaObservations(mapSearchTerm.trim());
                } else {
                  handleQuerySpecies(mapSearchTerm.trim());
                }
              }
            }}
            className="relative flex-1 min-w-[240px] max-w-lg flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={mapSearchTerm}
                onChange={(e) => setMapSearchTerm(e.target.value)}
                placeholder={
                  activeDataSource === 'india'
                    ? "Search Indian flora (e.g. Tulsi, Neem, Sandalwood, Banyan)..."
                    : "Search plant (e.g. Tulsi, Mimosa pudica, Neem, Mango)..."
                }
                className="w-full pl-9 pr-8 py-2 text-xs text-stone-800 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors"
              />
              {mapSearchTerm && (
                <button
                  type="button"
                  onClick={() => setMapSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs px-1 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoadingObservations || !mapSearchTerm.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{activeDataSource === 'india' ? 'Search India' : 'Search Observations'}</span>
            </button>
          </form>

          {/* Near Me Radius Selector (Requirement 3: 1 km, 5 km, 10 km, 25 km, 50 km) */}
          <div className="flex flex-wrap items-center gap-3 justify-between lg:justify-end">
            {/* Nearby Plant Nurseries Quick Toggle */}
            <button
              type="button"
              onClick={handleToggleNurseries}
              disabled={isLoadingNurseries}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border shrink-0 ${
                showNurseries
                  ? 'bg-amber-800 text-white border-amber-900 shadow-xs'
                  : 'bg-stone-100 hover:bg-stone-200 border-stone-200 text-stone-700'
              }`}
              title="Show nearby plant nurseries and garden centres"
            >
              <span>🪴</span>
              <span>{isLoadingNurseries ? 'Searching...' : 'Nearby Nurseries'}</span>
              {showNurseries && nurseries.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-amber-950/70 text-white rounded-full text-[10px]">
                  {nurseries.length}
                </span>
              )}
            </button>

            {/* Map Layer Switcher (OpenStreetMap / Satellite) */}
            <div className="flex items-center p-1 bg-stone-100 rounded-xl border border-stone-200 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => handleSwitchMapStyle('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mapStyle === 'map'
                    ? 'bg-emerald-900 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                title="Switch to standard OpenStreetMap view"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Map</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMapStyle('satellite')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mapStyle === 'satellite'
                    ? 'bg-emerald-900 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                title="Switch to high-resolution Satellite view"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Satellite</span>
              </button>
            </div>

            {/* Radius Options (5 km, 10 km, 25 km, 50 km) */}
            <div className="flex items-center gap-1 overflow-x-auto text-xs bg-stone-50 p-1 rounded-xl border border-stone-200">
              <span className="text-stone-500 font-semibold px-1.5 flex items-center gap-1 text-[11px] whitespace-nowrap">
                <Navigation className="w-3 h-3 text-emerald-700" /> Radius:
              </span>
              {([5, 10, 25, 50] as RadiusKmOption[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleChangeRadius(r)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    radiusKm === r
                      ? 'bg-emerald-800 text-white shadow-2xs'
                      : 'text-stone-700 hover:bg-stone-200'
                  }`}
                  title={`Search nurseries and observations within ${r} km`}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Species & Source Platform Quick Filters (India GBIF Flora vs Worldwide iNat) */}
        {activeDataSource === 'india' ? (
          <div className="space-y-2">
            {/* Source Repository / Platform Selector */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 text-xs text-stone-600">
              <span className="font-semibold text-emerald-950 whitespace-nowrap text-[11px] flex items-center gap-1">
                <Database className="w-3 h-3 text-emerald-700" />
                Data Source:
              </span>
              {[
                { id: 'all', label: 'All GBIF Sources' },
                { id: 'plantnet', label: '🌿 Pl@ntNet Published' },
                { id: 'human_obs', label: '📸 Citizen Science Observations' },
                { id: 'specimens', label: '🏛️ Herbarium Specimens' },
              ].map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => {
                    const newSource = src.id as IndiaSourceFilter;
                    setSelectedIndiaSourceFilter(newSource);
                    loadIndiaObservations(
                      selectedIndiaSpeciesFilter !== 'All India Flora' ? selectedIndiaSpeciesFilter : undefined,
                      false,
                      0,
                      newSource
                    );
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-2xs ${
                    selectedIndiaSourceFilter === src.id
                      ? 'bg-emerald-900 text-white border-emerald-950 ring-1 ring-emerald-400'
                      : 'bg-white border-stone-200 hover:border-emerald-600 hover:text-emerald-900 text-stone-700'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>

            {/* Indian Flora Species Quick Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs text-stone-600">
              <span className="font-semibold text-emerald-900 whitespace-nowrap text-[11px] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-700" />
                Indian Flora Quick Filter:
              </span>
            {[
              { label: 'All India Flora', query: 'All India Flora' },
              { label: 'Tulsi', query: 'Tulsi' },
              { label: 'Neem Tree', query: 'Neem' },
              { label: 'Banyan Tree', query: 'Banyan' },
              { label: 'Peepal (Sacred Fig)', query: 'Peepal' },
              { label: 'Indian Sandalwood', query: 'Santalum album' },
              { label: 'Amla (Gooseberry)', query: 'Phyllanthus emblica' },
              { label: 'Mango (Aam)', query: 'Mango' },
              { label: 'Lotus (Kamal)', query: 'Nelumbo nucifera' },
              { label: 'Ashoka Tree', query: 'Ashoka' },
              { label: 'China Rose (Hibiscus)', query: 'Hibiscus rosa-sinensis' },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setMapSearchTerm(item.query === 'All India Flora' ? '' : item.query);
                  loadIndiaObservations(item.query);
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer shadow-2xs ${
                  selectedIndiaSpeciesFilter === item.query
                    ? 'bg-emerald-800 text-white border-emerald-900'
                    : 'bg-white border-stone-200 hover:border-emerald-600 hover:text-emerald-900 text-stone-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs text-stone-600">
            <span className="font-semibold text-emerald-900 whitespace-nowrap text-[11px] flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-700" />
              Quick Species Test:
            </span>
            {[
              { label: 'Tulsi', query: 'Tulsi' },
              { label: 'Mimosa pudica', query: 'Mimosa pudica' },
              { label: 'Neem', query: 'Neem' },
              { label: 'Mango', query: 'Mango' },
              { label: 'Hibiscus', query: 'Hibiscus rosa-sinensis' },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setMapSearchTerm(item.query);
                  handleQuerySpecies(item.query);
                }}
                className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:border-emerald-600 hover:text-emerald-900 text-stone-700 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Nursery Notice Banner */}
        {showNurseries && nurseryNotice && (
          <div className="bg-amber-50/95 border border-amber-300 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs text-amber-950 animate-in fade-in shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="text-lg shrink-0">🪴</span>
              <div className="leading-snug">
                <strong className="font-semibold text-amber-900">Nearby Nurseries: </strong>
                <span>{nurseryNotice}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNurseryNotice(null)}
              className="text-amber-800 hover:text-amber-950 font-bold text-xs cursor-pointer p-1 shrink-0"
              aria-label="Dismiss nursery notice"
            >
              ✕
            </button>
          </div>
        )}

        {/* No Observations Found State (Requirement 9) - only shown when a search was performed */}
        {activeDataSource === 'real' && !isLoadingObservations && inatRecords.length === 0 && (Boolean(currentQueryName) || isNearbyMode) && (
          <div className="p-6 text-center bg-white rounded-3xl border border-stone-200 shadow-xs space-y-3 max-w-lg mx-auto animate-in fade-in">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto text-lg">
              🌱
            </div>
            <div className="space-y-1">
              <h4 className="font-serif-display text-base font-bold text-stone-900">
                {isNearbyMode 
                  ? "No observations found within this radius."
                  : `No observations found for "${currentQueryName}".`
                }
              </h4>
              <p className="text-xs text-stone-600">
                {isNearbyMode 
                  ? `Try increasing the search radius to 25 km or 50 km to find public observations in surrounding areas.`
                  : `Try searching by scientific binomial (e.g. "Ocimum tenuiflorum", "Mimosa pudica") or explore demo campus specimens.`
                }
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {isNearbyMode && radiusKm < 50 && (
                <button
                  type="button"
                  onClick={() => {
                    const nextRadius: RadiusKmOption = radiusKm < 25 ? 25 : 50;
                    handleChangeRadius(nextRadius);
                  }}
                  className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Expand to {radiusKm < 25 ? '25 km' : '50 km'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveDataSource('demo')}
                className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-xl transition-colors cursor-pointer"
              >
                View Demo Campus Plants
              </button>
            </div>
          </div>
        )}

        {/* Map Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Map Canvas */}
          <div
            className={
              isMapFullscreen
                ? `fixed inset-0 z-[9999] w-screen h-screen m-0 p-0 rounded-none border-none ${
                    mapStyle === 'satellite' ? 'bg-stone-900' : 'bg-stone-100'
                  } overflow-hidden select-none`
                : `lg:col-span-8 ${
                    mapStyle === 'satellite' ? 'bg-stone-900' : 'bg-stone-100'
                  } rounded-3xl border border-stone-200 overflow-hidden shadow-xs h-[480px] sm:h-[560px] relative select-none`
            }
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div
              ref={mapContainerRef}
              style={{
                transform: `rotate(${activeRoute ? mapRotation : 0}deg) scale(${
                  activeRoute && mapRotation !== 0 ? getRotationScale(mapRotation) : 1
                })`,
                transformOrigin: '50% 50%',
                transition: isTouchRotating ? 'none' : 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}
              className="w-full h-full z-10"
            />

            {/* Active Touch Rotation Angle Indicator Overlay (Active Navigation Sessions ONLY) */}
            {isTouchRotating && Boolean(activeRoute) && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-stone-900/90 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full text-xs font-mono font-bold shadow-xl border border-white/20 pointer-events-none flex items-center gap-2 animate-in fade-in duration-100">
                <Compass className="w-4 h-4 text-emerald-400 animate-spin" />
                <span>
                  Bearing: {((mapRotation % 360 + 360) % 360).toFixed(0)}° {getCardinalDirection(mapRotation)}
                </span>
              </div>
            )}

            {/* Fullscreen Floating Header Pill with Done / Collapse Button */}
            {isMapFullscreen && (
              <div className="absolute top-3 left-3 z-[1000] max-w-[calc(100%-250px)] sm:max-w-md bg-white/95 backdrop-blur-md px-3 py-1.5 sm:py-2 rounded-xl border border-stone-300 shadow-md flex items-center justify-between gap-2.5 text-xs pointer-events-auto animate-in fade-in duration-150">
                <div className="flex items-center gap-2 min-w-0">
                  <Compass className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-stone-900 truncate">
                      {activeItem?.type === 'plant' && activeItem.plant
                        ? activeItem.plant.commonName
                        : activeItem?.type === 'inat' && activeItem.inat
                        ? (activeItem.inat.commonName || activeItem.inat.scientificName)
                        : activeItem?.type === 'community' && activeItem.community
                        ? activeItem.community.commonName
                        : 'Interactive Flora Map'}
                    </div>
                    <div className="text-[10px] text-stone-500 truncate hidden xs:block">
                      Fullscreen mode • Press Esc to return
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMapFullscreen(false)}
                  className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-all shadow-xs"
                  title="Return to standard page layout"
                >
                  Done
                </button>
              </div>
            )}

            {/* In-canvas Map / Satellite View Toggle, Compass / Reset North & Fullscreen */}
            <div className="absolute top-3 right-3 z-[1000] pointer-events-auto flex items-center bg-white/95 backdrop-blur-md p-1 rounded-2xl border border-stone-300 shadow-md gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSwitchMapStyle('map');
                }}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
                  mapStyle === 'map'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                }`}
                title="Switch to standard OpenStreetMap view"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Map</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSwitchMapStyle('satellite');
                }}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
                  mapStyle === 'satellite'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                }`}
                title="Switch to Satellite imagery view"
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Satellite</span>
              </button>

              {/* Interactive Rotation & Reset North Controls (Visible ONLY during active road navigation) */}
              {Boolean(activeRoute) && (
                <>
                  <div className="w-px h-4 bg-stone-300 mx-0.5" />

                  {/* Reset North Compass Control Button */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetNorth();
                    }}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
                      mapRotation !== 0
                        ? 'bg-amber-500 hover:bg-amber-600 text-stone-950 shadow-xs'
                        : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                    }`}
                    title={
                      mapRotation !== 0
                        ? `Reset to North (currently rotated ${((mapRotation % 360 + 360) % 360).toFixed(0)}°)`
                        : 'Map is oriented North-up. Click or tap to align North.'
                    }
                    aria-label="Reset North"
                  >
                    <div
                      style={{
                        transform: `rotate(${-mapRotation}deg)`,
                        transition: isTouchRotating ? 'none' : 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      }}
                      className="w-3.5 h-3.5 flex items-center justify-center shrink-0"
                    >
                      <Compass
                        className={`w-3.5 h-3.5 ${
                          mapRotation !== 0 ? 'text-stone-950 stroke-[2.5]' : 'text-emerald-700'
                        }`}
                      />
                    </div>
                    <span className="font-mono text-[11px]">
                      {mapRotation === 0
                        ? 'North'
                        : `${((mapRotation % 360 + 360) % 360).toFixed(0)}°`}
                    </span>
                  </button>

                  {/* Quick Rotate Left (-45°) */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRotateBy(-45);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-600 hover:text-stone-950 hover:bg-stone-100/90 transition-colors cursor-pointer"
                    title="Rotate 45° Counter-Clockwise (Left)"
                    aria-label="Rotate Left"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  {/* Quick Rotate Right (+45°) */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRotateBy(45);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-600 hover:text-stone-950 hover:bg-stone-100/90 transition-colors cursor-pointer"
                    title="Rotate 45° Clockwise (Right)"
                    aria-label="Rotate Right"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              <div className="w-px h-4 bg-stone-300 mx-0.5" />

              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMapFullscreen((prev) => !prev);
                }}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
                  isMapFullscreen
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                }`}
                title={isMapFullscreen ? 'Collapse map to normal layout (Esc)' : 'Expand map to fullscreen'}
                aria-label={isMapFullscreen ? 'Collapse map to normal layout' : 'Expand map to fullscreen'}
              >
                {isMapFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5 text-current" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 text-current" />
                )}
                <span className="hidden sm:inline">{isMapFullscreen ? 'Collapse' : 'Expand'}</span>
              </button>
            </div>

            {/* Active Road Route HUD Overlay (Compact on mobile, full on desktop) */}
            {activeRoute && (
              <div className="absolute top-12 sm:top-14 left-2 right-2 sm:left-auto sm:right-3 sm:max-w-xs md:max-w-sm z-[1000] bg-blue-900/95 backdrop-blur-md text-white px-2 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl shadow-lg border border-blue-400/30 flex items-center justify-between gap-1.5 sm:gap-2 animate-in slide-in-from-top-2 pointer-events-auto">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <div className="hidden sm:flex w-7 h-7 rounded-lg bg-blue-600 items-center justify-center shrink-0 shadow-inner">
                    <Navigation className="w-4 h-4 text-white animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 sm:gap-1.5 leading-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-ping" />
                      <span className="text-[8.5px] sm:text-[9px] uppercase font-bold text-blue-200 tracking-wider whitespace-nowrap">
                        {isReroutingUI ? 'Recalculating...' : 'Live Nav'}
                      </span>
                      <span className="text-blue-300/60 hidden sm:inline">•</span>
                      <span className="text-[10px] sm:text-xs font-bold truncate text-white leading-tight max-w-[110px] xs:max-w-[150px] sm:max-w-[170px]">
                        To: {activeRoute.destinationName}
                      </span>
                    </div>
                    <div className="text-[9.5px] sm:text-[11px] text-blue-100 flex items-center gap-1 sm:gap-1.5 leading-tight mt-0.5">
                      <span className="font-semibold text-white whitespace-nowrap">
                        📍 {formatRouteDistance(activeRoute.distanceMeters)}
                      </span>
                      <span>•</span>
                      <span className="font-semibold text-white whitespace-nowrap">
                        ⏱️ {formatRouteDuration(activeRoute.durationSeconds)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {mapRotation !== 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetNorth();
                      }}
                      className="px-1.5 py-0.5 sm:px-2 sm:py-1 bg-amber-400 hover:bg-amber-300 active:scale-95 text-stone-950 rounded text-[9px] sm:text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 shadow-2xs"
                      title="Reset map orientation to North (0°)"
                      aria-label="Reset North"
                    >
                      <Compass className="w-3 h-3 text-stone-950" />
                      <span>North</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeUserLocation && mapInstanceRef.current) {
                        mapInstanceRef.current.setView(
                          [activeUserLocation.lat, activeUserLocation.lng],
                          Math.max(mapInstanceRef.current.getZoom(), 16),
                          { animate: true }
                        );
                      }
                    }}
                    className="px-1.5 py-0.5 sm:px-2 sm:py-1 bg-blue-800 hover:bg-blue-700 active:scale-95 text-white rounded text-[9px] sm:text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    title="Recenter map on your latest GPS location"
                  >
                    Recenter
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mapInstanceRef.current && routeLayerRef.current) {
                        const layers = routeLayerRef.current.getLayers();
                        if (layers.length > 0) {
                          const polyline = layers[layers.length - 1] as L.Polyline;
                          mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50], maxZoom: 16 });
                        }
                      }
                    }}
                    className="px-1.5 py-0.5 sm:px-2 sm:py-1 bg-blue-800 hover:bg-blue-700 active:scale-95 text-white rounded text-[9px] sm:text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    title="Fit route on map"
                  >
                    Fit Route
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearRoute();
                    }}
                    className="p-1 sm:px-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded text-[10px] sm:text-xs transition-colors cursor-pointer font-bold leading-none"
                    title="Exit Navigation"
                    aria-label="Exit Navigation"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Route Error Notification (Compact) */}
            {routeError && (
              <div className="absolute top-14 left-2 right-2 sm:left-auto sm:right-3 sm:max-w-xs z-[1000] bg-rose-900/95 backdrop-blur-md text-white p-2 sm:p-2.5 rounded-xl shadow-lg border border-rose-400/40 flex items-start justify-between gap-2 animate-in slide-in-from-top-2 pointer-events-auto">
                <div className="flex items-start gap-2 text-[11px] min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-rose-100 leading-tight">Navigation Notice</div>
                    <div className="text-stone-200 mt-0.5 leading-snug text-[10px] sm:text-[11px]">{routeError}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRouteError(null);
                  }}
                  className="text-stone-300 hover:text-white p-0.5 cursor-pointer text-[10px] font-bold leading-none shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* In-canvas controls */}
            <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2 max-w-[calc(100%-170px)] sm:max-w-none">
              <button
                type="button"
                onClick={() => {
                  if (mapInstanceRef.current) {
                    if (activeDataSource === 'india') {
                      const valid = indiaRecords.filter(
                        (r) => r.hasValidCoordinates && r.coordinates
                      );
                      if (valid.length > 0) {
                        const bounds = L.latLngBounds(
                          valid.map((r) => [r.coordinates!.lat, r.coordinates!.lng] as [number, number])
                        );
                        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
                      } else {
                        mapInstanceRef.current.setView([DEFAULT_INDIA_CENTER.lat, DEFAULT_INDIA_CENTER.lng], DEFAULT_INDIA_ZOOM, { animate: true });
                      }
                    } else if (activeDataSource === 'real' && inatRecords.length > 0) {
                      const bounds = L.latLngBounds(
                        inatRecords.map((r) => [r.coordinates.lat, r.coordinates.lng] as [number, number])
                      );
                      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
                    } else if (activeUserLocation) {
                      mapInstanceRef.current.setView([activeUserLocation.lat, activeUserLocation.lng], 15, { animate: true });
                    } else {
                      mapInstanceRef.current.setView([DEFAULT_INDIA_CENTER.lat, DEFAULT_INDIA_CENTER.lng], DEFAULT_INDIA_ZOOM, { animate: true });
                    }
                  }
                }}
                className="bg-white/95 hover:bg-white text-stone-700 px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-medium shadow-xs transition-all cursor-pointer backdrop-blur-xs"
              >
                Reset View
              </button>

              <button
                type="button"
                onClick={handleRecenterOnMe}
                disabled={effectiveLocating}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                title="Center map on your real device location"
              >
                <Crosshair className={`w-3.5 h-3.5 ${effectiveLocating ? 'animate-spin' : ''}`} />
                <span>Re-center on Me</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFollowMe}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs border ${
                  isFollowing
                    ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200'
                    : 'bg-white/95 hover:bg-white border-stone-200 text-stone-700 backdrop-blur-xs'
                }`}
                title={isFollowing ? 'Follow Me is ON: Map auto-centers when you move' : 'Follow Me is OFF: Pan map freely'}
              >
                <span>🎯 Follow: {isFollowing ? 'ON' : 'OFF'}</span>
              </button>

              {isTracking && (
                <div
                  className="bg-emerald-900/90 text-white px-1.5 py-0.5 rounded-lg border border-emerald-500/40 text-[9px] sm:text-[10px] font-semibold flex items-center gap-1 shadow-xs backdrop-blur-xs whitespace-nowrap"
                  title={`Live GPS Active${gpsAccuracy ? ` (Accuracy: ±${Math.round(gpsAccuracy)}m)` : ''}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                  <span>GPS{gpsAccuracy ? ` • ${Math.round(gpsAccuracy)}m` : ''}</span>
                </div>
              )}
            </div>

            {/* Clickable Data Attribution near map */}
            <div className="absolute bottom-2 left-2 sm:bottom-2.5 sm:left-2.5 z-[400] bg-white/95 backdrop-blur-md px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg border border-stone-200/90 text-[10px] sm:text-[11px] text-stone-700 shadow-xs flex items-center gap-1.5 sm:gap-2 max-w-[calc(100%-170px)] sm:max-w-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse shrink-0"></span>
              <span className="truncate">
                <strong>{activeDataSource === 'india' ? indiaRecords.length : activeDataSource === 'real' ? inatRecords.length : plants.length}</strong>{' '}
                {activeDataSource === 'india' ? 'India GBIF records' : activeDataSource === 'real' ? 'observations' : 'demo items'}
              </span>
              {communityObsList.length > 0 && (
                <>
                  <span className="text-stone-300">|</span>
                  <span className="text-purple-800 font-semibold truncate">
                    <strong>{communityObsList.length}</strong> community
                  </span>
                </>
              )}
              {showNurseries && nurseries.length > 0 && (
                <>
                  <span className="text-stone-300">|</span>
                  <span className="text-amber-800 font-semibold truncate">
                    <strong>{nurseries.length}</strong> nurseries (OSM)
                  </span>
                </>
              )}
              <span className="text-stone-300 hidden xs:inline">|</span>
              {activeDataSource === 'india' ? (
                <a
                  href="https://www.gbif.org/country/IN/summary"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-900 hover:underline hidden xs:inline-flex items-center gap-0.5 truncate"
                  title="Verified botanical records from GBIF"
                >
                  <span>GBIF India data</span>
                  <ExternalLink className="w-2.5 h-2.5 text-stone-400 shrink-0" />
                </a>
              ) : (
                <a
                  href="https://www.inaturalist.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-900 hover:underline hidden xs:inline-flex items-center gap-0.5 truncate"
                  title="Public observations from iNaturalist"
                >
                  <span>iNaturalist data</span>
                  <ExternalLink className="w-2.5 h-2.5 text-stone-400 shrink-0" />
                </a>
              )}
            </div>

            {/* In-canvas Map Legend - Compact UI */}
            <div className="absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 z-[400] bg-white/95 backdrop-blur-md px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-stone-200/90 text-[9px] sm:text-[10px] text-stone-700 shadow-xs flex flex-col gap-0.5 sm:gap-1 select-none pointer-events-auto max-w-[150px] sm:max-w-[170px]">
              <div className="text-[8px] sm:text-[9px] uppercase font-bold text-stone-400 tracking-wider">Map Legend</div>
              <div className="flex items-center gap-1.5 leading-tight">
                <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 border border-white"></span>
                </span>
                <span className="font-semibold text-blue-900 truncate">🔵 My location</span>
              </div>
              {activeDataSource === 'india' ? (
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="w-2 h-2 rounded-full bg-emerald-700 inline-block shrink-0"></span>
                  <span className="text-stone-700 truncate">🇮🇳 Plant (GBIF)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="w-2 h-2 rounded-full bg-emerald-700 inline-block shrink-0"></span>
                  <span className="text-stone-700 truncate">🌱 Plant (iNat)</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 leading-tight">
                <span className="w-2 h-2 rounded-full bg-purple-700 inline-block shrink-0"></span>
                <span className="text-stone-700 truncate">🌸 Community</span>
              </div>
              {activeDataSource === 'demo' && (
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0"></span>
                  <span className="text-stone-700 truncate">🌿 Demo plant</span>
                </div>
              )}
              {showNurseries && (
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block shrink-0"></span>
                  <span className="text-stone-700 truncate">🪴 Plant Nursery</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Stage: Active Observation Inspector Card */}
          <div className="lg:col-span-4 flex flex-col">
            {activeItem?.type === 'gbif' && activeItem.gbif ? (
              <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between h-full space-y-4 animate-in fade-in">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🇮🇳</span>
                      <span>GBIF India Occurrence</span>
                    </span>
                    <span className="text-xs font-mono text-stone-500">
                      #{activeItem.gbif.gbifKey}
                    </span>
                  </div>

                  {activeItem.gbif.imageUrl && activeItem.gbif.mediaAttribution?.permitsReuse ? (
                    <div className="aspect-[16/10] rounded-2xl overflow-hidden mb-3 bg-stone-100 border border-stone-200 relative group">
                      <img
                        src={activeItem.gbif.imageUrl}
                        alt={activeItem.gbif.scientificName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur-xs text-white text-[9px] p-2 flex items-center justify-between gap-1">
                        <span className="truncate">Photo: {activeItem.gbif.mediaAttribution.creator || 'Observer'}</span>
                        <span className="bg-emerald-600 px-1.5 py-0.5 rounded text-[8px] font-mono uppercase font-semibold shrink-0">
                          {activeItem.gbif.mediaAttribution.licenseLabel}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-[16/8] rounded-2xl mb-3 bg-stone-50 border border-stone-200 p-3 flex flex-col items-center justify-center text-center text-stone-500 space-y-1">
                      <span className="text-2xl">🌿</span>
                      <span className="text-xs font-medium text-stone-700">Verified Botanical Specimen</span>
                      <span className="text-[10px] text-stone-400">
                        {activeItem.gbif.mediaAttribution ? 'External photo copyright protected (respecting licenses)' : 'No open-license photo for this record'}
                      </span>
                    </div>
                  )}

                  <div className="text-xs text-stone-400 font-medium">Plant / Specimen:</div>
                  <h3 className="font-serif-display text-xl font-bold text-stone-900 leading-tight">
                    {activeItem.gbif.commonName || activeItem.gbif.scientificName}
                  </h3>
                  {activeItem.gbif.commonName && (
                    <div className="text-xs text-stone-600 italic mb-1 font-serif">
                      Accepted: {activeItem.gbif.scientificName}
                    </div>
                  )}
                  <div className="text-[11px] text-emerald-800 font-medium mb-2">
                    Family: {activeItem.gbif.family} {activeItem.gbif.basisOfRecord && `• ${activeItem.gbif.basisOfRecord}`}
                  </div>

                  <div className="space-y-2 text-xs text-stone-600 bg-stone-50 p-3.5 rounded-2xl border border-stone-100 mt-2">
                    <div>
                      <span className="font-semibold text-stone-800 block">📍 Location:</span>
                      <span className="text-stone-700">{activeItem.gbif.locality}</span>
                    </div>

                    {activeItem.gbif.eventDate && (
                      <div>
                        <span className="font-semibold text-stone-800">📅 Date Observed:</span>{' '}
                        <span>{activeItem.gbif.eventDate}</span>
                      </div>
                    )}

                    <div>
                      <span className="font-semibold text-stone-800">👤 Observer / Collector:</span>{' '}
                      <span className="text-stone-800 font-medium">{activeItem.gbif.recordedBy || 'Naturalist Observer'}</span>
                    </div>

                    <div>
                      <span className="font-semibold text-stone-800 block">🌐 Geographic Coordinates:</span>
                      {activeItem.gbif.hasValidCoordinates && activeItem.gbif.coordinates ? (
                        <div className="mt-0.5 space-y-1">
                          <span className="font-mono bg-stone-200/60 px-1.5 py-0.5 rounded text-[11px] text-stone-800">
                            {activeItem.gbif.coordinates.lat.toFixed(5)}°, {activeItem.gbif.coordinates.lng.toFixed(5)}°
                          </span>
                          {activeItem.gbif.coordinatePrecisionNotice && (
                            <p className="text-[10px] text-stone-500">
                              {activeItem.gbif.coordinatePrecisionNotice}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1 p-2 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] leading-snug">
                          📍 <strong>Coordinates not available:</strong> This specimen has withheld or unreferenced coordinates. To prevent incorrect coordinates, no marker is placed at guessed locations.
                        </div>
                      )}
                    </div>

                    {activeUserLocation && activeItem.gbif.hasValidCoordinates && activeItem.gbif.coordinates && (
                      <div className="text-emerald-900 font-semibold pt-1 border-t border-stone-200 flex items-center justify-between">
                        <span>Distance from your GPS:</span>
                        <span className="font-mono">{formatDistance(activeUserLocation, activeItem.gbif.coordinates)}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-stone-200 text-[10px] text-stone-500 space-y-1">
                      <div>
                        <span className="font-semibold text-stone-700">🏛️ Source Platform:</span>{' '}
                        <span className="text-emerald-900 font-semibold">{activeItem.gbif.sourcePlatform || 'GBIF Occurrence Network'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-stone-700">📦 Dataset:</span>{' '}
                        <span className="text-stone-700 truncate block" title={activeItem.gbif.datasetName}>{activeItem.gbif.datasetName}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-stone-700">📜 License:</span>{' '}
                        <span className="text-emerald-800 font-medium">{activeItem.gbif.datasetLicenseLabel || 'Open Academic Access'}</span>
                      </div>
                    </div>
                  </div>

                  {activeItem.gbif.hasSensitiveLocation && (
                    <div className="mt-2.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-snug">
                      🛡️ <strong>Sensitive Species Protection:</strong> Coordinate generalization applied at data source to safeguard rare wild populations against poaching.
                    </div>
                  )}
                </div>

                {/* Active Route Summary Box for GBIF India observation */}
                {activeRoute && activeItem.gbif && activeItem.gbif.hasValidCoordinates && activeItem.gbif.coordinates && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs space-y-1 text-blue-900">
                    <div className="font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-blue-800">
                        <Navigation className="w-3.5 h-3.5 text-blue-600" /> Active Road Route
                      </span>
                      <span className="text-[10px] bg-blue-200/70 text-blue-900 font-bold px-1.5 py-0.5 rounded">
                        OSRM Road
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <div>
                        <span className="text-stone-500 block text-[10px]">Distance:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDistance(activeRoute.distanceMeters)}</span>
                      </div>
                      <div className="border-l border-blue-200 pl-3">
                        <span className="text-stone-500 block text-[10px]">Est. Travel Time:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDuration(activeRoute.durationSeconds)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  {activeItem.gbif.hasValidCoordinates && activeItem.gbif.coordinates ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleStartNavigation(
                            activeItem.gbif!.coordinates!,
                            activeItem.gbif!.commonName || activeItem.gbif!.scientificName
                          )
                        }
                        disabled={isCalculatingRoute}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                      >
                        {isCalculatingRoute ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Calculating Road Route...</span>
                          </>
                        ) : (
                          <>
                            <Navigation className="w-4 h-4 text-white" />
                            <span>Start Now (Road Navigation)</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (mapInstanceRef.current && activeItem.gbif?.coordinates) {
                            mapInstanceRef.current.setView(
                              [activeItem.gbif.coordinates.lat, activeItem.gbif.coordinates.lng],
                              14,
                              { animate: true }
                            );
                            const marker = markersMapRef.current.get(activeItem.gbif.id);
                            if (marker) marker.openPopup();
                          }
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Center On This Observation</span>
                      </button>
                    </>
                  ) : null}

                  {activeItem.gbif.originalRecordUrl && activeItem.gbif.originalRecordUrl !== activeItem.gbif.gbifUrl && (
                    <a
                      href={activeItem.gbif.originalRecordUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                    >
                      <span>View on {(activeItem.gbif.sourcePlatform || 'Provider').split(' ')[0]}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-200" />
                    </a>
                  )}

                  <a
                    href={activeItem.gbif.gbifUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-emerald-900 hover:bg-emerald-950 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                  >
                    <span>Open Occurrence on GBIF</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-200" />
                  </a>

                  <div className="text-[10px] text-center text-stone-500">
                    Global Biodiversity Information Facility · Open Botanical Data
                  </div>
                </div>
              </div>
            ) : activeItem?.type === 'inat' && activeItem.inat ? (
              <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between h-full space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 uppercase tracking-wider">
                      Public Observation from iNaturalist
                    </span>
                    <span className="text-xs font-mono text-stone-500">
                      #{activeItem.inat.observationId}
                    </span>
                  </div>

                  {activeItem.inat.imageUrl && (
                    <div className="aspect-[16/10] rounded-2xl overflow-hidden mb-3 bg-stone-100 border border-stone-200 relative">
                      <img
                        src={activeItem.inat.imageUrl}
                        alt={activeItem.inat.scientificName}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-xs text-white text-[9px] px-1.5 py-0.5 rounded">
                        Photo from iNaturalist
                      </span>
                    </div>
                  )}

                  <div className="text-xs text-stone-400 font-medium">Plant:</div>
                  <h3 className="font-serif-display text-xl font-bold text-stone-900">
                    {activeItem.inat.commonName || activeItem.inat.scientificName}
                  </h3>
                  {activeItem.inat.commonName && (
                    <div className="text-xs text-stone-600 italic mb-2">
                      Scientific: {activeItem.inat.scientificName}
                    </div>
                  )}

                  <div className="space-y-2 text-xs text-stone-600 bg-stone-50 p-3 rounded-2xl border border-stone-100 mt-2">
                    <div>
                      <span className="font-semibold text-stone-800 block">Approx. Location:</span>
                      <span>{activeItem.inat.locality}</span>
                    </div>

                    {activeItem.inat.eventDate && (
                      <div>
                        <span className="font-semibold text-stone-800">Observed Date:</span>{' '}
                        <span>{activeItem.inat.eventDate}</span>
                      </div>
                    )}

                    <div>
                      <span className="font-semibold text-stone-800">Source:</span>{' '}
                      <span className="text-stone-600">Public observations from iNaturalist</span>
                    </div>

                    <div>
                      <span className="font-semibold text-stone-800">Coordinates:</span>{' '}
                      <span className="font-mono">{activeItem.inat.coordinates.lat.toFixed(4)}°, {activeItem.inat.coordinates.lng.toFixed(4)}°</span>
                    </div>

                    {activeUserLocation && (
                      <div className="text-emerald-900 font-semibold pt-1 border-t border-stone-200">
                        Distance from you: {formatDistance(activeUserLocation, activeItem.inat.coordinates)}
                      </div>
                    )}
                  </div>

                  {/* Mandatory Note (Requirement 8) */}
                  <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-snug">
                    ⚠️ <strong>Notice:</strong> This is a recorded observation, not a guarantee that the plant is currently present.
                  </div>
                </div>

                {/* Active Route Summary Box for iNat observation */}
                {activeRoute && activeItem.inat && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs space-y-1 text-blue-900">
                    <div className="font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-blue-800">
                        <Navigation className="w-3.5 h-3.5 text-blue-600" /> Active Road Route
                      </span>
                      <span className="text-[10px] bg-blue-200/70 text-blue-900 font-bold px-1.5 py-0.5 rounded">
                        OSRM Road
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <div>
                        <span className="text-stone-500 block text-[10px]">Distance:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDistance(activeRoute.distanceMeters)}</span>
                      </div>
                      <div className="border-l border-blue-200 pl-3">
                        <span className="text-stone-500 block text-[10px]">Est. Travel Time:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDuration(activeRoute.durationSeconds)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleStartNavigation(
                        activeItem.inat!.coordinates,
                        activeItem.inat!.commonName || activeItem.inat!.scientificName
                      )
                    }
                    disabled={isCalculatingRoute}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    {isCalculatingRoute ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Calculating Road Route...</span>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-4 h-4 text-white" />
                        <span>Start Now (Road Navigation)</span>
                      </>
                    )}
                  </button>

                  <a
                    href={activeItem.inat.observationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                  >
                    <span>Open on iNaturalist</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-200" />
                  </a>

                  <div className="text-[10px] text-center text-stone-500">
                    Public citizen science observation · iNaturalist API
                  </div>
                </div>
              </div>
            ) : activeItem?.type === 'community' && activeItem.community ? (
              <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between h-full space-y-4 animate-in fade-in">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-[10px] font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                      Community Observation
                    </span>
                    <span className="text-xs font-mono text-stone-500">
                      #{activeItem.community.id.slice(-6)}
                    </span>
                  </div>

                  {activeItem.community.imageUrl && (
                    <div className="aspect-[16/10] rounded-2xl overflow-hidden mb-3 bg-stone-100 border border-stone-200 relative">
                      <img
                        src={activeItem.community.imageUrl}
                        alt={activeItem.community.commonName}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-xs text-white text-[9px] px-1.5 py-0.5 rounded">
                        Community Photo
                      </span>
                    </div>
                  )}

                  <div className="text-xs text-stone-400 font-medium">Plant:</div>
                  <h3 className="font-serif-display text-xl font-bold text-stone-900">
                    {activeItem.community.commonName}
                  </h3>
                  {activeItem.community.scientificName && (
                    <div className="text-xs text-stone-600 italic mb-2 font-serif">
                      Scientific: {activeItem.community.scientificName}
                    </div>
                  )}

                  <div className="space-y-2 text-xs text-stone-600 bg-stone-50 p-3 rounded-2xl border border-stone-100 mt-2">
                    <div>
                      <span className="font-semibold text-stone-800">Date Observed:</span>{' '}
                      <span>{activeItem.community.date}</span>
                    </div>

                    <div>
                      <span className="font-semibold text-stone-800">Source:</span>{' '}
                      <span className="text-purple-900 font-medium">Community Observation</span>
                    </div>

                    <div>
                      <span className="font-semibold text-stone-800">Coordinates:</span>{' '}
                      <span className="font-mono">
                        {activeItem.community.coordinates.lat.toFixed(5)}°, {activeItem.community.coordinates.lng.toFixed(5)}°
                      </span>
                    </div>

                    {activeItem.community.coordinates.accuracy && (
                      <div>
                        <span className="font-semibold text-stone-800">GPS Accuracy:</span>{' '}
                        <span>±{activeItem.community.coordinates.accuracy} meters</span>
                      </div>
                    )}

                    {activeItem.community.notes && (
                      <div className="pt-1 border-t border-stone-200">
                        <span className="font-semibold text-stone-800 block">Field Notes:</span>
                        <p className="text-stone-700 italic mt-0.5">{activeItem.community.notes}</p>
                      </div>
                    )}

                    {activeUserLocation && (
                      <div className="text-emerald-900 font-semibold pt-1 border-t border-stone-200">
                        Distance from you: {formatDistance(activeUserLocation, activeItem.community.coordinates)}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-[11px] text-purple-950 leading-snug">
                    🌿 <strong>Community Record:</strong> Submitted by a student or community plant observer.
                  </div>
                </div>

                {/* Active Route Summary Box for Community observation */}
                {activeRoute && activeItem.community && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs space-y-1 text-blue-900">
                    <div className="font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-blue-800">
                        <Navigation className="w-3.5 h-3.5 text-blue-600" /> Active Road Route
                      </span>
                      <span className="text-[10px] bg-blue-200/70 text-blue-900 font-bold px-1.5 py-0.5 rounded">
                        OSRM Road
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <div>
                        <span className="text-stone-500 block text-[10px]">Distance:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDistance(activeRoute.distanceMeters)}</span>
                      </div>
                      <div className="border-l border-blue-200 pl-3">
                        <span className="text-stone-500 block text-[10px]">Est. Travel Time:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDuration(activeRoute.durationSeconds)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleStartNavigation(
                        activeItem.community!.coordinates,
                        activeItem.community!.commonName || activeItem.community!.scientificName || 'Community Observation'
                      )
                    }
                    disabled={isCalculatingRoute}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    {isCalculatingRoute ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Calculating Road Route...</span>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-4 h-4 text-white" />
                        <span>Start Now (Road Navigation)</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (mapInstanceRef.current && activeItem.community) {
                        mapInstanceRef.current.setView(
                          [activeItem.community.coordinates.lat, activeItem.community.coordinates.lng],
                          17,
                          { animate: true }
                        );
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5 text-purple-700" />
                    <span>Center On This Observation</span>
                  </button>
                </div>
              </div>
            ) : activeItem?.type === 'nursery' && activeItem.nursery ? (
              <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between h-full space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 uppercase tracking-wider flex items-center gap-1">
                      <span>🪴</span>
                      {activeItem.nursery.type === 'garden_centre'
                        ? 'Garden Centre & Nursery'
                        : activeItem.nursery.type === 'plant_shop'
                        ? 'Plant & Flower Shop'
                        : 'Plant Nursery'}
                    </span>
                    <span className="text-[10px] font-semibold text-stone-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                      OpenStreetMap POI
                    </span>
                  </div>

                  <div className="text-xs text-stone-400 font-medium">
                    {activeItem.nursery.type === 'plant_shop'
                      ? 'Plant & Flower Supplies:'
                      : 'Plant Nursery & Garden Supplies:'}
                  </div>
                  <h3 className="font-serif-display text-xl font-bold text-stone-900 leading-snug">
                    {activeItem.nursery.name}
                  </h3>

                  <div className="space-y-2 text-xs text-stone-600 bg-stone-50 p-3 rounded-2xl border border-stone-100 mt-3">
                    {activeItem.nursery.address && (
                      <div>
                        <span className="font-semibold text-stone-800 block">📍 Address:</span>
                        <span>{activeItem.nursery.address}</span>
                      </div>
                    )}

                    {activeItem.nursery.phone && (
                      <div>
                        <span className="font-semibold text-stone-800">📞 Phone:</span>{' '}
                        <a href={`tel:${activeItem.nursery.phone}`} className="text-emerald-800 font-semibold hover:underline">
                          {activeItem.nursery.phone}
                        </a>
                      </div>
                    )}

                    {activeItem.nursery.openingHours && (
                      <div>
                        <span className="font-semibold text-stone-800">🕒 Opening Hours:</span>{' '}
                        <span>{activeItem.nursery.openingHours}</span>
                      </div>
                    )}

                    {activeItem.nursery.website && (
                      <div>
                        <span className="font-semibold text-stone-800">🌐 Website:</span>{' '}
                        <a
                          href={activeItem.nursery.website.startsWith('http') ? activeItem.nursery.website : `https://${activeItem.nursery.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-800 font-semibold hover:underline inline-flex items-center gap-1"
                        >
                          <span>Visit Website</span>
                          <ExternalLink className="w-3 h-3 text-stone-400" />
                        </a>
                      </div>
                    )}

                    <div>
                      <span className="font-semibold text-stone-800">Coordinates:</span>{' '}
                      <span className="font-mono">{activeItem.nursery.coordinates.lat.toFixed(4)}°, {activeItem.nursery.coordinates.lng.toFixed(4)}°</span>
                    </div>

                    {activeUserLocation && (
                      <div className="text-emerald-900 font-semibold pt-1 border-t border-stone-200">
                        Distance from you: {formatDistance(activeUserLocation, activeItem.nursery.coordinates)}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 leading-snug">
                    ℹ️ <strong>OpenStreetMap Verified POI:</strong> Real plant nursery and botanical retail location from OpenStreetMap contributors (ODbL).
                  </div>
                </div>

                {/* Active Route Summary Box for Nursery */}
                {activeRoute && activeRoute.destinationName === activeItem.nursery.name && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs space-y-1 text-blue-900">
                    <div className="font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-blue-800">
                        <Navigation className="w-3.5 h-3.5 text-blue-600" /> Active Road Route
                      </span>
                      <span className="text-[10px] bg-blue-200/70 text-blue-900 font-bold px-1.5 py-0.5 rounded">
                        OSRM Road
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <div>
                        <span className="text-stone-500 block text-[10px]">Distance:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDistance(activeRoute.distanceMeters)}</span>
                      </div>
                      <div className="border-l border-blue-200 pl-3">
                        <span className="text-stone-500 block text-[10px]">Est. Travel Time:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDuration(activeRoute.durationSeconds)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <a
                    href={activeItem.nursery.googleMapsDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    <span>🗺️ Google Maps Directions</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-200" />
                  </a>

                  <button
                    type="button"
                    onClick={() =>
                      handleStartNavigation(
                        activeItem.nursery!.coordinates,
                        activeItem.nursery!.name
                      )
                    }
                    disabled={isCalculatingRoute}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
                  >
                    {isCalculatingRoute ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Calculating Road Route...</span>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-4 h-4 text-white" />
                        <span>In-App Road Navigation</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (mapInstanceRef.current && activeItem.nursery) {
                        mapInstanceRef.current.setView(
                          [activeItem.nursery.coordinates.lat, activeItem.nursery.coordinates.lng],
                          17,
                          { animate: true }
                        );
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5 text-stone-600" />
                    <span>Center On This Nursery</span>
                  </button>
                </div>
              </div>
            ) : activeItem?.type === 'plant' && activeItem.plant ? (
              <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between h-full space-y-4">
                <div>
                  <div className="text-[10px] font-bold text-emerald-900 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 uppercase tracking-wider mb-2 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    <span>{activeItem.plant.category || 'Botanical'} Specimen</span>
                  </div>
                  <div className="aspect-[16/10] rounded-2xl overflow-hidden mb-3 bg-stone-100 border border-stone-200">
                    <img
                      src={activeItem.plant.imageUrl}
                      alt={activeItem.plant.commonName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-serif-display text-xl font-bold text-stone-900">
                    {activeItem.plant.commonName}
                  </h3>
                  <div className="text-xs text-stone-500 italic mb-2">
                    {activeItem.plant.scientificName}
                  </div>
                  <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-2xl border border-stone-100">
                    {activeItem.plant.description}
                  </p>
                </div>

                {/* Active Route Summary Box for Plant */}
                {activeRoute && activeItem.plant && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs space-y-1 text-blue-900">
                    <div className="font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-blue-800">
                        <Navigation className="w-3.5 h-3.5 text-blue-600" /> Active Road Route
                      </span>
                      <span className="text-[10px] bg-blue-200/70 text-blue-900 font-bold px-1.5 py-0.5 rounded">
                        OSRM Road
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <div>
                        <span className="text-stone-500 block text-[10px]">Distance:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDistance(activeRoute.distanceMeters)}</span>
                      </div>
                      <div className="border-l border-blue-200 pl-3">
                        <span className="text-stone-500 block text-[10px]">Est. Travel Time:</span>
                        <span className="font-bold text-sm text-blue-900">{formatRouteDuration(activeRoute.durationSeconds)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeItem.plant?.coordinates) return;
                      handleStartNavigation(
                        activeItem.plant.coordinates,
                        activeItem.plant.commonName
                      );
                    }}
                    disabled={!activeItem.plant?.coordinates || isCalculatingRoute}
                    title={!activeItem.plant?.coordinates ? 'No geographic coordinates recorded for this specimen' : undefined}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    {isCalculatingRoute ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Calculating Road Route...</span>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-4 h-4 text-white" />
                        <span>{!activeItem.plant?.coordinates ? 'No Coordinates Saved' : 'Start Now (Road Navigation)'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectPlant(activeItem.plant!)}
                    className="w-full py-2 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    View Full Botanical Profile
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-stone-200 p-8 shadow-xs flex flex-col items-center justify-center text-center h-full text-stone-400 space-y-2">
                <MapPin className="w-8 h-8 text-stone-300" />
                <p className="text-sm font-medium">
                  {activeDataSource === 'india'
                    ? 'Click any India observation marker on the map or select an observation card below to inspect verified GBIF botanical sighting details.'
                    : 'Click any observation marker on the map to inspect real sighting details.'}
                </p>
                <div className="text-xs text-stone-400 max-w-xs mt-1">
                  {activeDataSource === 'india'
                    ? 'Explore verified botanical occurrences across India or filter by species above.'
                    : 'Or search for any botanical species in the search box above, or click "Find Plants Near Me".'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* India Observations Cards Gallery (Requirements 1, 2, 8) */}
        {activeDataSource === 'india' && (
          <div className="space-y-4 pt-4 border-t border-stone-200">
            {/* Scope Notice Banner (Requirement 8) */}
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 text-xs text-emerald-950 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <p className="font-semibold text-emerald-900">
                  Biodiversity Repository Scope Notice
                </p>
                <p className="text-stone-700 text-[11.5px]">
                  These results represent public botanical records currently available from GBIF and participating data publishers (including Pl@ntNet and citizen science networks). They do not represent an exhaustive census of all flora in India.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🇮🇳</span>
                  <h3 className="font-serif-display text-xl sm:text-2xl font-bold text-stone-900">
                    India Botanical Observations
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {indiaRecords.length} records
                  </span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  Public botanical occurrence records across India from GBIF. Click any card to highlight its marker on the map and view full details.
                </p>
              </div>

              {/* Counts Breakdown Pill */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 bg-white px-3 py-1 rounded-xl border border-stone-200 text-stone-700 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span><strong>{indiaMeta.georeferencedCount}</strong> on map</span>
                </span>
                {indiaMeta.missingCoordsCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200 text-amber-800 shadow-2xs" title="Coordinates missing or withheld to protect sensitive taxa">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span><strong>{indiaMeta.missingCoordsCount}</strong> no GPS coordinates</span>
                  </span>
                )}
              </div>
            </div>

            {/* Empty state */}
            {!isLoadingObservations && indiaRecords.length === 0 && (
              <div className="p-8 text-center bg-white rounded-3xl border border-stone-200 shadow-xs space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto text-xl">
                  🌱
                </div>
                <h4 className="font-serif-display text-base font-bold text-stone-900">
                  No India botanical observations found
                </h4>
                <p className="text-xs text-stone-600 max-w-md mx-auto">
                  Try selecting a different Indian flora test button above (e.g. Tulsi, Neem, Banyan, Sandalwood) or searching for a botanical genus.
                </p>
                <button
                  type="button"
                  onClick={() => loadIndiaObservations()}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  Load All India Flora
                </button>
              </div>
            )}

            {/* Cards Grid */}
            {indiaRecords.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {indiaRecords.map((record) => {
                  const isSelected = selectedIndiaObsId === record.id || (activeItem?.type === 'gbif' && activeItem.gbif?.id === record.id);
                  const hasPhoto = Boolean(record.imageUrl && record.mediaAttribution?.permitsReuse);

                  return (
                    <div
                      key={record.id}
                      id={`india-card-${record.id}`}
                      onClick={() => handleSelectIndiaCard(record)}
                      className={`group rounded-2xl border p-4 transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500 shadow-md -translate-y-0.5'
                          : 'border-stone-200 bg-white hover:border-emerald-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Top meta badge & license */}
                        <div className="flex items-center justify-between gap-1 text-[10px]">
                          <span className={`px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                            isSelected ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-700'
                          }`}>
                            🇮🇳 #{record.gbifKey}
                          </span>
                          <span className="font-mono text-stone-500 truncate max-w-[120px]" title={record.datasetLicenseLabel}>
                            {record.datasetLicenseLabel || 'CC BY-NC'}
                          </span>
                        </div>

                        {/* Source Platform Badge */}
                        <div className="flex items-center gap-1.5 text-[10px] bg-stone-50 px-2 py-1 rounded-lg border border-stone-100">
                          <span className="text-stone-400 shrink-0">🏛️</span>
                          <span className="text-emerald-900 font-semibold truncate" title={record.sourcePlatform}>
                            {record.sourcePlatform || 'GBIF Occurrence Network'}
                          </span>
                        </div>

                        {/* Photo or Botanical Icon */}
                        {hasPhoto ? (
                          <div className="aspect-[16/10] rounded-xl overflow-hidden bg-stone-100 border border-stone-200 relative">
                            <img
                              src={record.imageUrl}
                              alt={record.scientificName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                            />
                            <div className="absolute bottom-0 inset-x-0 bg-black/70 backdrop-blur-xs text-white text-[8px] px-1.5 py-0.5 truncate">
                              Photo: {record.mediaAttribution?.creator || 'Observer'}
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-[16/7] rounded-xl bg-stone-50 border border-stone-200/80 flex flex-col items-center justify-center text-center p-2 text-stone-400">
                            <span className="text-xl">🌿</span>
                            <span className="text-[10px] text-stone-500 font-medium">Botanical Specimen</span>
                            <span className="text-[9px] text-stone-400">
                              {record.mediaAttribution ? 'Photo protected by copyright' : 'Herbarium / field record'}
                            </span>
                          </div>
                        )}

                        {/* Titles */}
                        <div>
                          <h4 className="font-serif-display text-sm font-bold text-stone-900 group-hover:text-emerald-900 transition-colors line-clamp-1">
                            {record.commonName || record.scientificName}
                          </h4>
                          <p className="text-[11px] text-stone-600 italic line-clamp-1">
                            {record.scientificName}
                          </p>
                          <p className="text-[10px] text-emerald-800 font-medium mt-0.5">
                            Family: {record.family}
                          </p>
                        </div>

                        {/* Observation Details */}
                        <div className="space-y-1 text-[11px] text-stone-600 bg-stone-50/80 p-2.5 rounded-xl border border-stone-100">
                          <div className="flex items-start gap-1">
                            <span className="text-stone-400 shrink-0">📍</span>
                            <span className="line-clamp-2 text-stone-700">{record.locality}</span>
                          </div>
                          {record.eventDate && (
                            <div className="flex items-center gap-1">
                              <span className="text-stone-400 shrink-0">📅</span>
                              <span className="text-stone-700">{record.eventDate}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-stone-400 shrink-0">👤</span>
                            <span className="text-stone-700 truncate">{record.recordedBy || 'Naturalist Observer'}</span>
                          </div>
                        </div>

                        {/* Coordinate Precision Badge */}
                        <div>
                          {record.hasValidCoordinates && record.coordinates ? (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                              <span className="font-mono text-stone-700">
                                {record.coordinates.lat.toFixed(4)}°, {record.coordinates.lng.toFixed(4)}°
                              </span>
                              {record.coordinateStatus === 'imprecise' && (
                                <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded text-[9px] font-semibold">
                                  ±{Math.round((record.coordinateUncertaintyInMeters || 10000)/1000)}km
                                </span>
                              )}
                              {record.coordinateStatus === 'sensitive_generalized' && (
                                <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded text-[9px] font-semibold">
                                  Generalized
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                              <span>🛡️</span>
                              <span>Coordinates withheld / missing</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="pt-3 mt-3 border-t border-stone-200/80 flex items-center justify-between gap-2 text-xs">
                        {record.hasValidCoordinates && record.coordinates ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectIndiaCard(record);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 hover:underline cursor-pointer"
                          >
                            <MapPin className="w-3 h-3 text-emerald-700" />
                            <span>Show on Map</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-stone-400 italic">
                            Unplotted (No GPS)
                          </span>
                        )}

                        <div className="flex items-center gap-2">
                          {record.originalRecordUrl && record.originalRecordUrl !== record.gbifUrl && (
                            <a
                              href={record.originalRecordUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-800 hover:underline"
                              title="Open original observation record"
                            >
                              <span>Record</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          <a
                            href={record.gbifUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-stone-500 hover:text-emerald-800 hover:underline"
                            title="Open record on GBIF"
                          >
                            <span>GBIF</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination / Load More Controls (Requirement 6) */}
            {indiaRecords.length > 0 && (
              <div className="pt-4 pb-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-stone-200">
                <div className="text-xs text-stone-600 text-center sm:text-left">
                  Showing <strong>{indiaRecords.length}</strong> of{' '}
                  <strong>{indiaMeta.totalCount.toLocaleString()}</strong> documented occurrences across India
                </div>

                {hasMoreIndia ? (
                  <button
                    type="button"
                    onClick={handleLoadMoreIndia}
                    disabled={isLoadingMoreIndia}
                    className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-colors inline-flex items-center gap-2"
                  >
                    {isLoadingMoreIndia ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Loading next page from GBIF...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Load More India Observations</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span className="text-xs font-medium text-stone-500 bg-stone-100 px-3.5 py-1.5 rounded-xl border border-stone-200">
                    All available records from selected source loaded
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
