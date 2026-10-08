import React, { useState, useRef } from 'react';
import { Plant } from '../types/plant';
import { X, Plus, Upload, CheckCircle, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import lavenderImg from '../assets/images/plant_lavender_wildflower_1790167109212.jpg';
import { addPlantToFirestore } from '../services/firestoreService';
import { compressImageFile } from '../utils/imageUtils';

interface AddPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPlant: (newPlant: Plant) => void;
}

export const AddPlantModal: React.FC<AddPlantModalProps> = ({
  isOpen,
  onClose,
  onAddPlant,
}) => {
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState<'Tree' | 'Wildflower' | 'Foliage' | 'Herb' | 'Succulent'>('Wildflower');
  const [habitat, setHabitat] = useState('');
  const [locationName, setLocationName] = useState('');
  const [sunExposure, setSunExposure] = useState<'Full Sun' | 'Partial Shade' | 'Full Shade' | 'Indirect Bright'>('Full Sun');
  const [waterNeeds, setWaterNeeds] = useState<'Low' | 'Moderate' | 'High'>('Moderate');
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [studentTip, setStudentTip] = useState('');
  const [description, setDescription] = useState('');
  const [previewImage, setPreviewImage] = useState<string>(lavenderImg);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Please upload a valid image file (JPEG, PNG, WebP).');
        return;
      }
      try {
        const compressed = await compressImageFile(file, {
          maxWidth: 1080,
          maxHeight: 1080,
          quality: 0.8,
          maxBytes: 700 * 1024,
        });
        setPreviewImage(compressed);
        setErrorMessage(null);
      } catch (err: any) {
        const msg = err?.message || 'Failed to compress plant photo. Please choose a different photo.';
        setErrorMessage(msg);
      }
    }
  };

  const resetForm = () => {
    setCommonName('');
    setScientificName('');
    setFamily('');
    setHabitat('');
    setLocationName('');
    setDescription('');
    setStudentTip('');
    setPreviewImage(lavenderImg);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCommonName = commonName.trim();
    if (!cleanCommonName) {
      setErrorMessage('Common name is required.');
      return;
    }

    if (previewImage && previewImage.length > 700 * 1024) {
      setErrorMessage('Plant photo data exceeds 700 KB. Please upload a smaller compressed image.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate random coordinate jitter around campus center
      const latJitter = (Math.random() - 0.5) * 0.006;
      const lngJitter = (Math.random() - 0.5) * 0.006;

      const plantData: Omit<Plant, 'id'> = {
        commonName: cleanCommonName,
        scientificName: scientificName.trim(),
        family: family.trim(),
        category,
        habitat: habitat.trim() || 'Campus Nature Trail',
        bloomSeason: 'Spring / Summer',
        sunExposure,
        waterNeeds,
        difficulty,
        studentTip: studentTip.trim(),
        description: description.trim(),
        identificationKeys: {
          leafShape: 'Characteristic field morphology recorded in notes',
          leafArrangement: 'Observed along stem',
          flowerColor: 'Natural seasonal blossom',
          growthHabit: category,
        },
        imageUrl: previewImage,
        locationName: locationName.trim() || 'Campus Field Sighting Location',
        coordinates: {
          lat: 37.775 + latJitter,
          lng: -122.419 + lngJitter,
        },
        demoLocationDescription: `Student Field Sighting: ${locationName || 'Near nature reserve boundary'}`,
        sightedCount: 1,
        isUserAdded: true,
      };

      const docId = await addPlantToFirestore(plantData);

      onAddPlant({ ...plantData, id: docId });
      setSubmittedSuccess(true);
      resetForm();

      setTimeout(() => {
        setSubmittedSuccess(false);
        onClose();
      }, 1600);
    } catch (err: unknown) {
      console.error('[AddPlantModal] Firestore submission error:', err);
      let msg = 'Failed to save plant observation to Firestore.';
      if (err && typeof err === 'object' && 'code' in err) {
        if (err.code === 'permission-denied') {
          msg = 'Firestore permission denied. Please ensure your security rules allow writes.';
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="relative bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-stone-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Student Observation Logger · Firestore</span>
            </div>
            <h2 className="font-serif-display text-2xl font-bold text-stone-900">
              Log a New Plant Sighting
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {submittedSuccess ? (
          <div className="p-12 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-700 mx-auto animate-bounce" />
            <h3 className="font-serif text-xl font-bold text-stone-900">
              Plant Saved to Firestore Database!
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Your field observation has been saved to the "plants" collection and added to the botanical map and catalog.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Photo Picker */}
            <div className="flex items-center gap-4 p-3 bg-stone-50 rounded-2xl border border-stone-200">
              <img
                src={previewImage}
                alt="Plant preview"
                className="w-20 h-20 rounded-xl object-cover border border-stone-300 shrink-0"
              />
              <div className="flex-1">
                <div className="text-xs font-semibold text-stone-800 mb-1">
                  Specimen Photo
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50 cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose Photo</span>
                </button>
                <div className="text-[10px] text-stone-400 mt-1">
                  Upload your camera snapshot or use sample floral photo
                </div>
              </div>
            </div>

            {/* Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Common Name *
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={commonName}
                  onChange={(e) => setCommonName(e.target.value)}
                  placeholder="e.g. Broadleaf Plantain"
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Scientific Name (Latin)
                </label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={scientificName}
                  onChange={(e) => setScientificName(e.target.value)}
                  placeholder="e.g. Plantago major"
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Category & Family */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  disabled={isSubmitting}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-700 disabled:opacity-60"
                >
                  <option value="Wildflower">Wildflower</option>
                  <option value="Tree">Tree</option>
                  <option value="Foliage">Foliage / Fern</option>
                  <option value="Herb">Herb</option>
                  <option value="Succulent">Succulent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Plant Family
                </label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  placeholder="e.g. Plantaginaceae"
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-700 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Location & Habitat */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Location / Landmark
                </label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g. Biology Hall Southern Courtyard"
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-700 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Habitat
                </label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={habitat}
                  onChange={(e) => setHabitat(e.target.value)}
                  placeholder="e.g. Compacted pathway edge, moist lawn"
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-700 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Sunlight & Difficulty */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Sunlight
                </label>
                <select
                  value={sunExposure}
                  disabled={isSubmitting}
                  onChange={(e) => setSunExposure(e.target.value as any)}
                  className="w-full px-2 py-2 text-xs bg-white rounded-xl border border-stone-300 disabled:opacity-60"
                >
                  <option value="Full Sun">Full Sun</option>
                  <option value="Partial Shade">Partial Shade</option>
                  <option value="Full Shade">Full Shade</option>
                  <option value="Indirect Bright">Indirect Bright</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Water Needs
                </label>
                <select
                  value={waterNeeds}
                  disabled={isSubmitting}
                  onChange={(e) => setWaterNeeds(e.target.value as any)}
                  className="w-full px-2 py-2 text-xs bg-white rounded-xl border border-stone-300 disabled:opacity-60"
                >
                  <option value="Low">Low</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  disabled={isSubmitting}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full px-2 py-2 text-xs bg-white rounded-xl border border-stone-300 disabled:opacity-60"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            {/* Student Field Tip */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Student Identification Tip
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={studentTip}
                onChange={(e) => setStudentTip(e.target.value)}
                placeholder="What diagnostic feature helped you spot this plant?"
                className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-700 disabled:opacity-60"
              />
            </div>

            {/* Brief Description */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Field Notes / Description
              </label>
              <textarea
                rows={2}
                disabled={isSubmitting}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe growth habit, surrounding plant community, or pollinator visitors..."
                className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-700 disabled:opacity-60"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 text-emerald-300 animate-spin" />
                    <span>Saving to Firestore...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Save to Botanical Herbarium</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
