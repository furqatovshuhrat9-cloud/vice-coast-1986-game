import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Backpack,
  Building2,
  Camera,
  Coins,
  DoorOpen,
  Download,
  ExternalLink,
  Feather,
  Gamepad2,
  Infinity as InfinityIcon,
  Map as MapIcon,
  Moon,
  MousePointerClick,
  Pause,
  Sun,
  Terminal,
  TrainFront,
  X,
} from 'lucide-react';
import { getBlockDef } from '../game/blocks';
import { getBlockIconUrl } from '../game/textures';
import { HudSnapshot } from '../game/VoxelEngine';
import { soundEngine } from '../game/audio';

interface GameHUDProps {
  hud: HudSnapshot;
  showDebug: boolean;
  onToggleDebug: () => void;
  onCycleCamera: () => void;
  onToggleFlight: () => void;
  onTogglePlaceMode: () => void;
  onToggleDoor: () => void;
  onToggleTrainRide: () => void;
  onFlyVertical: (dir: -1 | 0 | 1) => void;
  onOpenShop: () => void;
  onCancelBuild: () => void;
  onToggleDayNight: () => void;
  onOpenMap: () => void;
  onSelectSlot: (slot: number) => void;
  onOpenInventory: () => void;
  onOpenPause: () => void;
  onOpenDownload: () => void;
  onTouchMove: (x: number, y: number) => void;
  onTouchJump: () => void;
  onTouchBreak: () => void;
  onTouchPlace: () => void;
}

const PixelHeart: React.FC<{ state: 'full' | 'half' | 'empty' }> = ({ state }) => (
  <svg viewBox="0 0 9 9" className="h-3.5 w-3.5 sm:h-4 sm:w-4 pixelated drop-shadow-[0_1px_0_rgba(0,0,0,0.85)]">
    <path
      d="M1 2h2v1h1v1h1V3h1V2h2v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2z"
      fill="#18181b"
      stroke="#18181b"
      strokeWidth="1"
    />
    {state !== 'empty' && (
      <path
        d={
          state === 'full'
            ? 'M1 2h2v1h1v1h1V3h1V2h2v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2z'
            : 'M1 2h2v1h1v1h1v4H4V7H3V6H2V5H1V2z'
        }
        fill="#ef4444"
      />
    )}
    {state !== 'empty' && <rect x="2" y="2" width="1" height="1" fill="#fca5a5" />}
  </svg>
);

