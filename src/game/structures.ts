import { BlockId } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, VoxelWorld, WATER_LEVEL } from './world';

export type StructureCategory =
  | 'all'
  | 'castle'
  | 'villa'
  | 'palace'
  | 'house'
  | 'tower'
  | 'station'
  | 'pagoda'
  | 'temple'
  | 'bunker'
  | 'village'
  | 'skybase'
  | 'arena';

export interface StructureMeta {
  id: number;
  name: string;
  category: Exclude<StructureCategory, 'all'>;
  categoryLabel: string;
  price: number;
  width: number;
  height: number;
  depth: number;
  wallBlock: BlockId;
  roofBlock: BlockId;
  trimBlock: BlockId;
  floorBlock: BlockId;
  windowBlock: BlockId;
  lightBlock: BlockId;
  hasWaterFeature: boolean;
  hasRailFeature: boolean;
  floors: number;
  towers: number;
}

export const TOTAL_STRUCTURES = 5400;
export const DEFAULT_UNLOCKED_STRUCTURES = [1, 2, 3, 4, 5, 6];

export const STRUCTURE_CATEGORIES: { id: StructureCategory; label: string }[] = [
  { id: 'all', label: 'Barchasi (5400+)' },
  { id: 'castle', label: 'Qasrlar' },
  { id: 'villa', label: 'Villalar' },
  { id: 'palace', label: 'Saroylar' },
  { id: 'house', label: 'Uylar' },
  { id: 'tower', label: 'Minorlar' },
  { id: 'station', label: 'Vokzal/Poyezd' },
  { id: 'pagoda', label: 'Pagodalar' },
  { id: 'temple', label: 'Piramida' },
  { id: 'bunker', label: 'Bunkerlar' },
  { id: 'village', label: 'Qishloq' },
  { id: 'skybase', label: 'Osmon bazasi' },
  { id: 'arena', label: 'Arena/Bog' },
];

const CATEGORY_ORDER: Exclude<StructureCategory, 'all'>[] = [
  'castle',
  'villa',
  'palace',
  'house',
  'tower',
  'station',
  'pagoda',
  'temple',
  'bunker',
  'village',
  'skybase',
  'arena',
];

const ADJECTIVES = [
  'Qirollik', 'Shohona', 'Zamonaviy', 'Qadimiy', 'Olmosli', 'Oltin', 'Zumrad',
  'Marmar', 'Qorli', 'Tog\'li', 'Moviy', 'Yorqin', 'Buyuk', 'Temir', 'Nafis',
  'Sirli', 'Qizil', 'Qora', 'Kvars', 'Prizmarin', 'Quyoshli', 'Tungi', 'Yulduzli',
  'O\'rmon', 'Sahro', 'Dengiz', 'Baxmal', 'Mustahkam', 'Hashamatli', 'Ajoyib',
];

