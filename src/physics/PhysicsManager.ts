import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export interface PhysicsSyncItem {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  isKinematicOverride?: boolean;
}

export class PhysicsManager {
  public RAPIER!: typeof RAPIER;
  public world!: RAPIER.World;
  private syncList: PhysicsSyncItem[] = [];
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;
    await RAPIER.init();
    this.RAPIER = RAPIER;
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this.isInitialized = true;

    // Create infinite static floor collider
    this.createFloorCollider();
  }

  private createFloorCollider(): void {
    // Large ground box collider at y = -0.5 with top at y = 0
    const groundDesc = this.RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0);
    const groundBody = this.world.createRigidBody(groundDesc);
    const groundCollider = this.RAPIER.ColliderDesc.cuboid(50, 0.5, 50)
      .setFriction(0.7)
      .setRestitution(0.2);
    this.world.createCollider(groundCollider, groundBody);
  }

  public registerSync(body: RAPIER.RigidBody, mesh: THREE.Object3D): PhysicsSyncItem {
    const item: PhysicsSyncItem = { body, mesh };
    this.syncList.push(item);
    return item;
  }

  public unregisterSync(body: RAPIER.RigidBody): void {
    const index = this.syncList.findIndex(item => item.body === body);
    if (index !== -1) {
      this.syncList.splice(index, 1);
    }
  }

  public clearSync(): void {
    this.syncList = [];
  }

  public step(_delta: number): void {
    if (!this.world) return;

    this.world.step();

    // Sync physics transforms to Three.js meshes
    for (let i = 0; i < this.syncList.length; i++) {
      const item = this.syncList[i];
      if (item.isKinematicOverride) continue;

      const body = item.body;
      if (!body.isSleeping() || body.bodyType() !== this.RAPIER.RigidBodyType.Dynamic) {
        const pos = body.translation();
        const rot = body.rotation();
        item.mesh.position.set(pos.x, pos.y, pos.z);
        item.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      }
    }
  }
}
