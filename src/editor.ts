import './editor.css';
import { CoinData, DEFAULT_COINS } from './types/coin.ts';

class CoinsEditor {
  private coins: CoinData[] = [];
  private editingId: string | null = null;

  // DOM Elements
  private form!: HTMLFormElement;
  private inputStudent!: HTMLInputElement;
  private inputTask!: HTMLInputElement;
  private inputDate!: HTMLInputElement;
  private radioValue1!: HTMLInputElement;
  private radioValue2!: HTMLInputElement;
  private submitBtn!: HTMLButtonElement;
  private formTitle!: HTMLHeadingElement;

  private searchInput!: HTMLInputElement;
  private tableBody!: HTMLTableSectionElement;

  private statTotalCoins!: HTMLElement;
  private statTotalPoints!: HTMLElement;
  private statSilverCoins!: HTMLElement;
  private statGoldCoins!: HTMLElement;

  private toastEl!: HTMLDivElement;

  constructor() {
    this.initDOMElements();
    this.bindEvents();
    this.setDefaultDate();
    this.loadCoins();
  }

  private initDOMElements(): void {
    this.form = document.getElementById('coin-form') as HTMLFormElement;
    this.inputStudent = document.getElementById('input-student') as HTMLInputElement;
    this.inputTask = document.getElementById('input-task') as HTMLInputElement;
    this.inputDate = document.getElementById('input-date') as HTMLInputElement;
    this.radioValue1 = document.getElementById('val-1') as HTMLInputElement;
    this.radioValue2 = document.getElementById('val-2') as HTMLInputElement;
    this.submitBtn = document.getElementById('btn-submit-form') as HTMLButtonElement;
    this.formTitle = document.getElementById('form-title') as HTMLHeadingElement;

    this.searchInput = document.getElementById('search-input') as HTMLInputElement;
    this.tableBody = document.getElementById('coins-table-body') as HTMLTableSectionElement;

    this.statTotalCoins = document.getElementById('stat-total-coins')!;
    this.statTotalPoints = document.getElementById('stat-total-points')!;
    this.statSilverCoins = document.getElementById('stat-silver-coins')!;
    this.statGoldCoins = document.getElementById('stat-gold-coins')!;

    this.toastEl = document.getElementById('toast') as HTMLDivElement;
  }

  private setDefaultDate(): void {
    const today = new Date().toISOString().split('T')[0];
    this.inputDate.value = today;
  }