const MATERIAL_STYLES: {
  label: string;
  wall: BlockId;
  roof: BlockId;
  trim: BlockId;
  floor: BlockId;
  light: BlockId;
}[] = [
  { label: "Tosh g'isht", wall: BlockId.STONE_BRICKS, roof: BlockId.DARK_OAK_PLANKS, trim: BlockId.COBBLESTONE, floor: BlockId.SPRUCE_PLANKS, light: BlockId.LANTERN },
  { label: "G'ishtli", wall: BlockId.BRICKS, roof: BlockId.OAK_PLANKS, trim: BlockId.OAK_LOG, floor: BlockId.OAK_PLANKS, light: BlockId.TORCH },
  { label: 'Kvars Marmar', wall: BlockId.QUARTZ_BLOCK, roof: BlockId.PRISMARINE, trim: BlockId.PILLAR_QUARTZ, floor: BlockId.WHITE_CONCRETE, light: BlockId.SEA_LANTERN },
  { label: 'Oq Beton', wall: BlockId.WHITE_CONCRETE, roof: BlockId.GRAY_CONCRETE, trim: BlockId.CYAN_CONCRETE, floor: BlockId.BIRCH_PLANKS, light: BlockId.GLOWSTONE },
  { label: 'Obsidian', wall: BlockId.OBSIDIAN, roof: BlockId.NETHER_BRICKS, trim: BlockId.DEEPSLATE, floor: BlockId.BLACK_WOOL, light: BlockId.REDSTONE_BLOCK },
  { label: 'Qayin va Eman', wall: BlockId.BIRCH_PLANKS, roof: BlockId.SPRUCE_PLANKS, trim: BlockId.BIRCH_LOG, floor: BlockId.OAK_PLANKS, light: BlockId.LANTERN },
  { label: 'Qumtosh', wall: BlockId.SANDSTONE, roof: BlockId.RED_TERRACOTTA, trim: BlockId.TERRACOTTA, floor: BlockId.SANDSTONE, light: BlockId.GLOWSTONE },
  { label: 'Prizmarin', wall: BlockId.PRISMARINE, roof: BlockId.SEA_LANTERN, trim: BlockId.CYAN_CONCRETE, floor: BlockId.PACKED_ICE, light: BlockId.SEA_LANTERN },
  { label: 'Nether', wall: BlockId.NETHER_BRICKS, roof: BlockId.RED_TERRACOTTA, trim: BlockId.GOLD_BLOCK, floor: BlockId.DEEPSLATE, light: BlockId.MAGMA_BLOCK },
  { label: 'Oltin va Lazurit', wall: BlockId.LAPIS_BLOCK, roof: BlockId.GOLD_BLOCK, trim: BlockId.QUARTZ_BLOCK, floor: BlockId.BLUE_WOOL, light: BlockId.SEA_LANTERN },
  { label: 'Zumrad Saroy', wall: BlockId.QUARTZ_BLOCK, roof: BlockId.EMERALD_BLOCK, trim: BlockId.GOLD_BLOCK, floor: BlockId.GREEN_WOOL, light: BlockId.GLOWSTONE },
  { label: 'Moxli Qadimiy', wall: BlockId.MOSSY_STONE_BRICKS, roof: BlockId.SPRUCE_PLANKS, trim: BlockId.CRACKED_STONE_BRICKS, floor: BlockId.COBBLESTONE, light: BlockId.TORCH },
  { label: 'End Purpur', wall: BlockId.PURPUR_BLOCK, roof: BlockId.END_STONE, trim: BlockId.OBSIDIAN, floor: BlockId.PURPUR_BLOCK, light: BlockId.SEA_LANTERN },
  { label: 'Granit', wall: BlockId.GRANITE, roof: BlockId.DARK_OAK_PLANKS, trim: BlockId.DIORITE, floor: BlockId.ANDESITE, light: BlockId.LANTERN },
  { label: 'Temir Qal\'a', wall: BlockId.IRON_BLOCK, roof: BlockId.GRAY_CONCRETE, trim: BlockId.COAL_BLOCK, floor: BlockId.DEEPSLATE, light: BlockId.REDSTONE_BLOCK },
];

const NOUNS_BY_CAT: Record<Exclude<StructureCategory, 'all'>, string[]> = {
  castle: ['Qasr', "Qal'a", 'Sitadel', 'Qo\'rg\'on', 'Bastion'],
  villa: ['Villa', 'Kottej Villa', 'Pentxaus', 'Hovlili Uy', 'Rezidensiya'],
  palace: ['Saroy', 'Taxt Saroyi', 'Gumbazli Saroy', 'Ark', 'Sulton Saroyi'],
  house: ['Uy', 'Kottej', 'Yog\'och Uy', 'Oila Uyi', 'Dala Hovli'],
  tower: ['Minora', 'Kuzatuv Qullasi', 'Sehrgar Minorasi', 'Mayak', 'Osmono\'par'],
  station: ['Vokzal', 'Temir Yo\'l Bekati', 'Poyezd Deposi', 'Ko\'prik Bekat', 'Terminal'],
  pagoda: ['Pagoda', 'Dojo', 'Sharqona Uy', 'Ibodat Ayvoni', 'Shiypon'],
  temple: ['Piramida', 'Ibodatxona', 'Ziggurat', 'Maqbara', 'Xazina Piramidasi'],
  bunker: ['Bunker', 'Yerosti Baza', 'Redstone Laboratoriya', 'Seyf Qal\'a', 'Mudofaa Baza'],
  village: ['Temirchi Ustaxona', 'Kutubxona', 'Shamol Tegirmon', 'Ferma Omborkona', 'Bozor Pavilyoni'],
  skybase: ['Osmon Qal\'asi', 'Havo Kemasi', 'Bulut Saroyi', 'Uchar Orol', 'Samoviy Baza'],
  arena: ['Arena', 'Kolizey', 'Suv Bog\'i', 'Akveduk', 'Favvora Maydoni'],
};

