/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Plant } from '../types/plant';

/**
 * Eligibility status for allometric carbon estimation
 */
export type CarbonEligibilityStatus = 'eligible' | 'insufficient_data' | 'not_applicable';

export interface CarbonEstimateResult {
  status: CarbonEligibilityStatus;
  statusReason: string;
  // Primary Carbon & CO2e metrics (strictly distinguished)
  storedCarbonKg: number | null; // Total stored elemental carbon in kg C
  storedCo2eKg: number | null; // Carbon dioxide equivalent in kg CO2e
  annualAbsorptionCo2eKg: number | null; // Mean annual CO2e sequestration rate in kg CO2e/year
  annualAbsorptionCarbonKg: number | null; // Mean annual carbon rate in kg C/year

  // Intermediate allometric biomass values (for scientific transparency)
  abovegroundBiomassKg: number | null; // AGB in kg dry matter
  belowgroundBiomassKg: number | null; // BGB (root biomass) in kg dry matter
  totalBiomassKg: number | null; // Total dry biomass in kg dry matter

  // Methodological metadata & scientific rigor
  methodName: string;
  methodCitation: string;
  assumptions: string[];
  limitations: string[];
}

export interface AggregatedCarbonMetrics {
  totalPlantsCount: number;
  eligibleTreesCount: number;
  insufficientDataTreesCount: number;
  nonTreePlantsCount: number;
  totalStoredCarbonKg: number;
  totalStoredCo2eKg: number;
  totalAnnualAbsorptionCo2eKg: number;
  treesWithAnnualAbsorptionCount: number;
  averageStoredCarbonPerEligibleTreeKg: number;
  averageStoredCo2ePerEligibleTreeKg: number;
  eligibleRecords: { plant: Plant; estimate: CarbonEstimateResult }[];
  insufficientRecords: { plant: Plant; estimate: CarbonEstimateResult }[];
}

// Scientific Constants based on IPCC 2006 Guidelines & Chave et al. (2014)
export const CARBON_CONSTANTS = {
  // Mean dry wood specific gravity (wood density) for mixed tropical/temperate angiosperm trees (g/cm^3)
  DEFAULT_WOOD_DENSITY: 0.60,
  // IPCC 2006 default root-to-shoot ratio (Belowground Biomass = 26% of Aboveground Biomass)
  ROOT_TO_SHOOT_RATIO: 0.26,
  // IPCC standard carbon fraction of dry woody biomass (47% elemental carbon by weight)
  CARBON_FRACTION: 0.47,
  // Stoichiometric ratio of CO2 to Carbon molecular weights: 44.0095 / 12.011 ≈ 3.6667
  CO2_TO_CARBON_RATIO: 44 / 12,
  // Validation bounds
  MIN_DIAMETER_CM: 0.5,
  MAX_DIAMETER_CM: 500,
  MIN_HEIGHT_M: 0.5,
  MAX_HEIGHT_M: 150,
  MIN_AGE_YEARS: 0.1,
  MAX_AGE_YEARS: 5000,
};

/**
 * Validates trunk diameter at breast height (DBH) in centimeters.
 */
export function validateTrunkDiameter(val: unknown): { isValid: boolean; value?: number; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { isValid: true, value: undefined }; // Optional field
  }
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (isNaN(num)) {
    return { isValid: false, error: 'Trunk diameter must be a valid number.' };
  }
  if (num <= 0) {
    return { isValid: false, error: 'Trunk diameter must be greater than 0 cm.' };
  }
  if (num > CARBON_CONSTANTS.MAX_DIAMETER_CM) {
    return { isValid: false, error: `Trunk diameter cannot exceed ${CARBON_CONSTANTS.MAX_DIAMETER_CM} cm.` };
  }
  return { isValid: true, value: Math.round(num * 100) / 100 };
}

/**
 * Validates tree height in meters.
 */
