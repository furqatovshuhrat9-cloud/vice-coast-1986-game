import React, { useState } from 'react';
import { Download, ExternalLink, Globe, Home, Infinity as InfinityIcon, Play, Save, Sun, Volume2, Shield, Sparkles } from 'lucide-react';
import { GameMode } from '../game/VoxelEngine';
import { soundEngine } from '../game/audio';

interface PauseMenuProps {
  mode: GameMode;
  renderDistance: number;
  timeOfDay: number;
  immortal: boolean;
  planetCurvature: boolean;
  onResume: () => void;
  onToggleMode: (mode: GameMode) => void;
  onToggleImmortal: () => void;
  onTogglePlanetCurvature: () => void;
  onChangeRenderDistance: (dist: number) => void;
  onSetTimeOfDay: (t: number) => void;
  onSaveLocal: () => void;
  onOpenDownload: () => void;
  onExitToTitle: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  mode,
  renderDistance,
  timeOfDay,
  immortal,
  planetCurvature,
  onResume,
  onToggleMode,
  onToggleImmortal,
  onTogglePlanetCurvature,
  onChangeRenderDistance,
  onSetTimeOfDay,
  onSaveLocal,
  onOpenDownload,
  onExitToTitle,
}) => {
  const [volume, setVolume] = useState(Math.round(soundEngine.volume * 100));
  const [savedNotice, setSavedNotice] = useState(false);

  const handleVolume = (val: number) => {
    setVolume(val);
    soundEngine.volume = val / 100;
  };

  const handleSave = () => {
    soundEngine.playClick();
    onSaveLocal();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4">
      <div className="mc-panel w-full max-w-md space-y-4 p-6 text-white shadow-2xl">
        <h2 className="text-center font-display text-2xl font-bold tracking-wide">
          O&apos;yin Pauzada
        </h2>

        <button
          onClick={() => {
            soundEngine.playClick();
            onResume();
          }}
          className="mc-button mc-button-primary flex w-full items-center justify-center gap-2 py-3 text-sm font-bold whitespace-nowrap cursor-pointer"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>O&apos;yinga Qaytish</span>
        </button>

        {/* Mode switch */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => {
              soundEngine.playClick();
              onToggleMode('survival');
            }}
            className={`flex items-center justify-center gap-2 border py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              mode === 'survival'
                ? 'border-emerald-400 bg-emerald-900/50 text-white'
                : 'border-white/15 bg-[#181c18] text-zinc-300'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Omon qolish</span>
          </button>
          <button
            onClick={() => {
              soundEngine.playClick();
              onToggleMode('creative');
            }}
            className={`flex items-center justify-center gap-2 border py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              mode === 'creative'
                ? 'border-sky-400 bg-sky-900/50 text-white'
                : 'border-white/15 bg-[#181c18] text-zinc-300'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Ijodiy rejim</span>
          </button>
        </div>

        {/* Endless Life & Round-Square Earth toggles */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => onToggleImmortal()}
            className={`flex items-center justify-center gap-1.5 border py-2 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              immortal
                ? 'border-amber-400 bg-amber-900/45 text-amber-200'
                : 'border-white/15 bg-[#181c18] text-zinc-300'
            }`}
          >
            <InfinityIcon className="h-4 w-4" />
            <span>Abadiy hayot: {immortal ? 'ON' : 'OFF'}</span>
          </button>
          <button
            onClick={() => onTogglePlanetCurvature()}
            className={`flex items-center justify-center gap-1.5 border py-2 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              planetCurvature
                ? 'border-sky-400 bg-sky-900/45 text-sky-200'
                : 'border-white/15 bg-[#181c18] text-zinc-300'
            }`}
          >
            <Globe className="h-4 w-4" />
            <span>Dumaloq Yer: {planetCurvature ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Time presets */}
        <div>
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Sun className="h-3.5 w-3.5 text-amber-300" />
              Kun vaqti
            </span>
            <span className="font-mono-hud">{Math.round(timeOfDay * 24)}:00</span>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {[
              { label: 'Tong', val: 0.27 },
              { label: 'Kunduz', val: 0.5 },
              { label: 'Shom', val: 0.74 },
              { label: 'Tun', val: 0.0 },
            ].map((t) => (
              <button
                key={t.label}
                onClick={() => {
                  soundEngine.playClick();
                  onSetTimeOfDay(t.val);
                }}
                className="mc-button py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-3 border-t border-white/10 pt-3">
          <div>
            <div className="flex justify-between text-xs text-zinc-300">
              <span>Ko&apos;rish masofasi (Chunk)</span>
              <span className="font-mono-hud">{renderDistance} chunk</span>
            </div>
            <input
              type="range"
              min={2}
              max={8}
              value={renderDistance}
              onChange={(e) => onChangeRenderDistance(Number(e.target.value))}
              className="mt-1 w-full accent-emerald-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-300">
              <span className="flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5" />
                Ovoz balandligi
              </span>
              <span className="font-mono-hud">{volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => handleVolume(Number(e.target.value))}
              className="mt-1 w-full accent-emerald-500"
            />
          </div>
        </div>

        {/* Save, Download & Open in New Window Actions */}
        <div className="grid grid-cols-2 gap-2.5 border-t border-white/10 pt-3">
          <button
            onClick={handleSave}
            className="mc-button flex items-center justify-center gap-2 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            <Save className="h-4 w-4 text-amber-300" />
            <span>{savedNotice ? 'Saqlandi!' : 'Dunyoni Saqlash'}</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenDownload();
            }}
            className="mc-button flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-emerald-300 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Yuklab olish</span>
          </button>
        </div>

        <a
          href={typeof window !== 'undefined' ? window.location.href : '/'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => soundEngine.playClick()}
          className="mc-button flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold text-sky-300 no-underline whitespace-nowrap"
        >
          <ExternalLink className="h-4 w-4" />
          <span>Yangi Oynada Ochish</span>
        </a>

        <button
          onClick={() => {
            soundEngine.playClick();
            onExitToTitle();
          }}
          className="mc-button flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold text-zinc-200 whitespace-nowrap cursor-pointer"
        >
          <Home className="h-4 w-4" />
          <span>Saqlash va Bosh Menyuga Chiqish</span>
        </button>
      </div>
    </div>
  );
};
