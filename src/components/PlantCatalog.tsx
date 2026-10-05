import React, { useState, useMemo } from 'react';
import { Plant, Coordinates } from '../types/plant';
import { Search, MapPin, Eye, Sun, Droplets, BookOpen, AlertTriangle, Navigation } from 'lucide-react';
import { formatDistance } from '../utils/geoUtils';
import { DEMO_CAMPUS_CENTER } from '../data/samplePlants';

interface PlantCatalogProps {
  plants: Plant[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectPlant: (plant: Plant) => void;
  onShowOnMap: (plant: Plant) => void;
  userLocation?: Coordinates | null;
}

export const PlantCatalog: React.FC<PlantCatalogProps> = ({
  plants,
  searchQuery,
  setSearchQuery,
  onSelectPlant,
  onShowOnMap,
  userLocation,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');

  const categories = ['All', 'Tree', 'Wildflower', 'Foliage', 'Herb', 'Succulent'];
  const difficulties = ['All', 'Beginner', 'Intermediate', 'Advanced'];

  const filteredPlants = useMemo(() => {
    return plants.filter((plant) => {
      const matchesSearch =
        plant.commonName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plant.scientificName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plant.family.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plant.habitat.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'All' || plant.category === selectedCategory;

      const matchesDifficulty =
        difficultyFilter === 'All' || plant.difficulty === difficultyFilter;

      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }, [plants, searchQuery, selectedCategory, difficultyFilter]);

  return (
    <section id="explore" className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="text-xs font-semibold text-emerald-800 tracking-wider uppercase mb-1">
            Botanical Catalog & Field Herbarium
          </div>
          <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900">
            Explore Botanical Species
          </h2>
          <p className="text-sm text-stone-600 mt-1 max-w-xl">
            Browse our curated botanical collection. Each profile includes taxonomic classification, field identification keys, and student study notes.
          </p>
        </div>

        {/* Catalog Search input */}
        <div className="w-full md:w-72 relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter plants by name..."
            className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-stone-300 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
          />
        </div>
      </div>

      {/* Filter Tabs (Interactive Filter Controls - anti-slop clean segmented buttons) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8 pb-4 border-b border-stone-200">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                selectedCategory === category
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200/70'
              }`}
            >
              {category === 'All' ? 'All Categories' : category}
            </button>
          ))}
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span>Level:</span>
          <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg">
            {difficulties.map((diff) => (
              <button
                key={diff}
                onClick={() => setDifficultyFilter(diff)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  difficultyFilter === diff
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Plants Grid */}
      {filteredPlants.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-stone-200 p-8">
          <BookOpen className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <h3 className="font-serif text-lg font-bold text-stone-800">
            No plants found matching your criteria
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto mt-1 mb-4">
            Try adjusting your search terms or clearing the category and difficulty filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setDifficultyFilter('All');
            }}
            className="px-4 py-2 bg-emerald-800 text-white text-xs font-semibold rounded-lg hover:bg-emerald-900 transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredPlants.map((plant) => (
            <article
              key={plant.id}
              className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md hover:border-emerald-600/50 transition-all duration-200 flex flex-col group"
            >
              {/* Image Container with Natural Fallback */}
              <div
                onClick={() => onSelectPlant(plant)}
                className="relative aspect-[4/3] bg-stone-100 overflow-hidden cursor-pointer"
              >
                <img
                  src={plant.imageUrl}
                  alt={plant.commonName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* DEMO LOCATION Label */}
                <div className="absolute top-2 left-2 bg-amber-500/90 text-stone-950 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase backdrop-blur-xs">
                  DEMO DATA
                </div>

                {/* Calculated Distance from User's Device Location */}
                <div className="absolute top-2 right-2 bg-stone-900/85 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-medium text-white flex items-center gap-1 shadow-xs">
                  <Navigation className="w-2.5 h-2.5 text-emerald-400" />
                  <span>
                    {userLocation
                      ? formatDistance(userLocation, plant.coordinates)
                      : formatDistance(DEMO_CAMPUS_CENTER, plant.coordinates)}
                  </span>
                </div>

                {plant.isUserAdded && (
                  <div className="absolute bottom-2 left-2 bg-emerald-700/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-xs">
                    Student Observation
                  </div>
                )}
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  {/* Clean unboxed metadata with dot separators (Zero-Pill discipline) */}
                  <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1.5">
                    <span>{plant.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="italic">{plant.family}</span>
                    <span aria-hidden="true">·</span>
                    <span>{plant.difficulty}</span>
                  </div>

                  {/* Botanical Titles */}
                  <h3
                    onClick={() => onSelectPlant(plant)}
                    className="font-serif-display text-lg font-bold text-stone-900 group-hover:text-emerald-900 transition-colors cursor-pointer leading-snug"
                  >
                    {plant.commonName}
                  </h3>
                  <div className="text-xs italic text-stone-500 mt-0.5 mb-2.5">
                    {plant.scientificName}
                  </div>

                  <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed mb-3">
                    {plant.description}
                  </p>

                  {/* Student tip snippet */}
                  <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100 text-[11px] text-stone-600 leading-snug">
                    <span className="font-semibold text-emerald-900">Key Identifier: </span>
                    {plant.studentTip}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => onShowOnMap(plant)}
                    className="flex items-center gap-1 text-emerald-800 hover:text-emerald-950 font-medium cursor-pointer transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Show on Map</span>
                  </button>

                  <button
                    onClick={() => onSelectPlant(plant)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-stone-100 hover:bg-emerald-800 hover:text-white rounded-lg text-stone-700 font-semibold transition-all cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Dossier</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
