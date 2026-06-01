import type { OpenAIClient } from '../openai';
import type { Registry } from './registry';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BridgeDeps {
  openai: OpenAIClient;
  registry: Registry;
  tools: any[];
  systemPrompt: string;
  maxToolIterations: number;
}

export interface ToolEvent {
  name: string;
  args: any;
  result: any;
}

export interface BridgeResult {
  text: string;
  toolEvents: ToolEvent[];
}

export function createBridge(deps: BridgeDeps) {
  return {
    async send(history: ChatMessage[], userMessage: string): Promise<BridgeResult> {
      const input: any[] = [
        { role: 'system', content: deps.systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      const toolEvents: ToolEvent[] = [];

      for (let i = 0; i <= deps.maxToolIterations; i++) {
        const r = await deps.openai.respond({ input, tools: deps.tools });
        if (r.toolCalls.length === 0) {
          return { text: r.text, toolEvents };
        }
        if (i === deps.maxToolIterations) {
          throw new Error(`exceeded max tool iterations (${deps.maxToolIterations})`);
        }
        for (const tc of r.toolCalls) {
          const result = await deps.registry.invoke(tc.name, tc.args);
          toolEvents.push({ name: tc.name, args: tc.args, result });
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          });
          input.push({
            type: 'function_call_output',
            call_id: tc.id,
            output: JSON.stringify(result),
          });
        }
      }
      // Unreachable: loop either returns or throws
      throw new Error('bridge loop fell through unexpectedly');
    },
  };
}

export type Bridge = ReturnType<typeof createBridge>;
