import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager.ts';
import { Jar } from '../jar/Jar.ts';
import { CoinManager, InteractiveCoinItem } from '../coins/CoinManager.ts';
import { CoinData } from '../types/coin.ts';
import { AudioManager } from '../audio/AudioManager.ts';

interface PositionSample {
  time: number;
  pos: THREE.Vector3;
}

interface TrackedLandingCoin {
  item: InteractiveCoinItem;
  lastVy: number;
  releasedTime: number;
  hasLanded: boolean;
}

export class InteractionManager {
  private sceneManager: SceneManager;
  private jar: Jar;
  private coinManager: CoinManager;
  private onInspectCoin: (coin: CoinData) => void;
  private audio?: AudioManager;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Dragging state with drag threshold
  public activeCoin: InteractiveCoinItem | null = null;
  private pendingCoin: InteractiveCoinItem | null = null;
  private dragStarted = false;
  private samples: PositionSample[] = [];
  private isPointerDown = false;
  private pointerDownPos = new THREE.Vector2();

  // Double tap / double click detection
  private lastTapTime = 0;
  private lastTapTargetCoinId: string | null = null;

  // Track landing sound for the coin released/thrown by user
  private trackedLandingCoin: TrackedLandingCoin | null = null;

  constructor(
    sceneManager: SceneManager,
    jar: Jar,
    coinManager: CoinManager,
    onInspectCoin: (coin: CoinData) => void,
    audio?: AudioManager
  ) {
    this.sceneManager = sceneManager;
    this.jar = jar;
    this.coinManager = coinManager;
    this.onInspectCoin = onInspectCoin;
    this.audio = audio;

    this.bindEvents();
  }

