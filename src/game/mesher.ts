import * as THREE from 'three';
import { BlockId, getBlockDef } from './blocks';
import { ATLAS_GRID } from './textures';
import { CHUNK_HEIGHT, CHUNK_SIZE, ChunkData, VoxelWorld } from './world';

export interface ChunkMeshResult {
  opaque: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

interface MeshBuffers {
  pos: number[];
  norm: number[];
  uv: number[];
  col: number[];
  idx: number[];
}

function createEmptyBuffers(): MeshBuffers {
  return { pos: [], norm: [], uv: [], col: [], idx: [] };
}

function buildGeometry(buf: MeshBuffers): THREE.BufferGeometry | null {
  if (buf.pos.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  geo.setIndex(buf.idx);
  geo.computeBoundingSphere();
  return geo;
}

interface FaceSpec {
  dir: [number, number, number];
  corners: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
  // 2 tangent axes for AO neighbor sampling
  uAxis: [number, number, number];
  vAxis: [number, number, number];
  shade: number;
  kind: 'top' | 'bottom' | 'side' | 'front';
}

const FACES: FaceSpec[] = [
  // +Y (Top)
  {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, 1],
    shade: 1.0,
    kind: 'top',
  },
  // -Y (Bottom)
  {
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, 1],
    shade: 0.56,
    kind: 'bottom',
  },
  // +X (East)
  {
    dir: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    uAxis: [0, 0, 1],
    vAxis: [0, 1, 0],
    shade: 0.78,
    kind: 'side',
  },
  // -X (West)
  {
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    uAxis: [0, 0, 1],
    vAxis: [0, 1, 0],
    shade: 0.78,
    kind: 'side',
  },
  // +Z (South / Front)
  {
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    shade: 0.88,
    kind: 'front',
  },
  // -Z (North)
  {
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    shade: 0.88,
    kind: 'side',
  },
];

function tileUVs(tileIndex: number): [number, number, number, number] {
  const col = tileIndex % ATLAS_GRID;
  const row = Math.floor(tileIndex / ATLAS_GRID);
  const step = 1 / ATLAS_GRID;
  const eps = 0.0015;
  const u0 = col * step + eps;
  const u1 = (col + 1) * step - eps;
  // Canvas Y=0 is top, WebGL UV V=1 is top
  const v1 = 1 - row * step - eps;
  const v0 = 1 - (row + 1) * step + eps;
  return [u0, v0, u1, v1];
}

function isOpaqueForAO(world: VoxelWorld, wx: number, y: number, wz: number): boolean {
  const id = world.getBlock(wx, y, wz);
  if (id === BlockId.AIR) return false;
  const def = getBlockDef(id);
  return def.solid && !def.transparent;
}

function computeCornerAO(
  world: VoxelWorld,
  bx: number,
  by: number,
  bz: number,
  face: FaceSpec,
  corner: [number, number, number]
): number {
  const nx = bx + face.dir[0];
  const ny = by + face.dir[1];
  const nz = bz + face.dir[2];

  // Determine signed offsets along uAxis and vAxis for this corner
  const cu = corner[0] * face.uAxis[0] + corner[1] * face.uAxis[1] + corner[2] * face.uAxis[2];
  const cv = corner[0] * face.vAxis[0] + corner[1] * face.vAxis[1] + corner[2] * face.vAxis[2];
  const su = cu > 0.5 ? 1 : -1;
  const sv = cv > 0.5 ? 1 : -1;

  const side1 = isOpaqueForAO(
    world,
    nx + face.uAxis[0] * su,
    ny + face.uAxis[1] * su,
    nz + face.uAxis[2] * su
  ) ? 1 : 0;
  const side2 = isOpaqueForAO(
    world,
    nx + face.vAxis[0] * sv,
    ny + face.vAxis[1] * sv,
    nz + face.vAxis[2] * sv
  ) ? 1 : 0;
  const diag =
    side1 && side2
      ? 1
      : isOpaqueForAO(
          world,
          nx + face.uAxis[0] * su + face.vAxis[0] * sv,
          ny + face.uAxis[1] * su + face.vAxis[1] * sv,
          nz + face.uAxis[2] * su + face.vAxis[2] * sv
        )
        ? 1
        : 0;

  const occ = side1 + side2 + diag; // 0..3
  // Minecraft AO levels: 1.0, 0.82, 0.66, 0.50
  return occ === 0 ? 1.0 : occ === 1 ? 0.84 : occ === 2 ? 0.68 : 0.52;
}

