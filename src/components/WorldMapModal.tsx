import React, { useEffect, useRef, useState } from 'react';
import { Compass, Crosshair, Globe, Map as MapIcon, Navigation, X, ZoomIn, ZoomOut } from 'lucide-react';
import { BlockId } from '../game/blocks';
import { soundEngine } from '../game/audio';
import { VoxelWorld } from '../game/world';

interface WorldMapModalProps {
  open: boolean;
  world: VoxelWorld | null;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  mobMarkers?: { x: number; z: number; hostile: boolean }[];
  onTeleport: (wx: number, wz: number) => void;
  onClose: () => void;
}

// 64 * 556 = 35,584 radius (71,168 x 71,168 blocks — 556x wider scale!)
const ZOOM_RADII = [64, 192, 640, 2048, 6400, 16000, 35584];

function blockToRgb(id: BlockId, y: number): [number, number, number] {
  const shade = Math.max(-28, Math.min(32, (y - 25) * 2.2));
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

  let base: [number, number, number] = [92, 148, 60];
  switch (id) {
    case BlockId.WATER: {
      const depthTint = Math.max(-18, (y - 22) * 3);
      return [clamp(38 + depthTint), clamp(106 + depthTint), clamp(205 + depthTint)];
    }
    case BlockId.LAVA:
    case BlockId.MAGMA_BLOCK:
      base = [245, 102, 24];
      break;
    case BlockId.RAIL:
    case BlockId.POWERED_RAIL:
      base = [196, 178, 132];
      break;
    case BlockId.SAND:
    case BlockId.SANDSTONE:
      base = [219, 204, 142];
      break;
    case BlockId.SNOW:
    case BlockId.PACKED_ICE:
      base = [242, 247, 252];
      break;
    case BlockId.QUARTZ_BLOCK:
    case BlockId.PILLAR_QUARTZ:
    case BlockId.WHITE_CONCRETE:
      base = [235, 234, 228];
      break;
    case BlockId.STONE:
    case BlockId.COBBLESTONE:
    case BlockId.GRAVEL:
    case BlockId.STONE_BRICKS:
    case BlockId.ANDESITE:
    case BlockId.GRAY_CONCRETE:
      base = [132, 136, 142];
      break;
    case BlockId.DEEPSLATE:
    case BlockId.OBSIDIAN:
    case BlockId.BLACK_WOOL:
      base = [48, 50, 58];
      break;
    case BlockId.PRISMARINE:
    case BlockId.CYAN_CONCRETE:
    case BlockId.SEA_LANTERN:
      base = [76, 168, 164];
      break;
    case BlockId.GOLD_BLOCK:
    case BlockId.YELLOW_WOOL:
    case BlockId.HAY_BALE:
      base = [238, 198, 54];
      break;
    case BlockId.EMERALD_BLOCK:
    case BlockId.GREEN_WOOL:
    case BlockId.MOSS_BLOCK:
      base = [52, 186, 86];
      break;
    case BlockId.LAPIS_BLOCK:
    case BlockId.BLUE_WOOL:
      base = [46, 92, 196];
      break;
    case BlockId.RED_WOOL:
    case BlockId.RED_TERRACOTTA:
    case BlockId.NETHER_BRICKS:
    case BlockId.PURPUR_BLOCK:
      base = [164, 58, 72];
      break;
    case BlockId.OAK_LEAVES:
      base = [54, 116, 40];
      break;
    case BlockId.OAK_LOG:
    case BlockId.OAK_PLANKS:
    case BlockId.SPRUCE_LOG:
    case BlockId.SPRUCE_PLANKS:
    case BlockId.BIRCH_LOG:
    case BlockId.BIRCH_PLANKS:
    case BlockId.DARK_OAK_PLANKS:
      base = [148, 108, 66];
      break;
    case BlockId.BRICKS:
      base = [178, 68, 52];
      break;
    case BlockId.GLASS:
      base = [165, 224, 240];
      break;
    case BlockId.TORCH:
    case BlockId.GLOWSTONE:
    case BlockId.LANTERN:
      base = [250, 204, 21];
      break;
    case BlockId.CACTUS:
      base = [36, 130, 56];
      break;
    case BlockId.DIRT:
      base = [122, 84, 54];
      break;
    case BlockId.GRASS:
    default:
      base = [96, 158, 62];
      break;
  }
  return [clamp(base[0] + shade), clamp(base[1] + shade), clamp(base[2] + shade)];
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  open,
  world,
  playerX,
  playerY,
  playerZ,
  playerYaw,
  mobMarkers = [],
  onTeleport,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoomIdx, setZoomIdx] = useState(1);
  const [center, setCenter] = useState({ x: Math.round(playerX), z: Math.round(playerZ) });
  const [hoverCoords, setHoverCoords] = useState<{ x: number; z: number } | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startCenterX: number;
    startCenterZ: number;
    moved: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startCenterX: 0,
    startCenterZ: 0,
    moved: 0,
  });

  useEffect(() => {
    if (open) {
      setCenter({ x: Math.round(playerX), z: Math.round(playerZ) });
    }
  }, [open, playerX, playerZ]);

  const radius = ZOOM_RADII[zoomIdx];
  const scaleMult = Math.round(radius / ZOOM_RADII[0]);

  useEffect(() => {
    if (!open || !world || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 240;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }

    const img = ctx.createImageData(size, size);
    const data = img.data;
    const step = (radius * 2) / size;
    const gridInterval = radius <= 192 ? 16 : radius <= 2048 ? 256 : 2048;

    for (let py = 0; py < size; py++) {
      const wz = Math.floor(center.z - radius + py * step);
      const prevWz = Math.floor(center.z - radius + (py - 1) * step);
      const zCross = py > 0 && Math.floor(wz / gridInterval) !== Math.floor(prevWz / gridInterval);

      for (let px = 0; px < size; px++) {
        const wx = Math.floor(center.x - radius + px * step);
        const col = world.sampleMapColumn(wx, wz);
        const [r, g, b] = blockToRgb(col.blockId, col.y);

        const prevWx = Math.floor(center.x - radius + (px - 1) * step);
        const xCross = px > 0 && Math.floor(wx / gridInterval) !== Math.floor(prevWx / gridInterval);

        const idx = (py * size + px) * 4;
        const isGrid = xCross || zCross;
        data[idx] = isGrid ? Math.max(0, r - 14) : r;
        data[idx + 1] = isGrid ? Math.max(0, g - 14) : g;
        data[idx + 2] = isGrid ? Math.max(0, b - 14) : b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    // Draw spawn origin marker (0, 0)
    const spawnPx = ((0 - (center.x - radius)) / (radius * 2)) * size;
    const spawnPy = ((0 - (center.z - radius)) / (radius * 2)) * size;
    if (spawnPx >= 0 && spawnPx <= size && spawnPy >= 0 && spawnPy <= size) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(spawnPx - 3, spawnPy - 3, 6, 6);
    }

    // Draw mobs & zombies on map
    for (const m of mobMarkers) {
      const mx = ((m.x - (center.x - radius)) / (radius * 2)) * size;
      const my = ((m.z - (center.z - radius)) / (radius * 2)) * size;
      if (mx >= 0 && mx <= size && my >= 0 && my <= size) {
        ctx.fillStyle = m.hostile ? '#ef4444' : '#fde68a';
        ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }
    }

    // Draw player position & facing arrow
    const plPx = ((playerX - (center.x - radius)) / (radius * 2)) * size;
    const plPy = ((playerZ - (center.z - radius)) / (radius * 2)) * size;
    if (plPx >= -8 && plPx <= size + 8 && plPy >= -8 && plPy <= size + 8) {
      ctx.save();
      ctx.translate(plPx, plPy);
      ctx.rotate(-playerYaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [open, world, center, radius, playerX, playerZ, playerYaw, mobMarkers]);

  if (!open) return null;

  const clientToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const wx = Math.round(center.x - radius + nx * radius * 2);
    const wz = Math.round(center.z - radius + ny * radius * 2);
    return { x: wx, z: wz };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5">
      <div className="mc-panel flex max-h-[94vh] w-full max-w-xl flex-col p-4 text-white shadow-2xl sm:p-5">
        <div className="flex items-center justify-between border-b border-white/15 pb-3">
          <div className="flex items-center gap-2.5">
            <MapIcon className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="font-display text-base font-bold tracking-wide sm:text-lg">
                Butun Dunyo Xaritasi ({scaleMult}x)
              </h2>
              <p className="font-mono-hud text-[11px] text-zinc-300">
                X {Math.round(playerX)} · Y {Math.round(playerY)} · Z {Math.round(playerZ)} · Ko&apos;lam:{' '}
                {(radius * 2).toLocaleString()}×{(radius * 2).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onClose();
            }}
            aria-label="Yopish"
            className="mc-button p-2 text-white/80 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Map Controls */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => {
                soundEngine.playClick();
                setZoomIdx((z) => Math.max(0, z - 1));
              }}
              disabled={zoomIdx === 0}
              className="mc-button flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              <span>Yaqin</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playClick();
                setZoomIdx((z) => Math.min(ZOOM_RADII.length - 1, z + 1));
              }}
              disabled={zoomIdx === ZOOM_RADII.length - 1}
              className="mc-button flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              <ZoomOut className="h-3.5 w-3.5" />
              <span>Uzoq</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playClick();
                setZoomIdx(ZOOM_RADII.length - 1);
              }}
              className={`mc-button flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                zoomIdx === ZOOM_RADII.length - 1 ? 'mc-button-primary text-white' : 'text-amber-200'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>556x</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playClick();
                setCenter({ x: Math.round(playerX), z: Math.round(playerZ) });
              }}
              className="mc-button flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-sky-300 cursor-pointer"
            >
              <Crosshair className="h-3.5 w-3.5" />
              <span>Markaz</span>
            </button>
          </div>

          <div className="font-mono-hud flex items-center gap-1.5 text-xs text-zinc-300">
            <Compass className="h-3.5 w-3.5 text-amber-300" />
            <span>
              {hoverCoords ? `X: ${hoverCoords.x}, Z: ${hoverCoords.z}` : 'Teleport uchun bosing'}
            </span>
          </div>
        </div>

        {/* Interactive Canvas */}
        <div className="relative mt-3 flex items-center justify-center overflow-hidden border-2 border-black/80 bg-[#0d110d]">
          <canvas
            ref={canvasRef}
            onWheel={(e) => {
              e.preventDefault();
              if (e.deltaY > 0) setZoomIdx((z) => Math.min(ZOOM_RADII.length - 1, z + 1));
              else if (e.deltaY < 0) setZoomIdx((z) => Math.max(0, z - 1));
            }}
            onPointerDown={(e) => {
              dragRef.current = {
                active: true,
                startX: e.clientX,
                startY: e.clientY,
                startCenterX: center.x,
                startCenterZ: center.z,
                moved: 0,
              };
            }}
            onPointerMove={(e) => {
              const coords = clientToWorld(e.clientX, e.clientY);
              if (coords) setHoverCoords(coords);
              if (!dragRef.current.active || !canvasRef.current) return;
              const rect = canvasRef.current.getBoundingClientRect();
              const dx = e.clientX - dragRef.current.startX;
              const dy = e.clientY - dragRef.current.startY;
              dragRef.current.moved = Math.hypot(dx, dy);
              const worldPerPx = (radius * 2) / rect.width;
              setCenter({
                x: Math.round(dragRef.current.startCenterX - dx * worldPerPx),
                z: Math.round(dragRef.current.startCenterZ - dy * worldPerPx),
              });
            }}
            onPointerUp={(e) => {
              const wasClick = dragRef.current.active && dragRef.current.moved < 6;
              dragRef.current.active = false;
              if (wasClick) {
                const coords = clientToWorld(e.clientX, e.clientY);
                if (coords) {
                  onTeleport(coords.x, coords.z);
                  onClose();
                }
              }
            }}
            onPointerLeave={() => {
              dragRef.current.active = false;
              setHoverCoords(null);
            }}
            className="pixelated aspect-square w-full max-w-[420px] cursor-crosshair touch-none"
          />

          <div className="pointer-events-none absolute left-2 top-2 bg-black/70 px-2 py-1 text-[10px] font-bold text-zinc-200">
            N (Shimol -Z)
          </div>
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 px-2 py-1 text-[10px] text-emerald-300">
            <Navigation className="h-3 w-3" />
            <span>Bosib teleport qiling · G&apos;ildirak bilan masshtab</span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 border border-black/60 bg-[#609e3e]" />
              Maysa
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 border border-black/60 bg-[#266acd]" />
              Suv
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 border border-black/60 bg-[#dbcc8e]" />
              Sahro
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 border border-black/60 bg-[#f2f7fc]" />
              Tog&apos;
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 border border-black/60 bg-[#b24434]" />
              Uy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 bg-[#ef4444]" />
              Zombi
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