export function validateTreeHeight(val: unknown): { isValid: boolean; value?: number; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { isValid: true, value: undefined };
  }
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (isNaN(num)) {
    return { isValid: false, error: 'Tree height must be a valid number.' };
  }
  if (num <= 0) {
    return { isValid: false, error: 'Tree height must be greater than 0 meters.' };
  }
  if (num > CARBON_CONSTANTS.MAX_HEIGHT_M) {
    return { isValid: false, error: `Tree height cannot exceed ${CARBON_CONSTANTS.MAX_HEIGHT_M} meters.` };
  }
  return { isValid: true, value: Math.round(num * 100) / 100 };
}

/**
 * Validates tree age in years.
 */
export function validateTreeAge(val: unknown): { isValid: boolean; value?: number; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { isValid: true, value: undefined };
  }
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (isNaN(num)) {
    return { isValid: false, error: 'Tree age must be a valid number.' };
  }
  if (num <= 0) {
    return { isValid: false, error: 'Tree age must be greater than 0 years.' };
  }
  if (num > CARBON_CONSTANTS.MAX_AGE_YEARS) {
    return { isValid: false, error: `Tree age cannot exceed ${CARBON_CONSTANTS.MAX_AGE_YEARS} years.` };
  }
  return { isValid: true, value: Math.round(num * 10) / 10 };
}

/**
 * Validates biometric measurement date (ISO format YYYY-MM-DD).
 */
export function validateMeasurementDate(val: unknown): { isValid: boolean; value?: string; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { isValid: true, value: undefined };
  }
  const str = String(val).trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(str)) {
    return { isValid: false, error: 'Measurement date must follow YYYY-MM-DD format.' };
  }
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    return { isValid: false, error: 'Invalid calendar date provided.' };
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (parsed > today) {
    return { isValid: false, error: 'Measurement date cannot be in the future.' };
  }
  return { isValid: true, value: str };
}

/**
 * Calculates carbon storage and sequestration for a plant specimen using documented allometric equations.
 * Never invents values; marks non-trees as "Not applicable" and trees missing DBH as "Insufficient data".
 */
