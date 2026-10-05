import React, { useEffect } from 'react';
import { Plant, Coordinates } from '../types/plant';
import { X, MapPin, Sun, Droplets, Calendar, AlertTriangle, Sparkles, BookOpen, Compass, Navigation } from 'lucide-react';
import { formatDistance } from '../utils/geoUtils';
import { DEMO_CAMPUS_CENTER } from '../data/samplePlants';

interface PlantDetailModalProps {
  plant: Plant | null;
  onClose: () => void;
  onShowOnMap: (plant: Plant) => void;
  userLocation?: Coordinates | null;
}

export const PlantDetailModal: React.FC<PlantDetailModalProps> = ({
  plant,
  onClose,
  onShowOnMap,
  userLocation,
}) => {
  // Prevent background scroll when modal open & listen for Escape
  useEffect(() => {
    if (!plant) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [plant, onClose]);

  if (!plant) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="relative bg-white rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-stone-700 hover:text-stone-950 flex items-center justify-center shadow-md transition-all cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header Media */}
        <div className="relative aspect-[16/9] sm:aspect-[21/9] bg-stone-100 overflow-hidden">
          <img
            src={plant.imageUrl}
            alt={plant.commonName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Explicit DEMO DATA label */}
          <div className="absolute top-4 left-4 z-10 bg-amber-500/90 text-stone-950 text-[10px] font-bold px-2.5 py-1 rounded-md backdrop-blur-xs tracking-wider uppercase border border-amber-400">
            DEMO DATA · Sample Record
          </div>

          <div className="absolute bottom-4 left-6 right-6 text-white">
            <div className="flex items-center gap-2 text-xs text-emerald-300 font-medium mb-1">
              <span>{plant.category}</span>
              <span aria-hidden="true">·</span>
              <span>Family: {plant.family}</span>
              <span aria-hidden="true">·</span>
              <span>{plant.difficulty} Level</span>
            </div>
            <h2 className="font-serif-display text-2xl sm:text-3xl font-bold tracking-tight">
              {plant.commonName}
            </h2>
            <p className="text-sm italic text-stone-200">{plant.scientificName}</p>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Overview Prose */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
              Botanical Overview
            </h4>
            <p className="text-sm text-stone-700 leading-relaxed">
              {plant.description}
            </p>
          </div>

          {/* Student Field Tip Callout */}
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <span>Student Field Identification Note</span>
            </div>
            <p className="text-xs text-stone-700 leading-relaxed">
              {plant.studentTip}
            </p>
          </div>

          {/* Identification Keys (Botanical anatomy) */}
          <div>
            <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
              Diagnostic Morphological Keys
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-stone-400 block mb-0.5">Leaf Morphology:</span>
                <span className="font-medium text-stone-800">
                  {plant.identificationKeys.leafShape}
                </span>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-stone-400 block mb-0.5">Phyllotaxy (Arrangement):</span>
                <span className="font-medium text-stone-800">
                  {plant.identificationKeys.leafArrangement}
                </span>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-stone-400 block mb-0.5">Flower / Spore Structure:</span>
                <span className="font-medium text-stone-800">
                  {plant.identificationKeys.flowerColor}
                </span>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-stone-400 block mb-0.5">Growth Habit:</span>
                <span className="font-medium text-stone-800">
                  {plant.identificationKeys.growthHabit}
                </span>
              </div>
            </div>
          </div>

          {/* Habitat, Sunlight, Water Grid */}
          <div className="grid grid-cols-3 gap-3 text-xs text-center border-t border-b border-stone-100 py-4">
            <div>
              <Sun className="w-4 h-4 mx-auto mb-1 text-amber-600" />
              <div className="text-stone-400 text-[11px]">Sunlight</div>
              <div className="font-semibold text-stone-800 mt-0.5">{plant.sunExposure}</div>
            </div>
            <div>
              <Droplets className="w-4 h-4 mx-auto mb-1 text-sky-600" />
              <div className="text-stone-400 text-[11px]">Water Needs</div>
              <div className="font-semibold text-stone-800 mt-0.5">{plant.waterNeeds}</div>
            </div>
            <div>
              <Calendar className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
              <div className="text-stone-400 text-[11px]">Bloom Season</div>
              <div className="font-semibold text-stone-800 mt-0.5">{plant.bloomSeason}</div>
            </div>
          </div>

          {/* Toxicity Notice if present */}
          {plant.identificationKeys.toxicityWarning && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Botanical Safety Advisory: </span>
                {plant.identificationKeys.toxicityWarning}
              </div>
            </div>
          )}

          {/* Location & Map Trigger */}
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-800" />
                <span>{plant.locationName}</span>
                <span className="text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200 flex items-center gap-1">
                  <Navigation className="w-2.5 h-2.5" />
                  {userLocation
                    ? formatDistance(userLocation, plant.coordinates)
                    : formatDistance(DEMO_CAMPUS_CENTER, plant.coordinates)}
                  {userLocation ? ' away' : ' (demo)'}
                </span>
              </div>
              <div className="text-[11px] text-stone-500 mt-1">
                {plant.demoLocationDescription}
              </div>
            </div>

            <button
              onClick={() => {
                onShowOnMap(plant);
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Locate on Map</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
