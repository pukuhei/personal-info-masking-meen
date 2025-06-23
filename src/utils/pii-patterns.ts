import { PIIPattern, MaskingType } from '../types';

/**
 * 個人情報検出用の正規表現パターン集
 */
export class PIIPatterns {
  /**
   * 日本語の姓名パターン
   */
  static readonly JAPANESE_NAME = {
    // 一般的な日本人の名前パターン（姓 名の形式）
    pattern: '[一-龯々〇]{1,4}\\s*[一-龯々〇]{1,4}(?=[さん|様|氏|君|ちゃん|くん]|$|\\s)',
    name: 'japaneseName',
    maskingType: MaskingType.BLUR,
    enabled: true
  };

  /**
   * メールアドレスパターン（RFC準拠）
   */
  static readonly EMAIL = {
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    name: 'email',
    maskingType: MaskingType.BLUR,
    enabled: true
  };

  /**
   * 日本の電話番号パターン
   */
  static readonly PHONE_JP = {
    // 固定電話、携帯電話、フリーダイヤルなど
    pattern: '(?:(?:\\+81|0)\\s?(?:\\d{1,4}[-\\s]?)?\\d{1,4}[-\\s]?\\d{4}|\\d{3,4}[-\\s]?\\d{1,4}[-\\s]?\\d{4})',
    name: 'phone',
    maskingType: MaskingType.MOSAIC,
    enabled: true
  };

  /**
   * クレジットカード番号パターン
   */
  static readonly CREDIT_CARD = {
    // Visa, MasterCard, AmEx, Discoverなど
    pattern: '\\b(?:4\\d{3}|5[1-5]\\d{2}|3[47]\\d{2}|6011)[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
    name: 'creditCard',
    maskingType: MaskingType.PIXELATE,
    enabled: true
  };

  /**
   * 日本の郵便番号パターン
   */
  static readonly POSTAL_CODE_JP = {
    pattern: '\\b\\d{3}[-\\s]?\\d{4}\\b',
    name: 'postalCode',
    maskingType: MaskingType.BLACKOUT,
    enabled: true
  };

  /**
   * IPアドレスパターン
   */
  static readonly IP_ADDRESS = {
    // IPv4アドレス
    pattern: '\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b',
    name: 'ipAddress',
    maskingType: MaskingType.BLUR,
    enabled: false // デフォルトでは無効
  };

  /**
   * 日本の住所パターン
   */
  static readonly ADDRESS_JP = {
    // 都道府県＋市区町村のパターン
    pattern: '[都道府県].*?[市区町村郡][一-龯0-9一二三四五六七八九十百千]+(?:丁目|番地|号)?',
    name: 'address',
    maskingType: MaskingType.BLACKOUT,
    enabled: true
  };

  /**
   * マイナンバーパターン
   */
  static readonly MY_NUMBER = {
    // 12桁の個人番号
    pattern: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
    name: 'myNumber',
    maskingType: MaskingType.BLACKOUT,
    enabled: true
  };

  /**
   * 銀行口座番号パターン
   */
  static readonly BANK_ACCOUNT = {
    // 一般的な銀行口座番号（7桁）
    pattern: '\\b\\d{7}\\b',
    name: 'bankAccount',
    maskingType: MaskingType.PIXELATE,
    enabled: false // 誤検出が多いため初期無効
  };

  /**
   * 生年月日パターン
   */
  static readonly BIRTH_DATE = {
    // yyyy/mm/dd, yyyy-mm-dd, yyyy年mm月dd日など
    pattern: '(?:19|20)\\d{2}[年/-](?:0?[1-9]|1[0-2])[月/-](?:0?[1-9]|[12]\\d|3[01])[日]?',
    name: 'birthDate',
    maskingType: MaskingType.BLUR,
    enabled: true
  };

  /**
   * 全てのパターンを取得
   */
  static getAllPatterns(): PIIPattern[] {
    return [
      this.EMAIL,
      this.PHONE_JP,
      this.CREDIT_CARD,
      this.POSTAL_CODE_JP,
      this.JAPANESE_NAME,
      this.ADDRESS_JP,
      this.MY_NUMBER,
      this.BIRTH_DATE,
      this.IP_ADDRESS,
      this.BANK_ACCOUNT
    ];
  }

  /**
   * 有効なパターンのみを取得
   */
  static getEnabledPatterns(): PIIPattern[] {
    return this.getAllPatterns().filter(pattern => pattern.enabled);
  }

  /**
   * 特定の種類のパターンを取得
   */
  static getPatternByName(name: string): PIIPattern | undefined {
    return this.getAllPatterns().find(pattern => pattern.name === name);
  }

  /**
   * コンテキストに基づく検出精度向上のためのヘルパー関数
   */
  static isLikelyPII(text: string, context: string): boolean {
    const lowerContext = context.toLowerCase();
    const lowerText = text.toLowerCase();

    // フォーム要素のコンテキスト
    const formKeywords = ['名前', 'name', 'email', 'phone', '電話', '住所', 'address', 'birthday'];
    const hasFormContext = formKeywords.some(keyword => lowerContext.includes(keyword));

    // 個人情報らしいキーワードが近くにあるか
    const piiKeywords = ['個人情報', '氏名', '連絡先', '生年月日', 'プロフィール'];
    const hasPIIContext = piiKeywords.some(keyword => lowerContext.includes(keyword));

    return hasFormContext || hasPIIContext;
  }

  /**
   * 検出精度を調整するためのフィルター
   */
  static filterFalsePositives(matches: string[], type: string): string[] {
    switch (type) {
      case 'phone':
        // 電話番号の誤検出フィルター（時刻、日付などを除外）
        return matches.filter(match => {
          const cleaned = match.replace(/[-\s]/g, '');
          // 1000以下や明らかに短すぎるものを除外
          return cleaned.length >= 10 && !cleaned.startsWith('000');
        });

      case 'creditCard':
        // クレジットカードの簡易バリデーション（Luhnアルゴリズムは省略）
        return matches.filter(match => {
          const cleaned = match.replace(/[-\s]/g, '');
          return cleaned.length === 16 && !cleaned.startsWith('0000');
        });

      case 'japaneseName':
        // 名前の誤検出フィルター（一般的でない組み合わせを除外）
        return matches.filter(match => {
          return match.length >= 2 && match.length <= 8;
        });

      default:
        return matches;
    }
  }
}