function emitCrossPlant(
  buf: MeshBuffers,
  lx: number,
  y: number,
  lz: number,
  tileIndex: number,
  emissive = false
) {
  const [u0, v0, u1, v1] = tileUVs(tileIndex);
  const bright = emissive ? 1.15 : 0.96;
  const pad = 0.14;
  const x0 = lx + pad;
  const x1 = lx + 1 - pad;
  const z0 = lz + pad;
  const z1 = lz + 1 - pad;
  const y0 = y;
  const y1 = y + 0.92;

  const quads: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]][] = [
    [[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]],
    [[x1, y0, z1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z1]],
    [[x0, y0, z1], [x1, y0, z0], [x1, y1, z0], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z1], [x0, y1, z1], [x1, y1, z0]],
  ];

  for (const q of quads) {
    const base = buf.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      buf.pos.push(q[i][0], q[i][1], q[i][2]);
      buf.norm.push(0, 1, 0);
      buf.col.push(bright, bright, bright);
    }
    buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function emitBox(
  buf: MeshBuffers,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tileTop: number,
  tileSide: number,
  tileBottom: number,
  emissive = false
) {
  const b = emissive ? 1.24 : 1.0;
  const boxFaces: {
    norm: [number, number, number];
    pts: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
    tile: number;
    shade: number;
  }[] = [
    {
      norm: [0, 1, 0],
      pts: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      tile: tileTop,
      shade: 1.0,
    },
    {
      norm: [0, -1, 0],
      pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      tile: tileBottom,
      shade: 0.58,
    },
    {
      norm: [1, 0, 0],
      pts: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      tile: tileSide,
      shade: 0.8,
    },
    {
      norm: [-1, 0, 0],
      pts: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      tile: tileSide,
      shade: 0.8,
    },
    {
      norm: [0, 0, 1],
      pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      tile: tileSide,
      shade: 0.9,
    },
    {
      norm: [0, 0, -1],
      pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
      tile: tileSide,
      shade: 0.9,
    },
  ];

  for (const f of boxFaces) {
    const [u0, v0, u1, v1] = tileUVs(f.tile);
    const base = buf.pos.length / 3;
    const lit = f.shade * b;
    for (let i = 0; i < 4; i++) {
      buf.pos.push(f.pts[i][0], f.pts[i][1], f.pts[i][2]);
      buf.norm.push(f.norm[0], f.norm[1], f.norm[2]);
      buf.col.push(lit, lit, lit);
    }
    buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function isDoorwayWallSolid(world: VoxelWorld, wx: number, y: number, wz: number): boolean {
  const id = world.getBlock(wx, y, wz);
  if (id === BlockId.AIR || id === BlockId.OAK_DOOR_CLOSED || id === BlockId.OAK_DOOR_OPEN) return false;
  return getBlockDef(id).solid;
}

function emitDoorMesh(
  buf: MeshBuffers,
  world: VoxelWorld,
  wx: number,
  lx: number,
  y: number,
  wz: number,
  lz: number,
  isOpen: boolean,
  lowerTile: number,
  upperTile: number
) {
  const wallOnX =
    isDoorwayWallSolid(world, wx - 1, y, wz) || isDoorwayWallSolid(world, wx + 1, y, wz);
  const wallOnZ =
    isDoorwayWallSolid(world, wx, y, wz - 1) || isDoorwayWallSolid(world, wx, y, wz + 1);
  const spanAlongX = wallOnX || !wallOnZ;

  // Determine exact leaf bounds for closed vs 90-degree swung open door
  let x0: number, x1: number, z0: number, z1: number;
  if (spanAlongX) {
    if (!isOpen) {
      x0 = lx; x1 = lx + 1; z0 = lz + 0.41; z1 = lz + 0.59;
    } else {
      x0 = lx + 0.02; x1 = lx + 0.2; z0 = lz; z1 = lz + 1;
    }
  } else {
    if (!isOpen) {
      x0 = lx + 0.41; x1 = lx + 0.59; z0 = lz; z1 = lz + 1;
    } else {
      x0 = lx; x1 = lx + 1; z0 = lz + 0.02; z1 = lz + 0.2;
    }
  }

  // Lower door panel (y..y+1)
  emitBox(buf, x0, y, z0, x1, y + 1, z1, lowerTile, lowerTile, lowerTile, false);
  // Upper door panel with window cutout (y+1..y+1.98)
  emitBox(buf, x0, y + 1, z0, x1, y + 1.98, z1, lowerTile, upperTile, lowerTile, false);
}

function emitFenceOrBars(
  buf: MeshBuffers,
  world: VoxelWorld,
  wx: number,
  lx: number,
  y: number,
  wz: number,
  lz: number,
  id: BlockId,
  tile: number
) {
  const isBars = id === BlockId.IRON_BARS;
  const r = isBars ? 0.07 : 0.13;
  emitBox(buf, lx + 0.5 - r, y, lz + 0.5 - r, lx + 0.5 + r, y + 1, lz + 0.5 + r, tile, tile, tile);

  const connects = (nx: number, nz: number) => {
    const nid = world.getBlock(nx, y, nz);
    return nid === id || nid === BlockId.OAK_FENCE || nid === BlockId.IRON_BARS || getBlockDef(nid).solid;
  };
  const barLow0 = isBars ? y + 0.2 : y + 0.34;
  const barLow1 = isBars ? y + 0.32 : y + 0.5;
  const barHigh0 = isBars ? y + 0.68 : y + 0.72;
  const barHigh1 = isBars ? y + 0.8 : y + 0.88;
  const w = isBars ? 0.04 : 0.06;

  if (connects(wx + 1, wz)) {
    emitBox(buf, lx + 0.5, barLow0, lz + 0.5 - w, lx + 1, barLow1, lz + 0.5 + w, tile, tile, tile);
    emitBox(buf, lx + 0.5, barHigh0, lz + 0.5 - w, lx + 1, barHigh1, lz + 0.5 + w, tile, tile, tile);
  }
  if (connects(wx - 1, wz)) {
    emitBox(buf, lx, barLow0, lz + 0.5 - w, lx + 0.5, barLow1, lz + 0.5 + w, tile, tile, tile);
    emitBox(buf, lx, barHigh0, lz + 0.5 - w, lx + 0.5, barHigh1, lz + 0.5 + w, tile, tile, tile);
  }
  if (connects(wx, wz + 1)) {
    emitBox(buf, lx + 0.5 - w, barLow0, lz + 0.5, lx + 0.5 + w, barLow1, lz + 1, tile, tile, tile);
    emitBox(buf, lx + 0.5 - w, barHigh0, lz + 0.5, lx + 0.5 + w, barHigh1, lz + 1, tile, tile, tile);
  }
  if (connects(wx, wz - 1)) {
    emitBox(buf, lx + 0.5 - w, barLow0, lz, lx + 0.5 + w, barLow1, lz + 0.5, tile, tile, tile);
    emitBox(buf, lx + 0.5 - w, barHigh0, lz, lx + 0.5 + w, barHigh1, lz + 0.5, tile, tile, tile);
  }
}

function emitRailQuad(
  buf: MeshBuffers,
  world: VoxelWorld,
  wx: number,
  lx: number,
  y: number,
  wz: number,
  lz: number,
  tileIndex: number,
  emissive = false
) {
  const [u0, v0, u1, v1] = tileUVs(tileIndex);
  const bright = emissive ? 1.15 : 0.96;
  const baseY = y + 0.055;
  const base = buf.pos.length / 3;

  const isRailAt = (rx: number, ry: number, rz: number) =>
    !!getBlockDef(world.getBlock(rx, ry, rz)).isRail;

  const nUp = isRailAt(wx, y + 1, wz - 1);
  const sUp = isRailAt(wx, y + 1, wz + 1);
  const wUp = isRailAt(wx - 1, y + 1, wz);
  const eUp = isRailAt(wx + 1, y + 1, wz);

  const hasZ =
    isRailAt(wx, y, wz - 1) || isRailAt(wx, y, wz + 1) ||
    nUp || sUp ||
    isRailAt(wx, y - 1, wz - 1) || isRailAt(wx, y - 1, wz + 1);
  const hasX =
    isRailAt(wx - 1, y, wz) || isRailAt(wx + 1, y, wz) ||
    wUp || eUp ||
    isRailAt(wx - 1, y - 1, wz) || isRailAt(wx + 1, y - 1, wz);
  const rotate90 = (hasX && !hasZ) || wUp || eUp;

  // Slope corners upward when climbing 1-block hills!
  const ySW = baseY + (sUp || wUp ? 1.0 : 0);
  const ySE = baseY + (sUp || eUp ? 1.0 : 0);
  const yNE = baseY + (nUp || eUp ? 1.0 : 0);
  const yNW = baseY + (nUp || wUp ? 1.0 : 0);

  const corners: [number, number, number][] = [
    [lx, ySW, lz + 1],
    [lx + 1, ySE, lz + 1],
    [lx + 1, yNE, lz],
    [lx, yNW, lz],
  ];
  for (let i = 0; i < 4; i++) {
    buf.pos.push(corners[i][0], corners[i][1], corners[i][2]);
    buf.norm.push(0, 1, 0);
    buf.col.push(bright, bright, bright);
  }
  if (rotate90) {
    buf.uv.push(u1, v0, u1, v1, u0, v1, u0, v0);
  } else {
    buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
  }
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function buildChunkMesh(world: VoxelWorld, chunk: ChunkData): ChunkMeshResult {
  const opaque = createEmptyBuffers();
  const cutout = createEmptyBuffers();
  const water = createEmptyBuffers();

  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] as BlockId;
        if (id === BlockId.AIR) continue;

        const def = getBlockDef(id);
        const wx = baseX + lx;
        const wz = baseZ + lz;

        if (def.isPlant) {
          emitCrossPlant(cutout, lx, y, lz, def.tiles.side, def.emissive);
          continue;
        }

        if (def.isRail) {
          emitRailQuad(cutout, world, wx, lx, y, wz, lz, def.tiles.top, def.emissive);
          continue;
        }

        if (id === BlockId.OAK_DOOR_CLOSED || id === BlockId.OAK_DOOR_OPEN) {
          emitDoorMesh(
            cutout,
            world,
            wx,
            lx,
            y,
            wz,
            lz,
            id === BlockId.OAK_DOOR_OPEN,
            def.tiles.side,
            def.tiles.front ?? def.tiles.top
          );
          continue;
        }

        if (id === BlockId.TORCH) {
          emitBox(opaque, lx + 0.43, y, lz + 0.43, lx + 0.57, y + 0.58, lz + 0.57, def.tiles.side, def.tiles.side, def.tiles.bottom);
          emitBox(opaque, lx + 0.41, y + 0.56, lz + 0.41, lx + 0.59, y + 0.72, lz + 0.59, def.tiles.top, def.tiles.top, def.tiles.top, true);
          continue;
        }

        if (id === BlockId.LANTERN) {
          emitBox(opaque, lx + 0.3, y, lz + 0.3, lx + 0.7, y + 0.48, lz + 0.7, def.tiles.top, def.tiles.side, def.tiles.bottom, true);
          emitBox(opaque, lx + 0.36, y + 0.48, lz + 0.36, lx + 0.64, y + 0.62, lz + 0.64, def.tiles.top, def.tiles.top, def.tiles.top);
          continue;
        }

        if (id === BlockId.BED) {
          emitBox(opaque, lx + 0.02, y, lz + 0.02, lx + 0.98, y + 0.54, lz + 0.98, def.tiles.top, def.tiles.side, def.tiles.bottom);
          continue;
        }

        if (id === BlockId.OAK_FENCE || id === BlockId.IRON_BARS) {
          emitFenceOrBars(cutout, world, wx, lx, y, wz, lz, id, def.tiles.side);
          continue;
        }

        const target = id === BlockId.WATER ? water : def.cutout ? cutout : opaque;

        for (const face of FACES) {
          const nbx = wx + face.dir[0];
          const nby = y + face.dir[1];
          const nbz = wz + face.dir[2];

          const neighborId = world.getBlock(nbx, nby, nbz);
          if (def.isLiquid) {
            if (neighborId === id) continue;
            const nDef = getBlockDef(neighborId);
            if (nDef.solid && !nDef.transparent) continue;
          } else if (def.cutout) {
            if (neighborId === id && id === BlockId.GLASS) continue;
            const nDef = getBlockDef(neighborId);
            if (nDef.solid && !nDef.transparent) continue;
          } else {
            const nDef = getBlockDef(neighborId);
            if (nDef.solid && !nDef.transparent) continue;
          }

          let tile = def.tiles.side;
          if (face.kind === 'top') tile = def.tiles.top;
          else if (face.kind === 'bottom') tile = def.tiles.bottom;
          else if (face.kind === 'front' && def.tiles.front !== undefined) tile = def.tiles.front;

          const [u0, v0, u1, v1] = tileUVs(tile);
          const baseIdx = target.pos.length / 3;
          const aos: number[] = [];

          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            let cy = y + corner[1];
            if (def.isLiquid && corner[1] === 1 && world.getBlock(wx, y + 1, wz) !== id) {
              cy -= 0.12;
            }
            target.pos.push(lx + corner[0], cy, lz + corner[2]);
            target.norm.push(face.dir[0], face.dir[1], face.dir[2]);

            const ao = def.isLiquid || def.emissive ? 1.0 : computeCornerAO(world, wx, y, wz, face, corner);
            aos.push(ao);
            const lit = (def.emissive ? 1.22 : face.shade) * ao;
            target.col.push(lit, lit, lit);
          }

          target.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);

          // Flip quad diagonal when AO anisotropy occurs (classic Minecraft smooth AO fix!)
          if (aos[0] + aos[2] > aos[1] + aos[3]) {
            target.idx.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
          } else {
            target.idx.push(baseIdx + 1, baseIdx + 2, baseIdx + 3, baseIdx + 1, baseIdx + 3, baseIdx);
          }
        }
      }
    }
  }

  chunk.dirty = false;
  return {
    opaque: buildGeometry(opaque),
    cutout: buildGeometry(cutout),
    water: buildGeometry(water),
  };
}