export function calculatePlantCarbon(plant: Plant): CarbonEstimateResult {
  const isTree = plant.category === 'Tree';

  // 1. Check Category Applicability
  if (!isTree) {
    return {
      status: 'not_applicable',
      statusReason: `Not applicable: Specimen is cataloged as a ${plant.category || 'non-tree plant'}. Forest allometric biomass models apply to arborescent (woody tree) taxa.`,
      storedCarbonKg: null,
      storedCo2eKg: null,
      annualAbsorptionCo2eKg: null,
      annualAbsorptionCarbonKg: null,
      abovegroundBiomassKg: null,
      belowgroundBiomassKg: null,
      totalBiomassKg: null,
      methodName: 'IPCC 2006 / Chave et al. (2014) Allometric Framework',
      methodCitation: 'Chave, J. et al. (2014). Improved allometric models to estimate the aboveground biomass of tropical trees. Global Ecology and Biogeography, 23: 1142–1153; IPCC (2006) Guidelines for National Greenhouse Gas Inventories.',
      assumptions: [
        'Allometric models require perennial secondary xylem (woody trunk).',
        'Herbaceous, succulent, and foliage flora have negligible permanent woody carbon storage.',
      ],
      limitations: [
        'Non-woody flora carbon storage is predominantly short-cycle and seasonal.',
      ],
    };
  }

  // 2. Check Data Sufficiency
  const dbh = plant.trunkDiameterCm;
  const height = plant.treeHeightM;
  const age = plant.treeAgeYears;

  if (dbh === undefined || dbh === null || isNaN(dbh) || dbh <= 0) {
    return {
      status: 'insufficient_data',
      statusReason: 'Insufficient data: Trunk diameter at breast height (DBH in cm) is required to calculate tree biomass and carbon.',
      storedCarbonKg: null,
      storedCo2eKg: null,
      annualAbsorptionCo2eKg: null,
      annualAbsorptionCarbonKg: null,
      abovegroundBiomassKg: null,
      belowgroundBiomassKg: null,
      totalBiomassKg: null,
      methodName: 'IPCC 2006 / Chave et al. (2014) Allometric Framework',
      methodCitation: 'Chave, J. et al. (2014). Improved allometric models to estimate the aboveground biomass of tropical trees. Global Ecology and Biogeography, 23: 1142–1153.',
      assumptions: [
        'Diameter at Breast Height (1.37m above ground) is the primary allometric predictor.',
      ],
      limitations: [
        'Cannot estimate woody biomass without at least one measured stem dimension.',
      ],
    };
  }

  // 3. Documented Allometric Calculation
  let agbKg = 0;
  let methodName = '';
  let methodCitation = '';

  const rho = CARBON_CONSTANTS.DEFAULT_WOOD_DENSITY;

  if (height !== undefined && height !== null && !isNaN(height) && height > 0) {
    // Chave et al. (2014) Pantropical Equation (Diameter + Height Model):
    // AGB = 0.0673 * (ρ * D^2 * H)^0.976
    // where D is in cm, H is in m, ρ is in g/cm^3
    const compoundTerm = rho * Math.pow(dbh, 2) * height;
    agbKg = 0.0673 * Math.pow(compoundTerm, 0.976);
    methodName = 'Chave et al. (2014) DBH + Height Allometric Model & IPCC 2006';
    methodCitation = 'Chave, J. et al. (2014). Improved allometric models to estimate the aboveground biomass of tropical trees. Global Ecology and Biogeography, 23(10), 1142–1153.';
  } else {
    // Diameter-only model (Jenkins et al. 2003 / Chave et al. 2014 diameter model):
    // Jenkins et al. (2003) generalized hardwood allometry:
    // AGB (kg) = exp(β0 + β1 * ln(DBH)) with β0 = -2.4800, β1 = 2.4835
    const lnDbh = Math.log(dbh);
    agbKg = Math.exp(-2.48 + 2.4835 * lnDbh);
    methodName = 'Jenkins et al. (2003) / Chave et al. (2014) Diameter-Only Allometry & IPCC 2006';
    methodCitation = 'Jenkins, J. C. et al. (2003). National-scale biomass estimators for United States tree species. Forest Science, 49(1), 12–35.';
  }

  // Belowground Biomass (BGB) via IPCC root-to-shoot ratio
  const bgbKg = agbKg * CARBON_CONSTANTS.ROOT_TO_SHOOT_RATIO;
  const totalBiomassKg = agbKg + bgbKg;

  // Stored Elemental Carbon (kg C)
  const storedCarbonKg = totalBiomassKg * CARBON_CONSTANTS.CARBON_FRACTION;

  // Stored Carbon Dioxide Equivalent (kg CO2e)
  const storedCo2eKg = storedCarbonKg * CARBON_CONSTANTS.CO2_TO_CARBON_RATIO;

  // Annual Sequestration Rate
  let annualAbsorptionCo2eKg: number | null = null;
  let annualAbsorptionCarbonKg: number | null = null;

  if (age !== undefined && age !== null && !isNaN(age) && age > 0) {
    annualAbsorptionCo2eKg = storedCo2eKg / age;
    annualAbsorptionCarbonKg = storedCarbonKg / age;
  }

  const assumptions = [
    `Mean dry wood density (ρ) assumed at ${CARBON_CONSTANTS.DEFAULT_WOOD_DENSITY} g/cm³ across mixed urban/broadleaf hardwood trees.`,
    `Root-to-shoot ratio assumed at ${CARBON_CONSTANTS.ROOT_TO_SHOOT_RATIO} (IPCC 2006 Chapter 4 guidelines for subtropical/temperate woodland trees).`,
    `Carbon fraction of dry organic biomass assumed at ${(CARBON_CONSTANTS.CARBON_FRACTION * 100).toFixed(0)}% (IPCC 2006 Good Practice standard).`,
    `CO₂ equivalent stoichiometric conversion factor = 44 / 12 (${CARBON_CONSTANTS.CO2_TO_CARBON_RATIO.toFixed(4)} kg CO₂e per kg C).`,
    age && age > 0
      ? `Annual absorption rate computed as lifetime mean sequestration divided by reported tree age (${age} years).`
      : 'Annual absorption requires known tree age or temporal re-measurement.',
  ];

  const limitations = [
    'Allometric equations provide non-destructive probabilistic estimates with typical ±15–25% variance depending on species-specific wood density and canopy architecture.',
    'Urban site factors (soil compaction, crown pruning, irrigation) may influence growth rates compared to natural forest stands.',
    height ? '' : 'Tree height was estimated implicitly via diameter allometry; providing measured height increases model precision.',
  ].filter(Boolean);

  return {
    status: 'eligible',
    statusReason: 'Eligible: Valid biometric tree trunk measurements provided.',
    storedCarbonKg: Math.round(storedCarbonKg * 100) / 100,
    storedCo2eKg: Math.round(storedCo2eKg * 100) / 100,
    annualAbsorptionCo2eKg:
      annualAbsorptionCo2eKg !== null ? Math.round(annualAbsorptionCo2eKg * 100) / 100 : null,
    annualAbsorptionCarbonKg:
      annualAbsorptionCarbonKg !== null ? Math.round(annualAbsorptionCarbonKg * 100) / 100 : null,
    abovegroundBiomassKg: Math.round(agbKg * 100) / 100,
    belowgroundBiomassKg: Math.round(bgbKg * 100) / 100,
    totalBiomassKg: Math.round(totalBiomassKg * 100) / 100,
    methodName,
    methodCitation,
    assumptions,
    limitations,
  };
}

