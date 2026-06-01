import { describe, it, expect, vi } from 'vitest';
import { createOpenAIClient, type OpenAIDeps } from '../src/lib/openai';

function makeDeps(fetchImpl: any, authHeader: string = 'Bearer testtoken'): OpenAIDeps {
  return {
    fetch: fetchImpl,
    getAuthHeader: async () => authHeader,
  };
}

describe('openai client', () => {
  it('sends POST to /v1/responses with auth header and JSON body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }]
    }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    await client.respond({ input: [{ role: 'user', content: 'hello' }], tools: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer testtoken');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('uses default model when none provided', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    await client.respond({ input: [], tools: [] });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(typeof body.model).toBe('string');
    expect(body.model.length).toBeGreaterThan(0);
  });

  it('uses provided model when specified', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    await client.respond({ input: [], tools: [], model: 'gpt-5' });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-5');
  });

  it('extracts text from message output', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output: [
        { type: 'message', content: [
          { type: 'output_text', text: 'hello' },
          { type: 'output_text', text: ' world' }
        ]}
      ]
    }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('hello world');
    expect(r.toolCalls).toEqual([]);
  });

  it('extracts tool calls with parsed arguments', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output: [
        { type: 'function_call', name: 'create_domain', arguments: '{"name":"memo","displayName":"메모"}', call_id: 'c1' }
      ]
    }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.toolCalls).toEqual([{ id: 'c1', name: 'create_domain', args: { name: 'memo', displayName: '메모' } }]);
  });

  it('handles output with both text and tool calls', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output: [
        { type: 'message', content: [{ type: 'output_text', text: '만들고 있어요' }] },
        { type: 'function_call', name: 'create_domain', arguments: '{"name":"x","displayName":"X"}', call_id: 'c1' }
      ]
    }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('만들고 있어요');
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe('create_domain');
  });

  it('passes tools array in request body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const toolsArg = [{ type: 'function', name: 'x', description: '', parameters: { type: 'object', properties: {} } }];
    await client.respond({ input: [], tools: toolsArg });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual(toolsArg);
  });

  it('throws on non-200 response', async () => {
    const fetchMock = vi.fn(async () => new Response('bad request', { status: 400 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    await expect(client.respond({ input: [], tools: [] })).rejects.toThrow(/400/);
  });

  it('returns empty text when no message output present', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.text).toBe('');
    expect(r.toolCalls).toEqual([]);
  });

  it('preserves raw response for debugging', async () => {
    const raw = { id: 'r1', output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(raw), { status: 200 }));
    const client = createOpenAIClient(makeDeps(fetchMock));
    const r = await client.respond({ input: [], tools: [] });
    expect(r.raw).toEqual(raw);
  });
});
