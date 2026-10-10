export interface Coordinates {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface IdentificationKeys {
  leafShape: string;
  leafArrangement: string; // e.g. Alternate, Opposite, Whorled
  flowerColor: string;
  growthHabit: string; // Tree, Shrub, Herbaceous, Vine
  toxicityWarning?: string;
}

export interface Plant {
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  genus?: string;
  category: 'Tree' | 'Wildflower' | 'Foliage' | 'Herb' | 'Succulent';
  habitat: string;
  bloomSeason: string;
  sunExposure: 'Full Sun' | 'Partial Shade' | 'Full Shade' | 'Indirect Bright';
  waterNeeds: 'Low' | 'Moderate' | 'High';
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  studentTip: string;
  description: string;
  identificationKeys: IdentificationKeys;
  imageUrl: string;
  locationName: string;
  coordinates: Coordinates;
  locationSource?: 'gps' | 'map' | 'manual';
  demoLocationDescription: string;
  sightedCount: number;
  isUserAdded?: boolean;
  ownerUid?: string; // Firebase Authentication UID of the uploader
  ownerUsername?: string; // Naturalist username at time of upload or dynamic lookup
  // Biometric & Carbon Sequestration measurements (all optional)
  trunkDiameterCm?: number; // Trunk diameter / DBH at breast height (1.37m) in cm
  treeHeightM?: number; // Total tree height in meters
  treeAgeYears?: number; // Known or estimated tree age in years
  measurementDate?: string; // Biometric measurement date (YYYY-MM-DD)
  createdAt?: any;
  updatedAt?: any;
}

export interface CommunityObservation {
  id: string;
  commonName: string;
  scientificName?: string;
  imageUrl: string;
  coordinates: Coordinates;
  date: string; // YYYY-MM-DD
  notes?: string;
  submittedAt: number;
  source: 'community';
  ownerUid?: string;
}

export type ActiveTab = 'home' | 'explore' | 'map' | 'search' | 'identify' | 'add' | 'about' | 'search-results' | 'my-observations' | 'account' | 'plant-details' | 'carbon';

export type { INaturalistObservationRecord, INaturalistTaxon } from '../services/inaturalistService';
export type { PlantOccurrenceRecord } from '../services/gbifService';
