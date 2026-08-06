// OpenAI Chat Completions tool schema definitions
const TOOL_DEFS = [
  {
    name: 'create_domain',
    description: 'Create a new domain (a screen the user can navigate to from home).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'URL-safe slug, e.g. "memo"' },
        displayName: { type: 'string', description: 'Korean label shown on the card' },
        icon: { type: 'string', description: 'Optional emoji or short text' },
      },
      required: ['name', 'displayName'],
    },
  },
  {
    name: 'list_domains',
    description: 'List all registered domains.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'read_screen',
    description: 'Read current HTML/CSS/JS of a domain.',
    parameters: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
  {
    name: 'update_screen',
    description: 'Partially update HTML/CSS/JS of a domain — only the provided fields (html/css/js) are written, others are left unchanged. Previous version is backed up automatically.',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        html: { type: 'string' },
        css: { type: 'string' },
        js: { type: 'string' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'patch_screen',
    description: 'Patch one file (html/css/js) of a domain by replacing a unique search string with a replacement. The search string must appear exactly once — use this instead of update_screen for small edits, it uses far fewer tokens than sending the whole file.',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        file: { type: 'string', enum: ['html', 'css', 'js'] },
        search: { type: 'string', description: 'Exact substring to find (must be unique in the file)' },
        replace: { type: 'string', description: 'Text to replace it with' },
      },
      required: ['domain', 'file', 'search', 'replace'],
    },
  },
  {
    name: 'revert_screen',
    description: 'Revert a domain screen to a previous version.',
    parameters: {
      type: 'object',
      properties: { domain: { type: 'string' }, steps: { type: 'integer', default: 1 } },
      required: ['domain'],
    },
  },
  {
    name: 'delete_domain',
    description: 'Remove a domain — moves it to the trash, does not permanently delete it.',
    parameters: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
  {
    name: 'get_user_profile',
    description: 'Get the user profile.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'update_user_profile',
    description: 'Merge updates into the user profile.',
    parameters: {
      type: 'object',
      properties: { updates: { type: 'object' } },
      required: ['updates'],
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFS)[number]['name'];

// registry.ts 의 인자 검증이 이 스키마를 단일 출처로 참조한다
export { TOOL_DEFS };

export const TOOL_SCHEMAS = TOOL_DEFS.map(d => ({
  type: 'function' as const,
  function: d,
}));
