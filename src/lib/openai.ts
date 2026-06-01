import { getAuthMode, getOAuth } from './oauth';

export interface OpenAIDeps {
  fetch: typeof fetch;
  getAuthHeader: () => Promise<string>;
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
const ENDPOINT = 'https://api.openai.com/v1/responses';

export function createOpenAIClient(deps: OpenAIDeps) {
  return {
    async respond(req: ResponsesInput): Promise<ResponsesResult> {
      const authHeader = await deps.getAuthHeader();
      const body = {
        model: req.model ?? DEFAULT_MODEL,
        input: req.input,
        tools: req.tools,
      };
      const r = await deps.fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`openai ${r.status}: ${text}`);
      }
      const data = await r.json();
      const text = (data.output ?? [])
        .filter((o: any) => o.type === 'message')
        .flatMap((o: any) => (o.content ?? [])
          .filter((c: any) => c.type === 'output_text')
          .map((c: any) => c.text))
        .join('');
      const toolCalls: ToolCall[] = (data.output ?? [])
        .filter((o: any) => o.type === 'function_call')
        .map((o: any) => ({ id: o.call_id, name: o.name, args: JSON.parse(o.arguments) }));
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
      const t = await (await getOAuth()).getValidTokens();
      return `Bearer ${t.access}`;
    },
  });
}
