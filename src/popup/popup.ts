import { ExtensionSettings, MessagePayload, MaskingType } from '../types';

class PopupManager {
  private settings: ExtensionSettings | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.loadSettings();
      this.setupEventHandlers();
      this.updateUI();
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      this.showError('設定の読み込みに失敗しました');
    }
  }

  private async loadSettings(): Promise<void> {
    const response = await this.sendMessage({ type: 'GET_SETTINGS' });
    if (response.success) {
      this.settings = response.data;
    } else {
      throw new Error('設定の取得に失敗しました');
    }
  }

  private setupEventHandlers(): void {
    // メイン切り替えスイッチ
    const enableToggle = document.getElementById('enableToggle') as HTMLInputElement;
    enableToggle?.addEventListener('change', () => {
      this.handleEnableToggle(enableToggle.checked);
    });

    // リアルタイム処理切り替え
    const realTimeToggle = document.getElementById('realTimeToggle') as HTMLInputElement;
    realTimeToggle?.addEventListener('change', () => {
      this.handleRealTimeToggle(realTimeToggle.checked);
    });

    // マスキング設定
    const emailMasking = document.getElementById('emailMasking') as HTMLSelectElement;
    emailMasking?.addEventListener('change', () => {
      this.handleMaskingTypeChange('email', emailMasking.value as MaskingType);
    });

    const phoneMasking = document.getElementById('phoneMasking') as HTMLSelectElement;
    phoneMasking?.addEventListener('change', () => {
      this.handleMaskingTypeChange('phone', phoneMasking.value as MaskingType);
    });

    const creditCardMasking = document.getElementById('creditCardMasking') as HTMLSelectElement;
    creditCardMasking?.addEventListener('change', () => {
      this.handleMaskingTypeChange('creditCard', creditCardMasking.value as MaskingType);
    });

    // 感度設定
    const sensitivitySelect = document.getElementById('sensitivitySelect') as HTMLSelectElement;
    sensitivitySelect?.addEventListener('change', () => {
      this.handleSensitivityChange(sensitivitySelect.value as 'low' | 'medium' | 'high');
    });
  }

  private updateUI(): void {
    if (!this.settings) return;

    // メイン切り替えスイッチの状態
    const enableToggle = document.getElementById('enableToggle') as HTMLInputElement;
    if (enableToggle) {
      enableToggle.checked = this.settings.enabled;
    }

    // ステータス表示
    const statusElement = document.getElementById('status');
    if (statusElement) {
      if (this.settings.enabled) {
        statusElement.textContent = 'マスキング有効';
        statusElement.className = 'status active';
      } else {
        statusElement.textContent = 'マスキング無効';
        statusElement.className = 'status inactive';
      }
    }

    // リアルタイム処理の状態
    const realTimeToggle = document.getElementById('realTimeToggle') as HTMLInputElement;
    if (realTimeToggle) {
      realTimeToggle.checked = this.settings.realTimeProcessing;
    }

    // マスキング設定
    const emailMasking = document.getElementById('emailMasking') as HTMLSelectElement;
    if (emailMasking) {
      emailMasking.value = this.settings.maskingTypes.email || MaskingType.BLUR;
    }

    const phoneMasking = document.getElementById('phoneMasking') as HTMLSelectElement;
    if (phoneMasking) {
      phoneMasking.value = this.settings.maskingTypes.phone || MaskingType.MOSAIC;
    }

    const creditCardMasking = document.getElementById('creditCardMasking') as HTMLSelectElement;
    if (creditCardMasking) {
      creditCardMasking.value = this.settings.maskingTypes.creditCard || MaskingType.PIXELATE;
    }

    // 感度設定
    const sensitivitySelect = document.getElementById('sensitivitySelect') as HTMLSelectElement;
    if (sensitivitySelect) {
      sensitivitySelect.value = this.settings.sensitivity;
    }
  }

  private async handleEnableToggle(enabled: boolean): Promise<void> {
    if (!this.settings) return;

    try {
      this.settings.enabled = enabled;
      await this.saveSettings();
      this.updateUI();
      
      // コンテンツスクリプトに変更を通知
      await this.notifyContentScript();
    } catch (error) {
      console.error('Failed to toggle enable state:', error);
      this.showError('設定の保存に失敗しました');
    }
  }

  private async handleRealTimeToggle(enabled: boolean): Promise<void> {
    if (!this.settings) return;

    try {
      this.settings.realTimeProcessing = enabled;
      await this.saveSettings();
    } catch (error) {
      console.error('Failed to toggle real-time processing:', error);
      this.showError('設定の保存に失敗しました');
    }
  }

  private async handleMaskingTypeChange(type: string, maskingType: MaskingType): Promise<void> {
    if (!this.settings) return;

    try {
      this.settings.maskingTypes[type] = maskingType;
      
      // パターンの設定も更新
      const pattern = this.settings.patterns.find(p => p.name === type);
      if (pattern) {
        pattern.maskingType = maskingType;
      }
      
      await this.saveSettings();
      await this.notifyContentScript();
    } catch (error) {
      console.error('Failed to update masking type:', error);
      this.showError('設定の保存に失敗しました');
    }
  }

  private async handleSensitivityChange(sensitivity: 'low' | 'medium' | 'high'): Promise<void> {
    if (!this.settings) return;

    try {
      this.settings.sensitivity = sensitivity;
      await this.saveSettings();
    } catch (error) {
      console.error('Failed to update sensitivity:', error);
      this.showError('設定の保存に失敗しました');
    }
  }

  private async saveSettings(): Promise<void> {
    if (!this.settings) return;

    const response = await this.sendMessage({
      type: 'UPDATE_SETTINGS',
      data: this.settings
    });

    if (!response.success) {
      throw new Error('設定の保存に失敗しました');
    }
  }

  private async notifyContentScript(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'PROCESS_PAGE',
          data: this.settings
        });
      }
    } catch (error) {
      // コンテンツスクリプトが読み込まれていない場合は無視
      console.debug('Could not notify content script:', error);
    }
  }

  private sendMessage(message: MessagePayload): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  private showError(message: string): void {
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = 'status inactive';
    }
  }
}

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});