function hashInt(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x = ((x ^ (x >> 16)) * 0x45d9f3b) >>> 0;
  x = (x ^ (x >> 16)) >>> 0;
  return x;
}

export function getStructureMeta(id: number): StructureMeta {
  const safeId = Math.max(1, Math.min(TOTAL_STRUCTURES, Math.floor(id)));

  // Starter iconic structures 1..6 for instant variety
  if (safeId <= 6) {
    const starters: StructureMeta[] = [
      {
        id: 1,
        name: "Klassik G'ishtli Uy #1",
        category: 'house',
        categoryLabel: 'Uylar',
        price: 0,
        width: 7,
        height: 8,
        depth: 7,
        wallBlock: BlockId.BRICKS,
        roofBlock: BlockId.OAK_PLANKS,
        trimBlock: BlockId.OAK_LOG,
        floorBlock: BlockId.OAK_PLANKS,
        windowBlock: BlockId.GLASS,
        lightBlock: BlockId.TORCH,
        hasWaterFeature: false,
        hasRailFeature: false,
        floors: 1,
        towers: 0,
      },
      {
        id: 2,
        name: "Qirollik Tosh Qasri #2",
        category: 'castle',
        categoryLabel: 'Qasrlar',
        price: 0,
        width: 13,
        height: 12,
        depth: 13,
        wallBlock: BlockId.STONE_BRICKS,
        roofBlock: BlockId.DARK_OAK_PLANKS,
        trimBlock: BlockId.COBBLESTONE,
        floorBlock: BlockId.SPRUCE_PLANKS,
        windowBlock: BlockId.IRON_BARS,
        lightBlock: BlockId.LANTERN,
        hasWaterFeature: true,
        hasRailFeature: false,
        floors: 2,
        towers: 4,
      },
      {
        id: 3,
        name: 'Shishali Zamonaviy Villa #3',
        category: 'villa',
        categoryLabel: 'Villalar',
        price: 0,
        width: 11,
        height: 9,
        depth: 11,
        wallBlock: BlockId.QUARTZ_BLOCK,
        roofBlock: BlockId.WHITE_CONCRETE,
        trimBlock: BlockId.CYAN_CONCRETE,
        floorBlock: BlockId.BIRCH_PLANKS,
        windowBlock: BlockId.GLASS,
        lightBlock: BlockId.SEA_LANTERN,
        hasWaterFeature: true,
        hasRailFeature: false,
        floors: 2,
        towers: 0,
      },
      {
        id: 4,
        name: "Temir Yo'l Markaziy Vokzali #4",
        category: 'station',
        categoryLabel: 'Vokzal/Poyezd',
        price: 0,
        width: 13,
        height: 8,
        depth: 9,
        wallBlock: BlockId.BRICKS,
        roofBlock: BlockId.SPRUCE_PLANKS,
        trimBlock: BlockId.STONE_BRICKS,
        floorBlock: BlockId.ANDESITE,
        windowBlock: BlockId.GLASS,
        lightBlock: BlockId.LANTERN,
        hasWaterFeature: false,
        hasRailFeature: true,
        floors: 1,
        towers: 0,
      },
      {
        id: 5,
        name: 'Oltin Gumbazli Shohona Saroy #5',
        category: 'palace',
        categoryLabel: 'Saroylar',
        price: 0,
        width: 13,
        height: 13,
        depth: 13,
        wallBlock: BlockId.QUARTZ_BLOCK,
        roofBlock: BlockId.GOLD_BLOCK,
        trimBlock: BlockId.LAPIS_BLOCK,
        floorBlock: BlockId.RED_WOOL,
        windowBlock: BlockId.GLASS,
        lightBlock: BlockId.GLOWSTONE,
        hasWaterFeature: true,
        hasRailFeature: false,
        floors: 2,
        towers: 4,
      },
      {
        id: 6,
        name: 'Sehrgar Kuzatuv Minorasi #6',
        category: 'tower',
        categoryLabel: 'Minorlar',
        price: 0,
        width: 7,
        height: 15,
        depth: 7,
        wallBlock: BlockId.MOSSY_STONE_BRICKS,
        roofBlock: BlockId.PURPUR_BLOCK,
        trimBlock: BlockId.DEEPSLATE,
        floorBlock: BlockId.DARK_OAK_PLANKS,
        windowBlock: BlockId.GLASS,
        lightBlock: BlockId.SEA_LANTERN,
        hasWaterFeature: false,
        hasRailFeature: false,
        floors: 3,
        towers: 1,
      },
    ];
    return starters[safeId - 1];
  }

  const catIdx = (safeId - 1) % CATEGORY_ORDER.length;
  const category = CATEGORY_ORDER[catIdx];
  const catLabel = STRUCTURE_CATEGORIES.find((c) => c.id === category)?.label || 'Uylar';
  const h = hashInt(safeId * 17 + 91);
  const h2 = hashInt(safeId * 31 + 7);

  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const mat = MATERIAL_STYLES[(h >> 5) % MATERIAL_STYLES.length];
  const nouns = NOUNS_BY_CAT[category];
  const noun = nouns[(h2 >> 3) % nouns.length];

  const isGrand =
    category === 'castle' ||
    category === 'palace' ||
    category === 'arena' ||
    category === 'temple';
  const isTall = category === 'tower' || category === 'pagoda' || category === 'skybase';

  const halfSpan = isGrand
    ? 5 + ((h >> 10) % 3) // 11..15 wide
    : category === 'villa' || category === 'station'
      ? 4 + ((h >> 10) % 3) // 9..13 wide
      : 3 + ((h >> 10) % 3); // 7..11 wide
  const width = halfSpan * 2 + 1;
  const depth = width;
  const floors = isTall ? 2 + ((h2 >> 7) % 3) : isGrand ? 2 : 1 + ((h2 >> 7) % 2);
  const height = floors * 4 + (isTall ? 6 : 5);
  const towers =
    category === 'castle' || category === 'palace'
      ? 4
      : category === 'tower'
        ? 1
        : (h2 & 3) === 0
          ? 2
          : 0;

  const hasWaterFeature =
    category === 'villa' ||
    category === 'arena' ||
    category === 'palace' ||
    (h2 % 5 === 0);
  const hasRailFeature = category === 'station' || (category === 'bunker' && h2 % 3 === 0);

  // Price scales realistically from 60 tanga up to 4800 tanga
  const tierFactor = isGrand ? 3.2 : isTall ? 2.1 : category === 'villa' || category === 'station' ? 1.8 : 1.0;
  const rawPrice = Math.round((45 + (safeId % 140) * 8 + halfSpan * 35) * tierFactor);
  const price = Math.max(50, Math.min(4800, Math.round(rawPrice / 10) * 10));

  return {
    id: safeId,
    name: `${adj} ${mat.label} ${noun} #${safeId}`,
    category,
    categoryLabel: catLabel,
    price,
    width,
    height,
    depth,
    wallBlock: mat.wall,
    roofBlock: mat.roof,
    trimBlock: mat.trim,
    floorBlock: mat.floor,
    windowBlock: category === 'castle' || category === 'bunker' ? BlockId.IRON_BARS : BlockId.GLASS,
    lightBlock: mat.light,
    hasWaterFeature,
    hasRailFeature,
    floors,
    towers,
  };
}

