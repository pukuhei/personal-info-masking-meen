import { MaskingType, MaskingEffectOptions } from '../types';

export interface MaskingResult {
  success: boolean;
  originalElement: HTMLElement;
  maskedElement?: HTMLCanvasElement;
  error?: string;
}

export class MaskingEngine {
  private static instance: MaskingEngine;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  static getInstance(): MaskingEngine {
    if (!MaskingEngine.instance) {
      MaskingEngine.instance = new MaskingEngine();
    }
    return MaskingEngine.instance;
  }

  /**
   * テキスト要素にマスキング効果を適用
   */
  async applyTextMasking(
    element: HTMLElement,
    maskingType: MaskingType,
    options: MaskingEffectOptions = { intensity: 1 }
  ): Promise<MaskingResult> {
    try {
      switch (maskingType) {
        case MaskingType.MOSAIC:
          return this.applyMosaicEffect(element, options);
        case MaskingType.BLUR:
          return this.applyBlurEffect(element, options);
        case MaskingType.BLACKOUT:
          return this.applyBlackoutEffect(element, options);
        case MaskingType.PIXELATE:
          return this.applyPixelateEffect(element, options);
        default:
          return this.applyBlurEffect(element, options);
      }
    } catch (error) {
      return {
        success: false,
        originalElement: element,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * モザイク効果を適用
   */
  private async applyMosaicEffect(
    element: HTMLElement,
    options: MaskingEffectOptions
  ): Promise<MaskingResult> {
    const blockSize = options.blockSize || 8;
    
    // 要素をCanvasに描画
    const elementRect = element.getBoundingClientRect();
    const canvas = this.createCanvas(elementRect.width, elementRect.height);
    const ctx = canvas.getContext('2d')!;

    // テキストスタイルを取得
    const computedStyle = window.getComputedStyle(element);
    this.applyTextStyle(ctx, computedStyle);

    // 元のテキストを描画
    const text = element.textContent || '';
    ctx.fillText(text, 0, parseInt(computedStyle.fontSize) || 16);

    // モザイク処理
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mosaicData = this.createMosaicEffect(imageData, blockSize);
    ctx.putImageData(mosaicData, 0, 0);

    return {
      success: true,
      originalElement: element,
      maskedElement: canvas
    };
  }

  /**
   * ぼかし効果を適用
   */
  private async applyBlurEffect(
    element: HTMLElement,
    options: MaskingEffectOptions
  ): Promise<MaskingResult> {
    const radius = options.radius || 3;
    
    // CSS filter を使用した簡単なぼかし
    const maskedElement = element.cloneNode(true) as HTMLElement;
    maskedElement.style.filter = `blur(${radius}px)`;
    maskedElement.style.webkitFilter = `blur(${radius}px)`;

    return {
      success: true,
      originalElement: element,
      maskedElement: maskedElement as any // HTMLCanvasElementの代わりにHTMLElementを返す
    };
  }

  /**
   * 黒塗り効果を適用
   */
  private async applyBlackoutEffect(
    element: HTMLElement,
    options: MaskingEffectOptions
  ): Promise<MaskingResult> {
    const elementRect = element.getBoundingClientRect();
    const canvas = this.createCanvas(elementRect.width, elementRect.height);
    const ctx = canvas.getContext('2d')!;

    // 黒い四角形を描画
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return {
      success: true,
      originalElement: element,
      maskedElement: canvas
    };
  }

  /**
   * ピクセル化効果を適用
   */
  private async applyPixelateEffect(
    element: HTMLElement,
    options: MaskingEffectOptions
  ): Promise<MaskingResult> {
    const pixelSize = options.blockSize || 6;
    
    const elementRect = element.getBoundingClientRect();
    const canvas = this.createCanvas(elementRect.width, elementRect.height);
    const ctx = canvas.getContext('2d')!;

    // テキストスタイルを適用
    const computedStyle = window.getComputedStyle(element);
    this.applyTextStyle(ctx, computedStyle);

    // 元のテキストを描画
    const text = element.textContent || '';
    ctx.fillText(text, 0, parseInt(computedStyle.fontSize) || 16);

    // ピクセル化処理
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixelatedData = this.createPixelateEffect(imageData, pixelSize);
    ctx.putImageData(pixelatedData, 0, 0);

    return {
      success: true,
      originalElement: element,
      maskedElement: canvas
    };
  }

  /**
   * Canvasを作成
   */
  private createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Canvasにテキストスタイルを適用
   */
  private applyTextStyle(ctx: CanvasRenderingContext2D, style: CSSStyleDeclaration): void {
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'top';
  }

  /**
   * モザイク効果を作成
   */
  private createMosaicEffect(imageData: ImageData, blockSize: number): ImageData {
    const { data, width, height } = imageData;
    const result = new ImageData(width, height);

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        // ブロック内の平均色を計算
        const avgColor = this.calculateAverageColor(data, x, y, blockSize, width, height);
        
        // ブロックを平均色で塗りつぶし
        this.fillBlock(result.data, x, y, blockSize, width, height, avgColor);
      }
    }

    return result;
  }

  /**
   * ピクセル化効果を作成
   */
  private createPixelateEffect(imageData: ImageData, pixelSize: number): ImageData {
    const { data, width, height } = imageData;
    const result = new ImageData(width, height);

    for (let y = 0; y < height; y += pixelSize) {
      for (let x = 0; x < width; x += pixelSize) {
        // ピクセルブロックの代表色を取得
        const representativeColor = this.getRepresentativeColor(data, x, y, pixelSize, width, height);
        
        // ブロックを代表色で塗りつぶし
        this.fillBlock(result.data, x, y, pixelSize, width, height, representativeColor);
      }
    }

    return result;
  }

  /**
   * ブロック内の平均色を計算
   */
  private calculateAverageColor(
    data: Uint8ClampedArray,
    startX: number,
    startY: number,
    blockSize: number,
    width: number,
    height: number
  ): [number, number, number, number] {
    let r = 0, g = 0, b = 0, a = 0;
    let count = 0;

    for (let y = startY; y < Math.min(startY + blockSize, height); y++) {
      for (let x = startX; x < Math.min(startX + blockSize, width); x++) {
        const index = (y * width + x) * 4;
        r += data[index];
        g += data[index + 1];
        b += data[index + 2];
        a += data[index + 3];
        count++;
      }
    }

    return count > 0 ? [r / count, g / count, b / count, a / count] : [0, 0, 0, 0];
  }

  /**
   * 代表色を取得（ピクセル化用）
   */
  private getRepresentativeColor(
    data: Uint8ClampedArray,
    startX: number,
    startY: number,
    blockSize: number,
    width: number,
    height: number
  ): [number, number, number, number] {
    // 左上のピクセルを代表色として使用
    const index = (startY * width + startX) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  }

  /**
   * ブロックを指定色で塗りつぶし
   */
  private fillBlock(
    data: Uint8ClampedArray,
    startX: number,
    startY: number,
    blockSize: number,
    width: number,
    height: number,
    color: [number, number, number, number]
  ): void {
    for (let y = startY; y < Math.min(startY + blockSize, height); y++) {
      for (let x = startX; x < Math.min(startX + blockSize, width); x++) {
        const index = (y * width + x) * 4;
        data[index] = color[0];     // R
        data[index + 1] = color[1]; // G
        data[index + 2] = color[2]; // B
        data[index + 3] = color[3]; // A
      }
    }
  }

  /**
   * 高度なマスキング：要素を画像として取得してマスキング
   */
  async captureAndMaskElement(
    element: HTMLElement,
    maskingType: MaskingType,
    options: MaskingEffectOptions = { intensity: 1 }
  ): Promise<MaskingResult> {
    try {
      // html2canvasの代替として、より軽量な方法を使用
      const canvas = await this.elementToCanvas(element);
      if (!canvas) {
        throw new Error('Failed to capture element');
      }

      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      let processedData: ImageData;
      switch (maskingType) {
        case MaskingType.MOSAIC:
          processedData = this.createMosaicEffect(imageData, options.blockSize || 8);
          break;
        case MaskingType.PIXELATE:
          processedData = this.createPixelateEffect(imageData, options.blockSize || 6);
          break;
        case MaskingType.BLUR:
          processedData = this.createBlurEffect(imageData, options.radius || 3);
          break;
        case MaskingType.BLACKOUT:
          processedData = this.createBlackoutEffect(imageData);
          break;
        default:
          processedData = imageData;
      }

      ctx.putImageData(processedData, 0, 0);

      return {
        success: true,
        originalElement: element,
        maskedElement: canvas
      };
    } catch (error) {
      return {
        success: false,
        originalElement: element,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 要素をCanvasに変換（簡易版）
   */
  private async elementToCanvas(element: HTMLElement): Promise<HTMLCanvasElement | null> {
    const rect = element.getBoundingClientRect();
    const canvas = this.createCanvas(rect.width, rect.height);
    const ctx = canvas.getContext('2d')!;

    // SVGを使用してHTMLを画像化（制限あり）
    const data = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">${element.outerHTML}</div>
        </foreignObject>
      </svg>
    `;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
    });
  }

  /**
   * ぼかし効果を作成（ImageData版）
   */
  private createBlurEffect(imageData: ImageData, radius: number): ImageData {
    // 簡易的なボックスブラー
    const { data, width, height } = imageData;
    const result = new ImageData(width, height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const blurredPixel = this.calculateBlurredPixel(data, x, y, radius, width, height);
        const index = (y * width + x) * 4;
        result.data[index] = blurredPixel[0];
        result.data[index + 1] = blurredPixel[1];
        result.data[index + 2] = blurredPixel[2];
        result.data[index + 3] = blurredPixel[3];
      }
    }
    
    return result;
  }

  /**
   * ぼかしピクセルを計算
   */
  private calculateBlurredPixel(
    data: Uint8ClampedArray,
    x: number,
    y: number,
    radius: number,
    width: number,
    height: number
  ): [number, number, number, number] {
    let r = 0, g = 0, b = 0, a = 0;
    let count = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = Math.max(0, Math.min(width - 1, x + dx));
        const ny = Math.max(0, Math.min(height - 1, y + dy));
        const index = (ny * width + nx) * 4;
        
        r += data[index];
        g += data[index + 1];
        b += data[index + 2];
        a += data[index + 3];
        count++;
      }
    }

    return [r / count, g / count, b / count, a / count];
  }

  /**
   * 黒塗り効果を作成（ImageData版）
   */
  private createBlackoutEffect(imageData: ImageData): ImageData {
    const { width, height } = imageData;
    const result = new ImageData(width, height);
    
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = 0;     // R
      result.data[i + 1] = 0; // G
      result.data[i + 2] = 0; // B
      result.data[i + 3] = 255; // A
    }
    
    return result;
  }
}