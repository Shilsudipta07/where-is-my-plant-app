/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Plant, ActiveTab, Coordinates } from './types/plant';
import { INITIAL_PLANTS, DEMO_CAMPUS_CENTER } from './data/samplePlants';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { LazyExploreMap as ExploreMap, DeferredExploreMap } from './components/DeferredExploreMap';
import { PlantCatalog } from './components/PlantCatalog';
import { Footer } from './components/Footer';
import { getPlantsFromFirestore } from './services/firestoreService';
import { PlantOccurrenceRecord, SpeciesResolutionResult } from './services/gbifService';
import { INaturalistObservationRecord, INaturalistTaxon, CommunityObservation } from './types/plant';
import { Sparkles, ArrowRight, Compass, Plus, Check, ArrowLeft, Camera, BookOpen } from 'lucide-react';
import { readRoute, routePath } from './utils/routes';
import { applyPageSeo, getPageSeo } from './utils/seo';

const STORAGE_KEY = 'where_is_my_plant_items_v2';
const AboutView = lazy(() => import('./components/AboutView').then(m => ({ default: m.AboutView })));
const SearchResultsView = lazy(() => import('./components/SearchResultsView').then(m => ({ default: m.SearchResultsView })));
const IdentifyPlantPage = lazy(() => import('./components/IdentifyPlantPage').then(m => ({ default: m.IdentifyPlantPage })));
const SubmitPlantPage = lazy(() => import('./components/SubmitPlantPage').then(m => ({ default: m.SubmitPlantPage })));
const PlantDetailsPage = lazy(() => import('./components/PlantDetailsPage').then(m => ({ default: m.PlantDetailsPage })));
const CarbonDashboard = lazy(() => import('./components/CarbonDashboard').then(m => ({ default: m.CarbonDashboard })));
const AccountView = lazy(() => import('./components/AccountView').then(m => ({ default: m.AccountView })));
const PlantDetailModal = lazy(() => import('./components/PlantDetailModal').then(m => ({ default: m.PlantDetailModal })));
const AddPlantModal = lazy(() => import('./components/AddPlantModal').then(m => ({ default: m.AddPlantModal })));
const HowToSubmitModal = lazy(() => import('./components/HowToSubmitModal').then(m => ({ default: m.HowToSubmitModal })));

