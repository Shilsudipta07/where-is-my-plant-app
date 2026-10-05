import React from 'react';
import { BookOpen, ShieldCheck, Heart, Leaf, Compass, ArrowLeft, Check, Facebook, Instagram } from 'lucide-react';

export const AboutView: React.FC<{ onStartExploring: () => void }> = ({ onStartExploring }) => {
  return (
    <section id="about-section" className="py-8 sm:py-12 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 animate-in fade-in duration-200">
      {/* Top Navigation / Breadcrumb */}
      <div className="flex items-center justify-between border-b border-stone-200/80 pb-5">
        <button
          type="button"
          onClick={onStartExploring}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-900 bg-white hover:bg-stone-100 border border-stone-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs group"
        >
          <ArrowLeft className="w-4 h-4 text-stone-500 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Home</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
          <BookOpen className="w-4 h-4 text-emerald-700" />
          <span>About &amp; Founder</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FOUNDER & CREATOR CARD (Clean, Modern Botanical Theme) */}
      {/* ========================================================================= */}
      <div className="relative bg-gradient-to-br from-emerald-900 via-emerald-950 to-stone-900 rounded-3xl p-6 sm:p-10 text-white shadow-xl overflow-hidden border border-emerald-800/40">
        {/* Subtle decorative botanical pattern overlays */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-48 h-48 rounded-full bg-emerald-600/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8 sm:gap-10">
          {/* Profile Photograph (Fixed real photograph, preserves full appearance without unnecessary cropping) */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-48 sm:w-56 h-64 sm:h-72 rounded-2xl overflow-hidden ring-4 ring-emerald-400/40 shadow-2xl bg-stone-800 border-2 border-white/20">
              <img
                src="/1000373921.jpg"
                alt="Sudipta Shil — Founder & Creator"
                className="w-full h-full object-cover object-top"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          {/* Founder Identity & Bio Details */}
          <div className="space-y-4 text-center md:text-left flex-1">
            <div className="space-y-1">
              <h1 className="font-serif-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
                Sudipta Shil
              </h1>
              <div className="text-base sm:text-lg font-semibold text-emerald-200">
                Founder &amp; Creator
              </div>
            </div>

            {/* Description Quote Box */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs space-y-3">
              <p className="text-sm sm:text-base text-stone-100 leading-relaxed font-serif">
                Sudipta Shil is the founder and creator of WHERE IS MY PLANT, a plant-focused web platform designed to help users discover, identify and explore plant species and their locations.
              </p>
              <p className="text-sm sm:text-base text-stone-100 leading-relaxed font-serif">
                He is from Andulberia village under Rejinagar Police Station in Murshidabad, West Bengal. He completed Classes 5–10 at Andulberia High School and Classes 11–12 at Chaltia Shree Guru Pathshala. He is currently studying in the 1st semester of Botany Honours at Jiaganj Sripat Singh College.
              </p>
              <p className="text-sm sm:text-base text-stone-100 leading-relaxed font-serif">
                His interest in Botany and plants inspired him to create WHERE IS MY PLANT.
              </p>
            </div>

            {/* Founder Social Links */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
              <a
                href="https://www.facebook.com/share/1EsKvXaWNd/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold backdrop-blur-xs transition-all shadow-xs hover:border-white/30"
              >
                <Facebook className="w-4 h-4 text-blue-400" />
                <span>Facebook</span>
              </a>

              <a
                href="https://www.instagram.com/shilsudipta_07"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold backdrop-blur-xs transition-all shadow-xs hover:border-white/30"
              >
                <Instagram className="w-4 h-4 text-pink-400" />
                <span>Instagram</span>
              </a>
            </div>

            {/* Mission & Values */}
            <div className="pt-1 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-emerald-100/90">
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Connecting Communities with Nature</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Biodiversity Education</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Interactive Plant Mapping</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ABOUT THE PLATFORM SECTION */}
      {/* ========================================================================= */}
      <div className="text-center max-w-2xl mx-auto space-y-3 pt-2">
        <div className="text-xs font-semibold text-emerald-800 tracking-wider uppercase">
          About Where Is My Plant
        </div>
        <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900">
          Reconnecting Students &amp; Nature Lovers with Flora
        </h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          Plants are all around our university quads, suburban parks, and windowsill pots — yet plant blindness often hides their evolutionary wonder. WHERE IS MY PLANT provides an interactive, beginner-friendly herbarium and map to empower nature curiosity.
        </p>
      </div>

      {/* 3 Core Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
            <Leaf className="w-5 h-5" />
          </div>
          <h3 className="font-serif text-lg font-bold text-stone-900">
            Field Botany Simplified
          </h3>
          <p className="text-xs text-stone-600 leading-relaxed">
            Translate dense academic dichotomous keys into plain-English identification tips that any student can use on a walk between lectures.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
            <Compass className="w-5 h-5" />
          </div>
          <h3 className="font-serif text-lg font-bold text-stone-900">
            Spatial Plant Discovery
          </h3>
          <p className="text-xs text-stone-600 leading-relaxed">
            Map specimen coordinates to nature reserves and arboretums so learners can easily find wild species and trace seasonal flowering cycles.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
            <Heart className="w-5 h-5" />
          </div>
          <h3 className="font-serif text-lg font-bold text-stone-900">
            Community Observations
          </h3>
          <p className="text-xs text-stone-600 leading-relaxed">
            Students and nature enthusiasts log live plant sightings to build a living campus herbarium and preserve local botanical records.
          </p>
        </div>
      </div>

      {/* Field Botany 101 Quick Guide */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 space-y-6 shadow-xs">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-1">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Beginner Study Guide</span>
          </div>
          <h3 className="font-serif-display text-2xl font-bold text-stone-900">
            Field Botany 101: 3 Key Morphological Steps to Observe Any Plant
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
            <div className="font-mono text-emerald-800 font-bold text-sm">01. Phyllotaxy</div>
            <div className="font-semibold text-stone-800">Check Leaf Arrangement</div>
            <p className="text-stone-600 leading-relaxed">
              Are leaves growing <span className="font-medium text-stone-900">alternate</span> (staggered up the stem), <span className="font-medium text-stone-900">opposite</span> (paired face-to-face), or in a <span className="font-medium text-stone-900">whorl</span>?
            </p>
          </div>

          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
            <div className="font-mono text-emerald-800 font-bold text-sm">02. Margin &amp; Shape</div>
            <div className="font-semibold text-stone-800">Examine Leaf Edges</div>
            <p className="text-stone-600 leading-relaxed">
              Inspect the leaf border: is it smooth (<span className="font-medium text-stone-900">entire</span>), saw-toothed (<span className="font-medium text-stone-900">serrate</span>), or deeply indented (<span className="font-medium text-stone-900">lobed</span>)?
            </p>
          </div>

          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
            <div className="font-mono text-emerald-800 font-bold text-sm">03. Venation &amp; Scent</div>
            <div className="font-semibold text-stone-800">Vein Pattern &amp; Aroma</div>
            <p className="text-stone-600 leading-relaxed">
              Hold the leaf to sunlight to view net (<span className="font-medium text-stone-900">reticulate</span>) or parallel veins. Lightly bruise to notice herbal aromas.
            </p>
          </div>
        </div>
      </div>

      {/* Leave No Trace Plant Observation Pledge */}
      <div className="bg-emerald-950 text-white rounded-3xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          <span>Ethics in Nature</span>
        </div>
        <h3 className="font-serif-display text-2xl font-bold">
          The Student Naturalist Field Pledge
        </h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-300">
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Photograph and document without uprooting rare wild plants.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Stay on designated trails to prevent soil compaction around delicate mycorrhizal root nets.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Leave flowers and seed heads for native pollinators and migrating birds.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Report invasive species observations to your campus horticulture office.</span>
          </li>
        </ul>
      </div>

      {/* Transparent Dataset Notice */}
      <div className="p-5 bg-stone-100 rounded-2xl border border-stone-200 text-xs text-stone-600 leading-relaxed text-center">
        <span className="font-semibold text-stone-800">Dataset Transparency Notice: </span>
        All plant locations and identification records shown in this prototype are curated sample demo data representing an educational campus arboretum alongside real verified occurrence data from GBIF.
      </div>

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={onStartExploring}
          className="px-6 py-3 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          Return to Plant Discovery
        </button>
      </div>
    </section>
  );
};
