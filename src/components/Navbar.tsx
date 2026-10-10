import React, { useState, useEffect } from 'react';
import { ActiveTab } from '../types/plant';
import {
  Home,
  Compass,
  Search,
  MapPin,
  Sparkles,
  PlusCircle,
  BookOpen,
  Menu,
  X,
  ChevronRight,
  Leaf,
  User as UserIcon,
  ShieldCheck,
  AtSign,
  TreeDeciduous,
} from 'lucide-react';
import { subscribeToAuth, AuthState, getCurrentUid } from '../services/authService';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onFindNearMe: () => void;
  isNearMeActive?: boolean;
}

export type NavItemKey =
  | 'home'
  | 'map'
  | 'search'
  | 'near-me'
  | 'identify'
  | 'carbon'
  | 'add'
  | 'my-observations'
  | 'about'
  | 'account';

interface NavItemConfig {
  id: NavItemKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onFindNearMe,
  isNearMeActive = false,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    uid: getCurrentUid(),
    isAnonymous: true,
    isLoading: true,
    error: null,
    firebaseConnected: false,
    profile: null,
  });

  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setAuthState(state);
    });
    return () => unsubscribe();
  }, []);

  const navItems: NavItemConfig[] = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      description: 'Campus botanical homepage & overview',
    },
    {
      id: 'map',
      label: 'Explore Map',
      icon: Compass,
      description: 'Interactive worldwide & campus flora map',
    },
    {
      id: 'search',
      label: 'Search Plants',
      icon: Search,
      description: 'Search taxonomic species & GBIF records',
    },
    {
      id: 'near-me',
      label: 'Plants Near Me',
      icon: MapPin,
      description: 'Center map on current GPS location',
    },
    {
      id: 'identify',
      label: 'Identify Plant',
      icon: Sparkles,
      description: 'Morphological identification keys & guides',
    },
    {
      id: 'carbon',
      label: 'Carbon Observatory',
      icon: TreeDeciduous,
      description: 'Campus tree carbon & CO₂e sequestration',
    },
    {
      id: 'about',
      label: 'About',
      icon: BookOpen,
      description: 'Project mission & student naturalists',
    },
    {
      id: 'my-observations',
      label: 'My Uploads',
      icon: Leaf,
      description: 'Manage your uploaded plant observations',
    },
    {
      id: 'add',
      label: 'Submit a Plant',
      icon: PlusCircle,
      description: 'Submit a new plant observation with GPS',
    },
  ];

  const isItemActive = (id: NavItemKey): boolean => {
    if (id === 'home') return activeTab === 'home';
    if (id === 'near-me') return isNearMeActive && activeTab === 'map';
    if (id === 'map') return activeTab === 'map' && !isNearMeActive;
    if (id === 'search') return activeTab === 'search' || activeTab === 'search-results';
    if (id === 'identify') return activeTab === 'identify';
    if (id === 'carbon') return activeTab === 'carbon';
    if (id === 'add') return activeTab === 'add';
    if (id === 'my-observations') return activeTab === 'my-observations';
    if (id === 'about') return activeTab === 'about';
    if (id === 'account') return activeTab === 'account';
    return false;
  };

  const handleNavClick = (id: NavItemKey) => {
    setMobileMenuOpen(false);

    if (id === 'home') {
      setActiveTab('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'map') {
      setActiveTab('map');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'search') {
      setActiveTab('search');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'near-me') {
      onFindNearMe();
    } else if (id === 'identify') {
      setActiveTab('identify');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'carbon') {
      setActiveTab('carbon');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'add') {
      setActiveTab('add');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'my-observations') {
      setActiveTab('my-observations');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'about') {
      setActiveTab('about');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'account') {
      setActiveTab('account');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isGoogleUser = authState.user && !authState.isAnonymous;
  const displayName = authState.profile?.username
    ? `@${authState.profile.username}`
    : authState.user?.displayName?.split(' ')[0] || 'Account';
  const userPhotoURL =
    authState.user?.photoURL ||
    authState.user?.providerData?.find((p) => p.photoURL)?.photoURL ||
    authState.profile?.photoURL ||
    null;

  const [photoError, setPhotoError] = useState(false);
  useEffect(() => {
    setPhotoError(false);
  }, [userPhotoURL]);

  return (
    <header className="sticky top-0 z-40 bg-stone-50/95 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand Logo Wordmark */}
          <button
            onClick={() => handleNavClick('home')}
            className="flex items-center gap-2 text-left cursor-pointer group shrink-0"
            aria-label="WHERE IS MY PLANT homepage"
          >
            <span className="font-serif-display text-lg sm:text-xl font-bold tracking-tight text-emerald-950 group-hover:text-emerald-800 transition-colors flex items-center gap-1.5 sm:gap-2">
              <span>WHERE IS MY PLANT</span>
              <img
                src="/IMG_20261006_191024.jpg"
                alt="WHERE IS MY PLANT Logo"
                className="w-6 h-auto sm:w-7 sm:h-auto object-contain shrink-0"
                referrerPolicy="no-referrer"
              />
            </span>
          </button>

          {/* Desktop Navigation Bar */}
          <nav
            aria-label="Main Navigation"
            className="hidden xl:flex items-center gap-1 text-xs font-medium text-stone-700"
          >
            {navItems.map((item) => {
              const active = isItemActive(item.id);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`relative px-2.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    active
                      ? 'bg-emerald-900/10 text-emerald-950 font-semibold'
                      : 'hover:text-emerald-950 hover:bg-stone-100/80 text-stone-600'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      active ? 'text-emerald-800' : 'text-stone-400 group-hover:text-stone-600'
                    }`}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-2.5 right-2.5 h-0.5 bg-emerald-800 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Medium Screen / Compact Tablet Bar */}
          <nav
            aria-label="Tablet Navigation"
            className="hidden md:flex xl:hidden items-center gap-1 text-[11px] font-medium text-stone-700 overflow-x-auto"
          >
            {navItems.map((item) => {
              const active = isItemActive(item.id);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  title={item.label}
                  className={`relative px-2 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    active
                      ? 'bg-emerald-900/10 text-emerald-950 font-semibold'
                      : 'hover:text-emerald-950 hover:bg-stone-100/80 text-stone-600'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      active ? 'text-emerald-800' : 'text-stone-400'
                    }`}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-800 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Header Controls: Account Button & Mobile Menu */}
          <div className="flex items-center gap-2">
            {/* Account / Google User Button (Desktop & Tablet) */}
            <button
              onClick={() => handleNavClick('account')}
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer text-xs font-semibold ${
                activeTab === 'account'
                  ? 'bg-emerald-900 text-white border-emerald-900 shadow-sm'
                  : isGoogleUser
                  ? 'bg-white hover:bg-stone-100 text-emerald-950 border-stone-200 shadow-2xs'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200 shadow-2xs'
              }`}
              title={isGoogleUser ? 'Manage your account and username' : 'Sign in with Google'}
              aria-label="User Account"
            >
              {isGoogleUser ? (
                <>
                  {userPhotoURL && !photoError ? (
                    <img
                      src={userPhotoURL}
                      alt={authState.user?.displayName || 'Account'}
                      className="w-5 h-5 rounded-full object-cover ring-1 ring-emerald-500"
                      referrerPolicy="no-referrer"
                      onError={() => setPhotoError(true)}
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold">
                      {(authState.user?.displayName || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="max-w-[110px] truncate">{displayName}</span>
                </>
              ) : (
                <>
                  {/* Google G icon */}
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
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
                  <span>Sign In</span>
                </>
              )}
            </button>

            {/* Mobile Hamburger Menu Toggle */}
            <div className="flex md:hidden items-center gap-2">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-stone-700 hover:text-emerald-950 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer border border-stone-200 shadow-2xs flex items-center gap-1.5"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <>
                    <X className="w-5 h-5 text-emerald-900" />
                    <span className="text-xs font-semibold text-emerald-950">Close</span>
                  </>
                ) : (
                  <>
                    <Menu className="w-5 h-5 text-stone-800" />
                    <span className="text-xs font-semibold text-stone-800">Menu</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Drawer / Slide-Out Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-stone-200 bg-white/98 backdrop-blur-md px-4 pt-3 pb-6 space-y-1.5 shadow-xl animate-in slide-in-from-top-2 duration-150 max-h-[calc(100vh-4.5rem)] overflow-y-auto">
          {/* Mobile Account Banner */}
          <div className="mb-2 p-3 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {isGoogleUser && userPhotoURL && !photoError ? (
                <img
                  src={userPhotoURL}
                  alt={authState.user?.displayName || 'Profile'}
                  className="w-9 h-9 rounded-xl object-cover ring-2 ring-emerald-500/20"
                  referrerPolicy="no-referrer"
                  onError={() => setPhotoError(true)}
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center font-bold text-xs">
                  {isGoogleUser ? (authState.user?.displayName || 'U')[0].toUpperCase() : <UserIcon className="w-4 h-4" />}
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-stone-900">
                  {isGoogleUser ? authState.user?.displayName || 'Naturalist' : 'Guest Naturalist'}
                </div>
                <div className="text-[11px] text-stone-500">
                  {isGoogleUser
                    ? authState.profile?.username
                      ? `@${authState.profile.username}`
                      : authState.user?.email
                    : 'Explore or Sign In with Google'}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleNavClick('account')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                activeTab === 'account'
                  ? 'bg-emerald-900 text-white'
                  : 'bg-white border border-stone-200 text-emerald-900 shadow-2xs'
              }`}
            >
              {isGoogleUser ? 'Account' : 'Sign In'}
            </button>
          </div>

          <div className="px-2 py-1.5 mb-1 text-[11px] font-semibold text-stone-400 uppercase tracking-wider flex items-center justify-between">
            <span>Navigation</span>
            <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
              WHERE IS MY PLANT
            </span>
          </div>

          <div className="space-y-1">
            {navItems.map((item) => {
              const active = isItemActive(item.id);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full text-left px-3.5 py-3 rounded-2xl text-xs font-medium transition-all cursor-pointer flex items-center justify-between ${
                    active
                      ? 'bg-emerald-50 text-emerald-950 font-bold border-l-4 border-emerald-800 shadow-2xs'
                      : 'text-stone-700 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        active
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="text-[11px] text-stone-500 font-normal">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {active && (
                      <span className="text-[10px] uppercase font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        Current
                      </span>
                    )}
                    <ChevronRight
                      className={`w-4 h-4 ${active ? 'text-emerald-800' : 'text-stone-300'}`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-stone-100 mt-2 text-center">
            <div className="text-[11px] text-stone-400 flex items-center justify-center gap-1">
              <Leaf className="w-3 h-3 text-emerald-600" />
              <span>Campus Herbarium &amp; GBIF Biodiversity Explorer</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
