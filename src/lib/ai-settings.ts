import { getSecureStore } from './secure-store';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface AiSettings {
  model: string;
  reasoningEffort: ReasoningEffort;
}

const KEY = 'ai_settings';

export const DEFAULT_SETTINGS: AiSettings = {
  // ChatGPT OAuth(Codex backend) 기본. 확인: https://learn.chatgpt.com/docs/models
  // sol 이 아니라 terra 인 이유는 OAUTH_MODELS 주석 참고.
  model: 'gpt-5.6-terra',
  reasoningEffort: 'medium',
};

export interface ModelOption {
  id: string;
  label: string;
  reasoning: boolean;
  /** 이 모델을 받아주는 인증 방식. Codex backend 는 ChatGPT 계정으로 부를 수 있는 모델이 제한된다. */
  auth: 'oauth' | 'apikey';
  note?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  // ChatGPT OAuth (Codex) 전용 — https://learn.chatgpt.com/docs/models
  { id: 'gpt-5.6-sol',   label: 'GPT-5.6 sol',   reasoning: true, auth: 'oauth', note: 'ChatGPT · 플래그십, 코딩/리서치 최강' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 terra', reasoning: true, auth: 'oauth', note: 'ChatGPT · 균형, 기본값' },
  { id: 'gpt-5.6-luna',  label: 'GPT-5.6 luna',  reasoning: true, auth: 'oauth', note: 'ChatGPT · 빠르고 가장 저렴' },
  { id: 'gpt-5.5',       label: 'GPT-5.5',       reasoning: true, auth: 'oauth', note: 'ChatGPT · 이전 세대 플래그십' },
  // API Key 전용 (Platform API)
  { id: 'gpt-5',       label: 'GPT-5',       reasoning: true,  auth: 'apikey', note: 'API Key 전용' },
  { id: 'gpt-5-mini',  label: 'GPT-5 mini',  reasoning: true,  auth: 'apikey', note: 'API Key 전용 · 저렴' },
  { id: 'gpt-4o',      label: 'GPT-4o',      reasoning: false, auth: 'apikey', note: 'API Key 전용 · 빠른 응답' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', reasoning: false, auth: 'apikey', note: 'API Key 전용 · 가장 저렴' },
];

// Codex backend(ChatGPT 계정 로그인)가 받아주는 모델. Platform API 전용 모델
// (gpt-4o 등)을 여기로 보내면 400 이므로 resolveModelForAuth 로 걸러낸다.
// 주의: sol 은 요금제를 탄다. team 플랜에서는 200 을 확인했지만 Plus 에서는
// "not supported when using Codex with a ChatGPT account" 400 보고가 있다
// (openai/codex#31905). 그래서 기본값은 어느 플랜에서나 도는 terra 로 둔다.
export const OAUTH_MODELS: readonly string[] = MODEL_OPTIONS
  .filter(m => m.auth === 'oauth')
  .map(m => m.id);

export const OAUTH_DEFAULT_MODEL = 'gpt-5.6-terra';

/** 저장된 모델이 이 인증 방식에서 못 쓰는 값이면 안전한 기본값으로 교체한다. */
export function resolveModelForAuth(model: string, isOAuth: boolean): string {
  if (!isOAuth) return model || DEFAULT_SETTINGS.model;
  return OAUTH_MODELS.includes(model) ? model : OAUTH_DEFAULT_MODEL;
}

const REASONING_RX = /^(gpt-[5-9]|o[1-9])/i;

export function supportsReasoning(model: string): boolean {
  const known = MODEL_OPTIONS.find(m => m.id === model);
  if (known) return known.reasoning;
  return REASONING_RX.test(model);
}

export async function getAiSettings(): Promise<AiSettings> {
  const secure = await getSecureStore();
  const s = await secure.getObject<Partial<AiSettings>>(KEY);
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function setAiSettings(patch: Partial<AiSettings>): Promise<AiSettings> {
  const cur = await getAiSettings();
  const merged: AiSettings = { ...cur, ...patch };
  const secure = await getSecureStore();
  await secure.setObject(KEY, merged);
  return merged;
}
