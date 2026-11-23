import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from './audio';
import { BlockId, getBlockDef, InventorySlot } from './blocks';
import { buildChunkMesh } from './mesher';
import {
  DEFAULT_UNLOCKED_STRUCTURES,
  findStructureGroundY,
  generateStructureQueue,
  getStructureMeta,
} from './structures';
import { ATLAS_GRID, createCrackTextures, getAtlasTexture } from './textures';
import { CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, VoxelWorld, WATER_LEVEL, WorldSaveData } from './world';

export type GameMode = 'survival' | 'creative';
export type CameraPerspective = 0 | 1 | 2; // 0 = 1st person, 1 = 3rd back, 2 = 3rd front

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onOpenInventory: (isCraftingTable: boolean) => void;
  onOpenShop?: () => void;
  onPauseRequest: () => void;
  onSleepNotice?: (msg: string) => void;
  onWebGLContextLost?: () => void;
}

export interface HudSnapshot {
  fps: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  biome: string;
  facing: string;
  health: number;
  hunger: number;
  air: number;
  xpLevel: number;
  xpProgress: number;
  coins: number;
  unlockedCount: number;
  inWater: boolean;
  isFlying: boolean;
  placeMode: boolean;
  immortal: boolean;
  planetCurvature: boolean;
  targetIsDoor: boolean;
  ridingTrain: boolean;
  nearTrain: boolean;
  isBuildingHouse: boolean;
  activeBuildName: string | null;
  buildProgress: number;
  isNight: boolean;
  nearbyZombies: number;
  hurtFlash: number;
  mode: GameMode;
  cameraPerspective: CameraPerspective;
  targetBlockName: string | null;
  miningProgress: number;
  timeOfDay: number;
  hotbar: (InventorySlot | null)[];
  selectedSlot: number;
  pointerLocked: boolean;
}

interface ChunkVisual {
  group: THREE.Group;
  opaque?: THREE.Mesh;
  cutout?: THREE.Mesh;
  water?: THREE.Mesh;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface DroppedItem {
  id: BlockId;
  count: number;
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}

interface PrimedTNT {
  x: number;
  y: number;
  z: number;
  mesh: THREE.Mesh;
  timer: number;
}

interface MobEntity {
  kind: 'sheep' | 'cow' | 'pig' | 'zombie';
  hostile: boolean;
  group: THREE.Group;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  hp: number;
  hurtTimer: number;
  moveTimer: number;
  walkPhase: number;
  moving: boolean;
  attackCooldown: number;
  attackAnim: number;
  groanTimer: number;
  onFire: boolean;
  fireTimer: number;
}

interface TrainEntity {
  kind: 'locomotive' | 'minecart';
  group: THREE.Group;
  wheels: THREE.Mesh[];
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  steamTimer: number;
  chugTimer: number;
}

// Pre-allocated math helpers (zero GC inside render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _dayColor = new THREE.Color(0x78a7ff);
const _sunsetColor = new THREE.Color(0xe88a58);
const _nightColor = new THREE.Color(0x090d1c);
const _waterFogColor = new THREE.Color(0x16427a);

export class VoxelEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private torchLight: THREE.PointLight;
  private worldTorchLights: THREE.PointLight[] = [];
  private envMap: THREE.Texture;

  public world: VoxelWorld;
  private chunkVisuals = new Map<string, ChunkVisual>();
  private atlasTex: THREE.CanvasTexture;
  private opaqueMat: THREE.MeshStandardMaterial;
  private cutoutMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshStandardMaterial;
  private planetUniforms = {
    uPlanetCam: { value: new THREE.Vector3() },
    uCurvature: { value: 0.0024 },
  };
  private crackTextures: THREE.CanvasTexture[];
  private crackMat: THREE.MeshBasicMaterial;
  private crackMesh: THREE.Mesh;
  private highlightBox: THREE.LineSegments;
  private airPreviewBox: THREE.LineSegments;
  private builderHighlightMesh: THREE.LineSegments;

  // Sky objects
  private skyGroup: THREE.Group;
  private sunMesh: THREE.Mesh;
  private moonMesh: THREE.Mesh;
  private starsMesh: THREE.Points;
  private cloudGroup: THREE.Group;

  // Held viewmodel & 3rd-person Steve avatar
  private viewModelGroup: THREE.Group;
  private heldMesh: THREE.Mesh;
  private handGroup: THREE.Group;
  private steveGroup: THREE.Group;
  private steveLegs: THREE.Mesh[] = [];
  private steveArms: THREE.Mesh[] = [];
  private steveHead!: THREE.Mesh;
  private swingTime = 0;
  private walkBob = 0;

  // Dynamic entities
  private particles: Particle[] = [];
  private particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  private drops: DroppedItem[] = [];
  private dropGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  private primedTNTs: PrimedTNT[] = [];
  private mobs: MobEntity[] = [];
  private trains: TrainEntity[] = [];
  private ridingTrain: TrainEntity | null = null;

  // Player state
  public mode: GameMode = 'survival';
  public cameraPerspective: CameraPerspective = 0;
  public renderDistance = 4;
  public timeOfDay = 0.3;
  public timePaused = false;
  public menuPanorama = true;
  public paused = true;
  public placeMode = false;
  public immortal = true;
  public planetCurvature = true;

  public playerPos = new THREE.Vector3(0, 32, 0);
  private spawnPos = new THREE.Vector3(0.5, 32, 0.5);
  private playerVel = new THREE.Vector3(0, 0, 0);
  public yaw = 0;
  public pitch = -0.12;
  private onGround = false;
  private inWater = false;
  private headInWater = false;
  public isFlying = false;
  private lastSpacePress = 0;
  private flyVerticalDir: -1 | 0 | 1 = 0;
  private fallStartY: number | null = null;
  private stepAccum = 0;

  // Economy & 5,400+ Blueprint Auto Builder
  public coins = 750;
  public unlockedStructures = new Set<number>(DEFAULT_UNLOCKED_STRUCTURES);
  private buildQueue: { x: number; y: number; z: number; id: BlockId }[] = [];
  private buildTotal = 0;
  private buildStepTimer = 0;
  private activeBuildName: string | null = null;
  private lastRandomBuildId = 0;

  // Water flow & gravity block physics
  private physicsQueue: [number, number, number][] = [];
  private physicsQueuedKeys = new Set<string>();
  private waterLevelMap = new Map<string, number>();
  private physicsTickAccum = 0;

  public health = 20;
  public hunger = 20;
  public air = 10;
  public xpLevel = 0;
  public xpProgress = 0;
  private airTimer = 0;
  private hungerTimer = 0;
  private playerHurtCooldown = 0;
  private hurtFlash = 0;
  private damageTilt = 0;
  private wasNightAttackActive = false;
  private torchScanTimer = 0;
  private nearbyTorches: [number, number, number][] = [];

  public hotbar: (InventorySlot | null)[] = new Array(9).fill(null);
  public inventory: (InventorySlot | null)[] = new Array(27).fill(null);
  public selectedSlot = 0;

  // Input & Touch state
  private keys = new Set<string>();
  private pointerLocked = false;
  private leftMouseDown = false;
  private mouseNDC = new THREE.Vector2(0, 0);
  private raycaster = new THREE.Raycaster();
  private miningPos: [number, number, number] | null = null;
  private miningProgress = 0;
  private digSoundTimer = 0;
  private mouseDownTime = 0;
  private mouseDownDoorPos: [number, number, number] | null = null;
  private touchMove = { x: 0, y: 0 };
  public touchControlsActive = false;
  private activeTouchId: number | null = null;
  private touchStartPos = { x: 0, y: 0 };
  private lastTouchPos = { x: 0, y: 0 };
  private touchStartTime = 0;
  private touchMovedDist = 0;
  private touchHoldingMine = false;

  // Loop management
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private currentFps = 60;
  private hudEmitAccum = 0;
  private lastTargetHit: { pos: [number, number, number]; normal: [number, number, number]; id: BlockId } | null = null;
  private panoramaAngle = 0;
  private zombieCheckTimer = 0;
  private lavaBurnTimer = 0;

  constructor(container: HTMLElement, callbacks: EngineCallbacks, initialSave?: WorldSaveData) {
    this.container = container;
    this.callbacks = callbacks;
    this.touchControlsActive =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.callbacks.onWebGLContextLost?.();
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x78a7ff);
    this.scene.fog = new THREE.Fog(0x78a7ff, 28, 68);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();

