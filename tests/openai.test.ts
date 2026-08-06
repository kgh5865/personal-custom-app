import { describe, it, expect, vi } from 'vitest';
import { createOpenAIClient, isAuthExpired, normalizeUsage, type OpenAIDeps } from '../src/lib/openai';
import {
  MODEL_OPTIONS, OAUTH_MODELS, OAUTH_DEFAULT_MODEL, DEFAULT_SETTINGS, resolveModelForAuth,
} from '../src/lib/ai-settings';

function makeDeps(fetchImpl: any, authHeader: string = 'Bearer testtoken', overrides: Partial<OpenAIDeps> = {}): OpenAIDeps {
  return {
    fetch: fetchImpl,
    getAuthHeader: async () => authHeader,
    ...overrides,
  };
}

function chatResp(message: any) {
  return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
}

describe('openai client', () => {
  it('sends POST to /v1/chat/completions with auth header and JSON body', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: 'hi' }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    await client.respond({ input: [{ role: 'user', content: 'hello' }], tools: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer testtoken');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('uses endpoint from deps.getEndpoint when provided', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: 'hi' }));
    const client = createOpenAIClient(makeDeps(fetchMock, 'Bearer x', {
      getEndpoint: async () => 'http://gw.example/v1/chat/completions',
    }));
    await client.respond({ input: [], tools: [] });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://gw.example/v1/chat/completions');
  });

  it('uses model from deps.getModel when req.model not provided', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: '' }));
    const client = createOpenAIClient(makeDeps(fetchMock, 'Bearer x', {
      getModel: async () => 'gpt-4o-mini',
    }));
    await client.respond({ input: [], tools: [] });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('includes chatgpt-account-id header when getExtraHeaders provides one', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: '' }));
    const client = createOpenAIClient(makeDeps(fetchMock, 'Bearer x', {
      getExtraHeaders: async () => ({ 'chatgpt-account-id': 'acct-42' }),
    }));
    await client.respond({ input: [], tools: [] });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['chatgpt-account-id']).toBe('acct-42');
  });

  it('uses default model when none provided and no getModel', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: '' }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    await client.respond({ input: [], tools: [] });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(typeof body.model).toBe('string');
    expect(body.model.length).toBeGreaterThan(0);
  });

  it('uses provided model when specified', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: '' }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    await client.respond({ input: [], tools: [], model: 'gpt-5' });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-5');
  });

  it('sends messages key (not input)', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: '' }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const msgs = [{ role: 'user', content: 'hello' }];
    await client.respond({ input: msgs, tools: [] });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual(msgs);
    expect(body.input).toBeUndefined();
  });

  it('extracts text from message content', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: 'hello world' }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('hello world');
    expect(r.toolCalls).toEqual([]);
  });

  it('extracts tool calls with parsed arguments', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'create_domain', arguments: '{"name":"memo","displayName":"메모"}' } }
      ],
    }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.toolCalls).toEqual([{ id: 'c1', name: 'create_domain', args: { name: 'memo', displayName: '메모' } }]);
  });

  it('handles output with both text and tool calls', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({
      content: '만들고 있어요',
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'create_domain', arguments: '{"name":"x","displayName":"X"}' } }
      ],
    }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('만들고 있어요');
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe('create_domain');
  });

  it('passes tools array in request body', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: '' }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const toolsArg = [{ type: 'function', function: { name: 'x', description: '', parameters: { type: 'object', properties: {} } } }];
    await client.respond({ input: [], tools: toolsArg });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual(toolsArg);
  });

  it('throws on non-200 response', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => new Response('bad request', { status: 400 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    await expect(client.respond({ input: [], tools: [] })).rejects.toThrow(/400/);
  });

  it('retries once after onUnauthorized succeeds and uses refreshed auth header', async () => {
    let authHeader = 'Bearer old';
    const fetchMock = vi.fn(async (_url: any, init: any) => {
      if (init.headers.Authorization === 'Bearer old') return new Response('unauthorized', { status: 401 });
      return chatResp({ content: 'ok' });
    });
    const onUnauthorized = vi.fn(async () => { authHeader = 'Bearer new'; return true; });
    const client = createOpenAIClient({
      fetch: fetchMock,
      getAuthHeader: async () => authHeader,
      onUnauthorized,
    });
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not retry when onUnauthorized returns false, and throws AuthExpiredError', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const onUnauthorized = vi.fn(async () => false);
    const client = createOpenAIClient(makeDeps(fetchMock, 'Bearer x', { onUnauthorized }));
    const err = await client.respond({ input: [], tools: [] }).catch(e => e);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(isAuthExpired(err)).toBe(true);
  });

  it('stops after one retry if the retried request is also 401', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const onUnauthorized = vi.fn(async () => true);
    const client = createOpenAIClient(makeDeps(fetchMock, 'Bearer x', { onUnauthorized }));
    const err = await client.respond({ input: [], tools: [] }).catch(e => e);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isAuthExpired(err)).toBe(true);
  });

  it('throws AuthExpiredError on 401 with no onUnauthorized dep, without retrying', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const err = await client.respond({ input: [], tools: [] }).catch(e => e);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(isAuthExpired(err)).toBe(true);
  });

  it('returns empty text when message has no content', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => chatResp({ content: null }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('');
    expect(r.toolCalls).toEqual([]);
  });

  it('preserves raw response for debugging', async () => {
    const raw = { id: 'r1', choices: [{ message: { content: 'hi' } }] };
    const fetchMock = vi.fn(async (_url: any, _init: any) => new Response(JSON.stringify(raw), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.raw).toEqual(raw);
  });
});