const PixelHunger: React.FC<{ state: 'full' | 'half' | 'empty' }> = ({ state }) => (
  <svg viewBox="0 0 9 9" className="h-3.5 w-3.5 sm:h-4 sm:w-4 pixelated drop-shadow-[0_1px_0_rgba(0,0,0,0.85)]">
    <path d="M4 1h3v3H6v1H5v1H3v2H2V6h1V5h1V4H3V2h1V1z" fill="#18181b" stroke="#18181b" strokeWidth="1" />
    {state !== 'empty' && (
      <path
        d={state === 'full' ? 'M4 1h3v3H6v1H5v1H3v2H2V6h1V5h1V4H3V2h1V1z' : 'M4 1h3v3H6v1H4V1z'}
        fill="#d97706"
      />
    )}
    {state !== 'empty' && <rect x="2" y="6" width="1" height="1" fill="#fef3c7" />}
  </svg>
);

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  showDebug,
  onToggleDebug,
  onCycleCamera,
  onToggleFlight,
  onTogglePlaceMode,
  onToggleDoor,
  onToggleTrainRide,
  onFlyVertical,
  onOpenShop,
  onCancelBuild,
  onToggleDayNight,
  onOpenMap,
  onSelectSlot,
  onOpenInventory,
  onOpenPause,
  onOpenDownload,
  onTouchMove,
  onTouchJump,
  onTouchBreak,
  onTouchPlace,
}) => {
  const [touchMode, setTouchMode] = useState(false);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const joyRef = useRef<HTMLDivElement>(null);
  const joyTouchId = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
      setTouchMode(true);
    }
  }, []);

  const updateJoystick = (clientX: number, clientY: number) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2 - 14;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setKnobOffset({ x: dx, y: dy });
    onTouchMove(dx / maxR, -dy / maxR);
  };

  const resetJoystick = () => {
    joyTouchId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onTouchMove(0, 0);
  };

  const activeItem = hud.hotbar[hud.selectedSlot];
  const activeItemName = activeItem ? getBlockDef(activeItem.id).name : null;
  const appUrl = typeof window !== 'undefined' ? window.location.href : '/';

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between">
      {/* Underwater tint */}
      {hud.inWater && <div className="pointer-events-none fixed inset-0 bg-sky-700/35" />}

      {/* Red Damage Vignette on Zombie Attack or Fall */}
      {hud.hurtFlash > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            background: `radial-gradient(circle, transparent 48%, rgba(220, 38, 38, ${Math.min(
              0.68,
              hud.hurtFlash * 0.65
            )}) 100%)`,
          }}
        />
      )}

      {/* Center Crosshair + Mining Progress Ring */}
      <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative flex h-10 w-10 items-center justify-center">
          {hud.miningProgress > 0.02 && (
            <svg className="absolute inset-0 h-10 w-10 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="rgba(255,255,255,0.28)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="#4ade80"
                strokeWidth="3"
                strokeDasharray="94.2"
                strokeDashoffset={94.2 * (1 - Math.min(1, hud.miningProgress))}
              />
            </svg>
          )}
          <div className="relative h-5 w-5 mix-blend-difference">
            <div className="absolute left-1/2 top-0 h-5 w-0.5 -translate-x-1/2 bg-white" />
            <div className="absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 bg-white" />
          </div>
        </div>
      </div>

      {/* Top Bar */}
      <div className="flex items-start justify-between gap-2 p-2.5 sm:p-4">
        <div className="pointer-events-auto">
          {showDebug ? (
            <div className="font-mono-hud border border-white/15 bg-black/75 px-3 py-2 text-[11px] leading-relaxed text-zinc-100 sm:text-xs">
              <div className="font-bold text-emerald-300">CraftWorld · {hud.fps} FPS</div>
              <div>
                XYZ: {hud.x.toFixed(1)} / {hud.y.toFixed(1)} / {hud.z.toFixed(1)}
              </div>
              <div>
                Biom: {hud.biome} · {hud.facing}
              </div>
              <div>
                Rejim: {hud.mode === 'creative' ? 'Ijodiy' : 'Omon qolish'}
                {hud.isFlying ? ' (Osmonda uchish)' : ''}
              </div>
              {hud.targetBlockName && <div>Nishon: {hud.targetBlockName}</div>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 border border-amber-500/40 bg-black/70 px-2.5 py-1 text-xs font-bold text-amber-300">
                <Coins className="h-3.5 w-3.5 text-amber-400" />
                <span>{hud.mode === 'creative' ? 'Ijodiy' : `${hud.coins.toLocaleString()} tanga`}</span>
              </span>
              {hud.targetBlockName && (
                <span className="bg-black/60 px-2.5 py-1 text-xs font-medium text-zinc-100">
                  {hud.targetBlockName}
                </span>
              )}
              {hud.targetIsDoor && (
                <button
                  onClick={() => onToggleDoor()}
                  className="mc-button mc-button-primary flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-100 cursor-pointer"
                >
                  <DoorOpen className="h-3.5 w-3.5" />
                  <span>Eshikni ochish / yopish (G)</span>
                </button>
              )}
              {hud.placeMode && (
                <span className="border border-emerald-400/50 bg-emerald-950/90 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                  1-Bosish: Qo&apos;yish faol
                </span>
              )}
              {hud.ridingTrain && (
                <span className="border border-amber-400/50 bg-amber-950/90 px-2.5 py-1 text-xs font-semibold text-amber-200">
                  Poyezd · W/S yurish · R/Space tushish
                </span>
              )}
              {hud.isFlying && (
                <span className="bg-sky-900/90 px-2.5 py-1 text-xs font-semibold text-sky-200">
                  Uchish (Space/Shift · Y:{Math.round(hud.y)})
                </span>
              )}
              {hud.isNight && (
                <span className="border border-rose-500/40 bg-rose-950/90 px-2.5 py-1 text-xs font-semibold text-rose-200">
                  Kechki hujum · {hud.nearbyZombies} zombi
                </span>
              )}
            </div>
          )}
        </div>

        {/* Top-Right Compact Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 sm:gap-1.5">
          <button
            onClick={() => onTogglePlaceMode()}
            title="Noutbukda 1 marta bosish bilan blok qo'yish rejimi (X)"
            className={`mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer sm:px-2.5 ${
              hud.placeMode ? 'mc-button-primary text-emerald-100' : 'text-emerald-200'
            }`}
          >
            <MousePointerClick className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {hud.placeMode ? "Qo'yish: ON (X)" : "Qo'yish (X)"}
            </span>
          </button>

          <button
            onClick={() => onToggleTrainRide()}
            title="Poyezdga minish / qo'yish (R)"
            className={`mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer sm:px-2.5 ${
              hud.ridingTrain ? 'mc-button-primary text-amber-200' : 'text-amber-200'
            }`}
          >
            <TrainFront className="h-3.5 w-3.5" />
            <span className="hidden md:inline">
              {hud.ridingTrain ? 'Tushish (R)' : 'Poyezd (R)'}
            </span>
          </button>

          <button
            onClick={() => {
              onToggleFlight();
            }}
            title="Osmonga uchish (F yoki 2x Space)"
            className={`mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer sm:px-2.5 ${
              hud.isFlying ? 'mc-button-primary text-sky-200' : 'text-white'
            }`}
          >
            <Feather className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Uchish (F)</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenShop();
            }}
            title="5,400+ Uy, Qasr va Saroylar do'koni (B)"
            className="mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-amber-200 whitespace-nowrap cursor-pointer sm:px-2.5"
          >
            <Building2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Uy / Qasr (B)</span>
          </button>

          <button
            onClick={() => {
              onToggleDayNight();
            }}
            title="Kun / Tun va Zombi hujumi (N)"
            className={`mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer sm:px-2.5 ${
              hud.isNight ? 'text-amber-300' : 'text-indigo-200'
            }`}
          >
            {hud.isNight ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{hud.isNight ? 'Tong' : 'Tun'}</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenMap();
            }}
            title="Butun dunyo xaritasi (M)"
            className="mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-sky-200 whitespace-nowrap cursor-pointer sm:px-2.5"
          >
            <MapIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Xarita</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              onCycleCamera();
            }}
            title="Kamera (F5)"
            className="mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-white cursor-pointer sm:px-2.5"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">F5</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              onToggleDebug();
            }}
            title="Koordinatalar (F3)"
            className="mc-button hidden items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white md:flex cursor-pointer"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>F3</span>
          </button>

          <button
            onClick={() => setTouchMode((v) => !v)}
            title="Telefon boshqaruvi"
            className={`mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold cursor-pointer sm:px-2.5 ${
              touchMode ? 'text-emerald-300' : 'text-white'
            }`}
          >
            <Gamepad2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenInventory();
            }}
            className="mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-white whitespace-nowrap cursor-pointer sm:px-2.5"
          >
            <Backpack className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inventar</span>
          </button>

          <a
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => soundEngine.playClick()}
            title="Yangi oynada ochish"
            className="mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-zinc-100 no-underline whitespace-nowrap sm:px-2.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Yangi oyna</span>
          </a>

          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenDownload();
            }}
            title="Ilovani yuklab olish"
            className="mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-emerald-300 whitespace-nowrap cursor-pointer sm:px-2.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Yuklab olish</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenPause();
            }}
            className="mc-button flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-white whitespace-nowrap cursor-pointer sm:px-2.5"
          >
            <Pause className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Menyu</span>
          </button>
        </div>
      </div>

      {/* Bottom HUD: Mobile Joystick & Actions + Build Progress + Survival Bars + XP + Hotbar */}
      <div className="relative flex flex-col items-center pb-2 sm:pb-4">
        {hud.isBuildingHouse && (
          <div className="pointer-events-auto mb-2 flex items-center gap-3 border border-amber-400/50 bg-[#1a1812] px-3 py-1.5 text-xs text-amber-200 shadow-lg">
            <span>
              {hud.activeBuildName || 'Inshoot'} taxlanmoqda: {Math.round(hud.buildProgress * 100)}%
            </span>
            <div className="h-2 w-24 border border-black/80 bg-zinc-900">
              <div
                className="h-full bg-amber-400 transition-[width] duration-100"
                style={{ width: `${Math.round(hud.buildProgress * 100)}%` }}
              />
            </div>
            <button
              onClick={() => {
                soundEngine.playClick();
                onCancelBuild();
              }}
              title="Qurilishni to'xtatish"
              className="border border-rose-500/40 bg-rose-950/80 p-1 text-rose-200 hover:bg-rose-900 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {touchMode && (
          <div className="pointer-events-none mb-2 flex w-full items-end justify-between px-3 sm:px-6">
            {/* Analog Virtual Joystick */}
            <div
              ref={joyRef}
              onTouchStart={(e) => {
                e.stopPropagation();
                if (joyTouchId.current === null && e.changedTouches.length > 0) {
                  const t = e.changedTouches[0];
                  joyTouchId.current = t.identifier;
                  updateJoystick(t.clientX, t.clientY);
                }
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                for (let i = 0; i < e.changedTouches.length; i++) {
                  const t = e.changedTouches[i];
                  if (t.identifier === joyTouchId.current) {
                    updateJoystick(t.clientX, t.clientY);
                    break;
                  }
                }
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                resetJoystick();
              }}
              onTouchCancel={(e) => {
                e.stopPropagation();
                resetJoystick();
              }}
              className="pointer-events-auto relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-white/30 bg-black/45 touch-none"
            >
              <div
                style={{
                  transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
                }}
                className="h-11 w-11 rounded-full border-2 border-white/75 bg-white/35"
              />
            </div>

            {/* Right Touch Action Cluster */}
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              {hud.isFlying && (
                <div className="flex items-center gap-2">
                  <button
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      onFlyVertical(1);
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      onFlyVertical(0);
                    }}
                    onTouchCancel={() => onFlyVertical(0)}
                    onMouseDown={() => onFlyVertical(1)}
                    onMouseUp={() => onFlyVertical(0)}
                    onMouseLeave={() => onFlyVertical(0)}
                    className="mc-button flex h-10 items-center gap-1 px-3 text-xs font-bold text-sky-200 cursor-pointer"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    <span>Ko&apos;tarilish</span>
                  </button>
                  <button
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      onFlyVertical(-1);
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      onFlyVertical(0);
                    }}
                    onTouchCancel={() => onFlyVertical(0)}
                    onMouseDown={() => onFlyVertical(-1)}
                    onMouseUp={() => onFlyVertical(0)}
                    onMouseLeave={() => onFlyVertical(0)}
                    className="mc-button flex h-10 items-center gap-1 px-3 text-xs font-bold text-sky-200 cursor-pointer"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    <span>Tushish</span>
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTouchBreak();
                  }}
                  className="mc-button h-11 px-3.5 text-xs font-bold text-rose-200 cursor-pointer touch-none"
                >
                  Buzish
                </button>
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTouchPlace();
                  }}
                  className="mc-button h-11 px-3.5 text-xs font-bold text-emerald-200 cursor-pointer touch-none"
                >
                  Qo&apos;yish
                </button>
              </div>
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTouchJump();
                }}
                className="mc-button mc-button-primary h-12 w-28 text-xs font-bold text-white cursor-pointer touch-none"
              >
                {hud.isFlying ? 'Uchish/Tush' : 'Sakrash'}
              </button>
            </div>
          </div>
        )}

        {/* Active Item Name */}
        {activeItemName && (
          <div className="mb-1 bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white sm:text-xs">
            {activeItemName}
          </div>
        )}

        {/* Survival Hearts, Hunger & XP Bar */}
        {hud.mode === 'survival' && (
          <div className="mb-1 w-[332px] max-w-[96vw] space-y-1 sm:w-[444px]">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 10 }).map((_, i) => {
                  const hp = hud.health - i * 2;
                  const state = hp >= 2 ? 'full' : hp === 1 ? 'half' : 'empty';
                  return <PixelHeart key={i} state={state} />;
                })}
                {hud.immortal && (
                  <span
                    title="Abadiy Hayot faol"
                    className="ml-1 flex items-center gap-0.5 bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                  >
                    <InfinityIcon className="h-3 w-3" />
                    <span>Abadiy</span>
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end gap-0.5">
                {hud.inWater && (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-2 w-2 rounded-full border border-sky-200 ${
                          i < hud.air ? 'bg-sky-400' : 'bg-transparent opacity-30'
                        }`}
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const hg = hud.hunger - (9 - i) * 2;
                    const state = hg >= 2 ? 'full' : hg === 1 ? 'half' : 'empty';
                    return <PixelHunger key={i} state={state} />;
                  })}
                </div>
              </div>
            </div>

            {/* Classic Green XP Bar */}
            <div className="relative h-1.5 w-full border border-black/80 bg-[#1a2416]">
              <div
                className="h-full bg-[#80ff20] transition-[width] duration-150"
                style={{ width: `${Math.round(hud.xpProgress * 100)}%` }}
              />
              {hud.xpLevel > 0 && (
                <span className="font-mono-hud absolute left-1/2 -top-3.5 -translate-x-1/2 text-[11px] font-bold text-[#80ff20] drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                  {hud.xpLevel}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 9-Slot Responsive Hotbar */}
        <div
          onTouchStart={(e) => e.stopPropagation()}
          className="pointer-events-auto flex max-w-[98vw] items-center gap-0.5 border-2 border-black/80 bg-[#1a1d1a]/92 p-1 shadow-xl sm:gap-1"
        >
          {hud.hotbar.map((slot, i) => {
            const active = i === hud.selectedSlot;
            return (
              <button
                key={i}
                onClick={() => onSelectSlot(i)}
                className={`relative flex h-9 w-9 items-center justify-center sm:h-12 sm:w-12 cursor-pointer ${
                  active ? 'mc-slot-active' : 'mc-slot'
                }`}
              >
                <span className="font-mono-hud absolute left-0.5 top-0 text-[9px] text-white/45 sm:left-1 sm:top-0.5 sm:text-[10px]">
                  {i + 1}
                </span>
                {slot && slot.count > 0 && (
                  <>
                    <img
                      src={getBlockIconUrl(slot.id)}
                      alt={getBlockDef(slot.id).name}
                      className="pixelated h-6 w-6 object-contain sm:h-8 sm:w-8"
                    />
                    {slot.count > 1 && hud.mode === 'survival' && (
                      <span className="font-mono-hud absolute bottom-0 right-0.5 text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)] sm:bottom-0.5 sm:right-1 sm:text-[11px]">
                        {slot.count}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