export default function App() {
  const [activeTab, updateActiveTab] = useState<ActiveTab>(() => readRoute(window.location.pathname).tab);
  const [isNotFound, setIsNotFound] = useState(() => !readRoute(window.location.pathname).isValid);
  const [isLoadingPlants, setIsLoadingPlants] = useState(true);
  const [isNearMeActive, setIsNearMeActive] = useState<boolean>(false);
  const [isHowToSubmitOpen, setIsHowToSubmitOpen] = useState<boolean>(false);
  const [plants, setPlants] = useState<Plant[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const combined = new Map<string, Plant>(INITIAL_PLANTS.map(plant => [plant.id, plant]));
          parsed.forEach((plant: Plant) => {
            const builtIn = INITIAL_PLANTS.find(item => item.id === plant.id);
            combined.set(plant.id, builtIn && !plant.isUserAdded ? { ...plant, imageUrl: builtIn.imageUrl } : plant);
          });
          const seed = document.getElementById('page-plant')?.textContent;
          if (seed) { const plant = JSON.parse(seed) as Plant; combined.set(plant.id, plant); }
          return [...combined.values()];
        }
      }
    } catch (e) {
      console.warn('[App] Could not load saved plants from localStorage:', e);
    }
    try {
      const seed = document.getElementById('page-plant')?.textContent;
      if (seed) { const plant = JSON.parse(seed) as Plant; return [...INITIAL_PLANTS.filter(item => item.id !== plant.id), plant]; }
    } catch { /* Ignore invalid page seed and use the built-in catalog. */ }
    return INITIAL_PLANTS;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlantModal, setSelectedPlantModal] = useState<Plant | null>(null);
  const [selectedPlantDetails, setSelectedPlantDetails] = useState<Plant | null>(() => {
    const { plantId } = readRoute(window.location.pathname);
    return plants.find((plant) => plant.id === plantId) || null;
  });
  const [selectedMapPlant, setSelectedMapPlant] = useState<Plant | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [hasLoadedAddModal, setHasLoadedAddModal] = useState(false);
  const [hasLoadedHowToModal, setHasLoadedHowToModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedCommunityObservation, setSelectedCommunityObservation] = useState<CommunityObservation | null>(null);

  // iNaturalist Map State
  const [activeInatSearch, setActiveInatSearch] = useState<string>('');
  const [activeInatTaxon, setActiveInatTaxon] = useState<INaturalistTaxon | null>(null);
  const [activeInatRecords, setActiveInatRecords] = useState<INaturalistObservationRecord[]>([]);

  // GBIF Map State (Compatibility)
  const [activeGbifSearch, setActiveGbifSearch] = useState<string>('');
  const [activeGbifSpecies, setActiveGbifSpecies] = useState<SpeciesResolutionResult | null>(null);
  const [activeGbifRecords, setActiveGbifRecords] = useState<PlantOccurrenceRecord[]>([]);

  useEffect(() => {
    if (isAddModalOpen) setHasLoadedAddModal(true);
    if (isHowToSubmitOpen) setHasLoadedHowToModal(true);
  }, [isAddModalOpen, isHowToSubmitOpen]);

  const setActiveTab = (tab: ActiveTab, plantId?: string) => {
    setIsNotFound(false);
    const path = routePath(tab, plantId || selectedPlantDetails?.id);
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    updateActiveTab(tab);
  };

  useEffect(() => {
    const restoreRoute = () => {
      const route = readRoute(window.location.pathname);
      updateActiveTab(route.tab);
      setIsNotFound(!route.isValid);
      setSelectedPlantDetails(plants.find((plant) => plant.id === route.plantId) || null);
      setIsNearMeActive(false);
    };
    window.addEventListener('popstate', restoreRoute);
    // Resolve direct links after saved observations finish loading.
    const route = readRoute(window.location.pathname);
    if (route.plantId) {
      setSelectedPlantDetails(plants.find((plant) => plant.id === route.plantId) || null);
    }
    return () => window.removeEventListener('popstate', restoreRoute);
  }, [plants]);

  useEffect(() => {
    const seo = getPageSeo(activeTab, selectedPlantDetails, window.location.pathname);
    if (isNotFound) { seo.title = 'Page Not Found | WHERE IS MY PLANT'; seo.robots = 'noindex, follow'; }
    // A Firestore record may still arrive; do not mark a loading page as missing.
    if (activeTab === 'plant-details' && !selectedPlantDetails && isLoadingPlants) seo.robots = 'index, follow';
    applyPageSeo(seo);
  }, [activeTab, selectedPlantDetails, isNotFound, isLoadingPlants]);

  // Save to localStorage when plants state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
    } catch (e) {
      console.warn('[App] Could not save plants to localStorage:', e);
    }
  }, [plants]);

  // Load user-submitted plants from Firestore so they appear across the catalog & details
  useEffect(() => {
    let isCancelled = false;
    getPlantsFromFirestore()
      .then((firestorePlants) => {
        if (isCancelled || !firestorePlants || firestorePlants.length === 0) return;
        setPlants((prev) => {
          const map = new Map<string, Plant>();
          // Keep existing / initial plants
          prev.forEach((p) => map.set(p.id, p));
          // Add or update with Firestore plants
          firestorePlants.forEach((p) => map.set(p.id, p));
          return Array.from(map.values());
        });
      })
      .catch((err) => {
        console.warn('[App] Could not fetch firestore plants:', err);
      })
      .finally(() => { if (!isCancelled) setIsLoadingPlants(false); });

    return () => {
      isCancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  /**
   * Search Demo Plant Database:
   * - Matches common name or scientific name (case-insensitive substring match)
   * - Shows search results view
   */
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setActiveTab('search-results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Compute search results across demo plants
  const searchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return plants.filter((plant) => {
      const matchCommon = plant.commonName.toLowerCase().includes(q);
      const matchScientific = plant.scientificName.toLowerCase().includes(q);
      return matchCommon || matchScientific;
    });
  }, [plants, searchQuery]);

  const handleFindNearMe = () => {
    setIsNearMeActive(true);
    setLocationError(null);
    setActiveTab('map');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenAddPlant = () => {
    setActiveTab('add');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenMap = () => {
    if (activeTab === 'home') {
      const mapSection = document.getElementById('explore-map');
      if (mapSection) {
        mapSection.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    setActiveTab('map');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickSelectPlant = (plantId: string) => {
    const found = plants.find((p) => p.id === plantId);
    if (found) {
      handleOpenPlantDetails(found);
    }
  };

  const handleOpenPlantDetails = (plant: Plant) => {
    setSelectedPlantDetails(plant);
    setActiveTab('plant-details', plant.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackFromPlantDetails = () => {
    setSelectedPlantDetails(null);
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleShowOnMap = (plant: Plant) => {
    if (!plant) return;
    const coords = plant.coordinates;
    const hasValidCoords = Boolean(
      coords &&
      typeof coords.lat === 'number' &&
      typeof coords.lng === 'number' &&
      !isNaN(coords.lat) &&
      !isNaN(coords.lng) &&
      coords.lat >= -90 &&
      coords.lat <= 90 &&
      coords.lng >= -180 &&
      coords.lng <= 180
    );

    if (!hasValidCoords) {
      showToast(`"${plant.commonName || 'Plant'}" has no saved coordinates. Opening Explore Map.`);
      setSelectedMapPlant({ ...plant, coordinates: undefined as any });
      setIsNearMeActive(false);
      setActiveTab('map');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Pass a fresh reference so that map effects always re-center even if re-selecting the same plant
    setSelectedMapPlant({ ...plant });
    setIsNearMeActive(false);
    setActiveTab('map');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddPlant = (newPlant: Plant) => {
    setPlants((prev) => [newPlant, ...prev]);
    showToast(`"${newPlant.commonName}" added to the botanical records!`);
  };

  const handleViewCommunityObservationOnMap = (obs: CommunityObservation) => {
    setSelectedCommunityObservation(obs);
    setIsNearMeActive(false);
    setActiveTab('map');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 selection:bg-emerald-100 selection:text-emerald-950 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 text-white px-4 py-2.5 rounded-xl shadow-lg border border-stone-700 text-xs font-medium flex items-center gap-2 animate-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Global Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setIsNearMeActive(false);
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onFindNearMe={handleFindNearMe}
        isNearMeActive={isNearMeActive}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        <Suspense fallback={<p className="p-12 text-center" role="status">Loading page…</p>}>
        {isNotFound ? <section className="max-w-7xl mx-auto p-12"><h1>Page not found</h1><a href="/">Back to Home</a></section> : <>
        {activeTab === 'home' && (
          <>
            {/* Required Homepage Hero */}
            <HeroSection
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              sampleCount={plants?.length ?? 0}
              onSearch={handleSearchSubmit}
              onFindNearMe={handleFindNearMe}
              onOpenAddPlant={handleOpenAddPlant}
              onOpenHowToSubmit={() => setIsHowToSubmitOpen(true)}
              onOpenMap={handleOpenMap}
              onQuickSelectPlant={handleQuickSelectPlant}
            />

            {/* Required Homepage Explore Map Section */}
            <DeferredExploreMap
              plants={plants}
              selectedPlant={selectedMapPlant}
              selectedPlantId={selectedMapPlant?.id}
              selectedPlantCoordinates={selectedMapPlant?.coordinates}
              onSelectPlant={(plant) => handleOpenPlantDetails(plant)}
              userLocation={userLocation}
              onLocateUser={handleFindNearMe}
              isLocating={isLocating}
              locationError={locationError}
              onClearLocationError={() => setLocationError(null)}
              initialInatSearch={activeInatSearch}
              initialInatRecords={activeInatRecords}
              initialInatTaxon={activeInatTaxon}
              initialGbifSearch={activeGbifSearch}
              initialGbifRecords={activeGbifRecords}
              initialGbifSpecies={activeGbifSpecies}
              selectedCommunityObservation={selectedCommunityObservation}
              onSelectCommunityObservation={setSelectedCommunityObservation}
              onUpdateUserLocation={(coords) => {
                setUserLocation(coords);
                setIsLocating(false);
              }}
              autoStartTracking={isNearMeActive}
              isActive={activeTab === 'home'}
            />

            {/* Botanical Catalog Grid */}
            <PlantCatalog
              plants={plants}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSelectPlant={(plant) => handleOpenPlantDetails(plant)}
              onShowOnMap={handleShowOnMap}
              userLocation={userLocation}
            />

            {/* Quick Action Banner for Students */}
            <section className="bg-emerald-900 text-white py-12 border-t border-b border-emerald-800">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-1 text-center md:text-left">
                    <div className="text-xs uppercase tracking-wider text-emerald-300 font-semibold flex items-center justify-center md:justify-start gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Take Learning Into The Field</span>
                    </div>
                    <h3 className="font-serif-display text-2xl sm:text-3xl font-bold">
                      Spotted an unfamiliar tree or wildflower on campus?
                    </h3>
                    <p className="text-xs text-stone-300 max-w-xl">
                      Explore real biodiversity observations on the map or contribute your sighting to help fellow students map local flora.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={handleOpenMap}
                      className="px-5 py-2.5 bg-white text-emerald-950 hover:bg-stone-100 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Compass className="w-4 h-4 text-emerald-800" />
                      <span>Explore Map</span>
                    </button>
                    <button
                      onClick={handleOpenAddPlant}
                      className="px-5 py-2.5 bg-purple-900 hover:bg-purple-950 text-white border border-purple-800 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4 text-purple-200" />
                      <span>Submit a Plant</span>
                    </button>
                    <button
                      onClick={() => setIsHowToSubmitOpen(true)}
                      className="px-4.5 py-2.5 bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-100 hover:text-white border border-emerald-500/40 hover:border-emerald-400 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2"
                      title="Learn how to record and submit a plant observation"
                    >
                      <BookOpen className="w-4 h-4 text-emerald-300" />
                      <span>How to Submit Plant</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'explore' && (
          <div className="pt-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
              <button
                onClick={() => {
                  setIsNearMeActive(false);
                  setActiveTab('home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-900 bg-white hover:bg-stone-100 border border-stone-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs group"
              >
                <ArrowLeft className="w-4 h-4 text-stone-500 group-hover:-translate-x-0.5 transition-transform" />
                <span>Back to Home</span>
              </button>
            </div>
            <PlantCatalog
              plants={plants}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSelectPlant={(plant) => setSelectedPlantModal(plant)}
              onShowOnMap={(plant) => {
                handleShowOnMap(plant);
              }}
              userLocation={userLocation}
            />
          </div>
        )}

        {activeTab === 'map' && (
          <div className="pt-4 animate-in fade-in duration-150">
            {/* Consistent Back Bar on Map Page */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-3 flex items-center justify-between">
              <button
                onClick={() => {
                  setIsNearMeActive(false);
                  setActiveTab('home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-900 bg-white hover:bg-stone-100 border border-stone-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs group"
              >
                <ArrowLeft className="w-4 h-4 text-stone-500 group-hover:-translate-x-0.5 transition-transform" />
                <span>Back to Home</span>
              </button>

              <div className="flex items-center gap-2 text-xs text-stone-500">
                <Compass className="w-4 h-4 text-emerald-700" />
                <span className="hidden sm:inline font-medium">Interactive Worldwide Flora Map</span>
              </div>
            </div>

            <ExploreMap
              plants={plants}
              selectedPlant={selectedMapPlant}
              selectedPlantId={selectedMapPlant?.id}
              selectedPlantCoordinates={selectedMapPlant?.coordinates}
              onSelectPlant={(plant) => handleOpenPlantDetails(plant)}
              userLocation={userLocation}
              onLocateUser={handleFindNearMe}
              isLocating={isLocating}
              locationError={locationError}
              onClearLocationError={() => setLocationError(null)}
              initialInatSearch={activeInatSearch}
              initialInatRecords={activeInatRecords}
              initialInatTaxon={activeInatTaxon}
              initialGbifSearch={activeGbifSearch}
              initialGbifRecords={activeGbifRecords}
              initialGbifSpecies={activeGbifSpecies}
              selectedCommunityObservation={selectedCommunityObservation}
              onSelectCommunityObservation={setSelectedCommunityObservation}
              onUpdateUserLocation={(coords) => {
                setUserLocation(coords);
                setIsLocating(false);
              }}
              autoStartTracking={isNearMeActive}
              isActive={activeTab === 'map'}
            />
          </div>
        )}

        {(activeTab === 'search' || activeTab === 'search-results') && (
          <div className="pt-4 animate-in fade-in duration-150">
            <SearchResultsView
              searchQuery={searchQuery}
              setSearchQuery={(q) => {
                setSearchQuery(q);
                setActiveInatSearch(q);
                setActiveGbifSearch(q);
              }}
              onSearch={handleSearchSubmit}
              onShowOnMapWithTaxon={(taxon, records) => {
                setActiveInatTaxon(taxon);
                setActiveInatRecords(records);
                setActiveInatSearch(taxon.preferred_common_name || taxon.name || searchQuery);
                setIsNearMeActive(false);
                setActiveTab('map');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onBackToHome={() => {
                setIsNearMeActive(false);
                setActiveTab('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              userLocation={userLocation}
              savedPlants={plants}
              onSelectPlant={(plant) => handleOpenPlantDetails(plant)}
            />
          </div>
        )}

        {activeTab === 'identify' && (
          <div className="pt-4 animate-in fade-in duration-150">
            <IdentifyPlantPage
              plants={plants}
              onSelectPlant={(plant) => handleOpenPlantDetails(plant)}
              onShowOnMap={(plant) => {
                handleShowOnMap(plant);
              }}
              onOpenAddPlant={handleOpenAddPlant}
              onBackToHome={() => {
                setIsNearMeActive(false);
                setActiveTab('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              userLocation={userLocation}
            />
          </div>
        )}

        {(activeTab === 'add' || activeTab === 'my-observations') && (
          <div className="pt-4 animate-in fade-in duration-150">
            <SubmitPlantPage
              onBackToHome={() => {
                setIsNearMeActive(false);
                setActiveTab('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewOnMap={handleViewCommunityObservationOnMap}
              onSelectPlant={(plant) => handleOpenPlantDetails(plant)}
              userLocation={userLocation}
              initialTab={activeTab === 'my-observations' ? 'my-observations' : 'submit'}
              onAddPlant={handleAddPlant}
            />
          </div>
        )}

        {activeTab === 'plant-details' && !selectedPlantDetails && (
          <div className="max-w-7xl mx-auto px-4 py-12">
            <h1>{isLoadingPlants ? 'Loading plant record…' : 'Plant record unavailable'}</h1>
            <button onClick={handleBackFromPlantDetails} className="mt-4 underline cursor-pointer">Back to Home</button>
          </div>
        )}

        {activeTab === 'plant-details' && selectedPlantDetails && (
          <div className="pt-2 animate-in fade-in duration-150">
            <PlantDetailsPage
              plant={selectedPlantDetails}
              onBack={handleBackFromPlantDetails}
              onOpenInExploreMap={handleShowOnMap}
              onPlantUpdated={(updatedPlant) => {
                setPlants((prev) =>
                  prev.map((p) => (p.id === updatedPlant.id ? updatedPlant : p))
                );
                setSelectedPlantDetails(updatedPlant);
                if (selectedMapPlant?.id === updatedPlant.id) {
                  setSelectedMapPlant(updatedPlant);
                }
                showToast(`"${updatedPlant.commonName}" updated successfully!`);
              }}
              onPlantDeleted={(plantId) => {
                setPlants((prev) => prev.filter((p) => p.id !== plantId));
                setSelectedPlantDetails(null);
                if (selectedMapPlant?.id === plantId) {
                  setSelectedMapPlant(null);
                }
                showToast('Plant observation deleted.');
              }}
              onOpenCarbonDashboard={() => {
                setIsNearMeActive(false);
                setActiveTab('carbon');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}

        {activeTab === 'carbon' && (
          <div className="pt-4 animate-in fade-in duration-150">
            <CarbonDashboard
              plants={plants}
              onSelectPlant={(plant) => handleOpenPlantDetails(plant)}
              onBackToHome={() => {
                setIsNearMeActive(false);
                setActiveTab('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenAddPlant={handleOpenAddPlant}
            />
          </div>
        )}

        {activeTab === 'about' && (
          <div className="pt-4 animate-in fade-in duration-150">
            <AboutView
              onStartExploring={() => {
                setIsNearMeActive(false);
                setActiveTab('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}

        {activeTab === 'account' && (
          <div className="pt-4 animate-in fade-in duration-150">
            <AccountView
              onBackToHome={() => {
                setIsNearMeActive(false);
                setActiveTab('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigateTab={(tab) => {
                setIsNearMeActive(false);
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}
        </>}
        </Suspense>
      </main>

      {/* Plant Detail Dossier Modal */}
      <Suspense fallback={null}>
      {selectedPlantModal && <PlantDetailModal
        plant={selectedPlantModal}
        onClose={() => setSelectedPlantModal(null)}
        onShowOnMap={(plant) => {
          setSelectedPlantModal(null);
          handleShowOnMap(plant);
        }}
        userLocation={userLocation}
      />}

      {/* Add Plant Sighting Modal */}
      {(isAddModalOpen || hasLoadedAddModal) && <AddPlantModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPlant={handleAddPlant}
      />}

      {/* How to Submit Instruction Guide Modal */}
      {(isHowToSubmitOpen || hasLoadedHowToModal) && <HowToSubmitModal
        isOpen={isHowToSubmitOpen}
        onClose={() => setIsHowToSubmitOpen(false)}
        onStartSubmit={() => {
          setIsHowToSubmitOpen(false);
          handleOpenAddPlant();
        }}
      />}
      </Suspense>

      {/* Global Footer */}
      <Footer
        setActiveTab={setActiveTab}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />
    </div>
  );
}
