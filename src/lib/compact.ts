import { getDb, type Db } from './db';
import type { ChatMessage } from './gpt/bridge';
import type { OpenAIClient, TokenUsage } from './openai';
import { recordUsage } from './usage';

// 토큰 추정치. 정확한 토크나이저를 넣지 않는다 — 압축은 퍼지한 트리거라
// 대략치로 충분하고, 실제 값은 usage_log 에 기록되므로 나중에 보정할 수 있다.
export const CHARS_PER_TOKEN = 2.5; // 한글 위주 기준. 보정 시 이 값을 조정한다.

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateHistoryTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

export const COMPACT_THRESHOLD_TOKENS = 12000;
export const KEEP_RECENT_MESSAGES = 10;

// 임계값을 넘겨도 접을 만한 오래된 메시지가 없으면(메시지 수가 KEEP_RECENT_MESSAGES 이하)
// 압축할 게 없으므로 false.
export function needsCompaction(messages: ChatMessage[]): boolean {
  if (messages.length <= KEEP_RECENT_MESSAGES) return false;
  return estimateHistoryTokens(messages) > COMPACT_THRESHOLD_TOKENS;
}

export interface StoredSummary {
  uptoMessageId: number;
  content: string;
}

export async function getLatestSummary(db: Db): Promise<StoredSummary | null> {
  const { rows } = await db.query(
    'SELECT upto_message_id, content FROM chat_summary ORDER BY id DESC LIMIT 1'
  );
  if (rows.length === 0) return null;
  return { uptoMessageId: rows[0].upto_message_id, content: rows[0].content };
}

export interface CompactorDeps {
  db: Db;
  summarize: (messages: ChatMessage[]) => Promise<string>;
}

export function createCompactor(deps: CompactorDeps) {
  return {
    getLatestSummary: () => getLatestSummary(deps.db),

    // 최근 KEEP_RECENT_MESSAGES 개를 남기고 그 이전 구간을 요약해 chat_summary 에 저장한다.
    // 접을 메시지가 없으면 아무것도 하지 않고 null 을 반환한다.
    async compact(messages: ChatMessage[]): Promise<StoredSummary | null> {
      if (messages.length <= KEEP_RECENT_MESSAGES) return null;
      const toFold = messages.slice(0, messages.length - KEEP_RECENT_MESSAGES);
      const lastFolded = toFold[toFold.length - 1];
      // id 가 없는 메시지(아직 저장 전)는 압축 경계로 기록할 수 없다.
      if (lastFolded.id == null) return null;

      // 기존 요약이 있으면 요약의 요약이 되도록 다음 입력에 포함시킨다.
      const existing = await getLatestSummary(deps.db);
      const summarizeInput: ChatMessage[] = existing
        ? [{ role: 'system', content: `이전까지의 요약:\n${existing.content}` }, ...toFold]
        : toFold;

      const content = (await deps.summarize(summarizeInput)).trim();
      // 빈 요약을 저장하면 접힌 메시지가 아무 근거도 없이 화면과 모델에서 사라진다.
      // 요약에 실패한 셈이므로 접지 않고 그대로 둔다.
      if (!content) return null;
      await deps.db.execute(
        'INSERT INTO chat_summary (upto_message_id, content, created_at) VALUES (?, ?, ?)',
        [lastFolded.id, content, Date.now()]
      );
      return { uptoMessageId: lastFolded.id, content };
    },
  };
}

export type Compactor = ReturnType<typeof createCompactor>;

const SUMMARY_PROMPT =
  '다음은 사용자와 AI 비서의 대화 일부입니다. 이후 대화를 이어가기 위해 필요한 사실, 결정, ' +
  '사용자 선호를 보존하는 요약을 작성하세요. 잡담이나 세부 실행 로그는 버리고 핵심만 남기세요.';

// 프로덕션용 summarize 구현. 도구 없이 기존 openai 클라이언트로 짧은 응답만 받는다.
// onUsage 로 이 호출의 토큰을 밖에 알린다 — 압축도 토큰을 쓰므로 측정 밖에 두면
// 절감 효과를 실제보다 좋게 착각하게 된다.
export function createSummarizer(
  openai: OpenAIClient,
  onUsage?: (u: { model?: string; usage?: TokenUsage }) => void | Promise<void>,
) {
  return async (messages: ChatMessage[]): Promise<string> => {
    const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const r = await openai.respond({
      input: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: transcript },
      ],
      tools: [],
    });
    await onUsage?.({ model: r.model, usage: r.usage });
    return r.text.trim();
  };
}

// 압축 호출의 토큰까지 usage_log 에 기록하는 프로덕션 summarize.
// 기록 실패가 압축을 깨뜨리면 안 되므로 삼킨다.
export async function createRecordingSummarizer(openai: OpenAIClient) {
  const db = await getDb();
  return createSummarizer(openai, async ({ model, usage }) => {
    // usage 를 못 받았으면 토큰은 0 으로 두되 호출 수는 센다. 호출이 있었던 건
    // 사실이므로 감추지 않는다.
    const u = usage ?? { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 };
    try {
      await recordUsage(db, { model: model ?? 'unknown', usage: u, apiCalls: 1 });
    } catch (e) {
      console.error('압축 usage 기록 실패', e);
    }
  });
}
