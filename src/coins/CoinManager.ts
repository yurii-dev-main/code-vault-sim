import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsManager, PhysicsSyncItem } from '../physics/PhysicsManager.ts';
import { CoinData, DEFAULT_COINS } from '../types/coin.ts';

export interface InteractiveCoinItem {
  id: string;
  data: CoinData;
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  syncItem: PhysicsSyncItem;
}

function createCoinFaceTexture(value: 1 | 2): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const isGold = value === 2;
  const cx = 256;
  const cy = 256;
  const r = 244;

  // 1. Radial gradient metal base
  const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, r);
  if (isGold) {
    grad.addColorStop(0, '#fffbeb');   // Highlight
    grad.addColorStop(0.3, '#fde047');  // Bright yellow gold
    grad.addColorStop(0.65, '#eab308'); // Pure 24k gold
    grad.addColorStop(0.9, '#ca8a04');  // Deep gold
    grad.addColorStop(1, '#854d0e');    // Rim shadow
  } else {
    grad.addColorStop(0, '#ffffff');    // Highlight
    grad.addColorStop(0.35, '#f8fafc'); // Lustrous silver
    grad.addColorStop(0.75, '#cbd5e1'); // Silver grey
    grad.addColorStop(1, '#64748b');    // Rim shadow
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 2. Embossed concentric border rings
  ctx.lineWidth = 12;
  ctx.strokeStyle = isGold ? '#854d0e' : '#475569';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 6;
  ctx.strokeStyle = isGold ? '#fef08a' : '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 18, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Beaded coin rim (minted dots)
  const dotCount = 52;
  const dotRadius = r - 32;
  for (let i = 0; i < dotCount; i++) {
    const angle = (i / dotCount) * Math.PI * 2;
    const dx = cx + Math.cos(angle) * dotRadius;
    const dy = cy + Math.sin(angle) * dotRadius;

    ctx.fillStyle = isGold ? '#fef9c3' : '#ffffff';
    ctx.beginPath();
    ctx.arc(dx - 1, dy - 1, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isGold ? '#713f12' : '#334155';
    ctx.beginPath();
    ctx.arc(dx + 1, dy + 1, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Inner decorative thin ring
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = isGold ? 'rgba(161, 98, 7, 0.6)' : 'rgba(100, 116, 139, 0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, 180, 0, Math.PI * 2);
  ctx.stroke();

  // 5. Large Embossed Digit: "1" or "2"
  const digit = value.toString();
  ctx.font = 'bold 230px "Cinzel", "Georgia", "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Bottom-right deep bevel shadow
  ctx.fillStyle = isGold ? '#713f12' : '#1e293b';
  ctx.fillText(digit, cx + 5, cy + 5 - 18);

  // Top-left crisp highlight
  ctx.fillStyle = isGold ? '#ffffff' : '#ffffff';
  ctx.fillText(digit, cx - 4, cy - 4 - 18);

  // Main metallic face fill
  ctx.fillStyle = isGold ? '#fef08a' : '#f8fafc';
  ctx.fillText(digit, cx, cy - 18);

  // 6. Subtitle with stars
  ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const label = value === 1 ? '★ 1 БАЛ ★' : '★ 2 БАЛИ ★';

  ctx.fillStyle = isGold ? '#713f12' : '#1e293b';
  ctx.fillText(label, cx + 2, cy + 124);

  ctx.fillStyle = isGold ? '#fffbeb' : '#ffffff';
  ctx.fillText(label, cx, cy + 122);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export class CoinManager {
  private scene: THREE.Scene;
  private physics: PhysicsManager;

  public coinsData: CoinData[] = [];
  public interactiveCoins: InteractiveCoinItem[] = [];
  public interactiveMeshes: THREE.Mesh[] = [];

  // Instanced meshes for static filler layer when coins > 25
  private fillerMesh1: THREE.InstancedMesh | null = null;
  private fillerMesh2: THREE.InstancedMesh | null = null;
  private fillerMoundBody: RAPIER.RigidBody | null = null;

  // Shared geometries
  private geoCoin1: THREE.CylinderGeometry;
  private geoCoin2: THREE.CylinderGeometry;

  // Materials arrays: [sideMat, topMat, bottomMat]
  private materialsCoin1: THREE.Material[];
  private materialsCoin2: THREE.Material[];

  constructor(scene: THREE.Scene, physics: PhysicsManager) {
    this.scene = scene;
    this.physics = physics;

    // 1 pt coin: R = 0.35, H = 0.08
    this.geoCoin1 = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 28);
    // 2 pt coin: R = 0.50, H = 0.10
    this.geoCoin2 = new THREE.CylinderGeometry(0.50, 0.50, 0.10, 28);

    // Textures with embossed numbers "1" and "2"
    const tex1 = createCoinFaceTexture(1);
    const tex2 = createCoinFaceTexture(2);

    // 1 pt: Brilliant Silver Materials
    const matSide1 = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.96,
      roughness: 0.22
    });
    const matFace1 = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex1,
      metalness: 0.96,
      roughness: 0.16
    });
    this.materialsCoin1 = [matSide1, matFace1, matFace1];

    // 2 pt: Pure 24K Radiant Gold Materials
    const matSide2 = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.98,
      roughness: 0.20
    });
    const matFace2 = new THREE.MeshStandardMaterial({
      color: 0xffd700, // True radiant gold
      map: tex2,
      metalness: 0.98,
      roughness: 0.14
    });
    this.materialsCoin2 = [matSide2, matFace2, matFace2];
  }

  public async loadCoins(): Promise<CoinData[]> {
    try {
      const res = await fetch('/coins.json');
      if (!res.ok) throw new Error('Failed to fetch coins.json');
      const data: CoinData[] = await res.json();
      this.coinsData = Array.isArray(data) && data.length > 0 ? data : [...DEFAULT_COINS];
      return this.coinsData;
    } catch (err) {
      console.warn('Could not load /coins.json, using fallback data:', err);
      this.coinsData = [...DEFAULT_COINS];
      return this.coinsData;
    }
  }

  public spawnAllCoins(): void {
    this.clearAll();

    const totalCoins = this.coinsData.length;
    const maxPhysicsCoins = 20;

    let staticCount = 0;
    let dynamicStartIndex = 0;

    if (totalCoins > 25) {
      staticCount = totalCoins - maxPhysicsCoins;
      dynamicStartIndex = staticCount;
    }

    // 1. Static filler layer if needed
    if (staticCount > 0) {
      this.buildStaticFillerLayer(this.coinsData.slice(0, staticCount));
    }

    // 2. Dynamic physics layer
    const dynamicCoins = this.coinsData.slice(dynamicStartIndex);
    const startBaseY = staticCount > 0 ? 1.6 : 0.6;

    dynamicCoins.forEach((coin, idx) => {
      this.createDynamicCoin(coin, idx, startBaseY);
    });
  }

  private createDynamicCoin(coin: CoinData, index: number, baseSpawnY: number): void {
    const isTwo = coin.value === 2;
    const radius = isTwo ? 0.50 : 0.35;
    const height = isTwo ? 0.10 : 0.08;
    const geo = isTwo ? this.geoCoin2 : this.geoCoin1;
    const mats = isTwo ? this.materialsCoin2 : this.materialsCoin1;

    // Visual Mesh with materials array for side and faces
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      isCoin: true,
      coinId: coin.id,
      coinData: coin
    };

    // Staggered initial spawn position inside jar neck
    const spawnAngle = index * 2.399;
    const spawnR = (index % 4) * 0.11;
    const spawnX = Math.cos(spawnAngle) * spawnR;
    const spawnZ = Math.sin(spawnAngle) * spawnR;
    const spawnY = baseSpawnY + index * 0.22 + 0.1;

    // Slight natural tilt
    const rotX = (Math.random() - 0.5) * 0.35;
    const rotY = Math.random() * Math.PI * 2;
    const rotZ = (Math.random() - 0.5) * 0.35;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ));

    mesh.position.set(spawnX, spawnY, spawnZ);
    mesh.quaternion.copy(q);
    this.scene.add(mesh);

    // Dynamic Physics Body
    const bodyDesc = this.physics.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, spawnY, spawnZ)
      .setRotation(q)
      .setCanSleep(true)
      .setLinearDamping(0.35)
      .setAngularDamping(0.45);

    const body = this.physics.world.createRigidBody(bodyDesc);
    // Continuous Collision Detection (CCD) prevents any tunneling through glass
    body.enableCcd(true);

    const colliderDesc = this.physics.RAPIER.ColliderDesc.cylinder(height / 2, radius)
      .setFriction(0.4)
      .setRestitution(0.18)
      .setDensity(isTwo ? 2.5 : 2.0);

    this.physics.world.createCollider(colliderDesc, body);

    const syncItem = this.physics.registerSync(body, mesh);

    const item: InteractiveCoinItem = {
      id: coin.id,
      data: coin,
      mesh,
      body,
      syncItem
    };

    this.interactiveCoins.push(item);
    this.interactiveMeshes.push(mesh);
  }

  private buildStaticFillerLayer(fillerCoins: CoinData[]): void {
    const c1List = fillerCoins.filter(c => c.value === 1);
    const c2List = fillerCoins.filter(c => c.value === 2);

    const moundRadius = 1.05;
    const moundHeight = 1.25;

    const positionInstances = (
      mesh: THREE.InstancedMesh,
      coins: CoinData[],
      offsetIdx: number
    ) => {
      const dummy = new THREE.Object3D();
      coins.forEach((_coin, i) => {
        const totalIdx = offsetIdx + i;
        const normY = totalIdx / fillerCoins.length;
        const currentR = moundRadius * (1 - normY * 0.4);
        const theta = totalIdx * 2.399;
        const r = Math.sqrt(Math.random()) * currentR * 0.85;

        dummy.position.set(
          Math.cos(theta) * r,
          0.15 + normY * moundHeight + (Math.random() - 0.5) * 0.08,
          Math.sin(theta) * r
        );
        dummy.rotation.set(
          (Math.random() - 0.5) * 0.6,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.6
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { isStaticFiller: true };
    };

    if (c1List.length > 0) {
      this.fillerMesh1 = new THREE.InstancedMesh(this.geoCoin1, this.materialsCoin1[1], c1List.length);
      positionInstances(this.fillerMesh1, c1List, 0);
      this.scene.add(this.fillerMesh1);
    }

    if (c2List.length > 0) {
      this.fillerMesh2 = new THREE.InstancedMesh(this.geoCoin2, this.materialsCoin2[1], c2List.length);
      positionInstances(this.fillerMesh2, c2List, c1List.length);
      this.scene.add(this.fillerMesh2);
    }

    const moundDesc = this.physics.RAPIER.RigidBodyDesc.fixed();
    this.fillerMoundBody = this.physics.world.createRigidBody(moundDesc);

    const moundCollider = this.physics.RAPIER.ColliderDesc.cylinder(moundHeight / 2, moundRadius * 0.95)
      .setTranslation(0, moundHeight / 2 + 0.1, 0)
      .setFriction(0.6)
      .setRestitution(0.15);

    this.physics.world.createCollider(moundCollider, this.fillerMoundBody);
  }

  public getCoinByMesh(mesh: THREE.Object3D): InteractiveCoinItem | undefined {
    return this.interactiveCoins.find(item => item.mesh === mesh);
  }

  public getTotalPoints(): number {
    return this.coinsData.reduce((acc, c) => acc + c.value, 0);
  }

  public getTotalCount(): number {
    return this.coinsData.length;
  }

  public clearAll(): void {
    for (const item of this.interactiveCoins) {
      this.physics.unregisterSync(item.body);
      this.physics.world.removeRigidBody(item.body);
      this.scene.remove(item.mesh);
    }
    this.interactiveCoins = [];
    this.interactiveMeshes = [];

    if (this.fillerMesh1) {
      this.scene.remove(this.fillerMesh1);
      this.fillerMesh1.dispose();
      this.fillerMesh1 = null;
    }
    if (this.fillerMesh2) {
      this.scene.remove(this.fillerMesh2);
      this.fillerMesh2.dispose();
      this.fillerMesh2 = null;
    }
    if (this.fillerMoundBody) {
      this.physics.world.removeRigidBody(this.fillerMoundBody);
      this.fillerMoundBody = null;
    }
  }
}
