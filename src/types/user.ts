export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  username?: string;
  normalizedUsername?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface UsernameReservation {
  uid: string;
  username: string;
  normalizedUsername: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface UsernameValidationResult {
  isValid: boolean;
  normalized: string;
  error: string | null;
}