describe('openai client — Responses API mode', () => {
  // Codex 는 SSE 로 응답. 최종 output 은 response.completed 이벤트에 담긴다.
  function respResp(output: any[], extra: any = {}) {
    const body = `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { id: 'resp_1', output, ...extra } })}\n\ndata: [DONE]\n\n`;
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  it('sends body in Responses API shape (input/instructions/tools flat)', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => respResp([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] },
    ]));
    const client = createOpenAIClient({
      fetch: fetchMock,
      getAuthHeader: async () => 'Bearer jwt',
      getApiStyle: async () => 'responses',
      getModel: async () => 'gpt-5',
    });
    await client.respond({
      input: [
        { role: 'system', content: 'be nice' },
        { role: 'user', content: '안녕' },
      ],
      tools: [{ type: 'function', function: { name: 'x', description: 'd', parameters: { type: 'object', properties: {} } } }],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://chatgpt.com/backend-api/codex/responses');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-5');
    expect(body.instructions).toBe('be nice');
    expect(body.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: '안녕' }] }]);
    expect(body.tools).toEqual([{ type: 'function', name: 'x', description: 'd', parameters: { type: 'object', properties: {} } }]);
    expect(body.store).toBe(false);
    expect(body.tool_choice).toBe('auto');
    expect(body.messages).toBeUndefined();
  });

  // 실제 Codex backend 는 response.completed 의 output 을 빈 배열로 보내고,
  // 완성된 항목을 response.output_item.done 으로 하나씩 흘린다. (실기기 캡처 기준)
  function codexResp(items: any[]) {
    const frames = items.map((item, i) =>
      `event: response.output_item.done\ndata: ${JSON.stringify({ type: 'response.output_item.done', output_index: i, item })}\n\n`
    ).join('');
    const done = `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { id: 'resp_1', status: 'completed', output: [] } })}\n\ndata: [DONE]\n\n`;
    return new Response(frames + done, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  it('reads output from output_item.done when completed.output is empty', async () => {
    const fetchMock = vi.fn(async () => codexResp([
      { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '안녕하세요' }] },
    ]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x', getApiStyle: async () => 'responses',
    });
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('안녕하세요');
  });

  it('reads tool calls from output_item.done when completed.output is empty', async () => {
    const fetchMock = vi.fn(async () => codexResp([
      { id: 'fc_1', type: 'function_call', status: 'completed', call_id: 'call_abc',
        name: 'create_domain', arguments: '{"name":"memo","displayName":"메모","icon":"📝"}' },
    ]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x', getApiStyle: async () => 'responses',
    });
    const r = await client.respond({ input: [], tools: [] });
    expect(r.toolCalls).toEqual([
      { id: 'call_abc', name: 'create_domain', args: { name: 'memo', displayName: '메모', icon: '📝' } },
    ]);
  });

  it('extracts text from output_text and tool calls from function_call', async () => {
    const fetchMock = vi.fn(async () => respResp([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '만들게' }] },
      { type: 'function_call', call_id: 'call_1', name: 'create_domain', arguments: '{"name":"memo","displayName":"메모"}' },
    ]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x', getApiStyle: async () => 'responses',
    });
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('만들게');
    expect(r.toolCalls).toEqual([{ id: 'call_1', name: 'create_domain', args: { name: 'memo', displayName: '메모' } }]);
  });

  it('converts assistant tool_calls + tool result messages into Responses format', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => respResp([]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x', getApiStyle: async () => 'responses',
    });
    await client.respond({
      input: [
        { role: 'user', content: 'go' },
        { role: 'assistant', content: null, tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'x', arguments: '{"a":1}' } },
        ]},
        { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
      ],
      tools: [],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'go' }] },
      { type: 'function_call', call_id: 'call_1', name: 'x', arguments: '{"a":1}' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"ok":true}' },
    ]);
  });

  it('adds reasoning.effort when model supports reasoning', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => respResp([]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x',
      getApiStyle: async () => 'responses',
      getModel: async () => 'gpt-5',
      getReasoningEffort: async () => 'high',
    });
    await client.respond({ input: [], tools: [] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.reasoning).toEqual({ effort: 'high', summary: 'auto' });
  });

  it('omits reasoning for non-reasoning models', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => respResp([]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x',
      getApiStyle: async () => 'responses',
      getModel: async () => 'gpt-4o',
      getReasoningEffort: async () => 'high',
    });
    await client.respond({ input: [], tools: [] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.reasoning).toBeUndefined();
  });

  it('never sends a Platform-API-only model to the Codex backend', async () => {
    for (const m of MODEL_OPTIONS.filter(o => o.auth === 'apikey')) {
      expect(resolveModelForAuth(m.id, true)).toBe(OAUTH_DEFAULT_MODEL);
    }
    expect(OAUTH_MODELS).toContain(DEFAULT_SETTINGS.model);
    expect(OAUTH_MODELS).toContain(OAUTH_DEFAULT_MODEL);
    // apikey 모드에서는 저장값을 그대로 존중
    expect(resolveModelForAuth('gpt-4o', false)).toBe('gpt-4o');
  });

  // Codex backend 는 `version` 헤더로 클라이언트를 게이팅한다. 낮으면 모델 무관 400:
  // "The '<model>' model requires a newer version of Codex."
  it('sends a Codex client version the backend still accepts', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => respResp([]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x', getApiStyle: async () => 'responses',
      getExtraHeaders: async () => ({ version: '0.146.1', 'User-Agent': 'codex_cli_rs/0.146.1' }),
    });
    await client.respond({ input: [], tools: [] });
    const [, init] = fetchMock.mock.calls[0];
    const [maj, min] = String(init.headers.version).split('.').map(Number);
    expect(maj > 0 || min >= 146).toBe(true);
  });

  it('adds reasoning_effort to chat body for reasoning models', async () => {
    const fetchMock = vi.fn(async (_url: any, _init: any) => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x',
      getModel: async () => 'gpt-5',
      getReasoningEffort: async () => 'low',
    });
    await client.respond({ input: [], tools: [] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.reasoning_effort).toBe('low');
  });

  // 실제 Codex backend 는 output_item.done 으로 텍스트를, response.completed 로
  // usage 를 따로 보낸다. 이 둘이 서로 다른 이벤트에서 와도 결과 하나에 합쳐져야 한다.
  it('extracts usage from response.completed even when output comes from output_item.done', async () => {
    const item = { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: '안녕하세요' }] };
    const frames = `event: response.output_item.done\ndata: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item })}\n\n`;
    const done = `event: response.completed\ndata: ${JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_1', status: 'completed', output: [],
        usage: { input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 40 }, output_tokens_details: { reasoning_tokens: 10 } },
      },
    })}\n\ndata: [DONE]\n\n`;
    const fetchMock = vi.fn(async () => new Response(frames + done, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x', getApiStyle: async () => 'responses',
    });
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('안녕하세요');
    expect(r.usage).toEqual({ inputTokens: 120, outputTokens: 30, cachedTokens: 40, reasoningTokens: 10 });
  });

  it('leaves usage undefined when response.completed has no usage', async () => {
    const fetchMock = vi.fn(async () => respResp([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] },
    ]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x', getApiStyle: async () => 'responses',
    });
    const r = await client.respond({ input: [], tools: [] });
    expect(r.usage).toBeUndefined();
  });

  it('extracts usage from chat completions response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 50, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 5 } },
    }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.usage).toEqual({ inputTokens: 50, outputTokens: 20, cachedTokens: 5, reasoningTokens: 0 });
  });

  it('stamps the resolved model on the result', async () => {
    const fetchMock = vi.fn(async () => respResp([]));
    const client = createOpenAIClient({
      fetch: fetchMock, getAuthHeader: async () => 'Bearer x', getApiStyle: async () => 'responses',
      getModel: async () => 'gpt-5.6-terra',
    });
    const r = await client.respond({ input: [], tools: [] });
    expect(r.model).toBe('gpt-5.6-terra');
  });
});

