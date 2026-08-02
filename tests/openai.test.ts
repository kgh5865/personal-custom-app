import { describe, it, expect, vi } from 'vitest';
import { createOpenAIClient, type OpenAIDeps } from '../src/lib/openai';

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
