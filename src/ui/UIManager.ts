import { CoinData } from '../types/coin.ts';
import { AudioManager } from '../audio/AudioManager.ts';

export interface UIConfig {
  onReset: () => void;
  audio: AudioManager;
}

export class UIManager {
  private config: UIConfig;
  private container: HTMLDivElement;

  private pointsValEl!: HTMLElement;
  private countValEl!: HTMLElement;
  private modalEl!: HTMLDivElement;
  private modalContentEl!: HTMLDivElement;
  private modalOpenTime = 0;

  constructor(config: UIConfig) {
    this.config = config;
    this.container = document.createElement('div');
    this.container.className = 'hud-container';
    document.body.appendChild(this.container);

    this.buildHUD();
    this.buildModal();
    this.setupSecretEditorShortcuts();
  }

  private buildHUD(): void {
    // 1. Top bar with stats & action buttons
    const topBar = document.createElement('header');
    topBar.className = 'hud-topbar';

    // Stats Widget
    const statsWidget = document.createElement('div');
    statsWidget.className = 'glass-card hud-stats';
    statsWidget.id = 'hud-stats-card';
    statsWidget.title = 'Загальний баланс групи';
    statsWidget.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">Всього балів</span>
        <span class="stat-value" id="hud-total-points">0</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-label">Монет у банці</span>
        <span class="stat-value" id="hud-total-count">0</span>
      </div>
    `;
    topBar.appendChild(statsWidget);

    // Actions Group
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'hud-actions';

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'glass-btn';
    resetBtn.draggable = false;
    resetBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      <span>Повернути в банку</span>
    `;
    resetBtn.onclick = () => this.config.onReset();
    actionsGroup.appendChild(resetBtn);

    // Music toggle button (starts muted as music is off by default)
    const audioBtn = document.createElement('button');
    audioBtn.className = 'glass-btn audio-btn muted';
    audioBtn.id = 'hud-audio-btn';
    audioBtn.title = 'Фонова музика вимкнена (натисніть, щоб увімкнути)';
    audioBtn.draggable = false;
    audioBtn.innerHTML = `
      <span class="audio-icon">🔇</span>
      <span class="audio-label">Музика</span>
    `;
    audioBtn.onclick = () => {
      const isMusicOn = this.config.audio.toggleMusic();
      const icon = audioBtn.querySelector('.audio-icon');
      const label = audioBtn.querySelector('.audio-label');
      if (isMusicOn) {
        if (icon) icon.textContent = '🎵';
        if (label) label.textContent = 'Музика';
        audioBtn.title = 'Фонова музика (увімкнено)';
        audioBtn.classList.remove('muted');
      } else {
        if (icon) icon.textContent = '🔇';
        if (label) label.textContent = 'Музика';
        audioBtn.title = 'Фонова музика вимкнена (натисніть, щоб увімкнути)';
        audioBtn.classList.add('muted');
      }
    };
    actionsGroup.appendChild(audioBtn);

    topBar.appendChild(actionsGroup);
    this.container.appendChild(topBar);

    this.pointsValEl = statsWidget.querySelector('#hud-total-points') as HTMLElement;
    this.countValEl = statsWidget.querySelector('#hud-total-count') as HTMLElement;

    // 2. Bottom instruction tooltip
    const hint = document.createElement('div');
    hint.className = 'glass-hint';
    hint.innerHTML = `
      <span>💡 Натисніть на кришку, щоб відкрити • Тягніть монети мишею або пальцем • Подвійний клік/тап для деталей</span>
    `;
    this.container.appendChild(hint);
  }

  /**
   * Secret shortcut to access editor without exposing button on public screen
   * 1) Keyboard combo: Ctrl + Shift + E (or Cmd + Shift + E)
   * 2) Triple-click on the balance stats card
   */
  private setupSecretEditorShortcuts(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e' || e.code === 'KeyE')) {
        e.preventDefault();
        window.location.href = '/editor.html';
      }
    });

    const statsCard = document.getElementById('hud-stats-card');
    if (statsCard) {
      let clickCount = 0;
      let clickTimer: any = null;
      statsCard.addEventListener('click', () => {
        clickCount++;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { clickCount = 0; }, 600);
        if (clickCount >= 3) {
          window.location.href = '/editor.html';
        }
      });
    }
  }

  private buildModal(): void {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-backdrop';
    this.modalEl.style.display = 'none';

    this.modalContentEl = document.createElement('div');
    this.modalContentEl.className = 'glass-card modal-card';
    this.modalEl.appendChild(this.modalContentEl);

    // Close on backdrop click (with 500ms guard to prevent accidental closure from fast clicks/double-clicks)
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        if (performance.now() - this.modalOpenTime < 500) {
          return;
        }
        this.closeModal();
      }
    });

    document.body.appendChild(this.modalEl);
  }

  public updateStats(totalPoints: number, totalCount: number): void {
    if (this.pointsValEl) this.pointsValEl.textContent = totalPoints.toString();
    if (this.countValEl) this.countValEl.textContent = totalCount.toString();
  }

  public showCoinModal(coin: CoinData): void {
    this.modalOpenTime = performance.now();
    const isTwo = coin.value === 2;
    const badgeClass = isTwo ? 'badge-gold' : 'badge-silver';
    const badgeText = isTwo ? '🪙 2 бали (Золота монета)' : '🥈 1 бал (Срібна монета)';

    this.modalContentEl.innerHTML = `
      <div class="modal-header">
        <span class="coin-badge ${badgeClass}">${badgeText}</span>
        <button class="modal-close-btn" id="modal-close" aria-label="Закрити">✕</button>
      </div>
      <div class="modal-body">
        <div class="info-row">
          <label>Кому вручено</label>
          <div class="info-value info-student">${this.escapeHtml(coin.student)}</div>
        </div>
        <div class="info-row">
          <label>За що</label>
          <div class="info-value info-task">${this.escapeHtml(coin.task)}</div>
        </div>
        <div class="info-row">
          <label>Дата вручення</label>
          <div class="info-value info-date">${this.formatDate(coin.date)}</div>
        </div>
      </div>
    `;

    const closeBtn = this.modalContentEl.querySelector('#modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    this.modalEl.style.display = 'flex';
    requestAnimationFrame(() => {
      this.modalEl.classList.add('visible');
    });
  }

  public closeModal(): void {
    this.modalEl.classList.remove('visible');
    setTimeout(() => {
      if (!this.modalEl.classList.contains('visible')) {
        this.modalEl.style.display = 'none';
      }
    }, 250);
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (parts) {
        const d = new Date(parseInt(parts[1], 10), parseInt(parts[2], 10) - 1, parseInt(parts[3], 10));
        return d.toLocaleDateString('uk-UA', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('uk-UA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}
