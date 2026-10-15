import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  Camera,
  MapPin,
  CheckCircle2,
  Leaf,
  Plus,
  Navigation,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Eye,
  Crosshair,
  Compass,
  Sparkles,
  TreeDeciduous,
  ShieldCheck,
} from 'lucide-react';

interface HowToSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSubmit: () => void;
}

export const HowToSubmitModal: React.FC<HowToSubmitModalProps> = ({
  isOpen,
  onClose,
  onStartSubmit,
}) => {
  // Active step in interactive walkthrough (or null for showing all)
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'walkthrough' | 'all'>('walkthrough');
  const [expandedAllStep, setExpandedAllStep] = useState<number | null>(0);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const steps = [
    {
      number: 1,
      title: 'Open Submit a Plant',
      shortDesc: 'Launch the botanical contribution form directly from the homepage or navigation bar.',
      icon: Plus,
      badge: 'Step 1: Access',
      content: (
        <div className="space-y-3">
          <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
            Click the purple <strong className="text-purple-900 font-semibold">“Submit a Plant”</strong> button on the homepage hero or select <strong className="text-emerald-950 font-semibold">“Submit a Plant”</strong> from the top navigation bar at any time.
          </p>
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 sm:p-4 text-xs text-stone-700 space-y-2">
            <div className="flex items-center gap-2 text-emerald-900 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Zero-Friction Anonymous Naturalist Authentication</span>
            </div>
            <p className="text-stone-600 text-[11px] sm:text-xs leading-relaxed">
              No lengthy sign-up forms or passwords required. The platform automatically assigns you a secure, anonymous Naturalist UID in Firebase Firestore so you can record plants immediately and manage your contributions later.
            </p>
          </div>
        </div>
      ),
    },
    {
      number: 2,
      title: 'Enter Plant Information',
      shortDesc: 'Fill in the common name, optional scientific name, description, and plant category.',
      icon: Leaf,
      badge: 'Step 2: Taxonomy',
      content: (
        <div className="space-y-3">
          <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
            Provide the basic botanical details that help nature lovers and researchers identify your specimen:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <span className="font-bold text-emerald-950 block mb-0.5">🌿 Common Name (Required)</span>
              <p className="text-stone-600 text-[11px]">
                The familiar name in English or local language (e.g. <em>Holy Basil / Tulsi</em>, <em>Neem</em>, <em>Mango</em>, <em>Touch-me-not</em>).
              </p>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="font-bold text-stone-900 block mb-0.5">🔬 Scientific Name (Optional)</span>
              <p className="text-stone-600 text-[11px]">
                Binomial nomenclature (e.g. <em>Ocimum tenuiflorum</em>, <em>Azadirachta indica</em>). Great for formal herbarium cross-referencing.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="font-bold text-stone-900 block mb-0.5">🏷️ Category &amp; Family (Optional)</span>
              <p className="text-stone-600 text-[11px]">
                Choose Herb, Shrub, Tree, Creeper, Foliage, or Succulent, plus family (e.g. <em>Lamiaceae</em>, <em>Fabaceae</em>).
              </p>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="font-bold text-stone-900 block mb-0.5">🌳 Tree Biometrics (Optional)</span>
              <p className="text-stone-600 text-[11px]">
                For trees, recording trunk circumference enables allometric carbon storage (kg C) and CO₂e absorption estimates.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      number: 3,
      title: 'Add Plant Photo',
      shortDesc: 'Upload one clear photograph showing leaves, flowers, fruit, or overall identifying features.',
      icon: Camera,
      badge: 'Step 3: Visual Evidence',
      content: (
        <div className="space-y-3">
          <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
            The submission form accepts <strong className="text-emerald-950 font-semibold">one clear botanical photograph</strong>. Choosing a high-quality angle ensures accurate species verification by fellow naturalists and botanists.
          </p>

          <div className="bg-white rounded-2xl border border-emerald-200/80 p-3.5 sm:p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                Single Photo Upload
              </span>
              <span className="text-emerald-700 font-bold text-xs">Required *</span>
            </div>

            <div className="text-xs font-semibold text-stone-800">
              Tips for selecting your best photograph:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <span className="text-base">🌿</span> Leaves &amp; Foliage
                </span>
                <p className="text-stone-600 text-[11px] leading-snug">
                  Capture leaf shapes, edges, and arrangement on the stem in clear natural lighting.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <span className="text-base">🌸</span> Flowers or Fruit
                </span>
                <p className="text-stone-600 text-[11px] leading-snug">
                  If blooming or fruiting, a sharp close-up offers the most distinctive identification markers.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <span className="text-base">🪴</span> Growth Habit
                </span>
                <p className="text-stone-600 text-[11px] leading-snug">
                  For trees or shrubs, step back slightly so the overall plant structure is clearly visible.
                </p>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-stone-100 text-[11px] text-stone-600 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
            <span>
              <strong>Smart Auto-Compression:</strong> Your selected photo is automatically optimized in your browser below 700 KB, ensuring rapid, bandwidth-friendly uploads from mobile devices.
            </span>
          </div>
        </div>
      ),
    },
    {
      number: 4,
      title: 'Select the Plant Location',
      shortDesc: 'Choose from three flexible methods: live device GPS, interactive Leaflet map, or manual coordinates.',
      icon: MapPin,
      badge: 'Step 4: Geolocation',
      content: (
        <div className="space-y-3">
          <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
            Accurate spatial coordinates place your observation on the interactive map. The form provides three location methods:
          </p>
          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-900 text-white flex items-center justify-center shrink-0 text-xs font-bold">
                1
              </div>
              <div className="flex-1">
                <span className="font-bold text-emerald-950 block text-xs sm:text-sm">
                  🧭 Use My Current Location (Recommended in Field)
                </span>
                <p className="text-stone-600 text-[11px] sm:text-xs mt-0.5 leading-relaxed">
                  Tap the button to fetch high-precision coordinates directly from your device’s GPS hardware.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-stone-800 text-white flex items-center justify-center shrink-0 text-xs font-bold">
                2
              </div>
              <div className="flex-1">
                <span className="font-bold text-stone-900 block text-xs sm:text-sm">
                  🗺️ Select Location on Interactive Map
                </span>
                <p className="text-stone-600 text-[11px] sm:text-xs mt-0.5 leading-relaxed">
                  Pan, zoom, and click anywhere on the built-in Leaflet map to position the pin exactly on the tree or garden bed.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-stone-800 text-white flex items-center justify-center shrink-0 text-xs font-bold">
                3
              </div>
              <div className="flex-1">
                <span className="font-bold text-stone-900 block text-xs sm:text-sm">
                  ✏️ Enter Location Manually
                </span>
                <p className="text-stone-600 text-[11px] sm:text-xs mt-0.5 leading-relaxed">
                  If GPS is unavailable, you are indoors, or location permission is denied, manually enter decimal coordinates (e.g. Latitude: <code>22.5726</code>, Longitude: <code>88.3639</code>).
                </p>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-center gap-2">
            <span className="font-bold">📍 Location Name:</span>
            <span>Always provide a friendly name (e.g. "Arboretum Trail Marker #4" or "Kolkata Botanical Garden").</span>
          </div>
        </div>
      ),
    },
    {
      number: 5,
      title: 'Review Your Information',
      shortDesc: 'Verify plant names, photo, coordinates, and notes before finalizing your submission.',
      icon: CheckCircle2,
      badge: 'Step 5: Quality Check',
      content: (
        <div className="space-y-3">
          <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
            Take a moment to verify your submission data in the form preview:
          </p>
          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 space-y-2 text-xs text-stone-700">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-bold">✓</span>
              <span><strong>Plant Photo:</strong> Checked and previewed clearly.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-bold">✓</span>
              <span><strong>Common Name:</strong> Spelled accurately.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-bold">✓</span>
              <span><strong>Location Name &amp; Pin:</strong> Correctly positioned on the map preview.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-bold">✓</span>
              <span><strong>Coordinates:</strong> Confirmed in valid latitude [-90, 90] and longitude [-180, 180] range.</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      number: 6,
      title: 'Submit the Plant',
      shortDesc: 'Tap the Submit Plant button and receive instant confirmation with your unique Firestore document ID.',
      icon: Navigation,
      badge: 'Step 6: Cloud Publish',
      content: (
        <div className="space-y-3">
          <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
            Click the purple <strong className="text-purple-900 font-semibold">“Submit Plant”</strong> button at the bottom of the form. The system will:
          </p>
          <div className="space-y-2 text-xs text-stone-700">
            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center gap-2.5">
              <span className="text-base">☁️</span>
              <span>Securely save your observation into the Firebase Firestore <code>plants</code> collection.</span>
            </div>
            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center gap-2.5">
              <span className="text-base">🆔</span>
              <span>Generate and display a unique Document ID confirming successful cloud publication.</span>
            </div>
            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center gap-2.5">
              <span className="text-base">🗺️</span>
              <span>Make your plant immediately discoverable on the community observation layer of the Explore Map.</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      number: 7,
      title: 'View & Manage in “My Uploads”',
      shortDesc: 'Inspect your recorded observations, show them on the map, or delete them anytime.',
      icon: Eye,
      badge: 'Step 7: Naturalist Portfolio',
      content: (
        <div className="space-y-3">
          <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
            All plants you submit remain tied to your Naturalist UID and are organized in your personal portfolio:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <span className="font-bold text-emerald-950 block mb-0.5">📂 Accessing My Uploads</span>
              <p className="text-stone-600 text-[11px]">
                Click the <strong className="text-emerald-900">“My Uploads”</strong> tab at the top of the submission page or via the success screen.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="font-bold text-stone-900 block mb-0.5">🗺️ Locate on Explore Map</span>
              <p className="text-stone-600 text-[11px]">
                Tap "View on Map" on any card to fly straight to your plant's coordinate pin on the interactive Leaflet map.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 sm:col-span-2">
              <span className="font-bold text-stone-900 block mb-0.5">🗑️ Full Owner Deletion Control</span>
              <p className="text-stone-600 text-[11px]">
                Made a mistake or recorded duplicate entries? You can permanently delete your own uploads at any time using the "Delete My Upload" action. Enforced by Firestore ownerUid security rules.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-to-submit-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-stone-200 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="px-5 sm:px-7 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2
                id="how-to-submit-title"
                className="font-serif-display text-lg sm:text-xl font-bold text-stone-900 leading-tight flex items-center gap-1.5"
              >
                <span>How to Submit a Plant</span>
                <span className="text-base">🌿</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-stone-500">
                Naturalist Guide to Recording Real Plant Observations
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="w-8 h-8 rounded-full bg-stone-200/70 hover:bg-stone-300 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View Mode Switcher & Progress Bar */}
        <div className="px-5 sm:px-7 py-2.5 bg-emerald-50/50 border-b border-emerald-100/80 flex items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('walkthrough')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'walkthrough'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Step-by-Step ({activeStepIndex + 1} of {steps.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'all'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              View All 7 Steps
            </button>
          </div>

          <div className="text-[11px] font-medium text-emerald-900 hidden sm:block">
            Field Naturalist Herbarium Contribution
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-4">
          {viewMode === 'walkthrough' ? (
            /* Interactive Walkthrough View */
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Stepper Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {steps.map((st, idx) => {
                  const isActive = activeStepIndex === idx;
                  const isDone = activeStepIndex > idx;
                  return (
                    <button
                      key={st.number}
                      type="button"
                      onClick={() => setActiveStepIndex(idx)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border shrink-0 ${
                        isActive
                          ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                          : isDone
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <span>{isDone ? '✓' : st.number}.</span>
                      <span className="hidden sm:inline">{st.title.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Step Card */}
              {(() => {
                const current = steps[activeStepIndex];
                const StepIcon = current.icon;
                return (
                  <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
                    <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
                          <StepIcon className="w-5 h-5 text-emerald-800" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                            {current.badge}
                          </span>
                          <h3 className="font-serif-display text-xl font-bold text-stone-900 leading-snug">
                            {current.title}
                          </h3>
                        </div>
                      </div>
                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-stone-100 text-stone-600">
                        {current.number} / {steps.length}
                      </span>
                    </div>

                    {/* Step Body */}
                    {current.content}
                  </div>
                );
              })()}

              {/* Walkthrough Navigation Controls */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={activeStepIndex === 0}
                  onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  ← Previous Step
                </button>

                {activeStepIndex < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                    className="inline-flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    <span>Next: {steps[activeStepIndex + 1].title.split('(')[0].trim()}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onStartSubmit}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold shadow-md transition-all cursor-pointer animate-pulse"
                  >
                    <span>Start Submitting a Plant</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* All 7 Steps Accordion View */
            <div className="space-y-3 animate-in fade-in duration-150">
              {steps.map((st, idx) => {
                const isExpanded = expandedAllStep === idx;
                const StepIcon = st.icon;
                return (
                  <div
                    key={st.number}
                    className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedAllStep(isExpanded ? null : idx)}
                      className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-stone-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0 font-bold text-xs">
                          {st.number}
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                            {st.badge}
                          </div>
                          <h4 className="font-serif-display text-base font-bold text-stone-900">
                            {st.title}
                          </h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-stone-400">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-emerald-800" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-stone-100 text-stone-600 text-xs animate-in fade-in duration-150">
                        {st.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-stone-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            <span>Ready to add your discovery to the community map?</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition-colors cursor-pointer"
            >
              Close Guide
            </button>
            <button
              type="button"
              onClick={onStartSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-purple-200 stroke-[2.5]" />
              <span>Start Submitting a Plant</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