    const aspect =
      (container.clientWidth || window.innerWidth) /
      (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 420);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Lighting
    this.hemiLight = new THREE.HemisphereLight(0xd4eaff, 0x584a38, 0.9);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff7e6, 1.4);
    this.sunLight.position.set(35, 60, 25);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 140;
    const d = 42;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.torchLight = new THREE.PointLight(0xffaa44, 0, 12, 1.5);
    this.scene.add(this.torchLight);

    // Pooled warm flickering point lights for placed torches & glowstone
    for (let i = 0; i < 3; i++) {
      const pl = new THREE.PointLight(0xff9b3d, 0, 13, 1.6);
      this.scene.add(pl);
      this.worldTorchLights.push(pl);
    }

    // Textures & Materials
    this.atlasTex = getAtlasTexture(this.renderer.capabilities.getMaxAnisotropy());
    this.opaqueMat = new THREE.MeshStandardMaterial({
      map: this.atlasTex,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.02,
    });
    this.cutoutMat = new THREE.MeshStandardMaterial({
      map: this.atlasTex,
      vertexColors: true,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.waterMat = new THREE.MeshStandardMaterial({
      map: this.atlasTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.74,
      roughness: 0.16,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.applyPlanetCurvature(this.opaqueMat, 'planet_opaque_v1');
    this.applyPlanetCurvature(this.cutoutMat, 'planet_cutout_v1');
    this.applyPlanetCurvature(this.waterMat, 'planet_water_v1');

    // Block highlight wireframe
    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005));
    this.highlightBox = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.8 })
    );
    this.highlightBox.visible = false;
    this.scene.add(this.highlightBox);

    // Mid-air placement preview wireframe (when aiming into empty air)
    this.airPreviewBox = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.72 })
    );
    this.airPreviewBox.visible = false;
    this.scene.add(this.airPreviewBox);

    // Golden wireframe for active brick being placed by Auto-Builder
    this.builderHighlightMesh = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95 })
    );
    this.builderHighlightMesh.visible = false;
    this.scene.add(this.builderHighlightMesh);

    // Mining crack overlay
    this.crackTextures = createCrackTextures();
    this.crackMat = new THREE.MeshBasicMaterial({
      map: this.crackTextures[0],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), this.crackMat);
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    // Sky setup
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    this.sunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(11, 11, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff6b3, fog: false })
    );
    this.skyGroup.add(this.sunMesh);

    this.moonMesh = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 8.5, 1),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0, fog: false })
    );
    this.skyGroup.add(this.moonMesh);

    const starCount = 340;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.9 + 0.05);
      const r = 135;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starsMesh = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.15, transparent: true, opacity: 0, fog: false })
    );
    this.skyGroup.add(this.starsMesh);

    // Flat Minecraft clouds
    this.cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    const cloudGeo = new THREE.BoxGeometry(12, 1.1, 7);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.position.set(
        (Math.random() - 0.5) * 160,
        54 + (i % 2) * 1.4,
        (Math.random() - 0.5) * 160
      );
      m.scale.set(0.8 + Math.random() * 1.6, 1, 0.8 + Math.random() * 1.4);
      this.cloudGroup.add(m);
    }
    this.scene.add(this.cloudGroup);

    // Viewmodel (Steve arm + held block)
    this.viewModelGroup = new THREE.Group();
    this.camera.add(this.viewModelGroup);

    this.handGroup = new THREE.Group();
    const armSkin = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.32, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xd4a077, roughness: 0.85 })
    );
    armSkin.position.set(0, 0.04, 0);
    const armSleeve = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.18, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.8 })
    );
    armSleeve.position.set(0, -0.18, 0);
    this.handGroup.add(armSkin, armSleeve);
    this.handGroup.position.set(0.4, -0.34, -0.52);
    this.handGroup.rotation.set(-0.45, -0.25, 0.12);
    this.viewModelGroup.add(this.handGroup);

    this.heldMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshStandardMaterial({ map: this.atlasTex, roughness: 0.82 })
    );
    this.heldMesh.position.set(0.38, -0.27, -0.56);
    this.heldMesh.rotation.set(0.14, 0.58, 0);
    this.heldMesh.visible = false;
    this.viewModelGroup.add(this.heldMesh);

    // Third-person articulated Steve player character
    this.steveGroup = this.buildSteveAvatar();
    this.steveGroup.visible = false;
    this.scene.add(this.steveGroup);

    // Initialize World
    this.world = new VoxelWorld(initialSave?.seedText || 'CraftWorld');
    if (initialSave) {
      this.applySaveData(initialSave);
    } else {
      this.initNewWorld('CraftWorld', 'survival');
    }

    this.bindEvents();
    this.updateViewModelBlock();
    this.updateChunksAroundPlayer(true);
    this.spawnInitialMobs();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.startLoop();
  }

  private applyPlanetCurvature(mat: THREE.MeshStandardMaterial, cacheKey: string) {
    mat.customProgramCacheKey = () => cacheKey;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPlanetCam = this.planetUniforms.uPlanetCam;
      shader.uniforms.uCurvature = this.planetUniforms.uCurvature;
      shader.vertexShader =
        'uniform vec3 uPlanetCam;\nuniform float uCurvature;\n' +
        shader.vertexShader.replace(
          '#include <project_vertex>',
          `vec4 worldPosCurv = modelMatrix * vec4( transformed, 1.0 );
          float dCurv = length( worldPosCurv.xz - uPlanetCam.xz );
          float bendCurv = max( 0.0, dCurv - 22.0 );
          worldPosCurv.y -= bendCurv * bendCurv * uCurvature;
          vec4 mvPosition = viewMatrix * worldPosCurv;
          gl_Position = projectionMatrix * mvPosition;`
        );
    };
  }

  public toggleImmortal() {
    this.immortal = !this.immortal;
    soundEngine.playClick();
    this.callbacks.onSleepNotice?.(
      this.immortal ? 'Abadiy Hayot YOQILDI (Cheksiz jon)!' : "Oddiy jon rejimi yoqildi"
    );
    this.emitHud(true);
  }

  public togglePlanetCurvature() {
    this.planetCurvature = !this.planetCurvature;
    soundEngine.playClick();
    this.callbacks.onSleepNotice?.(
      this.planetCurvature ? "Dumaloq To'rtburchak Yer YOQILDI!" : "Tekis Yer ko'rinishi yoqildi"
    );
    this.emitHud(true);
  }

  private buildSteveAvatar(): THREE.Group {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a077, roughness: 0.85 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9 });
    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeIris = new THREE.MeshBasicMaterial({ color: 0x1e3a8a });

    // Legs (0..0.72)
    const legGeo = new THREE.BoxGeometry(0.22, 0.72, 0.22);
    const lLeg = new THREE.Mesh(legGeo, pantsMat);
    lLeg.position.set(-0.12, 0.36, 0);
    const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.12, 0.23), shoeMat);
    lShoe.position.set(0, -0.31, 0);
    lLeg.add(lShoe);

    const rLeg = new THREE.Mesh(legGeo, pantsMat);
    rLeg.position.set(0.12, 0.36, 0);
    const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.12, 0.23), shoeMat);
    rShoe.position.set(0, -0.31, 0);
    rLeg.add(rShoe);

    this.steveLegs = [lLeg, rLeg];
    group.add(lLeg, rLeg);

    // Torso (0.72..1.38)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 0.24), shirtMat);
    torso.position.set(0, 1.05, 0);
    group.add(torso);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.64, 0.2);
    const lArm = new THREE.Mesh(armGeo, skinMat);
    lArm.position.set(-0.35, 1.05, 0);
    const lSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.21), shirtMat);
    lSleeve.position.set(0, 0.2, 0);
    lArm.add(lSleeve);

    const rArm = new THREE.Mesh(armGeo, skinMat);
    rArm.position.set(0.35, 1.05, 0);
    const rSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.21), shirtMat);
    rSleeve.position.set(0, 0.2, 0);
    rArm.add(rSleeve);

    this.steveArms = [lArm, rArm];
    group.add(lArm, rArm);

    // Head (1.38..1.84)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skinMat);
    head.position.set(0, 1.61, 0);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), hairMat);
    hair.position.set(0, 0.18, 0);
    head.add(hair);

    // Eyes on -Z face (facing forward in player yaw)
    const lew = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), eyeWhite);
    lew.position.set(-0.11, 0.02, -0.235);
    const lei = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.025), eyeIris);
    lei.position.set(-0.09, 0.02, -0.236);
    const rew = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), eyeWhite);
    rew.position.set(0.11, 0.02, -0.235);
    const rei = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.025), eyeIris);
    rei.position.set(0.09, 0.02, -0.236);
    head.add(lew, lei, rew, rei);

    this.steveHead = head;
    group.add(head);
    return group;
  }

  public cycleCameraPerspective() {
    this.cameraPerspective = ((this.cameraPerspective + 1) % 3) as CameraPerspective;
    this.emitHud(true);
  }

  public initNewWorld(seedText: string, mode: GameMode) {
    this.clearWorldVisuals();
    this.world = new VoxelWorld(seedText || 'CraftWorld');
    this.mode = mode;
    this.timeOfDay = 0.3;
    this.health = 20;
    this.hunger = 20;
    this.air = 10;
    this.xpLevel = 0;
    this.xpProgress = 0;
    this.coins = 750;
    this.unlockedStructures = new Set(DEFAULT_UNLOCKED_STRUCTURES);
    this.immortal = true;
    this.isFlying = false;
    this.ridingTrain = null;

    const spawnY = this.world.findSafeSpawnY(0, 0);
    this.playerPos.set(0.5, spawnY + 0.5, 0.5);
    this.spawnPos.copy(this.playerPos);
    this.playerVel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.1;

    this.hotbar = new Array(9).fill(null);
    this.inventory = new Array(27).fill(null);
    if (mode === 'creative') {
      this.hotbar[0] = { id: BlockId.GRASS, count: 64 };
      this.hotbar[1] = { id: BlockId.OAK_PLANKS, count: 64 };
      this.hotbar[2] = { id: BlockId.STONE_BRICKS, count: 64 };
      this.hotbar[3] = { id: BlockId.BRICKS, count: 64 };
      this.hotbar[4] = { id: BlockId.GLASS, count: 64 };
      this.hotbar[5] = { id: BlockId.RAIL, count: 64 };
      this.hotbar[6] = { id: BlockId.TRAIN_ENGINE, count: 8 };
      this.hotbar[7] = { id: BlockId.WATER_BUCKET, count: 1 };
      this.hotbar[8] = { id: BlockId.DIAMOND_SWORD, count: 1 };
      this.selectedSlot = 2;
    } else {
      this.hotbar[0] = { id: BlockId.OAK_PLANKS, count: 64 };
      this.hotbar[1] = { id: BlockId.STONE_BRICKS, count: 64 };
      this.hotbar[2] = { id: BlockId.OAK_DOOR_CLOSED, count: 8 };
      this.hotbar[3] = { id: BlockId.GLASS, count: 32 };
      this.hotbar[4] = { id: BlockId.RAIL, count: 32 };
      this.hotbar[5] = { id: BlockId.TRAIN_ENGINE, count: 2 };
      this.hotbar[6] = { id: BlockId.WATER_BUCKET, count: 1 };
      this.hotbar[7] = { id: BlockId.TORCH, count: 16 };
      this.hotbar[8] = { id: BlockId.IRON_SWORD, count: 1 };

      this.inventory[0] = { id: BlockId.WOOD_PICKAXE, count: 1 };
      this.inventory[1] = { id: BlockId.WOOD_AXE, count: 1 };
      this.inventory[2] = { id: BlockId.WOOD_SHOVEL, count: 1 };
      this.inventory[3] = { id: BlockId.APPLE, count: 8 };
      this.inventory[4] = { id: BlockId.POWERED_RAIL, count: 16 };
      this.inventory[5] = { id: BlockId.MINECART, count: 2 };
      this.inventory[6] = { id: BlockId.LAVA_BUCKET, count: 1 };
      this.inventory[7] = { id: BlockId.LADDER, count: 24 };
      this.inventory[8] = { id: BlockId.TNT, count: 8 };
      this.selectedSlot = 0; // Start immediately ready to place Oak Planks!
    }

    this.wasNightAttackActive = false;
    this.hurtFlash = 0;
    this.damageTilt = 0;
    this.spawnStarterRailway();
    this.updateChunksAroundPlayer(true);
    this.spawnInitialMobs();
    this.updateViewModelBlock();
    this.emitHud(true);
  }

  public applySaveData(save: WorldSaveData) {
    this.clearWorldVisuals();
    this.world = new VoxelWorld(save.seedText || 'CraftWorld');
    this.world.loadEditsArray(save.edits || []);
    this.mode = save.mode || 'survival';
    this.timeOfDay = typeof save.timeOfDay === 'number' ? save.timeOfDay : 0.3;
    this.playerPos.set(save.playerPos[0], save.playerPos[1], save.playerPos[2]);
    this.spawnPos.copy(this.playerPos);
    this.playerVel.set(0, 0, 0);
    this.yaw = save.playerYaw || 0;
    this.pitch = save.playerPitch || 0;
    this.health = save.health ?? 20;
    this.hunger = save.hunger ?? 20;
    this.coins = typeof save.coins === 'number' ? save.coins : 750;
    this.immortal = typeof save.immortal === 'boolean' ? save.immortal : true;
    this.unlockedStructures = new Set(
      Array.isArray(save.unlockedStructures) && save.unlockedStructures.length > 0
        ? save.unlockedStructures
        : DEFAULT_UNLOCKED_STRUCTURES
    );
    this.hotbar = save.hotbar?.length === 9 ? save.hotbar : new Array(9).fill(null);
    this.inventory = save.inventory?.length === 27 ? save.inventory : new Array(27).fill(null);
    // Ensure a ready train exists near spawn if player hasn't placed one yet
    this.spawnStarterRailway(true);
    this.updateChunksAroundPlayer(true);
    this.spawnInitialMobs();
    this.updateViewModelBlock();
    this.emitHud(true);
  }

  public exportSaveData(): WorldSaveData {
    return {
      version: 2,
      seedText: this.world.seedText,
      seed: this.world.seed,
      mode: this.mode,
      timeOfDay: this.timeOfDay,
      playerPos: [this.playerPos.x, this.playerPos.y, this.playerPos.z],
      playerYaw: this.yaw,
      playerPitch: this.pitch,
      health: this.health,
      hunger: this.hunger,
      coins: this.coins,
      immortal: this.immortal,
      unlockedStructures: Array.from(this.unlockedStructures),
      hotbar: this.hotbar,
      inventory: this.inventory,
      edits: this.world.getEditsArray(),
    };
  }

  private clearWorldVisuals() {
    for (const cv of this.chunkVisuals.values()) {
      this.disposeChunkVisual(cv);
    }
    this.chunkVisuals.clear();
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops = [];
    for (const m of this.mobs) this.scene.remove(m.group);
    this.mobs = [];
    for (const t of this.trains) this.disposeTrainVisual(t);
    this.trains = [];
    this.ridingTrain = null;
    this.buildQueue = [];
    this.buildTotal = 0;
    this.activeBuildName = null;
    this.builderHighlightMesh.visible = false;
    this.airPreviewBox.visible = false;
    this.physicsQueue = [];
    this.physicsQueuedKeys.clear();
    this.waterLevelMap.clear();
  }

  private disposeChunkVisual(cv: ChunkVisual) {
    this.scene.remove(cv.group);
    if (cv.opaque) cv.opaque.geometry.dispose();
    if (cv.cutout) cv.cutout.geometry.dispose();
    if (cv.water) cv.water.geometry.dispose();
  }

  private spawnInitialMobs() {
    for (const m of this.mobs) this.scene.remove(m.group);
    this.mobs = [];
    const baseX = Math.floor(this.playerPos.x);
    const baseZ = Math.floor(this.playerPos.z);

    const kinds: ('sheep' | 'cow' | 'pig')[] = ['sheep', 'cow', 'pig', 'sheep', 'cow', 'pig', 'sheep'];
    for (let i = 0; i < kinds.length; i++) {
      const angle = (i / kinds.length) * Math.PI * 2;
      const dist = 7 + (i % 3) * 6;
      const mx = baseX + Math.round(Math.cos(angle) * dist);
      const mz = baseZ + Math.round(Math.sin(angle) * dist);
      const my = this.world.findSafeSpawnY(mx, mz);
      if (my <= WATER_LEVEL + 1) continue;
      this.mobs.push(this.createMob(kinds[i], mx + 0.5, my, mz + 0.5));
    }
  }

  private createMob(kind: 'sheep' | 'cow' | 'pig' | 'zombie', x: number, y: number, z: number): MobEntity {
    const group = new THREE.Group();
    const legs: THREE.Mesh[] = [];
    const arms: THREE.Mesh[] = [];

    if (kind === 'zombie') {
      const skinMat = new THREE.MeshStandardMaterial({ color: 0x4b7f42, roughness: 0.88 });
      const headSkinMat = new THREE.MeshStandardMaterial({ color: 0x3f6e37, roughness: 0.88 });
      const shirtMat = new THREE.MeshStandardMaterial({ color: 0x0e7490, roughness: 0.85 });
      const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.9 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });

      const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
      for (const lx of [-0.12, 0.12]) {
        const leg = new THREE.Mesh(legGeo, pantsMat);
        leg.position.set(lx, 0.35, 0);
        leg.castShadow = !this.isSoftwareGl;
        group.add(leg);
        legs.push(leg);
      }
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.64, 0.24), shirtMat);
      torso.position.set(0, 1.02, 0);
      torso.castShadow = !this.isSoftwareGl;
      group.add(torso);

      // Outstretched zombie arms pointing forward (+Z in local group)
      const armGeo = new THREE.BoxGeometry(0.18, 0.56, 0.18);
      for (const ax of [-0.34, 0.34]) {
        const arm = new THREE.Mesh(armGeo, skinMat);
        arm.position.set(ax, 1.24, 0.22);
        arm.rotation.x = -1.35;
        arm.castShadow = !this.isSoftwareGl;
        group.add(arm);
        arms.push(arm);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), headSkinMat);
      head.position.set(0, 1.56, 0);
      head.castShadow = !this.isSoftwareGl;
      const le = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.025), eyeMat);
      le.position.set(-0.1, 0.03, 0.225);
      const re = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.025), eyeMat);
      re.position.set(0.1, 0.03, 0.225);
      head.add(le, re);
      group.add(head);

      group.position.set(x, y, z);
      this.scene.add(group);
      return {
        kind,
        hostile: true,
        group,
        legs,
        arms,
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        hp: 18,
        hurtTimer: 0,
        moveTimer: 1,
        walkPhase: 0,
        moving: true,
        attackCooldown: 0.4,
        attackAnim: 0,
        groanTimer: 1.5 + Math.random() * 4,
        onFire: false,
        fireTimer: 0,
      };
    }

    const bodyColor = kind === 'sheep' ? 0xf5f5f4 : kind === 'pig' ? 0xf4a5ae : 0x5c3e2b;
    const skinColor = kind === 'sheep' ? 0xe7c6a5 : kind === 'pig' ? 0xf4909b : 0x3b281c;
    const snoutColor = kind === 'sheep' ? 0x1f2937 : kind === 'pig' ? 0xec6d7b : 0xe5e7eb;

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.78 });
    const accentMat = new THREE.MeshStandardMaterial({ color: snoutColor, roughness: 0.65 });

    const scale = kind === 'pig' ? 0.85 : 1.0;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.65 * scale, 0.56 * scale, 0.94 * scale), bodyMat);
    body.position.set(0, 0.66 * scale, 0);
    body.castShadow = !this.isSoftwareGl;
    body.receiveShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45 * scale, 0.42 * scale, 0.46 * scale), skinMat);
    head.position.set(0, 0.88 * scale, 0.58 * scale);
    head.castShadow = !this.isSoftwareGl;
    group.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26 * scale, 0.16 * scale, 0.1 * scale), accentMat);
    snout.position.set(0, 0.8 * scale, 0.84 * scale);
    group.add(snout);

    const legGeo = new THREE.BoxGeometry(0.18 * scale, 0.4 * scale, 0.18 * scale);
    for (const [lx, lz] of [
      [-0.2 * scale, 0.3 * scale],
      [0.2 * scale, 0.3 * scale],
      [-0.2 * scale, -0.3 * scale],
      [0.2 * scale, -0.3 * scale],
    ]) {
      const leg = new THREE.Mesh(legGeo, skinMat);
      leg.position.set(lx, 0.2 * scale, lz);
      leg.castShadow = !this.isSoftwareGl;
      group.add(leg);
      legs.push(leg);
    }

    group.position.set(x, y, z);
    this.scene.add(group);
    return {
      kind,
      hostile: false,
      group,
      legs,
      arms,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.random() * Math.PI * 2,
      hp: 8,
      hurtTimer: 0,
      moveTimer: 1 + Math.random() * 3,
      walkPhase: 0,
      moving: Math.random() > 0.35,
      attackCooldown: 0,
      attackAnim: 0,
      groanTimer: 99,
      onFire: false,
      fireTimer: 0,
    };
  }

  public setSelectedSlot(slot: number) {
    this.selectedSlot = ((slot % 9) + 9) % 9;
    this.updateViewModelBlock();
    this.emitHud(true);
  }

  private setFaceUV(uvAttr: THREE.BufferAttribute, faceIndex: number, tileIndex: number) {
    const col = tileIndex % ATLAS_GRID;
    const row = Math.floor(tileIndex / ATLAS_GRID);
    const step = 1 / ATLAS_GRID;
    const u0 = col * step + 0.002;
    const u1 = (col + 1) * step - 0.002;
    const v1 = 1 - row * step - 0.002;
    const v0 = 1 - (row + 1) * step + 0.002;
    const i = faceIndex * 4;
    uvAttr.setXY(i, u0, v1);
    uvAttr.setXY(i + 1, u1, v1);
    uvAttr.setXY(i + 2, u0, v0);
    uvAttr.setXY(i + 3, u1, v0);
  }

  public updateViewModelBlock() {
    const item = this.hotbar[this.selectedSlot];
    if (!item || item.count <= 0) {
      this.handGroup.visible = true;
      this.heldMesh.visible = false;
      this.torchLight.intensity = 0;
      return;
    }
    const def = getBlockDef(item.id);
    this.handGroup.visible = false;
    this.heldMesh.visible = true;

    const uvAttr = this.heldMesh.geometry.attributes.uv as THREE.BufferAttribute;
    // BoxGeometry face order: 0:+X, 1:-X, 2:+Y(top), 3:-Y(bottom), 4:+Z(front), 5:-Z
    this.setFaceUV(uvAttr, 0, def.tiles.side);
    this.setFaceUV(uvAttr, 1, def.tiles.side);
    this.setFaceUV(uvAttr, 2, def.tiles.top);
    this.setFaceUV(uvAttr, 3, def.tiles.bottom);
    this.setFaceUV(uvAttr, 4, def.tiles.front ?? def.tiles.side);
    this.setFaceUV(uvAttr, 5, def.tiles.side);
    uvAttr.needsUpdate = true;

    const mat = this.heldMesh.material as THREE.MeshStandardMaterial;
    if (def.isItemOnly || def.isPlant) {
      this.heldMesh.scale.set(0.95, 0.95, 0.14);
      this.heldMesh.rotation.set(0.1, 0.4, -0.2);
      mat.transparent = true;
      mat.alphaTest = 0.4;
    } else {
      this.heldMesh.scale.set(1, 1, 1);
      this.heldMesh.rotation.set(0.14, 0.58, 0);
      mat.transparent = !!def.cutout || !!def.isLiquid;
      mat.alphaTest = def.cutout ? 0.4 : 0;
    }
    mat.needsUpdate = true;
    this.torchLight.intensity = def.emissive ? 2.0 : 0;
  }

  public requestLock() {
    if (this.paused || this.menuPanorama || this.touchControlsActive) return;
    try {
      this.renderer.domElement.requestPointerLock();
    } catch {
      // Touch / drag fallback works cleanly
    }
  }

  public setTouchMove(x: number, y: number) {
    this.touchControlsActive = true;
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  public toggleFlight() {
    this.isFlying = !this.isFlying;
    this.flyVerticalDir = 0;
    this.playerVel.y = this.isFlying ? 2.5 : 0;
    this.fallStartY = null;
    soundEngine.playClick();
    this.emitHud(true);
  }

  public setFlyVertical(dir: -1 | 0 | 1) {
    this.flyVerticalDir = dir;
  }

  public teleportTo(wx: number, wz: number) {
    const ix = Math.floor(wx) + 0.5;
    const iz = Math.floor(wz) + 0.5;
    const safeY = this.world.findSafeSpawnY(ix, iz);
    const targetY = this.isFlying ? Math.max(safeY + 4, this.playerPos.y) : safeY + 0.5;
    this.playerPos.set(ix, targetY, iz);
    this.playerVel.set(0, 0, 0);
    this.fallStartY = null;
    this.updateChunksAroundPlayer(true);
    soundEngine.playPickup();
    this.emitHud(true);
  }

  public togglePlaceMode() {
    this.placeMode = !this.placeMode;
    soundEngine.playClick();
    this.callbacks.onSleepNotice?.(
      this.placeMode
        ? "1-Bosish Qo'yish rejimi YOQILDI (bosib blok qo'ying)!"
        : "Oddiy rejim: Chap — sindirish, O'ng / Alt / Q — qo'yish"
    );
    this.emitHud(true);
  }

  public buyStructure(id: number): boolean {
    const meta = getStructureMeta(id);
    if (this.unlockedStructures.has(id)) return true;
    if (this.mode !== 'creative' && this.coins < meta.price) {
      this.callbacks.onSleepNotice?.(
        `Tanga yetarli emas! Kerak: ${meta.price}, Sizda: ${this.coins}`
      );
      return false;
    }
    if (this.mode !== 'creative') {
      this.coins -= meta.price;
    }
    this.unlockedStructures.add(id);
    soundEngine.playCoin();
    this.callbacks.onSleepNotice?.(`${meta.name} sotib olindi!`);
    this.emitHud(true);
    return true;
  }

  public startAutoBuildStructure(structureId: number) {
    const meta = getStructureMeta(structureId);
    if (!this.unlockedStructures.has(structureId)) {
      if (!this.buyStructure(structureId)) return;
    }

    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const offsetDist = Math.max(7, Math.ceil(meta.width / 2) + 4);
    const hx = Math.round(this.playerPos.x + fwdX * offsetDist);
    const hz = Math.round(this.playerPos.z + fwdZ * offsetDist);

    const groundY = findStructureGroundY(hx, hz, this.world);
    const toPlayerX = this.playerPos.x - hx;
    const toPlayerZ = this.playerPos.z - hz;
    let doorSide: 'px' | 'nx' | 'pz' | 'nz' = 'pz';
    if (Math.abs(toPlayerX) > Math.abs(toPlayerZ)) {
      doorSide = toPlayerX > 0 ? 'px' : 'nx';
    } else {
      doorSide = toPlayerZ > 0 ? 'pz' : 'nz';
    }

    const { queue } = generateStructureQueue(structureId, hx, groundY, hz, doorSide, this.world);
    this.buildQueue = queue;
    this.buildTotal = queue.length;
    this.buildStepTimer = 0;
    this.activeBuildName = meta.name;
    this.callbacks.onSleepNotice?.(`${meta.name} qurilmoqda!`);
    this.emitHud(true);
  }

  public startRandomAutoBuild() {
    const pool = Array.from(this.unlockedStructures);
    if (pool.length === 0) pool.push(1);
    let chosen = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && chosen === this.lastRandomBuildId) {
      const idx = (pool.indexOf(chosen) + 1) % pool.length;
      chosen = pool[idx];
    }
    this.lastRandomBuildId = chosen;
    this.startAutoBuildStructure(chosen);
  }

  public startAutoBuildHouse() {
    if (this.buildQueue.length > 0) {
      this.cancelAutoBuild();
      return;
    }
    this.startRandomAutoBuild();
  }

  public cancelAutoBuild() {
    this.buildQueue = [];
    this.buildTotal = 0;
    this.activeBuildName = null;
    this.builderHighlightMesh.visible = false;
    this.emitHud(true);
  }

  private createTrainMesh(kind: 'locomotive' | 'minecart'): { group: THREE.Group; wheels: THREE.Mesh[] } {
    const group = new THREE.Group();
    const wheels: THREE.Mesh[] = [];
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.45 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.65, metalness: 0.35 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.6 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const wheelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.1, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelOffsets: [number, number][] =
      kind === 'locomotive'
        ? [
            [-0.44, -0.58],
            [0.44, -0.58],
            [-0.44, 0.05],
            [0.44, 0.05],
            [-0.44, 0.62],
            [0.44, 0.62],
          ]
        : [
            [-0.42, -0.38],
            [0.42, -0.38],
            [-0.42, 0.38],
            [0.42, 0.38],
          ];
    for (const [wx, wz] of wheelOffsets) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(wx, 0.21, wz);
      group.add(w);
      wheels.push(w);
    }

    if (kind === 'minecart') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 1.15), ironMat);
      base.position.set(0, 0.34, 0);
      const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 1.15), ironMat);
      wallL.position.set(-0.38, 0.62, 0);
      const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 1.15), ironMat);
      wallR.position.set(0.38, 0.62, 0);
      const wallF = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.46, 0.1), ironMat);
      wallF.position.set(0, 0.62, 0.52);
      const wallB = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.46, 0.1), ironMat);
      wallB.position.set(0, 0.62, -0.52);
      group.add(base, wallL, wallR, wallF, wallB);
      return { group, wheels };
    }

    // Steam Locomotive (10-part articulated voxel/cylindrical composite)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.2, 1.78), redMat);
    chassis.position.set(0, 0.38, 0);
    chassis.castShadow = !this.isSoftwareGl;
    group.add(chassis);

    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.96, 12), darkMat);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 0.78, 0.32);
    boiler.castShadow = !this.isSoftwareGl;
    group.add(boiler);

    const brassBand = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.08, 12), brassMat);
    brassBand.rotation.x = Math.PI / 2;
    brassBand.position.set(0, 0.78, 0.45);
    group.add(brassBand);

    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.42, 10), darkMat);
    chimney.position.set(0, 1.22, 0.62);
    group.add(chimney);

    const cabBack = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.75, 0.12), redMat);
    cabBack.position.set(0, 0.85, -0.78);
    const cabLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.72), redMat);
    cabLeft.position.set(-0.42, 0.85, -0.46);
    const cabRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.72), redMat);
    cabRight.position.set(0.42, 0.85, -0.46);
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.1, 0.88), brassMat);
    cabRoof.position.set(0, 1.26, -0.46);
    group.add(cabBack, cabLeft, cabRight, cabRoof);

    const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.1), lampMat);
    headlamp.position.set(0, 0.86, 0.84);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.18, 0.18), ironMat);
    bumper.position.set(0, 0.32, 0.92);
    group.add(headlamp, bumper);

    return { group, wheels };
  }

  private disposeTrainVisual(t: TrainEntity) {
    this.scene.remove(t.group);
    const mats = new Set<THREE.Material>();
    t.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => mats.add(m));
        else mats.add(obj.material);
      }
    });
    mats.forEach((m) => m.dispose());
  }

  private spawnTrainAt(kind: 'locomotive' | 'minecart', x: number, y: number, z: number, yaw = 0): TrainEntity {
    const { group, wheels } = this.createTrainMesh(kind);
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    const train: TrainEntity = {
      kind,
      group,
      wheels,
      x,
      y,
      z,
      yaw,
      speed: 0,
      steamTimer: 0,
      chugTimer: 0,
    };
    this.trains.push(train);
    return train;
  }

  private spawnStarterRailway(onlyIfNoTrain = false) {
    if (onlyIfNoTrain && this.trains.length > 0) return;
    const baseX = Math.floor(this.playerPos.x) + 4;
    const baseZ = Math.floor(this.playerPos.z);

    if (!onlyIfNoTrain) {
      // Build a scenic looping Stone Brick railway with a 45° sloped overpass bridge!
      const railY = Math.max(WATER_LEVEL + 2, Math.floor(this.world.findSafeSpawnY(baseX, baseZ)));
      const setTrackCell = (wx: number, wy: number, wz: number, powered: boolean) => {
        for (let fy = Math.max(1, wy - 4); fy < wy; fy++) {
          if (fy === wy - 1) {
            this.world.setBlock(wx, fy, wz, BlockId.STONE_BRICKS);
          } else if (!this.world.isSolidAt(wx, fy, wz)) {
            this.world.setBlock(wx, fy, wz, BlockId.COBBLESTONE);
          }
        }
        this.world.setBlock(wx, wy, wz, powered ? BlockId.POWERED_RAIL : BlockId.RAIL);
        for (let cy = wy + 1; cy <= wy + 3; cy++) {
          if (this.world.getBlock(wx, cy, wz) !== BlockId.AIR) {
            this.world.setBlock(wx, cy, wz, BlockId.AIR);
          }
        }
      };

      // Straight track segments along X = baseX and X = baseX + 8
      for (let dz = -6; dz <= 6; dz++) {
        setTrackCell(baseX, railY, baseZ + dz, Math.abs(dz) % 3 === 0);
        setTrackCell(baseX + 8, railY, baseZ + dz, Math.abs(dz) % 3 === 0);
      }
      // Connecting ends along Z = baseZ - 6 (flat) and Z = baseZ + 6 (elevated 1-block slope!)
      for (let dx = 1; dx <= 7; dx++) {
        setTrackCell(baseX + dx, railY, baseZ - 6, dx % 3 === 0);
        const elevated = dx >= 3 && dx <= 5 ? railY + 1 : railY;
        setTrackCell(baseX + dx, elevated, baseZ + 6, dx % 2 === 0);
      }

      const loco = this.spawnTrainAt('locomotive', baseX + 0.5, railY + 0.06, baseZ + 0.5, 0);
      loco.speed = 4.6;
      const wagon = this.spawnTrainAt('minecart', baseX + 0.5, railY + 0.06, baseZ - 1.5, 0);
      wagon.speed = 4.6;
    } else {
      const sy = this.world.findSafeSpawnY(baseX, baseZ);
      this.spawnTrainAt('locomotive', baseX + 0.5, sy + 0.06, baseZ + 0.5, 0);
    }
  }

  public toggleRideTrain() {
    if (this.ridingTrain) {
      this.ridingTrain = null;
      this.playerPos.y += 0.4;
      soundEngine.playClick();
      this.callbacks.onSleepNotice?.('Poyezddan tushdingiz');
      this.emitHud(true);
      return;
    }

    let nearest: TrainEntity | null = null;
    let bestDist = 7.5;
    for (const t of this.trains) {
      const d = Math.hypot(t.x - this.playerPos.x, t.y - this.playerPos.y, t.z - this.playerPos.z);
      if (d < bestDist) {
        bestDist = d;
        nearest = t;
      }
    }

    if (!nearest) {
      // Spawn a fresh ready locomotive right in front of the player!
      const fx = Math.floor(this.playerPos.x - Math.sin(this.yaw) * 2.5) + 0.5;
      const fz = Math.floor(this.playerPos.z - Math.cos(this.yaw) * 2.5) + 0.5;
      const fy = Math.floor(this.playerPos.y);
      nearest = this.spawnTrainAt('locomotive', fx, fy + 0.06, fz, this.yaw + Math.PI);
    }

    this.ridingTrain = nearest;
    this.isFlying = false;
    this.fallStartY = null;
    soundEngine.playTrainWhistle();
    this.callbacks.onSleepNotice?.(
      "Poyezdga mindingiz! W/S — yurish/tormoz, R/Space — tushish"
    );
    this.emitHud(true);
  }

  public toggleDayNight() {
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const isNightNow = Math.sin(angle) < 0.08;
    this.timeOfDay = isNightNow ? 0.38 : 0.77; // Switch between bright day & evening zombie attack!
    soundEngine.playClick();
    if (!isNightNow) {
      this.callbacks.onSleepNotice?.("Kech tushdi! Zombilar hujumga chiqmoqda!");
      this.zombieCheckTimer = 4.0;
    } else {
      this.callbacks.onSleepNotice?.("Tong otdi! Quyosh nuri zombilarni yoqmoqda!");
    }
    this.emitHud(true);
  }

  public getMobMarkers(): { x: number; z: number; hostile: boolean }[] {
    return this.mobs.map((m) => ({ x: m.x, z: m.z, hostile: m.hostile }));
  }

  public triggerTouchJump() {
    this.touchControlsActive = true;
    const now = performance.now();
    if (now - this.lastSpacePress < 300) {
      this.toggleFlight();
    }
    this.lastSpacePress = now;
    this.keys.add('Space');
    setTimeout(() => this.keys.delete('Space'), 160);
  }

  public triggerTouchBreak() {
    this.touchControlsActive = true;
    this.swingTime = 0.2;
    if (!this.tryAttackMobInFront()) {
      this.tryBreakInstantOrStep(0.35);
    }
  }

  public triggerTouchPlace() {
    this.touchControlsActive = true;
    this.swingTime = 0.2;
    this.handleRightClick();
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
    canvas.addEventListener('touchcancel', this.onTouchEnd);
  }

  private unbindEvents() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);
    canvas.removeEventListener('touchcancel', this.onTouchEnd);
  }

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    if (!locked && !this.paused && !this.menuPanorama && !this.touchControlsActive) {
      this.leftMouseDown = false;
      this.keys.clear();
      this.callbacks.onPauseRequest();
    }
    this.emitHud(true);
  };

  private updateMouseNDC(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private getAimRay(outOrigin: THREE.Vector3, outDir: THREE.Vector3) {
    if (!this.pointerLocked && !this.touchControlsActive) {
      this.raycaster.setFromCamera(this.mouseNDC, this.camera);
      outOrigin.copy(this.raycaster.ray.origin);
      outDir.copy(this.raycaster.ray.direction).normalize();
    } else {
      outOrigin.copy(this.camera.position);
      outDir.set(0, 0, -1).applyEuler(this.camera.rotation).normalize();
    }
  }

  private onMouseMove = (e: MouseEvent) => {
    if (this.paused || this.menuPanorama) return;
    if (!this.pointerLocked) {
      this.updateMouseNDC(e.clientX, e.clientY);
      if (!this.leftMouseDown) return;
    }
    const sens = 0.0022;
    this.yaw -= e.movementX * sens;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - e.movementY * sens,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02
    );
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused || this.menuPanorama) return;
    if (!this.pointerLocked) {
      this.updateMouseNDC(e.clientX, e.clientY);
    }

    const wantPlace = e.button === 2 || e.altKey || (e.button === 0 && this.placeMode);
    if (wantPlace) {
      this.swingTime = 0.2;
      this.handleRightClick();
      if (!this.pointerLocked && !this.placeMode) {
        this.requestLock();
      }
      return;
    }

    if (!this.pointerLocked) {
      this.requestLock();
    }
    if (e.button === 0) {
      this.leftMouseDown = true;
      this.mouseDownTime = performance.now();
      this.swingTime = 0.22;
      if (this.tryAttackMobInFront()) {
        this.mouseDownDoorPos = null;
        return;
      }
      this.lastTargetHit = this.raycastVoxel(6.0);
      if (
        this.lastTargetHit &&
        (this.lastTargetHit.id === BlockId.OAK_DOOR_CLOSED ||
          this.lastTargetHit.id === BlockId.OAK_DOOR_OPEN)
      ) {
        this.mouseDownDoorPos = [...this.lastTargetHit.pos];
      } else {
        this.mouseDownDoorPos = null;
      }
      if (this.mode === 'creative' && !this.mouseDownDoorPos) {
        this.tryBreakBlockNow();
      }
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      const heldMs = performance.now() - this.mouseDownTime;
      if (this.mouseDownDoorPos && heldMs < 240 && !this.placeMode) {
        const [dx, dy, dz] = this.mouseDownDoorPos;
        const curId = this.world.getBlock(dx, dy, dz);
        if (curId === BlockId.OAK_DOOR_CLOSED || curId === BlockId.OAK_DOOR_OPEN) {
          this.toggleDoorAt(dx, dy, dz, curId);
        }
      }
      this.mouseDownDoorPos = null;
      this.leftMouseDown = false;
      this.resetMiningState();
    }
  };

  private resetMiningState() {
    this.miningProgress = 0;
    this.miningPos = null;
    this.crackMesh.visible = false;
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onWheel = (e: WheelEvent) => {
    if (this.paused || this.menuPanorama) return;
    if (e.deltaY > 0) this.setSelectedSlot(this.selectedSlot + 1);
    else if (e.deltaY < 0) this.setSelectedSlot(this.selectedSlot - 1);
  };

  private onTouchStart = (e: TouchEvent) => {
    if (this.paused || this.menuPanorama) return;
    this.touchControlsActive = true;
    if (this.activeTouchId === null && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      this.activeTouchId = t.identifier;
      this.touchStartPos = { x: t.clientX, y: t.clientY };
      this.lastTouchPos = { x: t.clientX, y: t.clientY };
      this.touchStartTime = performance.now();
      this.touchMovedDist = 0;
      this.touchHoldingMine = false;
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (this.paused || this.menuPanorama || this.activeTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.activeTouchId) {
        e.preventDefault();
        const dx = t.clientX - this.lastTouchPos.x;
        const dy = t.clientY - this.lastTouchPos.y;
        this.lastTouchPos = { x: t.clientX, y: t.clientY };
        this.touchMovedDist += Math.hypot(dx, dy);
        if (this.touchMovedDist > 12) {
          this.touchHoldingMine = false;
          this.resetMiningState();
        }
        this.yaw -= dx * 0.0055;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - dy * 0.0055,
          -Math.PI / 2 + 0.02,
          Math.PI / 2 - 0.02
        );
        break;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (this.activeTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.activeTouchId) {
        const duration = performance.now() - this.touchStartTime;
        // Quick tap without dragging => Place block / Open door / Attack mob (Minecraft PE style!)
        if (this.touchMovedDist < 14 && duration < 240 && !this.touchHoldingMine) {
          this.swingTime = 0.2;
          if (!this.tryAttackMobInFront()) {
            this.handleRightClick();
          }
        }
        this.activeTouchId = null;
        this.touchHoldingMine = false;
        this.resetMiningState();
        break;
      }
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.menuPanorama) return;
    if (e.code === 'KeyE') {
      if (!this.paused) {
        if (document.pointerLockElement) document.exitPointerLock();
        this.callbacks.onOpenInventory(false);
      }
      return;
    }
    if (e.code === 'F5') {
      e.preventDefault();
      if (!this.paused) this.cycleCameraPerspective();
      return;
    }
    if (this.paused) return;

    if (e.code.startsWith('Digit')) {
      const num = parseInt(e.code.replace('Digit', ''), 10);
      if (num >= 1 && num <= 9) {
        this.setSelectedSlot(num - 1);
      }
    }

    if (e.code === 'Space' && !e.repeat) {
      const now = performance.now();
      if (now - this.lastSpacePress < 280) {
        this.toggleFlight();
      }
      this.lastSpacePress = now;
    }

    if (e.code === 'KeyF' && !e.repeat) {
      this.toggleFlight();
    }

    if (e.code === 'KeyB' && !e.repeat) {
      if (this.callbacks.onOpenShop) {
        if (document.pointerLockElement) document.exitPointerLock();
        this.callbacks.onOpenShop();
      } else {
        this.startAutoBuildHouse();
      }
    }

    if (e.code === 'KeyX' && !e.repeat) {
      this.togglePlaceMode();
    }

    if (e.code === 'KeyR' && !e.repeat) {
      this.toggleRideTrain();
    }

    if (e.code === 'KeyN' && !e.repeat) {
      this.toggleDayNight();
    }

    if (e.code === 'KeyG' && !e.repeat) {
      this.toggleTargetDoor();
    }

    if ((e.code === 'KeyQ' || e.code === 'KeyC' || e.code === 'KeyV') && !e.repeat) {
      this.swingTime = 0.2;
      this.handleRightClick();
    }

    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private tryAttackMobInFront(): boolean {
    const dir = _v1.set(0, 0, -1).applyEuler(this.camera.rotation).normalize();
    const eye = _v2.set(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z);

    let bestIdx = -1;
    let bestDist = 4.2;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      const toMobX = m.x - eye.x;
      const toMobY = m.y + 0.85 - eye.y;
      const toMobZ = m.z - eye.z;
      const dist = Math.hypot(toMobX, toMobY, toMobZ);
      if (dist > bestDist) continue;
      const dot = (toMobX * dir.x + toMobY * dir.y + toMobZ * dir.z) / Math.max(0.01, dist);
      if (dot > 0.78) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return false;
    const mob = this.mobs[bestIdx];
    const held = this.hotbar[this.selectedSlot];
    const dmg = held ? getBlockDef(held.id).attackDamage ?? 2 : 2;
    mob.hp -= dmg;
    mob.hurtTimer = 0.28;
    mob.vy = 4.8;
    mob.vx = dir.x * 6.5;
    mob.vz = dir.z * 6.5;
    soundEngine.playMobHurt();
    this.spawnBreakParticles(
      Math.floor(mob.x),
      Math.floor(mob.y + 1),
      Math.floor(mob.z),
      mob.hostile ? BlockId.OAK_LEAVES : BlockId.WOOL
    );

    if (mob.hp <= 0) {
      this.scene.remove(mob.group);
      this.mobs.splice(bestIdx, 1);
      this.grantXP(mob.hostile ? 0.55 : 0.35);
      this.coins += mob.hostile ? 35 : 15;
      soundEngine.playCoin();
      if (mob.kind === 'sheep') {
        this.spawnDroppedItem(mob.x, mob.y + 0.5, mob.z, BlockId.WOOL, 1);
      } else if (mob.kind === 'cow' || mob.kind === 'pig') {
        this.spawnDroppedItem(mob.x, mob.y + 0.5, mob.z, BlockId.COOKED_BEEF, 1);
      } else if (mob.kind === 'zombie') {
        const dropId = Math.random() < 0.3 ? BlockId.IRON_INGOT : BlockId.COAL;
        this.spawnDroppedItem(mob.x, mob.y + 0.5, mob.z, dropId, 1);
      }
      soundEngine.playBreak('grass');
      this.emitHud(true);
    }
    return true;
  }

  private grantXP(amount: number) {
    this.xpProgress += amount;
    while (this.xpProgress >= 1) {
      this.xpProgress -= 1;
      this.xpLevel += 1;
    }
  }

  private raycastVoxel(maxDist = 6.0) {
    const origin = _v2;
    const dir = _v1;
    this.getAimRay(origin, dir);
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;

    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : 1e9;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : 1e9;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : 1e9;

    let tMaxX = dir.x > 0 ? (x + 1 - ox) * tDeltaX : (ox - x) * tDeltaX;
    let tMaxY = dir.y > 0 ? (y + 1 - oy) * tDeltaY : (oy - y) * tDeltaY;
    let tMaxZ = dir.z > 0 ? (z + 1 - oz) * tDeltaZ : (oz - z) * tDeltaZ;

    let nx = 0, ny = 0, nz = 0;
    let dist = 0;

    while (dist < maxDist) {
      const id = this.world.getBlock(x, y, z);
      if (id !== BlockId.AIR && id !== BlockId.WATER && id !== BlockId.LAVA) {
        return {
          pos: [x, y, z] as [number, number, number],
          normal: [nx, ny, nz] as [number, number, number],
          id,
        };
      }
      // Top half of a 2-block tall wooden door!
      if (id === BlockId.AIR && y >= 1) {
        const below = this.world.getBlock(x, y - 1, z);
        if (below === BlockId.OAK_DOOR_CLOSED || below === BlockId.OAK_DOOR_OPEN) {
          return {
            pos: [x, y - 1, z] as [number, number, number],
            normal: [nx, ny, nz] as [number, number, number],
            id: below,
          };
        }
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          dist = tMaxX;
          x += stepX;
          tMaxX += tDeltaX;
          nx = -stepX; ny = 0; nz = 0;
        } else {
          dist = tMaxZ;
          z += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          dist = tMaxY;
          y += stepY;
          tMaxY += tDeltaY;
          nx = 0; ny = -stepY; nz = 0;
        } else {
          dist = tMaxZ;
          z += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      }
    }
    return null;
  }

  private tryBreakBlockNow() {
    const hit = this.lastTargetHit;
    if (!hit) return;
    const [bx, by, bz] = hit.pos;
    const def = getBlockDef(hit.id);
    if (def.hardness < 0 && this.mode === 'survival') return;
    if (by <= 0 && this.mode === 'survival') return;

    this.world.setBlock(bx, by, bz, BlockId.AIR);
    this.waterLevelMap.delete(`${bx},${by},${bz}`);
    this.enqueuePhysicsAround(bx, by, bz);
    soundEngine.playBreak(def.sound);
    this.spawnBreakParticles(bx, by, bz, hit.id);

    if (
      hit.id === BlockId.COAL_ORE ||
      hit.id === BlockId.IRON_ORE ||
      hit.id === BlockId.GOLD_ORE ||
      hit.id === BlockId.DIAMOND_ORE ||
      hit.id === BlockId.EMERALD_ORE ||
      hit.id === BlockId.LAPIS_ORE ||
      hit.id === BlockId.REDSTONE_ORE
    ) {
      this.grantXP(0.25);
      const oreBonus =
        hit.id === BlockId.DIAMOND_ORE || hit.id === BlockId.EMERALD_ORE
          ? 35
          : hit.id === BlockId.GOLD_ORE
            ? 20
            : 12;
      this.coins += oreBonus;
      soundEngine.playCoin();
    } else if (this.mode === 'survival') {
      this.coins += 2;
    }

    if (this.mode === 'survival') {
      const dropId = def.dropId ?? hit.id;
      this.spawnDroppedItem(bx + 0.5, by + 0.4, bz + 0.5, dropId, def.dropCount ?? 1);
    }

    this.resetMiningState();
    this.emitHud(true);
  }

  private tryBreakInstantOrStep(dt: number) {
    const hit = this.lastTargetHit;
    if (!hit) {
      this.resetMiningState();
      return;
    }

    if (this.mode === 'creative') {
      this.tryBreakBlockNow();
      return;
    }

    const [bx, by, bz] = hit.pos;
    const def = getBlockDef(hit.id);
    if (def.hardness < 0 || by <= 0) {
      this.crackMesh.visible = false;
      return;
    }

    if (
      !this.miningPos ||
      this.miningPos[0] !== bx ||
      this.miningPos[1] !== by ||
      this.miningPos[2] !== bz
    ) {
      this.miningPos = [bx, by, bz];
      this.miningProgress = 0;
    }

    let speed = 1.0;
    const held = this.hotbar[this.selectedSlot];
    if (held) {
      const toolDef = getBlockDef(held.id);
      if (toolDef.preferredTool && toolDef.preferredTool === def.preferredTool && toolDef.miningSpeed) {
        speed = toolDef.miningSpeed;
      }
    }

    this.miningProgress += (dt * speed) / Math.max(0.08, def.hardness);
    this.swingTime = 0.16;

    this.digSoundTimer -= dt;
    if (this.digSoundTimer <= 0) {
      soundEngine.playDig(def.sound);
      this.digSoundTimer = 0.22;
    }

    const stage = Math.min(7, Math.floor(this.miningProgress * 8));
    this.crackMat.map = this.crackTextures[stage];
    this.crackMat.needsUpdate = true;
    this.crackMesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);
    this.crackMesh.visible = true;

    if (this.miningProgress >= 1.0) {
      this.tryBreakBlockNow();
    }
  }

  private getAirPlacementPos(): [number, number, number] {
    const origin = _v2;
    const dir = _v1;
    this.getAimRay(origin, dir);
    const px = Math.floor(origin.x + dir.x * 3.5);
    const py = Math.max(1, Math.min(CHUNK_HEIGHT - 1, Math.floor(origin.y + dir.y * 3.5)));
    const pz = Math.floor(origin.z + dir.z * 3.5);
    return [px, py, pz];
  }

  private handleRightClick() {
    const held = this.hotbar[this.selectedSlot];
    const hit = this.raycastVoxel(6.0);
    this.lastTargetHit = hit;

    // Eat food
    if (held && this.mode === 'survival') {
      const heldDef = getBlockDef(held.id);
      if (heldDef.foodRestore && this.hunger < 20) {
        this.hunger = Math.min(20, this.hunger + heldDef.foodRestore);
        this.health = Math.min(20, this.health + 2);
        held.count -= 1;
        if (held.count <= 0) this.hotbar[this.selectedSlot] = null;
        soundEngine.playPickup();
        this.updateViewModelBlock();
        this.emitHud(true);
        return;
      }
    }

    // Check if clicking directly on a nearby train/minecart to board/dismount
    const origin = _v2;
    const dir = _v1;
    this.getAimRay(origin, dir);
    for (const train of this.trains) {
      const tx = train.x - origin.x;
      const ty = train.y + 0.6 - origin.y;
      const tz = train.z - origin.z;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > 0.2 && dist < 5.5) {
        const dot = (tx * dir.x + ty * dir.y + tz * dir.z) / dist;
        if (dot > 0.9) {
          if (this.ridingTrain === train) {
            this.toggleRideTrain();
          } else {
            this.ridingTrain = train;
            this.isFlying = false;
            soundEngine.playTrainWhistle();
            this.callbacks.onSleepNotice?.("Poyezdga mindingiz! W/S — haydash, R — tushish");
            this.emitHud(true);
          }
          return;
        }
      }
    }

    // Interactive blocks when hitting a block
    if (hit) {
      const [bx, by, bz] = hit.pos;
      if (hit.id === BlockId.CRAFTING_TABLE) {
        if (document.pointerLockElement) document.exitPointerLock();
        this.callbacks.onOpenInventory(true);
        return;
      }
      if (hit.id === BlockId.OAK_DOOR_CLOSED || hit.id === BlockId.OAK_DOOR_OPEN) {
        this.toggleDoorAt(bx, by, bz, hit.id);
        return;
      }
      if (hit.id === BlockId.BED) {
        this.spawnPos.set(bx + 0.5, by + 1.1, bz + 0.5);
        this.timeOfDay = 0.28;
        this.health = Math.min(20, this.health + 4);
        soundEngine.playPickup();
        this.callbacks.onSleepNotice?.("Tong otdi! Qayta tirilish nuqtasi saqlandi.");
        this.emitHud(true);
        return;
      }
      if (hit.id === BlockId.TNT) {
        this.igniteTNT(bx, by, bz);
        return;
      }
    }

    if (!held || held.count <= 0) {
      this.callbacks.onSleepNotice?.("Blok qo'yish uchun 1–9 katakdan blok tanlang!");
      return;
    }

    const isWaterBucket = held.id === BlockId.WATER_BUCKET;
    const isLavaBucket = held.id === BlockId.LAVA_BUCKET;
    const isTrainItem = held.id === BlockId.TRAIN_ENGINE || held.id === BlockId.MINECART;
    const heldDef = getBlockDef(held.id);

    if (heldDef.isItemOnly && !isWaterBucket && !isLavaBucket && !isTrainItem) {
      this.callbacks.onSleepNotice?.(
        "Bu qurol/asbob. Blok qo'yish uchun 1–8 katakdan taxta, g'isht yoki rels tanlang!"
      );
      return;
    }

    // Determine placement voxel: on block face, replacing plants, OR in mid-air 3.5u ahead!
    let px: number;
    let py: number;
    let pz: number;
    if (hit) {
      const [bx, by, bz] = hit.pos;
      const hitDef = getBlockDef(hit.id);
      const replaceInPlace = !!hitDef.isPlant || (isTrainItem && !!hitDef.isRail);
      px = replaceInPlace ? bx : bx + hit.normal[0];
      py = replaceInPlace ? by : by + hit.normal[1];
      pz = replaceInPlace ? bz : bz + hit.normal[2];
    } else {
      [px, py, pz] = this.getAirPlacementPos();
    }

    if (py < 1 || py >= CHUNK_HEIGHT) return;

    // Spawn Train Engine or Minecart entity
    if (isTrainItem) {
      const kind = held.id === BlockId.TRAIN_ENGINE ? 'locomotive' : 'minecart';
      this.spawnTrainAt(kind, px + 0.5, py + 0.06, pz + 0.5, this.yaw + Math.PI);
      soundEngine.playTrainWhistle();
      this.swingTime = 0.22;
      if (this.mode === 'survival') {
        held.count -= 1;
        if (held.count <= 0) {
          this.hotbar[this.selectedSlot] = null;
          this.updateViewModelBlock();
        }
      }
      this.callbacks.onSleepNotice?.("Poyezd qo'yildi! R tugmasi bilan mining.");
      this.emitHud(true);
      return;
    }

    const placeBlockId = isWaterBucket
      ? BlockId.WATER
      : isLavaBucket
        ? BlockId.LAVA
        : held.id;
    const placeDef = getBlockDef(placeBlockId);

    // Avoid trapping player inside solid blocks directly overlapping head/chest
    if (placeDef.solid) {
      const minX = this.playerPos.x - 0.22;
      const maxX = this.playerPos.x + 0.22;
      const minY = this.playerPos.y + 0.12;
      const maxY = this.playerPos.y + 1.72;
      const minZ = this.playerPos.z - 0.22;
      const maxZ = this.playerPos.z + 0.22;
      if (
        px + 1 > minX && px < maxX &&
        py + 1 > minY && py < maxY &&
        pz + 1 > minZ && pz < maxZ
      ) {
        return;
      }
    }

    this.swingTime = 0.22;
    this.world.setBlock(px, py, pz, placeBlockId);
    if (placeBlockId === BlockId.WATER || placeBlockId === BlockId.LAVA) {
      this.waterLevelMap.set(`${px},${py},${pz}`, 0);
    } else {
      this.waterLevelMap.delete(`${px},${py},${pz}`);
    }
    this.enqueuePhysicsAround(px, py, pz);
    soundEngine.playPlace(placeDef.sound);

    if (this.mode === 'survival' && !isWaterBucket && !isLavaBucket) {
      held.count -= 1;
      if (held.count <= 0) {
        this.hotbar[this.selectedSlot] = null;
        this.updateViewModelBlock();
      }
      this.emitHud(true);
    }
  }

  private igniteTNT(x: number, y: number, z: number) {
    this.world.setBlock(x, y, z, BlockId.AIR);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.scene.add(mesh);
    this.primedTNTs.push({ x, y, z, mesh, timer: 2.2 });
    soundEngine.playDig('grass');
  }

  public toggleDoorAt(bx: number, by: number, bz: number, currentId: BlockId): boolean {
    if (currentId !== BlockId.OAK_DOOR_CLOSED && currentId !== BlockId.OAK_DOOR_OPEN) return false;
    const opening = currentId === BlockId.OAK_DOOR_CLOSED;
    this.world.setBlock(bx, by, bz, opening ? BlockId.OAK_DOOR_OPEN : BlockId.OAK_DOOR_CLOSED);
    soundEngine.playDoor(opening);
    this.swingTime = 0.18;
    this.emitHud(true);
    return true;
  }

  public toggleTargetDoor(): boolean {
    const hit = this.raycastVoxel(6.0);
    if (hit && (hit.id === BlockId.OAK_DOOR_CLOSED || hit.id === BlockId.OAK_DOOR_OPEN)) {
      return this.toggleDoorAt(hit.pos[0], hit.pos[1], hit.pos[2], hit.id);
    }
    // Fallback: toggle closest door within 3 blocks of player
    const px = Math.floor(this.playerPos.x);
    const py = Math.floor(this.playerPos.y);
    const pz = Math.floor(this.playerPos.z);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const bid = this.world.getBlock(px + dx, py + dy, pz + dz);
          if (bid === BlockId.OAK_DOOR_CLOSED || bid === BlockId.OAK_DOOR_OPEN) {
            return this.toggleDoorAt(px + dx, py + dy, pz + dz, bid);
          }
        }
      }
    }
    return false;
  }

  private explodeTNT(tnt: PrimedTNT) {
    this.scene.remove(tnt.mesh);
    tnt.mesh.geometry.dispose();
    (tnt.mesh.material as THREE.Material).dispose();
    soundEngine.playExplode();

    const cx = tnt.x + 0.5;
    const cy = tnt.y + 0.5;
    const cz = tnt.z + 0.5;

    const r = 3;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz <= r * r + 1) {
            const bx = tnt.x + dx;
            const by = tnt.y + dy;
            const bz = tnt.z + dz;
            if (by <= 0) continue;
            const bid = this.world.getBlock(bx, by, bz);
            if (bid !== BlockId.AIR && bid !== BlockId.BEDROCK) {
              if (bid === BlockId.TNT) {
                this.igniteTNT(bx, by, bz);
              } else {
                this.world.setBlock(bx, by, bz, BlockId.AIR);
                this.waterLevelMap.delete(`${bx},${by},${bz}`);
                this.enqueuePhysicsAround(bx, by, bz);
                if (Math.random() < 0.35) this.spawnBreakParticles(bx, by, bz, bid);
              }
            }
          }
        }
      }
    }

    // Physical blast impulse on mobs, dropped items, trains, and player
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const dx = m.x - cx;
      const dy = m.y + 0.5 - cy;
      const dz = m.z - cz;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 6.5) {
        const power = (1 - dist / 6.5) * 14;
        const inv = 1 / Math.max(0.3, dist);
        m.vx += dx * inv * power;
        m.vy = Math.max(m.vy, 5 + power * 0.5);
        m.vz += dz * inv * power;
        m.hp -= Math.round(power * 1.4);
        m.hurtTimer = 0.3;
        if (m.hp <= 0) {
          this.scene.remove(m.group);
          this.mobs.splice(i, 1);
          this.coins += m.hostile ? 35 : 15;
        }
      }
    }
    for (const d of this.drops) {
      const dx = d.mesh.position.x - cx;
      const dy = d.mesh.position.y - cy;
      const dz = d.mesh.position.z - cz;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 6.0) {
        const inv = 1 / Math.max(0.3, dist);
        const power = (1 - dist / 6.0) * 10;
        d.vx += dx * inv * power;
        d.vy = Math.max(d.vy, 5.5);
        d.vz += dz * inv * power;
      }
    }
    const pdx = this.playerPos.x - cx;
    const pdz = this.playerPos.z - cz;
    const pdist = Math.hypot(pdx, this.playerPos.y - cy, pdz);
    if (pdist < 6.5 && !this.isFlying) {
      const inv = 1 / Math.max(0.4, pdist);
      const force = (1 - pdist / 6.5);
      this.applyDamage(Math.max(2, Math.round(force * 12)), pdx * inv * 3.5, pdz * inv * 3.5);
    }
  }

  private spawnBreakParticles(bx: number, by: number, bz: number, id: BlockId) {
    const colorMap: Partial<Record<BlockId, number>> = {
      [BlockId.GRASS]: 0x5c9b38,
      [BlockId.DIRT]: 0x7a5436,
      [BlockId.STONE]: 0x808285,
      [BlockId.COBBLESTONE]: 0x727275,
      [BlockId.OAK_LOG]: 0x6b4c2d,
      [BlockId.OAK_PLANKS]: 0xad844f,
      [BlockId.OAK_LEAVES]: 0x417c2a,
      [BlockId.SAND]: 0xdfd39a,
      [BlockId.TNT]: 0xd1332a,
    };
    const mat = new THREE.MeshStandardMaterial({ color: colorMap[id] ?? 0x9ca3af, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.set(
        bx + 0.2 + Math.random() * 0.6,
        by + 0.2 + Math.random() * 0.6,
        bz + 0.2 + Math.random() * 0.6
      );
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 3.8,
        vy: 1.5 + Math.random() * 3.0,
        vz: (Math.random() - 0.5) * 3.8,
        life: 0.55 + Math.random() * 0.25,
      });
    }
  }

  private spawnDroppedItem(
    x: number,
    y: number,
    z: number,
    id: BlockId,
    count: number,
    vx = (Math.random() - 0.5) * 2.2,
    vy = 2.8,
    vz = (Math.random() - 0.5) * 2.2
  ) {
    const def = getBlockDef(id);
    const geo = this.dropGeo.clone();
    const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
    this.setFaceUV(uvAttr, 0, def.tiles.side);
    this.setFaceUV(uvAttr, 1, def.tiles.side);
    this.setFaceUV(uvAttr, 2, def.tiles.top);
    this.setFaceUV(uvAttr, 3, def.tiles.bottom);
    this.setFaceUV(uvAttr, 4, def.tiles.front ?? def.tiles.side);
    this.setFaceUV(uvAttr, 5, def.tiles.side);
    const mat = new THREE.MeshStandardMaterial({
      map: this.atlasTex,
      roughness: 0.75,
      transparent: !!def.isItemOnly || !!def.cutout,
      alphaTest: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (def.isItemOnly) mesh.scale.set(0.9, 0.9, 0.2);
    this.scene.add(mesh);
    this.drops.push({ id, count, mesh, vx, vy, vz, age: 0 });
  }

  public addItemToInventory(id: BlockId, count: number): boolean {
    let rem = count;
    for (let i = 0; i < 9 && rem > 0; i++) {
      const s = this.hotbar[i];
      if (s && s.id === id && s.count < 64) {
        const take = Math.min(64 - s.count, rem);
        s.count += take;
        rem -= take;
      }
    }
    for (let i = 0; i < 27 && rem > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id && s.count < 64) {
        const take = Math.min(64 - s.count, rem);
        s.count += take;
        rem -= take;
      }
    }
    for (let i = 0; i < 9 && rem > 0; i++) {
      if (!this.hotbar[i]) {
        const take = Math.min(64, rem);
        this.hotbar[i] = { id, count: take };
        rem -= take;
      }
    }
    for (let i = 0; i < 27 && rem > 0; i++) {
      if (!this.inventory[i]) {
        const take = Math.min(64, rem);
        this.inventory[i] = { id, count: take };
        rem -= take;
      }
    }
    this.updateViewModelBlock();
    this.emitHud(true);
    return rem < count;
  }

  private updateChunksAroundPlayer(buildAllImmediate = false) {
    const pcx = Math.floor(this.playerPos.x / CHUNK_SIZE);
    const pcz = Math.floor(this.playerPos.z / CHUNK_SIZE);
    const rad = this.renderDistance;

    for (const [key, cv] of this.chunkVisuals.entries()) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > rad + 1 || Math.abs(cz - pcz) > rad + 1) {
        this.disposeChunkVisual(cv);
        this.chunkVisuals.delete(key);
      }
    }

    let builtThisFrame = 0;
    for (let r = 0; r <= rad; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = pcx + dx;
          const cz = pcz + dz;
          const key = chunkKey(cx, cz);
          const chunk = this.world.generateChunk(cx, cz);
          const existing = this.chunkVisuals.get(key);

          if (!existing || chunk.dirty) {
            if (!buildAllImmediate && builtThisFrame >= 2 && existing === undefined) continue;
            const meshes = buildChunkMesh(this.world, chunk);
            if (existing) this.disposeChunkVisual(existing);

            const group = new THREE.Group();
            group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
            const cv: ChunkVisual = { group };

            if (meshes.opaque) {
              const m = new THREE.Mesh(meshes.opaque, this.opaqueMat);
              m.castShadow = !this.isSoftwareGl;
              m.receiveShadow = true;
              group.add(m);
              cv.opaque = m;
            }
            if (meshes.cutout) {
              const m = new THREE.Mesh(meshes.cutout, this.cutoutMat);
              m.castShadow = !this.isSoftwareGl;
              m.receiveShadow = true;
              group.add(m);
              cv.cutout = m;
            }
            if (meshes.water) {
              const m = new THREE.Mesh(meshes.water, this.waterMat);
              m.renderOrder = 2;
              group.add(m);
              cv.water = m;
            }

            this.scene.add(group);
            this.chunkVisuals.set(key, cv);
            builtThisFrame++;
          }
        }
      }
    }
  }

  private collidesAt(px: number, py: number, pz: number): boolean {
    const hw = 0.28;
    const h = 1.76;
    const minX = Math.floor(px - hw);
    const maxX = Math.floor(px + hw);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + h);
    const minZ = Math.floor(pz - hw);
    const maxZ = Math.floor(pz + hw);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private updatePhysics(dt: number) {
    if (this.playerHurtCooldown > 0) this.playerHurtCooldown -= dt;

    const prevInWater = this.inWater;
    const feetBlock = this.world.getBlock(this.playerPos.x, this.playerPos.y + 0.1, this.playerPos.z);
    const headBlock = this.world.getBlock(this.playerPos.x, this.playerPos.y + 1.55, this.playerPos.z);
    this.inWater = feetBlock === BlockId.WATER;
    this.headInWater = headBlock === BlockId.WATER;
    const inLava = feetBlock === BlockId.LAVA || headBlock === BlockId.LAVA;

    if (inLava && this.mode === 'survival' && !this.ridingTrain) {
      this.lavaBurnTimer += dt;
      if (this.lavaBurnTimer >= 0.55) {
        this.lavaBurnTimer = 0;
        this.applyDamage(4);
      }
    } else {
      this.lavaBurnTimer = 0.4;
    }

    if (!prevInWater && this.inWater && this.playerVel.y < -2.2) {
      soundEngine.playSplash();
      this.spawnSplashParticles(this.playerPos.x, this.playerPos.y + 0.25, this.playerPos.z);
    }

    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.4);
    if (this.damageTilt !== 0) this.damageTilt = THREE.MathUtils.damp(this.damageTilt, 0, 12, dt);

    if (this.ridingTrain) {
      // Locked onto riding train — W/S drives train, Space dismounts
      if (this.keys.has('Space')) {
        this.keys.delete('Space');
        this.toggleRideTrain();
      } else {
        this.playerPos.set(this.ridingTrain.x, this.ridingTrain.y + 0.58, this.ridingTrain.z);
        this.playerVel.set(0, 0, 0);
        this.onGround = true;
        this.fallStartY = null;
      }
    }

    const sneaking = !this.ridingTrain && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.isFlying;
    const touchSprint = Math.hypot(this.touchMove.x, this.touchMove.y) > 0.88;
    const sprinting =
      ((this.keys.has('ControlLeft') || touchSprint) &&
        !sneaking &&
        !this.inWater);

    let forward = 0;
    let strafe = 0;
    if (!this.ridingTrain) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;

      forward += this.touchMove.y;
      strafe += this.touchMove.x;
    }

    const len = Math.hypot(forward, strafe);
    if (len > 1) {
      forward /= len;
      strafe /= len;
    }

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const moveX = -sin * forward + cos * strafe;
    const moveZ = -cos * forward - sin * strafe;

    let speed = this.isFlying ? 13.5 : sneaking ? 2.1 : sprinting ? 6.4 : 4.4;
    if (this.inWater && !this.isFlying) speed *= 0.6;

    const targetFov = sprinting && len > 0.1 ? 82 : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 10, dt);
      this.camera.updateProjectionMatrix();
    }

    const onLadder = feetBlock === BlockId.LADDER || headBlock === BlockId.LADDER;
    let waterPushX = 0;
    let waterPushZ = 0;
    if (this.inWater && !this.isFlying) {
      const fx = Math.floor(this.playerPos.x);
      const fy = Math.floor(this.playerPos.y + 0.1);
      const fz = Math.floor(this.playerPos.z);
      const hereLvl = this.waterLevelMap.get(`${fx},${fy},${fz}`) ?? 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.world.getBlock(fx + dx, fy, fz + dz) === BlockId.WATER) {
          const nbLvl = this.waterLevelMap.get(`${fx + dx},${fy},${fz + dz}`) ?? 0;
          if (nbLvl > hereLvl) {
            waterPushX += dx * 2.1;
            waterPushZ += dz * 2.1;
          }
        }
      }
    }

    this.playerVel.x = moveX * speed + waterPushX;
    this.playerVel.z = moveZ * speed + waterPushZ;

    if (this.isFlying) {
      let vy = 0;
      if (this.keys.has('Space') || this.flyVerticalDir === 1) vy += 9.5;
      if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.flyVerticalDir === -1) vy -= 9.5;
      if (this.playerPos.y > 170 && vy > 0) vy = 0;
      this.playerVel.y = vy;
      this.fallStartY = null;
    } else if (onLadder) {
      if (this.keys.has('Space') || forward > 0.2) this.playerVel.y = 4.8;
      else if (sneaking) this.playerVel.y = 0;
      else if (forward < -0.2) this.playerVel.y = -3.8;
      else this.playerVel.y = -1.1;
      this.fallStartY = null;
    } else if (this.inWater) {
      this.playerVel.y -= 9.5 * dt;
      if (this.keys.has('Space')) this.playerVel.y = 4.2;
      this.playerVel.y = THREE.MathUtils.clamp(this.playerVel.y, -4.5, 4.8);
      this.fallStartY = null;
    } else {
      this.playerVel.y -= 25.0 * dt;
      if (this.keys.has('Space') && this.onGround) {
        this.playerVel.y = 8.4;
        this.onGround = false;
      }
    }

    if (!this.ridingTrain) {
      let hitWall = false;

      // Move X
      const nextX = this.playerPos.x + this.playerVel.x * dt;
      if (!this.collidesAt(nextX, this.playerPos.y, this.playerPos.z)) {
        if (
          !sneaking ||
          !this.onGround ||
          this.collidesAt(nextX, this.playerPos.y - 0.15, this.playerPos.z)
        ) {
          this.playerPos.x = nextX;
        }
      } else if (Math.abs(this.playerVel.x) > 0.1) {
        hitWall = true;
      }

      // Move Z
      const nextZ = this.playerPos.z + this.playerVel.z * dt;
      if (!this.collidesAt(this.playerPos.x, this.playerPos.y, nextZ)) {
        if (
          !sneaking ||
          !this.onGround ||
          this.collidesAt(this.playerPos.x, this.playerPos.y - 0.15, nextZ)
        ) {
          this.playerPos.z = nextZ;
        }
      } else if (Math.abs(this.playerVel.z) > 0.1) {
        hitWall = true;
      }

      // Bedrock-style Auto-Jump on mobile touch controls when hitting a 1-block step!
      if (
        this.touchControlsActive &&
        hitWall &&
        this.onGround &&
        !this.isFlying &&
        !sneaking &&
        !this.collidesAt(nextX, this.playerPos.y + 1.05, nextZ)
      ) {
        this.playerVel.y = 8.1;
        this.onGround = false;
      }

      // Move Y
      const nextY = this.playerPos.y + this.playerVel.y * dt;
      if (!this.collidesAt(this.playerPos.x, nextY, this.playerPos.z)) {
        if (this.playerVel.y < 0 && this.fallStartY === null && !this.isFlying && !this.inWater) {
          this.fallStartY = this.playerPos.y;
        }
        this.playerPos.y = nextY;
        this.onGround = false;
      } else {
        if (this.playerVel.y < 0) {
          if (this.mode === 'survival' && this.fallStartY !== null) {
            const fallDist = this.fallStartY - this.playerPos.y;
            if (fallDist > 3.6) {
              this.applyDamage(Math.floor(fallDist - 3));
            }
          }
          this.fallStartY = null;
          this.onGround = true;
        }
        this.playerVel.y = 0;
      }

      if (this.playerPos.y < -10) {
        this.playerPos.y = this.world.findSafeSpawnY(this.playerPos.x, this.playerPos.z) + 1;
        this.playerVel.y = 0;
      }
    }

    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if ((this.onGround || this.inWater) && horizSpeed > 0.5) {
      this.walkBob += dt * horizSpeed * 2.4;
      this.stepAccum += dt * horizSpeed;
      if (this.stepAccum > 1.75) {
        this.stepAccum = 0;
        const under = this.world.getBlock(this.playerPos.x, this.playerPos.y - 0.2, this.playerPos.z);
        soundEngine.playStep(this.inWater ? 'water' : getBlockDef(under).sound);
      }
    }

    if (this.mode === 'survival') {
      if (this.headInWater) {
        this.airTimer += dt;
        if (this.airTimer >= 1.2) {
          this.airTimer = 0;
          if (this.air > 0) this.air -= 1;
          else this.applyDamage(2);
        }
      } else {
        this.air = 10;
        this.airTimer = 0;
      }

      this.hungerTimer += dt * (sprinting ? 2.2 : 0.6);
      if (this.hungerTimer >= 28) {
        this.hungerTimer = 0;
        if (this.hunger > 0) this.hunger -= 1;
        else if (this.health > 2) this.applyDamage(1);
      }
      if (this.hunger >= 18 && this.health < 20 && Math.random() < dt * 0.25) {
        this.health = Math.min(20, this.health + 1);
      }
    }

    // Update Steve 3rd-person avatar & camera perspective with realistic head-bob & damage tilt
    const eyeOffset = sneaking ? 1.42 : 1.62;
    const bobOffsetY = this.onGround && horizSpeed > 0.6 && this.cameraPerspective === 0 ? Math.abs(Math.sin(this.walkBob * 0.5)) * 0.045 : 0;
    const eyeX = this.playerPos.x;
    const eyeY = this.playerPos.y + eyeOffset + bobOffsetY;
    const eyeZ = this.playerPos.z;

    this.steveGroup.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.steveGroup.rotation.y = this.yaw;
    this.steveHead.rotation.x = this.pitch;
    const legSwing = horizSpeed > 0.4 ? Math.sin(this.walkBob) * 0.65 : 0;
    this.steveLegs[0].rotation.x = legSwing;
    this.steveLegs[1].rotation.x = -legSwing;
    const swingArm = this.swingTime > 0 ? -Math.sin((this.swingTime / 0.22) * Math.PI) * 1.1 : -legSwing;
    this.steveArms[0].rotation.x = legSwing;
    this.steveArms[1].rotation.x = swingArm;

    if (this.cameraPerspective === 0) {
      this.steveGroup.visible = false;
      this.viewModelGroup.visible = true;
      this.camera.position.set(eyeX, eyeY, eyeZ);
      this.camera.rotation.set(this.pitch, this.yaw, this.damageTilt, 'YXZ');
    } else {
      this.steveGroup.visible = true;
      this.viewModelGroup.visible = false;
      const dirSign = this.cameraPerspective === 1 ? 1 : -1;
      const dist = 3.6;
      const cp = Math.cos(this.pitch);
      const sp = Math.sin(this.pitch);
      const camX = eyeX + Math.sin(this.yaw) * cp * dist * dirSign;
      const camY = eyeY - sp * dist * dirSign + 0.35;
      const camZ = eyeZ + Math.cos(this.yaw) * cp * dist * dirSign;
      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(eyeX, eyeY, eyeZ);
    }

    this.torchLight.position.set(eyeX, eyeY, eyeZ);
  }

  private applyDamage(amount: number, knockX = 0, knockZ = 0) {
    if (this.mode !== 'survival' || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 1.0;
    this.damageTilt = (Math.random() > 0.5 ? 1 : -1) * 0.14;
    soundEngine.playPlayerHurt();

    if (knockX !== 0 || knockZ !== 0) {
      const pushX = this.playerPos.x + knockX * 0.45;
      if (!this.collidesAt(pushX, this.playerPos.y, this.playerPos.z)) this.playerPos.x = pushX;
      const pushZ = this.playerPos.z + knockZ * 0.45;
      if (!this.collidesAt(this.playerPos.x, this.playerPos.y, pushZ)) this.playerPos.z = pushZ;
      this.playerVel.y = Math.max(this.playerVel.y, 4.2);
    }

    if (this.health <= 0) {
      this.health = 20;
      this.hunger = 20;
      this.air = 10;
      if (this.immortal) {
        // Endless life totem revival right on the spot — adventure never ends!
        soundEngine.playCoin();
        this.spawnBreakParticles(
          Math.floor(this.playerPos.x),
          Math.floor(this.playerPos.y + 1),
          Math.floor(this.playerPos.z),
          BlockId.GOLD_BLOCK
        );
        this.callbacks.onSleepNotice?.("Abadiy Hayot: Qayta tiklandingiz!");
      } else {
        const sy = this.world.findSafeSpawnY(this.spawnPos.x, this.spawnPos.z);
        this.playerPos.set(this.spawnPos.x, sy + 0.5, this.spawnPos.z);
        this.playerVel.set(0, 0, 0);
        this.callbacks.onSleepNotice?.("Qayta tirildingiz!");
      }
    }
    this.emitHud(true);
  }

  private spawnSplashParticles(px: number, py: number, pz: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.35, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.set(px + (Math.random() - 0.5) * 0.6, py, pz + (Math.random() - 0.5) * 0.6);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 3.4,
        vy: 1.8 + Math.random() * 2.8,
        vz: (Math.random() - 0.5) * 3.4,
        life: 0.45 + Math.random() * 0.2,
      });
    }
  }

  private enqueuePhysicsAround(x: number, y: number, z: number) {
    const offsets: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [dx, dy, dz] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (ny < 1 || ny >= CHUNK_HEIGHT) continue;
      const key = `${nx},${ny},${nz}`;
      if (!this.physicsQueuedKeys.has(key)) {
        this.physicsQueuedKeys.add(key);
        this.physicsQueue.push([nx, ny, nz]);
      }
    }
  }

  private stepBlockPhysics(dt: number) {
    if (this.physicsQueue.length === 0) return;
    this.physicsTickAccum += dt;
    if (this.physicsTickAccum < 0.16) return;
    this.physicsTickAccum = 0;

    let processed = 0;
    while (this.physicsQueue.length > 0 && processed < 48) {
      const [x, y, z] = this.physicsQueue.shift()!;
      const key = `${x},${y},${z}`;
      this.physicsQueuedKeys.delete(key);
      processed++;

      const id = this.world.getBlock(x, y, z);

      // 1. Falling gravity blocks (Sand, Gravel & Anvil)
      if ((id === BlockId.SAND || id === BlockId.GRAVEL || id === BlockId.ANVIL) && y > 1) {
        const below = this.world.getBlock(x, y - 1, z);
        if (
          below === BlockId.AIR ||
          below === BlockId.WATER ||
          below === BlockId.LAVA ||
          getBlockDef(below).isPlant
        ) {
          if (getBlockDef(below).isPlant) {
            const pDef = getBlockDef(below);
            this.spawnDroppedItem(x + 0.5, y - 0.5, z + 0.5, pDef.dropId ?? below, 1);
          }
          this.world.setBlock(x, y, z, BlockId.AIR);
          this.world.setBlock(x, y - 1, z, id);
          if (id === BlockId.ANVIL && this.world.isSolidAt(x, y - 2, z)) {
            soundEngine.playPlace('stone');
          }
          this.enqueuePhysicsAround(x, y, z);
          this.enqueuePhysicsAround(x, y - 1, z);
        }
        continue;
      }

      // 1b. Fragile blocks & rails pop cleanly when support beneath is removed
      const isFragile =
        id === BlockId.TORCH ||
        id === BlockId.RAIL ||
        id === BlockId.POWERED_RAIL ||
        getBlockDef(id).isPlant;
      if (isFragile && y > 1) {
        const below = this.world.getBlock(x, y - 1, z);
        if (!getBlockDef(below).solid) {
          const def = getBlockDef(id);
          this.world.setBlock(x, y, z, BlockId.AIR);
          this.spawnDroppedItem(x + 0.5, y + 0.35, z + 0.5, def.dropId ?? id, 1);
          this.enqueuePhysicsAround(x, y, z);
          continue;
        }
      }

      // 2. Real Water & Lava Flow (downward + horizontal finite spread + obsidian/cobble mix)
      if (id === BlockId.WATER || id === BlockId.LAVA) {
        const isLava = id === BlockId.LAVA;
        const maxSpread = isLava ? 3 : 5;
        const level = this.waterLevelMap.get(key) ?? 0;
        const below = y > 1 ? this.world.getBlock(x, y - 1, z) : BlockId.BEDROCK;
        const belowIsFragile =
          below === BlockId.TORCH ||
          below === BlockId.RAIL ||
          below === BlockId.POWERED_RAIL ||
          getBlockDef(below).isPlant;
        const belowIsPassable = below === BlockId.AIR || belowIsFragile;

        if (y > 1 && belowIsPassable) {
          if (belowIsFragile && !isLava) {
            const bDef = getBlockDef(below);
            this.spawnDroppedItem(x + 0.5, y - 0.5, z + 0.5, bDef.dropId ?? below, 1);
          }
          this.world.setBlock(x, y - 1, z, id);
          this.waterLevelMap.set(`${x},${y - 1},${z}`, 1);
          this.enqueuePhysicsAround(x, y - 1, z);
          if (level > 0) continue;
        }

        const belowIsSameLiquid = below === id;
        if (level < maxSpread && !belowIsPassable && (!belowIsSameLiquid || level === 0)) {
          const nextLevel = level + 1;
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx;
            const nz = z + dz;
            const nb = this.world.getBlock(nx, y, nz);
            const nbFragile =
              nb === BlockId.TORCH ||
              nb === BlockId.RAIL ||
              nb === BlockId.POWERED_RAIL ||
              getBlockDef(nb).isPlant;
            if (isLava && nb === BlockId.WATER) {
              this.world.setBlock(nx, y, nz, BlockId.COBBLESTONE);
              this.waterLevelMap.delete(`${nx},${y},${nz}`);
            } else if (!isLava && nb === BlockId.LAVA) {
              this.world.setBlock(nx, y, nz, BlockId.OBSIDIAN);
              this.waterLevelMap.delete(`${nx},${y},${nz}`);
            } else if (nb === BlockId.AIR || nbFragile) {
              if (nbFragile && !isLava) {
                const nDef = getBlockDef(nb);
                this.spawnDroppedItem(nx + 0.5, y + 0.35, nz + 0.5, nDef.dropId ?? nb, 1);
              }
              this.world.setBlock(nx, y, nz, id);
              this.waterLevelMap.set(`${nx},${y},${nz}`, nextLevel);
              this.enqueuePhysicsAround(nx, y, nz);
            }
          }
        }
      }
    }
  }

  private stepAutoBuildHouse(dt: number) {
    if (this.buildQueue.length === 0) {
      this.builderHighlightMesh.visible = false;
      return;
    }

    this.buildStepTimer += dt;
    while (this.buildQueue.length > 0 && this.buildStepTimer >= 0.032) {
      this.buildStepTimer -= 0.032;
      const step = this.buildQueue.shift()!;
      this.world.setBlock(step.x, step.y, step.z, step.id);

      if (step.id === BlockId.WATER || step.id === BlockId.LAVA) {
        this.waterLevelMap.set(`${step.x},${step.y},${step.z}`, 0);
      }

      if (step.id !== BlockId.AIR) {
        this.builderHighlightMesh.position.set(step.x + 0.5, step.y + 0.5, step.z + 0.5);
        this.builderHighlightMesh.visible = true;
        const def = getBlockDef(step.id);
        soundEngine.playPlace(def.sound);
        if (Math.random() < 0.35) {
          this.spawnBreakParticles(step.x, step.y, step.z, step.id);
        }
      }
    }

    if (this.buildQueue.length === 0) {
      this.builderHighlightMesh.visible = false;
      const finishedName = this.activeBuildName || "Inshoot";
      this.buildTotal = 0;
      this.activeBuildName = null;
      this.callbacks.onSleepNotice?.(`${finishedName} qurib bitkazildi!`);
      this.emitHud(true);
    }
  }

  private getRailSurfaceInfo(
    x: number,
    y: number,
    z: number
  ): { onRail: boolean; surfaceY: number; gradX: number; gradZ: number } {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const isRail = (rx: number, ry: number, rz: number) => {
      const id = this.world.getBlock(rx, ry, rz);
      return id === BlockId.RAIL || id === BlockId.POWERED_RAIL;
    };
    if (!isRail(ix, iy, iz)) {
      return { onRail: false, surfaceY: iy, gradX: 0, gradZ: 0 };
    }
    const fx = x - ix;
    const fz = z - iz;
    if (isRail(ix, iy + 1, iz + 1)) return { onRail: true, surfaceY: iy + 0.06 + fz, gradX: 0, gradZ: 1 };
    if (isRail(ix, iy + 1, iz - 1)) return { onRail: true, surfaceY: iy + 0.06 + (1 - fz), gradX: 0, gradZ: -1 };
    if (isRail(ix + 1, iy + 1, iz)) return { onRail: true, surfaceY: iy + 0.06 + fx, gradX: 1, gradZ: 0 };
    if (isRail(ix - 1, iy + 1, iz)) return { onRail: true, surfaceY: iy + 0.06 + (1 - fx), gradX: -1, gradZ: 0 };
    return { onRail: true, surfaceY: iy + 0.06, gradX: 0, gradZ: 0 };
  }

  private updateTrains(dt: number) {
    const primaryLoco = this.trains.find((t) => t.kind === 'locomotive');

    for (const train of this.trains) {
      const ix = Math.floor(train.x);
      const iy = Math.floor(train.y);
      const iz = Math.floor(train.z);
      const curRail = this.world.getBlock(ix, iy, iz);
      const onRail = curRail === BlockId.RAIL || curRail === BlockId.POWERED_RAIL;
      const onPowered = curRail === BlockId.POWERED_RAIL;

      if (this.ridingTrain === train) {
        let drive = 0;
        let steer = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) drive += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) drive -= 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer += 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer -= 1;
        drive += this.touchMove.y;
        steer -= this.touchMove.x;

        const maxSpeed = onPowered ? 13.5 : onRail ? 9.5 : 4.5;
        if (Math.abs(drive) > 0.05) {
          train.speed = THREE.MathUtils.clamp(train.speed + drive * 14 * dt, -maxSpeed * 0.6, maxSpeed);
        } else {
          train.speed *= Math.pow(0.18, dt);
        }

        if (!onRail && Math.abs(steer) > 0.05) {
          train.yaw += steer * 2.1 * dt;
        }
      } else {
        // Minecart coupling: follow nearby locomotive smoothly on track
        if (
          train.kind === 'minecart' &&
          primaryLoco &&
          primaryLoco !== train &&
          Math.abs(primaryLoco.speed) > 0.5
        ) {
          const dLoco = Math.hypot(primaryLoco.x - train.x, primaryLoco.z - train.z);
          if (dLoco > 1.55 && dLoco < 4.5) {
            train.speed = THREE.MathUtils.lerp(train.speed, primaryLoco.speed, Math.min(1, dt * 8));
          }
        }
        if (onPowered) {
          const targetCruise = train.speed >= 0 ? 4.8 : -4.8;
          train.speed = THREE.MathUtils.lerp(train.speed, targetCruise, Math.min(1, dt * 6));
        } else if (train.kind === 'locomotive' && onRail && Math.abs(train.speed) > 0.4) {
          // Gentle rail inertia on locomotive
          train.speed *= Math.pow(0.92, dt);
        } else {
          train.speed *= Math.pow(0.32, dt);
        }
      }

      // Snap/align along connected rails & climb/descend 1-block slopes
      if (onRail) {
        const fwdX = Math.sin(train.yaw);
        const fwdZ = Math.cos(train.yaw);
        const sign = train.speed >= 0 ? 1 : -1;
        let bestScore = -2;
        let bestDx = 0;
        let bestDz = 0;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          for (const dy of [0, 1, -1]) {
            const nb = this.world.getBlock(ix + dx, iy + dy, iz + dz);
            if (nb === BlockId.RAIL || nb === BlockId.POWERED_RAIL) {
              const score = dx * fwdX * sign + dz * fwdZ * sign;
              if (score > bestScore) {
                bestScore = score;
                bestDx = dx;
                bestDz = dz;
              }
            }
          }
        }
        if (bestScore > -0.25) {
          const targetYaw = Math.atan2(bestDx * sign, bestDz * sign);
          const diff = Math.atan2(Math.sin(targetYaw - train.yaw), Math.cos(targetYaw - train.yaw));
          train.yaw += diff * Math.min(1, dt * 12);
          if (bestDx !== 0 && bestDz === 0) {
            train.z = THREE.MathUtils.lerp(train.z, iz + 0.5, Math.min(1, dt * 10));
          } else if (bestDz !== 0 && bestDx === 0) {
            train.x = THREE.MathUtils.lerp(train.x, ix + 0.5, Math.min(1, dt * 10));
          }
        } else if (Math.abs(train.speed) > 0.4) {
          if (this.ridingTrain !== train) train.speed = -train.speed;
        }
      }

      if (Math.abs(train.speed) > 0.04) {
        const nx = train.x + Math.sin(train.yaw) * train.speed * dt;
        const nz = train.z + Math.cos(train.yaw) * train.speed * dt;
        const checkId = this.world.getBlock(nx, train.y + 0.55, nz);
        if (!getBlockDef(checkId).solid || getBlockDef(checkId).isRail) {
          train.x = nx;
          train.z = nz;
        } else {
          train.speed = this.ridingTrain === train ? 0 : -train.speed;
        }

        for (const w of train.wheels) {
          w.rotation.x += train.speed * dt * 2.6;
        }

        if (train.kind === 'locomotive') {
          train.steamTimer += dt * (1 + Math.abs(train.speed) * 0.4);
          if (train.steamTimer >= 0.25) {
            train.steamTimer = 0;
            this.spawnBreakParticles(
              Math.floor(train.x + Math.sin(train.yaw) * 0.55),
              Math.floor(train.y + 1.5),
              Math.floor(train.z + Math.cos(train.yaw) * 0.55),
              BlockId.WHITE_CONCRETE
            );
          }
          train.chugTimer -= dt * (1 + Math.abs(train.speed) * 0.25);
          if (train.chugTimer <= 0 && this.ridingTrain === train) {
            train.chugTimer = 0.42;
            soundEngine.playTrainChug();
          }
        }

        if (Math.abs(train.speed) > 3.5) {
          for (const mob of this.mobs) {
            const md = Math.hypot(mob.x - train.x, mob.z - train.z);
            if (md < 1.25 && Math.abs(mob.y - train.y) < 1.5) {
              mob.hp -= 5;
              mob.hurtTimer = 0.25;
              mob.vy = 5.5;
              soundEngine.playMobHurt();
            }
          }
        }
      }

      // Vertical & 45-degree sloped rail tracking
      const baseFloorY = Math.floor(train.y);
      let railInfo = this.getRailSurfaceInfo(train.x, baseFloorY, train.z);
      if (!railInfo.onRail) {
        const upInfo = this.getRailSurfaceInfo(train.x, baseFloorY + 1, train.z);
        const dnInfo = this.getRailSurfaceInfo(train.x, baseFloorY - 1, train.z);
        if (upInfo.onRail) railInfo = upInfo;
        else if (dnInfo.onRail) railInfo = dnInfo;
      }

      let targetPitch = 0;
      if (railInfo.onRail) {
        train.y = THREE.MathUtils.lerp(train.y, railInfo.surfaceY, Math.min(1, dt * 18));
        const slopeAlongHeading =
          railInfo.gradX * Math.sin(train.yaw) + railInfo.gradZ * Math.cos(train.yaw);
        targetPitch = -Math.atan(slopeAlongHeading);
      } else if (this.world.isSolidAt(train.x, train.y - 0.08, train.z)) {
        train.y = Math.floor(train.y - 0.08) + 1.02;
      } else {
        train.y -= 10 * dt;
      }

      train.group.position.set(train.x, train.y, train.z);
      train.group.rotation.y = train.yaw;
      train.group.rotation.x = THREE.MathUtils.lerp(train.group.rotation.x, targetPitch, Math.min(1, dt * 10));
    }
  }

  private updateEntities(dt: number) {
    this.stepBlockPhysics(dt);
    this.stepAutoBuildHouse(dt);
    this.updateTrains(dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 4;
      p.mesh.rotation.y += dt * 3;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.mesh.rotation.y += dt * 2.2;

      const curBlock = this.world.getBlock(d.mesh.position.x, d.mesh.position.y, d.mesh.position.z);
      if (curBlock === BlockId.LAVA) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.drops.splice(i, 1);
        continue;
      }

      // Horizontal velocity with friction & wall collision
      if (Math.abs(d.vx) > 0.02 || Math.abs(d.vz) > 0.02) {
        const nx = d.mesh.position.x + d.vx * dt;
        const nz = d.mesh.position.z + d.vz * dt;
        if (!this.world.isSolidAt(nx, d.mesh.position.y, d.mesh.position.z)) d.mesh.position.x = nx;
        else d.vx = 0;
        if (!this.world.isSolidAt(d.mesh.position.x, d.mesh.position.y, nz)) d.mesh.position.z = nz;
        else d.vz = 0;
        const drag = Math.pow(0.05, dt);
        d.vx *= drag;
        d.vz *= drag;
      }

      const inWater = curBlock === BlockId.WATER;
      const underSolid = this.world.isSolidAt(d.mesh.position.x, d.mesh.position.y - 0.24, d.mesh.position.z);
      if (inWater) {
        // Float gently upward and bob on water surface
        d.vy = THREE.MathUtils.clamp(d.vy + 18 * dt, -2, 2.2);
        d.mesh.position.y += d.vy * dt;
      } else if (!underSolid) {
        d.vy -= 14 * dt;
        d.mesh.position.y += d.vy * dt;
      } else {
        if (d.vy < -2) d.vy = -d.vy * 0.25;
        else d.vy = 0;
        d.mesh.position.y += Math.sin(d.age * 3.5) * 0.0018;
      }

      const distSq = d.mesh.position.distanceToSquared(
        _v2.set(this.playerPos.x, this.playerPos.y + 0.9, this.playerPos.z)
      );
      if (d.age > 0.35 && distSq < 5.0) {
        d.mesh.position.lerp(_v2, Math.min(1, dt * 10));
        if (distSq < 0.7) {
          if (this.addItemToInventory(d.id, d.count)) {
            soundEngine.playPickup();
            this.scene.remove(d.mesh);
            d.mesh.geometry.dispose();
            (d.mesh.material as THREE.Material).dispose();
            this.drops.splice(i, 1);
          }
        }
      }
    }

    for (let i = this.primedTNTs.length - 1; i >= 0; i--) {
      const t = this.primedTNTs[i];
      t.timer -= dt;
      const blink = Math.floor(t.timer * 10) % 2 === 0;
      (t.mesh.material as THREE.MeshBasicMaterial).color.setHex(blink ? 0xffffff : 0xef4444);
      const s = 1 + Math.sin(t.timer * 18) * 0.04;
      t.mesh.scale.set(s, s, s);
      if (t.timer <= 0) {
        this.primedTNTs.splice(i, 1);
        this.explodeTNT(t);
      }
    }

    // Evening & Night Zombie Attack Waves (realistic Minecraft behavior)
    const sunAngle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const isNight = sunY < 0.08;
    const isBrightMorning = sunY > 0.16;

    if (isNight && !this.wasNightAttackActive) {
      this.wasNightAttackActive = true;
      this.callbacks.onSleepNotice?.("Kech tushdi! Zombilar hujumga chiqmoqda!");
    } else if (!isNight && this.wasNightAttackActive) {
      this.wasNightAttackActive = false;
    }

    this.zombieCheckTimer += dt;
    if (this.zombieCheckTimer > 3.2) {
      this.zombieCheckTimer = 0;
      if (isNight) {
        const zCount = this.mobs.filter((m) => m.hostile).length;
        if (zCount < 7) {
          const spawnWave = zCount === 0 ? 2 : 1;
          for (let w = 0; w < spawnWave; w++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 11 + Math.random() * 11;
            const zx = Math.floor(this.playerPos.x + Math.cos(ang) * dist);
            const zz = Math.floor(this.playerPos.z + Math.sin(ang) * dist);
            const zy = this.world.findSafeSpawnY(zx, zz);
            if (zy > WATER_LEVEL) {
              this.mobs.push(this.createMob('zombie', zx + 0.5, zy, zz + 0.5));
            }
          }
        }
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      if (mob.hurtTimer > 0) mob.hurtTimer -= dt;
      if (mob.attackCooldown > 0) mob.attackCooldown -= dt;
      if (mob.attackAnim > 0) mob.attackAnim = Math.max(0, mob.attackAnim - dt);
      mob.group.scale.setScalar(mob.hurtTimer > 0 ? 1.09 : 1.0);

      // Daylight zombie combustion (1:1 Minecraft realism!)
      if (mob.hostile && isBrightMorning) {
        mob.onFire = true;
        mob.fireTimer += dt;
        if (Math.random() < dt * 8) {
          this.spawnBreakParticles(Math.floor(mob.x), Math.floor(mob.y + 1.2), Math.floor(mob.z), BlockId.TORCH);
        }
        if (mob.fireTimer >= 0.85) {
          mob.fireTimer = 0;
          mob.hp -= 3;
          mob.hurtTimer = 0.2;
          soundEngine.playMobHurt();
          if (mob.hp <= 0) {
            this.scene.remove(mob.group);
            this.mobs.splice(i, 1);
            this.grantXP(0.25);
            continue;
          }
        }
      } else {
        mob.onFire = false;
      }

      if (mob.hostile) {
        const dx = this.playerPos.x - mob.x;
        const dz = this.playerPos.z - mob.z;
        const d = Math.hypot(dx, dz);

        // Zombie eerie groans as they approach
        mob.groanTimer -= dt;
        if (mob.groanTimer <= 0) {
          mob.groanTimer = 4.5 + Math.random() * 6.5;
          if (d < 22) {
            soundEngine.playZombieGroan();
          }
        }

        const targetYaw = Math.atan2(dx, dz);
        mob.yaw = targetYaw;
        mob.moving = d < 32 && d > 1.05;

        // Zombie melee attack lunge + knockback
        const dy = Math.abs(this.playerPos.y - mob.y);
        if (d < 1.55 && dy < 1.8 && mob.attackCooldown <= 0) {
          mob.attackCooldown = 1.15;
          mob.attackAnim = 0.28;
          if (this.mode === 'survival' && this.playerHurtCooldown <= 0) {
            this.playerHurtCooldown = 0.65;
            const nx = d > 0.01 ? dx / d : 0;
            const nz = d > 0.01 ? dz / d : 0;
            this.applyDamage(3, nx, nz);
          } else {
            soundEngine.playZombieGroan();
          }
        }
      } else {
        mob.moveTimer -= dt;
        if (mob.moveTimer <= 0) {
          mob.moveTimer = 1.5 + Math.random() * 3.5;
          mob.moving = Math.random() > 0.35;
          mob.yaw += (Math.random() - 0.5) * 2.4;
        }
      }

      // Apply knockback horizontal velocity decay
      if (Math.abs(mob.vx) > 0.05 || Math.abs(mob.vz) > 0.05) {
        const kx = mob.x + mob.vx * dt;
        const kz = mob.z + mob.vz * dt;
        if (!this.world.isSolidAt(kx, mob.y + 0.2, mob.z)) mob.x = kx;
        if (!this.world.isSolidAt(mob.x, mob.y + 0.2, kz)) mob.z = kz;
        mob.vx *= Math.pow(0.02, dt);
        mob.vz *= Math.pow(0.02, dt);
      }

      if (mob.moving) {
        const speed = mob.hostile ? 2.55 : 1.35;
        let moveYaw = mob.yaw;
        let nx = mob.x + Math.sin(moveYaw) * speed * dt;
        let nz = mob.z + Math.cos(moveYaw) * speed * dt;
        const blocked = this.world.isSolidAt(nx, mob.y + 0.25, nz);
        if (blocked) {
          const stepClear = !this.world.isSolidAt(nx, mob.y + 1.25, nz) && !this.world.isSolidAt(nx, mob.y + 2.0, nz);
          if (stepClear && Math.abs(mob.vy) < 0.2) {
            mob.vy = 6.6;
          } else if (mob.hostile) {
            // Smart wall-sidestep so zombies navigate around trees/walls instead of getting stuck
            const sideSign = ((i % 2) === 0 ? 1 : -1);
            moveYaw = mob.yaw + sideSign * 1.15;
            nx = mob.x + Math.sin(moveYaw) * speed * dt;
            nz = mob.z + Math.cos(moveYaw) * speed * dt;
            if (!this.world.isSolidAt(nx, mob.y + 0.25, nz)) {
              mob.x = nx;
              mob.z = nz;
            }
          } else {
            mob.yaw += Math.PI * 0.75;
          }
        } else {
          mob.x = nx;
          mob.z = nz;
        }
        mob.walkPhase += dt * (mob.hostile ? 8.5 : 7);
      } else {
        mob.walkPhase = 0;
      }

      // Swimming buoyancy for mobs in water
      const mobInWater = this.world.getBlock(mob.x, mob.y + 0.2, mob.z) === BlockId.WATER;
      if (mobInWater) {
        mob.vy = Math.min(3.5, mob.vy + 14 * dt);
      } else {
        mob.vy -= 22 * dt;
      }
      const ny = mob.y + mob.vy * dt;
      if (this.world.isSolidAt(mob.x, ny, mob.z)) {
        mob.vy = 0;
        mob.y = Math.floor(ny) + 1;
      } else {
        mob.y = ny;
      }

      mob.group.position.set(mob.x, mob.y, mob.z);
      mob.group.rotation.y = mob.yaw;
      const swing = Math.sin(mob.walkPhase) * 0.52;
      if (mob.legs.length >= 4) {
        mob.legs[0].rotation.x = swing;
        mob.legs[1].rotation.x = -swing;
        mob.legs[2].rotation.x = -swing;
        mob.legs[3].rotation.x = swing;
      } else if (mob.legs.length === 2) {
        mob.legs[0].rotation.x = swing;
        mob.legs[1].rotation.x = -swing;
      }
      if (mob.hostile && mob.arms.length === 2) {
        const lunge = mob.attackAnim > 0 ? Math.sin((mob.attackAnim / 0.28) * Math.PI) * 0.95 : 0;
        const sway = Math.sin(mob.walkPhase * 0.7) * 0.14;
        mob.arms[0].rotation.x = -1.35 - lunge + sway;
        mob.arms[1].rotation.x = -1.35 - lunge - sway;
      }
    }
  }

  private updateSkyAndLighting(dt: number) {
    if (!this.timePaused && !this.paused) {
      this.timeOfDay = (this.timeOfDay + dt * 0.0022) % 1;
    }

    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(angle);
    const sunX = Math.cos(angle);

    this.skyGroup.position.copy(this.camera.position);
    this.sunMesh.position.set(sunX * 120, sunY * 120, -25);
    this.sunMesh.lookAt(this.camera.position);
    this.moonMesh.position.set(-sunX * 120, -sunY * 120, 25);
    this.moonMesh.lookAt(this.camera.position);

    this.sunLight.position.set(
      this.camera.position.x + sunX * 55,
      this.camera.position.y + Math.max(12, sunY * 65),
      this.camera.position.z - 20
    );
    this.sunLight.target.position.copy(this.camera.position);
    this.sunLight.target.updateMatrixWorld();

    if (sunY > 0.2) {
      _c1.copy(_dayColor);
    } else if (sunY > -0.15) {
      const t = (sunY + 0.15) / 0.35;
      _c1.copy(_sunsetColor).lerp(_dayColor, t);
    } else {
      const t = THREE.MathUtils.clamp((sunY + 0.35) / 0.2, 0, 1);
      _c1.copy(_nightColor).lerp(_sunsetColor, t);
    }

    const dayIntensity = THREE.MathUtils.clamp(sunY * 1.4 + 0.35, 0.15, 1.0);
    this.sunLight.intensity = dayIntensity * 1.4;
    this.hemiLight.intensity = 0.3 + dayIntensity * 0.6;
    (this.starsMesh.material as THREE.PointsMaterial).opacity = THREE.MathUtils.clamp(-sunY * 2.5, 0, 0.9);

    // Subtle water shimmer
    this.waterMat.opacity = 0.72 + Math.sin(performance.now() * 0.0028) * 0.04;

    if (this.headInWater) {
      _c2.copy(_waterFogColor);
      this.scene.background = _c2;
      (this.scene.fog as THREE.Fog).color.copy(_c2);
      (this.scene.fog as THREE.Fog).near = 2;
      (this.scene.fog as THREE.Fog).far = 20;
    } else {
      this.scene.background = _c1;
      (this.scene.fog as THREE.Fog).color.copy(_c1);
      const altitudeBoost = this.playerPos.y > 46 ? (this.playerPos.y - 46) * 1.8 : 0;
      const maxFog = this.renderDistance * CHUNK_SIZE + altitudeBoost;
      (this.scene.fog as THREE.Fog).near = maxFog * 0.45;
      (this.scene.fog as THREE.Fog).far = maxFog * 1.15;
    }

    // Pooled flickering warm lights for nearby placed Torches & Glowstone
    this.torchScanTimer += dt;
    if (this.torchScanTimer > 0.35) {
      this.torchScanTimer = 0;
      const found: { distSq: number; pos: [number, number, number] }[] = [];
      const px = Math.floor(this.playerPos.x);
      const py = Math.floor(this.playerPos.y);
      const pz = Math.floor(this.playerPos.z);
      for (let dy = -4; dy <= 5; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          for (let dz = -8; dz <= 8; dz++) {
            const bid = this.world.getBlock(px + dx, py + dy, pz + dz);
            if (bid === BlockId.TORCH || bid === BlockId.GLOWSTONE) {
              found.push({
                distSq: dx * dx + dy * dy + dz * dz,
                pos: [px + dx + 0.5, py + dy + 0.65, pz + dz + 0.5],
              });
            }
          }
        }
      }
      found.sort((a, b) => a.distSq - b.distSq);
      this.nearbyTorches = found.slice(0, 3).map((f) => f.pos);
    }

    const flickerBase = performance.now() * 0.008;
    for (let i = 0; i < this.worldTorchLights.length; i++) {
      const tl = this.worldTorchLights[i];
      if (i < this.nearbyTorches.length) {
        const [tx, ty, tz] = this.nearbyTorches[i];
        tl.position.set(tx, ty, tz);
        tl.intensity = 2.2 + Math.sin(flickerBase + i * 2.1) * 0.3;
      } else {
        tl.intensity = 0;
      }
    }

    for (const c of this.cloudGroup.children) {
      c.position.x += dt * 0.65;
      if (c.position.x > this.camera.position.x + 90) {
        c.position.x -= 180;
      }
    }
  }

  private emitHud(force = false) {
    if (!force && this.hudEmitAccum < 0.08) return;
    this.hudEmitAccum = 0;

    const dirs = ['Janub (+Z)', "G'arb (-X)", 'Shimol (-Z)', 'Sharq (+X)'];
    const normYaw = ((-this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const dirIdx = Math.round(normYaw / (Math.PI / 2)) % 4;
    const biomeMap: Record<string, string> = {
      plains: 'Tekislik',
      forest: "O'rmon",
      desert: 'Sahro',
      mountains: "Tog'lar",
    };
    const biome = biomeMap[this.world.getBiomeAt(this.playerPos.x, this.playerPos.z)] || 'Tekislik';

    const buildProgress =
      this.buildTotal > 0 ? 1 - this.buildQueue.length / this.buildTotal : 0;
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const isNight = Math.sin(angle) < 0.08;
    const nearbyZombies = this.mobs.filter((m) => m.hostile).length;
    const nearTrain = this.trains.some(
      (t) => Math.hypot(t.x - this.playerPos.x, t.y - this.playerPos.y, t.z - this.playerPos.z) < 7.5
    );
    const targetIsDoor = !!(
      this.lastTargetHit &&
      (this.lastTargetHit.id === BlockId.OAK_DOOR_CLOSED ||
        this.lastTargetHit.id === BlockId.OAK_DOOR_OPEN)
    );

    this.callbacks.onHudUpdate({
      fps: this.currentFps,
      x: this.playerPos.x,
      y: this.playerPos.y,
      z: this.playerPos.z,
      yaw: this.yaw,
      biome,
      facing: dirs[dirIdx],
      health: this.health,
      hunger: this.hunger,
      air: this.air,
      xpLevel: this.xpLevel,
      xpProgress: this.xpProgress,
      coins: this.coins,
      unlockedCount: this.unlockedStructures.size,
      inWater: this.headInWater,
      isFlying: this.isFlying,
      placeMode: this.placeMode,
      immortal: this.immortal,
      planetCurvature: this.planetCurvature,
      targetIsDoor,
      ridingTrain: !!this.ridingTrain,
      nearTrain,
      isBuildingHouse: this.buildQueue.length > 0,
      activeBuildName: this.activeBuildName,
      buildProgress,
      isNight,
      nearbyZombies,
      hurtFlash: this.hurtFlash,
      mode: this.mode,
      cameraPerspective: this.cameraPerspective,
      targetBlockName: this.lastTargetHit ? getBlockDef(this.lastTargetHit.id).name : null,
      miningProgress: this.miningProgress,
      timeOfDay: this.timeOfDay,
      hotbar: this.hotbar.map((s) => (s ? { ...s } : null)),
      selectedSlot: this.selectedSlot,
      pointerLocked: this.pointerLocked,
    });
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(0.05, this.clock.getDelta());

      this.fpsFrames++;
      this.fpsAccum += dt;
      if (this.fpsAccum >= 0.5) {
        this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
        this.fpsFrames = 0;
        this.fpsAccum = 0;
      }

      if (this.menuPanorama) {
        this.panoramaAngle += dt * 0.14;
        const rad = 18;
        const px = this.playerPos.x + Math.cos(this.panoramaAngle) * rad;
        const pz = this.playerPos.z + Math.sin(this.panoramaAngle) * rad;
        this.camera.position.set(px, this.playerPos.y + 10, pz);
        this.camera.lookAt(this.playerPos.x, this.playerPos.y + 1, this.playerPos.z);
        this.viewModelGroup.visible = false;
        this.steveGroup.visible = false;
        this.highlightBox.visible = false;
        this.airPreviewBox.visible = false;
        this.updateSkyAndLighting(dt);
      } else if (!this.paused) {
        this.updatePhysics(dt);
        this.updateChunksAroundPlayer(false);
        this.updateEntities(dt);
        this.updateSkyAndLighting(dt);

        this.lastTargetHit = this.raycastVoxel(6.0);
        if (this.lastTargetHit) {
          const isDoor =
            this.lastTargetHit.id === BlockId.OAK_DOOR_CLOSED ||
            this.lastTargetHit.id === BlockId.OAK_DOOR_OPEN;
          this.highlightBox.scale.set(1, isDoor ? 2 : 1, 1);
          this.highlightBox.position.set(
            this.lastTargetHit.pos[0] + 0.5,
            this.lastTargetHit.pos[1] + (isDoor ? 1.0 : 0.5),
            this.lastTargetHit.pos[2] + 0.5
          );
          this.highlightBox.visible = true;
          this.airPreviewBox.visible = false;
        } else {
          this.highlightBox.visible = false;
          const held = this.hotbar[this.selectedSlot];
          const canAirPlace =
            held &&
            held.count > 0 &&
            (!getBlockDef(held.id).isItemOnly ||
              held.id === BlockId.WATER_BUCKET ||
              held.id === BlockId.LAVA_BUCKET ||
              held.id === BlockId.TRAIN_ENGINE ||
              held.id === BlockId.MINECART);
          if (canAirPlace) {
            const [ax, ay, az] = this.getAirPlacementPos();
            this.airPreviewBox.position.set(ax + 0.5, ay + 0.5, az + 0.5);
            this.airPreviewBox.visible = true;
          } else {
            this.airPreviewBox.visible = false;
          }
        }

        // Long-press touch mining (Minecraft PE style)
        if (
          this.activeTouchId !== null &&
          this.touchMovedDist < 12 &&
          performance.now() - this.touchStartTime > 260
        ) {
          this.touchHoldingMine = true;
        }

        if ((this.leftMouseDown && !this.placeMode && !this.mouseDownDoorPos) || this.touchHoldingMine) {
          this.tryBreakInstantOrStep(dt);
        }

        if (this.swingTime > 0) this.swingTime = Math.max(0, this.swingTime - dt);
        const swingAngle = Math.sin((this.swingTime / 0.22) * Math.PI) * 0.85;
        this.viewModelGroup.position.set(
          Math.sin(this.walkBob * 0.5) * 0.025,
          Math.abs(Math.cos(this.walkBob * 0.5)) * -0.025 - swingAngle * 0.08,
          -swingAngle * 0.12
        );
        this.viewModelGroup.rotation.set(-swingAngle * 0.85, swingAngle * 0.2, 0);

        this.hudEmitAccum += dt;
        this.emitHud(false);
      } else {
        this.updateSkyAndLighting(dt * 0.2);
      }

      this.planetUniforms.uPlanetCam.value.copy(this.camera.position);
      this.planetUniforms.uCurvature.value = this.planetCurvature ? 0.0024 : 0.0;
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.clearWorldVisuals();
    this.envMap.dispose();
    this.opaqueMat.dispose();
    this.cutoutMat.dispose();
    this.waterMat.dispose();
    this.crackMat.dispose();
    this.crackTextures.forEach((t) => t.dispose());
    this.particleGeo.dispose();
    this.dropGeo.dispose();
    this.highlightBox.geometry.dispose();
    (this.highlightBox.material as THREE.Material).dispose();
    (this.airPreviewBox.material as THREE.Material).dispose();
    (this.builderHighlightMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
