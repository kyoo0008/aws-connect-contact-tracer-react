/**
 * Gemini Service
 *
 * Gemini Lambda API와 통신하는 서비스
 */

import { AWSConfig } from '@/types/contact.types';

const getApiBaseUrl = (): string => {
  return 'http://localhost:8081';
};

export interface GeminiFile {
  mimeType: string;
  data: string; // base64 encoded
}

export interface GeminiPromptRequest {
  prompt: string;
  model: string;
  files?: GeminiFile[];
}

export interface GeminiPromptResponse {
  geminiResponse: string;
  geminiModel: string;
  geminiRegion: string;
  processingTime: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Gemini Simple Prompt API 호출
 */
export async function callGeminiPrompt(
  request: GeminiPromptRequest,
  config: AWSConfig
): Promise<GeminiPromptResponse> {
  const apiBaseUrl = getApiBaseUrl();

  const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-automation/simple-prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aws-region': config.region,
      'x-environment': config.environment,
      ...(config.credentials && {
        'x-aws-credentials': JSON.stringify(config.credentials),
      }),
    },
    body: JSON.stringify({
      prompt: request.prompt,
      model: request.model,
      files: request.files,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `API Error: ${response.status}`);
  }

  return response.json();
}

/**
 * 파일을 Base64로 변환
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/png;base64,xxxx 에서 xxxx 부분만 추출
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 파일 MIME 타입 가져오기
 */
export function getFileMimeType(file: File): string {
  return file.type || 'application/octet-stream';
}
