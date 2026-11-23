import * as THREE from 'three';
import { BlockId, getBlockDef } from './blocks';

export const ATLAS_GRID = 16;
export const TILE_SIZE = 16;
export const ATLAS_PX = ATLAS_GRID * TILE_SIZE; // 256x256

function prng(x: number, y: number, seed = 1): number {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function pxColor(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 1
) {
  ctx.fillStyle = `rgba(${clampByte(r)},${clampByte(g)},${clampByte(b)},${a})`;
  ctx.fillRect(ox + x, oy + y, 1, 1);
}

function fillNoiseTile(
  ctx: CanvasRenderingContext2D,
  tileIndex: number,
  base: [number, number, number],
  variance: number,
  seed: number,
  alpha = 1
) {
  const ox = (tileIndex % ATLAS_GRID) * TILE_SIZE;
  const oy = Math.floor(tileIndex / ATLAS_GRID) * TILE_SIZE;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = (prng(x, y, seed) - 0.5) * 2 * variance;
      pxColor(ctx, ox, oy, x, y, base[0] + n, base[1] + n, base[2] + n, alpha);
    }
  }
}

function drawTilePixelPattern(
  ctx: CanvasRenderingContext2D,
  tileIndex: number,
  rows: string[],
  palette: Record<string, string>
) {
  const ox = (tileIndex % ATLAS_GRID) * TILE_SIZE;
  const oy = Math.floor(tileIndex / ATLAS_GRID) * TILE_SIZE;
  ctx.clearRect(ox, oy, 16, 16);
  for (let y = 0; y < 16 && y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < 16 && x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || !palette[ch]) continue;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function tileOrigin(tileIndex: number): [number, number] {
  return [(tileIndex % ATLAS_GRID) * TILE_SIZE, Math.floor(tileIndex / ATLAS_GRID) * TILE_SIZE];
}

export function buildTextureAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX);

  // 0: Grass Top
  fillNoiseTile(ctx, 0, [98, 164, 62], 18, 11);

  // 2: Dirt
  fillNoiseTile(ctx, 2, [130, 91, 58], 18, 22);
  {
    const [ox, oy] = tileOrigin(2);
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(prng(i, 1, 23) * 16);
      const y = Math.floor(prng(i, 2, 23) * 16);
      pxColor(ctx, ox, oy, x, y, 92, 62, 39);
    }
  }

  // 1: Grass Side (dirt + overhanging grass lip)
  {
    const [dx, dy] = tileOrigin(2);
    const [ox, oy] = tileOrigin(1);
    ctx.drawImage(canvas, dx, dy, 16, 16, ox, oy, 16, 16);
    for (let x = 0; x < 16; x++) {
      const lip = 3 + Math.floor(prng(x, 0, 31) * 3);
      for (let y = 0; y < lip; y++) {
        const n = (prng(x, y, 32) - 0.5) * 26;
        pxColor(ctx, ox, oy, x, y, 92 + n, 158 + n, 58 + n);
      }
      pxColor(ctx, ox, oy, x, lip, 68, 118, 42);
    }
  }

  // 3: Stone
  fillNoiseTile(ctx, 3, [126, 128, 130], 16, 33);
  {
    const [ox, oy] = tileOrigin(3);
    for (let y = 0; y < 16; y += 4) {
      for (let x = 0; x < 16; x++) {
        if (prng(x, y, 35) > 0.55) {
          pxColor(ctx, ox, oy, x, y, 102, 104, 108);
        }
      }
    }
  }

  // 4: Cobblestone
  fillNoiseTile(ctx, 4, [118, 118, 120], 14, 44);
  {
    const [ox, oy] = tileOrigin(4);
    ctx.fillStyle = '#535356';
    for (const y of [0, 5, 10, 15]) ctx.fillRect(ox, oy + y, 16, 1);
    for (const [x, y, h] of [
      [4, 0, 5], [11, 0, 5], [2, 5, 5], [8, 5, 5], [14, 5, 5],
      [5, 10, 5], [12, 10, 5],
    ]) {
      ctx.fillRect(ox + x, oy + y, 1, h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(ox + 1, oy + 1, 3, 1);
    ctx.fillRect(ox + 6, oy + 1, 4, 1);
    ctx.fillRect(ox + 3, oy + 6, 4, 1);
    ctx.fillRect(ox + 6, oy + 11, 5, 1);
  }

  // 5: Oak Log Side
  fillNoiseTile(ctx, 5, [106, 78, 48], 10, 55);
  {
    const [ox, oy] = tileOrigin(5);
    for (let x = 0; x < 16; x += 3) {
      for (let y = 0; y < 16; y++) {
        if (prng(x, y, 56) > 0.25) pxColor(ctx, ox, oy, x, y, 76, 54, 32);
      }
    }
  }

  // 6: Oak Log Top
  {
    const [ox, oy] = tileOrigin(6);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = Math.abs(x - 7.5);
        const dy = Math.abs(y - 7.5);
        const d = Math.max(dx, dy);
        if (d > 6.5) {
          pxColor(ctx, ox, oy, x, y, 88, 62, 36);
        } else if (Math.floor(d) % 2 === 0) {
          pxColor(ctx, ox, oy, x, y, 174, 138, 86);
        } else {
          pxColor(ctx, ox, oy, x, y, 148, 112, 66);
        }
      }
    }
  }

  // 7: Oak Planks
  fillNoiseTile(ctx, 7, [174, 134, 82], 10, 77);
  {
    const [ox, oy] = tileOrigin(7);
    ctx.fillStyle = '#73532d';
    for (const y of [0, 4, 8, 12]) ctx.fillRect(ox, oy + y, 16, 1);
    ctx.fillRect(ox + 7, oy + 1, 1, 3);
    ctx.fillRect(ox + 13, oy + 5, 1, 3);
    ctx.fillRect(ox + 4, oy + 9, 1, 3);
    ctx.fillRect(ox + 10, oy + 13, 1, 3);
  }

  // 8: Oak Leaves (cutout alpha)
  {
    const [ox, oy] = tileOrigin(8);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = prng(x, y, 88);
        if (r < 0.22) continue; // alpha hole
        const shade = (prng(x, y, 89) - 0.5) * 34;
        pxColor(ctx, ox, oy, x, y, 64 + shade, 126 + shade, 46 + shade);
      }
    }
  }

  // 9: Sand
  fillNoiseTile(ctx, 9, [222, 208, 152], 14, 99);

  // 10: Water
  {
    const [ox, oy] = tileOrigin(10);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const wave = Math.sin((x + y * 2) * 0.6) * 14;
        pxColor(ctx, ox, oy, x, y, 42 + wave * 0.4, 108 + wave * 0.7, 212 + wave, 0.78);
      }
    }
  }

  // 11: Glass
  {
    const [ox, oy] = tileOrigin(11);
    ctx.fillStyle = 'rgba(186, 232, 248, 0.14)';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.fillStyle = 'rgba(218, 244, 255, 0.9)';
    ctx.fillRect(ox, oy, 16, 1);
    ctx.fillRect(ox, oy + 15, 16, 1);
    ctx.fillRect(ox, oy, 1, 16);
    ctx.fillRect(ox + 15, oy, 1, 16);
    // Diagonal shine
    for (let i = 2; i < 6; i++) {
      pxColor(ctx, ox, oy, i, 7 - i, 240, 252, 255, 0.85);
      pxColor(ctx, ox, oy, i + 7, 15 - i, 240, 252, 255, 0.7);
    }
  }

  // 12: Bedrock
  fillNoiseTile(ctx, 12, [48, 48, 52], 24, 120);

  // 13..16: Ores (base stone + colored specks)
  const oreSpecs: [number, [number, number, number]][] = [
    [13, [28, 28, 32]],      // Coal
    [14, [212, 168, 134]],   // Iron
    [15, [242, 206, 56]],    // Gold
    [16, [72, 232, 224]],    // Diamond
  ];
  for (const [tileIdx, oreColor] of oreSpecs) {
    const [sx, sy] = tileOrigin(3);
    const [ox, oy] = tileOrigin(tileIdx);
    ctx.drawImage(canvas, sx, sy, 16, 16, ox, oy, 16, 16);
    const spots = [
      [3, 3], [4, 3], [4, 4],
      [10, 2], [11, 2], [11, 3],
      [6, 8], [7, 8], [7, 9],
      [11, 11], [12, 11], [12, 12],
      [3, 12], [4, 12],
    ];
    for (const [x, y] of spots) {
      pxColor(ctx, ox, oy, x, y, oreColor[0], oreColor[1], oreColor[2]);
    }
  }

  // 17: Crafting Table Top
  {
    const [ox, oy] = tileOrigin(17);
    ctx.fillStyle = '#a07244';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.fillStyle = '#5c3c20';
    ctx.fillRect(ox, oy, 16, 1);
    ctx.fillRect(ox, oy + 15, 16, 1);
    ctx.fillRect(ox, oy, 1, 16);
    ctx.fillRect(ox + 15, oy, 1, 16);
    for (const g of [5, 10]) {
      ctx.fillRect(ox + g, oy + 1, 1, 14);
      ctx.fillRect(ox + 1, oy + g, 14, 1);
    }
  }

  // 18: Crafting Table Side
  {
    const [px, py] = tileOrigin(7);
    const [ox, oy] = tileOrigin(18);
    ctx.drawImage(canvas, px, py, 16, 16, ox, oy, 16, 16);
    ctx.fillStyle = '#56391e';
    ctx.fillRect(ox, oy, 16, 3);
    ctx.fillStyle = '#9aa0a6'; // saw blade
    ctx.fillRect(ox + 3, oy + 5, 3, 6);
    ctx.fillStyle = '#3b2816';
    ctx.fillRect(ox + 9, oy + 5, 4, 2);
    ctx.fillRect(ox + 10, oy + 7, 2, 5);
  }

  // 19: Furnace Front
  {
    const [cx, cy] = tileOrigin(4);
    const [ox, oy] = tileOrigin(19);
    ctx.drawImage(canvas, cx, cy, 16, 16, ox, oy, 16, 16);
    ctx.fillStyle = '#1d1d20';
    ctx.fillRect(ox + 4, oy + 4, 8, 5);
    ctx.fillRect(ox + 3, oy + 10, 10, 4);
    ctx.fillStyle = '#d97724';
    ctx.fillRect(ox + 5, oy + 11, 6, 2);
  }

  // 20: Furnace Side/Top
  {
    const [cx, cy] = tileOrigin(3);
    const [ox, oy] = tileOrigin(20);
    ctx.drawImage(canvas, cx, cy, 16, 16, ox, oy, 16, 16);
    ctx.fillStyle = '#59595e';
    ctx.fillRect(ox, oy, 16, 2);
    ctx.fillRect(ox, oy + 14, 16, 2);
  }

  // 21: Chest Front & 22: Chest Side
  for (const idx of [21, 22]) {
    const [ox, oy] = tileOrigin(idx);
    ctx.fillStyle = '#9c6c38';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.fillStyle = '#3d2814';
    ctx.fillRect(ox, oy, 16, 1);
    ctx.fillRect(ox, oy + 15, 16, 1);
    ctx.fillRect(ox, oy, 1, 16);
    ctx.fillRect(ox + 15, oy, 1, 16);
    ctx.fillRect(ox, oy + 5, 16, 1);
    if (idx === 21) {
      ctx.fillStyle = '#d4d8dc';
      ctx.fillRect(ox + 7, oy + 4, 2, 4);
    }
  }

  // 23: Torch (cutout)
  drawTilePixelPattern(
    ctx,
    23,
    [
      '................',
      '.......YY.......',
      '......YOYY......',
      '......YOOY......',
      '.......OO.......',
      '.......WW.......',
      '.......ww.......',
      '.......WW.......',
      '.......ww.......',
      '.......WW.......',
      '.......ww.......',
      '.......WW.......',
      '.......ww.......',
      '.......WW.......',
      '.......ww.......',
      '................',
    ],
    { Y: '#fde047', O: '#f97316', W: '#8b5e34', w: '#6b4423' }
  );

  // 24: Bricks
  {
    const [ox, oy] = tileOrigin(24);
    ctx.fillStyle = '#9b4436';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.fillStyle = '#c8bfb3';
    for (const y of [3, 7, 11, 15]) ctx.fillRect(ox, oy + y, 16, 1);
    for (const [x, y] of [
      [7, 0], [15, 0], [3, 4], [11, 4], [7, 8], [15, 8], [3, 12], [11, 12],
    ]) {
      ctx.fillRect(ox + x, oy + y, 1, 3);
    }
  }

  // 25: TNT Side
  {
    const [ox, oy] = tileOrigin(25);
    ctx.fillStyle = '#c9332b';
    ctx.fillRect(ox, oy, 16, 16);
    for (let x = 0; x < 16; x += 2) {
      ctx.fillStyle = '#a8231c';
      ctx.fillRect(ox + x, oy, 1, 16);
    }
    ctx.fillStyle = '#f3f1eb';
    ctx.fillRect(ox, oy + 5, 16, 6);
    ctx.fillStyle = '#18181b';
    // T N T
    ctx.fillRect(ox + 2, oy + 6, 3, 1);
    ctx.fillRect(ox + 3, oy + 7, 1, 3);
    ctx.fillRect(ox + 6, oy + 6, 1, 4);
    ctx.fillRect(ox + 7, oy + 7, 1, 1);
    ctx.fillRect(ox + 8, oy + 8, 1, 1);
    ctx.fillRect(ox + 9, oy + 6, 1, 4);
    ctx.fillRect(ox + 11, oy + 6, 3, 1);
    ctx.fillRect(ox + 12, oy + 7, 1, 3);
  }

  // 26: TNT Top & 27: TNT Bottom
  for (const idx of [26, 27]) {
    const [ox, oy] = tileOrigin(idx);
    ctx.fillStyle = '#b92b24';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.fillStyle = '#52525b';
    if (idx === 26) ctx.fillRect(ox + 6, oy + 6, 4, 4);
  }

  // 28: Snow
  fillNoiseTile(ctx, 28, [240, 247, 255], 8, 280);

  // 29: Gravel
  fillNoiseTile(ctx, 29, [136, 132, 128], 26, 290);

  // 30: Bookshelf
  {
    const [px, py] = tileOrigin(7);
    const [ox, oy] = tileOrigin(30);
    ctx.drawImage(canvas, px, py, 16, 16, ox, oy, 16, 16);
    ctx.fillStyle = '#332214';
    ctx.fillRect(ox, oy + 2, 16, 5);
    ctx.fillRect(ox, oy + 9, 16, 5);
    const bookColors = ['#b91c1c', '#1d4ed8', '#15803d', '#b45309', '#7e22ce'];
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = bookColors[i % bookColors.length];
      ctx.fillRect(ox + i * 2, oy + 3, 2, 4);
      ctx.fillStyle = bookColors[(i + 2) % bookColors.length];
      ctx.fillRect(ox + i * 2, oy + 10, 2, 4);
    }
  }

  // 31: Glowstone
  fillNoiseTile(ctx, 31, [242, 198, 92], 32, 310);

  // 32: Obsidian
  fillNoiseTile(ctx, 32, [28, 20, 44], 16, 320);

  // 33: Cactus Side & 34: Cactus Top
  fillNoiseTile(ctx, 33, [46, 122, 48], 12, 330);
  {
    const [ox, oy] = tileOrigin(33);
    ctx.fillStyle = '#1f6324';
    for (const x of [2, 6, 10, 14]) ctx.fillRect(ox + x, oy, 1, 16);
    ctx.fillStyle = '#d9e8c8';
    for (const [x, y] of [[2, 3], [6, 8], [10, 4], [14, 11], [2, 12]]) {
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  fillNoiseTile(ctx, 34, [52, 134, 54], 12, 340);

  // 35: Tall Grass
  drawTilePixelPattern(
    ctx,
    35,
    [
      '................',
      '................',
      '...G........G...',
      '...G...g....G...',
      '..gG..gG...Gg...',
      '..GG..GG...GG...',
      '..GG..GG..gGG...',
      '.gGG.gGG..GGG...',
      '.GGG.GGG.gGGG...',
      '.GGG.GGG.GGGG...',
      '..GGGGGG.GGGG...',
      '..GGGGGGGGGGg...',
      '..gGGGGGGGGG....',
      '...GGGGGGGG.....',
      '...GGGGGGGG.....',
      '....GGGGGG......',
    ],
    { G: '#4d9a34', g: '#6fc24e' }
  );

  // 36: Poppy
  drawTilePixelPattern(
    ctx,
    36,
    [
      '................',
      '................',
      '......RRRR......',
      '.....RRRRRR.....',
      '.....RRDDRR.....',
      '.....RRRRRR.....',
      '......RRRR......',
      '.......GG.......',
      '.......GG.......',
      '......gGG.......',
      '.......GGg......',
      '.......GG.......',
      '.......GG.......',
      '.......GG.......',
      '.......GG.......',
      '................',
    ],
    { R: '#e11d48', D: '#27272a', G: '#3f7f29', g: '#5cae3f' }
  );

  // 37: Dandelion
  drawTilePixelPattern(
    ctx,
    37,
    [
      '................',
      '................',
      '......YYYY......',
      '.....YYYYYY.....',
      '.....YYOOYY.....',
      '.....YYYYYY.....',
      '......YYYY......',
      '.......GG.......',
      '.......GG.......',
      '.......GGg......',
      '......gGG.......',
      '.......GG.......',
      '.......GG.......',
      '.......GG.......',
      '.......GG.......',
      '................',
    ],
    { Y: '#facc15', O: '#ca8a04', G: '#3f7f29', g: '#5cae3f' }
  );

  // 38: Stick
  drawTilePixelPattern(
    ctx,
    38,
    [
      '................',
      '.............WW.',
      '............WW..',
      '...........WW...',
      '..........WW....',
      '.........WW.....',
      '........WW......',
      '.......WW.......',
      '......WW........',
      '.....WW.........',
      '....WW..........',
      '...WW...........',
      '..WW............',
      '.WW.............',
      '................',
      '................',
    ],
    { W: '#9c6b3b' }
  );

  // 39: Coal
  drawTilePixelPattern(
    ctx,
    39,
    [
      '................',
      '................',
      '......CCCC......',
      '....CCcCCcCC....',
      '...CCCcCCCCCC...',
      '...CcCCCCCCCC...',
      '...CCCCCCCCcC...',
      '...CCCCcCCCCC...',
      '....CCCCCCCC....',
      '.....CCCCCC.....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { C: '#27272a', c: '#52525b' }
  );

  // 40: Iron Ingot, 41: Gold Ingot, 42: Diamond
  drawTilePixelPattern(
    ctx,
    40,
    [
      '................',
      '................',
      '................',
      '.....IIIIII.....',
      '....IIiiiiII....',
      '...IIiiiiiiII...',
      '...IIiiiiiiII...',
      '....IIIIIIII....',
      '.....IIIIII.....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { I: '#9ca3af', i: '#f3f4f6' }
  );
  drawTilePixelPattern(
    ctx,
    41,
    [
      '................',
      '................',
      '................',
      '.....GGGGGG.....',
      '....GGggggGG....',
      '...GGggggggGG...',
      '...GGggggggGG...',
      '....GGGGGGGG....',
      '.....GGGGGG.....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { G: '#d97706', g: '#fde047' }
  );
  drawTilePixelPattern(
    ctx,
    42,
    [
      '................',
      '................',
      '......DDDD......',
      '....DDddddDD....',
      '...DDddwwddDD...',
      '...DDddddddDD...',
      '....DDddddDD....',
      '.....DDddDD.....',
      '......DDDD......',
      '.......DD.......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { D: '#0891b2', d: '#22d3ee', w: '#ecfeff' }
  );

  // 43..46: Pickaxes (Wood, Stone, Iron, Diamond)
  const pickPalettes: [number, string, string][] = [
    [43, '#a47542', '#7c5328'],
    [44, '#9ca3af', '#6b7280'],
    [45, '#e5e7eb', '#9ca3af'],
    [46, '#22d3ee', '#0891b2'],
  ];
  for (const [idx, h1, h2] of pickPalettes) {
    drawTilePixelPattern(
      ctx,
      idx,
      [
        '................',
        '.......HHHHH....',
        '.....HHhhhhHH...',
        '....HH......HH..',
        '...........WWH..',
        '..........WW.H..',
        '.........WW..H..',
        '........WW......',
        '.......WW.......',
        '......WW........',
        '.....WW.........',
        '....WW..........',
        '...WW...........',
        '..WW............',
        '................',
        '................',
      ],
      { H: h2, h: h1, W: '#8b5e34' }
    );
  }

  // 47..48: Axes
  for (const [idx, h1, h2] of [
    [47, '#a47542', '#7c5328'],
    [48, '#9ca3af', '#6b7280'],
  ] as [number, string, string][]) {
    drawTilePixelPattern(
      ctx,
      idx,
      [
        '................',
        '.......HHHH.....',
        '......HHhhHH....',
        '......HHhhHH....',
        '.......HWW......',
        '........WW......',
        '.......WW.......',
        '......WW........',
        '.....WW.........',
        '....WW..........',
        '...WW...........',
        '..WW............',
        '.WW.............',
        '................',
        '................',
        '................',
      ],
      { H: h2, h: h1, W: '#8b5e34' }
    );
  }

  // 49: Wood Shovel
  drawTilePixelPattern(
    ctx,
    49,
    [
      '................',
      '...........HHH..',
      '..........HHhH..',
      '..........HHHH..',
      '.........WW.....',
      '........WW......',
      '.......WW.......',
      '......WW........',
      '.....WW.........',
      '....WW..........',
      '...WW...........',
      '..WW............',
      '.WW.............',
      '................',
      '................',
      '................',
    ],
    { H: '#7c5328', h: '#a47542', W: '#8b5e34' }
  );

  // 50: Apple
  drawTilePixelPattern(
    ctx,
    50,
    [
      '................',
      '........GG......',
      '.......W........',
      '.....RRRRRR.....',
      '....RRwRRRRR....',
      '...RRwRRRRRRR...',
      '...RRRRRRRRRR...',
      '...RRRRRRRRRR...',
      '....RRRRRRRR....',
      '.....RRRRRR.....',
      '......RRRR......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { R: '#dc2626', w: '#fca5a5', W: '#78350f', G: '#22c55e' }
  );

  // 51: Sandstone Top & 52: Sandstone Side
  fillNoiseTile(ctx, 51, [218, 202, 148], 10, 510);
  fillNoiseTile(ctx, 52, [214, 196, 140], 10, 520);
  {
    const [ox, oy] = tileOrigin(52);
    ctx.fillStyle = '#c4ae72';
    ctx.fillRect(ox, oy + 3, 16, 1);
    ctx.fillRect(ox, oy + 9, 16, 1);
    ctx.fillRect(ox, oy + 14, 16, 1);
  }

  // 53: White Wool
  fillNoiseTile(ctx, 53, [238, 240, 244], 12, 530);

  // 54: Oak Door Closed & 55: Oak Door Open
  for (const [idx, open] of [[54, false], [55, true]] as [number, boolean][]) {
    const [ox, oy] = tileOrigin(idx);
    if (open) {
      ctx.fillStyle = 'rgba(148, 110, 66, 0.35)';
      ctx.fillRect(ox, oy, 16, 16);
      ctx.fillStyle = '#73502b';
      ctx.fillRect(ox, oy, 3, 16);
      ctx.fillRect(ox + 13, oy, 3, 16);
      ctx.fillRect(ox, oy, 16, 2);
      ctx.fillRect(ox, oy + 14, 16, 2);
    } else {
      ctx.fillStyle = '#9e7442';
      ctx.fillRect(ox, oy, 16, 16);
      ctx.fillStyle = '#5c3f20';
      ctx.fillRect(ox, oy, 16, 1);
      ctx.fillRect(ox, oy + 15, 16, 1);
      ctx.fillRect(ox, oy, 1, 16);
      ctx.fillRect(ox + 15, oy, 1, 16);
      // Window cutouts
      ctx.clearRect(ox + 3, oy + 2, 4, 4);
      ctx.clearRect(ox + 9, oy + 2, 4, 4);
      // Handle
      ctx.fillStyle = '#27272a';
      ctx.fillRect(ox + 12, oy + 8, 2, 2);
    }
  }

  // 56: Bed Top & 57: Bed Side
  {
    const [ox, oy] = tileOrigin(56);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(ox + 1, oy + 1, 14, 5);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(ox, oy + 6, 16, 2);
  }
  {
    const [ox, oy] = tileOrigin(57);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(ox, oy + 4, 16, 6);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(ox, oy + 4, 5, 4);
    ctx.fillStyle = '#8b5e34';
    ctx.fillRect(ox, oy + 10, 16, 3);
    ctx.fillRect(ox + 1, oy + 13, 3, 3);
    ctx.fillRect(ox + 12, oy + 13, 3, 3);
  }

  // 58..60: Swords (Wood, Iron, Diamond)
  for (const [idx, b1, b2] of [
    [58, '#a47542', '#7c5328'],
    [59, '#f3f4f6', '#9ca3af'],
    [60, '#67e8f9', '#0891b2'],
  ] as [number, string, string][]) {
    drawTilePixelPattern(
      ctx,
      idx,
      [
        '................',
        '.............BB.',
        '............BbB.',
        '...........BbB..',
        '..........BbB...',
        '.........BbB....',
        '........BbB.....',
        '...GG..BbB......',
        '....GGBbB.......',
        '.....GGG........',
        '....WWGG........',
        '...WW..G........',
        '..WW............',
        '.WW.............',
        '................',
        '................',
      ],
      { B: b2, b: b1, G: '#785028', W: '#5c3c1e' }
    );
  }

  // 61: Cooked Beef
  drawTilePixelPattern(
    ctx,
    61,
    [
      '................',
      '................',
      '................',
      '....MMMMMM......',
      '...MMmmMMMMM....',
      '..MMmMMMMMMMM...',
      '..MMMmMMMMMMmM..',
      '...MMMMMMMMMMM..',
      '....MMMMMMMMM...',
      '.....MMMMMMM....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { M: '#7c2d12', m: '#b45309' }
  );

  // 62: Spruce Log Side & 63: Spruce Log Top
  fillNoiseTile(ctx, 62, [58, 38, 22], 8, 620);
  {
    const [ox, oy] = tileOrigin(62);
    for (let x = 0; x < 16; x += 3) {
      ctx.fillStyle = 'rgba(32,20,10,0.45)';
      ctx.fillRect(ox + x, oy, 1, 16);
    }
  }
  fillNoiseTile(ctx, 63, [120, 88, 52], 8, 630);
  {
    const [ox, oy] = tileOrigin(63);
    ctx.strokeStyle = '#3b2412';
    ctx.strokeRect(ox + 0.5, oy + 0.5, 15, 15);
  }

  // 64: Spruce Planks
  fillNoiseTile(ctx, 64, [118, 82, 48], 8, 640);
  {
    const [ox, oy] = tileOrigin(64);
    ctx.fillStyle = '#4f351e';
    for (const y of [0, 4, 8, 12]) ctx.fillRect(ox, oy + y, 16, 1);
  }

  // 65: Birch Log Side & 66: Birch Log Top
  fillNoiseTile(ctx, 65, [226, 224, 218], 8, 650);
  {
    const [ox, oy] = tileOrigin(65);
    ctx.fillStyle = '#2d2d30';
    for (const [x, y, w] of [[2, 3, 4], [10, 2, 3], [5, 7, 5], [1, 11, 4], [9, 13, 5], [12, 8, 3]]) {
      ctx.fillRect(ox + x, oy + y, w, 2);
    }
  }
  fillNoiseTile(ctx, 66, [196, 174, 128], 8, 660);

  // 67: Birch Planks & 68: Dark Oak Planks
  fillNoiseTile(ctx, 67, [206, 190, 134], 8, 670);
  fillNoiseTile(ctx, 68, [68, 44, 24], 8, 680);
  for (const idx of [67, 68]) {
    const [ox, oy] = tileOrigin(idx);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const y of [0, 4, 8, 12]) ctx.fillRect(ox, oy + y, 16, 1);
  }

  // 69: Stone Bricks, 70: Mossy Stone Bricks, 71: Cracked Stone Bricks
  for (const idx of [69, 70, 71]) {
    fillNoiseTile(ctx, idx, [124, 126, 130], 10, 690 + idx);
    const [ox, oy] = tileOrigin(idx);
    ctx.fillStyle = '#52525b';
    for (const y of [0, 7, 15]) ctx.fillRect(ox, oy + y, 16, 1);
    ctx.fillRect(ox + 7, oy, 1, 7);
    ctx.fillRect(ox + 15, oy + 7, 1, 8);
    ctx.fillRect(ox + 3, oy + 7, 1, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(ox + 1, oy + 1, 5, 1);
    ctx.fillRect(ox + 9, oy + 1, 6, 1);
    ctx.fillRect(ox + 4, oy + 8, 10, 1);
    if (idx === 70) {
      ctx.fillStyle = '#4d7c2b';
      for (const [mx, my, mw] of [[1, 5, 4], [10, 2, 3], [5, 11, 5], [12, 13, 3]]) {
        ctx.fillRect(ox + mx, oy + my, mw, 2);
      }
    } else if (idx === 71) {
      ctx.fillStyle = '#27272a';
      ctx.fillRect(ox + 3, oy + 2, 2, 1);
      ctx.fillRect(ox + 4, oy + 3, 2, 2);
      ctx.fillRect(ox + 10, oy + 9, 3, 1);
      ctx.fillRect(ox + 11, oy + 10, 2, 2);
    }
  }

  // 72: Granite, 73: Diorite, 74: Andesite, 75: Deepslate
  fillNoiseTile(ctx, 72, [154, 108, 92], 18, 720);
  fillNoiseTile(ctx, 73, [208, 208, 210], 22, 730);
  fillNoiseTile(ctx, 74, [132, 136, 138], 16, 740);
  fillNoiseTile(ctx, 75, [66, 68, 76], 14, 750);

  // 76: Quartz Block, 77: Pillar Quartz
  fillNoiseTile(ctx, 76, [238, 234, 226], 5, 760);
  fillNoiseTile(ctx, 77, [236, 232, 224], 5, 770);
  {
    const [ox, oy] = tileOrigin(77);
    ctx.fillStyle = '#cfc9be';
    for (const x of [2, 6, 10, 14]) ctx.fillRect(ox + x, oy, 1, 16);
  }

  // 78: Netherrack, 79: Nether Bricks, 80: Soul Sand, 81: End Stone, 82: Purpur
  fillNoiseTile(ctx, 78, [106, 42, 42], 18, 780);
  fillNoiseTile(ctx, 79, [50, 24, 30], 8, 790);
  {
    const [ox, oy] = tileOrigin(79);
    ctx.fillStyle = '#1f0f14';
    for (const y of [3, 7, 11, 15]) ctx.fillRect(ox, oy + y, 16, 1);
    for (const [x, y] of [[7, 0], [3, 4], [11, 4], [7, 8], [3, 12], [11, 12]]) ctx.fillRect(ox + x, oy + y, 1, 3);
  }
  fillNoiseTile(ctx, 80, [84, 64, 52], 16, 800);
  fillNoiseTile(ctx, 81, [222, 224, 164], 16, 810);
  fillNoiseTile(ctx, 82, [168, 122, 170], 10, 820);
  {
    const [ox, oy] = tileOrigin(82);
    ctx.fillStyle = '#7e4e82';
    ctx.fillRect(ox, oy + 7, 16, 1);
    ctx.fillRect(ox + 7, oy, 1, 16);
  }

  // 83: Prismarine, 84: Sea Lantern
  fillNoiseTile(ctx, 83, [86, 158, 142], 22, 830);
  fillNoiseTile(ctx, 84, [186, 236, 232], 14, 840);
  {
    const [ox, oy] = tileOrigin(84);
    ctx.fillStyle = '#76c4be';
    ctx.strokeStyle = '#76c4be';
    ctx.strokeRect(ox + 0.5, oy + 0.5, 15, 15);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 4, oy + 4, 8, 8);
  }

  // 85: Magma Block, 86: Lava
  fillNoiseTile(ctx, 85, [62, 28, 24], 14, 850);
  {
    const [ox, oy] = tileOrigin(85);
    ctx.fillStyle = '#f97316';
    for (const [x, y, w] of [[2, 3, 5], [9, 6, 4], [4, 11, 6], [10, 13, 4]]) ctx.fillRect(ox + x, oy + y, w, 2);
  }
  fillNoiseTile(ctx, 86, [234, 88, 12], 22, 860);
  {
    const [ox, oy] = tileOrigin(86);
    ctx.fillStyle = '#fde047';
    for (const [x, y, w] of [[1, 2, 4], [8, 5, 5], [3, 9, 6], [10, 13, 4]]) ctx.fillRect(ox + x, oy + y, w, 2);
  }

  // 87..93: Mineral Blocks (Coal, Iron, Gold, Diamond, Emerald, Lapis, Redstone)
  const mineralBlocks: [number, [number, number, number], string, string][] = [
    [87, [26, 26, 30], '#3f3f46', '#111113'],
    [88, [224, 224, 228], '#ffffff', '#a1a1aa'],
    [89, [248, 212, 54], '#fef9c3', '#ca8a04'],
    [90, [94, 234, 228], '#ecfeff', '#0891b2'],
    [91, [48, 206, 98], '#bbf7d0', '#15803d'],
    [92, [34, 72, 168], '#60a5fa', '#1e3a8a'],
    [93, [196, 34, 28], '#fca5a5', '#7f1d1d'],
  ];
  for (const [idx, rgb, hi, lo] of mineralBlocks) {
    fillNoiseTile(ctx, idx, rgb, 8, 870 + idx);
    const [ox, oy] = tileOrigin(idx);
    ctx.fillStyle = hi;
    ctx.fillRect(ox + 1, oy + 1, 14, 1);
    ctx.fillRect(ox + 1, oy + 1, 1, 14);
    ctx.fillStyle = lo;
    ctx.fillRect(ox + 1, oy + 14, 14, 1);
    ctx.fillRect(ox + 14, oy + 1, 1, 14);
  }

  // 94..96: Emerald, Lapis, Redstone Ores
  for (const [tileIdx, oreColor] of [
    [94, [34, 212, 94]],
    [95, [37, 99, 235]],
    [96, [239, 36, 36]],
  ] as [number, [number, number, number]][]) {
    const [sx, sy] = tileOrigin(3);
    const [ox, oy] = tileOrigin(tileIdx);
    ctx.drawImage(canvas, sx, sy, 16, 16, ox, oy, 16, 16);
    for (const [x, y] of [
      [3, 4], [4, 4], [10, 3], [11, 3], [6, 9], [7, 9], [11, 12], [3, 12],
    ]) {
      pxColor(ctx, ox, oy, x, y, oreColor[0], oreColor[1], oreColor[2]);
    }
  }

  // 97: Pumpkin Side, 98: Pumpkin Top, 99: Jack o'Lantern Front
  fillNoiseTile(ctx, 97, [216, 118, 24], 10, 970);
  {
    const [ox, oy] = tileOrigin(97);
    ctx.fillStyle = '#9a4f0a';
    for (const x of [3, 7, 11, 15]) ctx.fillRect(ox + x, oy, 1, 16);
  }
  fillNoiseTile(ctx, 98, [212, 114, 22], 10, 980);
  {
    const [ox, oy] = tileOrigin(98);
    ctx.fillStyle = '#4d7c2b';
    ctx.fillRect(ox + 6, oy + 6, 4, 4);
  }
  {
    const [px, py] = tileOrigin(97);
    const [ox, oy] = tileOrigin(99);
    ctx.drawImage(canvas, px, py, 16, 16, ox, oy, 16, 16);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(ox + 3, oy + 4, 3, 3);
    ctx.fillRect(ox + 10, oy + 4, 3, 3);
    ctx.fillRect(ox + 4, oy + 10, 8, 3);
  }

  // 100: Melon Side, 101: Melon Top, 102: Hay Bale Side, 103: Hay Bale Top
  fillNoiseTile(ctx, 100, [118, 174, 44], 10, 1000);
  {
    const [ox, oy] = tileOrigin(100);
    ctx.fillStyle = '#3f6e18';
    for (const x of [2, 6, 10, 14]) ctx.fillRect(ox + x, oy, 2, 16);
  }
  fillNoiseTile(ctx, 101, [110, 166, 40], 10, 1010);
  fillNoiseTile(ctx, 102, [202, 168, 62], 14, 1020);
  {
    const [ox, oy] = tileOrigin(102);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(ox, oy + 4, 16, 2);
    ctx.fillRect(ox, oy + 11, 16, 2);
  }
  fillNoiseTile(ctx, 103, [192, 158, 54], 16, 1030);

  // 104..108: Clay, Terracotta, Red Terracotta, Packed Ice, Moss
  fillNoiseTile(ctx, 104, [160, 166, 178], 10, 1040);
  fillNoiseTile(ctx, 105, [154, 94, 68], 8, 1050);
  fillNoiseTile(ctx, 106, [142, 62, 48], 8, 1060);
  fillNoiseTile(ctx, 107, [142, 188, 246], 12, 1070);
  fillNoiseTile(ctx, 108, [94, 134, 48], 16, 1080);

  // 109..113: Colored Wool (Red, Blue, Yellow, Green, Black)
  fillNoiseTile(ctx, 109, [176, 46, 40], 12, 1090);
  fillNoiseTile(ctx, 110, [52, 76, 170], 12, 1100);
  fillNoiseTile(ctx, 111, [238, 198, 46], 12, 1110);
  fillNoiseTile(ctx, 112, [74, 128, 38], 12, 1120);
  fillNoiseTile(ctx, 113, [28, 28, 34], 10, 1130);

  // 114..116: Concrete (White, Gray, Cyan)
  fillNoiseTile(ctx, 114, [232, 236, 240], 4, 1140);
  fillNoiseTile(ctx, 115, [62, 66, 72], 4, 1150);
  fillNoiseTile(ctx, 116, [24, 132, 148], 5, 1160);

  // 117: Anvil
  fillNoiseTile(ctx, 117, [72, 74, 80], 8, 1170);
  {
    const [ox, oy] = tileOrigin(117);
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(ox + 3, oy + 5, 10, 6);
  }

  // 118: Enchanting Table Top & 119: Side
  fillNoiseTile(ctx, 118, [126, 32, 42], 8, 1180);
  {
    const [ox, oy] = tileOrigin(118);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(ox + 4, oy + 4, 8, 8);
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(ox + 6, oy + 6, 4, 4);
  }
  fillNoiseTile(ctx, 119, [32, 24, 48], 10, 1190);
  {
    const [ox, oy] = tileOrigin(119);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(ox, oy, 16, 4);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(ox + 2, oy + 1, 2, 2);
    ctx.fillRect(ox + 12, oy + 1, 2, 2);
  }

  // 120: Jukebox Top & 121: Side
  fillNoiseTile(ctx, 120, [118, 74, 44], 8, 1200);
  {
    const [ox, oy] = tileOrigin(120);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(ox + 4, oy + 7, 8, 2);
  }
  fillNoiseTile(ctx, 121, [110, 66, 38], 8, 1210);

  // 122: Lantern (cutout)
  drawTilePixelPattern(
    ctx,
    122,
    [
      '.......II.......',
      '......I..I......',
      '.......II.......',
      '.....IIIIII.....',
      '.....IYYYYI.....',
      '.....IYOOYI.....',
      '.....IYOOYI.....',
      '.....IYYYYI.....',
      '.....IIIIII.....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { I: '#27272a', Y: '#fef08a', O: '#f59e0b' }
  );

  // 123: Ladder
  drawTilePixelPattern(
    ctx,
    123,
    [
      '..WW........WW..',
      '..WW........WW..',
      '..WWWWWWWWWWWW..',
      '..WW........WW..',
      '..WW........WW..',
      '..WWWWWWWWWWWW..',
      '..WW........WW..',
      '..WW........WW..',
      '..WWWWWWWWWWWW..',
      '..WW........WW..',
      '..WW........WW..',
      '..WWWWWWWWWWWW..',
      '..WW........WW..',
      '..WW........WW..',
      '..WWWWWWWWWWWW..',
      '..WW........WW..',
    ],
    { W: '#9c6b3b' }
  );

  // 124: Iron Bars
  drawTilePixelPattern(
    ctx,
    124,
    [
      '..II...II...II..',
      '..II...II...II..',
      '..IIIIIIIIIIII..',
      '..II...II...II..',
      '..II...II...II..',
      '..II...II...II..',
      '..II...II...II..',
      '..IIIIIIIIIIII..',
      '..II...II...II..',
      '..II...II...II..',
      '..II...II...II..',
      '..II...II...II..',
      '..IIIIIIIIIIII..',
      '..II...II...II..',
      '..II...II...II..',
      '..II...II...II..',
    ],
    { I: '#9ca3af' }
  );

  // 125: Oak Fence
  drawTilePixelPattern(
    ctx,
    125,
    [
      '................',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '..WWWWWWWWWWWW..',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '..WWWWWWWWWWWW..',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '..WWW......WWW..',
      '................',
    ],
    { W: '#a87a46' }
  );

  // 126: Rail & 127: Powered Rail
  drawTilePixelPattern(
    ctx,
    126,
    [
      '..II........II..',
      '.WWWWWWWWWWWWWW.',
      '..II........II..',
      '..II........II..',
      '.WWWWWWWWWWWWWW.',
      '..II........II..',
      '..II........II..',
      '.WWWWWWWWWWWWWW.',
      '..II........II..',
      '..II........II..',
      '.WWWWWWWWWWWWWW.',
      '..II........II..',
      '..II........II..',
      '.WWWWWWWWWWWWWW.',
      '..II........II..',
      '..II........II..',
    ],
    { I: '#cbd5e1', W: '#7c5328' }
  );
  drawTilePixelPattern(
    ctx,
    127,
    [
      '..GG........GG..',
      '.WWWWWWrrWWWWWW.',
      '..GG........GG..',
      '..GG........GG..',
      '.WWWWWWrrWWWWWW.',
      '..GG........GG..',
      '..GG........GG..',
      '.WWWWWWrrWWWWWW.',
      '..GG........GG..',
      '..GG........GG..',
      '.WWWWWWrrWWWWWW.',
      '..GG........GG..',
      '..GG........GG..',
      '.WWWWWWrrWWWWWW.',
      '..GG........GG..',
      '..GG........GG..',
    ],
    { G: '#facc15', W: '#7c5328', r: '#ef4444' }
  );

  // 128: Minecart Item, 129: Train Engine Item
  drawTilePixelPattern(
    ctx,
    128,
    [
      '................',
      '................',
      '................',
      '................',
      '..IIIIIIIIIIII..',
      '..IiiiiiiiiiiI..',
      '..IIIIIIIIIIII..',
      '...IIIIIIIIII...',
      '....IIIIIIII....',
      '....OO....OO....',
      '....OO....OO....',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { I: '#52525b', i: '#9ca3af', O: '#18181b' }
  );
  drawTilePixelPattern(
    ctx,
    129,
    [
      '................',
      '....SS..........',
      '....SS..........',
      '....DD....RRRR..',
      '..DDDDDD..RRRR..',
      '..DDDDDDDDYYYY..',
      '.DDDDDDDDDRRRR..',
      '.RRRRRRRRRRRRR..',
      '..OO..OO..OO....',
      '..OO..OO..OO....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { D: '#334155', R: '#dc2626', Y: '#fde047', O: '#0f172a', S: '#cbd5e1' }
  );

  // 130: Emerald, 131: Redstone Dust, 132: Golden Apple
  drawTilePixelPattern(
    ctx,
    130,
    [
      '................',
      '................',
      '......EEEE......',
      '....EEeeeeEE....',
      '...EEeewwweEE...',
      '...EEeeeeeeEE...',
      '...EEeeeeeeEE...',
      '....EEeeeeEE....',
      '.....EEeeEE.....',
      '......EEEE......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { E: '#16a34a', e: '#4ade80', w: '#dcfce7' }
  );
  drawTilePixelPattern(
    ctx,
    131,
    [
      '................',
      '................',
      '......RRRR......',
      '....RRrRRrRR....',
      '...RRrRRRRrRR...',
      '...RRRRrRRRRR...',
      '....RRrRRrRR....',
      '.....RRRRRR.....',
      '......RRRR......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { R: '#dc2626', r: '#fca5a5' }
  );
  drawTilePixelPattern(
    ctx,
    132,
    [
      '................',
      '........GG......',
      '.......W........',
      '.....YYYYYY.....',
      '....YYwYYYYY....',
      '...YYwYYYYYYY...',
      '...YYYYYYYYYY...',
      '...YYYYYYYYYY...',
      '....YYYYYYYY....',
      '.....YYYYYY.....',
      '......YYYY......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { Y: '#eab308', w: '#fef9c3', W: '#78350f', G: '#22c55e' }
  );

  // 133: Water Bucket, 134: Lava Bucket
  for (const [idx, liquid] of [
    [133, '#2563eb'],
    [134, '#f97316'],
  ] as [number, string][]) {
    drawTilePixelPattern(
      ctx,
      idx,
      [
        '................',
        '................',
        '....IIIIIIII....',
        '...I........I...',
        '...ILLLLLLLLI...',
        '...ILLLLLLLLI...',
        '....IIIIIIII....',
        '....IIIIIIII....',
        '.....IIIIII.....',
        '.....IIIIII.....',
        '......IIII......',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { I: '#94a3b8', L: liquid }
    );
  }

  return canvas;
}

let cachedAtlasCanvas: HTMLCanvasElement | null = null;
let cachedAtlasTexture: THREE.CanvasTexture | null = null;
const iconCache = new Map<number, string>();

export function getAtlasCanvas(): HTMLCanvasElement {
  if (!cachedAtlasCanvas) {
    cachedAtlasCanvas = buildTextureAtlasCanvas();
  }
  return cachedAtlasCanvas;
}

export function getAtlasTexture(maxAnisotropy = 1): THREE.CanvasTexture {
  if (!cachedAtlasTexture) {
    const tex = new THREE.CanvasTexture(getAtlasCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.anisotropy = Math.min(4, maxAnisotropy);
    tex.needsUpdate = true;
    cachedAtlasTexture = tex;
  }
  return cachedAtlasTexture;
}

export function createCrackTextures(): THREE.CanvasTexture[] {
  const textures: THREE.CanvasTexture[] = [];
  for (let stage = 0; stage < 8; stage++) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const steps = (stage + 1) * 5;
    let cx = 8;
    let cy = 8;
    for (let i = 0; i < steps; i++) {
      ctx.fillRect(cx, cy, 1, 1);
      const dir = Math.floor(prng(i, stage, 999) * 4);
      if (dir === 0) cx = (cx + 1) % 16;
      else if (dir === 1) cx = (cx + 15) % 16;
      else if (dir === 2) cy = (cy + 1) % 16;
      else cy = (cy + 15) % 16;
      if (i % 6 === 0) {
        cx = Math.floor(prng(i, stage, 777) * 16);
        cy = Math.floor(prng(stage, i, 555) * 16);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    textures.push(tex);
  }
  return textures;
}

export function getBlockIconUrl(id: BlockId): string {
  if (iconCache.has(id)) return iconCache.get(id)!;
  const atlas = getAtlasCanvas();
  const def = getBlockDef(id);

  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  if (def.isItemOnly || def.isPlant || def.isRail) {
    const [tx, ty] = tileOrigin(def.tiles.side);
    ctx.drawImage(atlas, tx, ty, 16, 16, 6, 6, 36, 36);
  } else {
    // Draw clean isometric 3D cube preview using top, front/side, and side tiles!
    const topTile = tileOrigin(def.tiles.top);
    const leftTile = tileOrigin(def.tiles.front ?? def.tiles.side);
    const rightTile = tileOrigin(def.tiles.side);

    // Top diamond
    ctx.save();
    ctx.translate(24, 6);
    ctx.transform(0.9, 0.45, -0.9, 0.45, 0, 0);
    ctx.drawImage(atlas, topTile[0], topTile[1], 16, 16, 0, 0, 16, 16);
    ctx.restore();

    // Left face
    ctx.save();
    ctx.translate(9.6, 13.2);
    ctx.transform(0.9, 0.45, 0, 1.15, 0, 0);
    ctx.drawImage(atlas, leftTile[0], leftTile[1], 16, 16, 0, 0, 16, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, 0, 16, 16);
    ctx.restore();

    // Right face
    ctx.save();
    ctx.translate(24, 20.4);
    ctx.transform(0.9, -0.45, 0, 1.15, 0, 0);
    ctx.drawImage(atlas, rightTile[0], rightTile[1], 16, 16, 0, 0, 16, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, 0, 16, 16);
    ctx.restore();
  }

  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}
