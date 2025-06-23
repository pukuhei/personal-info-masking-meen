export interface PIIPattern {
  name: string;
  pattern: string; // RegExpの文字列表現
  maskingType: MaskingType;
  enabled: boolean;
}

export enum MaskingType {
  MOSAIC = 'mosaic',
  BLUR = 'blur',
  BLACKOUT = 'blackout',
  PIXELATE = 'pixelate'
}

export interface PIIMatch {
  text: string;
  startIndex: number;
  endIndex: number;
  type: string;
  element: HTMLElement;
  maskingType: MaskingType;
}

export interface ExtensionSettings {
  enabled: boolean;
  maskingTypes: Record<string, MaskingType>;
  patterns: PIIPattern[];
  realTimeProcessing: boolean;
  sensitivity: 'low' | 'medium' | 'high';
}

export interface MessagePayload {
  type: 'TOGGLE_MASKING' | 'UPDATE_SETTINGS' | 'GET_SETTINGS' | 'PROCESS_PAGE';
  data?: any;
}

export interface MaskingEffectOptions {
  intensity: number;
  blockSize?: number;
  radius?: number;
}