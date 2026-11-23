import React, { useMemo, useState } from 'react';
import { Hammer, Search, X } from 'lucide-react';
import {
  ALL_CREATIVE_ITEMS,
  BlockId,
  CRAFTING_RECIPES,
  CraftingRecipe,
  getBlockDef,
  InventorySlot,
  matchCraftingRecipe,
} from '../game/blocks';
import { getBlockIconUrl } from '../game/textures';
import { GameMode } from '../game/VoxelEngine';
import { soundEngine } from '../game/audio';

interface InventoryModalProps {
  mode: GameMode;
  isCraftingTable: boolean;
  hotbar: (InventorySlot | null)[];
  inventory: (InventorySlot | null)[];
  onUpdateStorage: (hotbar: (InventorySlot | null)[], inventory: (InventorySlot | null)[]) => void;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  mode,
  isCraftingTable,
  hotbar,
  inventory,
  onUpdateStorage,
  onClose,
}) => {
  const gridSize: 2 | 3 = isCraftingTable ? 3 : 2;
  const [localHotbar, setLocalHotbar] = useState<(InventorySlot | null)[]>(() =>
    hotbar.map((s) => (s ? { ...s } : null))
  );
  const [localInv, setLocalInv] = useState<(InventorySlot | null)[]>(() =>
    inventory.map((s) => (s ? { ...s } : null))
  );
  const [craftGrid, setCraftGrid] = useState<(InventorySlot | null)[]>(() =>
    new Array(gridSize * gridSize).fill(null)
  );
  const [cursorItem, setCursorItem] = useState<InventorySlot | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'natural' | 'building' | 'functional' | 'tools'>('all');

  const matchedRecipe = useMemo(
    () => matchCraftingRecipe(craftGrid, gridSize),
    [craftGrid, gridSize]
  );

  const commitClose = () => {
    // Return any leftover items in crafting grid or cursor back to storage
    const hb = [...localHotbar];
    const inv = [...localInv];
    const returnItems: InventorySlot[] = [];
    if (cursorItem) returnItems.push(cursorItem);
    for (const c of craftGrid) if (c) returnItems.push(c);

    for (const item of returnItems) {
      let rem = item.count;
      for (let i = 0; i < 9 && rem > 0; i++) {
        if (!hb[i]) {
          hb[i] = { id: item.id, count: rem };
          rem = 0;
        }
      }
      for (let i = 0; i < 27 && rem > 0; i++) {
        if (!inv[i]) {
          inv[i] = { id: item.id, count: rem };
          rem = 0;
        }
      }
    }
    onUpdateStorage(hb, inv);
    onClose();
  };

  const handleSlotClick = (
    listType: 'hotbar' | 'inv' | 'craft',
    index: number,
    rightClick = false
  ) => {
    soundEngine.playClick();
    const list =
      listType === 'hotbar' ? [...localHotbar] : listType === 'inv' ? [...localInv] : [...craftGrid];
    const current = list[index];

    if (rightClick) {
      // Place 1 from cursor, or split stack
      if (cursorItem) {
        if (!current) {
          list[index] = { id: cursorItem.id, count: 1 };
          const nextCursor = cursorItem.count > 1 ? { ...cursorItem, count: cursorItem.count - 1 } : null;
          setCursorItem(nextCursor);
        } else if (current.id === cursorItem.id && current.count < 64) {
          list[index] = { ...current, count: current.count + 1 };
          const nextCursor = cursorItem.count > 1 ? { ...cursorItem, count: cursorItem.count - 1 } : null;
          setCursorItem(nextCursor);
        }
      } else if (current && current.count > 1) {
        const half = Math.ceil(current.count / 2);
        setCursorItem({ id: current.id, count: half });
        list[index] = { id: current.id, count: current.count - half };
      }
    } else {
      if (!cursorItem) {
        if (current) {
          setCursorItem(current);
          list[index] = null;
        }
      } else {
        if (!current) {
          list[index] = cursorItem;
          setCursorItem(null);
        } else if (current.id === cursorItem.id && current.count < 64) {
          const add = Math.min(64 - current.count, cursorItem.count);
          list[index] = { ...current, count: current.count + add };
          const rem = cursorItem.count - add;
          setCursorItem(rem > 0 ? { ...cursorItem, count: rem } : null);
        } else {
          list[index] = cursorItem;
          setCursorItem(current);
        }
      }
    }

    if (listType === 'hotbar') {
      setLocalHotbar(list);
      onUpdateStorage(list, localInv);
    } else if (listType === 'inv') {
      setLocalInv(list);
      onUpdateStorage(localHotbar, list);
    } else {
      setCraftGrid(list);
    }
  };

  const handleCraftOutputClick = () => {
    if (!matchedRecipe) return;
    const out = matchedRecipe.output;
    if (cursorItem && (cursorItem.id !== out.id || cursorItem.count + out.count > 64)) return;

    soundEngine.playPickup();
    const nextCraft = craftGrid.map((s) => (s && s.count > 1 ? { ...s, count: s.count - 1 } : null));
    setCraftGrid(nextCraft);
    setCursorItem(
      cursorItem ? { id: out.id, count: cursorItem.count + out.count } : { ...out }
    );
  };

  const quickFillRecipe = (recipe: CraftingRecipe) => {
    if (recipe.width > gridSize || recipe.height > gridSize) return;
    soundEngine.playClick();

    // Combine available counts from hotbar + inv + current craftGrid
    const hb = localHotbar.map((s) => (s ? { ...s } : null));
    const inv = localInv.map((s) => (s ? { ...s } : null));
    const nextCraft: (InventorySlot | null)[] = new Array(gridSize * gridSize).fill(null);

    // Return existing craft grid to storage first
    for (const c of craftGrid) {
      if (!c) continue;
      let rem = c.count;
      for (let i = 0; i < 9 && rem > 0; i++) {
        if (hb[i]?.id === c.id) {
          const add = Math.min(64 - hb[i]!.count, rem);
          hb[i]!.count += add;
          rem -= add;
        }
      }
      for (let i = 0; i < 9 && rem > 0; i++) {
        if (!hb[i]) { hb[i] = { id: c.id, count: rem }; rem = 0; }
      }
      for (let i = 0; i < 27 && rem > 0; i++) {
        if (!inv[i]) { inv[i] = { id: c.id, count: rem }; rem = 0; }
      }
    }

    const consumeOne = (targetId: BlockId): boolean => {
      for (let i = 0; i < 9; i++) {
        if (hb[i]?.id === targetId && hb[i]!.count > 0) {
          hb[i]!.count -= 1;
          if (hb[i]!.count <= 0) hb[i] = null;
          return true;
        }
      }
      for (let i = 0; i < 27; i++) {
        if (inv[i]?.id === targetId && inv[i]!.count > 0) {
          inv[i]!.count -= 1;
          if (inv[i]!.count <= 0) inv[i] = null;
          return true;
        }
      }
      return false;
    };

    let ok = true;
    for (let r = 0; r < recipe.height; r++) {
      for (let c = 0; c < recipe.width; c++) {
        const need = recipe.pattern[r * recipe.width + c];
        if (!need) continue;
        if (!consumeOne(need)) {
          ok = false;
          break;
        }
        nextCraft[r * gridSize + c] = { id: need, count: 1 };
      }
      if (!ok) break;
    }

    if (ok) {
      setLocalHotbar(hb);
      setLocalInv(inv);
      setCraftGrid(nextCraft);
      onUpdateStorage(hb, inv);
    }
  };

  const giveCreativeItem = (id: BlockId) => {
    soundEngine.playPickup();
    const hb = [...localHotbar];
    const existing = hb.findIndex((s) => s?.id === id);
    if (existing >= 0) {
      hb[existing] = { id, count: 64 };
    } else {
      const empty = hb.findIndex((s) => !s);
      if (empty >= 0) hb[empty] = { id, count: 64 };
      else hb[0] = { id, count: 64 };
    }
    setLocalHotbar(hb);
    onUpdateStorage(hb, localInv);
  };

  const filteredCreative = ALL_CREATIVE_ITEMS.filter((id) => {
    const def = getBlockDef(id);
    if (category !== 'all' && def.category !== category) return false;
    if (search.trim() && !def.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const renderSlot = (
    slot: InventorySlot | null,
    onClick: (right: boolean) => void,
    key: string | number
  ) => (
    <button
      key={key}
      onClick={(e) => {
        e.preventDefault();
        onClick(false);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClick(true);
      }}
      title={slot ? getBlockDef(slot.id).name : undefined}
      className="mc-slot relative flex h-11 w-11 items-center justify-center hover:brightness-125 cursor-pointer"
    >
      {slot && slot.count > 0 && (
        <>
          <img
            src={getBlockIconUrl(slot.id)}
            alt={getBlockDef(slot.id).name}
            className="pixelated h-8 w-8 object-contain"
          />
          {slot.count > 1 && (
            <span className="font-mono-hud absolute bottom-0.5 right-1 text-[11px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
              {slot.count}
            </span>
          )}
        </>
      )}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mc-panel flex max-h-[92vh] w-full max-w-4xl flex-col gap-4 overflow-y-auto p-5 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3">
          <div className="flex items-center gap-3">
            <Hammer className="h-5 w-5 text-amber-300" />
            <h2 className="font-display text-xl font-bold tracking-wide">
              {mode === 'creative'
                ? 'Ijodiy Bloklar Katalogi'
                : isCraftingTable
                  ? 'Ustaxona Stoli (3×3 Yasash)'
                  : 'Inventar va Yasash (2×2)'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {cursorItem && (
              <div className="flex items-center gap-2 border border-amber-400/50 bg-black/50 px-2.5 py-1 text-xs">
                <img src={getBlockIconUrl(cursorItem.id)} alt="" className="pixelated h-5 w-5" />
                <span>
                  {getBlockDef(cursorItem.id).name} ({cursorItem.count})
                </span>
              </div>
            )}
            <button onClick={commitClose} className="mc-button p-2 text-white cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {mode === 'creative' ? (
          <>
            {/* Creative Catalog Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'Barchasi' },
                  { id: 'natural', label: 'Tabiat' },
                  { id: 'building', label: 'Qurilish' },
                  { id: 'functional', label: 'Jihozlar' },
                  { id: 'tools', label: 'Asboblar' },
                ].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id as typeof category)}
                    className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                      category === c.id ? 'bg-emerald-700 text-white' : 'mc-button text-zinc-200'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Blok qidirish..."
                  className="border border-white/20 bg-[#141714] py-1.5 pl-8 pr-3 text-xs text-white outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            <div className="grid max-h-60 grid-cols-6 gap-1.5 overflow-y-auto border border-white/10 bg-[#161916] p-3 sm:grid-cols-9">
              {filteredCreative.map((id) => (
                <button
                  key={id}
                  onClick={() => giveCreativeItem(id)}
                  title={getBlockDef(id).name}
                  className="mc-slot flex h-12 flex-col items-center justify-center hover:brightness-125 cursor-pointer"
                >
                  <img
                    src={getBlockIconUrl(id)}
                    alt={getBlockDef(id).name}
                    className="pixelated h-8 w-8"
                  />
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Survival Crafting + Recipe Book */
          <div className="grid gap-5 md:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {/* Crafting Area */}
              <div className="flex items-center justify-center gap-6 border border-white/10 bg-[#181b18] p-4">
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
                >
                  {craftGrid.map((slot, idx) =>
                    renderSlot(slot, (r) => handleSlotClick('craft', idx, r), `c-${idx}`)
                  )}
                </div>

                <span className="text-2xl font-bold text-zinc-400">→</span>

                <button
                  onClick={handleCraftOutputClick}
                  title={matchedRecipe ? getBlockDef(matchedRecipe.output.id).name : undefined}
                  className={`mc-slot relative flex h-14 w-14 items-center justify-center cursor-pointer ${
                    matchedRecipe ? 'border-emerald-400 brightness-110' : ''
                  }`}
                >
                  {matchedRecipe && (
                    <>
                      <img
                        src={getBlockIconUrl(matchedRecipe.output.id)}
                        alt={getBlockDef(matchedRecipe.output.id).name}
                        className="pixelated h-9 w-9"
                      />
                      {matchedRecipe.output.count > 1 && (
                        <span className="font-mono-hud absolute bottom-0.5 right-1 text-xs font-bold text-white">
                          {matchedRecipe.output.count}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </div>

              {/* 27-slot Backpack */}
              <div>
                <div className="mb-1.5 text-xs font-medium text-zinc-300">Sumka</div>
                <div className="grid grid-cols-9 gap-1">
                  {localInv.map((slot, idx) =>
                    renderSlot(slot, (r) => handleSlotClick('inv', idx, r), `inv-${idx}`)
                  )}
                </div>
              </div>
            </div>

            {/* Quick Recipe Book */}
            <div className="flex max-h-72 flex-col border border-white/10 bg-[#161916] p-3">
              <div className="mb-2 text-xs font-semibold text-amber-300">
                Retseptlar (bosib to&apos;ldiring)
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                {CRAFTING_RECIPES.filter((r) => r.width <= gridSize && r.height <= gridSize).map(
                  (rec) => {
                    const outDef = getBlockDef(rec.output.id);
                    return (
                      <button
                        key={rec.id}
                        onClick={() => quickFillRecipe(rec)}
                        className="flex w-full items-center gap-2.5 border border-white/10 bg-[#202420] px-2.5 py-1.5 text-left text-xs hover:bg-[#2a302a] cursor-pointer"
                      >
                        <img
                          src={getBlockIconUrl(rec.output.id)}
                          alt={outDef.name}
                          className="pixelated h-6 w-6 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-white">
                            {outDef.name} {rec.output.count > 1 ? `×${rec.output.count}` : ''}
                          </div>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hotbar (Always shown at bottom) */}
        <div className="border-t border-white/15 pt-3">
          <div className="mb-1.5 text-xs font-medium text-zinc-300">Tezkor Panel (1–9)</div>
          <div className="grid grid-cols-9 gap-1">
            {localHotbar.map((slot, idx) =>
              renderSlot(slot, (r) => handleSlotClick('hotbar', idx, r), `hb-${idx}`)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
