import { useCallback, useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { DownloadModal } from './components/DownloadModal';
import { GameHUD } from './components/GameHUD';
import { InventoryModal } from './components/InventoryModal';
import { PauseMenu } from './components/PauseMenu';
import { StructureShopModal } from './components/StructureShopModal';
import { TitleScreen } from './components/TitleScreen';
import { WorldMapModal } from './components/WorldMapModal';
import { generateOfflineGameHtml } from './game/offlineExporter';
import { GameMode, HudSnapshot, VoxelEngine } from './game/VoxelEngine';
import { WorldSaveData } from './game/world';
import { useOnlineStatus } from './hooks/useOnlineStatus';

const STORAGE_KEY = 'craftworld_save_v1';

const INITIAL_HUD: HudSnapshot = {
  fps: 60,
  x: 0,
  y: 32,
  z: 0,
  yaw: 0,
  biome: 'Tekislik',
  facing: 'Shimol (-Z)',
  health: 20,
  hunger: 20,
  air: 10,
  xpLevel: 0,
  xpProgress: 0,
  coins: 750,
  unlockedCount: 6,
  inWater: false,
  isFlying: false,
  placeMode: false,
  immortal: true,
  planetCurvature: true,
  targetIsDoor: false,
  ridingTrain: false,
  nearTrain: false,
  isBuildingHouse: false,
  activeBuildName: null,
  buildProgress: 0,
  isNight: false,
  nearbyZombies: 0,
  hurtFlash: 0,
  mode: 'survival',
  cameraPerspective: 0,
  targetBlockName: null,
  miningProgress: 0,
  timeOfDay: 0.3,
  hotbar: new Array(9).fill(null),
  selectedSlot: 0,
  pointerLocked: false,
};

function readLocalSave(): WorldSaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorldSaveData;
    if (!parsed || typeof parsed.seed !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);

  const [screen, setScreen] = useState<'title' | 'playing' | 'paused' | 'inventory'>('title');
  const [isCraftingTable, setIsCraftingTable] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [renderDistance, setRenderDistance] = useState(4);
  const [hasSavedWorld, setHasSavedWorld] = useState(() => !!readLocalSave());
  const [contextLost, setContextLost] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isOnline = useOnlineStatus();

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2800);
  }, []);

  const saveToLocal = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const data = engine.exportSaveData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setHasSavedWorld(true);
    } catch {
      // Ignore storage quota issues gracefully
    }
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const existingSave = readLocalSave();
    const engine = new VoxelEngine(
      mount,
      {
        onHudUpdate: (snapshot) => setHud(snapshot),
        onOpenInventory: (craftingTable) => {
          setIsCraftingTable(craftingTable);
          if (engineRef.current) engineRef.current.paused = true;
          setScreen('inventory');
        },
        onOpenShop: () => {
          if (document.pointerLockElement) document.exitPointerLock();
          if (engineRef.current) engineRef.current.paused = true;
          setShowShop(true);
        },
        onPauseRequest: () => {
          setScreen((prev) => {
            if (prev === 'playing') {
              if (engineRef.current) engineRef.current.paused = true;
              return 'paused';
            }
            return prev;
          });
        },
        onSleepNotice: (msg) => showNotice(msg),
        onWebGLContextLost: () => setContextLost(true),
      },
      existingSave ?? undefined
    );

    engine.menuPanorama = true;
    engine.paused = true;
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [showNotice]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault();
        setShowDebug((v) => !v);
      } else if (e.code === 'KeyM' && !e.repeat && (screen === 'playing' || showMap)) {
        e.preventDefault();
        setShowMap((prev) => {
          const next = !prev;
          if (next) {
            if (document.pointerLockElement) document.exitPointerLock();
            if (engineRef.current) engineRef.current.paused = true;
          } else if (screen === 'playing') {
            if (engineRef.current) {
              engineRef.current.paused = false;
              engineRef.current.requestLock();
            }
          }
          return next;
        });
      } else if (e.code === 'Escape') {
        if (showShop) {
          setShowShop(false);
          if (screen === 'playing' && engineRef.current) {
            engineRef.current.paused = false;
            engineRef.current.requestLock();
          }
          return;
        }
        if (showMap) {
          setShowMap(false);
          if (screen === 'playing' && engineRef.current) {
            engineRef.current.paused = false;
            engineRef.current.requestLock();
          }
          return;
        }
        if (showDownload) {
          setShowDownload(false);
          return;
        }
        if (screen === 'inventory') {
          if (engineRef.current) {
            engineRef.current.paused = false;
            engineRef.current.requestLock();
          }
          setScreen('playing');
        } else if (screen === 'paused') {
          if (engineRef.current) {
            engineRef.current.paused = false;
            engineRef.current.requestLock();
          }
          setScreen('playing');
        } else if (screen === 'playing') {
          if (engineRef.current) engineRef.current.paused = true;
          setScreen('paused');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, showDownload, showMap, showShop]);

  useEffect(() => {
    if (screen !== 'playing') return;
    const id = window.setInterval(() => {
      saveToLocal();
    }, 30000);
    return () => clearInterval(id);
  }, [screen, saveToLocal]);

  const handleContinueWorld = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const saved = readLocalSave();
    if (saved) engine.applySaveData(saved);
    engine.menuPanorama = false;
    engine.paused = false;
    setScreen('playing');
    engine.requestLock();
  };

  const handleStartNewWorld = (seed: string, mode: GameMode) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.initNewWorld(seed, mode);
    engine.menuPanorama = false;
    engine.paused = false;
    setScreen('playing');
    saveToLocal();
    engine.requestLock();
  };

  const handleImportWorld = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as WorldSaveData;
      if (!parsed || typeof parsed.seed !== 'number' || !Array.isArray(parsed.playerPos)) {
        showNotice("Noto'g'ri dunyo fayli formati");
        return;
      }
      const engine = engineRef.current;
      if (!engine) return;
      engine.applySaveData(parsed);
      engine.menuPanorama = false;
      engine.paused = false;
      setScreen('playing');
      saveToLocal();
      engine.requestLock();
      showNotice('Dunyo muvaffaqiyatli yuklandi');
    } catch {
      showNotice("Faylni o'qishda xatolik");
    }
  };

  const handleResume = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.paused = false;
    setScreen('playing');
    engine.requestLock();
  };

  const handleExitToTitle = () => {
    saveToLocal();
    const engine = engineRef.current;
    if (engine) {
      engine.paused = true;
      engine.menuPanorama = true;
    }
    setScreen('title');
  };

  const triggerFileDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadOfflineHtml = () => {
    const engine = engineRef.current;
    const save = engine ? engine.exportSaveData() : readLocalSave();
    if (!save) return;
    const html = generateOfflineGameHtml(save);
    triggerFileDownload('CraftWorld_Offline.html', html, 'text/html;charset=utf-8');
    showNotice("Oflayn o'yin fayli yuklab olindi");
  };

  const handleExportWorldJson = () => {
    const engine = engineRef.current;
    const save = engine ? engine.exportSaveData() : readLocalSave();
    if (!save) return;
    const safeName = (save.seedText || 'dunyo').replace(/[^a-zA-Z0-9_-]/g, '_');
    triggerFileDownload(
      `CraftWorld_${safeName}.mcworld.json`,
      JSON.stringify(save),
      'application/json'
    );
    showNotice('Dunyo fayli saqlandi');
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#111711]">
      <div ref={canvasMountRef} className="fixed inset-0 h-full w-full" />

      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 text-center text-white">
          <div className="mc-panel max-w-sm p-6">
            <h2 className="font-display text-lg font-bold">Grafik kontekst uzildi</h2>
            <p className="mt-2 text-xs text-zinc-300">
              WebGL konteksti qayta ishga tushirishni talab qilmoqda.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mc-button mc-button-primary mt-4 px-5 py-2 text-xs font-semibold cursor-pointer"
            >
              Sahifani yangilash
            </button>
          </div>
        </div>
      )}

      {screen === 'title' && (
        <TitleScreen
          hasSavedWorld={hasSavedWorld}
          onContinueWorld={handleContinueWorld}
          onStartNewWorld={handleStartNewWorld}
          onImportWorld={handleImportWorld}
          onOpenDownload={() => setShowDownload(true)}
        />
      )}

      {screen === 'playing' && (
        <GameHUD
          hud={hud}
          showDebug={showDebug}
          onToggleDebug={() => setShowDebug((v) => !v)}
          onCycleCamera={() => engineRef.current?.cycleCameraPerspective()}
          onToggleFlight={() => engineRef.current?.toggleFlight()}
          onTogglePlaceMode={() => engineRef.current?.togglePlaceMode()}
          onToggleDoor={() => engineRef.current?.toggleTargetDoor()}
          onToggleTrainRide={() => engineRef.current?.toggleRideTrain()}
          onFlyVertical={(dir) => engineRef.current?.setFlyVertical(dir)}
          onOpenShop={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            if (engineRef.current) engineRef.current.paused = true;
            setShowShop(true);
          }}
          onCancelBuild={() => engineRef.current?.cancelAutoBuild()}
          onToggleDayNight={() => engineRef.current?.toggleDayNight()}
          onOpenMap={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            if (engineRef.current) engineRef.current.paused = true;
            setShowMap(true);
          }}
          onSelectSlot={(slot) => engineRef.current?.setSelectedSlot(slot)}
          onOpenInventory={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            if (engineRef.current) engineRef.current.paused = true;
            setIsCraftingTable(false);
            setScreen('inventory');
          }}
          onOpenPause={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            if (engineRef.current) engineRef.current.paused = true;
            setScreen('paused');
          }}
          onOpenDownload={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            if (engineRef.current) engineRef.current.paused = true;
            setScreen('paused');
            setShowDownload(true);
          }}
          onTouchMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
          onTouchJump={() => engineRef.current?.triggerTouchJump()}
          onTouchBreak={() => engineRef.current?.triggerTouchBreak()}
          onTouchPlace={() => engineRef.current?.triggerTouchPlace()}
        />
      )}

      {screen === 'inventory' && engineRef.current && (
        <InventoryModal
          mode={hud.mode}
          isCraftingTable={isCraftingTable}
          hotbar={engineRef.current.hotbar}
          inventory={engineRef.current.inventory}
          onUpdateStorage={(hb, inv) => {
            if (!engineRef.current) return;
            engineRef.current.hotbar = hb;
            engineRef.current.inventory = inv;
            engineRef.current.updateViewModelBlock();
          }}
          onClose={handleResume}
        />
      )}

      {screen === 'paused' && !showDownload && !showMap && !showShop && (
        <PauseMenu
          mode={hud.mode}
          renderDistance={renderDistance}
          timeOfDay={hud.timeOfDay}
          immortal={hud.immortal}
          planetCurvature={hud.planetCurvature}
          onResume={handleResume}
          onToggleMode={(mode) => {
            if (!engineRef.current) return;
            engineRef.current.mode = mode;
            setHud((prev) => ({ ...prev, mode }));
          }}
          onToggleImmortal={() => engineRef.current?.toggleImmortal()}
          onTogglePlanetCurvature={() => engineRef.current?.togglePlanetCurvature()}
          onChangeRenderDistance={(dist) => {
            setRenderDistance(dist);
            if (engineRef.current) engineRef.current.renderDistance = dist;
          }}
          onSetTimeOfDay={(t) => {
            if (engineRef.current) engineRef.current.timeOfDay = t;
          }}
          onSaveLocal={() => {
            saveToLocal();
            showNotice('Dunyo saqlandi');
          }}
          onOpenDownload={() => setShowDownload(true)}
          onExitToTitle={handleExitToTitle}
        />
      )}

      <WorldMapModal
        open={showMap}
        world={engineRef.current?.world ?? null}
        playerX={hud.x}
        playerY={hud.y}
        playerZ={hud.z}
        playerYaw={hud.yaw}
        mobMarkers={showMap ? engineRef.current?.getMobMarkers() : []}
        onTeleport={(wx, wz) => {
          engineRef.current?.teleportTo(wx, wz);
          showNotice(`Teleport qilindi: X ${wx}, Z ${wz}`);
        }}
        onClose={() => {
          setShowMap(false);
          if (screen === 'playing' && engineRef.current) {
            engineRef.current.paused = false;
            engineRef.current.requestLock();
          }
        }}
      />

      <StructureShopModal
        open={showShop}
        mode={hud.mode}
        coins={hud.coins}
        unlockedStructures={
          engineRef.current?.unlockedStructures ?? new Set([1, 2, 3, 4, 5, 6])
        }
        isBuilding={hud.isBuildingHouse}
        onBuyStructure={(id) => engineRef.current?.buyStructure(id) ?? false}
        onBuildStructure={(id) => engineRef.current?.startAutoBuildStructure(id)}
        onRandomBuild={() => engineRef.current?.startRandomAutoBuild()}
        onCancelBuild={() => engineRef.current?.cancelAutoBuild()}
        onClose={() => {
          setShowShop(false);
          if (screen === 'playing' && engineRef.current) {
            engineRef.current.paused = false;
            engineRef.current.requestLock();
          }
        }}
      />

      <DownloadModal
        open={showDownload}
        onClose={() => setShowDownload(false)}
        onDownloadOfflineHtml={handleDownloadOfflineHtml}
        onExportWorldJson={handleExportWorldJson}
      />

      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 border border-amber-400/40 bg-amber-950/90 px-3 py-1.5 text-xs font-medium text-amber-200">
          <WifiOff className="h-3.5 w-3.5" />
          <span>Oflayn rejim faol</span>
        </div>
      )}

      {notice && (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 border border-emerald-400/40 bg-[#142014] px-4 py-2 text-xs font-semibold text-emerald-200 shadow-lg">
          {notice}
        </div>
      )}
    </div>
  );
}
