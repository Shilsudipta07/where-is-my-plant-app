import React, { useState, useMemo } from 'react';
import { Plant, Coordinates } from '../types/plant';
import {
  Sparkles,
  ArrowLeft,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  Compass,
  Plus,
  Leaf,
  Info,
  RotateCcw,
  BookOpen,
} from 'lucide-react';

interface IdentifyPlantPageProps {
  plants: Plant[];
  onSelectPlant: (plant: Plant) => void;
  onShowOnMap: (plant: Plant) => void;
  onOpenAddPlant: () => void;
  onBackToHome: () => void;
  userLocation?: Coordinates | null;
}

export const IdentifyPlantPage: React.FC<IdentifyPlantPageProps> = ({
  plants,
  onSelectPlant,
  onShowOnMap,
  onOpenAddPlant,
  onBackToHome,
}) => {
  const [selectedHabit, setSelectedHabit] = useState<string>('all');
  const [selectedFlowerColor, setSelectedFlowerColor] = useState<string>('all');
  const [selectedLeafArrangement, setSelectedLeafArrangement] = useState<string>('all');
  const [selectedAroma, setSelectedAroma] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Quick preset filter (e.g., student common finds)
  const applyPreset = (preset: 'tulsi' | 'neem' | 'flower' | 'tree') => {
    if (preset === 'tulsi') {
      setSelectedHabit('Herb');
      setSelectedFlowerColor('Purple');
      setSelectedLeafArrangement('Opposite');
      setSelectedAroma('aromatic');
      setSearchTerm('');
    } else if (preset === 'neem') {
      setSelectedHabit('Tree');
      setSelectedFlowerColor('all');
      setSelectedLeafArrangement('Alternate');
      setSelectedAroma('bitter');
      setSearchTerm('');
    } else if (preset === 'flower') {
      setSelectedHabit('Wildflower');
      setSelectedFlowerColor('all');
      setSelectedLeafArrangement('all');
      setSelectedAroma('all');
      setSearchTerm('');
    } else if (preset === 'tree') {
      setSelectedHabit('Tree');
      setSelectedFlowerColor('all');
      setSelectedLeafArrangement('all');
      setSelectedAroma('all');
      setSearchTerm('');
    }
  };

  const handleResetFilters = () => {
    setSelectedHabit('all');
    setSelectedFlowerColor('all');
    setSelectedLeafArrangement('all');
    setSelectedAroma('all');
    setSearchTerm('');
  };

  // Match scoring engine
  const matchedPlantsWithScore = useMemo(() => {
    return plants
      .map((plant) => {
        let score = 0;
        const matchedFeatures: string[] = [];

        // Search text match
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchesText =
            plant.commonName.toLowerCase().includes(q) ||
            plant.scientificName.toLowerCase().includes(q) ||
            plant.family.toLowerCase().includes(q) ||
            plant.studentTip.toLowerCase().includes(q);
          if (matchesText) {
            score += 40;
            matchedFeatures.push('Name/keyword match');
          } else {
            return { plant, score: -1, matchedFeatures: [] };
          }
        }

        // Habit match
        if (selectedHabit !== 'all') {
          if (
            plant.category.toLowerCase().includes(selectedHabit.toLowerCase()) ||
            plant.identificationKeys.growthHabit.toLowerCase().includes(selectedHabit.toLowerCase())
          ) {
            score += 25;
            matchedFeatures.push(`Growth habit: ${selectedHabit}`);
          }
        }

        // Flower color match
        if (selectedFlowerColor !== 'all') {
          if (plant.identificationKeys.flowerColor.toLowerCase().includes(selectedFlowerColor.toLowerCase())) {
            score += 25;
            matchedFeatures.push(`Flower color: ${selectedFlowerColor}`);
          }
        }

        // Leaf arrangement match
        if (selectedLeafArrangement !== 'all') {
          if (
            plant.identificationKeys.leafArrangement
              .toLowerCase()
              .includes(selectedLeafArrangement.toLowerCase())
          ) {
            score += 25;
            matchedFeatures.push(`Arrangement: ${selectedLeafArrangement}`);
          }
        }

        // Aroma match
        if (selectedAroma !== 'all') {
          const descTip = (plant.studentTip + ' ' + plant.description).toLowerCase();
          if (selectedAroma === 'aromatic' && (descTip.includes('aromatic') || descTip.includes('scent') || descTip.includes('clove') || descTip.includes('mint'))) {
            score += 25;
            matchedFeatures.push('Strong aromatic scent');
          } else if (selectedAroma === 'bitter' && (descTip.includes('bitter') || descTip.includes('medicinal'))) {
            score += 25;
            matchedFeatures.push('Bitter/medicinal aroma');
          }
        }

        return { plant, score, matchedFeatures };
      })
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score);
  }, [plants, selectedHabit, selectedFlowerColor, selectedLeafArrangement, selectedAroma, searchTerm]);

  const hasActiveFilters =
    selectedHabit !== 'all' ||
    selectedFlowerColor !== 'all' ||
    selectedLeafArrangement !== 'all' ||
    selectedAroma !== 'all' ||
    searchTerm.trim().length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Consistent Back Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-900 bg-white hover:bg-stone-100 border border-stone-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs group"
        >
          <ArrowLeft className="w-4 h-4 text-stone-500 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Home</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-stone-500">
          <Leaf className="w-4 h-4 text-emerald-700" />
          <span>Botanical Identification Key</span>
        </div>
      </div>

      {/* Header Banner */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 text-xs font-semibold uppercase tracking-wider border border-emerald-200">
          <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
          <span>Interactive Student Herbarium</span>
        </div>
        <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900">
          Identify an Unknown Plant
        </h1>
        <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
          Use botanical morphological keys — leaf arrangement, growth habit, floral structure, and aromas — to match specimen traits and discover what plant you are looking at.
        </p>

        {/* Quick presets */}
        <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-500 font-medium">Quick Identification Presets:</span>
          <button
            onClick={() => applyPreset('tulsi')}
            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer font-medium"
          >
            Aromatic Square-Stem Herb (Tulsi)
          </button>
          <button
            onClick={() => applyPreset('neem')}
            className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer font-medium"
          >
            Serrated Canopy Tree (Neem)
          </button>
          <button
            onClick={() => applyPreset('tree')}
            className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-800 border border-stone-200 hover:bg-stone-200 transition-colors cursor-pointer font-medium"
          >
            Campus Trees
          </button>
          <button
            onClick={() => applyPreset('flower')}
            className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-800 border border-stone-200 hover:bg-stone-200 transition-colors cursor-pointer font-medium"
          >
            Wildflowers &amp; Blooms
          </button>
        </div>
      </div>

      {/* Filter Control Box */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-stone-100 pb-5">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search botanical traits, names, or tips..."
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Morphological Attribute Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Habit */}
          <div className="space-y-1.5">
            <label className="font-semibold text-stone-700 block">Growth Habit</label>
            <select
              value={selectedHabit}
              onChange={(e) => setSelectedHabit(e.target.value)}
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-emerald-700"
            >
              <option value="all">All Growth Habits</option>
              <option value="Herb">Herb / Subshrub (Soft stems)</option>
              <option value="Tree">Tree (Single woody trunk)</option>
              <option value="Wildflower">Wildflower (Flowering field plant)</option>
              <option value="Foliage">Foliage / Vine (Broad leaves or climbing)</option>
              <option value="Succulent">Succulent (Fleshy water-storing)</option>
            </select>
          </div>

          {/* Flower Color */}
          <div className="space-y-1.5">
            <label className="font-semibold text-stone-700 block">Floral / Inflorescence Color</label>
            <select
              value={selectedFlowerColor}
              onChange={(e) => setSelectedFlowerColor(e.target.value)}
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-emerald-700"
            >
              <option value="all">All Flower Colors</option>
              <option value="Purple">Purple / Violet / Lavender</option>
              <option value="Yellow">Yellow / Golden / Cream</option>
              <option value="White">White / Ivory florets</option>
              <option value="Red">Red / Coral / Bright Pink</option>
              <option value="Catkin">Catkins / Inconspicuous wind pollinated</option>
            </select>
          </div>

          {/* Leaf Arrangement */}
          <div className="space-y-1.5">
            <label className="font-semibold text-stone-700 block">Leaf Arrangement on Stem</label>
            <select
              value={selectedLeafArrangement}
              onChange={(e) => setSelectedLeafArrangement(e.target.value)}
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-emerald-700"
            >
              <option value="all">All Leaf Arrangements</option>
              <option value="Opposite">Opposite (Pairs facing across stem)</option>
              <option value="Alternate">Alternate (Single leaves alternating)</option>
              <option value="Compound">Compound (Pinnate / multiple leaflets)</option>
              <option value="Basal">Basal / Rosette (Clustered at base)</option>
            </select>
          </div>

          {/* Scent & Aroma */}
          <div className="space-y-1.5">
            <label className="font-semibold text-stone-700 block">Scent / Aroma When Crushed</label>
            <select
              value={selectedAroma}
              onChange={(e) => setSelectedAroma(e.target.value)}
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-emerald-700"
            >
              <option value="all">Any Scent / Not Tested</option>
              <option value="aromatic">Strongly Aromatic (Clove, Basil, Lavender)</option>
              <option value="bitter">Bitter / Antiseptic (Neem medicinal)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>
              {matchedPlantsWithScore.length}{' '}
              {matchedPlantsWithScore.length === 1 ? 'Candidate Plant Match' : 'Candidate Plant Matches'}
            </span>
          </div>

          <div className="text-xs text-stone-500">
            Sorted by taxonomic trait alignment
          </div>
        </div>

        {matchedPlantsWithScore.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-serif-display font-bold text-stone-900">
                No Exact Botanical Match Found
              </h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                Try widening your trait criteria or reset filters to see all campus and herbarium species.
              </p>
            </div>
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              Reset Identification Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {matchedPlantsWithScore.map(({ plant, score, matchedFeatures }) => (
              <div
                key={plant.id}
                className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-48 w-full bg-stone-100 overflow-hidden">
                    <img
                      src={plant.imageUrl}
                      alt={plant.commonName}
                      className="w-full h-full object-cover object-center"
                    />
                    <div className="absolute top-3 left-3 bg-stone-900/80 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
                      {plant.category}
                    </div>

                    {score > 0 && (
                      <div className="absolute top-3 right-3 bg-emerald-900 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-300" />
                        <span>High Match</span>
                      </div>
                    )}
                  </div>

                  <div className="p-5 sm:p-6 space-y-4">
                    <div>
                      <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                        Family: {plant.family}
                      </div>
                      <h3 className="text-xl font-serif-display font-bold text-stone-900">
                        {plant.commonName}
                      </h3>
                      <div className="text-xs italic text-stone-500 font-serif">
                        {plant.scientificName}
                      </div>
                    </div>

                    {/* Morphological Key Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-stone-50 p-3 rounded-2xl border border-stone-200/80">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-stone-400 block">
                          Leaf Arrangement
                        </span>
                        <span className="text-stone-700 font-medium">
                          {plant.identificationKeys.leafArrangement}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-stone-400 block">
                          Flowers
                        </span>
                        <span className="text-stone-700 font-medium">
                          {plant.identificationKeys.flowerColor}
                        </span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-stone-200/50">
                        <span className="text-[10px] uppercase font-semibold text-stone-400 block">
                          Leaf Shape
                        </span>
                        <span className="text-stone-700 font-medium">
                          {plant.identificationKeys.leafShape}
                        </span>
                      </div>
                    </div>

                    {/* Student Field Tip */}
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                        <Info className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Student Naturalist Key Note:</span>
                      </div>
                      <p className="text-xs text-stone-700 leading-relaxed">
                        {plant.studentTip}
                      </p>
                    </div>

                    {matchedFeatures.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {matchedFeatures.map((feat, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[10px] font-medium"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{feat}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-5 sm:p-6 pt-0 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3 mt-2">
                  <button
                    onClick={() => onSelectPlant(plant)}
                    className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-stone-600" />
                    <span>Botanical Dossier</span>
                  </button>

                  <button
                    onClick={() => onShowOnMap(plant)}
                    className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>View On Map</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Field Botany 101 Quick Guide */}
      <div className="bg-emerald-950 text-white rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold uppercase tracking-wider">
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <span>Naturalist Field Methodology</span>
        </div>
        <div>
          <h2 className="font-serif-display text-2xl font-bold">
            How to Key Out an Unknown Specimen
          </h2>
          <p className="text-xs text-stone-300 mt-1 max-w-xl">
            Botanists follow a systematic sequence of observations before confirming species identity:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-emerald-900/60 p-4 rounded-2xl border border-emerald-800/80 space-y-1.5">
            <div className="text-emerald-300 font-bold text-sm">Step 1: Habit</div>
            <p className="text-stone-300 leading-relaxed">
              Observe whether it is a woody tree, rambling shrub, herbaceous ground cover, or trailing vine.
            </p>
          </div>

          <div className="bg-emerald-900/60 p-4 rounded-2xl border border-emerald-800/80 space-y-1.5">
            <div className="text-emerald-300 font-bold text-sm">Step 2: Stem &amp; Leaf</div>
            <p className="text-stone-300 leading-relaxed">
              Check if stem is square (Lamiaceae mints) or round. Note if leaves are opposite or alternate.
            </p>
          </div>

          <div className="bg-emerald-900/60 p-4 rounded-2xl border border-emerald-800/80 space-y-1.5">
            <div className="text-emerald-300 font-bold text-sm">Step 3: Leaf Margins</div>
            <p className="text-stone-300 leading-relaxed">
              Look closely for teeth (serrations), lobed edges (like Birch), or smooth entire margins (like Mango).
            </p>
          </div>

          <div className="bg-emerald-900/60 p-4 rounded-2xl border border-emerald-800/80 space-y-1.5">
            <div className="text-emerald-300 font-bold text-sm">Step 4: Aroma Test</div>
            <p className="text-stone-300 leading-relaxed">
              Rub a clean leaf between thumb and index finger. Distinct scents like clove or camphor immediately reveal family.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-emerald-800">
          <span className="text-xs text-stone-300">
            Found a species not yet in our database? Help document campus flora.
          </span>
          <button
            onClick={onOpenAddPlant}
            className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Submit New Sighting</span>
          </button>
        </div>
      </div>
    </div>
  );
};
