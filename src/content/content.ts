import { ExtensionSettings, PIIMatch, MessagePayload, MaskingType } from '../types';
import { PIIDetector } from '../utils/pii-detector';
import { MaskingEngine } from '../utils/masking-engine';

class ContentScriptManager {
  private settings: ExtensionSettings | null = null;
  private observer: MutationObserver | null = null;
  private maskedElements: Map<HTMLElement, { original: HTMLElement; masked: boolean; maskingElement?: HTMLElement }> = new Map();
  private isProcessing = false;
  private piiDetector: PIIDetector | null = null;
  private maskingEngine: MaskingEngine;

  constructor() {
    console.log('[PII Masking] Content script starting...');
    this.maskingEngine = MaskingEngine.getInstance();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Request settings from background script
      const response = await this.sendMessage({ type: 'GET_SETTINGS' });
      if (response.success && response.data) {
        this.settings = response.data;
        console.log('[PII Masking] Settings loaded:', this.settings);
        this.piiDetector = new PIIDetector(this.settings!);
        this.startProcessing();
      } else {
        console.error('[PII Masking] Failed to load settings:', response);
      }
    } catch (error) {
      console.error('Failed to initialize content script:', error);
    }

    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    chrome.runtime.onMessage.addListener(
      (message: MessagePayload, sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true;
      }
    );
  }

  private async handleMessage(
    message: MessagePayload,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'PROCESS_PAGE':
          this.settings = message.data;
          if (this.settings) {
            if (this.piiDetector) {
              this.piiDetector.updateSettings(this.settings);
            } else {
              this.piiDetector = new PIIDetector(this.settings);
            }
          }
          await this.processPage();
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

  private startProcessing(): void {
    if (!this.settings || !this.settings.enabled) return;

    // Process initial page content
    this.processPage();

    // Set up DOM observer for real-time processing
    if (this.settings.realTimeProcessing) {
      this.setupDOMObserver();
    }
  }

  private setupDOMObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      if (this.isProcessing) return;

      let shouldProcess = false;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
              shouldProcess = true;
            }
          });
        } else if (mutation.type === 'characterData') {
          shouldProcess = true;
        }
      });

      if (shouldProcess) {
        this.processPage();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  private async processPage(): Promise<void> {
    if (!this.settings || !this.settings.enabled || this.isProcessing || !this.piiDetector) {
      console.log('[PII Masking] Skipping page processing:', {
        hasSettings: !!this.settings,
        enabled: this.settings?.enabled,
        isProcessing: this.isProcessing,
        hasDetector: !!this.piiDetector
      });
      return;
    }

    console.log('[PII Masking] Starting page processing...');
    this.isProcessing = true;
    try {
      const textNodes = this.getTextNodes(document.body);
      console.log('[PII Masking] Found text nodes:', textNodes.length);
      
      const matches = this.piiDetector.detectPII(textNodes);
      console.log('[PII Masking] Found PII matches:', matches.length, matches);
      
      if (matches.length > 0) {
        await this.applyMasking(matches);
        console.log('[PII Masking] Applied masking to', matches.length, 'matches');
      }
    } catch (error) {
      console.error('Error processing page:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private getTextNodes(element: Node): Text[] {
    const textNodes: Text[] = [];
    
    function traverse(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        if (textNode.textContent && textNode.textContent.trim().length > 0) {
          textNodes.push(textNode);
        }
      } else {
        node.childNodes.forEach(traverse);
      }
    }
    
    traverse(element);
    return textNodes;
  }


  private async applyMasking(matches: PIIMatch[]): Promise<void> {
    // Group matches by element for efficient processing
    const elementMatches = new Map<HTMLElement, PIIMatch[]>();
    
    matches.forEach((match) => {
      const existing = elementMatches.get(match.element) || [];
      existing.push(match);
      elementMatches.set(match.element, existing);
    });

    // Apply masking to each element
    for (const [element, elementMatchList] of elementMatches) {
      await this.maskElement(element, elementMatchList);
    }
  }

  private async maskElement(element: HTMLElement, matches: PIIMatch[]): Promise<void> {
    if (!this.maskedElements.has(element)) {
      this.maskedElements.set(element, {
        original: element.cloneNode(true) as HTMLElement,
        masked: false
      });
    }

    const originalData = this.maskedElements.get(element)!;
    if (originalData.masked) return;

    // 最も強力なマスキングタイプを決定
    const primaryMaskingType = this.getPrimaryMaskingType(matches);
    
    try {
      // マスキングエンジンを使用して視覚効果を適用
      const maskingResult = await this.maskingEngine.applyTextMasking(element, primaryMaskingType, {
        intensity: 1,
        blockSize: primaryMaskingType === MaskingType.MOSAIC ? 8 : 6,
        radius: primaryMaskingType === MaskingType.BLUR ? 3 : undefined
      });

      if (maskingResult.success && maskingResult.maskedElement) {
        // 元の要素を隠して、マスキングされた要素を表示
        if (maskingResult.maskedElement instanceof HTMLCanvasElement) {
          // Canvasの場合は画像として挿入
          const maskingWrapper = document.createElement('span');
          maskingWrapper.appendChild(maskingResult.maskedElement);
          maskingWrapper.style.display = 'inline-block';
          element.style.display = 'none';
          element.parentNode?.insertBefore(maskingWrapper, element);
          originalData.maskingElement = maskingWrapper;
        } else {
          // HTMLElementの場合は直接置換
          element.style.display = 'none';
          element.parentNode?.insertBefore(maskingResult.maskedElement, element);
          originalData.maskingElement = maskingResult.maskedElement;
        }
        originalData.masked = true;
      } else {
        // フォールバック：文字置換方式
        this.applyCharacterMasking(element, matches);
        originalData.masked = true;
      }
    } catch (error) {
      console.warn('Advanced masking failed, using fallback:', error);
      this.applyCharacterMasking(element, matches);
      originalData.masked = true;
    }
  }

  private getPrimaryMaskingType(matches: PIIMatch[]): MaskingType {
    // 優先度: BLACKOUT > PIXELATE > MOSAIC > BLUR
    const priority = [MaskingType.BLACKOUT, MaskingType.PIXELATE, MaskingType.MOSAIC, MaskingType.BLUR];
    
    for (const type of priority) {
      if (matches.some(match => match.maskingType === type)) {
        return type;
      }
    }
    
    return MaskingType.BLUR; // デフォルト
  }

  private applyCharacterMasking(element: HTMLElement, matches: PIIMatch[]): void {
    const originalText = element.textContent || '';
    let maskedText = originalText;
    
    // Sort matches by start index (descending) to avoid index shifting
    matches.sort((a, b) => b.startIndex - a.startIndex);
    
    matches.forEach((match) => {
      const maskChar = this.getMaskCharacter(match.maskingType);
      const maskedString = maskChar.repeat(match.text.length);
      maskedText = maskedText.substring(0, match.startIndex) + 
                   maskedString + 
                   maskedText.substring(match.endIndex);
    });

    element.textContent = maskedText;
  }

  private getMaskCharacter(maskingType: MaskingType): string {
    switch (maskingType) {
      case MaskingType.MOSAIC:
        return '█';
      case MaskingType.BLUR:
        return '•';
      case MaskingType.BLACKOUT:
        return '█';
      case MaskingType.PIXELATE:
        return '▓';
      default:
        return '*';
    }
  }

  private async toggleMasking(): Promise<void> {
    if (!this.settings) return;

    if (this.settings.enabled) {
      // 元の要素を復元
      this.maskedElements.forEach((data, element) => {
        if (data.masked) {
          // マスキング要素を削除
          if (data.maskingElement && data.maskingElement.parentNode) {
            data.maskingElement.parentNode.removeChild(data.maskingElement);
          }
          
          // 元の要素を表示
          element.style.display = '';
          data.masked = false;
          data.maskingElement = undefined;
        }
      });
    } else {
      // マスキングを再適用
      await this.processPage();
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
}

// Initialize content script when DOM is ready
function initializeWhenReady() {
  console.log('[PII Masking] Document ready state:', document.readyState);
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[PII Masking] DOM Content Loaded');
      setTimeout(() => {
        new ContentScriptManager();
      }, 1000); // 1秒遅延で確実に初期化
    });
  } else {
    console.log('[PII Masking] Document already loaded');
    setTimeout(() => {
      new ContentScriptManager();
    }, 500); // 0.5秒遅延
  }
}

initializeWhenReady();