/**
 * Calculates aggregated campus/regional carbon metrics across all cataloged plant records.
 */
export function calculateAggregatedCarbon(plants: Plant[]): AggregatedCarbonMetrics {
  let eligibleTreesCount = 0;
  let insufficientDataTreesCount = 0;
  let nonTreePlantsCount = 0;
  let totalStoredCarbonKg = 0;
  let totalStoredCo2eKg = 0;
  let totalAnnualAbsorptionCo2eKg = 0;
  let treesWithAnnualAbsorptionCount = 0;

  const eligibleRecords: { plant: Plant; estimate: CarbonEstimateResult }[] = [];
  const insufficientRecords: { plant: Plant; estimate: CarbonEstimateResult }[] = [];

  plants.forEach((plant) => {
    const estimate = calculatePlantCarbon(plant);

    if (estimate.status === 'eligible') {
      eligibleTreesCount++;
      totalStoredCarbonKg += estimate.storedCarbonKg || 0;
      totalStoredCo2eKg += estimate.storedCo2eKg || 0;
      if (estimate.annualAbsorptionCo2eKg !== null) {
        totalAnnualAbsorptionCo2eKg += estimate.annualAbsorptionCo2eKg;
        treesWithAnnualAbsorptionCount++;
      }
      eligibleRecords.push({ plant, estimate });
    } else if (estimate.status === 'insufficient_data') {
      insufficientDataTreesCount++;
      insufficientRecords.push({ plant, estimate });
    } else {
      nonTreePlantsCount++;
    }
  });

  const averageStoredCarbonPerEligibleTreeKg =
    eligibleTreesCount > 0 ? totalStoredCarbonKg / eligibleTreesCount : 0;
  const averageStoredCo2ePerEligibleTreeKg =
    eligibleTreesCount > 0 ? totalStoredCo2eKg / eligibleTreesCount : 0;

  return {
    totalPlantsCount: plants.length,
    eligibleTreesCount,
    insufficientDataTreesCount,
    nonTreePlantsCount,
    totalStoredCarbonKg: Math.round(totalStoredCarbonKg * 100) / 100,
    totalStoredCo2eKg: Math.round(totalStoredCo2eKg * 100) / 100,
    totalAnnualAbsorptionCo2eKg: Math.round(totalAnnualAbsorptionCo2eKg * 100) / 100,
    treesWithAnnualAbsorptionCount,
    averageStoredCarbonPerEligibleTreeKg: Math.round(averageStoredCarbonPerEligibleTreeKg * 100) / 100,
    averageStoredCo2ePerEligibleTreeKg: Math.round(averageStoredCo2ePerEligibleTreeKg * 100) / 100,
    eligibleRecords,
    insufficientRecords,
  };
}
