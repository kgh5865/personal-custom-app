import { describe, it, expect } from 'vitest';
import { TOOL_SCHEMAS } from '../../src/lib/gpt/tools';

describe('tool schemas', () => {
  it('all have unique names', () => {
    const names = TOOL_SCHEMAS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all have non-empty descriptions and parameters object', () => {
    for (const t of TOOL_SCHEMAS) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.parameters).toBeDefined();
      expect(t.parameters.type).toBe('object');
    }
  });

  it('includes the core screen-manipulation tools', () => {
    const names = TOOL_SCHEMAS.map(t => t.name as string);
    expect(names).toContain('create_domain');
    expect(names).toContain('update_screen');
    expect(names).toContain('revert_screen');
    expect(names).toContain('delete_domain');
    expect(names).toContain('read_screen');
    expect(names).toContain('list_domains');
  });

  it('includes profile tools', () => {
    const names = TOOL_SCHEMAS.map(t => t.name as string);
    expect(names).toContain('get_user_profile');
    expect(names).toContain('update_user_profile');
  });

  it('all function tools have type "function"', () => {
    for (const t of TOOL_SCHEMAS) {
      expect(t.type).toBe('function');
    }
  });
});
