import React, { useMemo, useState } from 'react';
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Hammer,
  Search,
  Shuffle,
  TrainFront,
  Waves,
  X,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import { getBlockDef } from '../game/blocks';
import {
  searchStructures,
  STRUCTURE_CATEGORIES,
  StructureCategory,
  TOTAL_STRUCTURES,
} from '../game/structures';
import { getBlockIconUrl } from '../game/textures';
import { GameMode } from '../game/VoxelEngine';

interface StructureShopModalProps {
  open: boolean;
  mode: GameMode;
  coins: number;
  unlockedStructures: Set<number>;
  isBuilding: boolean;
  onBuyStructure: (id: number) => boolean;
  onBuildStructure: (id: number) => void;
  onRandomBuild: () => void;
  onCancelBuild: () => void;
  onClose: () => void;
}

const PAGE_SIZE = 24;

export const StructureShopModal: React.FC<StructureShopModalProps> = ({
  open,
  mode,
  coins,
  unlockedStructures,
  isBuilding,
  onBuyStructure,
  onBuildStructure,
  onRandomBuild,
  onCancelBuild,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<StructureCategory>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'owned' | 'affordable'>('all');
  const [page, setPage] = useState(0);

  const { items, total } = useMemo(() => {
    return searchStructures(
      query,
      category,
      ownershipFilter,
      unlockedStructures,
      coins,
      page,
      PAGE_SIZE
    );
  }, [query, category, ownershipFilter, unlockedStructures, coins, page]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-5">
      <div className="mc-panel flex max-h-[94vh] w-full max-w-5xl flex-col p-4 text-white shadow-2xl sm:p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-amber-300" />
            <div>
              <h2 className="font-display text-base font-bold tracking-wide sm:text-lg">
                Uy, Qasr va Inshootlar Do&apos;koni ({TOTAL_STRUCTURES.toLocaleString()}+ tur)
              </h2>
              <p className="text-[11px] text-zinc-300">
                Turli qasrlar, villalar, saroylar va vokzallarni sotib olib avto-quring!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-amber-400/50 bg-[#221d0f] px-3 py-1.5 text-xs font-bold text-amber-300">
              <Coins className="h-4 w-4 text-amber-400" />
              <span>{mode === 'creative' ? 'Ijodiy: Bepul' : `${coins.toLocaleString()} tanga`}</span>
            </div>

            {isBuilding && (
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onCancelBuild();
                }}
                className="mc-button px-3 py-1.5 text-xs font-bold text-rose-300 cursor-pointer"
              >
                Qurishni to&apos;xtatish
              </button>
            )}

            <button
              onClick={() => {
                soundEngine.playClick();
                onRandomBuild();
                onClose();
              }}
              className="mc-button mc-button-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span>Tasodifiy Qurish</span>
            </button>

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
        </div>

        {/* Search & Ownership Filters */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Qidirish: Qasr, Villa, #2500..."
              className="w-full border border-white/20 bg-[#141714] py-1.5 pl-8 pr-3 text-xs text-white outline-none focus:border-emerald-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `Barchasi (${total.toLocaleString()})` },
              { id: 'owned', label: `Mening uylarim (${unlockedStructures.size})` },
              { id: 'affordable', label: 'Pulim yetadigan' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  soundEngine.playClick();
                  setOwnershipFilter(f.id as typeof ownershipFilter);
                  setPage(0);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                  ownershipFilter === f.id ? 'bg-emerald-700 text-white' : 'mc-button text-zinc-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {STRUCTURE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                soundEngine.playClick();
                setCategory(c.id);
                setPage(0);
              }}
              className={`px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                category === c.id ? 'bg-amber-600 text-white' : 'mc-button text-zinc-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Paginated Grid */}
        <div className="mt-3 flex-1 overflow-y-auto border border-white/10 bg-[#151815] p-3">
          {items.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              Hech qanday inshoot topilmadi. Qidiruv yoki filtrni o&apos;zgartiring.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const owned = mode === 'creative' || unlockedStructures.has(item.id);
                const canAfford = owned || coins >= item.price;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-2.5 border border-white/15 bg-[#1e221e] p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Dual Material Swatch */}
                      <div className="mc-slot relative flex h-12 w-12 shrink-0 items-center justify-center">
                        <img
                          src={getBlockIconUrl(item.wallBlock)}
                          alt={getBlockDef(item.wallBlock).name}
                          className="pixelated h-9 w-9"
                        />
                        <img
                          src={getBlockIconUrl(item.roofBlock)}
                          alt={getBlockDef(item.roofBlock).name}
                          className="pixelated absolute -bottom-1 -right-1 h-5 w-5 border border-black"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-white" title={item.name}>
                          {item.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-300">
                          <span className="bg-black/40 px-1.5 py-0.5 text-amber-200">
                            {item.categoryLabel}
                          </span>
                          <span className="font-mono-hud">
                            {item.width}×{item.height}×{item.depth}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400">
                          {item.hasWaterFeature && (
                            <span className="flex items-center gap-0.5 text-sky-300">
                              <Waves className="h-3 w-3" /> Suv
                            </span>
                          )}
                          {item.hasRailFeature && (
                            <span className="flex items-center gap-0.5 text-amber-300">
                              <TrainFront className="h-3 w-3" /> Rels
                            </span>
                          )}
                          <span>{item.floors} qavat</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                      {owned ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <Check className="h-3.5 w-3.5" />
                          <span>Ochilgan</span>
                        </span>
                      ) : (
                        <span
                          className={`flex items-center gap-1 text-[11px] font-bold ${
                            canAfford ? 'text-amber-300' : 'text-rose-400'
                          }`}
                        >
                          <Coins className="h-3.5 w-3.5" />
                          <span>{item.price} tanga</span>
                        </span>
                      )}

                      {owned ? (
                        <button
                          onClick={() => {
                            soundEngine.playClick();
                            onBuildStructure(item.id);
                            onClose();
                          }}
                          className="mc-button mc-button-primary flex items-center gap-1 px-3 py-1 text-[11px] font-bold text-white cursor-pointer"
                        >
                          <Hammer className="h-3 w-3" />
                          <span>Qurish</span>
                        </button>
                      ) : (
                        <button
                          disabled={!canAfford}
                          onClick={() => {
                            const ok = onBuyStructure(item.id);
                            if (ok) {
                              onBuildStructure(item.id);
                              onClose();
                            }
                          }}
                          className="mc-button px-3 py-1 text-[11px] font-bold text-amber-200 disabled:opacity-40 cursor-pointer"
                        >
                          Sotib olish va Qurish
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-300">
          <span>
            Sahifa {safePage + 1} / {totalPages} · Jami {total.toLocaleString()} ta inshoot
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={safePage === 0}
              onClick={() => {
                soundEngine.playClick();
                setPage((p) => Math.max(0, p - 1));
              }}
              className="mc-button flex items-center gap-1 px-2.5 py-1 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Oldingi</span>
            </button>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => {
                soundEngine.playClick();
                setPage((p) => Math.min(totalPages - 1, p + 1));
              }}
              className="mc-button flex items-center gap-1 px-2.5 py-1 disabled:opacity-40 cursor-pointer"
            >
              <span>Keyingi</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
