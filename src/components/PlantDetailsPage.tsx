import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  User,
  Compass,
  Shield,
  Tag,
  Info,
  AlertCircle,
  ExternalLink,
  Loader2,
  Globe,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Check,
  TreeDeciduous,
  Leaf as LeafIcon,
  CloudSun,
  Ruler,
  TrendingUp,
  CheckCircle2,
  ShieldCheck,
  Search,
  Layers,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Plant } from '../types/plant';
import { getUserProfile } from '../services/userService';
import { fetchGbifTaxonomyDetails, GbifTaxonomyDetails } from '../services/gbifService';
import { subscribeToAuth, getCurrentUid } from '../services/authService';
import { canEditPlant, canDeletePlant, isWebsiteOwnerUid } from '../config/owner';
import { updatePlantInFirestore, deletePlantFromFirestore } from '../services/firestoreService';
import {
  calculatePlantCarbon,
  validateTrunkCircumference,
  validateTrunkDiameter,
  validateTreeHeight,
  validateTreeAge,
  validateMeasurementDate,
  CARBON_CONSTANTS,
} from '../utils/carbonCalculation';
import { searchPlaces, reverseGeocode, GeocodingResult } from '../services/geocodingService';

interface PlantDetailsPageProps {
  plant: Plant;
  onBack: () => void;
  onOpenInExploreMap?: (plant: Plant) => void;
  onPlantUpdated?: (updated: Plant) => void;
  onPlantDeleted?: (plantId: string) => void;
  onOpenCarbonDashboard?: () => void;
}

