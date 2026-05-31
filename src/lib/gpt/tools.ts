// OpenAI Responses API tool schema definitions
export const TOOL_SCHEMAS = [
  {
    type: 'function',
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
    type: 'function',
    name: 'list_domains',
    description: 'List all registered domains.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'read_screen',
    description: 'Read current HTML/CSS/JS of a domain.',
    parameters: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
  {
    type: 'function',
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
    type: 'function',
    name: 'revert_screen',
    description: 'Revert a domain screen to a previous version.',
    parameters: {
      type: 'object',
      properties: { domain: { type: 'string' }, steps: { type: 'integer', default: 1 } },
      required: ['domain'],
    },
  },
  {
    type: 'function',
    name: 'delete_domain',
    description: 'Permanently delete a domain.',
    parameters: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
  {
    type: 'function',
    name: 'get_user_profile',
    description: 'Get the user profile.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'update_user_profile',
    description: 'Merge updates into the user profile.',
    parameters: {
      type: 'object',
      properties: { updates: { type: 'object' } },
      required: ['updates'],
    },
  },
] as const;

export type ToolName = (typeof TOOL_SCHEMAS)[number]['name'];
