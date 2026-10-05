import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public floorMesh!: THREE.Mesh;

  private fogColor = 0x18181b;

  constructor(canvas: HTMLCanvasElement) {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.fogColor);
    this.scene.fog = new THREE.FogExp2(this.fogColor, 0.07);

    // 2. Camera setup
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 80);
    this.camera.position.set(0, 3.2, 5.6);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35; // Bright, vivid exposure

    // 4. Photorealistic Environment Map (RoomEnvironment via PMREM)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 5. OrbitControls setup
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, 1.6, 0);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.minDistance = 1.8;
    this.controls.maxDistance = 9.0;
    this.controls.enablePan = false;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: null
    };
    this.controls.update();

    // 6. Studio Lighting & Environment
    this.setupLighting();
    this.setupFloor();
    this.setupResizeListener();
  }

  private setupLighting(): void {
    // 1. Warm ambient & hemisphere light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfffaed, 0x18181b, 0.7);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    // 2. Key light: Main warm studio spotlight from top-right-front
    const keySpot = new THREE.SpotLight(0xfff8eb, 4.2);
    keySpot.position.set(3, 8.5, 4.5);
    keySpot.angle = Math.PI / 3.8;
    keySpot.penumbra = 0.6;
    keySpot.decay = 1.1;
    keySpot.distance = 30;
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.width = 1024;
    keySpot.shadow.mapSize.height = 1024;
    keySpot.shadow.bias = -0.0002;
    keySpot.shadow.camera.near = 1;
    keySpot.shadow.camera.far = 16;
    keySpot.target.position.set(0, 1.5, 0);
    this.scene.add(keySpot);
    this.scene.add(keySpot.target);

    // 3. Fill light: Soft cool directional light from left to balance contrast
    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 1.8);
    fillLight.position.set(-4, 5, 2.5);
    this.scene.add(fillLight);

    // 4. Rim / Back light: Highlights crystal glass edges and coin contours
    const rimLight = new THREE.DirectionalLight(0xfff7ed, 2.4);
    rimLight.position.set(0, 6, -5);
    this.scene.add(rimLight);

    // 5. Front subtle sparkle light for coin specular highlights
    const sparkleLight = new THREE.PointLight(0xfffae0, 1.5, 12, 1.2);
    sparkleLight.position.set(0, 3.5, 4);
    this.scene.add(sparkleLight);
  }

  private setupFloor(): void {
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({
      color: this.fogColor,
      roughness: 0.85,
      metalness: 0.15
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.y = 0;
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);
  }

  private setupResizeListener(): void {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    });
  }

  public update(): void {
    this.controls.update();
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
