import React, { useRef, useState } from 'react';
import { Download, ExternalLink, FolderUp, Play, Plus, Shield, Sparkles } from 'lucide-react';
import { GameMode } from '../game/VoxelEngine';
import { soundEngine } from '../game/audio';

interface TitleScreenProps {
  hasSavedWorld: boolean;
  onContinueWorld: () => void;
  onStartNewWorld: (seed: string, mode: GameMode) => void;
  onImportWorld: (file: File) => void;
  onOpenDownload: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hasSavedWorld,
  onContinueWorld,
  onStartNewWorld,
  onImportWorld,
  onOpenDownload,
}) => {
  const [creating, setCreating] = useState(false);
  const [seed, setSeed] = useState('Olmazor-777');
  const [mode, setMode] = useState<GameMode>('survival');
  const fileRef = useRef<HTMLInputElement>(null);
  const appUrl = typeof window !== 'undefined' ? window.location.href : '/';

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black/35 p-4 sm:p-6">
      <div className="w-full max-w-md text-center">
        {/* Classic Minecraft-inspired Blocky Title + Tilted Splash */}
        <div className="relative inline-block">
          <h1 className="font-display text-4xl font-bold tracking-wider text-zinc-100 drop-shadow-[0_5px_0_#2b2b2b] sm:text-6xl">
            CRAFTWORLD
          </h1>
          <span className="font-display absolute -bottom-3 -right-2 -rotate-12 text-xs font-bold text-yellow-300 drop-shadow-[0_2px_0_rgba(0,0,0,0.9)] sm:text-sm">
            Mobil &amp; PC · 1:1 Voxel!
          </span>
        </div>

        {!creating ? (
          <div className="mc-panel mt-9 space-y-2.5 p-4 shadow-2xl sm:p-5">
            {hasSavedWorld && (
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onContinueWorld();
                }}
                className="mc-button mc-button-primary flex w-full items-center justify-center gap-2.5 px-5 py-3.5 text-sm font-bold text-white whitespace-nowrap cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>O&apos;yinni Davom Ettirish</span>
              </button>
            )}

            <button
              onClick={() => {
                soundEngine.playClick();
                setCreating(true);
              }}
              className={`mc-button flex w-full items-center justify-center gap-2.5 px-5 py-3.5 text-sm font-bold text-white whitespace-nowrap cursor-pointer ${
                !hasSavedWorld ? 'mc-button-primary' : ''
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>Yangi Dunyo Yaratish</span>
            </button>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onOpenDownload();
                }}
                className="mc-button flex w-full items-center justify-center gap-2 px-3 py-3 text-xs font-bold text-emerald-300 whitespace-nowrap cursor-pointer sm:text-sm"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span>Yuklab Olish</span>
              </button>

              <a
                href={appUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => soundEngine.playClick()}
                className="mc-button flex w-full items-center justify-center gap-2 px-3 py-3 text-xs font-bold text-sky-300 no-underline whitespace-nowrap sm:text-sm"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span>Yangi Oynada Ochish</span>
              </a>
            </div>

            <button
              onClick={() => {
                soundEngine.playClick();
                fileRef.current?.click();
              }}
              className="mc-button flex w-full items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-zinc-100 whitespace-nowrap cursor-pointer"
            >
              <FolderUp className="h-4 w-4" />
              <span>Saqlangan Dunyo Faylini Yuklash</span>
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".json,.mcworld.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportWorld(file);
                e.target.value = '';
              }}
            />

            <div className="border-t border-white/10 pt-3 text-[11px] leading-relaxed text-zinc-300">
              PC/Noutbuk: X (1-bosish qo&apos;yish), O&apos;ng tugma/Q/Alt+Bosish, R poyezd, B 5400+ uy/qasr, F uchish, M xarita
              <br />
              Telefon: Chap joystik · Bosib turish — sindirish · Tez bosish / Qo&apos;yish tugmasi
            </div>
          </div>
        ) : (
          <div className="mc-panel mt-9 space-y-4 p-5 text-left shadow-2xl">
            <h2 className="font-display text-lg font-bold text-white">Yangi Dunyo Sozlamalari</h2>

            <div>
              <label className="block text-xs font-medium text-zinc-300">
                Dunyo Urug&apos;i (Seed)
              </label>
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Masalan: Toshkent-2026"
                className="mt-1.5 w-full border border-white/20 bg-[#121612] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-zinc-300">O&apos;yin Rejimi</span>
              <div className="mt-1.5 grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    soundEngine.playClick();
                    setMode('survival');
                  }}
                  className={`flex items-center justify-center gap-2 border px-3 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
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
                    setMode('creative');
                  }}
                  className={`flex items-center justify-center gap-2 border px-3 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                    mode === 'creative'
                      ? 'border-sky-400 bg-sky-900/50 text-white'
                      : 'border-white/15 bg-[#181c18] text-zinc-300'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Ijodiy (Uchish)</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  soundEngine.playClick();
                  setCreating(false);
                }}
                className="mc-button flex-1 py-3 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
              >
                Orqaga
              </button>
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onStartNewWorld(seed, mode);
                }}
                className="mc-button mc-button-primary flex-1 py-3 text-xs font-bold text-white whitespace-nowrap cursor-pointer"
              >
                Boshlash
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
