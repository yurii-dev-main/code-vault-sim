import './style.css';
import { PhysicsManager } from './physics/PhysicsManager.ts';
import { SceneManager } from './scene/SceneManager.ts';
import { Jar } from './jar/Jar.ts';
import { CoinManager } from './coins/CoinManager.ts';
import { InteractionManager } from './interaction/InteractionManager.ts';
import { UIManager } from './ui/UIManager.ts';
import { AudioManager } from './audio/AudioManager.ts';

async function bootstrap() {
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element #scene-canvas not found');
  }

  // 1. Initialize Audio Engine (Web Audio API)
  const audio = new AudioManager();

  // 2. Initialize Physics (Rapier WASM)
  const physics = new PhysicsManager();
  await physics.init();

  // 3. Initialize Three.js Scene
  const sceneManager = new SceneManager(canvas);

  // 4. Create Jar and Lid with Audio
  const jar = new Jar(sceneManager.scene, physics, audio);

  // 5. Create Coin Manager and load data
  const coinManager = new CoinManager(sceneManager.scene, physics);
  await coinManager.loadCoins();
  coinManager.spawnAllCoins();

  // 6. Initialize UI (HUD, Modals and Audio Controls)
  const uiManager = new UIManager({
    audio,
    onReset: () => {
      jar.resetLid();
      coinManager.spawnAllCoins();
      uiManager.updateStats(coinManager.getTotalPoints(), coinManager.getTotalCount());
    }
  });

  uiManager.updateStats(coinManager.getTotalPoints(), coinManager.getTotalCount());

  // 7. Setup Pointer Interactions (Drag, Throw, Inspect) with Audio
  const interactionManager = new InteractionManager(
    sceneManager,
    jar,
    coinManager,
    (coin) => uiManager.showCoinModal(coin),
    audio
  );

  // 8. Render & Physics Loop
  let lastTime = performance.now();

  function animate(currentTime: number) {
    requestAnimationFrame(animate);

    const delta = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    // Apply active drag forces
    interactionManager.update(delta);

    // Update Lid unscrewing animation if active
    jar.update(delta);

    // Step physics & sync transforms
    physics.step(delta);

    // Update OrbitControls damping
    sceneManager.update();

    // Render Three.js scene
    sceneManager.render();
  }

  requestAnimationFrame(animate);
}

bootstrap().catch((err) => {
  console.error('Initialization error:', err);
  const loadingEl = document.getElementById('loading-overlay');
  if (loadingEl) {
    loadingEl.innerHTML = `
      <div style="color: #ef4444; font-size: 16px; padding: 20px; text-align: center;">
        Помилка ініціалізації WebGL / Фізики:<br>
        <code style="font-size: 13px; color: #fca5a5;">${err.message || err}</code>
      </div>
    `;
  }
});
