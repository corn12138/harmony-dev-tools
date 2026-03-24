import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Cangjie Snippets', () => {
  it('should have a valid cangjie snippets JSON file', () => {
    const snippetPath = path.resolve(__dirname, '../snippets/cangjie.snippets.json');
    expect(fs.existsSync(snippetPath)).toBe(true);

    const content = fs.readFileSync(snippetPath, 'utf8');
    const snippets = JSON.parse(content);

    // Verify some core Cangjie snippets exist
    expect(snippets['Main Function']).toBeDefined();
    expect(snippets['Main Function'].prefix).toBe('main');
    
    expect(snippets['Spawn Concurrent']).toBeDefined();
    expect(snippets['Match Expression']).toBeDefined();
    expect(snippets['Class']).toBeDefined();
    expect(snippets['Struct']).toBeDefined();
    
    // Verify snippet structure
    for (const [key, value] of Object.entries(snippets)) {
      const snip = value as any;
      expect(snip.prefix).toBeTypeOf('string');
      expect(snip.description).toBeTypeOf('string');
      expect(snip.body).toBeDefined();
    }
  });
  
  it('should have a valid cangjie language configuration', () => {
    const configPath = path.resolve(__dirname, '../cangjie-language-configuration.json');
    expect(fs.existsSync(configPath)).toBe(true);
    
    const content = fs.readFileSync(configPath, 'utf8');
    // Using simple regex or JSON.parse (with comments stripped)
    // Here we just test it's readable
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('"comments"');
  });
});
