import { describe, it, expect, vi } from 'vitest';
import { createBridge, type BridgeDeps, type ChatMessage } from '../../src/lib/gpt/bridge';
import type { ResponsesResult } from '../../src/lib/openai';

function makeOpenAI(responses: ResponsesResult[]) {
  let i = 0;
  return {
    respond: vi.fn(async () => {
      if (i >= responses.length) throw new Error('test ran out of mocked responses');
      return responses[i++];
    }),
  } as any;
}

function makeRegistry(handler?: (name: string, args: any) => any) {
  return {
    invoke: vi.fn(async (name: string, args: any) => {
      if (handler) {
        try { return { ok: true, result: handler(name, args) }; }
        catch (e: any) { return { ok: false, error: e?.message ?? String(e) }; }
      }
      return { ok: true, result: { echoed: { name, args } } };
    }),
  } as any;
}

function makeDeps(responses: ResponsesResult[], registryHandler?: (name: string, args: any) => any): BridgeDeps {
  return {
    openai: makeOpenAI(responses),
    registry: makeRegistry(registryHandler),
    tools: [{ type: 'function', name: 'x', description: 'x', parameters: { type: 'object', properties: {} } }] as any,
    systemPrompt: 'You help the user.',
    maxToolIterations: 5,
  };
}

