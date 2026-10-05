import React, { useState, useEffect } from 'react';
import { Plant, Coordinates } from '../types/plant';
import {
  INaturalistObservationRecord,
  INaturalistTaxon,
  searchINaturalistTaxa,
  fetchObservationsByTaxon,
} from '../services/inaturalistService';
import {
  Search,
  ArrowLeft,
  AlertCircle,
  Info,
  ExternalLink,
  Navigation,
  Globe,
  Loader2,
  MapPin,
  Calendar,
  Layers,
  Database,
  Leaf,
  Sparkles,
} from 'lucide-react';
import { calculateDistanceKm, formatDistance } from '../utils/geoUtils';

interface SearchResultsViewProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onShowOnMapWithTaxon?: (species: any, records: INaturalistObservationRecord[]) => void;
  onBackToHome: () => void;
  userLocation?: Coordinates | null;
  savedPlants?: Plant[];
  onSelectPlant?: (plant: Plant) => void;
}

export const SearchResultsView: React.FC<SearchResultsViewProps> = ({
  searchQuery,
  setSearchQuery,
  onSearch,
  onShowOnMapWithTaxon,
  onBackToHome,
  userLocation,
  savedPlants = [],
  onSelectPlant,
}) => {
  const [taxonResult, setTaxonResult] = useState<INaturalistTaxon | null>(null);
  const [occurrences, setOccurrences] = useState<INaturalistObservationRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingStep, setLoadingStep] = useState<string>('Finding species...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Near me radius option for search view: 'all' | 1 | 5 | 10 | 25 | 50
  const [radiusKm, setRadiusKm] = useState<'all' | 1 | 5 | 10 | 25 | 50>('all');

  // Trigger iNaturalist search whenever searchQuery changes
  useEffect(() => {
    let isCancelled = false;

    async function executeQuery() {
      const q = searchQuery.trim();
      if (!q) {
        setIsLoading(false);
        setTaxonResult(null);
        setOccurrences([]);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      setLoadingStep('Searching for species on iNaturalist...');

      try {
        // Step 1: Search iNaturalist Taxa
        const taxa = await searchINaturalistTaxa(q);

        if (isCancelled) return;

        if (taxa.length === 0) {
          setIsLoading(false);
          setTaxonResult(null);
          setOccurrences([]);
          setErrorMessage(
            `No plant species found for "${q}". Try searching by scientific binomial (e.g. "Ocimum tenuiflorum", "Mimosa pudica").`
          );
          return;
        }

        const primaryTaxon = taxa[0];
        setTaxonResult(primaryTaxon);

        // Step 2: Fetch public observations from iNaturalist
        setLoadingStep(`Retrieving public observations for ${primaryTaxon.name}...`);
        const records = await fetchObservationsByTaxon(primaryTaxon.id, 60);

        if (isCancelled) return;

        if (records.length === 0) {
          setErrorMessage('No georeferenced public observations found on iNaturalist for this species.');
        } else {
          setOccurrences(records);
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error('[SearchResultsView] iNaturalist lookup error:', err);
        setErrorMessage('Unable to load observations. Please check your network and try again.');
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    executeQuery();

    return () => {
      isCancelled = true;
    };
  }, [searchQuery]);

  // Compute matching saved plant records from herbarium
  const matchingSavedPlants = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !savedPlants || savedPlants.length === 0) return [];
    return savedPlants.filter((plant) => {
      const matchCommon = (plant.commonName || '').toLowerCase().includes(q);
      const matchScientific = (plant.scientificName || '').toLowerCase().includes(q);
      const matchFamily = (plant.family || '').toLowerCase().includes(q);
      const matchGenus = (plant.genus || '').toLowerCase().includes(q);
      return matchCommon || matchScientific || matchFamily || matchGenus;
    });
  }, [searchQuery, savedPlants]);

  // Compute filtered occurrences if user filtered by distance
  const filteredOccurrences = React.useMemo(() => {
    if (!userLocation || radiusKm === 'all') {
      return occurrences;
    }

    return occurrences.filter((rec) => {
      const dist = calculateDistanceKm(userLocation, rec.coordinates);
      return dist <= radiusKm;
    });
  }, [occurrences, userLocation, radiusKm]);

  return (
    <section className="py-8 sm:py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Top Breadcrumb & Live iNaturalist Badge */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-900 transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Homepage</span>
        </button>

        {/* Real iNaturalist Data Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs font-semibold">
          <Globe className="w-3.5 h-3.5 text-emerald-700" />
          <span>REAL DATA — Public observations from iNaturalist</span>
        </div>
      </div>

      {/* Header and Search Refinement Box */}
      <div className="space-y-4">
        <div>
          <div className="text-xs font-semibold text-emerald-800 tracking-wider uppercase mb-1">
            Global Citizen Science Botanical Observations
          </div>
          <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
            Species Search: <span className="italic text-emerald-900">"{searchQuery}"</span>
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Official taxonomic identification and verified field occurrences from iNaturalist.
          </p>
        </div>

        {/* Compact Search Bar */}
        <form onSubmit={onSearch} className="max-w-2xl">
          <div className="relative flex items-center bg-white rounded-2xl border border-stone-300 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-600/10 shadow-xs transition-all">
            <div className="pl-4 text-stone-400 pointer-events-none">
              <Search className="w-4 h-4 text-emerald-800" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search botanical species (e.g. Tulsi, Mimosa pudica, Neem, Mango)..."
              className="w-full py-3 pl-3 pr-3 text-sm text-stone-900 bg-transparent placeholder-stone-400 focus:outline-none"
            />
            <button
              type="submit"
              className="m-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Search Plant
            </button>
          </div>
        </form>
      </div>

      {/* Initial Browse / Discover State when no query is typed */}
      {!isLoading && !searchQuery.trim() && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 text-xs font-semibold uppercase tracking-wider border border-emerald-200">
                <Leaf className="w-3.5 h-3.5 text-emerald-700" />
                <span>Search Botanical Species &amp; Global Observations</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-serif-display font-bold text-stone-900">
                Search Plant Species Worldwide or on Campus
              </h2>
              <p className="text-xs text-stone-600 max-w-2xl leading-relaxed">
                Enter a common name (like "Tulsi", "Mimosa pudica", "Neem", "Mango") or scientific binomial to explore taxonomic profiles and verified field occurrences from iNaturalist.
              </p>
            </div>

            {/* Popular Searches */}
            <div className="space-y-3 pt-3 border-t border-stone-100">
              <div className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                <span>Popular Botanical Searches:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '🌿 Tulsi (Holy Basil)', query: 'Tulsi' },
                  { label: '🌱 Touch-me-not (Mimosa)', query: 'Mimosa pudica' },
                  { label: '🌳 Neem Tree', query: 'Neem' },
                  { label: '🥭 Mango Tree', query: 'Mango' },
                  { label: '🌺 Hibiscus', query: 'Hibiscus rosa-sinensis' },
                  { label: '🍌 Banana (Musa)', query: 'Musa' },
                  { label: '🥥 Coconut Palm', query: 'Cocos nucifera' },
                  { label: '🪻 Lavender', query: 'Lavandula' },
                  { label: '🍃 Monstera Deliciosa', query: 'Monstera deliciosa' },
                ].map((item) => (
                  <button
                    key={item.query}
                    type="button"
                    onClick={() => setSearchQuery(item.query)}
                    className="px-3 py-1.5 bg-stone-50 hover:bg-emerald-50 hover:text-emerald-950 text-stone-700 text-xs rounded-xl border border-stone-200 hover:border-emerald-300 transition-all cursor-pointer font-medium shadow-2xs"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="p-12 text-center bg-white rounded-3xl border border-stone-200 shadow-xs space-y-4 max-w-lg mx-auto">
          <Loader2 className="w-9 h-9 text-emerald-800 animate-spin mx-auto" />
          <div className="space-y-1">
            <div className="text-base font-semibold text-stone-900">{loadingStep}</div>
            <div className="text-xs text-stone-500">
              Querying iNaturalist public botanical records...
            </div>
          </div>
        </div>
      )}

      {/* Error or Not Found State */}
      {!isLoading && errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 sm:p-8 text-center max-w-xl mx-auto space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="font-serif-display text-lg font-bold text-rose-950">
              Unable to load observations
            </h3>
            <p className="text-xs text-rose-800 leading-relaxed">{errorMessage}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('Tulsi');
              }}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Try Searching "Tulsi"
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('Mimosa pudica');
              }}
              className="px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              Try "Mimosa pudica"
            </button>
          </div>
        </div>
      )}

      {/* Matching Saved Plants from Herbarium Database */}
      {matchingSavedPlants.length > 0 && onSelectPlant && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <Leaf className="w-4 h-4 text-emerald-800" />
              <h3 className="font-serif-display text-lg font-bold text-stone-900">
                Saved Plant Records ({matchingSavedPlants.length})
              </h3>
            </div>
            <span className="text-xs text-stone-500 font-medium">Click to open full profile</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {matchingSavedPlants.map((plant) => (
              <div
                key={plant.id}
                onClick={() => onSelectPlant(plant)}
                className="group p-3 rounded-2xl bg-stone-50 hover:bg-emerald-50/60 border border-stone-200 hover:border-emerald-300 transition-all cursor-pointer flex items-center gap-3.5"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-stone-200 shrink-0">
                  {plant.imageUrl ? (
                    <img
                      src={plant.imageUrl}
                      alt={plant.commonName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">🌿</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="font-serif-display font-bold text-stone-900 text-sm group-hover:text-emerald-950 truncate">
                    {plant.commonName}
                  </h4>
                  <p className="text-xs italic text-stone-500 truncate">
                    {plant.scientificName || plant.family}
                  </p>
                  <p className="text-[11px] text-stone-400 truncate mt-0.5">
                    📍 {plant.locationName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved Species Card */}
      {!isLoading && taxonResult && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-emerald-800 font-semibold uppercase tracking-wider">
                <span>Taxon Match</span>
                <span>·</span>
                <span className="text-emerald-700 font-mono">iNaturalist #{taxonResult.id}</span>
              </div>
              <h2 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900">
                {taxonResult.preferred_common_name || taxonResult.name}
              </h2>
              <div className="text-sm italic text-stone-600 font-serif mt-0.5">
                {taxonResult.name}
              </div>
            </div>

            {onShowOnMapWithTaxon && (
              <button
                type="button"
                onClick={() => onShowOnMapWithTaxon(taxonResult, occurrences)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <MapPin className="w-4 h-4 text-emerald-300" />
                <span>View {occurrences.length} Observations on Map</span>
              </button>
            )}
          </div>

          {/* Mandatory Disclaimer (Requirement 8) */}
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <span>⚠️</span>
            <span>
              <strong>Scientific Notice:</strong> This is a recorded observation, not a guarantee that the plant is currently present.
            </span>
          </div>

          {/* Observations Summary Row & Radius Filter */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div className="text-xs text-stone-600">
              <strong className="text-stone-900">{occurrences.length}</strong> public observations loaded directly from iNaturalist.
            </div>

            {/* Near Me Radius Filter */}
            {userLocation && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-500 font-medium">Within radius:</span>
                <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
                  {(['all', 1, 5, 10, 25, 50] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRadiusKm(r)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        radiusKm === r
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'text-stone-600 hover:text-stone-950'
                      }`}
                    >
                      {r === 'all' ? 'All' : `${r} km`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Observation Grid */}
      {!isLoading && filteredOccurrences.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif-display text-xl font-bold text-stone-900">
              Public observations from iNaturalist ({filteredOccurrences.length})
            </h3>
            <div className="text-xs text-stone-400">
              Data source: <a href="https://www.inaturalist.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-800">iNaturalist</a>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredOccurrences.map((rec) => {
              const distLabel = userLocation ? formatDistance(userLocation, rec.coordinates) : null;

              return (
                <article
                  key={rec.id}
                  className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Media Image */}
                    <div className="relative aspect-[16/10] bg-stone-100 overflow-hidden">
                      {rec.imageUrl ? (
                        <img
                          src={rec.imageUrl}
                          alt={rec.scientificName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-stone-100 text-stone-400 p-4 text-center">
                          <span className="text-2xl mb-1">🌿</span>
                          <span className="text-[11px]">No observation photo</span>
                        </div>
                      )}

                      {/* Real Data Badge */}
                      <div className="absolute top-2 left-2 bg-emerald-950/90 text-white text-[9px] font-bold px-2 py-0.5 rounded backdrop-blur-xs uppercase tracking-wider">
                        iNaturalist
                      </div>

                      {distLabel && (
                        <div className="absolute top-2 right-2 bg-stone-900/85 text-white text-[11px] font-medium px-2 py-0.5 rounded backdrop-blur-xs flex items-center gap-1 shadow-xs">
                          <Navigation className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{distLabel}</span>
                        </div>
                      )}
                    </div>

                    {/* Content Details */}
                    <div className="p-4 space-y-2">
                      <div className="text-[11px] font-mono text-stone-400">
                        Record #{rec.observationId}
                      </div>

                      <h4 className="font-serif-display text-base font-bold text-stone-900 leading-snug">
                        {rec.commonName || rec.scientificName}
                      </h4>
                      {rec.commonName && (
                        <div className="text-xs italic text-stone-500">
                          {rec.scientificName}
                        </div>
                      )}

                      <div className="space-y-1 text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-800 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{rec.locality}</span>
                        </div>

                        {rec.eventDate && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>Observed: {rec.eventDate}</span>
                          </div>
                        )}

                        <div className="text-[11px] text-stone-500 pt-0.5 truncate">
                          Dataset: Public observations from iNaturalist
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-4 pt-0 space-y-2">
                    <a
                      href={rec.observationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>View on iNaturalist</span>
                      <ExternalLink className="w-3.5 h-3.5 text-stone-500" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* No observations within selected radius */}
      {!isLoading && occurrences.length > 0 && filteredOccurrences.length === 0 && (
        <div className="p-8 text-center bg-white rounded-3xl border border-stone-200 space-y-4 max-w-lg mx-auto">
          <AlertCircle className="w-10 h-10 text-amber-700 mx-auto" />
          <div className="space-y-1">
            <h4 className="font-serif-display text-lg font-bold text-stone-900">
              No observations found within this radius.
            </h4>
            <p className="text-xs text-stone-500">
              There are {occurrences.length} records available globally, but none within {radiusKm} km of your device location.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRadiusKm('all')}
            className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Search a wider area
          </button>
        </div>
      )}

      {/* Attribution Footer */}
      <div className="text-center pt-4 text-xs text-stone-500">
        Public observations from <a href="https://www.inaturalist.org/" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-emerald-900 hover:text-emerald-950">iNaturalist</a> · Free and open citizen science biodiversity data.
      </div>
    </section>
  );
};
