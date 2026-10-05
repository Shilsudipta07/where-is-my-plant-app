import React, { useState, useRef } from 'react';
import { Plant, Coordinates } from '../types/plant';
import {
  Upload,
  CheckCircle,
  MapPin,
  Sparkles,
  Info,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import lavenderImg from '../assets/images/plant_lavender_wildflower_1790167109212.jpg';
import { DEMO_CAMPUS_CENTER } from '../data/samplePlants';
import { addPlantToFirestore } from '../services/firestoreService';

interface AddPlantPageProps {
  onAddPlant: (newPlant: Plant) => void;
  onBackToHome: () => void;
  userLocation?: Coordinates | null;
}

export const AddPlantPage: React.FC<AddPlantPageProps> = ({
  onAddPlant,
  onBackToHome,
  userLocation,
}) => {
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState<'Tree' | 'Wildflower' | 'Foliage' | 'Herb' | 'Succulent'>('Wildflower');
  const [locationName, setLocationName] = useState('Campus Arboretum - North Quad');
  const [description, setDescription] = useState('');
  const [studentTip, setStudentTip] = useState('');
  const [previewImage, setPreviewImage] = useState<string>(lavenderImg);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPreviewImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const resetForm = () => {
    setCommonName('');
    setScientificName('');
    setFamily('');
    setDescription('');
    setStudentTip('');
    setLocationName('Campus Arboretum - North Quad');
    setPreviewImage(lavenderImg);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    const cleanCommonName = commonName.trim();
    const cleanLocationName = locationName.trim();

    if (!cleanCommonName) {
      setErrorMessage('Please provide a common name for the plant observation.');
      return;
    }

    if (!cleanLocationName) {
      setErrorMessage('Please provide the location section where the plant was observed.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Use user device coordinates or default campus demo center with slight jitter
      const baseCoords = userLocation || DEMO_CAMPUS_CENTER;
      const latJitter = (Math.random() - 0.5) * 0.003;
      const lngJitter = (Math.random() - 0.5) * 0.003;

      const plantData: Omit<Plant, 'id'> = {
        commonName: cleanCommonName,
        scientificName: scientificName.trim() || 'Species not yet identified',
        family: family.trim() || 'Botanical Specimen',
        category,
        habitat: 'Campus Arboretum Observation',
        bloomSeason: 'Current Season Observation',
        sunExposure: 'Full Sun',
        waterNeeds: 'Moderate',
        difficulty: 'Beginner',
        studentTip: studentTip.trim() || 'Student field sighting record submitted via form.',
        description:
          description.trim() ||
          `Fresh specimen observation recorded at ${cleanLocationName}. Documented as part of field biology study.`,
        identificationKeys: {
          leafShape: 'Field botanical observation record',
          leafArrangement: 'Observed in field study',
          flowerColor: 'Field observation',
          growthHabit: category,
        },
        imageUrl: previewImage,
        locationName: cleanLocationName,
        coordinates: {
          lat: baseCoords.lat + latJitter,
          lng: baseCoords.lng + lngJitter,
        },
        demoLocationDescription: `Observation recorded at ${cleanLocationName}`,
        sightedCount: 1,
        isUserAdded: true,
      };

      // Save directly to Firestore "plants" collection with server timestamp
      const docId = await addPlantToFirestore(plantData);

      setSavedDocId(docId);
      setSubmittedSuccess(true);
      onAddPlant({ ...plantData, id: docId });

      // Clear/reset the form only after a successful submission
      resetForm();
    } catch (err: unknown) {
      console.error('[AddPlantPage] Firestore submission error:', err);

      let msg = 'Failed to save plant observation to Firestore.';
      if (err && typeof err === 'object' && 'code' in err) {
        if (err.code === 'permission-denied') {
          msg =
            'Firestore permission denied. Please verify your Firestore security rules in Firebase Console allow writes to the "plants" collection (e.g. allow read, write: if true;).';
        } else if (err.code === 'unavailable') {
          msg = 'Firestore service is currently unavailable. Please check your network connection and retry.';
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-8 sm:py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-900 transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Homepage</span>
        </button>

        {/* Firestore Database Connection Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-300 shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
          <span>CONNECTED TO FIRESTORE DATABASE</span>
        </div>
      </div>

      {/* Page Title */}
      <div>
        <div className="text-xs font-semibold text-emerald-800 tracking-wider uppercase mb-1">
          Field Herbarium Contribution
        </div>
        <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
          Add a Plant Observation
        </h1>
        <p className="text-sm text-stone-600 mt-1 max-w-2xl leading-relaxed">
          Record a new botanical observation or plant specimen. Submissions are saved directly to your Firebase Firestore database in the "plants" collection.
        </p>
      </div>

      {/* Status Notice Banner */}
      <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-950 flex items-start gap-3">
        <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold text-emerald-900">FIRESTORE SYNC: </span>
          Submitting this observation writes directly to the <code className="bg-emerald-100/80 px-1 py-0.5 rounded font-mono text-[11px]">plants</code> collection in project <code className="bg-emerald-100/80 px-1 py-0.5 rounded font-mono text-[11px]">where-is-my-plant-bc671</code> with server timestamps.
        </div>
      </div>

      {/* Error Message Box */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-900 flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed flex-1">
            <span className="font-bold">Submission Error: </span>
            {errorMessage}
          </div>
        </div>
      )}

      {submittedSuccess ? (
        /* Success Confirmation Card */
        <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center space-y-4 shadow-sm animate-in fade-in duration-300">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif-display text-2xl font-bold text-stone-900">
              Observation Saved to Firestore!
            </h3>
            <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
              Your plant observation has been recorded in the Firestore <strong className="text-emerald-950">"plants"</strong> collection and pinned to your map and catalog.
            </p>
            {savedDocId && (
              <div className="pt-2">
                <span className="text-xs font-mono bg-stone-100 text-stone-600 px-3 py-1 rounded-lg border border-stone-200">
                  Document ID: {savedDocId}
                </span>
              </div>
            )}
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setSubmittedSuccess(false);
                setSavedDocId(null);
              }}
              className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Add Another Plant
            </button>
            <button
              onClick={onBackToHome}
              className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              View on Homepage &amp; Map
            </button>
          </div>
        </div>
      ) : (
        /* Form Card */
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6"
        >
          {/* 1. Upload Plant Photo section */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
              Plant Photo
            </label>
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50/50">
              <div className="relative w-36 h-28 sm:w-44 sm:h-32 rounded-xl overflow-hidden bg-stone-200 border border-stone-300 shrink-0 shadow-2xs">
                <img
                  src={previewImage}
                  alt="Plant preview"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-2 text-center sm:text-left flex-1">
                <div className="text-xs font-medium text-stone-700">
                  Upload a clear image of the leaf, flower, or bark:
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-stone-300 hover:border-emerald-600 hover:text-emerald-900 text-stone-700 text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Plant Photo</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <span className="text-[11px] text-stone-400">JPG, PNG or WEBP</span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Tip: A clear botanical macro photograph helps with species verification.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Plant Name & Scientific Name fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                Plant Name <span className="text-emerald-700">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                placeholder="e.g. Holy Basil / Tulsi, Lavender, Rose"
                className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                Scientific Name <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={scientificName}
                onChange={(e) => setScientificName(e.target.value)}
                placeholder="e.g. Ocimum tenuiflorum, Lavandula angustifolia"
                className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors font-serif italic disabled:opacity-60"
              />
            </div>
          </div>

          {/* Category & Botanical Family */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                Category
              </label>
              <select
                value={category}
                disabled={isSubmitting}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
              >
                <option value="Wildflower">Wildflower</option>
                <option value="Tree">Tree</option>
                <option value="Herb">Herb</option>
                <option value="Foliage">Foliage</option>
                <option value="Succulent">Succulent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                Botanical Family <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                placeholder="e.g. Lamiaceae, Fabaceae, Meliaceae"
                className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          {/* 3. Location section */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
              Location Section <span className="text-emerald-700">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-emerald-800 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. Campus Arboretum - Quad garden bed, North Meadow"
                className="w-full pl-9 pr-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
              />
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              {userLocation ? (
                <span className="text-emerald-700 font-medium">
                  📍 Using your current device GPS coordinates ({userLocation.lat.toFixed(4)}°, {userLocation.lng.toFixed(4)}°) for map placement.
                </span>
              ) : (
                <span>
                  Campus arboretum coordinates will be assigned automatically.
                </span>
              )}
            </div>
          </div>

          {/* 4. Short Description field */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
              Short Description
            </label>
            <textarea
              rows={3}
              disabled={isSubmitting}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe physical characteristics, height, leaf arrangement, flower color, fragrance, or growth condition..."
              className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
            />
          </div>

          {/* Student Field Note / Identification tip */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
              Field Identification Tip <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              disabled={isSubmitting}
              value={studentTip}
              onChange={(e) => setStudentTip(e.target.value)}
              placeholder="e.g. Leaves curl when touched; serrated edges; sweet fragrance"
              className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors disabled:opacity-60"
            />
          </div>

          {/* 5. Submit Observation button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-100">
            <span className="text-[11px] text-stone-400 text-center sm:text-left">
              Submission saves record directly into the Firestore database.
            </span>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-3 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 text-emerald-300 animate-spin" />
                  <span>Saving to Firestore...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-300" />
                  <span>Submit Observation</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
