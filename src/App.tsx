/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plant, ActiveTab, Coordinates } from './types/plant';
import { INITIAL_PLANTS, DEMO_CAMPUS_CENTER } from './data/samplePlants';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ExploreMap } from './components/ExploreMap';
import { PlantCatalog } from './components/PlantCatalog';
import { PlantDetailModal } from './components/PlantDetailModal';
import { AddPlantModal } from './components/AddPlantModal';
import { AboutView } from './components/AboutView';
import { SearchResultsView } from './components/SearchResultsView';
import { IdentifyPlantPage } from './components/IdentifyPlantPage';
import { SubmitPlantPage } from './components/SubmitPlantPage';
import { PlantDetailsPage } from './components/PlantDetailsPage';
import { CarbonDashboard } from './components/CarbonDashboard';
import { AccountView } from './components/AccountView';
import { Footer } from './components/Footer';
import { getPlantsFromFirestore } from './services/firestoreService';
import { PlantOccurrenceRecord, SpeciesResolutionResult } from './services/gbifService';
import { INaturalistObservationRecord, INaturalistTaxon, CommunityObservation } from './types/plant';
import { Sparkles, ArrowRight, Compass, Plus, Check, ArrowLeft, Camera } from 'lucide-react';

const STORAGE_KEY = 'where_is_my_plant_items_v2';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isNearMeActive, setIsNearMeActive] = useState<boolean>(false);
  const [plants, setPlants] = useState<Plant[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[App] Could not load saved plants from localStorage:', e);
    }
    return INITIAL_PLANTS;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlantModal, setSelectedPlantModal] = useState<Plant | null>(null);
  const [selectedPlantDetails, setSelectedPlantDetails] = useState<Plant | null>(null);
  const [selectedMapPlant, setSelectedMapPlant] = useState<Plant | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
      });

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
    setActiveTab('plant-details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackFromPlantDetails = () => {
    setSelectedPlantDetails(null);
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleShowOnMap = (plant: Plant) => {
    setSelectedMapPlant(plant);
    if (activeTab === 'home') {
      const mapSection = document.getElementById('explore-map');
      if (mapSection) {
        mapSection.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      setActiveTab('map');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
        {activeTab === 'home' && (
          <>
            {/* Required Homepage Hero */}
            <HeroSection
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSearch={handleSearchSubmit}
              onFindNearMe={handleFindNearMe}
              onOpenAddPlant={handleOpenAddPlant}
              onOpenMap={handleOpenMap}
              onQuickSelectPlant={handleQuickSelectPlant}
            />

            {/* Required Homepage Explore Map Section */}
            <ExploreMap
              plants={plants}
              selectedPlant={selectedMapPlant}
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
      </main>

      {/* Plant Detail Dossier Modal */}
      <PlantDetailModal
        plant={selectedPlantModal}
        onClose={() => setSelectedPlantModal(null)}
        onShowOnMap={(plant) => {
          setSelectedPlantModal(null);
          handleShowOnMap(plant);
        }}
        userLocation={userLocation}
      />

      {/* Add Plant Sighting Modal */}
      <AddPlantModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPlant={handleAddPlant}
      />

      {/* Global Footer */}
      <Footer
        setActiveTab={setActiveTab}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />
    </div>
  );
}
