import { describe, expect, it } from 'vitest';
import { extractJson5StringValue, findJson5StringValue, hasJson5StringValue } from '../src/utils/json5';

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

  it('locates the editable value after comments and quoted examples', () => {
    const text = [
      '{',
      '  // bundleName: "old.line"',
      '  /* bundleName: "old.block" */',
      '  hint: "example bundleName: \'old.string\'",',
      '  bundleName /* active */ : /* current */ "com.example.app"',
      '}',
    ].join('\r\n');
    const value = 'com.example.app';
    const valueStart = text.indexOf(value);
    expect(findJson5StringValue(text, 'bundleName')).toEqual({
      value, valueStart, valueEnd: valueStart + value.length, quote: '"',
    });
  });
});
