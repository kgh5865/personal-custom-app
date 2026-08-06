import { getAuthMode, getOAuth } from './oauth';
import { getAiSettings, resolveModelForAuth, supportsReasoning, type ReasoningEffort } from './ai-settings';

export type ApiStyle = 'chat' | 'responses';

export interface OpenAIDeps {
  fetch: typeof fetch;
  getAuthHeader: () => Promise<string>;
  getExtraHeaders?: () => Promise<Record<string, string>>;
  getEndpoint?: () => Promise<string>;
  getModel?: () => Promise<string>;
  getApiStyle?: () => Promise<ApiStyle>;
  getReasoningEffort?: () => Promise<ReasoningEffort | null>;
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
const CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// Codex OAuth 토큰(app_EMoamEEZ...) 은 api.openai.com/v1/responses 에서 401 이 뜬다.
// ChatGPT backend 의 codex 라우트만 이 토큰을 받아준다.
const CODEX_RESPONSES_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
// Codex backend 는 `version` 헤더로 클라이언트 버전을 게이팅한다. 너무 낮으면 모델과
// 무관하게 전부 400:
//   {"detail":"The '<model>' model requires a newer version of Codex.
//              Please upgrade to the latest app or CLI and try again."}
// 실제로 0.20.0 → 전 모델 400, 0.146.1 → 전 모델 200 인 것을 확인했다.
// 새 모델이 나온 뒤 갑자기 위 400 이 뜨면 여기를 올리면 된다. 현재 릴리스 확인:
//   npm view @openai/codex version
const CODEX_CLIENT_VERSION = '0.146.1';

function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, '');
}

export function createOpenAIClient(deps: OpenAIDeps) {
  return {
    async respond(req: ResponsesInput): Promise<ResponsesResult> {
      const style: ApiStyle = deps.getApiStyle ? await deps.getApiStyle() : 'chat';
      const authHeader = await deps.getAuthHeader();
      const model = req.model ?? (deps.getModel ? await deps.getModel() : DEFAULT_MODEL);
      const extra = deps.getExtraHeaders ? await deps.getExtraHeaders() : {};
      const effort = deps.getReasoningEffort ? await deps.getReasoningEffort() : null;
      const endpoint = deps.getEndpoint
        ? await deps.getEndpoint()
        : (style === 'responses' ? CODEX_RESPONSES_ENDPOINT : CHAT_ENDPOINT);

      const body = style === 'responses'
        ? buildResponsesBody(req, model, effort)
        : buildChatBody(req, model, effort);

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
        throw new Error(`openai ${r.status}: ${truncate(text, 500)}`);
      }
      if (style === 'responses') {
        // stream=true 응답은 text/event-stream. CapacitorHttp 는 스트리밍이 아니라
        // 완료된 전체 본문을 텍스트로 준다.
        const text = await r.text();
        return parseResponsesStream(text);
      }
      const data = await r.json();
      return parseChatResult(data);
    },
  };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ─── Chat Completions ──────────────────────────────────────────────────────
function buildChatBody(req: ResponsesInput, model: string, effort: ReasoningEffort | null) {
  const body: any = {
    model,
    messages: req.input,
    tools: req.tools,
  };
  if (effort && supportsReasoning(model)) {
    body.reasoning_effort = effort;
  }
  return body;
}

function parseChatResult(data: any): ResponsesResult {
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
}

// ─── Responses API ─────────────────────────────────────────────────────────
// bridge.ts 는 Chat Completions 스타일 메시지를 만들지만, ChatGPT OAuth 토큰은
// /v1/chat/completions 를 받지 않고 /v1/responses 만 받는다. 여기서 두 스키마를
// 상호 변환한다.
function buildResponsesBody(req: ResponsesInput, model: string, effort: ReasoningEffort | null) {
  const { instructions, input } = chatMessagesToResponsesInput(req.input);
  const body: any = {
    model,
    input,
    tools: req.tools.map(chatToolToResponsesTool),
    tool_choice: 'auto',
    parallel_tool_calls: true,
    include: ['reasoning.encrypted_content'],
    store: false,
    // Codex backend 는 stream=true 만 받는다. 응답은 SSE 로 오지만 CapacitorHttp
    // 는 스트리밍을 지원하지 않으므로 전체 텍스트를 받아서 파싱한다.
    stream: true,
  };
  if (instructions) body.instructions = instructions;
  if (effort && supportsReasoning(model)) {
    body.reasoning = { effort, summary: 'auto' };
  }
  return body;
}

function chatMessagesToResponsesInput(messages: any[]): { instructions: string; input: any[] } {
  const systemParts: string[] = [];
  const out: any[] = [];
  for (const m of messages) {
    if (!m) continue;
    if (m.role === 'system') {
      if (typeof m.content === 'string' && m.content) systemParts.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      out.push({
        type: 'function_call_output',
        call_id: m.tool_call_id,
        output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
      });
      continue;
    }
    if (m.role === 'assistant') {
      if (typeof m.content === 'string' && m.content) {
        out.push({ role: 'assistant', content: [{ type: 'output_text', text: m.content }] });
      }
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          if (!tc || !tc.function) continue;
          const args = typeof tc.function.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function.arguments ?? {});
          out.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function.name,
            arguments: args,
          });
        }
      }
      continue;
    }
    if (m.role === 'user') {
      const txt = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      // Codex backend 는 content 를 배열 파트로 요구 (input_text)
      out.push({ role: 'user', content: [{ type: 'input_text', text: txt }] });
      continue;
    }
    // passthrough for already-Responses-shaped items
    out.push(m);
  }
  return { instructions: systemParts.join('\n\n'), input: out };
}

