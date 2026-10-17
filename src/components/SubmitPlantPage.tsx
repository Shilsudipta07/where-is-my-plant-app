import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { Plant, Coordinates, CommunityObservation } from '../types/plant';
import {
  Upload,
  CheckCircle,
  MapPin,
  Sparkles,
  Info,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Trash2,
  Calendar,
  Layers,
  Leaf,
  Shield,
  Eye,
  ExternalLink,
  Navigation,
  Compass,
  Crosshair,
  BookOpen,
  Globe,
  TreeDeciduous,
  Ruler,
  Search,
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';
import lavenderImg from '../assets/images/plant_lavender_wildflower_1790167109212.jpg';
import { DEMO_CAMPUS_CENTER } from '../data/samplePlants';
import {
  addPlantToFirestore,
  deletePlantFromFirestore,
  getPlantsFromFirestore,
} from '../services/firestoreService';
import {
  getCurrentUid,
  subscribeToAuth,
  AuthState,
  isFirebaseAuthenticated,
} from '../services/authService';
import { compressImageFile } from '../utils/imageUtils';
import {
  validateTrunkCircumference,
  validateTreeHeight,
  validateTreeAge,
  validateMeasurementDate,
} from '../utils/carbonCalculation';
import { searchPlaces, reverseGeocode, GeocodingResult } from '../services/geocodingService';

interface SubmitPlantPageProps {
  onBackToHome: () => void;
  onViewOnMap?: (obs: any) => void;
  onSelectPlant?: (plant: Plant) => void;
  userLocation?: Coordinates | null;
  initialTab?: 'submit' | 'my-observations';
  onAddPlant?: (newPlant: Plant) => void;
}

export const SubmitPlantPage: React.FC<SubmitPlantPageProps> = ({
  onBackToHome,
  onViewOnMap,
  onSelectPlant,
  userLocation,
  initialTab = 'submit',
  onAddPlant,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'submit' | 'my-observations'>(initialTab);
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    uid: getCurrentUid(),
    isAnonymous: true,
    isLoading: false,
    error: null,
    firebaseConnected: false,
    profile: null,
  });

  // Form Fields
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState<'Tree' | 'Wildflower' | 'Foliage' | 'Herb' | 'Succulent'>('Wildflower');
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');
  const [studentTip, setStudentTip] = useState('');
  const [previewImage, setPreviewImage] = useState<string>(lavenderImg);
  const [hasCustomPhoto, setHasCustomPhoto] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Optional biometric measurement state for allometric carbon calculations
  const [trunkCircumferenceCm, setTrunkCircumferenceCm] = useState<string>('');
  const [treeHeightM, setTreeHeightM] = useState<string>('');
  const [treeAgeYears, setTreeAgeYears] = useState<string>('');
  const [measurementDate, setMeasurementDate] = useState<string>('');

  // Location Selection State (GPS, Interactive Map, Manual Coordinates)
  const defaultLat = userLocation?.lat ? userLocation.lat.toFixed(6) : '24.0988';
  const defaultLng = userLocation?.lng ? userLocation.lng.toFixed(6) : '88.2676';
  const [latInput, setLatInput] = useState<string>(defaultLat);
  const [lngInput, setLngInput] = useState<string>(defaultLng);
  const [locationSource, setLocationSource] = useState<'gps' | 'map' | 'manual'>(
    userLocation ? 'gps' : 'manual'
  );
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsSuccess, setGpsSuccess] = useState(Boolean(userLocation));
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(userLocation?.accuracy || null);
  const [gpsTimestamp, setGpsTimestamp] = useState<Date | null>(userLocation ? new Date() : null);

  // Place Search State (OpenStreetMap Nominatim search)
  const [placeQuery, setPlaceQuery] = useState<string>('');
  const [placeResults, setPlaceResults] = useState<GeocodingResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [hasSearchedPlaces, setHasSearchedPlaces] = useState<boolean>(false);
  const placeSearchAbortRef = useRef<AbortController | null>(null);

  // Leaflet map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [mapStyle, setMapStyle] = useState<'map' | 'satellite'>('map');
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);
  const streetTileLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteTileLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLabelsLayerRef = useRef<L.TileLayer | null>(null);

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

  // Switch base map style between OpenStreetMap and Esri World Imagery
  const handleSwitchMapStyle = (style: 'map' | 'satellite') => {
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
  };

  // Form Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);

  // User's Submitted Plants
  const [userPlants, setUserPlants] = useState<Plant[]>([]);
  const [isLoadingUserPlants, setIsLoadingUserPlants] = useState(false);
  const [plantsLoadError, setPlantsLoadError] = useState<string | null>(null);

  // Deletion Modal & State
  const [plantToDelete, setPlantToDelete] = useState<Plant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with auth service
  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setAuthState(state);
    });
    return () => unsubscribe();
  }, []);

  // Update subtab if initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  // Load user's submitted plants from Firestore
  const loadUserPlants = async () => {
    setIsLoadingUserPlants(true);
    setPlantsLoadError(null);
    try {
      const all = await getPlantsFromFirestore();
      const currentUid = authState.uid || getCurrentUid();
      // Filter strictly by the current user's ownerUid
      const mine = all.filter((p) => p.ownerUid === currentUid);
      setUserPlants(mine);
    } catch (err: unknown) {
      console.warn('[SubmitPlantPage] Could not load user plants from Firestore:', err);
      // Fallback: check localStorage for offline records
      try {
        const local = localStorage.getItem('where_is_my_plant_items_v2');
        if (local) {
          const parsed: Plant[] = JSON.parse(local);
          const currentUid = authState.uid || getCurrentUid();
          const mine = parsed.filter((p) => p.isUserAdded && (p.ownerUid === currentUid || !p.ownerUid));
          setUserPlants(mine);
        }
      } catch {
        setPlantsLoadError('Unable to load your saved observations right now.');
      }
    } finally {
      setIsLoadingUserPlants(false);
    }
  };

  useEffect(() => {
    loadUserPlants();
  }, [authState.uid]);

  // Initialize and synchronize Interactive Leaflet Map
  useEffect(() => {
    if (activeSubTab !== 'submit' || submittedSuccess) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        return;
      }

      const curLat = parseFloat(latInput) || 24.0988;
      const curLng = parseFloat(lngInput) || 88.2676;

      const map = L.map(mapContainerRef.current, {
        center: [curLat, curLng],
        zoom: 14,
        zoomControl: true,
        attributionControl: false,
      });

      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      });
      streetTileLayerRef.current = streetLayer;

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
      );
      satelliteTileLayerRef.current = satelliteLayer;

      const satelliteLabelsLayer = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
      );
      satelliteLabelsLayerRef.current = satelliteLabelsLayer;

      if (mapStyle === 'satellite') {
        satelliteLayer.addTo(map);
        satelliteLabelsLayer.addTo(map);
      } else {
        streetLayer.addTo(map);
      }

      // Custom high-contrast botanical map pin
      const pinIcon = L.divIcon({
        className: 'custom-plant-pin',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); cursor: grab;">
            <div style="background-color: #065f46; color: white; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
              <div style="transform: rotate(45deg); width: 10px; height: 10px; background-color: white; border-radius: 50%;"></div>
            </div>
            <div style="width: 8px; height: 3px; background: rgba(0,0,0,0.25); border-radius: 50%; margin-top: 2px;"></div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([curLat, curLng], {
        draggable: true,
        icon: pinIcon,
      }).addTo(map);

      // Synchronize coordinates when dragging marker
      marker.on('dragend', () => {
        const latlng = marker.getLatLng();
        setLatInput(latlng.lat.toFixed(6));
        setLngInput(latlng.lng.toFixed(6));
        setLocationSource('map');
        setGpsSuccess(false);
        setGpsError(null);
        setGpsAccuracy(null);
        setGpsTimestamp(null);
      });

      // Synchronize coordinates when clicking on map
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        setLatInput(lat.toFixed(6));
        setLngInput(lng.toFixed(6));
        setLocationSource('map');
        setGpsSuccess(false);
        setGpsError(null);
        setGpsAccuracy(null);
        setGpsTimestamp(null);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }, 60);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        streetTileLayerRef.current = null;
        satelliteTileLayerRef.current = null;
        satelliteLabelsLayerRef.current = null;
      }
    };
  }, [activeSubTab, submittedSuccess]);

  // Handler: Use My Current Location via browser Geolocation API
  const handleUseCurrentLocation = () => {
    // Check secure context first (browsers block geolocation on non-secure origins)
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setGpsError(
        'GPS geolocation requires a secure connection (HTTPS). Please choose your plant location on the interactive map below or enter coordinates manually.'
      );
      setGpsSuccess(false);
      setGpsAccuracy(null);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser. Please select on the map or type coordinates manually.');
      setGpsSuccess(false);
      setGpsAccuracy(null);
      return;
    }

    setIsLocatingGps(true);
    setGpsError(null);
    setGpsSuccess(false);
    setGpsAccuracy(null);
    setGpsTimestamp(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const rawAccuracy = pos.coords.accuracy;
        const accuracy =
          typeof rawAccuracy === 'number' && !isNaN(rawAccuracy) && rawAccuracy >= 0
            ? Math.round(rawAccuracy)
            : null;

        // Coordinate sanity check (reject NaN, impossible ranges, or (0,0))
        if (
          typeof lat !== 'number' ||
          isNaN(lat) ||
          lat < -90 ||
          lat > 90 ||
          typeof lng !== 'number' ||
          isNaN(lng) ||
          lng < -180 ||
          lng > 180 ||
          (lat === 0 && lng === 0)
        ) {
          setGpsError('Device returned invalid geographic coordinates. Please retry outdoors or select on the map.');
          setGpsSuccess(false);
          setGpsAccuracy(null);
          return;
        }

        // Apply new fresh coordinates and accuracy
        setLatInput(lat.toFixed(6));
        setLngInput(lng.toFixed(6));
        setLocationSource('gps');
        setGpsAccuracy(accuracy);
        setGpsTimestamp(new Date());
        setGpsSuccess(true);

        if (mapInstanceRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapInstanceRef.current.setView([lat, lng], 17, { animate: true });
        }
      },
      (err) => {
        setIsLocatingGps(false);
        setGpsSuccess(false);
        setGpsAccuracy(null);
        setGpsTimestamp(null);
        console.warn('[SubmitPlantPage] Geolocation error:', err);
        if (err.code === 1) { // PERMISSION_DENIED
          setGpsError('Location permission was denied. Please allow location access in your browser or device settings, or select your location on the map below.');
        } else if (err.code === 2) { // POSITION_UNAVAILABLE
          setGpsError('GPS position unavailable. Please ensure your device GPS/Location service is enabled, or pick your location on the map below.');
        } else if (err.code === 3) { // TIMEOUT
          setGpsError('GPS request timed out waiting for satellite fix. Move outdoors with a clear view of the sky and tap Retry, or pick on the map below.');
        } else {
          setGpsError('Unable to detect GPS position. You can choose your plant location on the interactive map below or enter coordinates manually.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000, // 15 seconds to allow GPS hardware to lock satellites
        maximumAge: 0,   // Force fresh satellite fix; do NOT accept stale cached position
      }
    );
  };

  // Handler: Manual Latitude change
  const handleLatChange = (newVal: string) => {
    setLatInput(newVal);
    setLocationSource('manual');
    setGpsSuccess(false);
    setGpsAccuracy(null);
    setGpsTimestamp(null);
    const parsedLat = parseFloat(newVal);
    const parsedLng = parseFloat(lngInput);
    if (
      !isNaN(parsedLat) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      !isNaN(parsedLng) &&
      parsedLng >= -180 &&
      parsedLng <= 180
    ) {
      if (markerRef.current && mapInstanceRef.current) {
        markerRef.current.setLatLng([parsedLat, parsedLng]);
        mapInstanceRef.current.panTo([parsedLat, parsedLng]);
      }
    }
  };

  // Handler: Manual Longitude change
  const handleLngChange = (newVal: string) => {
    setLngInput(newVal);
    setLocationSource('manual');
    setGpsSuccess(false);
    setGpsAccuracy(null);
    setGpsTimestamp(null);
    const parsedLat = parseFloat(latInput);
    const parsedLng = parseFloat(newVal);
    if (
      !isNaN(parsedLat) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      !isNaN(parsedLng) &&
      parsedLng >= -180 &&
      parsedLng <= 180
    ) {
      if (markerRef.current && mapInstanceRef.current) {
        markerRef.current.setLatLng([parsedLat, parsedLng]);
        mapInstanceRef.current.panTo([parsedLat, parsedLng]);
      }
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (file) {
      if (!file.type.startsWith('image/')) {
        const errorMsg = 'Please upload a valid image file (JPEG, PNG, WebP).';
        setPhotoError(errorMsg);
        setSubmitError(errorMsg);
        setHasCustomPhoto(false);
        return;
      }
      try {
        const compressed = await compressImageFile(file, {
          maxWidth: 1080,
          maxHeight: 1080,
          quality: 0.8,
          maxBytes: 700 * 1024,
        });
        setPreviewImage(compressed);
        setHasCustomPhoto(true);
        setPhotoError(null);
        setSubmitError(null);
      } catch (err: any) {
        // Clear photo input and show clear error - NEVER save oversized image
        const errorMsg = err?.message || 'Failed to compress plant photo. Please try a different photo.';
        setPhotoError(errorMsg);
        setSubmitError(errorMsg);
        setHasCustomPhoto(false);
      }
    }
  };

  // Handler: Search real places using Nominatim
  const handlePlaceSearch = async () => {
    const q = placeQuery.trim();
    if (!q || q.length < 2) {
      setPlaceSearchError('Please enter at least 2 characters to search places.');
      return;
    }

    if (placeSearchAbortRef.current) {
      placeSearchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    placeSearchAbortRef.current = abortController;

    setIsSearchingPlaces(true);
    setPlaceSearchError(null);
    setHasSearchedPlaces(true);

    try {
      const results = await searchPlaces(q, abortController.signal);
      setPlaceResults(results);
      if (results.length === 0) {
        setPlaceSearchError(`No places found matching "${q}". Try a different landmark or city name.`);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setPlaceSearchError('Unable to search places. Please check your connection and try again.');
      }
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  // Handler: Select a place from search results
  const handleSelectPlace = (place: GeocodingResult) => {
    setLocationName(place.shortName || place.displayName.split(',')[0]);
    setLatInput(place.lat.toFixed(6));
    setLngInput(place.lng.toFixed(6));
    setLocationSource('map');
    setGpsSuccess(false);
    setGpsError(null);
    setGpsAccuracy(null);
    setGpsTimestamp(null);
    setPlaceResults([]);
    setHasSearchedPlaces(false);
    setPlaceQuery('');

    if (mapInstanceRef.current && markerRef.current) {
      markerRef.current.setLatLng([place.lat, place.lng]);
      mapInstanceRef.current.setView([place.lat, place.lng], 16, { animate: true });
    }
  };

  const resetForm = () => {
    setCommonName('');
    setScientificName('');
    setFamily('');
    setDescription('');
    setStudentTip('');
    setLocationName('');
    setLatInput(defaultLat);
    setLngInput(defaultLng);
    setLocationSource('manual');
    setGpsSuccess(false);
    setGpsError(null);
    setGpsAccuracy(null);
    setGpsTimestamp(null);
    setPreviewImage(lavenderImg);
    setHasCustomPhoto(false);
    setPhotoError(null);
    setSubmitError(null);
    setTrunkCircumferenceCm('');
    setTreeHeightM('');
    setTreeAgeYears('');
    setMeasurementDate('');
    setPlaceQuery('');
    setPlaceResults([]);
    setPlaceSearchError(null);
    setHasSearchedPlaces(false);
    const parsedLat = parseFloat(defaultLat);
    const parsedLng = parseFloat(defaultLng);
    if (markerRef.current && mapInstanceRef.current && !isNaN(parsedLat) && !isNaN(parsedLng)) {
      markerRef.current.setLatLng([parsedLat, parsedLng]);
      mapInstanceRef.current.setView([parsedLat, parsedLng], 14);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Required fields: Only Plant Photo, Plant Name, Location Name, Latitude, and Longitude
    if (!hasCustomPhoto) {
      setSubmitError('Please upload a plant photo before submitting.');
      return;
    }

    if (!previewImage || previewImage.length > 700 * 1024) {
      setSubmitError('Plant photo data exceeds 700 KB limit. Please choose a photo that compresses under 700 KB.');
      return;
    }

    const cleanCommonName = commonName.trim();
    const cleanLocationName = locationName.trim();

    if (!cleanCommonName) {
      setSubmitError('Please provide a Plant Name.');
      return;
    }

    if (!cleanLocationName) {
      setSubmitError('Please provide a Location Name (e.g. "Berhampore" or "Campus Arboretum").');
      return;
    }

    const parsedLat = parseFloat(latInput);
    const parsedLng = parseFloat(lngInput);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setSubmitError('Please provide valid numerical coordinates using GPS, the interactive map, or manual entry.');
      return;
    }

    if (parsedLat < -90 || parsedLat > 90) {
      setSubmitError(`Latitude must be between -90 and 90 degrees. (Entered: ${parsedLat})`);
      return;
    }

    if (parsedLng < -180 || parsedLng > 180) {
      setSubmitError(`Longitude must be between -180 and 180 degrees. (Entered: ${parsedLng})`);
      return;
    }

    // Validate optional biometric fields
    const valCirc = validateTrunkCircumference(trunkCircumferenceCm);
    if (!valCirc.isValid) {
      setSubmitError(valCirc.error || 'Invalid trunk circumference.');
      return;
    }

    const valHeight = validateTreeHeight(treeHeightM);
    if (!valHeight.isValid) {
      setSubmitError(valHeight.error || 'Invalid tree height.');
      return;
    }

    const valAge = validateTreeAge(treeAgeYears);
    if (!valAge.isValid) {
      setSubmitError(valAge.error || 'Invalid tree age.');
      return;
    }

    const valDate = validateMeasurementDate(measurementDate);
    if (!valDate.isValid) {
      setSubmitError(valDate.error || 'Invalid measurement date.');
      return;
    }

    setIsSubmitting(true);

    try {
      const currentUid = authState.uid || getCurrentUid();

      const plantData: Omit<Plant, 'id'> = {
        commonName: cleanCommonName,
        scientificName: scientificName.trim(),
        family: family.trim(),
        category,
        habitat: 'Field Botanical Observation',
        bloomSeason: 'Current Season Observation',
        sunExposure: 'Full Sun',
        waterNeeds: 'Moderate',
        difficulty: 'Beginner',
        studentTip: studentTip.trim(),
        description: description.trim(),
        identificationKeys: {
          leafShape: 'Field botanical observation record',
          leafArrangement: 'Observed in field study',
          flowerColor: 'Field observation',
          growthHabit: category,
        },
        imageUrl: previewImage,
        locationName: cleanLocationName,
        coordinates: {
          lat: parsedLat,
          lng: parsedLng,
          accuracy: locationSource === 'gps' && gpsAccuracy !== null ? gpsAccuracy : undefined,
        },
        locationSource,
        demoLocationDescription: `Observation recorded at ${cleanLocationName}`,
        sightedCount: 1,
        isUserAdded: true,
        ownerUid: currentUid,
        ownerUsername: authState.profile?.username ? `@${authState.profile.username}` : undefined,
        trunkCircumferenceCm: valCirc.value,
        trunkDiameterCm: valCirc.calculatedDbh,
        treeHeightM: valHeight.value,
        treeAgeYears: valAge.value,
        measurementDate: valDate.value,
      };

      // Save directly to Firestore "plants" collection with ownerUid and server timestamp
      const docId = await addPlantToFirestore(plantData, currentUid);

      const createdPlant: Plant = { ...plantData, id: docId };

      setSavedDocId(docId);
      setSubmittedSuccess(true);
      if (onAddPlant) {
        onAddPlant(createdPlant);
      }

      // Add to local user plants list
      setUserPlants((prev) => [createdPlant, ...prev.filter((p) => p.id !== docId)]);

      // Clear/reset the form ONLY AFTER a successful submission
      resetForm();
    } catch (err: unknown) {
      console.error('[SubmitPlantPage] Submission error:', err);
      let msg = 'Failed to save observation to Firestore.';
      if (err && typeof err === 'object' && 'code' in err) {
        if (err.code === 'permission-denied') {
          msg = 'Permission denied by Firestore security rules. Ensure you are signed in and the document ownerUid matches your account.';
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setSubmitError(msg);
      // NOTE: Form values are PRESERVED! User does not lose any typed data.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!plantToDelete) return;

    setIsDeleting(true);
    setDeleteErrorMessage(null);
    setDeleteSuccessMessage(null);

    const targetPlant = plantToDelete;
    const currentUid = authState.uid || getCurrentUid();

    // Security invariant: only owner can delete
    if (targetPlant.ownerUid && targetPlant.ownerUid !== currentUid) {
      setDeleteErrorMessage('Security violation: You can only delete plant observations that you uploaded.');
      setIsDeleting(false);
      return;
    }

    try {
      // Delete from Firestore
      await deletePlantFromFirestore(targetPlant.id, currentUid);

      // Remove from local state
      setUserPlants((prev) => prev.filter((p) => p.id !== targetPlant.id));

      // Remove from browser storage if present
      try {
        const local = localStorage.getItem('where_is_my_plant_items_v2');
        if (local) {
          const parsed: Plant[] = JSON.parse(local);
          const filtered = parsed.filter((p) => p.id !== targetPlant.id);
          localStorage.setItem('where_is_my_plant_items_v2', JSON.stringify(filtered));
        }
      } catch (e) {
        console.error('Error updating localStorage after deletion', e);
      }

      setDeleteSuccessMessage(`"${targetPlant.commonName}" was successfully deleted.`);
      setPlantToDelete(null);

      // Clear feedback after 4 seconds
      setTimeout(() => {
        setDeleteSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      console.error('[SubmitPlantPage] Delete error:', err);
      let msg = 'Failed to delete observation.';
      if (err && typeof err === 'object' && 'code' in err) {
        if (err.code === 'permission-denied') {
          msg = 'Permission denied: Firestore security rules prevent deleting records not owned by your account.';
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setDeleteErrorMessage(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="py-8 sm:py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-900 transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Homepage</span>
        </button>

        {/* User Identity Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs font-medium">
          <Shield className="w-3.5 h-3.5 text-emerald-700" />
          <span>
            Naturalist:{' '}
            <code className="font-mono text-[11px] font-semibold text-emerald-800">
              {authState.profile?.username ? `@${authState.profile.username}` : `${authState.uid.substring(0, 10)}...`}
            </code>
          </span>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
        <button
          onClick={() => setActiveSubTab('submit')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'submit'
              ? 'bg-emerald-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Submit a Plant</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('my-observations');
            loadUserPlants();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'my-observations'
              ? 'bg-emerald-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Leaf className="w-3.5 h-3.5" />
          <span>My Uploads</span>
          {userPlants.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'my-observations'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-100 text-emerald-900'
              }`}
            >
              {userPlants.length}
            </span>
          )}
        </button>
      </div>

      {/* Global Feedback Banners */}
      {deleteSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{deleteSuccessMessage}</span>
        </div>
      )}

      {deleteErrorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-900 flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
          <span>{deleteErrorMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: SUBMIT A PLANT OBSERVATION                                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'submit' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div>
            <div className="text-xs font-semibold text-emerald-800 tracking-wider uppercase mb-1">
              Field Herbarium Contribution
            </div>
            <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
              Add a Plant Observation
            </h1>
            <p className="text-sm text-stone-600 mt-1 max-w-2xl leading-relaxed">
              Record a new botanical observation. Each submission is securely bound to your unique Naturalist UID in Firestore so you can view or delete it later.
            </p>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-900 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed flex-1">
                <span className="font-bold">Submission Error: </span>
                {submitError}
              </div>
            </div>
          )}

          {submittedSuccess ? (
            <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center space-y-4 shadow-sm animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif-display text-2xl font-bold text-stone-900">
                  Observation Saved to Firestore!
                </h3>
                <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
                  Your plant observation has been recorded in the Firestore <strong className="text-emerald-950">"plants"</strong> collection and bound to your owner UID.
                </p>
                {savedDocId && (
                  <div className="pt-2">
                    <span className="text-xs font-mono bg-stone-100 text-stone-600 px-3 py-1 rounded-lg border border-stone-200">
                      Document ID: {savedDocId}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setSubmittedSuccess(false);
                    setSavedDocId(null);
                  }}
                  className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Add Another Plant
                </button>
                <button
                  onClick={() => {
                    setActiveSubTab('my-observations');
                    loadUserPlants();
                  }}
                  className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Leaf className="w-3.5 h-3.5" />
                  <span>View in "My Uploads"</span>
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6"
            >
              {/* Photo Upload Section */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  Plant Photo <span className="text-emerald-700">*</span>
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50/50">
                  <div className="relative w-36 h-28 sm:w-44 sm:h-32 rounded-xl overflow-hidden bg-stone-200 border border-stone-300 shrink-0 shadow-2xs">
                    <img
                      src={previewImage}
                      alt="Plant preview"
                      className="w-full h-full object-cover"
                    />
                    {hasCustomPhoto && (
                      <span className="absolute bottom-1.5 right-1.5 bg-emerald-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        Ready (&lt; 700KB)
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-center sm:text-left flex-1">
                    <div className="text-xs font-medium text-stone-700">
                      Upload a clear botanical photograph:
                    </div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-stone-300 hover:border-emerald-600 hover:text-emerald-900 text-stone-700 text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{hasCustomPhoto ? 'Change Plant Photo' : 'Upload Plant Photo'}</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <span className="text-[11px] text-stone-400">Auto-compressed below 700 KB</span>
                    </div>
                    {photoError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 text-left">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>{photoError}</span>
                      </div>
                    )}
                    <p className="text-[11px] text-stone-500">
                      Tip: A clear photograph showing leaves or flowers helps with verification.
                    </p>
                  </div>
                </div>
              </div>

              {/* Plant Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                    Plant Name <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={commonName}
                    onChange={(e) => setCommonName(e.target.value)}
                    placeholder="e.g. Holy Basil / Tulsi, Lavender, Rose"
                    className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                    Scientific Name <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={scientificName}
                    onChange={(e) => setScientificName(e.target.value)}
                    placeholder="e.g. Ocimum tenuiflorum"
                    className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors font-serif italic disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Category & Family */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                    Category <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
                  </label>
                  <select
                    value={category}
                    disabled={isSubmitting}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
                  >
                    <option value="Wildflower">Wildflower</option>
                    <option value="Tree">Tree</option>
                    <option value="Herb">Herb</option>
                    <option value="Foliage">Foliage</option>
                    <option value="Succulent">Succulent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                    Botanical Family <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={family}
                    onChange={(e) => setFamily(e.target.value)}
                    placeholder="e.g. Lamiaceae, Fabaceae"
                    className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Optional Tree Biometrics & Carbon Sequestration Section */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/90 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <TreeDeciduous className="w-4 h-4 text-emerald-800" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                      Tree Biometrics &amp; Carbon Sequestration (Optional)
                    </span>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-900 font-semibold px-2 py-0.5 rounded-full">
                    IPCC 2006 / Chave et al. Allometry
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  For woody tree species, recording trunk circumference enables calculating stored carbon (kg C), CO₂e, and annual absorption.
                  All fields are strictly optional.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* Trunk Circumference (cm) */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1 flex items-center gap-1">
                      <Ruler className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Trunk Circumference (cm)</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="1600"
                      disabled={isSubmitting}
                      value={trunkCircumferenceCm}
                      onChange={(e) => setTrunkCircumferenceCm(e.target.value)}
                      placeholder="e.g. 102"
                      className="w-full px-3 py-2 text-xs text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 font-mono transition-colors disabled:opacity-60"
                    />
                    {trunkCircumferenceCm && !isNaN(parseFloat(trunkCircumferenceCm)) && parseFloat(trunkCircumferenceCm) > 0 ? (
                      <span className="text-[10px] text-emerald-800 font-medium mt-0.5 block">
                        DBH ≈ {(parseFloat(trunkCircumferenceCm) / 3.1416).toFixed(1)} cm
                      </span>
                    ) : (
                      <span className="text-[10px] text-stone-400 mt-0.5 block">DBH = circumference ÷ 3.1416</span>
                    )}
                  </div>

                  {/* Tree Height */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">
                      Tree Height (m)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="150"
                      disabled={isSubmitting}
                      value={treeHeightM}
                      onChange={(e) => setTreeHeightM(e.target.value)}
                      placeholder="e.g. 12.0"
                      className="w-full px-3 py-2 text-xs text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 font-mono transition-colors disabled:opacity-60"
                    />
                    <span className="text-[10px] text-stone-400 mt-0.5 block">Ground to top of crown</span>
                  </div>

                  {/* Tree Age */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">
                      Tree Age (years)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      max="5000"
                      disabled={isSubmitting}
                      value={treeAgeYears}
                      onChange={(e) => setTreeAgeYears(e.target.value)}
                      placeholder="e.g. 18"
                      className="w-full px-3 py-2 text-xs text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 font-mono transition-colors disabled:opacity-60"
                    />
                    <span className="text-[10px] text-stone-400 mt-0.5 block">Enables annual CO₂e rate</span>
                  </div>

                  {/* Measurement Date */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      <span>Measurement Date</span>
                    </label>
                    <input
                      type="date"
                      max={new Date().toISOString().split('T')[0]}
                      disabled={isSubmitting}
                      value={measurementDate}
                      onChange={(e) => setMeasurementDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 font-mono transition-colors disabled:opacity-60"
                    />
                    <span className="text-[10px] text-stone-400 mt-0.5 block">Survey date</span>
                  </div>
                </div>
              </div>

              {/* Plant Location Section */}
              <div className="space-y-4 pt-2 border-t border-stone-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-800">
                      Plant Location <span className="text-emerald-700">*</span>
                    </label>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Select or enter where the plant was observed using GPS, interactive map, or manual coordinates.
                    </p>
                  </div>

                  {/* Use My Current Location Button */}
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={isLocatingGps || isSubmitting}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-950 border border-emerald-300 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    {isLocatingGps ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                        <span>Detecting GPS...</span>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Use My Current Location</span>
                      </>
                    )}
                  </button>
                </div>

                {/* GPS Acquired Banner with Accuracy & Retry */}
                {gpsSuccess && locationSource === 'gps' && (
                  <div
                    className={`p-3.5 rounded-2xl border text-xs animate-in fade-in duration-150 ${
                      gpsAccuracy !== null && gpsAccuracy <= 25
                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                        : gpsAccuracy !== null && gpsAccuracy <= 100
                        ? 'bg-blue-50/90 border-blue-300 text-blue-950'
                        : 'bg-amber-50/90 border-amber-300 text-amber-950'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {gpsAccuracy !== null && gpsAccuracy <= 25 ? (
                          <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                        ) : gpsAccuracy !== null && gpsAccuracy <= 100 ? (
                          <Navigation className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1">
                          <div className="font-bold flex items-center flex-wrap gap-2">
                            <span>
                              {gpsAccuracy !== null && gpsAccuracy <= 25
                                ? 'High-Precision GPS Location Acquired'
                                : gpsAccuracy !== null && gpsAccuracy <= 100
                                ? 'Moderate-Accuracy GPS Location Acquired'
                                : 'Approximate GPS Signal Detected'}
                            </span>
                            {gpsAccuracy !== null && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                                  gpsAccuracy <= 25
                                    ? 'bg-emerald-200 text-emerald-900'
                                    : gpsAccuracy <= 100
                                    ? 'bg-blue-200 text-blue-900'
                                    : 'bg-amber-200 text-amber-900'
                                }`}
                              >
                                ±{gpsAccuracy} m accuracy
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-stone-700">
                            Latitude: <span className="font-bold text-stone-900">{latInput}</span>, Longitude:{' '}
                            <span className="font-bold text-stone-900">{lngInput}</span>
                          </div>
                          <p className="text-[11px] text-stone-600 leading-relaxed">
                            {gpsAccuracy !== null && gpsAccuracy <= 25
                              ? 'Strong satellite signal. Map pin and coordinates have been updated to your field position.'
                              : gpsAccuracy !== null && gpsAccuracy <= 100
                              ? 'Acceptable field reading. Map pin updated. You can fine-tune the pin on the map below if needed.'
                              : 'Satellite signal is weak or estimated via cellular/Wi-Fi towers (poor accuracy). Move outdoors with open sky and tap Retry GPS, or drag the map pin below to pinpoint the exact plant.'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isLocatingGps || isSubmitting}
                        className="px-2.5 py-1 bg-white hover:bg-stone-50 border border-stone-300 rounded-lg text-[11px] font-semibold text-stone-800 transition-colors flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                        title="Take a fresh GPS reading"
                      >
                        <RotateCcw className={`w-3 h-3 text-stone-600 ${isLocatingGps ? 'animate-spin' : ''}`} />
                        <span>Retry GPS</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* GPS Error Banner (Non-blocking with Retry option) */}
                {gpsError && (
                  <div className="p-3.5 bg-rose-50/90 border border-rose-200 rounded-2xl text-xs text-rose-950 flex items-start justify-between gap-3 animate-in fade-in duration-150">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold text-rose-900">GPS Location Notice</div>
                        <p className="text-[11px] text-rose-800 leading-relaxed">{gpsError}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={isLocatingGps || isSubmitting}
                      className="px-2.5 py-1 bg-white hover:bg-stone-50 border border-rose-300 rounded-lg text-[11px] font-semibold text-rose-950 transition-colors flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                    >
                      <RotateCcw className={`w-3 h-3 text-rose-700 ${isLocatingGps ? 'animate-spin' : ''}`} />
                      <span>Retry</span>
                    </button>
                  </div>
                )}

                {/* Location Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                    Location Name <span className="text-emerald-700">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-emerald-800 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      disabled={isSubmitting}
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="e.g. Berhampore, Campus Arboretum - North Quad, or Botanical Garden"
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Manual Latitude & Longitude Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                      Latitude <span className="text-emerald-700">*</span>
                      <span className="text-stone-400 font-normal lowercase ml-1">(-90 to 90)</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      disabled={isSubmitting}
                      value={latInput}
                      onChange={(e) => handleLatChange(e.target.value)}
                      placeholder="e.g. 24.0988"
                      className="w-full px-3.5 py-2.5 text-xs font-mono text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                      Longitude <span className="text-emerald-700">*</span>
                      <span className="text-stone-400 font-normal lowercase ml-1">(-180 to 180)</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      disabled={isSubmitting}
                      value={lngInput}
                      onChange={(e) => handleLngChange(e.target.value)}
                      placeholder="e.g. 88.2676"
                      className="w-full px-3.5 py-2.5 text-xs font-mono text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Place Search Box Directly Above Add Plant Map */}
                <div className="space-y-1.5 p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-200/80">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-emerald-800" />
                      <span>Search Real Place / Landmark</span>
                    </label>
                    <span className="text-[10px] text-stone-400 font-medium">OpenStreetMap Nominatim</span>
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          disabled={isSubmitting}
                          value={placeQuery}
                          onChange={(e) => {
                            setPlaceQuery(e.target.value);
                            setPlaceSearchError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handlePlaceSearch();
                            }
                          }}
                          placeholder="Search real place (e.g. Berhampore, Hyde Park, Central Botanical Garden)..."
                          className="w-full pl-3.5 pr-8 py-2 text-xs text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 shadow-2xs transition-all disabled:opacity-60"
                        />
                        {placeQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setPlaceQuery('');
                              setPlaceResults([]);
                              setHasSearchedPlaces(false);
                              setPlaceSearchError(null);
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handlePlaceSearch}
                        disabled={isSearchingPlaces || isSubmitting || !placeQuery.trim()}
                        className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSearchingPlaces ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Searching...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            <span>Search</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Place Search Error Message */}
                    {placeSearchError && (
                      <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2 animate-in fade-in duration-150">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <span>{placeSearchError}</span>
                      </div>
                    )}

                    {/* Place Search Dropdown Results */}
                    {placeResults.length > 0 && (
                      <div className="mt-2 bg-white rounded-xl border border-stone-200 shadow-lg divide-y divide-stone-100 max-h-56 overflow-y-auto animate-in fade-in duration-150 z-20 relative">
                        <div className="px-3 py-1.5 bg-stone-50 text-[11px] font-semibold text-stone-500">
                          Select a location to move the pin and update coordinates:
                        </div>
                        {placeResults.map((place) => (
                          <button
                            key={place.placeId}
                            type="button"
                            onClick={() => handleSelectPlace(place)}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/60 transition-colors flex items-start gap-2.5 group cursor-pointer"
                          >
                            <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-stone-900 group-hover:text-emerald-950 truncate">
                                {place.shortName}
                              </div>
                              <div className="text-[11px] text-stone-500 truncate mt-0.5">
                                {place.displayName}
                              </div>
                              <div className="text-[10px] font-mono text-stone-400 mt-0.5">
                                {place.lat.toFixed(5)}°, {place.lng.toFixed(5)}°
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Interactive Map */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-emerald-800" />
                      <span>Select Location on Map</span>
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Click anywhere on map or drag the pin
                    </span>
                  </div>

                  <div
                    className={
                      isMapFullscreen
                        ? 'fixed inset-0 z-[9999] w-screen h-screen m-0 p-0 rounded-none border-none bg-stone-900 overflow-hidden flex flex-col'
                        : 'relative rounded-2xl overflow-hidden border border-stone-300 shadow-inner'
                    }
                  >
                    <div
                      ref={mapContainerRef}
                      className={isMapFullscreen ? 'w-full h-full flex-1 relative z-0' : 'h-64 sm:h-72 w-full relative z-0'}
                      style={isMapFullscreen ? undefined : { minHeight: '260px' }}
                    />

                    {/* Fullscreen Floating Header Badge with Coordinates & Done Button */}
                    {isMapFullscreen && (
                      <div className="absolute top-2.5 left-2.5 z-[1000] max-w-[calc(100%-240px)] sm:max-w-md bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl border border-stone-300 shadow-md flex items-center justify-between gap-2.5 text-xs pointer-events-auto animate-in fade-in duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 truncate">
                              {locationName || 'Tap map or drag pin to adjust'}
                            </div>
                            <div className="text-[10px] font-mono text-stone-500 truncate">
                              {latInput}°, {lngInput}°
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsMapFullscreen(false)}
                          className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-all shadow-xs"
                          title="Return to submission form"
                        >
                          Done
                        </button>
                      </div>
                    )}

                    {/* In-canvas Map / Satellite View Toggle & Fullscreen Expand/Collapse */}
                    <div className="absolute top-2.5 right-2.5 z-[1000] pointer-events-auto flex items-center bg-white/95 backdrop-blur-md p-1 rounded-xl border border-stone-300 shadow-md">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSwitchMapStyle('map');
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                          mapStyle === 'map'
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                        }`}
                        title="Switch to standard OpenStreetMap view"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Map</span>
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSwitchMapStyle('satellite');
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                          mapStyle === 'satellite'
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                        }`}
                        title="Switch to high-resolution Satellite view"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Satellite</span>
                      </button>
                      <div className="w-px h-4 bg-stone-300 mx-1" />
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMapFullscreen((prev) => !prev);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                          isMapFullscreen
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                        }`}
                        title={isMapFullscreen ? 'Collapse map to form layout (Esc)' : 'Expand map to fullscreen'}
                        aria-label={isMapFullscreen ? 'Collapse map to form layout' : 'Expand map to fullscreen'}
                      >
                        {isMapFullscreen ? (
                          <Minimize2 className="w-3.5 h-3.5 text-current" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5 text-current" />
                        )}
                        <span>{isMapFullscreen ? 'Collapse' : 'Expand'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Selected Coordinates & Location Source Status Bar */}
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                      Selected Coordinates
                    </div>
                    <div className="font-mono text-xs text-stone-900 font-medium">
                      Latitude: <span className="font-bold text-emerald-950">{latInput || '—'}</span>
                      <span className="mx-2 text-stone-300">·</span>
                      Longitude: <span className="font-bold text-emerald-950">{lngInput || '—'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-stone-500 font-medium">Location Source:</span>
                    {locationSource === 'gps' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-bold">
                        <Navigation className="w-3 h-3 text-emerald-700" />
                        <span>GPS</span>
                      </span>
                    )}
                    {locationSource === 'map' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-100 border border-sky-300 text-sky-900 text-[11px] font-bold">
                        <MapPin className="w-3 h-3 text-sky-700" />
                        <span>Map Selection</span>
                      </span>
                    )}
                    {locationSource === 'manual' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-200 border border-stone-300 text-stone-800 text-[11px] font-bold">
                        <Compass className="w-3 h-3 text-stone-600" />
                        <span>Manual</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                  Short Description <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  disabled={isSubmitting}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe leaf structure, flowers, height, or habitat notes..."
                  className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
                />
              </div>

              {/* Student Identification Tip */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                  Field Identification Tip <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={studentTip}
                  onChange={(e) => setStudentTip(e.target.value)}
                  placeholder="e.g. Strongly aromatic scent, leaves serrated"
                  className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-100">
                <span className="text-[11px] text-stone-400 text-center sm:text-left">
                  Saves to Firestore with your unique Naturalist UID.
                </span>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 text-emerald-300 animate-spin" />
                      <span>Saving to Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-emerald-300" />
                      <span>Submit Observation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY UPLOADS / MY OBSERVATIONS                                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'my-observations' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-emerald-800 tracking-wider uppercase mb-1">
                Your Botanical Contributions
              </div>
              <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
                My Uploads
              </h1>
              <p className="text-sm text-stone-600 mt-1 max-w-xl">
                Manage the plant observations you have contributed to the botanical herbarium. Only you have permission to delete your submissions.
              </p>
            </div>

            <button
              onClick={() => setActiveSubTab('submit')}
              className="px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Submit New Plant</span>
            </button>
          </div>

          {/* User ID Card */}
          <div className="p-4 bg-white rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <span>Author UID:</span>
                  <code className="bg-stone-100 px-2 py-0.5 rounded text-stone-800 font-mono text-[11px]">
                    {authState.uid}
                  </code>
                </div>
                <div className="text-[11px] text-stone-500">
                  Secured by Firebase Authentication · Only you can delete your uploaded records
                </div>
              </div>
            </div>

            <button
              onClick={loadUserPlants}
              disabled={isLoadingUserPlants}
              className="text-xs text-stone-600 hover:text-emerald-900 font-medium px-3 py-1.5 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>

          {plantsLoadError && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{plantsLoadError}</span>
            </div>
          )}

          {/* Loading State */}
          {isLoadingUserPlants && (
            <div className="p-12 text-center bg-white rounded-3xl border border-stone-200 shadow-xs space-y-3">
              <Loader2 className="w-8 h-8 text-emerald-800 animate-spin mx-auto" />
              <div className="text-xs text-stone-500">Loading your submitted plant observations...</div>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingUserPlants && userPlants.length === 0 && (
            <div className="p-12 text-center bg-white rounded-3xl border border-stone-200 shadow-xs space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto">
                <Leaf className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif-display text-lg font-bold text-stone-900">
                  No Observations Uploaded Yet
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  You haven't submitted any plant observations on this device yet. Explore the campus, take a photo, and add your first finding!
                </p>
              </div>
              <button
                onClick={() => setActiveSubTab('submit')}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Submit Your First Plant
              </button>
            </div>
          )}

          {/* List of User's Uploads */}
          {!isLoadingUserPlants && userPlants.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {userPlants.map((plant) => (
                <article
                  key={plant.id}
                  className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Media Image */}
                    <div
                      onClick={() => onSelectPlant && onSelectPlant(plant)}
                      className={`relative aspect-[16/10] bg-stone-100 overflow-hidden ${
                        onSelectPlant ? 'cursor-pointer group' : ''
                      }`}
                    >
                      <img
                        src={plant.imageUrl || lavenderImg}
                        alt={plant.commonName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2 left-2 bg-emerald-900/90 text-white text-[9px] font-bold px-2 py-0.5 rounded backdrop-blur-xs uppercase tracking-wider">
                        My Upload
                      </div>
                      <div className="absolute top-2 right-2 bg-stone-900/80 text-white text-[10px] font-medium px-2 py-0.5 rounded backdrop-blur-xs">
                        {plant.category}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="p-4 space-y-2">
                      <h4
                        onClick={() => onSelectPlant && onSelectPlant(plant)}
                        className={`font-serif-display text-base font-bold text-stone-900 ${
                          onSelectPlant ? 'cursor-pointer hover:text-emerald-900 transition-colors' : ''
                        }`}
                      >
                        {plant.commonName}
                      </h4>
                      <div className="text-xs italic text-stone-500 font-serif">
                        {plant.scientificName}
                      </div>

                      <div className="text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-100 space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-800 shrink-0 mt-0.5" />
                          <span className="line-clamp-1 font-medium text-stone-800">{plant.locationName}</span>
                        </div>
                        {plant.coordinates && typeof plant.coordinates.lat === 'number' && (
                          <div className="flex items-center justify-between text-[11px] text-stone-500 font-mono">
                            <span>
                              {plant.coordinates.lat.toFixed(4)}, {plant.coordinates.lng.toFixed(4)}
                            </span>
                            {plant.locationSource && (
                              <span className="font-sans px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-stone-200 text-stone-700">
                                {plant.locationSource}
                              </span>
                            )}
                          </div>
                        )}
                        {plant.family && (
                          <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                            <Layers className="w-3 h-3 text-stone-400 shrink-0" />
                            <span>Family: {plant.family}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="p-4 pt-0 flex flex-col gap-2">
                    {onSelectPlant && (
                      <button
                        type="button"
                        onClick={() => onSelectPlant(plant)}
                        className="w-full py-2 px-3 bg-emerald-900 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-emerald-300" />
                        <span>View Plant Details</span>
                      </button>
                    )}

                    <div className="flex items-center gap-2">
                      {onViewOnMap && (
                        <button
                          type="button"
                          onClick={() => onViewOnMap(plant)}
                          className="flex-1 py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-stone-600" />
                          <span>Map</span>
                        </button>
                      )}

                      {/* Delete Button (Only for own plants) */}
                      <button
                        type="button"
                        onClick={() => setPlantToDelete(plant)}
                        className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Delete My Upload"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION DIALOG MODAL                                          */}
      {/* ========================================================================= */}
      {plantToDelete && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 border border-stone-200 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-serif-display text-xl font-bold text-stone-900">
                Delete Plant Observation?
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-stone-900 font-semibold">"{plantToDelete.commonName}"</strong>{' '}
                from the botanical database?
              </p>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-left text-[11px] text-stone-500 space-y-1">
                <div>• Location: {plantToDelete.locationName}</div>
                <div>• Record ID: <span className="font-mono">{plantToDelete.id}</span></div>
                <div>• Owner: You ({plantToDelete.ownerUid?.substring(0, 10)}...)</div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPlantToDelete(null)}
                className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Keep Observation
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                    <span>Yes, Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