export function searchStructures(
  query: string,
  category: StructureCategory,
  ownershipFilter: 'all' | 'owned' | 'affordable',
  unlockedSet: Set<number>,
  coins: number,
  page: number,
  pageSize = 24
): { items: StructureMeta[]; total: number } {
  const q = query.trim().toLowerCase();
  const numericSearch = q.startsWith('#') ? parseInt(q.slice(1), 10) : /^\d+$/.test(q) ? parseInt(q, 10) : NaN;

  const matched: StructureMeta[] = [];
  if (!Number.isNaN(numericSearch) && numericSearch >= 1 && numericSearch <= TOTAL_STRUCTURES) {
    const single = getStructureMeta(numericSearch);
    if (category === 'all' || single.category === category) {
      matched.push(single);
    }
    return { items: matched, total: matched.length };
  }

  // Fast scan across 5,400 deterministic structures
  for (let id = 1; id <= TOTAL_STRUCTURES; id++) {
    const cat = id <= 6 ? getStructureMeta(id).category : CATEGORY_ORDER[(id - 1) % CATEGORY_ORDER.length];
    if (category !== 'all' && cat !== category) continue;
    if (ownershipFilter === 'owned' && !unlockedSet.has(id)) continue;

    const meta = getStructureMeta(id);
    if (ownershipFilter === 'affordable' && !unlockedSet.has(id) && meta.price > coins) continue;
    if (q && !meta.name.toLowerCase().includes(q) && !meta.categoryLabel.toLowerCase().includes(q)) {
      continue;
    }
    matched.push(meta);
  }

  const start = page * pageSize;
  return {
    items: matched.slice(start, start + pageSize),
    total: matched.length,
  };
}