function chatToolToResponsesTool(t: any): any {
  if (!t) return t;
  if (t.type === 'function' && t.function) {
    return {
      type: 'function',
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    };
  }
  return t;
}

// SSE 프레임을 훑어서 최종 response.completed 이벤트의 완성 output 을 뽑는다.
// 없으면 delta 이벤트를 누적해서 재구성.
function parseResponsesStream(sse: string): ResponsesResult {
  const events: { event?: string; data: any }[] = [];
  for (const chunk of sse.split(/\n\n+/)) {
    if (!chunk.trim()) continue;
    let ev: string | undefined;
    const datas: string[] = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) datas.push(line.slice(5).trim());
    }
    if (datas.length === 0) continue;
    const raw = datas.join('\n');
    if (raw === '[DONE]') continue;
    try { events.push({ event: ev, data: JSON.parse(raw) }); } catch { /* ignore */ }
  }
  // 우선: response.output_item.done 이벤트들이 완성된 항목을 하나씩 실어 보낸다.
  // Codex backend 는 response.completed 의 output 을 빈 배열([])로 보내므로
  // completed 만 보면 항상 빈 응답이 된다. done 이벤트가 유일한 신뢰 소스다.
  const doneItems = events
    .filter(e => (e.event ?? e.data?.type) === 'response.output_item.done')
    .map(e => e.data?.item)
    .filter(Boolean);
  if (doneItems.length > 0) return parseResponsesResult({ output: doneItems });

  // 표준 Responses API(및 테스트 픽스처)는 completed 에 output 을 채워 보낸다.
  const completed = [...events].reverse().find(e =>
    e.event === 'response.completed' || e.data?.type === 'response.completed'
  );
  if (completed?.data?.response?.output?.length) return parseResponsesResult(completed.data.response);
  // 폴백: delta 누적
  const textParts: string[] = [];
  const callsById = new Map<string, { call_id: string; name: string; args: string }>();
  for (const { event, data } of events) {
    const type = event ?? data?.type;
    if (type === 'response.output_text.delta' && typeof data.delta === 'string') {
      textParts.push(data.delta);
    } else if (type === 'response.output_item.added' && data.item?.type === 'function_call') {
      const it = data.item;
      callsById.set(it.id ?? it.call_id, { call_id: it.call_id ?? it.id, name: it.name, args: it.arguments ?? '' });
    } else if (type === 'response.function_call_arguments.delta') {
      const cur = callsById.get(data.item_id);
      if (cur && typeof data.delta === 'string') cur.args += data.delta;
    }
  }
  const toolCalls: ToolCall[] = [];
  for (const c of callsById.values()) {
    let a: any = {};
    try { a = c.args ? JSON.parse(c.args) : {}; } catch { /* */ }
    toolCalls.push({ id: c.call_id, name: c.name, args: a });
  }
  return { text: textParts.join(''), toolCalls, raw: { events } };
}

function parseResponsesResult(data: any): ResponsesResult {
  const output = Array.isArray(data.output) ? data.output : [];
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const item of output) {
    if (!item) continue;
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c && (c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') {
          textParts.push(c.text);
        }
      }
    } else if (item.type === 'function_call') {
      let args: any = {};
      const raw = item.arguments;
      if (typeof raw === 'string' && raw.length > 0) {
        try { args = JSON.parse(raw); } catch { args = {}; }
      } else if (raw && typeof raw === 'object') {
        args = raw;
      }
      toolCalls.push({ id: item.call_id ?? item.id, name: item.name, args });
    }
  }
  // Fallback: some responses include top-level `output_text` shortcut
  if (textParts.length === 0 && typeof data.output_text === 'string') {
    textParts.push(data.output_text);
  }
  return { text: textParts.join(''), toolCalls, raw: data };
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
      // Codex backend 가 정식 클라이언트로 인식하도록 CLI 헤더 세트를 모두 흉내낸다.
      const h: Record<string, string> = {
        originator: 'codex_cli_rs',
        'OpenAI-Beta': 'responses=experimental',
        version: CODEX_CLIENT_VERSION,
        'User-Agent': `codex_cli_rs/${CODEX_CLIENT_VERSION}`,
        session_id: crypto.randomUUID(),
      };
      if (t.accountId) h['chatgpt-account-id'] = t.accountId;
      return h;
    },
    getApiStyle: async () => {
      const mode = await getAuthMode();
      // OAuth JWT 는 chat/completions 를 받지 않으므로 responses 로 라우팅
      return mode?.mode === 'oauth' ? 'responses' : 'chat';
    },
    getEndpoint: async () => {
      const mode = await getAuthMode();
      if (mode && mode.mode === 'gateway') {
        return `${normalizeBaseURL(mode.baseURL)}/v1/chat/completions`;
      }
      if (mode?.mode === 'oauth') return CODEX_RESPONSES_ENDPOINT;
      return CHAT_ENDPOINT;
    },
    getModel: async () => {
      const mode = await getAuthMode();
      // 게이트웨이는 서버가 강제하는 모델을 그대로 사용
      if (mode && mode.mode === 'gateway' && mode.model) return mode.model;
      const s = await getAiSettings();
      // Codex backend 는 받아주는 모델이 정해져 있다. Platform API 전용 모델
      // (gpt-4o, 그리고 gpt-5.6-sol) 이 저장돼있으면 안전한 기본으로 오버라이드.
      return resolveModelForAuth(s.model, mode?.mode === 'oauth') || DEFAULT_MODEL;
    },
    getReasoningEffort: async () => {
      const s = await getAiSettings();
      return s.reasoningEffort ?? null;
    },
  });
}