export const PlantDetailsPage: React.FC<PlantDetailsPageProps> = ({
  plant,
  onBack,
  onOpenInExploreMap,
  onPlantUpdated,
  onPlantDeleted,
  onOpenCarbonDashboard,
}) => {
  const [uploaderUsername, setUploaderUsername] = useState<string | null>(
    plant.ownerUsername || null
  );
  const [isLoadingUploader, setIsLoadingUploader] = useState<boolean>(false);

  // Authentication & Permission state
  const [currentUid, setCurrentUid] = useState<string | null>(getCurrentUid());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit form state
  const [editCommonName, setEditCommonName] = useState(plant.commonName || '');
  const [editScientificName, setEditScientificName] = useState(plant.scientificName || '');
  const [editFamily, setEditFamily] = useState(plant.family || '');
  const [editGenus, setEditGenus] = useState(plant.genus || '');
  const [editCategory, setEditCategory] = useState<Plant['category']>(plant.category || 'Wildflower');
  const [editLocationName, setEditLocationName] = useState(plant.locationName || '');
  const [editLat, setEditLat] = useState(plant.coordinates?.lat !== undefined ? String(plant.coordinates.lat) : '');
  const [editLng, setEditLng] = useState(plant.coordinates?.lng !== undefined ? String(plant.coordinates.lng) : '');
  const [editDescription, setEditDescription] = useState(plant.description || '');
  const [editStudentTip, setEditStudentTip] = useState(plant.studentTip || '');
  const [editImageUrl, setEditImageUrl] = useState(plant.imageUrl || '');
  // Biometric fields
  const [editTrunkCircumference, setEditTrunkCircumference] = useState<string>(
    plant.trunkCircumferenceCm !== undefined
      ? String(plant.trunkCircumferenceCm)
      : plant.trunkDiameterCm !== undefined
      ? String(Math.round(plant.trunkDiameterCm * 3.1416 * 10) / 10)
      : ''
  );
  const [editTreeHeight, setEditTreeHeight] = useState<string>(
    plant.treeHeightM !== undefined ? String(plant.treeHeightM) : ''
  );
  const [editTreeAge, setEditTreeAge] = useState<string>(
    plant.treeAgeYears !== undefined ? String(plant.treeAgeYears) : ''
  );
  const [editMeasurementDate, setEditMeasurementDate] = useState<string>(
    plant.measurementDate || ''
  );

  // Edit Map interactive state & refs
  const editMapContainerRef = useRef<HTMLDivElement | null>(null);
  const editMapInstanceRef = useRef<L.Map | null>(null);
  const editMarkerRef = useRef<L.Marker | null>(null);
  const editStreetLayerRef = useRef<L.TileLayer | null>(null);
  const editSatLayerRef = useRef<L.TileLayer | null>(null);
  const editSatLabelsRef = useRef<L.TileLayer | null>(null);
  const [editMapStyle, setEditMapStyle] = useState<'map' | 'satellite'>('map');
  const [isEditMapFullscreen, setIsEditMapFullscreen] = useState<boolean>(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState<boolean>(false);
  const [resolvedAddressNote, setResolvedAddressNote] = useState<string | null>(null);
  const [editPlaceQuery, setEditPlaceQuery] = useState<string>('');
  const [editPlaceResults, setEditPlaceResults] = useState<GeocodingResult[]>([]);
  const [isSearchingEditPlaces, setIsSearchingEditPlaces] = useState<boolean>(false);
  const [editPlaceSearchError, setEditPlaceSearchError] = useState<string | null>(null);
  const editPlaceAbortRef = useRef<AbortController | null>(null);
  const reverseGeocodeAbortRef = useRef<AbortController | null>(null);

  // Subscribe to auth state changes to detect sign-in / Google linking
  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setCurrentUid(state.uid);
    });
    return () => unsubscribe();
  }, []);

  const canEdit = canEditPlant(plant.ownerUid, currentUid);
  const canDelete = canDeletePlant(plant.ownerUid, currentUid);
  const isFounder = isWebsiteOwnerUid(currentUid);

  const openEditModal = () => {
    setEditCommonName(plant.commonName || '');
    setEditScientificName(plant.scientificName || '');
    setEditFamily(plant.family || '');
    setEditGenus(plant.genus || '');
    setEditCategory(plant.category || 'Wildflower');
    setEditLocationName(plant.locationName || '');
    setEditLat(plant.coordinates?.lat !== undefined ? String(plant.coordinates.lat) : '');
    setEditLng(plant.coordinates?.lng !== undefined ? String(plant.coordinates.lng) : '');
    setEditDescription(plant.description || '');
    setEditStudentTip(plant.studentTip || '');
    setEditImageUrl(plant.imageUrl || '');
    setEditTrunkCircumference(
      plant.trunkCircumferenceCm !== undefined
        ? String(plant.trunkCircumferenceCm)
        : plant.trunkDiameterCm !== undefined
        ? String(Math.round(plant.trunkDiameterCm * 3.1416 * 10) / 10)
        : ''
    );
    setEditTreeHeight(plant.treeHeightM !== undefined ? String(plant.treeHeightM) : '');
    setEditTreeAge(plant.treeAgeYears !== undefined ? String(plant.treeAgeYears) : '');
    setEditMeasurementDate(plant.measurementDate || '');
    setEditPlaceQuery('');
    setEditPlaceResults([]);
    setEditPlaceSearchError(null);
    setResolvedAddressNote(null);
    setEditError(null);
    setIsEditModalOpen(true);
  };

  // GBIF species and taxonomy state
  const [gbifTaxonomy, setGbifTaxonomy] = useState<GbifTaxonomyDetails | null>(null);
  const [isLoadingGbif, setIsLoadingGbif] = useState<boolean>(false);
  const [gbifSearched, setGbifSearched] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [isPreviewMapFullscreen, setIsPreviewMapFullscreen] = useState<boolean>(false);
  const [previewMapStyle, setPreviewMapStyle] = useState<'map' | 'satellite'>('map');
  const previewStreetLayerRef = useRef<L.TileLayer | null>(null);
  const previewSatLayerRef = useRef<L.TileLayer | null>(null);
  const previewSatLabelsRef = useRef<L.TileLayer | null>(null);

  // Look up GBIF species / taxonomy information
  // Uses existing scientificName if present; otherwise matches commonName via existing GBIF service
  useEffect(() => {
    let isSubscribed = true;

    const query =
      plant.scientificName && plant.scientificName.trim()
        ? plant.scientificName.trim()
        : plant.commonName && plant.commonName.trim()
        ? plant.commonName.trim()
        : null;

    if (!query) {
      setGbifTaxonomy(null);
      setIsLoadingGbif(false);
      setGbifSearched(true);
      return;
    }

    setIsLoadingGbif(true);
    setGbifSearched(false);

    fetchGbifTaxonomyDetails(query)
      .then((data) => {
        if (isSubscribed) {
          setGbifTaxonomy(data);
          setIsLoadingGbif(false);
          setGbifSearched(true);
        }
      })
      .catch((err) => {
        console.warn('[PlantDetailsPage] GBIF lookup error:', err);
        if (isSubscribed) {
          setGbifTaxonomy(null);
          setIsLoadingGbif(false);
          setGbifSearched(true);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [plant.id, plant.scientificName, plant.commonName]);

  const hasValidCoordinates =
    typeof plant.coordinates?.lat === 'number' &&
    typeof plant.coordinates?.lng === 'number' &&
    !isNaN(plant.coordinates.lat) &&
    !isNaN(plant.coordinates.lng) &&
    plant.coordinates.lat >= -90 &&
    plant.coordinates.lat <= 90 &&
    plant.coordinates.lng >= -180 &&
    plant.coordinates.lng <= 180;

  // Initialize interactive Leaflet map
  useEffect(() => {
    if (!hasValidCoordinates || !mapContainerRef.current) return;

    const lat = plant.coordinates.lat;
    const lng = plant.coordinates.lng;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 16,
        scrollWheelZoom: false,
      });

      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      });
      previewStreetLayerRef.current = streetLayer;

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
      );
      previewSatLayerRef.current = satelliteLayer;

      const satelliteLabelsLayer = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
      );
      previewSatLabelsRef.current = satelliteLabelsLayer;

      if (previewMapStyle === 'satellite') {
        satelliteLayer.addTo(map);
        satelliteLabelsLayer.addTo(map);
      } else {
        streetLayer.addTo(map);
      }

      // Custom botanical marker matching app theme
      const pinIcon = L.divIcon({
        className: 'plant-details-pin',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
            <div style="background-color: #065f46; color: white; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
              <div style="transform: rotate(45deg); width: 10px; height: 10px; background-color: white; border-radius: 50%;"></div>
            </div>
            <div style="width: 8px; height: 3px; background: rgba(0,0,0,0.25); border-radius: 50%; margin-top: 2px;"></div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([lat, lng], {
        icon: pinIcon,
      }).addTo(map);

      const commonName = plant.commonName || 'Plant Location';
      const locName = plant.locationName || '';

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; padding: 2px; min-width: 140px;">
          <strong style="color: #065f46; font-size: 14px; display: block; margin-bottom: 2px;">${commonName}</strong>
          ${plant.scientificName ? `<div style="font-style: italic; color: #57534e; font-size: 12px; margin-bottom: 4px;">${plant.scientificName}</div>` : ''}
          ${locName ? `<div style="color: #78716c; font-size: 11px;">📍 ${locName}</div>` : ''}
          <div style="color: #a8a29e; font-size: 10px; margin-top: 4px; font-family: monospace;">${lat.toFixed(5)}°, ${lng.toFixed(5)}°</div>
        </div>
      `);

      mapInstanceRef.current = map;

      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 200);
    }, 60);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [hasValidCoordinates, plant.coordinates?.lat, plant.coordinates?.lng, plant.commonName, plant.scientificName, plant.locationName]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [plant.id]);

  // Switch Preview Map tile style between Map and Satellite
  const handleSwitchPreviewMapStyle = (style: 'map' | 'satellite') => {
    setPreviewMapStyle(style);
    const map = mapInstanceRef.current;
    if (!map) return;
    const street = previewStreetLayerRef.current;
    const sat = previewSatLayerRef.current;
    const labels = previewSatLabelsRef.current;
    if (style === 'satellite') {
      if (street && map.hasLayer(street)) map.removeLayer(street);
      if (sat && !map.hasLayer(sat)) map.addLayer(sat);
      if (labels && !map.hasLayer(labels)) map.addLayer(labels);
      sat?.bringToBack();
    } else {
      if (sat && map.hasLayer(sat)) map.removeLayer(sat);
      if (labels && map.hasLayer(labels)) map.removeLayer(labels);
      if (street && !map.hasLayer(street)) map.addLayer(street);
      street?.bringToBack();
    }
  };

  // Handle resize and body scroll for preview map fullscreen
  useEffect(() => {
    if (isPreviewMapFullscreen) {
      document.body.style.overflow = 'hidden';
    } else if (!isEditModalOpen) {
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
      if (!isEditModalOpen) document.body.style.overflow = '';
    };
  }, [isPreviewMapFullscreen, isEditModalOpen]);

  // Handle resize for edit modal map fullscreen
  useEffect(() => {
    const timer1 = setTimeout(() => {
      editMapInstanceRef.current?.invalidateSize();
    }, 100);
    const timer2 = setTimeout(() => {
      editMapInstanceRef.current?.invalidateSize();
    }, 300);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isEditMapFullscreen]);

  // Escape key handler for fullscreen maps
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditMapFullscreen) {
          setIsEditMapFullscreen(false);
        } else if (isPreviewMapFullscreen) {
          setIsPreviewMapFullscreen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMapFullscreen, isPreviewMapFullscreen]);

  // If plant has ownerUid but no ownerUsername is set, look up the username
  useEffect(() => {
    let isSubscribed = true;

    if (plant.ownerUsername) {
      setUploaderUsername(plant.ownerUsername);
      return;
    }

    if (plant.ownerUid) {
      setIsLoadingUploader(true);
      getUserProfile(plant.ownerUid)
        .then((profile) => {
          if (isSubscribed) {
            if (profile?.username) {
              setUploaderUsername(`@${profile.username}`);
            } else {
              setUploaderUsername(null);
            }
          }
        })
        .catch(() => {
          if (isSubscribed) {
            setUploaderUsername(null);
          }
        })
        .finally(() => {
          if (isSubscribed) {
            setIsLoadingUploader(false);
          }
        });
    } else {
      setUploaderUsername(null);
    }

    return () => {
      isSubscribed = false;
    };
  }, [plant.ownerUid, plant.ownerUsername]);

  // Format creation / upload date from createdAt
  const formattedUploadDate = React.useMemo(() => {
    if (!plant.createdAt) {
      return null;
    }
    try {
      if (typeof plant.createdAt.toDate === 'function') {
        return plant.createdAt.toDate().toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      if (typeof plant.createdAt === 'string' || typeof plant.createdAt === 'number') {
        const d = new Date(plant.createdAt);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      }
    } catch {
      // ignore parsing errors
    }
    return null;
  }, [plant.createdAt]);

  // Clean values for fields: existing data first, with GBIF fallback
  const displayScientificName =
    (plant.scientificName && plant.scientificName.trim()) ||
    (gbifTaxonomy?.scientificName && gbifTaxonomy.scientificName.trim()) ||
    null;

  const displayFamily =
    (plant.family && plant.family.trim()) ||
    (gbifTaxonomy?.family && gbifTaxonomy.family.trim()) ||
    null;

  const displayGenus =
    (plant.genus && plant.genus.trim()) ||
    (gbifTaxonomy?.genus && gbifTaxonomy.genus.trim()) ||
    null;

  const hasLocationSource = Boolean(plant.locationSource && plant.locationSource.trim());

  // Quantitative carbon sequestration calculation
  const carbonEstimate = React.useMemo(() => calculatePlantCarbon(plant), [plant]);

  // Initialize and synchronize Interactive Leaflet Map for Edit Modal
  useEffect(() => {
    if (!isEditModalOpen) {
      if (editMapInstanceRef.current) {
        editMapInstanceRef.current.remove();
        editMapInstanceRef.current = null;
        editMarkerRef.current = null;
        editStreetLayerRef.current = null;
        editSatLayerRef.current = null;
        editSatLabelsRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!editMapContainerRef.current) return;

      if (editMapInstanceRef.current) {
        editMapInstanceRef.current.invalidateSize();
        return;
      }

      const curLat = parseFloat(editLat) || plant.coordinates?.lat || 24.0988;
      const curLng = parseFloat(editLng) || plant.coordinates?.lng || 88.2676;

      const map = L.map(editMapContainerRef.current, {
        center: [curLat, curLng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      });
      editStreetLayerRef.current = streetLayer;

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
      );
      editSatLayerRef.current = satelliteLayer;

      const satelliteLabelsLayer = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
      );
      editSatLabelsRef.current = satelliteLabelsLayer;

      if (editMapStyle === 'satellite') {
        satelliteLayer.addTo(map);
        satelliteLabelsLayer.addTo(map);
      } else {
        streetLayer.addTo(map);
      }

      // High-contrast botanical pin marker
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

      // Auto reverse-geocode address when pin is moved or map is tapped
      const autoResolveAddress = async (lat: number, lng: number) => {
        if (reverseGeocodeAbortRef.current) {
          reverseGeocodeAbortRef.current.abort();
        }
        const ac = new AbortController();
        reverseGeocodeAbortRef.current = ac;
        setIsResolvingLocation(true);
        try {
          const address = await reverseGeocode(lat, lng, ac.signal);
          if (address) {
            setEditLocationName(address);
            setResolvedAddressNote(address);
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.warn('[EditPlant] Reverse geocoding error:', err);
          }
        } finally {
          setIsResolvingLocation(false);
        }
      };

      // Synchronize coordinates & location name when dragging marker
      marker.on('dragend', () => {
        const latlng = marker.getLatLng();
        setEditLat(latlng.lat.toFixed(6));
        setEditLng(latlng.lng.toFixed(6));
        autoResolveAddress(latlng.lat, latlng.lng);
      });

      // Synchronize coordinates & location name when tapping / clicking map
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        setEditLat(lat.toFixed(6));
        setEditLng(lng.toFixed(6));
        autoResolveAddress(lat, lng);
      });

      editMapInstanceRef.current = map;
      editMarkerRef.current = marker;

      // Invalidate size across intervals to ensure responsiveness on all mobile phones
      setTimeout(() => map.invalidateSize(), 150);
      setTimeout(() => map.invalidateSize(), 350);
      setTimeout(() => map.invalidateSize(), 650);
    }, 100);

    const handleResize = () => {
      editMapInstanceRef.current?.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (editMapInstanceRef.current) {
        editMapInstanceRef.current.remove();
        editMapInstanceRef.current = null;
        editMarkerRef.current = null;
        editStreetLayerRef.current = null;
        editSatLayerRef.current = null;
        editSatLabelsRef.current = null;
      }
    };
  }, [isEditModalOpen]);

  // Handler: Manual Latitude change in Edit Modal
  const handleEditLatChange = (newVal: string) => {
    setEditLat(newVal);
    const parsedLat = parseFloat(newVal);
    const parsedLng = parseFloat(editLng);
    if (
      !isNaN(parsedLat) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      !isNaN(parsedLng) &&
      parsedLng >= -180 &&
      parsedLng <= 180
    ) {
      if (editMarkerRef.current && editMapInstanceRef.current) {
        editMarkerRef.current.setLatLng([parsedLat, parsedLng]);
        editMapInstanceRef.current.panTo([parsedLat, parsedLng]);
      }
    }
  };

  // Handler: Manual Longitude change in Edit Modal
  const handleEditLngChange = (newVal: string) => {
    setEditLng(newVal);
    const parsedLat = parseFloat(editLat);
    const parsedLng = parseFloat(newVal);
    if (
      !isNaN(parsedLat) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      !isNaN(parsedLng) &&
      parsedLng >= -180 &&
      parsedLng <= 180
    ) {
      if (editMarkerRef.current && editMapInstanceRef.current) {
        editMarkerRef.current.setLatLng([parsedLat, parsedLng]);
        editMapInstanceRef.current.panTo([parsedLat, parsedLng]);
      }
    }
  };

  // Switch base map style in Edit Modal
  const handleSwitchEditMapStyle = (style: 'map' | 'satellite') => {
    setEditMapStyle(style);
    const map = editMapInstanceRef.current;
    if (!map) return;
    const street = editStreetLayerRef.current;
    const sat = editSatLayerRef.current;
    const labels = editSatLabelsRef.current;

    if (style === 'satellite') {
      if (street && map.hasLayer(street)) map.removeLayer(street);
      if (sat && !map.hasLayer(sat)) map.addLayer(sat);
      if (labels && !map.hasLayer(labels)) map.addLayer(labels);
      sat?.bringToBack();
    } else {
      if (sat && map.hasLayer(sat)) map.removeLayer(sat);
      if (labels && map.hasLayer(labels)) map.removeLayer(labels);
      if (street && !map.hasLayer(street)) map.addLayer(street);
      street?.bringToBack();
    }
  };

  // Search places inside Edit Modal
  const handleEditPlaceSearch = async () => {
    const q = editPlaceQuery.trim();
    if (!q || q.length < 2) {
      setEditPlaceSearchError('Please enter at least 2 characters to search places.');
      return;
    }
    if (editPlaceAbortRef.current) {
      editPlaceAbortRef.current.abort();
    }
    const ac = new AbortController();
    editPlaceAbortRef.current = ac;
    setIsSearchingEditPlaces(true);
    setEditPlaceSearchError(null);
    try {
      const results = await searchPlaces(q, ac.signal);
      setEditPlaceResults(results);
      if (results.length === 0) {
        setEditPlaceSearchError(`No places found matching "${q}". Try another location.`);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setEditPlaceSearchError('Unable to search places. Please check your connection.');
      }
    } finally {
      setIsSearchingEditPlaces(false);
    }
  };

  // Select place in Edit Modal
  const handleSelectEditPlace = (place: GeocodingResult) => {
    setEditLocationName(place.shortName || place.displayName.split(',')[0]);
    setEditLat(place.lat.toFixed(6));
    setEditLng(place.lng.toFixed(6));
    setResolvedAddressNote(place.shortName);
    setEditPlaceResults([]);
    setEditPlaceQuery('');
    setEditPlaceSearchError(null);

    if (editMapInstanceRef.current && editMarkerRef.current) {
      editMarkerRef.current.setLatLng([place.lat, place.lng]);
      editMapInstanceRef.current.setView([place.lat, place.lng], 16, { animate: true });
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plant.id) return;

    const trimmedCommon = editCommonName.trim();
    if (!trimmedCommon) {
      setEditError('Common Name is required.');
      return;
    }

    const trimmedLocation = editLocationName.trim();
    if (!trimmedLocation) {
      setEditError('Location Name is required.');
      return;
    }

    const parsedLat = parseFloat(editLat);
    const parsedLng = parseFloat(editLng);
    const hasCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

    if (editLat.trim() && isNaN(parsedLat)) {
      setEditError('Latitude must be a valid number.');
      return;
    }
    if (editLng.trim() && isNaN(parsedLng)) {
      setEditError('Longitude must be a valid number.');
      return;
    }
    if (hasCoords) {
      if (parsedLat < -90 || parsedLat > 90) {
        setEditError('Latitude must be between -90 and 90 degrees.');
        return;
      }
      if (parsedLng < -180 || parsedLng > 180) {
        setEditError('Longitude must be between -180 and 180 degrees.');
        return;
      }
    }

    // Biometric field validations (optional)
    const valCirc = validateTrunkCircumference(editTrunkCircumference);
    if (!valCirc.isValid) {
      setEditError(valCirc.error || 'Invalid trunk circumference.');
      return;
    }

    const valHeight = validateTreeHeight(editTreeHeight);
    if (!valHeight.isValid) {
      setEditError(valHeight.error || 'Invalid tree height.');
      return;
    }

    const valAge = validateTreeAge(editTreeAge);
    if (!valAge.isValid) {
      setEditError(valAge.error || 'Invalid tree age.');
      return;
    }

    const valDate = validateMeasurementDate(editMeasurementDate);
    if (!valDate.isValid) {
      setEditError(valDate.error || 'Invalid measurement date.');
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const cleanUpdate: Partial<Omit<Plant, 'id' | 'ownerUid' | 'createdAt'>> = {
        commonName: trimmedCommon,
        scientificName: editScientificName.trim() || undefined,
        family: editFamily.trim() || undefined,
        genus: editGenus.trim() || undefined,
        category: editCategory as any,
        locationName: trimmedLocation,
        description: editDescription.trim() || undefined,
        studentTip: editStudentTip.trim() || undefined,
        imageUrl: editImageUrl.trim() || undefined,
        coordinates: hasCoords ? { lat: parsedLat, lng: parsedLng } : plant.coordinates,
        trunkCircumferenceCm: valCirc.value,
        trunkDiameterCm: valCirc.calculatedDbh,
        treeHeightM: valHeight.value,
        treeAgeYears: valAge.value,
        measurementDate: valDate.value,
      };

      await updatePlantInFirestore(plant.id, cleanUpdate, currentUid || undefined);

      const updatedPlant: Plant = {
        ...plant,
        ...cleanUpdate,
        id: plant.id,
        ownerUid: plant.ownerUid, // NEVER alter ownerUid
      };

      if (onPlantUpdated) {
        onPlantUpdated(updatedPlant);
      }

      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error('[PlantDetailsPage] Save edit error:', err);
      setEditError(err.message || 'Failed to update plant observation.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!plant.id) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deletePlantFromFirestore(plant.id, currentUid || undefined);
      if (onPlantDeleted) {
        onPlantDeleted(plant.id);
      }
      setIsDeleteModalOpen(false);
      onBack();
    } catch (err: any) {
      console.error('[PlantDetailsPage] Delete error:', err);
      setDeleteError(err.message || 'Failed to delete plant observation.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 py-6 sm:py-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-200">
        {/* Navigation Bar / Action Buttons */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 gap-4 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 hover:text-emerald-950 bg-white hover:bg-stone-100 border border-stone-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs group"
          >
            <ArrowLeft className="w-4 h-4 text-stone-500 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Plants</span>
          </button>

          {/* Action buttons: Only rendered when user has permission */}
          <div className="flex items-center gap-2.5">
            {canEdit && (
              <button
                type="button"
                onClick={openEditModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-stone-50 text-stone-800 hover:text-stone-950 border border-stone-200 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                title={isFounder && plant.ownerUid !== currentUid ? 'Edit as Website Owner' : 'Edit your plant observation'}
              >
                <Pencil className="w-3.5 h-3.5 text-stone-500" />
                <span>Edit Plant</span>
                {isFounder && plant.ownerUid !== currentUid && (
                  <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded uppercase">Owner</span>
                )}
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setIsDeleteModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                title={isFounder && plant.ownerUid !== currentUid ? 'Delete as Website Owner' : 'Delete your plant observation'}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Delete</span>
              </button>
            )}

            {!canEdit && !canDelete && (
              <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider hidden sm:inline-block">
                Plant Profile &amp; Botanical Record
              </span>
            )}
          </div>
        </div>

        {/* Main Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Plant Photo Card */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
              <div className="relative aspect-[4/3] bg-stone-100 overflow-hidden">
                {plant.imageUrl ? (
                  <img
                    src={plant.imageUrl}
                    alt={plant.commonName || 'Plant Photo'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 bg-stone-100 p-8 text-center space-y-2">
                    <span className="text-5xl">🌿</span>
                    <div className="font-serif-display text-base text-stone-600 font-bold">
                      No Photo Available
                    </div>
                    <div className="text-xs text-stone-400">
                      This specimen record has no image uploaded.
                    </div>
                  </div>
                )}

                {/* Category Badge */}
                {plant.category && (
                  <div className="absolute top-4 left-4 bg-stone-900/80 backdrop-blur-md text-white text-xs font-medium px-3 py-1 rounded-full shadow-xs">
                    {plant.category}
                  </div>
                )}
              </div>

              {/* Quick Summary under photo */}
              <div className="p-6 space-y-2">
                <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                  {plant.commonName || 'Unnamed Plant'}
                </h1>

                {displayScientificName && (
                  <p className="text-sm sm:text-base italic text-stone-600 font-serif">
                    {displayScientificName}
                  </p>
                )}

                {plant.description && (
                  <p className="pt-3 text-xs sm:text-sm text-stone-600 leading-relaxed border-t border-stone-100">
                    {plant.description}
                  </p>
                )}
              </div>
            </div>

            {/* Carbon Sequestration & Biometrics Card */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <TreeDeciduous className="w-4 h-4 text-emerald-800" />
                  <h2 className="font-serif-display text-lg font-bold text-stone-900">
                    Carbon Sequestration &amp; Biometrics
                  </h2>
                </div>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    carbonEstimate.status === 'eligible'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : carbonEstimate.status === 'insufficient_data'
                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                      : 'bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                >
                  {carbonEstimate.status === 'eligible' && 'Eligible Specimen'}
                  {carbonEstimate.status === 'insufficient_data' && 'Insufficient Data'}
                  {carbonEstimate.status === 'not_applicable' && 'Not Applicable'}
                </span>
              </div>

              {/* Recorded Biometrics Sub-grid */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">
                  Field Biometric Measurements
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
                    <span className="text-[9px] font-sans uppercase font-bold text-stone-400 block">Circumference</span>
                    <span className="font-bold text-stone-800 text-xs">
                      {plant.trunkCircumferenceCm
                        ? `${plant.trunkCircumferenceCm} cm`
                        : plant.trunkDiameterCm
                        ? `${Math.round(plant.trunkDiameterCm * 3.1416 * 10) / 10} cm`
                        : 'Not recorded'}
                    </span>
                    {plant.trunkDiameterCm && (
                      <span className="text-[9px] text-stone-400 block font-normal">
                        DBH: {plant.trunkDiameterCm} cm
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
                    <span className="text-[9px] font-sans uppercase font-bold text-stone-400 block">Tree Height</span>
                    <span className="font-bold text-stone-800 text-xs">
                      {plant.treeHeightM ? `${plant.treeHeightM} m` : 'Not recorded'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
                    <span className="text-[9px] font-sans uppercase font-bold text-stone-400 block">Tree Age</span>
                    <span className="font-bold text-stone-800 text-xs">
                      {plant.treeAgeYears ? `${plant.treeAgeYears} yrs` : 'Not recorded'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
                    <span className="text-[9px] font-sans uppercase font-bold text-stone-400 block">Measured Date</span>
                    <span className="font-bold text-stone-800 text-[11px]">
                      {plant.measurementDate || 'Not recorded'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Carbon Calculations or Explanations */}
              {carbonEstimate.status === 'eligible' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Stored Carbon (kg C) */}
                    <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-emerald-800 font-bold block">
                        Stored Elemental Carbon (C)
                      </span>
                      <div className="text-2xl font-black font-mono text-emerald-950">
                        {carbonEstimate.storedCarbonKg?.toLocaleString('en-US', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        <span className="text-xs font-sans font-bold text-emerald-700 ml-1">kg C</span>
                      </div>
                      <p className="text-[10px] text-emerald-800">
                        Dry elemental carbon sequestered in cellulose &amp; lignin
                      </p>
                    </div>

                    {/* Stored CO2 Equivalent (kg CO2e) */}
                    <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-2xl space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-teal-800 font-bold block">
                        CO₂ Equivalent (CO₂e)
                      </span>
                      <div className="text-2xl font-black font-mono text-teal-950">
                        {carbonEstimate.storedCo2eKg?.toLocaleString('en-US', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        <span className="text-xs font-sans font-bold text-teal-700 ml-1">kg CO₂e</span>
                      </div>
                      <p className="text-[10px] text-teal-800">
                        Total atmospheric carbon dioxide removed (× 44/12)
                      </p>
                    </div>
                  </div>

                  {/* Annual Absorption Card */}
                  <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                        Annual Sequestration Rate
                      </span>
                      {carbonEstimate.annualAbsorptionCo2eKg !== null ? (
                        <div className="font-bold text-stone-900 font-mono text-sm">
                          {carbonEstimate.annualAbsorptionCo2eKg.toFixed(1)} kg CO₂e/year
                          <span className="text-[11px] text-stone-500 font-sans ml-2">
                            ({carbonEstimate.annualAbsorptionCarbonKg?.toFixed(1)} kg C/year)
                          </span>
                        </div>
                      ) : (
                        <span className="text-amber-800 text-[11px] font-medium">
                          Requires tree age (years) to calculate annual rate
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono">
                      AGB: {carbonEstimate.abovegroundBiomassKg} kg • BGB: {carbonEstimate.belowgroundBiomassKg} kg
                    </span>
                  </div>

                  {/* Methodology Note */}
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-[11px] text-stone-600 space-y-1">
                    <div className="font-semibold text-stone-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>{carbonEstimate.methodName}</span>
                    </div>
                    <p className="text-[10px] text-stone-500 leading-relaxed">
                      Assumes wood density ρ = {CARBON_CONSTANTS.DEFAULT_WOOD_DENSITY} g/cm³, IPCC root ratio = {CARBON_CONSTANTS.ROOT_TO_SHOOT_RATIO}, and dry biomass carbon fraction = {(CARBON_CONSTANTS.CARBON_FRACTION * 100).toFixed(0)}%.
                    </p>
                  </div>
                </div>
              ) : carbonEstimate.status === 'insufficient_data' ? (
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Insufficient Biometric Data</span>
                  </div>
                  <p className="text-amber-800 text-[11px] leading-relaxed">
                    Trunk diameter at breast height (DBH in cm) is required by peer-reviewed allometric equations.
                    Values are not invented or synthesized without real measurements.
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={openEditModal}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-lg text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Add DBH &amp; Biometrics</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-stone-700 font-bold">
                    <Info className="w-4 h-4 text-stone-400 shrink-0" />
                    <span>Not Applicable for {plant.category}</span>
                  </div>
                  <p className="text-stone-500 text-[11px] leading-relaxed">
                    Forest allometric equations calculate permanent secondary xylem (woody trunk) carbon storage.
                    Non-tree flora do not form substantial permanent woody carbon sinks.
                  </p>
                </div>
              )}

              {/* View Campus Dashboard link */}
              {onOpenCarbonDashboard && (
                <button
                  type="button"
                  onClick={onOpenCarbonDashboard}
                  className="w-full py-2.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <TreeDeciduous className="w-3.5 h-3.5 text-emerald-800" />
                  <span>View Campus Carbon Dashboard</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Taxonomy, Location, & Upload Information */}
          <div className="lg:col-span-6 space-y-6">
            {/* Taxonomic Hierarchy Card */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                <Tag className="w-4 h-4 text-emerald-800" />
                <h2 className="font-serif-display text-lg font-bold text-stone-900">
                  Botanical &amp; Taxonomy Information
                </h2>
              </div>

              {/* 1. Existing Plant Data Displayed First */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Common Name */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                    Common Name
                  </span>
                  <span className="font-bold text-stone-900 text-sm">
                    {plant.commonName || 'Not specified'}
                  </span>
                </div>

                {/* Scientific Name */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                    Scientific Name
                  </span>
                  <span className="font-serif italic font-bold text-stone-900 text-sm">
                    {displayScientificName || 'Not specified'}
                  </span>
                </div>

                {/* Family */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                    Family
                  </span>
                  <span className="font-medium text-stone-800 text-sm">
                    {displayFamily || 'Not specified'}
                  </span>
                </div>

                {/* Genus */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                    Genus
                  </span>
                  <span className="font-medium font-serif italic text-stone-800 text-sm">
                    {displayGenus || 'Not specified'}
                  </span>
                </div>
              </div>

              {/* 2. GBIF Species & Taxonomy Subsection */}
              <div className="pt-4 border-t border-stone-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                    <Globe className="w-3.5 h-3.5 text-emerald-800" />
                    <span>GBIF Backbone Taxonomy</span>
                  </div>
                  {gbifTaxonomy?.gbifUrl && (
                    <a
                      href={gbifTaxonomy.gbifUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 hover:underline transition-colors"
                    >
                      <span>GBIF Source</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Loading State */}
                {isLoadingGbif && (
                  <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 flex items-center justify-center gap-2 text-xs text-stone-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" />
                    <span>Fetching GBIF species information...</span>
                  </div>
                )}

                {/* Available GBIF Information */}
                {!isLoadingGbif && gbifTaxonomy && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {gbifTaxonomy.scientificName && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Scientific Name</span>
                        <span className="font-serif italic font-semibold text-stone-900 text-xs block truncate" title={gbifTaxonomy.scientificName}>
                          {gbifTaxonomy.scientificName}
                        </span>
                      </div>
                    )}
                    {gbifTaxonomy.kingdom && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Kingdom</span>
                        <span className="font-semibold text-stone-800 text-xs block">{gbifTaxonomy.kingdom}</span>
                      </div>
                    )}
                    {gbifTaxonomy.phylum && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Phylum</span>
                        <span className="font-semibold text-stone-800 text-xs block">{gbifTaxonomy.phylum}</span>
                      </div>
                    )}
                    {gbifTaxonomy.class && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Class</span>
                        <span className="font-semibold text-stone-800 text-xs block">{gbifTaxonomy.class}</span>
                      </div>
                    )}
                    {gbifTaxonomy.order && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Order</span>
                        <span className="font-semibold text-stone-800 text-xs block">{gbifTaxonomy.order}</span>
                      </div>
                    )}
                    {gbifTaxonomy.family && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Family</span>
                        <span className="font-semibold text-stone-800 text-xs block">{gbifTaxonomy.family}</span>
                      </div>
                    )}
                    {gbifTaxonomy.genus && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Genus</span>
                        <span className="font-serif italic font-semibold text-stone-800 text-xs block">{gbifTaxonomy.genus}</span>
                      </div>
                    )}
                    {(gbifTaxonomy.species || gbifTaxonomy.canonicalName) && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Species</span>
                        <span className="font-serif italic font-semibold text-stone-800 text-xs block truncate" title={gbifTaxonomy.species || gbifTaxonomy.canonicalName}>
                          {gbifTaxonomy.species || gbifTaxonomy.canonicalName}
                        </span>
                      </div>
                    )}
                    {gbifTaxonomy.rank && (
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold block">Rank</span>
                        <span className="font-semibold uppercase text-stone-800 text-[11px] block">{gbifTaxonomy.rank}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* GBIF Unavailable / Failure Message */}
                {!isLoadingGbif && gbifSearched && !gbifTaxonomy && (
                  <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 text-xs text-stone-500 flex items-center gap-2">
                    <Info className="w-4 h-4 text-stone-400 shrink-0" />
                    <span>Additional species information is not available.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Location Information & Interactive Map Card */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-800" />
                  <h2 className="font-serif-display text-lg font-bold text-stone-900">
                    Location Information
                  </h2>
                </div>
                {hasLocationSource && (
                  <span className="font-semibold uppercase tracking-wider text-[10px] px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900">
                    Source: {plant.locationSource}
                  </span>
                )}
              </div>

              {/* Interactive Location Map or Fallback */}
              {hasValidCoordinates ? (
                <div className="space-y-3">
                  <div
                    className={
                      isPreviewMapFullscreen
                        ? 'fixed inset-0 z-[9999] w-screen h-screen m-0 p-0 rounded-none border-none bg-stone-900 overflow-hidden flex flex-col'
                        : 'w-full h-64 sm:h-72 rounded-2xl overflow-hidden border border-stone-200 shadow-inner z-0 relative'
                    }
                    style={isPreviewMapFullscreen ? undefined : { minHeight: '250px' }}
                  >
                    <div
                      ref={mapContainerRef}
                      className="w-full h-full relative z-0"
                    />

                    {/* Fullscreen Floating Header Badge with Plant Name, Coordinates & Collapse Button */}
                    {isPreviewMapFullscreen && (
                      <div className="absolute top-2.5 left-2.5 z-[1000] max-w-[calc(100%-250px)] sm:max-w-md bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-stone-300 shadow-md flex items-center justify-between gap-3 text-xs pointer-events-auto animate-in fade-in duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 truncate">
                              {plant.commonName || 'Plant Location'}
                            </div>
                            <div className="text-[10px] text-stone-600 truncate">
                              {plant.locationName || `${plant.coordinates.lat.toFixed(5)}°, ${plant.coordinates.lng.toFixed(5)}°`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {onOpenInExploreMap && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsPreviewMapFullscreen(false);
                                onOpenInExploreMap(plant);
                              }}
                              className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-xs flex items-center gap-1"
                              title="Open in full Explore Map"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              <span className="hidden xs:inline sm:inline">Explore Map</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setIsPreviewMapFullscreen(false)}
                            className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-800 rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-xs"
                            title="Return to details page"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}

                    {/* In-canvas Map / Satellite View Toggle & Expand/Collapse Fullscreen */}
                    <div className="absolute top-2.5 right-2.5 z-[1000] pointer-events-auto flex items-center bg-white/95 backdrop-blur-md p-1 rounded-xl border border-stone-300 shadow-md">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSwitchPreviewMapStyle('map');
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                          previewMapStyle === 'map'
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
                          handleSwitchPreviewMapStyle('satellite');
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                          previewMapStyle === 'satellite'
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
                          setIsPreviewMapFullscreen((prev) => !prev);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                          isPreviewMapFullscreen
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                        }`}
                        title={isPreviewMapFullscreen ? 'Collapse map to normal layout (Esc)' : 'Expand map to fullscreen'}
                        aria-label={isPreviewMapFullscreen ? 'Collapse map to normal layout' : 'Expand map to fullscreen'}
                      >
                        {isPreviewMapFullscreen ? (
                          <Minimize2 className="w-3.5 h-3.5 text-current" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5 text-current" />
                        )}
                        <span>{isPreviewMapFullscreen ? 'Collapse' : 'Expand'}</span>
                      </button>
                    </div>
                  </div>

                  {onOpenInExploreMap && !isPreviewMapFullscreen && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenInExploreMap(plant);
                      }}
                      className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 active:scale-[0.99] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                    >
                      <Compass className="w-4 h-4 text-emerald-300" />
                      <span>Open in Explore Map</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-stone-500">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-stone-200/80 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-4 h-4 text-stone-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-stone-700">Location not available</p>
                      <p className="text-[11px] text-stone-500">No valid geographic coordinates were recorded for this plant record.</p>
                    </div>
                  </div>
                  {onOpenInExploreMap && (
                    <button
                      type="button"
                      onClick={() => onOpenInExploreMap(plant)}
                      className="px-3.5 py-2 bg-stone-200 hover:bg-stone-300 active:scale-98 text-stone-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
                    >
                      <Compass className="w-3.5 h-3.5 text-stone-600" />
                      <span>Open in Explore Map</span>
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-3 text-xs">
                {/* Location Name */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                    Location Name
                  </span>
                  <span className="font-medium text-stone-900 text-sm">
                    {plant.locationName || 'Unknown location'}
                  </span>
                </div>

                {/* Latitude & Longitude */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-0.5 font-mono">
                    <span className="text-[10px] uppercase font-sans font-bold text-stone-400 tracking-wider block">
                      Latitude
                    </span>
                    <span className="text-stone-800 text-xs font-semibold">
                      {typeof plant.coordinates?.lat === 'number'
                        ? `${plant.coordinates.lat.toFixed(5)}°`
                        : 'N/A'}
                    </span>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-0.5 font-mono">
                    <span className="text-[10px] uppercase font-sans font-bold text-stone-400 tracking-wider block">
                      Longitude
                    </span>
                    <span className="text-stone-800 text-xs font-semibold">
                      {typeof plant.coordinates?.lng === 'number'
                        ? `${plant.coordinates.lng.toFixed(5)}°`
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Location Source */}
                {hasLocationSource && (
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                    <span className="text-stone-500 font-medium">Location Source</span>
                    <span className="font-semibold uppercase tracking-wider text-[11px] px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900">
                      {plant.locationSource}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Upload & Specimen Provenance Card */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                <Shield className="w-4 h-4 text-emerald-800" />
                <h2 className="font-serif-display text-lg font-bold text-stone-900">
                  Record Provenance
                </h2>
              </div>

              <div className="space-y-3 text-xs">
                {/* Uploaded By */}
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-stone-400" />
                    <span>Uploaded by:</span>
                  </span>
                  <span className="font-semibold text-emerald-950 font-mono text-xs bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {isLoadingUploader ? (
                      'Loading...'
                    ) : uploaderUsername ? (
                      uploaderUsername
                    ) : (
                      'Campus Naturalist'
                    )}
                  </span>
                </div>

                {/* Upload Date */}
                {formattedUploadDate && (
                  <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      <span>Upload date:</span>
                    </span>
                    <span className="font-medium text-stone-800">
                      {formattedUploadDate}
                    </span>
                  </div>
                )}

                {/* Sighting Identifier */}
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-stone-500">Record ID:</span>
                  <span className="font-mono text-[11px] text-stone-400">
                    {plant.id ? `#${plant.id.slice(0, 12)}` : 'Record'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Plant Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif-display text-lg font-bold text-stone-900 leading-tight">
                    Edit Botanical Record
                  </h3>
                  {isFounder && plant.ownerUid !== currentUid && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md inline-block mt-0.5">
                      Website Owner Override
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-stone-200/80 flex items-center justify-center text-stone-400 hover:text-stone-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Immutable Owner Indicator */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 flex items-center justify-between text-[11px] text-stone-500">
                <span className="font-medium">Record Owner (Immutable):</span>
                <span className="font-mono text-stone-700">
                  {plant.ownerUid ? `${plant.ownerUid.slice(0, 16)}...` : 'System Record'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Common Name */}
                <div className="space-y-1">
                  <label className="font-semibold text-stone-700">
                    Common Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editCommonName}
                    onChange={(e) => setEditCommonName(e.target.value)}
                    placeholder="e.g. Tulsi, Neem, Silver Birch"
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 focus:outline-emerald-800 focus:bg-white transition-all text-xs"
                  />
                </div>

                {/* Scientific Name */}
                <div className="space-y-1">
                  <label className="font-semibold text-stone-700">Scientific Name</label>
                  <input
                    type="text"
                    value={editScientificName}
                    onChange={(e) => setEditScientificName(e.target.value)}
                    placeholder="e.g. Ocimum tenuiflorum"
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 focus:outline-emerald-800 focus:bg-white transition-all text-xs font-serif italic"
                  />
                </div>

                {/* Family */}
                <div className="space-y-1">
                  <label className="font-semibold text-stone-700">Family</label>
                  <input
                    type="text"
                    value={editFamily}
                    onChange={(e) => setEditFamily(e.target.value)}
                    placeholder="e.g. Lamiaceae"
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 focus:outline-emerald-800 focus:bg-white transition-all text-xs"
                  />
                </div>

                {/* Genus */}
                <div className="space-y-1">
                  <label className="font-semibold text-stone-700">Genus</label>
                  <input
                    type="text"
                    value={editGenus}
                    onChange={(e) => setEditGenus(e.target.value)}
                    placeholder="e.g. Ocimum"
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 focus:outline-emerald-800 focus:bg-white transition-all text-xs font-serif italic"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="font-semibold text-stone-700">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as Plant['category'])}
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 focus:outline-emerald-800 focus:bg-white transition-all text-xs"
                  >
                    <option value="Tree">Tree</option>
                    <option value="Wildflower">Wildflower</option>
                    <option value="Foliage">Foliage</option>
                    <option value="Herb">Herb</option>
                    <option value="Succulent">Succulent</option>
                  </select>
                </div>

              </div>

              {/* Plant Location & Interactive Map Section */}
              <div className="p-4 rounded-2xl bg-stone-50/70 border border-stone-200/90 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-stone-200/70 pb-2">
                  <div>
                    <label className="font-bold text-xs uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-800" />
                      <span>Observation Location &amp; Coordinates</span>
                    </label>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Drag the marker or tap the map to reposition. Latitude, longitude, and location name update automatically.
                    </p>
                  </div>
                  {isResolvingLocation && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-semibold animate-pulse shrink-0">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-700" />
                      <span>Resolving address...</span>
                    </span>
                  )}
                </div>

                {/* Place Search Box in Edit Modal */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-stone-700 flex items-center gap-1">
                      <Search className="w-3.5 h-3.5 text-stone-400" />
                      <span>Search Landmark or Place (Moves Map &amp; Pin)</span>
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono">OpenStreetMap</span>
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={editPlaceQuery}
                          onChange={(e) => {
                            setEditPlaceQuery(e.target.value);
                            setEditPlaceSearchError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleEditPlaceSearch();
                            }
                          }}
                          placeholder="Search real place or address to jump pin..."
                          className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-200 focus:outline-emerald-800 transition-all"
                        />
                        {editPlaceQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditPlaceQuery('');
                              setEditPlaceResults([]);
                              setEditPlaceSearchError(null);
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleEditPlaceSearch}
                        disabled={isSearchingEditPlaces || !editPlaceQuery.trim()}
                        className="px-3 py-2 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-2xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSearchingEditPlaces ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Finding...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            <span>Find</span>
                          </>
                        )}
                      </button>
                    </div>

                    {editPlaceSearchError && (
                      <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>{editPlaceSearchError}</span>
                      </div>
                    )}

                    {editPlaceResults.length > 0 && (
                      <div className="mt-1.5 bg-white rounded-xl border border-stone-200 shadow-xl divide-y divide-stone-100 max-h-48 overflow-y-auto z-30 relative animate-in fade-in duration-150">
                        {editPlaceResults.map((place) => (
                          <button
                            key={place.placeId}
                            type="button"
                            onClick={() => handleSelectEditPlace(place)}
                            className="w-full text-left px-3 py-2 hover:bg-emerald-50 transition-colors flex items-start gap-2 group cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5 group-hover:scale-110" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-stone-900 truncate">
                                {place.shortName}
                              </div>
                              <div className="text-[10px] text-stone-500 truncate">
                                {place.displayName}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Interactive Map Canvas */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-stone-600">
                    <span className="font-semibold flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-emerald-800" />
                      <span>Interactive Location Map</span>
                    </span>
                    <span className="text-[10px] text-stone-400">
                      Tap map or drag botanical marker
                    </span>
                  </div>

                  <div
                    className={
                      isEditMapFullscreen
                        ? 'fixed inset-0 z-[9999] w-screen h-screen m-0 p-0 rounded-none border-none bg-stone-900 overflow-hidden flex flex-col'
                        : 'relative rounded-2xl overflow-hidden border border-stone-300 shadow-inner'
                    }
                  >
                    <div
                      ref={editMapContainerRef}
                      className={isEditMapFullscreen ? 'w-full h-full flex-1 relative z-0' : 'h-56 sm:h-64 w-full relative z-0'}
                      style={isEditMapFullscreen ? undefined : { minHeight: '220px' }}
                    />

                    {/* Fullscreen Floating Header Badge with Coordinates & Done Button */}
                    {isEditMapFullscreen && (
                      <div className="absolute top-2.5 left-2.5 z-[1000] max-w-[calc(100%-240px)] sm:max-w-md bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl border border-stone-300 shadow-md flex items-center justify-between gap-2.5 text-xs pointer-events-auto animate-in fade-in duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 truncate">
                              {editLocationName || 'Tap map or drag pin to adjust'}
                            </div>
                            <div className="text-[10px] font-mono text-stone-500 truncate">
                              {editLat}°, {editLng}°
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsEditMapFullscreen(false)}
                          className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-all shadow-xs"
                          title="Return to edit form"
                        >
                          Done
                        </button>
                      </div>
                    )}

                    {/* Map / Satellite Toggle & Fullscreen Expand/Collapse */}
                    <div className="absolute top-2.5 right-2.5 z-[1000] pointer-events-auto flex items-center bg-white/95 backdrop-blur-md p-1 rounded-xl border border-stone-300 shadow-md">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSwitchEditMapStyle('map');
                        }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none ${
                          editMapStyle === 'map'
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                        }`}
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
                          handleSwitchEditMapStyle('satellite');
                        }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none ${
                          editMapStyle === 'satellite'
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                        }`}
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
                          setIsEditMapFullscreen((prev) => !prev);
                        }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none ${
                          isEditMapFullscreen
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-950 hover:bg-stone-100/90'
                        }`}
                        title={isEditMapFullscreen ? 'Collapse map to edit modal (Esc)' : 'Expand map to fullscreen'}
                        aria-label={isEditMapFullscreen ? 'Collapse map to edit modal' : 'Expand map to fullscreen'}
                      >
                        {isEditMapFullscreen ? (
                          <Minimize2 className="w-3.5 h-3.5 text-current" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5 text-current" />
                        )}
                        <span>{isEditMapFullscreen ? 'Collapse' : 'Expand'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {resolvedAddressNote && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 flex items-center gap-1.5 animate-in fade-in duration-150">
                    <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>Location updated: <strong className="font-semibold">{resolvedAddressNote}</strong></span>
                  </div>
                )}

                {/* Location Name Field (Auto-updates from map drag/tap, and allows manual edit) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-stone-700">
                      Location Name <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-emerald-800 font-medium">Updates automatically on pin move</span>
                  </div>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-emerald-800 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={editLocationName}
                      onChange={(e) => {
                        setEditLocationName(e.target.value);
                        setResolvedAddressNote(null);
                      }}
                      placeholder="e.g. Berhampore, Campus Botanical Garden, Plot 4"
                      className="w-full pl-8 pr-3 py-2 bg-white rounded-xl border border-stone-200 focus:outline-emerald-800 transition-all text-xs"
                    />
                  </div>
                </div>

                {/* Manual Coordinate Editing (Kept alongside map) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-stone-700">Latitude (-90 to 90)</label>
                      <span className="text-[10px] text-stone-400 font-mono">editable</span>
                    </div>
                    <input
                      type="number"
                      step="any"
                      value={editLat}
                      onChange={(e) => handleEditLatChange(e.target.value)}
                      placeholder="e.g. 24.0988"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-stone-200 focus:outline-emerald-800 transition-all text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-stone-700">Longitude (-180 to 180)</label>
                      <span className="text-[10px] text-stone-400 font-mono">editable</span>
                    </div>
                    <input
                      type="number"
                      step="any"
                      value={editLng}
                      onChange={(e) => handleEditLngChange(e.target.value)}
                      placeholder="e.g. 88.2676"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-stone-200 focus:outline-emerald-800 transition-all text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Biometric & Carbon Measurements (Optional) */}
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-3">
                <div className="flex items-center gap-1.5 text-emerald-950 font-bold">
                  <TreeDeciduous className="w-4 h-4 text-emerald-800" />
                  <span>Biometric &amp; Tree Carbon Measurements (Optional)</span>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Provide trunk circumference to calculate elemental stored carbon (kg C) and CO₂e sequestration (DBH = circumference ÷ 3.1416).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Trunk Circumference (cm) */}
                  <div className="space-y-1">
                    <label className="font-semibold text-stone-700 flex items-center gap-1">
                      <Ruler className="w-3.5 h-3.5 text-emerald-800" />
                      <span>Trunk Circumference (cm)</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="1600"
                      value={editTrunkCircumference}
                      onChange={(e) => setEditTrunkCircumference(e.target.value)}
                      placeholder="e.g. 102"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-stone-200 focus:outline-emerald-800 transition-all text-xs font-mono"
                    />
                    {editTrunkCircumference && !isNaN(parseFloat(editTrunkCircumference)) && parseFloat(editTrunkCircumference) > 0 ? (
                      <span className="text-[10px] text-emerald-800 font-medium block">
                        DBH ≈ {(parseFloat(editTrunkCircumference) / 3.1416).toFixed(1)} cm (used for allometric carbon calculations)
                      </span>
                    ) : (
                      <span className="text-[10px] text-stone-400 block">Measured at breast height (~1.37m), DBH = circumference ÷ 3.1416</span>
                    )}
                  </div>

                  {/* Tree Height (m) */}
                  <div className="space-y-1">
                    <label className="font-semibold text-stone-700">Tree Height (meters)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="150"
                      value={editTreeHeight}
                      onChange={(e) => setEditTreeHeight(e.target.value)}
                      placeholder="e.g. 12.0"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-stone-200 focus:outline-emerald-800 transition-all text-xs font-mono"
                    />
                    <span className="text-[10px] text-stone-400 block">Total ground-to-crown height</span>
                  </div>

                  {/* Tree Age (years) */}
                  <div className="space-y-1">
                    <label className="font-semibold text-stone-700">Estimated Tree Age (years)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      max="5000"
                      value={editTreeAge}
                      onChange={(e) => setEditTreeAge(e.target.value)}
                      placeholder="e.g. 18"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-stone-200 focus:outline-emerald-800 transition-all text-xs font-mono"
                    />
                    <span className="text-[10px] text-stone-400 block">Enables annual CO₂e absorption rate</span>
                  </div>

                  {/* Measurement Date */}
                  <div className="space-y-1">
                    <label className="font-semibold text-stone-700 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      <span>Biometric Measurement Date</span>
                    </label>
                    <input
                      type="date"
                      max={new Date().toISOString().split('T')[0]}
                      value={editMeasurementDate}
                      onChange={(e) => setEditMeasurementDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-xl border border-stone-200 focus:outline-emerald-800 transition-all text-xs font-mono"
                    />
                    <span className="text-[10px] text-stone-400 block">Date of field survey</span>
                  </div>
                </div>
              </div>

              {/* Photo Image URL */}
              <div className="space-y-1">
                <label className="font-semibold text-stone-700">Photo Image URL</label>
                <input
                  type="url"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 focus:outline-emerald-800 focus:bg-white transition-all text-xs"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-semibold text-stone-700">Botanical Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Describe specimen characteristics, leaves, flowers, or habitat..."
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 focus:outline-emerald-800 focus:bg-white transition-all text-xs resize-none"
                />
              </div>

              {/* Student Tip */}
              <div className="space-y-1">
                <label className="font-semibold text-stone-700">Student Field Tip</label>
                <textarea
                  rows={2}
                  value={editStudentTip}
                  onChange={(e) => setEditStudentTip(e.target.value)}
                  placeholder="Field identification tip for student naturalists..."
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 focus:outline-emerald-800 focus:bg-white transition-all text-xs resize-none"
                />
              </div>

              {/* Form Footer Buttons */}
              <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif-display text-lg font-bold text-stone-900">
                  Delete Plant Observation?
                </h3>
                <p className="text-xs text-stone-500">
                  This action permanently removes the record.
                </p>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-stone-900">{plant.commonName || 'this plant'}</strong>?
              This botanical sighting will be removed from community records and the Explore Map.
            </p>

            {isFounder && plant.ownerUid !== currentUid && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <span className="font-bold">Website Owner Notice:</span> You are deleting this observation using founder permissions.
              </div>
            )}

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Record</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
