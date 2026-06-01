export type MessageHandler = (args: any) => Promise<any>;
export type MessageHandlerMap = Record<string, MessageHandler>;

export interface IncomingMessage {
  data: { type?: string; id?: string; args?: any };
  source: { postMessage: (msg: any, target: string) => void } | null;
}

export function createMessageHost(handlers: MessageHandlerMap) {
  const host = {
    async handle(event: IncomingMessage) {
      if (!event.source) return;
      const { type, id, args } = event.data ?? {};
      const handler = type ? handlers[type] : undefined;
      if (!handler) {
        event.source.postMessage(
          { type: 'response', id, ok: false, error: `unknown type: ${type}` },
          '*'
        );
        return;
      }
      try {
        const result = await handler(args ?? {});
        event.source.postMessage({ type: 'response', id, ok: true, result }, '*');
      } catch (e: any) {
        event.source.postMessage(
          { type: 'response', id, ok: false, error: e?.message ?? String(e) },
          '*'
        );
      }
    },
    attach(win: { addEventListener: (t: string, h: any) => void }) {
      win.addEventListener('message', (e: any) => host.handle(e));
    },
  };
  return host;
}

export type MessageHost = ReturnType<typeof createMessageHost>;
