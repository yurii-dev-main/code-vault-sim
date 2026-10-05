import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsManager } from '../physics/PhysicsManager.ts';
import { AudioManager } from '../audio/AudioManager.ts';

export type LidState = 'CLOSED' | 'UNSCREWING' | 'FLYING' | 'ON_FLOOR';

export class Jar {
  public group: THREE.Group;
  public jarMesh!: THREE.Mesh;
  public lidMesh!: THREE.Group;
  public lidCapMesh!: THREE.Mesh;

  private physics: PhysicsManager;
  private audio?: AudioManager;
  private jarBody!: RAPIER.RigidBody;
  private lidBody: RAPIER.RigidBody | null = null;
  private closedLidHoleBlocker: RAPIER.Collider | null = null;

  public lidState: LidState = 'CLOSED';
  private unscrewProgress = 0;
  private unscrewDuration = 0.75;
  private lidInitialY = 3.32;
  private lidTargetY = 3.82;
  private lidHitFloorPlayed = false;

  // Collision dimensions
  public readonly jarInsideRadius = 1.15;
  public readonly jarNeckRadius = 0.90;
  public readonly jarNeckTopY = 3.36;

  constructor(scene: THREE.Scene, physics: PhysicsManager, audio?: AudioManager) {
    this.physics = physics;
    this.audio = audio;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.createJarVisual();
    this.createJarPhysics();
    this.createLidVisual();
  }

  private createJarVisual(): void {
    // Lathe profile for realistic crystal glass jar with thickness
    const points: THREE.Vector2[] = [
      new THREE.Vector2(0, 0.05),
      new THREE.Vector2(1.22, 0.05),
      new THREE.Vector2(1.25, 0.12),
      new THREE.Vector2(1.25, 2.35),
      new THREE.Vector2(1.10, 2.65),
      new THREE.Vector2(0.96, 2.85),
      new THREE.Vector2(0.96, 3.28),
      new THREE.Vector2(1.03, 3.30),
      new THREE.Vector2(1.03, 3.36), // Outer top lip
      // Inner rim downwards
      new THREE.Vector2(0.88, 3.36), // Inner top lip
      new THREE.Vector2(0.88, 2.85),
      new THREE.Vector2(1.02, 2.65),
      new THREE.Vector2(1.15, 2.35),
      new THREE.Vector2(1.15, 0.15),
      new THREE.Vector2(0, 0.15)
    ];

    const latheGeo = new THREE.LatheGeometry(points, 48);
    latheGeo.computeVertexNormals();

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.03,
      metalness: 0.02,
      ior: 1.52,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.jarMesh = new THREE.Mesh(latheGeo, glassMat);
    this.jarMesh.castShadow = true;
    this.jarMesh.receiveShadow = true;
    this.jarMesh.userData = { isJar: true };
    this.group.add(this.jarMesh);
  }

  private createJarPhysics(): void {
    const bodyDesc = this.physics.RAPIER.RigidBodyDesc.fixed();
    this.jarBody = this.physics.world.createRigidBody(bodyDesc);

    // 1. Bottom disc collider
    const bottomCollider = this.physics.RAPIER.ColliderDesc.cylinder(0.1, 1.22)
      .setTranslation(0, 0.08, 0)
      .setFriction(0.5)
      .setRestitution(0.15);
    this.physics.world.createCollider(bottomCollider, this.jarBody);

    // 2. Circular body wall segments (24 overlapping boxes)
    const segments = 24;
    const bodyRadius = 1.20;
    const wallHeight = 2.35;
    const segmentWidth = 2 * bodyRadius * Math.sin(Math.PI / segments) + 0.10;
    const wallThickness = 0.22;

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * bodyRadius;
      const z = Math.sin(angle) * bodyRadius;

      const wallCollider = this.physics.RAPIER.ColliderDesc.cuboid(
        wallThickness / 2,
        wallHeight / 2,
        segmentWidth / 2
      )
        .setTranslation(x, wallHeight / 2 + 0.10, z)
        .setRotation({
          x: 0,
          y: Math.sin(-angle / 2),
          z: 0,
          w: Math.cos(-angle / 2)
        })
        .setFriction(0.3)
        .setRestitution(0.15);

      this.physics.world.createCollider(wallCollider, this.jarBody);
    }

