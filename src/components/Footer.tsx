import React from 'react';
import { ActiveTab } from '../types/plant';
import { Heart } from 'lucide-react';

interface FooterProps {
  setActiveTab: (tab: ActiveTab) => void;
  onOpenAddModal: () => void;
}

export const Footer: React.FC<FooterProps> = ({ setActiveTab, onOpenAddModal }) => {
  return (
    <footer className="bg-stone-900 text-stone-300 pt-12 pb-8 border-t border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 pb-8 border-b border-stone-800">
          {/* Brand & Purpose */}
          <div className="md:col-span-2 space-y-3">
            <div className="font-serif-display text-xl font-bold text-white tracking-tight">
              WHERE IS MY PLANT 🌿
            </div>
            <p className="text-xs text-stone-400 max-w-sm leading-relaxed">
              Find and explore plants around you. Real biodiversity occurrence records from GBIF designed for students, biology learners, and nature enthusiasts.
            </p>
            <div className="text-[11px] text-stone-500">
              Powered by real GBIF biodiversity occurrence data.
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-stone-200 uppercase tracking-wider">
              Navigation
            </div>
            <ul className="space-y-1.5 text-xs text-stone-400">
              <li>
                <button
                  onClick={() => {
                    setActiveTab('home');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('map');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Explore Map
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('search');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Search Plants
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('identify');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Identify Plant
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('add');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Add Plant
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('about');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  About
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('account');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Naturalist Account
                </button>
              </li>
            </ul>
          </div>

          {/* Student Actions */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-stone-200 uppercase tracking-wider">
              Field Hub
            </div>
            <ul className="space-y-1.5 text-xs text-stone-400">
              <li>
                <button
                  onClick={onOpenAddModal}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Log New Sighting
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('about');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Field Botany 101
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('about');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Student Pledge
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Quiet Copyright Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <div className="space-y-0.5 text-center sm:text-left">
            <div>
              © 2026 WHERE IS MY PLANT
            </div>
            <div className="text-stone-400 font-medium">
              Created by Sudipta Shil
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span>Crafted with botanical curiosity</span>
            <Heart className="w-3.5 h-3.5 text-emerald-500 inline fill-emerald-500" />
          </div>
        </div>
      </div>
    </footer>
  );
};