export interface BuildBlockStep {
  x: number;
  y: number;
  z: number;
  id: BlockId;
}

export function generateStructureQueue(
  structureId: number,
  hx: number,
  groundY: number,
  hz: number,
  doorSide: 'px' | 'nx' | 'pz' | 'nz',
  world: VoxelWorld
): { meta: StructureMeta; queue: BuildBlockStep[] } {
  const meta = getStructureMeta(structureId);
  const r = Math.floor(meta.width / 2);
  const queue: BuildBlockStep[] = [];
  const wallH = meta.floors * 4;
  const baseY = meta.category === 'skybase' ? Math.min(CHUNK_HEIGHT - 16, groundY + 7) : groundY;

  // Ensure chunks under footprint exist
  for (let dx = -r - 2; dx <= r + 2; dx += 8) {
    for (let dz = -r - 2; dz <= r + 2; dz += 8) {
      world.generateChunk(
        Math.floor((hx + dx) / CHUNK_SIZE),
        Math.floor((hz + dz) / CHUNK_SIZE)
      );
    }
  }

  const pushIfValid = (x: number, y: number, z: number, id: BlockId) => {
    if (y >= 1 && y < CHUNK_HEIGHT) {
      queue.push({ x, y, z, id });
    }
  };

  // 1. Clear interior air space
  for (let dy = 1; dy <= meta.height + 3; dy++) {
    if (baseY + dy >= CHUNK_HEIGHT) break;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const cur = world.getBlock(hx + dx, baseY + dy, hz + dz);
        if (cur !== BlockId.AIR) {
          pushIfValid(hx + dx, baseY + dy, hz + dz, BlockId.AIR);
        }
      }
    }
  }

  // 2. Foundation & Moat/Pool base
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (meta.category !== 'skybase') {
        for (let fy = baseY - 2; fy < baseY; fy++) {
          if (fy >= 1 && !world.isSolidAt(hx + dx, fy, hz + dz)) {
            pushIfValid(hx + dx, fy, hz + dz, meta.trimBlock);
          }
        }
      } else {
        // Floating skybase underside island
        const dist = Math.hypot(dx, dz);
        if (dist <= r - 0.5) pushIfValid(hx + dx, baseY - 1, hz + dz, BlockId.STONE_BRICKS);
        if (dist <= r * 0.55) pushIfValid(hx + dx, baseY - 2, hz + dz, BlockId.GLOWSTONE);
      }

      const isBorder = Math.abs(dx) === r || Math.abs(dz) === r;
      let floorId = isBorder ? meta.trimBlock : meta.floorBlock;

      // Optional Villa Swimming Pool / Castle Fountain water feature in front/center
      if (
        meta.hasWaterFeature &&
        !isBorder &&
        Math.abs(dx) <= 1 &&
        Math.abs(dz) <= 1 &&
        (meta.category === 'villa' || meta.category === 'arena' || meta.category === 'palace')
      ) {
        floorId = BlockId.WATER;
      }

      pushIfValid(hx + dx, baseY, hz + dz, floorId);
    }
  }

  // 3. Special Pyramid / Temple architecture
  if (meta.category === 'temple') {
    for (let tier = 0; tier <= r; tier++) {
      const span = r - tier;
      const py = baseY + 1 + tier;
      for (let dx = -span; dx <= span; dx++) {
        for (let dz = -span; dz <= span; dz++) {
          const isShell = Math.abs(dx) === span || Math.abs(dz) === span;
          if (!isShell && tier < r) continue;
          const isEntrance =
            tier <= 1 &&
            ((doorSide === 'pz' && dz === span && dx === 0) ||
              (doorSide === 'nz' && dz === -span && dx === 0) ||
              (doorSide === 'px' && dx === span && dz === 0) ||
              (doorSide === 'nx' && dx === -span && dz === 0));
          if (isEntrance) {
            pushIfValid(hx + dx, py, hz + dz, tier === 0 ? BlockId.OAK_DOOR_CLOSED : BlockId.AIR);
          } else {
            pushIfValid(
              hx + dx,
              py,
              hz + dz,
              tier === r ? BlockId.GOLD_BLOCK : tier % 2 === 0 ? meta.wallBlock : meta.trimBlock
            );
          }
        }
      }
    }
    pushIfValid(hx, baseY + 1, hz, BlockId.ENCHANTING_TABLE);
    pushIfValid(hx - 1, baseY + 1, hz - 1, BlockId.CHEST);
    pushIfValid(hx + 1, baseY + 1, hz - 1, BlockId.GOLD_BLOCK);
    pushIfValid(hx, baseY + 3, hz, meta.lightBlock);
    return { meta, queue };
  }

  // 4. Walls, multi-floor slabs, corner towers & arched windows
  for (let dy = 1; dy <= wallH; dy++) {
    const isFloorDivider = dy > 1 && dy < wallH && dy % 4 === 0;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const isEdgeX = Math.abs(dx) === r;
        const isEdgeZ = Math.abs(dz) === r;

        if (isFloorDivider && !isEdgeX && !isEdgeZ) {
          // Leave central 2x2 stairwell gap
          if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
          pushIfValid(hx + dx, baseY + dy, hz + dz, meta.floorBlock);
          continue;
        }

        if (!isEdgeX && !isEdgeZ) continue;
        const isCorner = isEdgeX && isEdgeZ;

        const isDoorCol =
          (doorSide === 'pz' && dz === r && Math.abs(dx) <= (meta.width >= 11 ? 1 : 0)) ||
          (doorSide === 'nz' && dz === -r && Math.abs(dx) <= (meta.width >= 11 ? 1 : 0)) ||
          (doorSide === 'px' && dx === r && Math.abs(dz) <= (meta.width >= 11 ? 1 : 0)) ||
          (doorSide === 'nx' && dx === -r && Math.abs(dz) <= (meta.width >= 11 ? 1 : 0));

        if (isDoorCol && dy <= 2) {
          const isCenterDoor =
            ((doorSide === 'pz' || doorSide === 'nz') && dx === 0) ||
            ((doorSide === 'px' || doorSide === 'nx') && dz === 0);
          pushIfValid(
            hx + dx,
            baseY + dy,
            hz + dz,
            dy === 1 && isCenterDoor ? BlockId.OAK_DOOR_CLOSED : BlockId.AIR
          );
          continue;
        }

        // Open sides for Train Station platform
        if (meta.category === 'station' && dy <= 3 && !isCorner && (Math.abs(dx) <= r - 2 || Math.abs(dz) <= r - 2)) {
          if (dy === 1 && (Math.abs(dx) === r || Math.abs(dz) === r)) {
            pushIfValid(hx + dx, baseY + dy, hz + dz, BlockId.OAK_FENCE);
          }
          continue;
        }

        const localY = (dy - 1) % 4;
        const isWindow =
          (localY === 1 || (meta.category === 'villa' && localY === 2)) &&
          !isCorner &&
          (Math.abs(dx) % 2 === 1 || Math.abs(dz) % 2 === 1);

        let blockId = meta.wallBlock;
        if (isCorner) blockId = meta.trimBlock;
        else if (isWindow) blockId = meta.windowBlock;

        pushIfValid(hx + dx, baseY + dy, hz + dz, blockId);
      }
    }
  }

  // 5. Roof, Castle Battlements, Corner Turrets & Domes
  const roofBase = baseY + wallH + 1;
  if (meta.category === 'castle' || meta.category === 'bunker' || meta.category === 'arena') {
    // Flat walkable battlement deck + crenellations + 4 corner towers
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        pushIfValid(hx + dx, roofBase, hz + dz, meta.floorBlock);
        const isEdge = Math.abs(dx) === r || Math.abs(dz) === r;
        const isCorner = Math.abs(dx) >= r - 1 && Math.abs(dz) >= r - 1;
        if (isEdge && !isCorner && (Math.abs(dx + dz) % 2 === 0)) {
          pushIfValid(hx + dx, roofBase + 1, hz + dz, meta.wallBlock);
        }
        if (meta.towers >= 4 && isCorner) {
          for (let ty = 1; ty <= 3; ty++) {
            const towerEdge = Math.abs(dx) === r || Math.abs(dz) === r || (Math.abs(dx) === r - 1 && Math.abs(dz) === r - 1);
            if (ty === 3 && Math.abs(dx) === r - 1 && Math.abs(dz) === r - 1) {
              pushIfValid(hx + dx, roofBase + ty, hz + dz, meta.lightBlock);
            } else if (towerEdge || ty === 2) {
              pushIfValid(
                hx + dx,
                roofBase + ty,
                hz + dz,
                ty === 3 ? meta.roofBlock : meta.trimBlock
              );
            }
          }
        }
      }
    }
  } else if (meta.category === 'palace') {
    // Stepped dome roof with golden spire
    for (let step = 0; step <= Math.min(4, r); step++) {
      const span = r - step;
      for (let dx = -span; dx <= span; dx++) {
        for (let dz = -span; dz <= span; dz++) {
          const isRim = Math.abs(dx) === span || Math.abs(dz) === span;
          if (step > 0 && !isRim && step < Math.min(4, r)) continue;
          pushIfValid(
            hx + dx,
            roofBase + step,
            hz + dz,
            step >= Math.min(3, r) ? BlockId.GOLD_BLOCK : meta.roofBlock
          );
        }
      }
    }
    pushIfValid(hx, roofBase + Math.min(4, r) + 1, hz, BlockId.EMERALD_BLOCK);
  } else if (meta.category === 'pagoda') {
    // Tiered curved overhanging roofs
    for (let f = 0; f < meta.floors; f++) {
      const ry = baseY + (f + 1) * 4;
      const overhang = r + 1 - Math.floor(f / 2);
      for (let dx = -overhang; dx <= overhang; dx++) {
        for (let dz = -overhang; dz <= overhang; dz++) {
          if (Math.abs(dx) === overhang || Math.abs(dz) === overhang) {
            pushIfValid(hx + dx, ry, hz + dz, meta.roofBlock);
          }
        }
      }
    }
    pushIfValid(hx, roofBase, hz, meta.roofBlock);
    pushIfValid(hx, roofBase + 1, hz, BlockId.GOLD_BLOCK);
  } else {
    // Pitched / Modern Roof
    const maxStep = meta.category === 'villa' ? 1 : Math.min(4, r);
    for (let step = 0; step <= maxStep; step++) {
      const span = r - step;
      for (let dx = -span; dx <= span; dx++) {
        for (let dz = -span; dz <= span; dz++) {
          const isRim = Math.abs(dx) === span || Math.abs(dz) === span;
          if (step > 0 && !isRim && step < maxStep) continue;
          pushIfValid(
            hx + dx,
            roofBase + step,
            hz + dz,
            step === maxStep ? meta.trimBlock : meta.roofBlock
          );
        }
      }
    }
  }

  // 6. Interior Furnishings & Lighting
  pushIfValid(hx - r + 1, baseY + 1, hz - r + 1, BlockId.BED);
  pushIfValid(hx + r - 1, baseY + 1, hz - r + 1, BlockId.CRAFTING_TABLE);
  pushIfValid(hx + r - 1, baseY + 1, hz - r + 2, BlockId.FURNACE);
  pushIfValid(hx - r + 1, baseY + 1, hz + r - 1, BlockId.CHEST);
  pushIfValid(hx - r + 1, baseY + 1, hz, BlockId.BOOKSHELF);
  pushIfValid(hx + r - 1, baseY + 1, hz, meta.category === 'village' ? BlockId.ANVIL : BlockId.JUKEBOX);
  pushIfValid(hx - r + 1, baseY + 3, hz, meta.lightBlock);
  pushIfValid(hx + r - 1, baseY + 3, hz, meta.lightBlock);

  // 7. Train Station Powered Rail Line running right through/past the station
  if (meta.hasRailFeature) {
    for (let dx = -r - 4; dx <= r + 4; dx++) {
      pushIfValid(hx + dx, baseY, hz, BlockId.STONE_BRICKS);
      pushIfValid(hx + dx, baseY + 1, hz, Math.abs(dx) % 4 === 0 ? BlockId.POWERED_RAIL : BlockId.RAIL);
    }
  }

  return { meta, queue };
}

export function findStructureGroundY(hx: number, hz: number, world: VoxelWorld): number {
  return Math.max(
    WATER_LEVEL + 1,
    Math.min(CHUNK_HEIGHT - 18, Math.floor(world.findSafeSpawnY(hx, hz) - 1))
  );
}