    // 3. Neck cylindrical wall segments covering full height from y = 2.40 to y = 3.36
    const neckRadius = 0.93;
    const neckTotalHeight = 0.96; // 2.40 to 3.36
    const neckSegmentWidth = 2 * neckRadius * Math.sin(Math.PI / segments) + 0.08;

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * neckRadius;
      const z = Math.sin(angle) * neckRadius;

      const neckCollider = this.physics.RAPIER.ColliderDesc.cuboid(
        wallThickness / 2,
        neckTotalHeight / 2,
        neckSegmentWidth / 2
      )
        .setTranslation(x, 2.40 + neckTotalHeight / 2, z) // Center at y = 2.88
        .setRotation({
          x: 0,
          y: Math.sin(-angle / 2),
          z: 0,
          w: Math.cos(-angle / 2)
        })
        .setFriction(0.3)
        .setRestitution(0.15);

      this.physics.world.createCollider(neckCollider, this.jarBody);
    }

    // 4. Physical Upper Lip / Rim Collar (the glass ridge where the lid sits: y = 3.26 to 3.38)
    // This collar stays permanently physical so the lid and coins can NEVER clip through the rim!
    const rimRadius = 1.01;
    const rimHeight = 0.12;
    const rimSegmentWidth = 2 * rimRadius * Math.sin(Math.PI / segments) + 0.08;

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * rimRadius;
      const z = Math.sin(angle) * rimRadius;

      const rimCollarCollider = this.physics.RAPIER.ColliderDesc.cuboid(
        0.14 / 2,
        rimHeight / 2,
        rimSegmentWidth / 2
      )
        .setTranslation(x, 3.26 + rimHeight / 2, z)
        .setRotation({
          x: 0,
          y: Math.sin(-angle / 2),
          z: 0,
          w: Math.cos(-angle / 2)
        })
        .setFriction(0.3)
        .setRestitution(0.2);

      this.physics.world.createCollider(rimCollarCollider, this.jarBody);
    }

    // 5. Closed lid opening blocker (covers the inside hole while lid is on)
    this.createClosedLidHoleBlocker();
  }

  private createClosedLidHoleBlocker(): void {
    if (this.closedLidHoleBlocker) return;
    const holeBlockerDesc = this.physics.RAPIER.ColliderDesc.cylinder(0.08, 0.88)
      .setTranslation(0, 3.34, 0)
      .setFriction(0.5)
      .setRestitution(0.2);
    this.closedLidHoleBlocker = this.physics.world.createCollider(holeBlockerDesc, this.jarBody);
  }

  private removeClosedLidHoleBlocker(): void {
    if (this.closedLidHoleBlocker) {
      this.physics.world.removeCollider(this.closedLidHoleBlocker, false);
      this.closedLidHoleBlocker = null;
    }
  }

  private createLidVisual(): void {
    this.lidMesh = new THREE.Group();

    // Refined premium lid: Brushed Titanium / Platinum with polished chamfered rim
    const capGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.22, 40);
    const lidMat = new THREE.MeshStandardMaterial({
      color: 0xdbe4eb, // Sleek brushed platinum/steel with silvery sheen
      metalness: 0.94,
      roughness: 0.20
    });
    this.lidCapMesh = new THREE.Mesh(capGeo, lidMat);
    this.lidCapMesh.castShadow = true;
    this.lidCapMesh.receiveShadow = true;
    this.lidCapMesh.userData = { isLid: true };
    this.lidMesh.add(this.lidCapMesh);

    // Polished chrome accent ring on top
    const rimGeo = new THREE.TorusGeometry(0.97, 0.035, 16, 40);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.08
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.11;
    rimMesh.userData = { isLid: true };
    this.lidMesh.add(rimMesh);

    // Knurled grip ring along the side perimeter
    const gripGeo = new THREE.TorusGeometry(1.048, 0.02, 16, 40);
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.35
    });
    const gripMesh = new THREE.Mesh(gripGeo, gripMat);
    gripMesh.rotation.x = Math.PI / 2;
    gripMesh.position.y = -0.04;
    gripMesh.userData = { isLid: true };
    this.lidMesh.add(gripMesh);

    this.lidMesh.position.set(0, this.lidInitialY, 0);
    this.group.add(this.lidMesh);
  }

  public isLidOpen(): boolean {
    return this.lidState !== 'CLOSED';
  }

  public triggerUnscrew(): void {
    if (this.lidState !== 'CLOSED') return;
    this.lidState = 'UNSCREWING';
    this.unscrewProgress = 0;
    this.lidHitFloorPlayed = false;
    this.audio?.playLidUnscrew();
    // Remove the hole blocker so coins can be pulled out through the top opening
    this.removeClosedLidHoleBlocker();
  }

  public update(delta: number): void {
    if (this.lidState === 'UNSCREWING') {
      this.unscrewProgress += delta / this.unscrewDuration;

      const t = Math.min(this.unscrewProgress, 1.0);
      const easeT = t * t * (3 - 2 * t);

      // Smooth unscrewing rotation and elevation well above the glass rim (up to y = 3.82)
      this.lidMesh.rotation.y = easeT * Math.PI * 4;
      this.lidMesh.position.y = THREE.MathUtils.lerp(this.lidInitialY, this.lidTargetY, easeT);

      if (t >= 1.0) {
        this.launchLidPhysics();
      }
    } else if (this.lidState === 'FLYING' && !this.lidHitFloorPlayed) {
      if (this.lidMesh.position.y <= 0.16) {
        this.lidHitFloorPlayed = true;
        this.lidState = 'ON_FLOOR';
        this.audio?.playLidHitFloor();
      }
    }
  }

  private launchLidPhysics(): void {
    this.lidState = 'FLYING';
    this.audio?.playLidPop();

    const bodyDesc = this.physics.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this.lidMesh.position.x, this.lidMesh.position.y, this.lidMesh.position.z)
      .setRotation(this.lidMesh.quaternion)
      .setCanSleep(true);

    this.lidBody = this.physics.world.createRigidBody(bodyDesc);
    this.lidBody.enableCcd(true);

    // Lid cylinder collider matching geometry
    const colliderDesc = this.physics.RAPIER.ColliderDesc.cylinder(0.11, 1.05)
      .setFriction(0.5)
      .setRestitution(0.3)
      .setDensity(1.8);
    this.physics.world.createCollider(colliderDesc, this.lidBody);

    // Launch impulse: upward and outward
    const throwImpulse = {
      x: 1.6 + (Math.random() - 0.5) * 0.6,
      y: 2.2,
      z: -1.4 + (Math.random() - 0.5) * 0.6
    };
    this.lidBody.applyImpulse(throwImpulse, true);

    const torqueImpulse = {
      x: 1.2,
      y: 1.8,
      z: 0.7
    };
    this.lidBody.applyTorqueImpulse(torqueImpulse, true);

    this.physics.registerSync(this.lidBody, this.lidMesh);
  }

  public resetLid(): void {
    if (this.lidBody) {
      this.physics.unregisterSync(this.lidBody);
      this.physics.world.removeRigidBody(this.lidBody);
      this.lidBody = null;
    }

    this.lidState = 'CLOSED';
    this.unscrewProgress = 0;
    this.lidHitFloorPlayed = false;
    this.lidMesh.position.set(0, this.lidInitialY, 0);
    this.lidMesh.rotation.set(0, 0, 0);
    this.createClosedLidHoleBlocker();
  }
}
