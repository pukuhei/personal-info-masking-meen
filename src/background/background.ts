import { ExtensionSettings, MessagePayload, PIIPattern, MaskingType } from '../types';

class BackgroundService {
  private defaultSettings: ExtensionSettings = {
    enabled: true,
    maskingTypes: {
      email: MaskingType.BLUR,
      phone: MaskingType.MOSAIC,
      address: MaskingType.BLACKOUT,
      creditCard: MaskingType.PIXELATE,
      name: MaskingType.BLUR
    },
    patterns: [
      {
        name: 'email',
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        maskingType: MaskingType.BLUR,
        enabled: true
      },
      {
        name: 'phone',
        pattern: '(\\+?\\d{1,4}[\\s-]?)?(\\(?\\d{2,4}\\)?[\\s-]?)?[\\d\\s-]{6,}',
        maskingType: MaskingType.MOSAIC,
        enabled: true
      },
      {
        name: 'creditCard',
        pattern: '\\b(?:\\d{4}[\\s-]?){3}\\d{4}\\b',
        maskingType: MaskingType.PIXELATE,
        enabled: true
      }
    ],
    realTimeProcessing: true,
    sensitivity: 'high'
  };

  constructor() {
    console.log('[PII Masking] Background service starting...');
    this.initializeExtension();
    this.setupMessageHandlers();
  }

  private async initializeExtension(): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings) {
        await this.saveSettings(this.defaultSettings);
      }
    } catch (error) {
      console.error('Failed to initialize extension:', error);
    }
  }

  private setupMessageHandlers(): void {
    chrome.runtime.onMessage.addListener(
      (message: MessagePayload, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Keep message channel open for async response
      }
    );

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.onTabUpdated(tabId, tab);
      }
    });
  }

  private async handleMessage(
    message: MessagePayload,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'GET_SETTINGS':
          const settings = await this.getSettings();
          console.log('[PII Masking] Sending settings:', settings);
          sendResponse({ success: true, data: settings });
          break;

        case 'UPDATE_SETTINGS':
          await this.saveSettings(message.data);
          sendResponse({ success: true });
          break;

        case 'TOGGLE_MASKING':
          await this.toggleMasking();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async onTabUpdated(tabId: number, tab: chrome.tabs.Tab): Promise<void> {
    const settings = await this.getSettings();
    if (settings && settings.enabled && settings.realTimeProcessing) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'PROCESS_PAGE',
          data: settings
        });
      } catch (error) {
        // Tab might not have content script loaded yet
        console.debug('Could not send message to tab:', tabId);
      }
    }
  }

  private async getSettings(): Promise<ExtensionSettings | null> {
    try {
      const result = await chrome.storage.sync.get(['piiMaskingSettings']);
      return result.piiMaskingSettings || null;
    } catch (error) {
      console.error('Error getting settings:', error);
      return null;
    }
  }

  private async saveSettings(settings: ExtensionSettings): Promise<void> {
    try {
      await chrome.storage.sync.set({ piiMaskingSettings: settings });
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  private async toggleMasking(): Promise<void> {
    const settings = await this.getSettings();
    if (settings) {
      settings.enabled = !settings.enabled;
      await this.saveSettings(settings);
    }
  }
}

// Initialize the background service
new BackgroundService();