  private bindEvents(): void {
    const dom = this.sceneManager.renderer.domElement;

    // Prevent any browser HTML5 drag-and-drop or tab-drag gestures
    window.addEventListener('dragstart', (e) => e.preventDefault());
    dom.addEventListener('dragstart', (e) => e.preventDefault());

    // Completely block browser context menu on right-click
    dom.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Intercept mousedown on right and middle buttons
    dom.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();

        // Right-click inspection on mousedown
        this.updateMouseCoords(e);
        this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
        const hits = this.raycaster.intersectObjects(this.coinManager.interactiveMeshes, false);
        if (hits.length > 0) {
          const item = this.coinManager.getCoinByMesh(hits[0].object);
          if (item) {
            this.onInspectCoin(item.data);
          }
        }
      } else if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    dom.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    window.addEventListener('pointermove', this.handlePointerMove.bind(this));
    window.addEventListener('pointerup', this.handlePointerUp.bind(this));
    window.addEventListener('pointercancel', this.handlePointerUp.bind(this));
  }

  private updateMouseCoords(e: PointerEvent | MouseEvent): void {
    const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) {
      e.preventDefault();
      return;
    }

    this.updateMouseCoords(e);
    this.pointerDownPos.set(e.clientX, e.clientY);
    this.isPointerDown = true;
    this.dragStarted = false;
    this.pendingCoin = null;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);

    // 1. Check if clicked on Lid
    const lidMeshes = this.jar.lidMesh.children;
    const lidHits = this.raycaster.intersectObjects(lidMeshes, true);
    if (lidHits.length > 0 && !this.jar.isLidOpen()) {
      this.jar.triggerUnscrew();
      return;
    }

    // 2. Check if clicked on Coin
    const coinHits = this.raycaster.intersectObjects(this.coinManager.interactiveMeshes, false);
    if (coinHits.length > 0) {
      const hit = coinHits[0];
      const coinItem = this.coinManager.getCoinByMesh(hit.object);

      if (coinItem) {
        const now = performance.now();

        // Check for double click / double tap:
        // If it's a double click, open modal directly without lifting or picking up the coin!
        if (this.lastTapTargetCoinId === coinItem.id && now - this.lastTapTime < 380) {
          this.lastTapTime = 0;
          this.lastTapTargetCoinId = null;
          this.pendingCoin = null;
          this.activeCoin = null;
          this.dragStarted = false;
          this.onInspectCoin(coinItem.data);
          return;
        }

        // Register first tap candidate
        this.lastTapTime = now;
        this.lastTapTargetCoinId = coinItem.id;

        // Stage coin for potential dragging (do NOT lift or play sound yet!)
        this.pendingCoin = coinItem;
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    this.updateMouseCoords(e);

    // If a coin is held down and has not started dragging yet: check threshold
    if (this.isPointerDown && this.pendingCoin && !this.dragStarted) {
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);

      // Require at least 7 pixels of drag movement so quick double-clicks never lift the coin
      if (dist > 7) {
        this.dragStarted = true;
        this.activeCoin = this.pendingCoin;
        this.lastTapTime = 0; // Invalidate double-tap since user is dragging

        // Now initiate physical drag
        this.sceneManager.controls.enabled = false;
        this.audio?.playCoinPick();
        this.activeCoin.body.wakeUp();
        this.samples = [{ time: performance.now(), pos: this.activeCoin.mesh.position.clone() }];
      }
    }

    if (this.dragStarted && this.activeCoin) {
      const now = performance.now();
      this.samples.push({ time: now, pos: this.activeCoin.mesh.position.clone() });
      if (this.samples.length > 5) {
        this.samples.shift();
      }
    }
  }

  private handlePointerUp(_e: PointerEvent): void {
    this.isPointerDown = false;

    if (this.dragStarted && this.activeCoin) {
      const coin = this.activeCoin;
      this.activeCoin = null;
      this.pendingCoin = null;
      this.dragStarted = false;

      // Restore camera controls
      this.sceneManager.controls.enabled = true;
      coin.body.wakeUp();

      // Throw impulse calculation from recent movement
      if (this.samples.length >= 2) {
        const oldest = this.samples[0];
        const newest = this.samples[this.samples.length - 1];
        const dt = (newest.time - oldest.time) / 1000;

        if (dt > 0.01 && dt < 0.3) {
          const vel = newest.pos.clone().sub(oldest.pos).divideScalar(dt);
          const speed = vel.length();

          if (speed > 0.6) {
            const clampedSpeed = Math.min(speed, 9.0);
            vel.normalize().multiplyScalar(clampedSpeed);

            this.audio?.playCoinThrow();

            const factor = 0.25;
            coin.body.applyImpulse(
              {
                x: vel.x * factor,
                y: vel.y * factor,
                z: vel.z * factor
              },
              true
            );

            coin.body.applyTorqueImpulse(
              {
                x: (Math.random() - 0.5) * 0.3,
                y: (Math.random() - 0.5) * 0.3,
                z: (Math.random() - 0.5) * 0.3
              },
              true
            );
          }
        }
      }

      // Track this specific interacted coin for a landing clink when it hits the floor/jar
      this.trackedLandingCoin = {
        item: coin,
        lastVy: coin.body.linvel().y,
        releasedTime: performance.now(),
        hasLanded: false
      };
    } else {
      // User tapped without dragging
      this.pendingCoin = null;
      this.dragStarted = false;
    }

    this.samples = [];
  }

  /**
   * Called on every frame:
   * 1. Applies continuous physical spring attraction forces for active drag
   * 2. Detects physical landing of the user-interacted coin to play response sound
   */
  public update(_delta: number): void {
    // 1. Process landing sound for released coin
    if (this.trackedLandingCoin && !this.trackedLandingCoin.hasLanded) {
      const tCoin = this.trackedLandingCoin;
      const body = tCoin.item.body;
      const pos = body.translation();
      const vel = body.linvel();
      const timeSinceRelease = performance.now() - tCoin.releasedTime;

      // Detect floor landing (y near floor) or jar bottom impact
      const isFloorHit = pos.y <= 0.14 && (tCoin.lastVy < -0.3 || Math.abs(vel.y) < 0.2);
      const isJarHit = pos.y <= 1.8 && Math.hypot(pos.x, pos.z) < 1.15 && (tCoin.lastVy < -0.6 && vel.y >= -0.2);

      if (timeSinceRelease > 60 && (isFloorHit || isJarHit)) {
        tCoin.hasLanded = true;
        const impact = Math.abs(tCoin.lastVy);
        this.audio?.playCoinLand(impact);

        setTimeout(() => {
          if (this.trackedLandingCoin === tCoin) {
            this.trackedLandingCoin = null;
          }
        }, 400);
      } else {
        tCoin.lastVy = vel.y;
        if (timeSinceRelease > 3000) {
          this.trackedLandingCoin = null;
        }
      }
    }

    // 2. Process active drag forces
    if (!this.dragStarted || !this.activeCoin || !this.isPointerDown) return;

    const coin = this.activeCoin;
    const body = coin.body;
    body.wakeUp();

    const cam = this.sceneManager.camera;
    this.raycaster.setFromCamera(this.mouse, cam);

    const camPos = cam.position;
    const rayDir = this.raycaster.ray.direction.clone().normalize();

    const curPos = body.translation();
    const coinPosVec = new THREE.Vector3(curPos.x, curPos.y, curPos.z);

    // Determine if coin is currently behind glass or in open air
    const camToCoin = coinPosVec.clone().sub(camPos);
    const distToCoin = camToCoin.length();
    const testRay = new THREE.Raycaster(camPos, camToCoin.clone().normalize(), 0.05, Math.max(0.1, distToCoin - 0.05));
    const glassHits = testRay.intersectObject(this.jar.jarMesh, false);

    const isInsideJar = curPos.y < this.jar.jarNeckTopY && Math.hypot(curPos.x, curPos.z) < this.jar.jarInsideRadius;
    const hasGlassInBetween = glassHits.length > 0 || isInsideJar;

    let targetPos: THREE.Vector3;

    if (hasGlassInBetween) {
      // 1. User holds coin THROUGH the glass:
      // Pull target towards camera/cursor just outside the jar wall so coin firmly presses against the glass!
      const plane = new THREE.Plane(cam.getWorldDirection(new THREE.Vector3()).negate(), -camPos.dot(cam.getWorldDirection(new THREE.Vector3())));
      plane.setFromNormalAndCoplanarPoint(cam.getWorldDirection(new THREE.Vector3()).negate(), coinPosVec);

      const hitPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, hitPoint)) {
        // Target is pulled slightly towards camera so it sticks firmly to inside wall
        const pullDir = camPos.clone().sub(hitPoint).normalize();
        targetPos = hitPoint.clone().add(pullDir.multiplyScalar(0.35));
      } else {
        targetPos = coinPosVec.clone();
      }
    } else {
      // 2. Coin has been lifted OUT of the jar into free air:
      // Pull to optimal viewing distance in front of the camera so the user can inspect the coin up close!
      const optimalViewDistance = 2.6;
      targetPos = camPos.clone().add(rayDir.multiplyScalar(optimalViewDistance));
    }

    // Keep target above floor
    targetPos.y = Math.max(0.12, targetPos.y);

    // Apply Physical Spring-Damper Impulse towards target
    const toTarget = targetPos.clone().sub(coinPosVec);
    const dist = toTarget.length();

    const curVel = body.linvel();
    const maxSpeed = 7.5;
    const desiredSpeed = Math.min(dist * 14.0, maxSpeed);
    const desiredVel = toTarget.normalize().multiplyScalar(desiredSpeed);

    const dvX = desiredVel.x - curVel.x;
    const dvY = desiredVel.y - curVel.y;
    const dvZ = desiredVel.z - curVel.z;

    const mass = body.mass();
    const maxImpulse = 2.8;
    const impX = THREE.MathUtils.clamp(dvX * mass * 0.85, -maxImpulse, maxImpulse);
    const impY = THREE.MathUtils.clamp(dvY * mass * 0.85, -maxImpulse, maxImpulse);
    const impZ = THREE.MathUtils.clamp(dvZ * mass * 0.85, -maxImpulse, maxImpulse);

    body.applyImpulse({ x: impX, y: impY, z: impZ }, true);

    // Softly dampen spin while held so the coin can be examined clearly
    const angVel = body.angvel();
    body.setAngvel(
      {
        x: angVel.x * 0.88,
        y: angVel.y * 0.88,
        z: angVel.z * 0.88
      },
      true
    );
  }
}
