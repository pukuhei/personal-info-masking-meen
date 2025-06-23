import { PIIMatch, PIIPattern, ExtensionSettings, MaskingType } from '../types';
import { PIIPatterns } from './pii-patterns';

export interface DetectionContext {
  element: HTMLElement;
  textContent: string;
  elementType: string;
  formContext?: string;
  nearbyText?: string;
}

export class PIIDetector {
  private settings: ExtensionSettings;
  private patterns: PIIPattern[];

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
    this.patterns = this.initializePatterns();
  }

  /**
   * 設定からパターンを初期化
   */
  private initializePatterns(): PIIPattern[] {
    const defaultPatterns = PIIPatterns.getAllPatterns();
    
    // 設定からカスタムパターンがあれば使用、なければデフォルト
    if (this.settings.patterns && this.settings.patterns.length > 0) {
      return this.settings.patterns;
    }
    
    return defaultPatterns;
  }

  /**
   * テキストノードからPIIを検出
   */
  detectPII(textNodes: Text[]): PIIMatch[] {
    console.log('[PII Detector] Processing', textNodes.length, 'text nodes');
    const matches: PIIMatch[] = [];
    
    textNodes.forEach((textNode, index) => {
      const element = textNode.parentElement;
      if (!element) return;

      const text = textNode.textContent || '';
      if (text.trim().length === 0) return;

      console.log(`[PII Detector] Node ${index}: "${text}"`);
      
      const context = this.buildDetectionContext(element, text);
      const nodeMatches = this.detectInText(context);
      
      if (nodeMatches.length > 0) {
        console.log(`[PII Detector] Found ${nodeMatches.length} matches in node ${index}:`, nodeMatches);
      }
      
      matches.push(...nodeMatches);
    });

    const processedMatches = this.postProcessMatches(matches);
    console.log('[PII Detector] Final matches after processing:', processedMatches);
    return processedMatches;
  }

  /**
   * 検出コンテキストを構築
   */
  private buildDetectionContext(element: HTMLElement, text: string): DetectionContext {
    return {
      element,
      textContent: text,
      elementType: element.tagName.toLowerCase(),
      formContext: this.getFormContext(element),
      nearbyText: this.getNearbyText(element)
    };
  }

  /**
   * フォームコンテキストを取得
   */
  private getFormContext(element: HTMLElement): string {
    const form = element.closest('form');
    if (!form) return '';

    // ラベル、プレースホルダー、name属性などからコンテキストを収集
    const labels = Array.from(form.querySelectorAll('label')).map(l => l.textContent || '');
    const inputs = Array.from(form.querySelectorAll('input, textarea')).map(i => 
      [i.getAttribute('name') || '', i.getAttribute('placeholder') || ''].join(' ')
    );

    return [...labels, ...inputs].join(' ').toLowerCase();
  }

  /**
   * 近隣のテキストを取得
   */
  private getNearbyText(element: HTMLElement): string {
    const parent = element.parentElement;
    if (!parent) return '';

    const siblings = Array.from(parent.children);
    const currentIndex = siblings.indexOf(element);
    
    const nearbyElements = siblings.slice(
      Math.max(0, currentIndex - 2),
      Math.min(siblings.length, currentIndex + 3)
    );

    return nearbyElements.map(el => el.textContent || '').join(' ').toLowerCase();
  }

  /**
   * テキスト内でのPII検出
   */
  private detectInText(context: DetectionContext): PIIMatch[] {
    const matches: PIIMatch[] = [];
    const { textContent, element } = context;

    console.log('[PII Detector] Testing patterns against text:', textContent);

    this.patterns.forEach(pattern => {
      if (!pattern.enabled) {
        console.log(`[PII Detector] Pattern ${pattern.name} is disabled`);
        return;
      }

      console.log(`[PII Detector] Testing pattern ${pattern.name}:`, pattern.pattern);
      
      // 文字列パターンからRegExpオブジェクトを作成（グローバルフラグ付き）
      const globalPattern = new RegExp(pattern.pattern, 'g');
      const regexMatches = Array.from(textContent.matchAll(globalPattern));
      console.log(`[PII Detector] Pattern ${pattern.name} found ${regexMatches.length} raw matches`);
      
      regexMatches.forEach((match, matchIndex) => {
        if (match.index === undefined) return;

        const matchText = match[0];
        console.log(`[PII Detector] Raw match ${matchIndex} for ${pattern.name}: "${matchText}"`);
        
        // コンテキストベースのフィルタリング
        if (this.shouldIncludeMatch(matchText, pattern, context)) {
          console.log(`[PII Detector] Including match: "${matchText}"`);
          matches.push({
            text: matchText,
            startIndex: match.index,
            endIndex: match.index + matchText.length,
            type: pattern.name,
            element,
            maskingType: this.getMaskingType(pattern.name)
          });
        } else {
          console.log(`[PII Detector] Excluding match: "${matchText}"`);
        }
      });
    });

    return matches;
  }

  /**
   * マッチを含めるべきかどうかの判定
   */
  private shouldIncludeMatch(
    matchText: string, 
    pattern: PIIPattern, 
    context: DetectionContext
  ): boolean {
    // 感度設定に基づく調整
    const sensitivity = this.settings.sensitivity;
    
    // 基本的な妥当性チェック
    if (!this.isValidMatch(matchText, pattern.name)) {
      return false;
    }

    // コンテキストベースの判定
    if (sensitivity === 'high') {
      return true; // 高感度では全て含める
    }

    if (sensitivity === 'low') {
      // 低感度では明確にPIIらしいもののみ
      return PIIPatterns.isLikelyPII(matchText, context.formContext || context.nearbyText || '');
    }

    // 中感度での判定
    return this.isMediumConfidenceMatch(matchText, pattern, context);
  }

  /**
   * 基本的な妥当性チェック
   */
  private isValidMatch(text: string, type: string): boolean {
    switch (type) {
      case 'email':
        return this.isValidEmail(text);
      case 'phone':
        return this.isValidPhone(text);
      case 'creditCard':
        return this.isValidCreditCard(text);
      case 'japaneseName':
        return this.isValidJapaneseName(text);
      default:
        return true;
    }
  }

  /**
   * メールアドレスの妥当性チェック
   */
  private isValidEmail(email: string): boolean {
    // 基本的な構造チェック
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    
    const [local, domain] = parts;
    return local.length > 0 && domain.length > 0 && domain.includes('.');
  }

  /**
   * 電話番号の妥当性チェック
   */
  private isValidPhone(phone: string): boolean {
    const cleaned = phone.replace(/[-\s]/g, '');
    
    // 日本の電話番号の基本チェック
    if (cleaned.length < 10 || cleaned.length > 11) return false;
    
    // 明らかに間違っているパターンを除外
    if (cleaned.startsWith('0000') || cleaned === '0000000000') return false;
    
    return true;
  }

  /**
   * クレジットカード番号の妥当性チェック
   */
  private isValidCreditCard(cardNumber: string): boolean {
    const cleaned = cardNumber.replace(/[-\s]/g, '');
    
    // 基本的な桁数チェック
    if (cleaned.length < 13 || cleaned.length > 19) return false;
    
    // 全て同じ数字は無効
    if (/^(\d)\1+$/.test(cleaned)) return false;
    
    // 簡易的なLuhnアルゴリズムチェック
    return this.luhnCheck(cleaned);
  }

  /**
   * 日本語名前の妥当性チェック
   */
  private isValidJapaneseName(name: string): boolean {
    // 基本的な長さチェック
    if (name.length < 2 || name.length > 8) return false;
    
    // 漢字・ひらがな・カタカナのチェック
    const namePattern = /^[一-龯々〇ひらがなカタカナ\u3041-\u3096\u30A1-\u30FA]+$/;
    return namePattern.test(name);
  }

  /**
   * Luhnアルゴリズムによるチェックサム検証
   */
  private luhnCheck(cardNumber: string): boolean {
    let sum = 0;
    let isEven = false;
    
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }

  /**
   * 中感度での信頼度判定
   */
  private isMediumConfidenceMatch(
    text: string, 
    pattern: PIIPattern, 
    context: DetectionContext
  ): boolean {
    // フォームフィールドやラベルのコンテキストがあるか
    if (context.formContext && PIIPatterns.isLikelyPII(text, context.formContext)) {
      return true;
    }

    // 特定の要素タイプでの検出
    const highConfidenceElements = ['input', 'textarea', 'span', 'div'];
    if (highConfidenceElements.includes(context.elementType)) {
      return true;
    }

    return false;
  }

  /**
   * マスキングタイプを取得
   */
  private getMaskingType(type: string): MaskingType {
    return this.settings.maskingTypes[type] || MaskingType.BLUR;
  }

  /**
   * 後処理：重複除去、優先度付けなど
   */
  private postProcessMatches(matches: PIIMatch[]): PIIMatch[] {
    // 重複する範囲のマッチを除去
    const filtered = this.removeDuplicateMatches(matches);
    
    // 要素ごとにソート
    filtered.sort((a, b) => {
      if (a.element !== b.element) {
        return 0;
      }
      return a.startIndex - b.startIndex;
    });

    return filtered;
  }

  /**
   * 重複するマッチを除去
   */
  private removeDuplicateMatches(matches: PIIMatch[]): PIIMatch[] {
    const result: PIIMatch[] = [];
    
    matches.forEach(match => {
      const overlapping = result.find(existing => 
        existing.element === match.element &&
        this.isOverlapping(existing, match)
      );

      if (!overlapping) {
        result.push(match);
      } else {
        // より長いマッチまたは高優先度のマッチを保持
        if (this.shouldReplaceMatch(overlapping, match)) {
          const index = result.indexOf(overlapping);
          result[index] = match;
        }
      }
    });

    return result;
  }

  /**
   * マッチが重複しているかチェック
   */
  private isOverlapping(match1: PIIMatch, match2: PIIMatch): boolean {
    return !(match1.endIndex <= match2.startIndex || match2.endIndex <= match1.startIndex);
  }

  /**
   * マッチを置き換えるべきかどうか
   */
  private shouldReplaceMatch(existing: PIIMatch, newMatch: PIIMatch): boolean {
    // より長いマッチを優先
    if (newMatch.text.length > existing.text.length) {
      return true;
    }

    // 同じ長さの場合は優先度で判定
    const priorityOrder = ['creditCard', 'myNumber', 'email', 'phone', 'address', 'japaneseName'];
    const existingPriority = priorityOrder.indexOf(existing.type);
    const newPriority = priorityOrder.indexOf(newMatch.type);

    return newPriority < existingPriority;
  }

  /**
   * 設定を更新
   */
  updateSettings(settings: ExtensionSettings): void {
    this.settings = settings;
    this.patterns = this.initializePatterns();
  }
}