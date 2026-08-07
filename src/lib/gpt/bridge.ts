import type { OpenAIClient, TokenUsage } from '../openai';
import type { Registry } from './registry';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: number;
}

export interface BridgeDeps {
  openai: OpenAIClient;
  registry: Registry;
  tools: any[];
  systemPrompt: string;
  maxToolIterations: number;
  // 이전 대화의 압축 요약. 있으면 시스템 프롬프트와 별도의 system 메시지로 붙는다.
  summary?: string;
}

export interface ToolEvent {
  name: string;
  args: any;
  result: any;
}

export interface BridgeResult {
  text: string;
  toolEvents: ToolEvent[];
  usage: TokenUsage;
  apiCalls: number;
  model?: string;
}

export function createBridge(deps: BridgeDeps) {
  return {
    async send(history: ChatMessage[], userMessage: string): Promise<BridgeResult> {
      const input: any[] = [
        { role: 'system', content: deps.systemPrompt },
        ...(deps.summary ? [{ role: 'system', content: `지금까지의 대화 요약:\n${deps.summary}` }] : []),
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      const toolEvents: ToolEvent[] = [];
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 };
      let apiCalls = 0;

      for (let i = 0; i <= deps.maxToolIterations; i++) {
        const r = await deps.openai.respond({ input, tools: deps.tools });
        apiCalls++;
        if (r.usage) {
          usage.inputTokens += r.usage.inputTokens;
          usage.outputTokens += r.usage.outputTokens;
          usage.cachedTokens += r.usage.cachedTokens;
          usage.reasoningTokens += r.usage.reasoningTokens;
        }
        if (r.toolCalls.length === 0) {
          return { text: r.text, toolEvents, usage, apiCalls, model: r.model };
        }
        if (i === deps.maxToolIterations) {
          throw new Error(`exceeded max tool iterations (${deps.maxToolIterations})`);
        }
        // assistant tool_calls 메시지가 먼저 와야 함
        input.push({
          role: 'assistant',
          content: null,
          tool_calls: r.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        });
        for (const tc of r.toolCalls) {
          const result = await deps.registry.invoke(tc.name, tc.args);
          toolEvents.push({ name: tc.name, args: tc.args, result });
          input.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
      }
      // Unreachable: loop either returns or throws
      throw new Error('bridge loop fell through unexpectedly');
    },
  };
}

export type Bridge = ReturnType<typeof createBridge>;
