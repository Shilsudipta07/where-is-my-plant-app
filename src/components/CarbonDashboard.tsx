/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plant } from '../types/plant';
import {
  calculateAggregatedCarbon,
  calculatePlantCarbon,
  CARBON_CONSTANTS,
} from '../utils/carbonCalculation';
import {
  ArrowLeft,
  TreeDeciduous,
  Leaf,
  CloudSun,
  Activity,
  AlertCircle,
  HelpCircle,
  BookOpen,
  Info,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  Ruler,
  TrendingUp,
} from 'lucide-react';

interface CarbonDashboardProps {
  plants: Plant[];
  onSelectPlant: (plant: Plant) => void;
  onBackToHome: () => void;
  onOpenAddPlant?: () => void;
}

export const CarbonDashboard: React.FC<CarbonDashboardProps> = ({
  plants,
  onSelectPlant,
  onBackToHome,
  onOpenAddPlant,
}) => {
  const [filter, setFilter] = useState<'all' | 'eligible' | 'insufficient' | 'non-tree'>('eligible');
  const [showMethodologyModal, setShowMethodologyModal] = useState(false);

  const metrics = calculateAggregatedCarbon(plants);

  // Filtered plant list
  const filteredPlants = plants.filter((plant) => {
    const est = calculatePlantCarbon(plant);
    if (filter === 'eligible') return est.status === 'eligible';
    if (filter === 'insufficient') return est.status === 'insufficient_data';
    if (filter === 'non-tree') return est.status === 'not_applicable';
    return true;
  });

  return (
    <div className="min-h-screen bg-stone-50 py-6 sm:py-10 animate-in fade-in duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 hover:text-emerald-950 bg-white hover:bg-stone-100 border border-stone-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs group"
            >
              <ArrowLeft className="w-4 h-4 text-stone-500 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Home</span>
            </button>
            <div className="h-4 w-px bg-stone-200 hidden sm:block" />
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <TreeDeciduous className="w-4 h-4 text-emerald-800" />
              <span className="font-semibold text-stone-800">Carbon Sequestration Observatory</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowMethodologyModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
              <span>Scientific Methodology</span>
            </button>
            {onOpenAddPlant && (
              <button
                type="button"
                onClick={onOpenAddPlant}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <span>Add Tree Biometrics</span>
              </button>
            )}
          </div>
        </div>

        {/* Dashboard Title & Introduction */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/80 text-emerald-900 text-[11px] font-bold tracking-wide uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>IPCC 2006 &amp; Chave et al. (2014) Allometric Standard</span>
          </div>
          <h1 className="font-serif-display text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-900 tracking-tight">
            Campus Flora Carbon Sequestration Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 max-w-3xl leading-relaxed">
            Quantitative assessment of carbon stored in woody plant biomass and annual atmospheric CO₂
            sequestration rates across campus arboretum specimens. Calculations follow documented allometric
            forestry models, strictly separating elemental stored carbon (kg C) from carbon dioxide equivalent (kg CO₂e).
          </p>
        </div>

        {/* Executive Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Stored Carbon (kg C) */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                Total Stored Carbon
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-800">
                <Leaf className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono tracking-tight">
                {metrics.totalStoredCarbonKg.toLocaleString('en-US', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                <span className="text-sm font-sans font-bold text-stone-500 ml-1.5">kg C</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1">
                {(metrics.totalStoredCarbonKg / 1000).toFixed(3)} metric tons elemental carbon
              </p>
            </div>
            <div className="pt-2 border-t border-stone-100 text-[11px] text-emerald-800 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Across {metrics.eligibleTreesCount} eligible measured trees</span>
            </div>
          </div>

          {/* 2. Total CO2 Equivalent (kg CO2e) */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                Stored CO₂ Equivalent
              </span>
              <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-800">
                <CloudSun className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono tracking-tight">
                {metrics.totalStoredCo2eKg.toLocaleString('en-US', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                <span className="text-sm font-sans font-bold text-stone-500 ml-1.5">kg CO₂e</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1">
                {(metrics.totalStoredCo2eKg / 1000).toFixed(3)} metric tons CO₂ sequestered
              </p>
            </div>
            <div className="pt-2 border-t border-stone-100 text-[11px] text-stone-500">
              Stoichiometric molecular ratio: 44/12 (~3.667× C)
            </div>
          </div>

          {/* 3. Annual CO2 Absorption Rate */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                Annual CO₂ Absorption
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-800">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono tracking-tight">
                {metrics.totalAnnualAbsorptionCo2eKg.toLocaleString('en-US', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                <span className="text-sm font-sans font-bold text-stone-500 ml-1.5">kg CO₂e/yr</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1">
                From {metrics.treesWithAnnualAbsorptionCount} trees with reported age
              </p>
            </div>
            <div className="pt-2 border-t border-stone-100 text-[11px] text-stone-500">
              {metrics.eligibleTreesCount - metrics.treesWithAnnualAbsorptionCount > 0
                ? `${metrics.eligibleTreesCount - metrics.treesWithAnnualAbsorptionCount} tree(s) require age to compute rate`
                : 'Lifetime annualized sequestration rate'}
            </div>
          </div>

          {/* 4. Eligible vs Data Coverage */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                Flora Data Coverage
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-800">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-emerald-800 font-sans font-semibold">Eligible Trees:</span>
                <span className="font-bold">{metrics.eligibleTreesCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-amber-800 font-sans font-semibold">Insufficient Data:</span>
                <span className="font-bold">{metrics.insufficientDataTreesCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500 font-sans">Non-tree Flora:</span>
                <span className="font-bold">{metrics.nonTreePlantsCount}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-stone-100 text-[11px] text-stone-400">
              Total cataloged plants: {metrics.totalPlantsCount}
            </div>
          </div>
        </div>

        {/* Data Filter Tabs & Table */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <h2 className="font-serif-display text-lg font-bold text-stone-900">
                Campus Specimen Carbon Directory
              </h2>
              <p className="text-xs text-stone-500">
                Biometric parameters, aboveground dry biomass, and verified sequestration figures.
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setFilter('eligible')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  filter === 'eligible'
                    ? 'bg-white text-emerald-950 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Eligible Trees ({metrics.eligibleTreesCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('insufficient')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  filter === 'insufficient'
                    ? 'bg-white text-amber-950 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Needs DBH ({metrics.insufficientDataTreesCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('non-tree')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  filter === 'non-tree'
                    ? 'bg-white text-stone-950 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Non-Tree Flora ({metrics.nonTreePlantsCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  filter === 'all'
                    ? 'bg-white text-stone-950 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                All Flora ({plants.length})
              </button>
            </div>
          </div>

          {/* Specimens Table */}
          {filteredPlants.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
                <TreeDeciduous className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-stone-700">No plant records in this filter.</p>
              <p className="text-xs text-stone-400">
                Select another filter or add tree biometric measurements to populate the dashboard.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-[10px] uppercase font-bold tracking-wider text-stone-400">
                    <th className="py-3 px-3">Plant Specimen</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Biometrics (DBH / H / Age)</th>
                    <th className="py-3 px-3">Stored Carbon (kg C)</th>
                    <th className="py-3 px-3">Stored CO₂e (kg CO₂e)</th>
                    <th className="py-3 px-3">Annual Absorption</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredPlants.map((plant) => {
                    const estimate = calculatePlantCarbon(plant);
                    const isEligible = estimate.status === 'eligible';
                    const isInsufficient = estimate.status === 'insufficient_data';

                    return (
                      <tr
                        key={plant.id}
                        className="hover:bg-stone-50/80 transition-colors group"
                      >
                        {/* Plant Specimen */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-stone-100 shrink-0 border border-stone-200">
                              {plant.imageUrl ? (
                                <img
                                  src={plant.imageUrl}
                                  alt={plant.commonName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs">
                                  🌿
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-stone-900 group-hover:text-emerald-950 transition-colors">
                                {plant.commonName}
                              </div>
                              <div className="text-[11px] italic text-stone-500 font-serif">
                                {plant.scientificName || plant.family}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              plant.category === 'Tree'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            {plant.category}
                          </span>
                        </td>

                        {/* Biometrics */}
                        <td className="py-3.5 px-3 font-mono text-[11px]">
                          {plant.category === 'Tree' ? (
                            plant.trunkDiameterCm ? (
                              <div className="space-y-0.5">
                                <div>
                                  <span className="font-semibold text-stone-900">
                                    {plant.trunkDiameterCm} cm
                                  </span>{' '}
                                  <span className="text-stone-400 font-sans text-[10px]">DBH</span>
                                </div>
                                <div className="text-stone-500 text-[10px] font-sans">
                                  {plant.treeHeightM ? `${plant.treeHeightM} m height` : 'Height: N/A'}
                                  {plant.treeAgeYears ? ` • ${plant.treeAgeYears} yrs` : ''}
                                </div>
                              </div>
                            ) : (
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-sans font-medium">
                                Missing DBH
                              </span>
                            )
                          ) : (
                            <span className="text-stone-400 font-sans text-[11px]">—</span>
                          )}
                        </td>

                        {/* Stored Carbon (kg C) */}
                        <td className="py-3.5 px-3 font-mono">
                          {isEligible && estimate.storedCarbonKg !== null ? (
                            <div>
                              <span className="font-bold text-emerald-950 text-sm">
                                {estimate.storedCarbonKg.toLocaleString('en-US', {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1,
                                })}
                              </span>
                              <span className="text-[10px] font-sans text-stone-400 ml-1">kg C</span>
                            </div>
                          ) : isInsufficient ? (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-sans font-medium">
                              Insufficient data
                            </span>
                          ) : (
                            <span className="text-stone-400 font-sans text-[11px]">Not applicable</span>
                          )}
                        </td>

                        {/* Stored CO2e (kg CO2e) */}
                        <td className="py-3.5 px-3 font-mono">
                          {isEligible && estimate.storedCo2eKg !== null ? (
                            <div>
                              <span className="font-bold text-stone-900 text-sm">
                                {estimate.storedCo2eKg.toLocaleString('en-US', {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1,
                                })}
                              </span>
                              <span className="text-[10px] font-sans text-stone-400 ml-1">kg CO₂e</span>
                            </div>
                          ) : isInsufficient ? (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-sans font-medium">
                              Insufficient data
                            </span>
                          ) : (
                            <span className="text-stone-400 font-sans text-[11px]">Not applicable</span>
                          )}
                        </td>

                        {/* Annual Absorption */}
                        <td className="py-3.5 px-3 font-mono">
                          {isEligible && estimate.annualAbsorptionCo2eKg !== null ? (
                            <div>
                              <span className="font-bold text-teal-800">
                                {estimate.annualAbsorptionCo2eKg.toFixed(1)}
                              </span>
                              <span className="text-[10px] font-sans text-stone-400 ml-1">
                                kg CO₂e/yr
                              </span>
                            </div>
                          ) : isEligible ? (
                            <span className="text-stone-500 font-sans text-[10px]" title="Requires tree age to compute annual rate">
                              Age needed
                            </span>
                          ) : isInsufficient ? (
                            <span className="text-stone-400 font-sans text-[11px]">—</span>
                          ) : (
                            <span className="text-stone-400 font-sans text-[11px]">—</span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => onSelectPlant(plant)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all cursor-pointer"
                          >
                            <span>Details</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Scientific Methodology Modal */}
        {showMethodologyModal && (
          <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-serif-display text-lg font-bold text-stone-900">
                      Scientific Carbon Allometry Methodology
                    </h3>
                    <p className="text-[11px] text-stone-500">
                      Documented peer-reviewed forestry equations and IPCC standards
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMethodologyModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-stone-200/80 flex items-center justify-center text-stone-400 hover:text-stone-700 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs text-stone-700 leading-relaxed">
                {/* 1. Scientific distinction */}
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-1.5">
                  <h4 className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Distinction: Carbon (kg C) vs. CO₂ Equivalent (kg CO₂e)</span>
                  </h4>
                  <p className="text-[11px] text-emerald-900">
                    • <strong>Stored Carbon (kg C):</strong> Elemental carbon bound in the cellulose and lignin of the dry wood.
                    <br />
                    • <strong>CO₂ Equivalent (kg CO₂e):</strong> Atmospheric carbon dioxide removed during photosynthesis. One carbon atom (mass 12) binds with two oxygen atoms (mass 16×2=32) forming CO₂ (molecular mass 44). Hence: <code>kg CO₂e = kg C × (44 / 12) ≈ kg C × 3.6667</code>.
                    <br />
                    • <strong>Annual Absorption (kg CO₂e/yr):</strong> Mean rate of CO₂ sequestered per year of tree life (<code>Stored CO₂e / Tree Age</code>).
                  </p>
                </div>

                {/* 2. Aboveground Biomass Equation */}
                <div className="space-y-2">
                  <h4 className="font-bold text-stone-900">
                    1. Aboveground Biomass (AGB) Model — Chave et al. (2014)
                  </h4>
                  <p>
                    When both trunk diameter (DBH, cm) and tree height (H, m) are known:
                  </p>
                  <div className="p-3 bg-stone-100 rounded-xl font-mono text-[11px] text-stone-800">
                    AGB = 0.0673 × (ρ × DBH² × H)^0.976
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Where ρ = 0.60 g/cm³ is the standard dry wood density across mixed broadleaf/hardwood trees.
                    When height is not measured, the diameter-only equation (Jenkins et al. 2003) is applied:
                    <code> ln(AGB) = -2.4800 + 2.4835 × ln(DBH)</code>.
                  </p>
                </div>

                {/* 3. Belowground Root Biomass */}
                <div className="space-y-2">
                  <h4 className="font-bold text-stone-900">
                    2. Belowground Root Biomass (BGB) &amp; Total Biomass
                  </h4>
                  <p>
                    According to IPCC 2006 (Vol. 4, Chapter 4), belowground coarse roots represent approximately 26% of aboveground biomass (root-to-shoot ratio R = 0.26):
                  </p>
                  <div className="p-3 bg-stone-100 rounded-xl font-mono text-[11px] text-stone-800">
                    Total Dry Biomass = AGB × (1 + 0.26) = AGB × 1.26
                  </div>
                </div>

                {/* 4. Carbon Fraction */}
                <div className="space-y-2">
                  <h4 className="font-bold text-stone-900">
                    3. Carbon Fraction (IPCC Default)
                  </h4>
                  <p>
                    Woody biomass consists of approximately 47% elemental carbon by dry weight:
                  </p>
                  <div className="p-3 bg-stone-100 rounded-xl font-mono text-[11px] text-stone-800">
                    Stored Carbon (kg C) = Total Dry Biomass × 0.47
                  </div>
                </div>

                {/* 5. Assumptions & Limitations */}
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-1.5 text-[11px]">
                  <h4 className="font-bold text-amber-950 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-700" />
                    <span>Scientific Assumptions &amp; Inherent Limitations</span>
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-amber-900">
                    <li>Only perennial woody trees are eligible; herbaceous plants do not possess durable woody carbon pools.</li>
                    <li>If DBH is missing or &le; 0, the system displays "Insufficient data" rather than hallucinating values.</li>
                    <li>Calculations utilize general temperate/tropical wood density (0.60 g/cm³); actual wood densities vary between 0.35 and 0.85 g/cm³ depending on species.</li>
                    <li>Annual absorption reflects lifetime average accumulation, not the instantaneous current-year increment.</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowMethodologyModal(false)}
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Close Methodology
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
