import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  ArrowLeft,
  Sparkles,
  Leaf,
  Layers,
  AtSign,
  Check,
  Info,
  ExternalLink,
  Lock,
} from 'lucide-react';
import {
  subscribeToAuth,
  signInWithGoogle,
  signOutUser,
  refreshUserProfile,
  AuthState,
  getCurrentUid,
} from '../services/authService';
import {
  validateUsername,
  checkUsernameAvailability,
  updateUsername,
} from '../services/userService';
import { getPlantsFromFirestore } from '../services/firestoreService';
import { ActiveTab, Plant } from '../types/plant';

interface AccountViewProps {
  onBackToHome: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const AccountView: React.FC<AccountViewProps> = ({
  onBackToHome,
  onNavigateTab,
}) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    uid: getCurrentUid(),
    isAnonymous: true,
    isLoading: true,
    error: null,
    firebaseConnected: false,
    profile: null,
  });

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Username form state
  const [usernameInput, setUsernameInput] = useState('');
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Observations count
  const [userPlantCount, setUserPlantCount] = useState<number>(0);
  const [isLoadingPlants, setIsLoadingPlants] = useState<boolean>(false);

  // Subscribe to auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setAuthState(state);
      if (state.profile?.username) {
        setUsernameInput(state.profile.username);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch count of observations owned by the current user
  useEffect(() => {
    let isMounted = true;
    const loadCount = async () => {
      setIsLoadingPlants(true);
      try {
        const plants = await getPlantsFromFirestore();
        if (isMounted) {
          const currentUid = authState.uid;
          const count = plants.filter((p) => p.ownerUid === currentUid).length;
          setUserPlantCount(count);
        }
      } catch (e) {
        console.warn('Could not load plant counts:', e);
      } finally {
        if (isMounted) setIsLoadingPlants(false);
      }
    };

    loadCount();
    return () => {
      isMounted = false;
    };
  }, [authState.uid]);

  // Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setSignInError(null);
    try {
      const res = await signInWithGoogle();
      if (res.user) {
        await refreshUserProfile();
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setSignInError('Sign-in popup was closed before completing. Please try again.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setSignInError('Sign-in was interrupted. Please try again.');
      } else {
        setSignInError(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    try {
      await signOutUser();
      setUsernameInput('');
      setAvailabilityMessage(null);
      setSaveSuccessMessage(null);
      setSaveErrorMessage(null);
    } catch (err: any) {
      console.error('Sign-out error:', err);
    }
  };

  // Live availability check with debounce
  useEffect(() => {
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setAvailabilityMessage(null);
      return;
    }

    const validation = validateUsername(trimmed);
    if (!validation.isValid) {
      setAvailabilityMessage({
        text: validation.error || 'Invalid username',
        isError: true,
      });
      return;
    }

    // If it's already the user's saved username
    if (authState.profile?.username?.toLowerCase() === trimmed.toLowerCase()) {
      setAvailabilityMessage({
        text: 'This is your current active username.',
        isError: false,
      });
      return;
    }

    let isSubscribed = true;
    setIsCheckingAvailability(true);

    const timer = setTimeout(async () => {
      try {
        const check = await checkUsernameAvailability(trimmed, authState.uid);
        if (isSubscribed) {
          setAvailabilityMessage({
            text: check.message,
            isError: !check.available,
          });
        }
      } catch {
        if (isSubscribed) {
          setAvailabilityMessage(null);
        }
      } finally {
        if (isSubscribed) {
          setIsCheckingAvailability(false);
        }
      }
    }, 450);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [usernameInput, authState.uid, authState.profile?.username]);

  // Handle Save / Change Username
  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);

    const validation = validateUsername(usernameInput);
    if (!validation.isValid) {
      setSaveErrorMessage(validation.error || 'Please enter a valid username.');
      return;
    }

    if (!authState.user || authState.isAnonymous) {
      setSaveErrorMessage('Please sign in with Google to reserve a username.');
      return;
    }

    if (authState.profile?.username) {
      setSaveErrorMessage('Username can only be set once.');
      return;
    }

    setIsSavingUsername(true);
    try {
      const res = await updateUsername(authState.uid, usernameInput);
      await refreshUserProfile();
      setSaveSuccessMessage(`Username @${res.username} successfully saved! Username can only be set once.`);
    } catch (err: any) {
      console.warn('[AccountView] Username update notice:', err);
      if (err.message === 'Username already taken') {
        setSaveErrorMessage('Username already taken. Please choose another username.');
      } else {
        setSaveErrorMessage(err.message || 'Failed to save username. Please try again.');
      }
    } finally {
      setIsSavingUsername(false);
    }
  };

  const isGoogleUser = authState.user && !authState.isAnonymous;

  return (
    <div className="py-8 sm:py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-200">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-900 bg-white hover:bg-stone-100 border border-stone-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs group"
        >
          <ArrowLeft className="w-4 h-4 text-stone-500 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Home</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Naturalist Account &amp; Identity</span>
        </div>
      </div>

      {/* Main Title Header */}
      <div className="space-y-1 text-center sm:text-left">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold uppercase tracking-wider">
          <Leaf className="w-3.5 h-3.5" />
          <span>WHERE IS MY PLANT Community</span>
        </div>
        <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900">
          Naturalist Account
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 max-w-2xl">
          Sign in with your Google account to claim your unique botanical handle, protect your plant observation records, and manage your contributions across devices.
        </p>
      </div>

      {/* Conditional UI: Anonymous vs Signed-In with Google */}
      {!isGoogleUser ? (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-10 shadow-sm space-y-8">
          <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-stone-100">
            <div className="w-20 h-20 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-800">
              <UserIcon className="w-10 h-10" />
            </div>
            <div className="space-y-2 text-center sm:text-left">
              <h2 className="font-serif-display text-xl sm:text-2xl font-bold text-stone-900">
                Sign in with Google
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-w-xl">
                You are currently exploring as an anonymous guest. Signing in with your Google account connects your observations permanently and enables you to reserve a unique, case-insensitive botanical username.
              </p>
            </div>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                @
              </div>
              <h3 className="font-semibold text-xs text-stone-900">Unique Username</h3>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Claim your custom handle (e.g. @sudipta_shil) backed by Firestore uniqueness.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Leaf className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-xs text-stone-900">Preserve Sightings</h3>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Existing sightings from your session are automatically linked to your Google account.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-xs text-stone-900">No Passwords</h3>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Secure 1-click Google authentication with no passwords to manage or lose.
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {signInError && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{signInError}</span>
            </div>
          )}

          {/* Sign In Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-4 justify-between">
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="w-full sm:w-auto px-6 py-3.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-2xl text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
                  <span>Connecting with Google...</span>
                </>
              ) : (
                <>
                  {/* Google "G" Icon */}
                  <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.29 21.39 7.35 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.29 2.61 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>

            <div className="text-[11px] text-stone-500 flex items-center gap-1.5 text-center sm:text-right">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Session stays signed in across page refreshes</span>
            </div>
          </div>
        </div>
      ) : (
        /* Signed-in Google User Profile & Username Settings */
        <div className="space-y-6">
          {/* User Profile Card */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 pb-6 border-b border-stone-100">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
                {/* Profile Photo */}
                <div className="relative">
                  {authState.user?.photoURL ? (
                    <img
                      src={authState.user.photoURL}
                      alt={authState.user.displayName || 'Google Profile'}
                      className="w-20 h-20 rounded-2xl object-cover ring-4 ring-emerald-500/20 shadow-md border border-stone-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-emerald-900 text-white flex items-center justify-center text-2xl font-bold font-serif shadow-md">
                      {(authState.user?.displayName || 'N')[0].toUpperCase()}
                    </div>
                  )}

                  <div
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-600 text-white border-2 border-white flex items-center justify-center shadow-xs"
                    title="Google Verified Account"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </div>

                {/* Display Name, Email & Current Username */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h2 className="font-serif-display text-xl sm:text-2xl font-bold text-stone-900">
                      {authState.user?.displayName || 'Naturalist'}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                      Google Account
                    </span>
                  </div>

                  <p className="text-xs text-stone-600 font-mono">
                    {authState.user?.email}
                  </p>

                  <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    {authState.profile?.username ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-semibold">
                        <AtSign className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{authState.profile.username}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-medium">
                        <AlertCircle className="w-3 h-3 text-amber-600" />
                        <span>No unique username set yet</span>
                      </span>
                    )}

                    <span className="text-[11px] text-stone-400 font-mono">
                      UID: {authState.uid.substring(0, 10)}...
                    </span>
                  </div>
                </div>
              </div>

              {/* Sign Out Button */}
              <button
                onClick={handleSignOut}
                className="px-3.5 py-2 rounded-xl border border-stone-200 text-stone-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>

            {/* Quick Stats & Navigation */}
            <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Your Plant Observations
                  </div>
                  <div className="text-2xl font-bold font-serif-display text-emerald-950 mt-0.5">
                    {isLoadingPlants ? '...' : userPlantCount}
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Records linked to your account
                  </div>
                </div>

                <button
                  onClick={() => onNavigateTab('my-observations')}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-xs font-semibold text-stone-800 shadow-2xs transition-colors cursor-pointer"
                >
                  View Uploads
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Contribute Data
                  </div>
                  <div className="text-xs text-stone-600 mt-1">
                    Record new campus or local plant observations
                  </div>
                </div>

                <button
                  onClick={() => onNavigateTab('add')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  Submit Plant
                </button>
              </div>
            </div>
          </div>

          {/* Unique Username Management Section */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Unique Community Handle</span>
              </div>
              <h2 className="font-serif-display text-xl sm:text-2xl font-bold text-stone-900">
                {authState.profile?.username ? 'Your Unique Username' : 'Claim Your Unique Username'}
              </h2>
              <p className="text-xs text-stone-600 leading-relaxed max-w-xl">
                Every naturalist account on WHERE IS MY PLANT has a globally unique username. Comparisons are case-insensitive and reservations are securely enforced in Firestore.
              </p>
            </div>

            {/* If user already has a saved username: permanently disable/hide edit username */}
            {authState.profile?.username ? (
              <div className="space-y-4 max-w-lg">
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-800">
                    <AtSign className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                      Active Community Username
                    </div>
                    <div className="text-lg font-bold text-emerald-950 font-mono">
                      @{authState.profile.username}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 pt-0.5">
                      <Lock className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                      <span>Username can only be set once.</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-600 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>This handle is permanently reserved for your account and cannot be modified.</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveUsername} className="space-y-5 max-w-lg">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] font-medium text-amber-900 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Notice: Username can only be set once. Choose carefully as it cannot be changed later.</span>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="username-input"
                    className="block text-xs font-semibold text-stone-800"
                  >
                    Choose Username
                  </label>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400 font-semibold text-sm">
                      @
                    </div>
                    <input
                      id="username-input"
                      type="text"
                      value={usernameInput}
                      onChange={(e) => {
                        setUsernameInput(e.target.value);
                        setSaveSuccessMessage(null);
                        setSaveErrorMessage(null);
                      }}
                      placeholder="e.g. sudipta_shil"
                      maxLength={20}
                      className="w-full pl-8 pr-10 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 text-sm font-medium text-stone-900 placeholder:text-stone-400 transition-colors"
                    />

                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      {isCheckingAvailability && (
                        <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                      )}
                    </div>
                  </div>

                  {/* Live validation feedback */}
                  {availabilityMessage && (
                    <div
                      className={`text-[11px] font-medium flex items-center gap-1.5 ${
                        availabilityMessage.isError ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {availabilityMessage.isError ? (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{availabilityMessage.text}</span>
                    </div>
                  )}
                </div>

                {/* Username rules list */}
                <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 text-[11px] text-stone-600 space-y-1">
                  <div className="font-semibold text-stone-800 text-xs mb-1">
                    Username Rules:
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Between 3 and 20 characters in length</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Letters (A–Z), numbers (0–9), and underscores (_) only</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>No spaces or special punctuation</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Case-insensitive (e.g. &ldquo;Sudipta&rdquo; and &ldquo;sudipta&rdquo; are identical)</span>
                  </div>
                </div>

                {/* Feedback Banners */}
                {saveSuccessMessage && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{saveSuccessMessage}</span>
                  </div>
                )}

                {saveErrorMessage && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{saveErrorMessage}</span>
                  </div>
                )}

                {/* Save Button */}
                <button
                  type="submit"
                  disabled={
                    isSavingUsername ||
                    isCheckingAvailability ||
                    !usernameInput.trim() ||
                    availabilityMessage?.isError
                  }
                  className="px-5 py-2.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingUsername ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
                      <span>Reserving Username...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save & Claim Username</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
