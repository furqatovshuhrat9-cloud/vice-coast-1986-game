import { getAtlasCanvas } from './textures';
import { WorldSaveData } from './world';

/**
 * Builds a 100% self-contained single-file HTML5 WebGL voxel game
 * with the full procedural 16x16 pixel-art texture atlas, trees,
 * mobile touch joystick + break/place controls, and embedded world data.
 */
export function generateOfflineGameHtml(save: WorldSaveData): string {
  const atlasDataUrl = getAtlasCanvas().toDataURL('image/png');
  const safeJson = JSON.stringify({
    seed: save.seed,
    seedText: save.seedText,
    playerPos: save.playerPos,
    edits: save.edits,
  }).replace(/<\/script>/gi, '<\\/script>');

  return `<!doctype html>
<html lang="uz">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<title>CraftWorld Offline (${save.seedText})</title>
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#78a7ff;font-family:system-ui,sans-serif;user-select:none;touch-action:none}
  canvas{display:block;width:100%;height:100%}
  #crosshair{position:fixed;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);pointer-events:none;mix-blend-mode:difference}
  #crosshair::before,#crosshair::after{content:"";position:absolute;background:#fff}
  #crosshair::before{left:8px;top:0;width:2px;height:18px}
  #crosshair::after{left:0;top:8px;width:18px;height:2px}
  #hud{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:3px;background:rgba(18,22,18,.86);padding:4px;border:2px solid rgba(255,255,255,.22)}
  .slot{width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.15);cursor:pointer;box-sizing:border-box}
  .slot.active{border-color:#fff;background:rgba(255,255,255,.2)}
  .tileIcon{width:26px;height:26px;image-rendering:pixelated}
  #info{position:fixed;top:10px;left:10px;background:rgba(18,22,18,.78);color:#fff;padding:6px 10px;font-size:11px;border:1px solid rgba(255,255,255,.16)}
  #overlay{position:fixed;inset:0;background:rgba(14,18,14,.74);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center;z-index:10;padding:20px}
  .btn{background:#3d7a37;color:#fff;border:2px solid #6cc25f;padding:12px 24px;font-size:15px;font-weight:700;cursor:pointer;margin-top:14px}
  #touchUI{position:fixed;inset:0;pointer-events:none;display:none}
  #joy{position:fixed;bottom:72px;left:16px;width:104px;height:104px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(0,0,0,.4);pointer-events:auto}
  #knob{position:absolute;left:32px;top:32px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.45);border:2px solid #fff}
  #touchBtns{position:fixed;bottom:72px;right:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:auto}
  .tbtn{background:rgba(30,36,30,.85);color:#fff;border:2px solid rgba(255,255,255,.3);padding:10px 14px;font-size:12px;font-weight:700}
</style>
</head>
<body>
<canvas id="gl"></canvas>
<div id="crosshair"></div>
<div id="info">CraftWorld Oflayn · Seed: ${save.seedText}</div>
<div id="hud"></div>
<div id="touchUI">
  <div id="joy"><div id="knob"></div></div>
  <div id="touchBtns">
    <div style="display:flex;gap:8px">
      <button class="tbtn" id="tBreak">Buzish</button>
      <button class="tbtn" id="tPlace">Qo'yish</button>
    </div>
    <button class="tbtn" id="tJump" style="background:#3d7a37;width:110px">Sakrash</button>
  </div>
</div>
<div id="overlay">
  <h1 style="margin:0 0 8px;font-size:30px;letter-spacing:1px">CRAFTWORLD OFFLINE</h1>
  <p style="margin:0;opacity:.85;max-width:420px;font-size:13px">PC va Telefon uchun to'liq teksturaga ega oflayn versiya.</p>
  <button class="btn" id="playBtn">O'yinni Boshlash</button>
</div>
<script>
const SAVE_DATA = ${safeJson};
const ATLAS_SRC = "${atlasDataUrl}";
(function(){
  const canvas = document.getElementById('gl');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if(!gl){ alert('WebGL kerak'); return; }

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if(isTouch) document.getElementById('touchUI').style.display = 'block';

  const BLOCKS = [
    {id:1,top:0,side:1,bot:2},
    {id:2,top:2,side:2,bot:2},
    {id:3,top:3,side:3,bot:3},
    {id:4,top:4,side:4,bot:4},
    {id:5,top:6,side:5,bot:6},
    {id:6,top:7,side:7,bot:7},
    {id:8,top:9,side:9,bot:9},
    {id:20,top:24,side:24,bot:24},
    {id:25,top:31,side:31,bot:31},
  ];
  const TILE_FOR = {};
  BLOCKS.forEach(b=>TILE_FOR[b.id]=b);
  TILE_FOR[7] = {top:8,side:8,bot:8};
  let selectedSlot = 0;

  const atlasImg = new Image();
  const tex = gl.createTexture();
  atlasImg.onload = ()=>{
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasImg);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    renderHud();
  };
  atlasImg.src = ATLAS_SRC;

  const hud = document.getElementById('hud');
  function renderHud(){
    hud.innerHTML = '';
    BLOCKS.forEach((b,i)=>{
      const el = document.createElement('div');
      el.className = 'slot' + (i===selectedSlot?' active':'');
      const ic = document.createElement('canvas');
      ic.width = 16; ic.height = 16; ic.className = 'tileIcon';
      const ctx = ic.getContext('2d');
      const sx = (b.side % 16) * 16, sy = Math.floor(b.side / 16) * 16;
      if(atlasImg.complete) ctx.drawImage(atlasImg, sx, sy, 16, 16, 0, 0, 16, 16);
      el.appendChild(ic);
      el.onclick = (ev)=>{ ev.stopPropagation(); selectedSlot=i; renderHud(); };
      hud.appendChild(el);
    });
  }
  renderHud();

  const SIZE_X = 64, SIZE_Y = 48, SIZE_Z = 64;
  const OX = -32, OZ = -32;
  const world = new Uint8Array(SIZE_X * SIZE_Y * SIZE_Z);
  function idx(x,y,z){ return (y*SIZE_Z+z)*SIZE_X+x; }
  function hash(x,z){
    let n = Math.sin(x*12.9898 + z*78.233 + SAVE_DATA.seed*0.01)*43758.5453;
    return n - Math.floor(n);
  }
  function getBlock(wx,y,wz){
    const x=wx-OX, z=wz-OZ;
    if(x<0||x>=SIZE_X||y<0||y>=SIZE_Y||z<0||z>=SIZE_Z) return 0;
    return world[idx(x,y,z)];
  }
  function setBlock(wx,y,wz,id){
    const x=wx-OX, z=wz-OZ;
    if(x<0||x>=SIZE_X||y<1||y>=SIZE_Y||z<0||z>=SIZE_Z) return;
    world[idx(x,y,z)] = id;
    meshDirty = true;
  }

  for(let x=0;x<SIZE_X;x++)for(let z=0;z<SIZE_Z;z++){
    const wx=x+OX, wz=z+OZ;
    const h = Math.floor(18 + Math.sin(wx*0.09)*3 + Math.cos(wz*0.09)*3 + hash(Math.floor(wx/4),Math.floor(wz/4))*2);
    for(let y=0;y<=h;y++) world[idx(x,y,z)] = y===0?3 : y===h?1 : y>=h-2?2 : 3;
    if(x>3&&x<SIZE_X-4&&z>3&&z<SIZE_Z-4&&hash(wx,wz)<0.018){
      for(let dy=1;dy<=4;dy++) world[idx(x,h+dy,z)]=5;
      for(let dy=3;dy<=5;dy++)for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
        if(Math.abs(dx)+Math.abs(dz)<4 && world[idx(x+dx,h+dy,z+dz)]===0) world[idx(x+dx,h+dy,z+dz)]=7;
      }
    }
  }
  if(Array.isArray(SAVE_DATA.edits)){
    for(const e of SAVE_DATA.edits){
      const x=e[0]-OX, y=e[1], z=e[2]-OZ;
      if(x>=0&&x<SIZE_X&&y>=0&&y<SIZE_Y&&z>=0&&z<SIZE_Z) world[idx(x,y,z)]=e[3];
    }
  }

  const vsSrc = \`attribute vec3 aPos; attribute vec2 aUv; attribute float aLight; uniform mat4 uMVP; varying vec2 vUv; varying float vLight; void main(){ vUv=aUv; vLight=aLight; gl_Position=uMVP*vec4(aPos,1.0); }\`;
  const fsSrc = \`precision mediump float; uniform sampler2D uTex; varying vec2 vUv; varying float vLight; void main(){ vec4 c=texture2D(uTex,vUv); if(c.a<0.4)discard; gl_FragColor=vec4(c.rgb*vLight,1.0); }\`;
  function compile(t,s){ const sh=gl.createShader(t); gl.shaderSource(sh,s); gl.compileShader(sh); return sh; }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog,'aPos');
  const aUv = gl.getAttribLocation(prog,'aUv');
  const aLight = gl.getAttribLocation(prog,'aLight');
  const uMVP = gl.getUniformLocation(prog,'uMVP');

  const vbo = gl.createBuffer();
  let vertCount = 0;
  let meshDirty = true;

  const FACES = [
    {d:[0,1,0],s:1.0,k:'top',q:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},
    {d:[0,-1,0],s:0.58,k:'bot',q:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
    {d:[1,0,0],s:0.78,k:'side',q:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]]},
    {d:[-1,0,0],s:0.78,k:'side',q:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]},
    {d:[0,0,1],s:0.88,k:'side',q:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},
    {d:[0,0,-1],s:0.88,k:'side',q:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]},
  ];
  const QUV = [[0,1],[1,1],[1,0],[0,0]];

  function rebuildMesh(){
    const arr = [];
    for(let y=0;y<SIZE_Y;y++)for(let z=0;z<SIZE_Z;z++)for(let x=0;x<SIZE_X;x++){
      const id = world[idx(x,y,z)];
      if(!id) continue;
      const wx=x+OX, wz=z+OZ;
      const spec = TILE_FOR[id] || {top:3,side:3,bot:3};
      for(const f of FACES){
        const nb = getBlock(wx+f.d[0],y+f.d[1],wz+f.d[2]);
        if(nb!==0 && nb!==7) continue;
        const tile = spec[f.k];
        const col = tile % 16, row = Math.floor(tile / 16), st = 1/16, eps = 0.0015;
        const u0 = col*st+eps, u1 = (col+1)*st-eps, v0 = row*st+eps, v1 = (row+1)*st-eps;
        for(const ti of [0,1,2,0,2,3]){
          const c = f.q[ti];
          const u = QUV[ti][0] ? u1 : u0;
          const v = QUV[ti][1] ? v1 : v0;
          arr.push(wx+c[0],y+c[1],wz+c[2],u,v,f.s);
        }
      }
    }
    const f32 = new Float32Array(arr);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, f32, gl.STATIC_DRAW);
    vertCount = f32.length / 6;
    meshDirty = false;
  }

  let px=0.5, py=26, pz=0.5, vy=0, yaw=0, pitch=-0.1, onGround=false;
  for(let y=SIZE_Y-1;y>=0;y--){ if(getBlock(0,y,0)!==0){ py=y+1.2; break; } }

  const keys = {};
  let joyVec = {x:0,y:0};
  window.addEventListener('keydown', e=>{
    keys[e.code]=true;
    if(e.code.startsWith('Digit')){
      const k=parseInt(e.code.slice(5),10)-1;
      if(k>=0&&k<BLOCKS.length){ selectedSlot=k; renderHud(); }
    }
  });
  window.addEventListener('keyup', e=>keys[e.code]=false);

  let started = false;
  const overlay = document.getElementById('overlay');
  document.getElementById('playBtn').onclick = ()=>{
    started = true;
    overlay.style.display = 'none';
    if(!isTouch && canvas.requestPointerLock) canvas.requestPointerLock();
  };
  document.addEventListener('pointerlockchange', ()=>{
    if(!isTouch) overlay.style.display = document.pointerLockElement===canvas ? 'none' : 'flex';
  });
  document.addEventListener('mousemove', e=>{
    if(document.pointerLockElement!==canvas) return;
    yaw -= e.movementX*0.0022;
    pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY*0.0022));
  });

  function rayAction(mode){
    const cp=Math.cos(pitch), sp=Math.sin(pitch), cy=Math.cos(yaw), sy=Math.sin(yaw);
    const dx=-sy*cp, dy=sp, dz=-cy*cp;
    let prev=[Math.floor(px),Math.floor(py+1.6),Math.floor(pz)];
    for(let t=0;t<5.5;t+=0.05){
      const rx=Math.floor(px+dx*t), ry=Math.floor(py+1.6+dy*t), rz=Math.floor(pz+dz*t);
      if(getBlock(rx,ry,rz)!==0){
        if(mode===0) setBlock(rx,ry,rz,0);
        else setBlock(prev[0],prev[1],prev[2],BLOCKS[selectedSlot].id);
        break;
      }
      prev=[rx,ry,rz];
    }
  }
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  canvas.addEventListener('mousedown', e=>{
    if(document.pointerLockElement!==canvas) return;
    rayAction(e.button===0?0:1);
  });

  // Touch joystick & look
  let lastT = null;
  canvas.addEventListener('touchstart', e=>{ if(e.touches.length===1) lastT={x:e.touches[0].clientX,y:e.touches[0].clientY}; });
  canvas.addEventListener('touchmove', e=>{
    if(!lastT || e.touches.length===0) return;
    const dx=e.touches[0].clientX-lastT.x, dy=e.touches[0].clientY-lastT.y;
    lastT={x:e.touches[0].clientX,y:e.touches[0].clientY};
    yaw -= dx*0.0055; pitch = Math.max(-1.55, Math.min(1.55, pitch - dy*0.0055));
  });
  const joy = document.getElementById('joy'), knob = document.getElementById('knob');
  joy.addEventListener('touchmove', e=>{
    e.stopPropagation();
    const r = joy.getBoundingClientRect(), t = e.touches[0];
    let dx = t.clientX - (r.left+r.width/2), dy = t.clientY - (r.top+r.height/2);
    const d = Math.hypot(dx,dy), maxR = 36;
    if(d>maxR){ dx=dx/d*maxR; dy=dy/d*maxR; }
    knob.style.transform = 'translate('+dx+'px,'+dy+'px)';
    joyVec = {x:dx/maxR, y:-dy/maxR};
  });
  joy.addEventListener('touchend', ()=>{ knob.style.transform='translate(0,0)'; joyVec={x:0,y:0}; });
  document.getElementById('tJump').onclick = ()=>{ if(onGround){ vy=8.2; onGround=false; } };
  document.getElementById('tBreak').onclick = ()=>rayAction(0);
  document.getElementById('tPlace').onclick = ()=>rayAction(1);

  function mul4(a,b){
    const o=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)
      o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return o;
  }
  function persp(fov,asp,n,f){
    const t=1/Math.tan(fov/2), nf=1/(n-f);
    return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]);
  }
  function viewMat(x,y,z,ya,pi){
    const cy=Math.cos(-ya),sy=Math.sin(-ya),cp=Math.cos(-pi),sp=Math.sin(-pi);
    const rx=new Float32Array([1,0,0,0, 0,cp,sp,0, 0,-sp,cp,0, 0,0,0,1]);
    const ry=new Float32Array([cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1]);
    const tr=new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, -x,-y,-z,1]);
    return mul4(rx, mul4(ry, tr));
  }
  function solidAt(x,y,z){
    for(let dy=0;dy<=1;dy++)for(let dx=-0.25;dx<=0.25;dx+=0.5)for(let dz=-0.25;dz<=0.25;dz+=0.5)
      if(getBlock(Math.floor(x+dx),Math.floor(y+dy),Math.floor(z+dz))!==0) return true;
    return false;
  }

  let lastTime=performance.now();
  function frame(now){
    const dt=Math.min(0.05,(now-lastTime)/1000); lastTime=now;
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; gl.viewport(0,0,w,h); }

    if(started && (isTouch || document.pointerLockElement===canvas)){
      let fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0)+joyVec.y, str=(keys.KeyD?1:0)-(keys.KeyA?1:0)+joyVec.x;
      const len=Math.hypot(fwd,str); if(len>1){ fwd/=len; str/=len; }
      const vx=(-Math.sin(yaw)*fwd+Math.cos(yaw)*str)*4.6;
      const vz=(-Math.cos(yaw)*fwd-Math.sin(yaw)*str)*4.6;
      let hitWall=false;
      if(!solidAt(px+vx*dt,py,pz)) px+=vx*dt; else hitWall=true;
      if(!solidAt(px,py,pz+vz*dt)) pz+=vz*dt; else hitWall=true;
      if(isTouch && hitWall && onGround && !solidAt(px+vx*dt,py+1.05,pz+vz*dt)){ vy=8.0; onGround=false; }
      vy-=24*dt;
      if(keys.Space&&onGround){ vy=8.2; onGround=false; }
      if(!solidAt(px,py+vy*dt,pz)){ py+=vy*dt; onGround=false; }
      else{ if(vy<0) onGround=true; vy=0; }
    }

    if(meshDirty) rebuildMesh();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.47,0.65,1.0,1.0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

    const mvp = mul4(persp(1.3,w/Math.max(1,h),0.1,160), viewMat(px,py+1.6,pz,yaw,pitch));
    gl.uniformMatrix4fv(uMVP,false,mvp);
    gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv,2,gl.FLOAT,false,24,12);
    gl.enableVertexAttribArray(aLight);
    gl.vertexAttribPointer(aLight,1,gl.FLOAT,false,24,20);
    gl.drawArrays(gl.TRIANGLES,0,vertCount);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>`;
}
