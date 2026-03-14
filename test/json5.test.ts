import { describe, expect, it } from 'vitest';
import { extractJson5StringValue, hasJson5StringValue } from '../src/utils/json5';

describe('json5 utils', () => {
  it('should read quoted and unquoted keys', () => {
    const text = `
      {
        bundleName: "com.example.app",
        'label': 'Demo'
      }
    `;

    expect(extractJson5StringValue(text, 'bundleName')).toBe('com.example.app');
    expect(extractJson5StringValue(text, 'label')).toBe('Demo');
  });

  it('should ignore similarly named keys', () => {
    const text = `
      {
        moduleName: "entry",
        name: "EntryAbility"
      }
    `;

    expect(extractJson5StringValue(text, 'moduleName')).toBe('entry');
    expect(extractJson5StringValue(text, 'name')).toBe('EntryAbility');
    expect(extractJson5StringValue(text, 'ame')).toBeUndefined();
  });

  it('should compare JSON5 string values', () => {
    const text = '{ type: "entry" }';
    expect(hasJson5StringValue(text, 'type', 'entry')).toBe(true);
    expect(hasJson5StringValue(text, 'type', 'feature')).toBe(false);
  });
});
