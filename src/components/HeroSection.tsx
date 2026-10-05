import React, { useState } from 'react';
import { Search, MapPin, Compass, BookOpen, Plus } from 'lucide-react';
import { heroImg } from '../data/samplePlants';

interface HeroSectionProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onFindNearMe: () => void;
  onOpenAddPlant: () => void;
  onOpenMap: () => void;
  onQuickSelectPlant: (plantId: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  searchQuery,
  setSearchQuery,
  onSearch,
  onFindNearMe,
  onOpenAddPlant,
  onOpenMap,
  onQuickSelectPlant,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const quickSearches = [
    { label: 'Tulsi', id: 'tulsi' },
    { label: 'Neem', id: 'neem' },
    { label: 'Mango', id: 'mango' },
    { label: 'Touch-me-not', id: 'touch-me-not' },
    { label: 'Hibiscus', id: 'hibiscus' },
    { label: 'Guava', id: 'guava' },
    { label: 'Banana', id: 'banana' },
    { label: 'Coconut', id: 'coconut' },
  ];

  return (
    <div className="relative overflow-hidden bg-stone-50 border-b border-stone-200">
      {/* Subtle organic background decoration */}
      <div className="absolute top-0 right-0 -z-10 w-96 h-96 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none transform translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 left-0 -z-10 w-80 h-80 bg-teal-100/30 rounded-full blur-3xl pointer-events-none transform -translate-x-1/4 translate-y-1/4" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 lg:pt-16 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Main Hero Copy & Actions */}
          <div className="lg:col-span-7 space-y-6">
            {/* Demo data badge (anti-pill, quiet unboxed text) */}
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-900/80">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              <span>Student & Nature Lovers Botanical Explorer</span>
              <span aria-hidden="true" className="text-stone-300">·</span>
              <span className="text-stone-500">Sample Dataset Active</span>
            </div>

            {/* Required Large Title */}
            <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-emerald-950 leading-[1.1] text-balance">
              WHERE IS MY PLANT 🌿
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-stone-600 max-w-2xl leading-relaxed text-balance">
              Find and explore plants around you.
            </p>

            {/* Search Box Form */}
            <form onSubmit={onSearch} className="pt-2">
              <div
                className={`relative flex items-center bg-white rounded-2xl border transition-all duration-200 shadow-sm ${
                  isFocused
                    ? 'border-emerald-600 ring-4 ring-emerald-600/10 shadow-md'
                    : 'border-stone-300 hover:border-stone-400'
                }`}
              >
                <div className="pl-4 text-stone-400 pointer-events-none">
                  <Search className="w-5 h-5 text-emerald-800" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="Search by common name (e.g. Lavender) or scientific name (e.g. Monstera)..."
                  className="w-full py-4 pl-3 pr-4 text-base text-stone-900 bg-transparent placeholder-stone-400 focus:outline-none"
                  aria-label="Search for a plant"
                />
                <button
                  type="submit"
                  className="m-2 px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-sm transition-all cursor-pointer whitespace-nowrap"
                >
                  Search Plant
                </button>
              </div>

              {/* Quick suggestions */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span className="text-stone-400">Popular searches:</span>
                {quickSearches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSearchQuery(item.label);
                      onQuickSelectPlant(item.id);
                    }}
                    className="hover:text-emerald-900 hover:underline cursor-pointer transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </form>

            {/* Action Buttons Row */}
            <div className="pt-3 flex flex-wrap items-center gap-3">
              {/* Find Plants Near Me */}
              <button
                type="button"
                onClick={onFindNearMe}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-900 text-white font-medium text-sm hover:bg-emerald-950 active:scale-95 shadow-sm transition-all cursor-pointer whitespace-nowrap"
              >
                <MapPin className="w-4 h-4 text-emerald-300" />
                <span>Find Plants Near Me</span>
              </button>

              {/* Submit a Plant (Requirement: Submit a Plant button on homepage) */}
              <button
                type="button"
                onClick={onOpenAddPlant}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-semibold text-sm active:scale-95 shadow-sm transition-all cursor-pointer whitespace-nowrap border border-purple-800"
              >
                <Plus className="w-4 h-4 text-purple-200 stroke-[2.5]" />
                <span>Submit a Plant</span>
              </button>

              {/* Explore Map */}
              <button
                type="button"
                onClick={onOpenMap}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-stone-700 font-medium text-sm hover:text-emerald-900 hover:bg-emerald-50/60 transition-all cursor-pointer whitespace-nowrap"
              >
                <Compass className="w-4 h-4 text-emerald-700" />
                <span>Explore Map</span>
              </button>
            </div>

            {/* Editorial field trust note */}
            <div className="pt-2 text-xs text-stone-500 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Designed for field biology students, campus naturalists, and urban plant explorers.
              </span>
            </div>
          </div>

          {/* Right Visual Stage: High-Fidelity Botanical Hero Card */}
          <div className="lg:col-span-5">
            <div className="relative rounded-3xl overflow-hidden bg-white p-2 shadow-xl shadow-stone-200/50 border border-stone-200">
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-stone-100">
                <img
                  src={heroImg}
                  alt="Lush botanical greenhouse with ferns and botanical field study workspace"
                  className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/80 via-emerald-950/20 to-transparent pointer-events-none" />

                {/* Overlaid Botanical Card Info */}
                <div className="absolute bottom-0 inset-x-0 p-5 text-white">
                  <div className="flex items-center gap-2 text-xs text-emerald-200 mb-1">
                    <span>Central Greenhouse Conservatory</span>
                    <span aria-hidden="true">·</span>
                    <span>Demo Zone A</span>
                  </div>
                  <h3 className="font-serif-display text-xl font-bold">
                    Tropical & Native Arboretum
                  </h3>
                  <p className="text-xs text-stone-200 mt-1 line-clamp-2">
                    Explore 8+ documented plant species with student tips, leaf morphology keys, and live map coordinates.
                  </p>
                </div>
              </div>

              {/* Key Quick Facts Under Image */}
              <div className="p-4 grid grid-cols-3 gap-2 text-center divide-x divide-stone-200">
                <div>
                  <div className="font-mono text-base font-bold text-emerald-900 tabular-nums">
                    8
                  </div>
                  <div className="text-[11px] text-stone-500">Sample Species</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-emerald-900 tabular-nums">
                    100%
                  </div>
                  <div className="text-[11px] text-stone-500">Free to Explore</div>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-emerald-900 tabular-nums">
                    Interactive
                  </div>
                  <div className="text-[11px] text-stone-500">Campus Map</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