describe('normalizeUsage', () => {
  it('normalizes Responses API shape', () => {
    const u = normalizeUsage({
      input_tokens: 100, output_tokens: 40,
      input_tokens_details: { cached_tokens: 25 },
      output_tokens_details: { reasoning_tokens: 12 },
    });
    expect(u).toEqual({ inputTokens: 100, outputTokens: 40, cachedTokens: 25, reasoningTokens: 12 });
  });

  it('normalizes Chat Completions shape', () => {
    const u = normalizeUsage({
      prompt_tokens: 80, completion_tokens: 33,
      prompt_tokens_details: { cached_tokens: 10 },
      completion_tokens_details: { reasoning_tokens: 5 },
    });
    expect(u).toEqual({ inputTokens: 80, outputTokens: 33, cachedTokens: 10, reasoningTokens: 5 });
  });

  it('returns undefined when usage is missing entirely', () => {
    expect(normalizeUsage(undefined)).toBeUndefined();
    expect(normalizeUsage(null)).toBeUndefined();
    expect(normalizeUsage({})).toBeUndefined();
  });

  it('fills missing sub-fields with 0 when partial usage is present', () => {
    expect(normalizeUsage({ input_tokens: 10 })).toEqual({ inputTokens: 10, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 });
    expect(normalizeUsage({ prompt_tokens: 10 })).toEqual({ inputTokens: 10, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 });
  });
});