describe('gpt bridge', () => {
  it('returns text when no tool calls', async () => {
    const deps = makeDeps([{ text: 'hello', toolCalls: [], raw: {} }]);
    const bridge = createBridge(deps);
    const r = await bridge.send([], 'hi');
    expect(r.text).toBe('hello');
    expect(r.toolEvents).toEqual([]);
    expect(deps.openai.respond).toHaveBeenCalledOnce();
  });

  it('includes system prompt + user message in first call input', async () => {
    const deps = makeDeps([{ text: 'ok', toolCalls: [], raw: {} }]);
    const bridge = createBridge(deps);
    await bridge.send([], 'hi');
    const firstCall = (deps.openai.respond as any).mock.calls[0][0];
    expect(firstCall.input[0]).toEqual({ role: 'system', content: 'You help the user.' });
    expect(firstCall.input[firstCall.input.length - 1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('injects the summary as a separate system message when provided', async () => {
    const deps = makeDeps([{ text: 'ok', toolCalls: [], raw: {} }]);
    deps.summary = '요약 내용';
    const bridge = createBridge(deps);
    await bridge.send([], 'hi');
    const firstCall = (deps.openai.respond as any).mock.calls[0][0];
    expect(firstCall.input[0]).toEqual({ role: 'system', content: 'You help the user.' });
    expect(firstCall.input[1]).toEqual({ role: 'system', content: '지금까지의 대화 요약:\n요약 내용' });
    expect(firstCall.input[firstCall.input.length - 1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('does not inject a summary message when none is provided', async () => {
    const deps = makeDeps([{ text: 'ok', toolCalls: [], raw: {} }]);
    const bridge = createBridge(deps);
    await bridge.send([], 'hi');
    const firstCall = (deps.openai.respond as any).mock.calls[0][0];
    expect(firstCall.input.some((m: any) => typeof m.content === 'string' && m.content.includes('요약'))).toBe(false);
  });

  it('includes prior chat history in input', async () => {
    const deps = makeDeps([{ text: 'ok', toolCalls: [], raw: {} }]);
    const bridge = createBridge(deps);
    const history: ChatMessage[] = [
      { role: 'user', content: 'past msg' },
      { role: 'assistant', content: 'past reply' },
    ];
    await bridge.send(history, 'now');
    const firstCall = (deps.openai.respond as any).mock.calls[0][0];
    // system + 2 history + 1 user = 4
    expect(firstCall.input.length).toBe(4);
    expect(firstCall.input[1]).toEqual({ role: 'user', content: 'past msg' });
    expect(firstCall.input[2]).toEqual({ role: 'assistant', content: 'past reply' });
  });

  it('invokes tools then loops back for final text', async () => {
    const deps = makeDeps([
      { text: '', toolCalls: [{ id: 'c1', name: 'create_domain', args: { name: 'memo', displayName: '메모' } }], raw: {} },
      { text: '메모 만들었어요', toolCalls: [], raw: {} },
    ]);
    const bridge = createBridge(deps);
    const r = await bridge.send([], 'make memo');
    expect(deps.registry.invoke).toHaveBeenCalledWith('create_domain', { name: 'memo', displayName: '메모' });
    expect(r.text).toBe('메모 만들었어요');
    expect(r.toolEvents).toHaveLength(1);
    expect(r.toolEvents[0].name).toBe('create_domain');
    expect(r.toolEvents[0].result.ok).toBe(true);
  });

  it('on second iteration, input includes assistant tool_calls + tool result messages', async () => {
    const deps = makeDeps([
      { text: '', toolCalls: [{ id: 'c1', name: 'x', args: { a: 1 } }], raw: {} },
      { text: 'done', toolCalls: [], raw: {} },
    ]);
    const bridge = createBridge(deps);
    await bridge.send([], 'go');
    expect((deps.openai.respond as any).mock.calls).toHaveLength(2);
    const secondCall = (deps.openai.respond as any).mock.calls[1][0];
    const inputs = secondCall.input;
    // last 2 items should be the assistant tool_calls and tool result
    expect(inputs[inputs.length - 2]).toMatchObject({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x' } }],
    });
    expect(inputs[inputs.length - 1]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
  });

  it('handles multiple tool calls in one response', async () => {
    const deps = makeDeps([
      { text: '', toolCalls: [
        { id: 'c1', name: 'a', args: {} },
        { id: 'c2', name: 'b', args: {} },
      ], raw: {} },
      { text: 'done', toolCalls: [], raw: {} },
    ]);
    const bridge = createBridge(deps);
    const r = await bridge.send([], 'go');
    expect(deps.registry.invoke).toHaveBeenCalledTimes(2);
    expect(r.toolEvents).toHaveLength(2);
  });

  it('continues even when a tool returns ok:false (passes error back to GPT)', async () => {
    const deps = makeDeps([
      { text: '', toolCalls: [{ id: 'c1', name: 'fail', args: {} }], raw: {} },
      { text: '문제가 있어요', toolCalls: [], raw: {} },
    ], () => { throw new Error('boom'); });
    const bridge = createBridge(deps);
    const r = await bridge.send([], 'go');
    expect(r.text).toBe('문제가 있어요');
    expect(r.toolEvents[0].result.ok).toBe(false);
    // The tool result message sent back should serialize the failure result
    const secondCall = (deps.openai.respond as any).mock.calls[1][0];
    const inputs = secondCall.input;
    const lastOutput = inputs[inputs.length - 1];
    expect(lastOutput.content).toContain('boom');
  });

  it('throws when exceeding maxToolIterations', async () => {
    const looping = { text: '', toolCalls: [{ id: 'x', name: 'a', args: {} }], raw: {} };
    const deps = makeDeps([looping, looping, looping, looping, looping, looping, looping, looping]);
    deps.maxToolIterations = 2;
    const bridge = createBridge(deps);
    await expect(bridge.send([], 'go')).rejects.toThrow(/iteration/i);
  });

  it('passes tools to every openai call', async () => {
    const deps = makeDeps([{ text: 'ok', toolCalls: [], raw: {} }]);
    const bridge = createBridge(deps);
    await bridge.send([], 'hi');
    const firstCall = (deps.openai.respond as any).mock.calls[0][0];
    expect(firstCall.tools).toEqual(deps.tools);
  });

  it('sums usage across a tool-call round trip and counts apiCalls', async () => {
    const deps = makeDeps([
      {
        text: '', toolCalls: [{ id: 'c1', name: 'create_domain', args: {} }], raw: {},
        usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 10, reasoningTokens: 0 },
        model: 'gpt-5.6-terra',
      },
      {
        text: '완료', toolCalls: [], raw: {},
        usage: { inputTokens: 150, outputTokens: 30, cachedTokens: 0, reasoningTokens: 5 },
        model: 'gpt-5.6-terra',
      },
    ]);
    const bridge = createBridge(deps);
    const r = await bridge.send([], 'go');
    expect(r.apiCalls).toBe(2);
    expect(r.usage).toEqual({ inputTokens: 250, outputTokens: 50, cachedTokens: 10, reasoningTokens: 5 });
    expect(r.model).toBe('gpt-5.6-terra');
  });

  it('treats missing usage on a response as zero but still counts the call', async () => {
    const deps = makeDeps([{ text: 'ok', toolCalls: [], raw: {} }]);
    const bridge = createBridge(deps);
    const r = await bridge.send([], 'hi');
    expect(r.apiCalls).toBe(1);
    expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 });
  });
});
