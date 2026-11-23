import { BlockId, getBlockDef } from './blocks';
import { hashStringToSeed, mulberry32, SeededNoise } from './noise';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const WATER_LEVEL = 22;

export type BiomeType = 'plains' | 'forest' | 'desert' | 'mountains';

export interface ChunkData {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  dirty: boolean;
}

export interface WorldSaveData {
  version: number;
  seedText: string;
  seed: number;
  mode: 'survival' | 'creative';
  timeOfDay: number;
  playerPos: [number, number, number];
  playerYaw: number;
  playerPitch: number;
  health: number;
  hunger: number;
  hotbar: ({ id: BlockId; count: number } | null)[];
  inventory: ({ id: BlockId; count: number } | null)[];
  edits: [number, number, number, number][]; // [x, y, z, blockId]
  coins?: number;
  unlockedStructures?: number[];
  immortal?: boolean;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function blockPosKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class VoxelWorld {
  public seedText: string;
  public seed: number;
  private heightNoise: SeededNoise;
  private biomeNoise: SeededNoise;
  private detailNoise: SeededNoise;
  private caveNoise: SeededNoise;

  public chunks = new Map<string, ChunkData>();
  public edits = new Map<string, number>();
  private columnEdits = new Map<string, Map<number, BlockId>>();

  constructor(seedText = 'CraftWorld') {
    this.seedText = seedText;
    this.seed = hashStringToSeed(seedText);
    this.heightNoise = new SeededNoise(this.seed);
    this.biomeNoise = new SeededNoise(this.seed + 1013);
    this.detailNoise = new SeededNoise(this.seed + 2029);
    this.caveNoise = new SeededNoise(this.seed + 4099);
  }

  public getBiomeAt(wx: number, wz: number): BiomeType {
    const temp = this.biomeNoise.fbm2D(wx * 0.008, wz * 0.008, 3);
    const ridge = this.detailNoise.fbm2D(wx * 0.006 + 50, wz * 0.006 - 50, 3);
    if (ridge > 0.24) return 'mountains';
    if (temp > 0.22) return 'desert';
    if (temp < -0.05) return 'forest';
    return 'plains';
  }

  public getTerrainHeight(wx: number, wz: number): { height: number; biome: BiomeType } {
    const biome = this.getBiomeAt(wx, wz);
    const base = this.heightNoise.fbm2D(wx * 0.015, wz * 0.015, 4);
    const detail = this.detailNoise.fbm2D(wx * 0.045, wz * 0.045, 2);

    let h = 25 + base * 12 + detail * 3;
    if (biome === 'mountains') {
      const peak = Math.max(0, this.detailNoise.fbm2D(wx * 0.02 + 20, wz * 0.02 + 20, 3));
      h += 10 + peak * 22;
    } else if (biome === 'desert') {
      h = 24 + base * 7 + detail * 2;
    }
    const clamped = Math.max(4, Math.min(CHUNK_HEIGHT - 8, Math.floor(h)));
    return { height: clamped, biome };
  }

  private index(lx: number, y: number, lz: number): number {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  public generateChunk(cx: number, cz: number): ChunkData {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;

    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    const chunk: ChunkData = { cx, cz, blocks, dirty: true };
    const treeSites: { lx: number; y: number; lz: number; rngVal: number; biome: BiomeType }[] = [];

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const { height, biome } = this.getTerrainHeight(wx, wz);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id = BlockId.AIR;

          if (y === 0) {
            id = BlockId.BEDROCK;
          } else if (y <= height) {
            // Check cave carving (keep surface 2 blocks and bottom 2 blocks solid)
            let isCave = false;
            if (y > 2 && y < height - 2) {
              const c1 = this.caveNoise.noise3D(wx * 0.065, y * 0.09, wz * 0.065);
              const c2 = this.detailNoise.noise3D(wx * 0.08 + 31, y * 0.11, wz * 0.08 + 17);
              if (c1 > 0.34 && Math.abs(c2) < 0.25) {
                isCave = true;
              }
            }

            if (!isCave) {
              if (y === height) {
                if (height < WATER_LEVEL + 1 && biome !== 'mountains') {
                  id = BlockId.SAND;
                } else if (biome === 'desert') {
                  id = BlockId.SAND;
                } else if (biome === 'mountains' && y >= 39) {
                  id = BlockId.SNOW;
                } else if (biome === 'mountains' && y >= 34) {
                  id = BlockId.STONE;
                } else {
                  id = BlockId.GRASS;
                }
              } else if (y >= height - 3) {
                id = biome === 'desert' ? BlockId.SAND : height < WATER_LEVEL ? BlockId.SAND : BlockId.DIRT;
              } else if (biome === 'desert' && y >= height - 6) {
                id = BlockId.SANDSTONE;
              } else {
                // Underground stone & ores
                const oreRoll = mulberry32((wx * 73856093) ^ (y * 19349663) ^ (wz * 83492791) ^ this.seed)();
                if (y < 12 && oreRoll < 0.01) {
                  id = BlockId.DIAMOND_ORE;
                } else if (y < 14 && oreRoll < 0.016) {
                  id = BlockId.EMERALD_ORE;
                } else if (y < 18 && oreRoll < 0.026) {
                  id = BlockId.REDSTONE_ORE;
                } else if (y < 22 && oreRoll < 0.036) {
                  id = BlockId.GOLD_ORE;
                } else if (y < 26 && oreRoll < 0.045) {
                  id = BlockId.LAPIS_ORE;
                } else if (y < 36 && oreRoll < 0.068) {
                  id = BlockId.IRON_ORE;
                } else if (y < 48 && oreRoll < 0.092) {
                  id = BlockId.COAL_ORE;
                } else if (y < 26 && oreRoll > 0.96) {
                  id = BlockId.GRAVEL;
                } else {
                  id = BlockId.STONE;
                }
              }
            }
          } else if (y <= WATER_LEVEL) {
            id = BlockId.WATER;
          }

          blocks[this.index(lx, y, lz)] = id;
        }

        // Surface vegetation markers
        if (height > WATER_LEVEL) {
          const rng = mulberry32((wx * 918273) ^ (wz * 372819) ^ this.seed)();
          const surfaceBlock = blocks[this.index(lx, height, lz)];
          if (surfaceBlock === BlockId.GRASS) {
            const treeChance = biome === 'forest' ? 0.045 : biome === 'plains' ? 0.01 : 0;
            if (lx >= 2 && lx <= 13 && lz >= 2 && lz <= 13 && rng < treeChance) {
              treeSites.push({ lx, y: height + 1, lz, rngVal: rng, biome });
            } else if (rng > 0.9 && height + 1 < CHUNK_HEIGHT) {
              blocks[this.index(lx, height + 1, lz)] = BlockId.TALL_GRASS;
            } else if (rng > 0.875 && rng <= 0.89 && height + 1 < CHUNK_HEIGHT) {
              blocks[this.index(lx, height + 1, lz)] = BlockId.POPPY;
            } else if (rng > 0.86 && rng <= 0.875 && height + 1 < CHUNK_HEIGHT) {
              blocks[this.index(lx, height + 1, lz)] = BlockId.DANDELION;
            }
          } else if (surfaceBlock === BlockId.SAND && biome === 'desert') {
            if (rng < 0.008 && height + 3 < CHUNK_HEIGHT) {
              const cHeight = 2 + Math.floor(rng * 250) % 2;
              for (let cy = 1; cy <= cHeight; cy++) {
                blocks[this.index(lx, height + cy, lz)] = BlockId.CACTUS;
              }
            }
          }
        }
      }
    }