  private bindEvents(): void {
    // Form submit
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit();
    });

    // "Today" quick button
    document.getElementById('btn-today')?.addEventListener('click', () => {
      this.setDefaultDate();
    });

    // Cancel edit button
    document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
      this.cancelEdit();
    });

    // Save to server
    document.getElementById('btn-save-server')?.addEventListener('click', () => {
      this.saveToServer();
    });

    // Download JSON
    document.getElementById('btn-download-json')?.addEventListener('click', () => {
      this.downloadJSON();
    });

    // Search filter
    this.searchInput.addEventListener('input', () => {
      this.renderTable();
    });

    // File input for upload
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const parsed = JSON.parse(evt.target?.result as string);
            if (Array.isArray(parsed)) {
              this.coins = parsed;
              this.updateUI();
              this.showToast('Файл успішно імпортовано!');
            }
          } catch {
            alert('Помилка під час читання JSON-файлу');
          }
        };
        reader.readAsText(file);
      }
    });
  }

  private async loadCoins(): Promise<void> {
    try {
      const res = await fetch('/coins.json');
      if (res.ok) {
        const data = await res.json();
        this.coins = Array.isArray(data) && data.length > 0 ? data : [...DEFAULT_COINS];
      } else {
        this.coins = [...DEFAULT_COINS];
      }
    } catch (err) {
      console.warn('Could not fetch /coins.json:', err);
      this.coins = [...DEFAULT_COINS];
    }
    this.updateUI();
  }

  private handleFormSubmit(): void {
    const student = this.inputStudent.value.trim();
    const task = this.inputTask.value.trim();
    const date = this.inputDate.value;
    const value: 1 | 2 = this.radioValue2.checked ? 2 : 1;

    if (!student || !task) {
      alert('Будь ласка, заповніть поля "Хто" та "За що"');
      return;
    }

    if (this.editingId) {
      // Edit existing
      const coin = this.coins.find(c => c.id === this.editingId);
      if (coin) {
        coin.student = student;
        coin.task = task;
        coin.value = value;
        coin.date = date;
      }
      this.showToast('Монету успішно оновлено');
      this.cancelEdit();
    } else {
      // Add new
      const newCoin: CoinData = {
        id: `coin-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        value,
        student,
        task,
        date: date || new Date().toISOString().split('T')[0]
      };
      // Prepend to list
      this.coins.unshift(newCoin);
      this.showToast('Монету додано!');
      this.resetForm();
    }

    this.updateUI();
    // Auto-save to server in background
    this.saveToServer(false);
  }

  public editCoin(id: string): void {
    const coin = this.coins.find(c => c.id === id);
    if (!coin) return;

    this.editingId = id;
    this.inputStudent.value = coin.student;
    this.inputTask.value = coin.task;
    this.inputDate.value = coin.date;
    if (coin.value === 2) {
      this.radioValue2.checked = true;
    } else {
      this.radioValue1.checked = true;
    }

    this.formTitle.textContent = '✏️ Редагування монети';
    this.submitBtn.textContent = 'Зберегти зміни';
    document.getElementById('btn-cancel-edit')!.style.display = 'inline-flex';
    this.inputStudent.focus();
  }

  public deleteCoin(id: string): void {
    const coin = this.coins.find(c => c.id === id);
    if (!coin) return;

    if (confirm(`Видалити монету для "${coin.student}"?`)) {
      this.coins = this.coins.filter(c => c.id !== id);
      if (this.editingId === id) {
        this.cancelEdit();
      }
      this.updateUI();
      this.showToast('Монету видалено');
      this.saveToServer(false);
    }
  }

  private cancelEdit(): void {
    this.editingId = null;
    this.resetForm();
    this.formTitle.textContent = '➕ Додати нову монету';
    this.submitBtn.textContent = 'Додати монету';
    document.getElementById('btn-cancel-edit')!.style.display = 'none';
  }

  private resetForm(): void {
    this.inputStudent.value = '';
    this.inputTask.value = '';
    this.radioValue1.checked = true;
    this.setDefaultDate();
    this.inputStudent.focus();
  }

  private updateUI(): void {
    this.renderStats();
    this.renderTable();
  }

  private renderStats(): void {
    const totalCount = this.coins.length;
    const totalPoints = this.coins.reduce((acc, c) => acc + c.value, 0);
    const silverCount = this.coins.filter(c => c.value === 1).length;
    const goldCount = this.coins.filter(c => c.value === 2).length;

    this.statTotalCoins.textContent = totalCount.toString();
    this.statTotalPoints.textContent = totalPoints.toString();
    this.statSilverCoins.textContent = silverCount.toString();
    this.statGoldCoins.textContent = goldCount.toString();
  }

  private renderTable(): void {
    const query = this.searchInput.value.toLowerCase().trim();
    const filtered = this.coins.filter(c =>
      c.student.toLowerCase().includes(query) ||
      c.task.toLowerCase().includes(query) ||
      c.date.includes(query)
    );

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-dim); padding: 32px;">
            ${this.coins.length === 0 ? 'Монет поки немає. Додайте першу через форму вище!' : 'Нічого не знайдено за запитом'}
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = filtered.map(c => `
      <tr data-id="${c.id}">
        <td>
          <span class="coin-badge ${c.value === 2 ? 'badge-gold' : 'badge-silver'}">
            ${c.value === 2 ? '🪙 2 бали' : '🥈 1 бал'}
          </span>
        </td>
        <td style="font-weight: 600; color: #fff;">${this.escape(c.student)}</td>
        <td style="color: var(--text-dim);">${this.escape(c.task)}</td>
        <td style="color: var(--text-dim); white-space: nowrap;">${c.date}</td>
        <td>
          <div class="table-actions">
            <button class="btn-icon edit-btn" title="Редагувати" data-id="${c.id}">✏️</button>
            <button class="btn-icon delete delete-btn" title="Видалити" data-id="${c.id}">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach event listeners to action buttons
    this.tableBody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.editCoin(id);
      });
    });

    this.tableBody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.deleteCoin(id);
      });
    });
  }

  private async saveToServer(showExplicitToast = true): Promise<void> {
    try {
      const res = await fetch('/api/save-coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.coins, null, 2)
      });
      if (res.ok) {
        if (showExplicitToast) {
          this.showToast('💾 Файл public/coins.json успішно збережено!');
        }
      } else {
        if (showExplicitToast) {
          this.downloadJSON();
        }
      }
    } catch {
      // In production/static mode where backend API is not present, trigger download
      if (showExplicitToast) {
        this.downloadJSON();
      }
    }
  }

  private downloadJSON(): void {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.coins, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'coins.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('📥 Файл coins.json завантажено!');
  }

  private showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2800);
  }

  private escape(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CoinsEditor();
});
