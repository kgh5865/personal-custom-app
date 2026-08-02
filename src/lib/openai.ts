import { getAuthMode, getOAuth } from './oauth';

export interface OpenAIDeps {
  fetch: typeof fetch;
  getAuthHeader: () => Promise<string>;
  getExtraHeaders?: () => Promise<Record<string, string>>;
  getEndpoint?: () => Promise<string>;
  getModel?: () => Promise<string>;
}

export interface ResponsesInput {
  input: any[];
  tools: any[];
  model?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
}

export interface ResponsesResult {
  text: string;
  toolCalls: ToolCall[];
  raw: any;
}

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, '');
}

export function createOpenAIClient(deps: OpenAIDeps) {
  return {
    async respond(req: ResponsesInput): Promise<ResponsesResult> {
      const authHeader = await deps.getAuthHeader();
      const endpoint = deps.getEndpoint ? await deps.getEndpoint() : DEFAULT_ENDPOINT;
      const model = req.model ?? (deps.getModel ? await deps.getModel() : DEFAULT_MODEL);
      const extra = deps.getExtraHeaders ? await deps.getExtraHeaders() : {};
      const body = {
        model,
        messages: req.input,
        tools: req.tools,
      };
      const r = await deps.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          ...extra,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`openai ${r.status}: ${text}`);
      }
      const data = await r.json();
      const choice = data.choices?.[0];
      const message = choice?.message ?? {};
      const text = typeof message.content === 'string' ? message.content : '';
      const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      const toolCalls: ToolCall[] = rawToolCalls
        .filter((tc: any) => tc && tc.function)
        .map((tc: any) => {
          let args: any = {};
          const raw = tc.function.arguments;
          if (typeof raw === 'string' && raw.length > 0) {
            try { args = JSON.parse(raw); } catch { args = {}; }
          } else if (raw && typeof raw === 'object') {
            args = raw;
          }
          return { id: tc.id, name: tc.function.name, args };
        });
      return { text, toolCalls, raw: data };
    },
  };
}

export type OpenAIClient = ReturnType<typeof createOpenAIClient>;

export async function getOpenAIClient(): Promise<OpenAIClient> {
  return createOpenAIClient({
    fetch: globalThis.fetch.bind(globalThis),
    getAuthHeader: async () => {
      const mode = await getAuthMode();
      if (!mode) throw new Error('not authenticated');
      if (mode.mode === 'apikey') return `Bearer ${mode.apiKey}`;
      if (mode.mode === 'gateway') return `Bearer ${mode.token}`;
      const t = await (await getOAuth()).getValidTokens();
      return `Bearer ${t.access}`;
    },
    getExtraHeaders: async () => {
      const mode = await getAuthMode();
      if (mode?.mode !== 'oauth') return {};
      const t = await (await getOAuth()).getValidTokens();
      // ChatGPT 구독 토큰으로 호출할 때 OpenAI 백엔드가 요구하는 계정 식별자
      return t.accountId ? { 'chatgpt-account-id': t.accountId } : {};
    },
    getEndpoint: async () => {
      const mode = await getAuthMode();
      if (mode && mode.mode === 'gateway') {
        return `${normalizeBaseURL(mode.baseURL)}/v1/chat/completions`;
      }
      return DEFAULT_ENDPOINT;
    },
    getModel: async () => {
      const mode = await getAuthMode();
      if (mode && mode.mode === 'gateway' && mode.model) return mode.model;
      return DEFAULT_MODEL;
    },
  });
}