    // Place Oak Trees inside chunk bounds
    for (const site of treeSites) {
      const trunkH = 4 + Math.floor(site.rngVal * 100) % 2;
      if (site.y + trunkH + 2 >= CHUNK_HEIGHT) continue;

      // Leaves canopy
      for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
        const radius = dy === trunkH + 1 ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy >= trunkH) continue;
            const tx = site.lx + dx;
            const tz = site.lz + dz;
            const ty = site.y + dy;
            if (tx >= 0 && tx < CHUNK_SIZE && tz >= 0 && tz < CHUNK_SIZE && ty < CHUNK_HEIGHT) {
              const idx = this.index(tx, ty, tz);
              if (blocks[idx] === BlockId.AIR) {
                blocks[idx] = BlockId.OAK_LEAVES;
              }
            }
          }
        }
      }

      // Trunk
      for (let dy = 0; dy < trunkH; dy++) {
        blocks[this.index(site.lx, site.y + dy, site.lz)] = BlockId.OAK_LOG;
      }
    }

    // Apply saved user edits inside this chunk
    const minX = cx * CHUNK_SIZE;
    const minZ = cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = minX + lx;
        const wz = minZ + lz;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const editVal = this.edits.get(blockPosKey(wx, y, wz));
          if (editVal !== undefined) {
            blocks[this.index(lx, y, lz)] = editVal;
          }
        }
      }
    }

    this.chunks.set(key, chunk);
    return chunk;
  }

  public getBlock(wx: number, y: number, wz: number): BlockId {
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockId.AIR;
    const ix = Math.floor(wx);
    const iy = Math.floor(y);
    const iz = Math.floor(wz);
    const cx = Math.floor(ix / CHUNK_SIZE);
    const cz = Math.floor(iz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) {
      const edit = this.edits.get(blockPosKey(ix, iy, iz));
      return edit !== undefined ? (edit as BlockId) : BlockId.AIR;
    }
    const lx = ((ix % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((iz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.blocks[this.index(lx, iy, lz)] as BlockId;
  }

  public setBlock(wx: number, y: number, wz: number, id: BlockId): void {
    const ix = Math.floor(wx);
    const iy = Math.floor(y);
    const iz = Math.floor(wz);
    if (iy < 1 || iy >= CHUNK_HEIGHT) return;

    const cx = Math.floor(ix / CHUNK_SIZE);
    const cz = Math.floor(iz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz)) ?? this.generateChunk(cx, cz);

    const lx = ((ix % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((iz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.blocks[this.index(lx, iy, lz)] = id;
    chunk.dirty = true;

    this.edits.set(blockPosKey(ix, iy, iz), id);
    const colKey = `${ix},${iz}`;
    let col = this.columnEdits.get(colKey);
    if (!col) {
      col = new Map<number, BlockId>();
      this.columnEdits.set(colKey, col);
    }
    col.set(iy, id);

    // Mark neighbor chunks dirty if on boundary (for face culling & AO)
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number) {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.dirty = true;
  }

  public isSolidAt(wx: number, y: number, wz: number): boolean {
    const id = this.getBlock(wx, y, wz);
    if (getBlockDef(id).solid) return true;
    if (id === BlockId.AIR && y >= 1 && this.getBlock(wx, y - 1, wz) === BlockId.OAK_DOOR_CLOSED) {
      return true;
    }
    return false;
  }

  public findSafeSpawnY(wx: number, wz: number): number {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    this.generateChunk(cx, cz);
    for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
      const b = this.getBlock(wx, y, wz);
      if (getBlockDef(b).solid) {
        return y + 1.2;
      }
    }
    return 32;
  }

  public getEditsArray(): [number, number, number, number][] {
    const arr: [number, number, number, number][] = [];
    for (const [k, v] of this.edits.entries()) {
      const [x, y, z] = k.split(',').map(Number);
      arr.push([x, y, z, v]);
    }
    return arr;
  }

  public loadEditsArray(edits: [number, number, number, number][]) {
    this.edits.clear();
    this.columnEdits.clear();
    for (const [x, y, z, id] of edits) {
      this.edits.set(blockPosKey(x, y, z), id);
      const colKey = `${x},${z}`;
      let col = this.columnEdits.get(colKey);
      if (!col) {
        col = new Map<number, BlockId>();
        this.columnEdits.set(colKey, col);
      }
      col.set(y, id as BlockId);
    }
    // Re-apply to loaded chunks
    this.chunks.clear();
  }

  public sampleMapColumn(wx: number, wz: number): { blockId: BlockId; y: number; biome: BiomeType } {
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    const cx = Math.floor(ix / CHUNK_SIZE);
    const cz = Math.floor(iz / CHUNK_SIZE);
    const biome = this.getBiomeAt(ix, iz);
    const chunk = this.chunks.get(chunkKey(cx, cz));

    if (chunk) {
      const lx = ((ix % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((iz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      for (let y = CHUNK_HEIGHT - 1; y >= 1; y--) {
        const b = chunk.blocks[this.index(lx, y, lz)] as BlockId;
        if (b !== BlockId.AIR) {
          return { blockId: b, y, biome };
        }
      }
      return { blockId: BlockId.BEDROCK, y: 0, biome };
    }

    const { height } = this.getTerrainHeight(ix, iz);
    let topY = height;
    let topId: BlockId;

    if (height < WATER_LEVEL) {
      topY = WATER_LEVEL;
      topId = BlockId.WATER;
    } else if (height === WATER_LEVEL) {
      topId = BlockId.SAND;
    } else if (biome === 'desert') {
      topId = BlockId.SAND;
    } else if (biome === 'mountains' && height >= 39) {
      topId = BlockId.SNOW;
    } else if (biome === 'mountains' && height >= 34) {
      topId = BlockId.STONE;
    } else {
      topId = BlockId.GRASS;
    }

    const col = this.columnEdits.get(`${ix},${iz}`);
    if (col) {
      for (const [ey, eid] of col.entries()) {
        if (eid !== BlockId.AIR && ey >= topY) {
          topY = ey;
          topId = eid;
        }
      }
    }

    return { blockId: topId, y: topY, biome };
  }
}
