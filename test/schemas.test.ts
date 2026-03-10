import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const schemasDir = join(__dirname, '..', 'schemas');

const schemaFiles = [
  'build-profile.schema.json',
  'oh-package.schema.json',
  'module.schema.json',
  'app.schema.json',
  'hvigor-config.schema.json',
];

describe('JSON Schemas', () => {
  for (const file of schemaFiles) {
    describe(file, () => {
      const filePath = join(schemasDir, file);

      it('should exist', () => {
        expect(existsSync(filePath)).toBe(true);
      });

      it('should be valid JSON', () => {
        const content = readFileSync(filePath, 'utf8');
        expect(() => JSON.parse(content)).not.toThrow();
      });

      it('should have $schema field', () => {
        const schema = JSON.parse(readFileSync(filePath, 'utf8'));
        expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      });

      it('should have title and description', () => {
        const schema = JSON.parse(readFileSync(filePath, 'utf8'));
        expect(schema.title).toBeTruthy();
        expect(schema.description).toBeTruthy();
      });
    });
  }

  describe('build-profile.schema.json API 14 fields', () => {
    const schema = JSON.parse(readFileSync(join(schemasDir, 'build-profile.schema.json'), 'utf8'));

    it('should support compileSdkVersion up to 14', () => {
      const products = schema.properties.app.properties.products;
      expect(products.items.properties.compileSdkVersion).toBeDefined();
    });

    it('should support buildOption with strictMode', () => {
      const buildOption = schema.properties.app.properties.products.items.properties.buildOption;
      expect(buildOption).toBeDefined();
      expect(buildOption.properties.strictMode).toBeDefined();
    });

    it('should support srcPath as array (API 14+)', () => {
      const srcPath = schema.properties.modules.items.properties.srcPath;
      expect(srcPath.type).toContain('array');
    });
  });

  describe('module.schema.json new fields', () => {
    const schema = JSON.parse(readFileSync(join(schemasDir, 'module.schema.json'), 'utf8'));

    it('should support routerMap (API 12+)', () => {
      const module = schema.properties.module.properties;
      expect(module.routerMap).toBeDefined();
    });

    it('should support default device type', () => {
      const deviceTypes = schema.properties.module.properties.deviceTypes;
      expect(deviceTypes.items.enum).toContain('default');
    });
  });

  describe('hvigor-config.schema.json', () => {
    const schema = JSON.parse(readFileSync(join(schemasDir, 'hvigor-config.schema.json'), 'utf8'));

    it('should have modelVersion with examples for API 12-14', () => {
      expect(schema.properties.modelVersion.examples).toContain('5.0.0');
      expect(schema.properties.modelVersion.examples).toContain('5.0.2');
    });
  });

  describe('oh-package.schema.json new fields', () => {
    const schema = JSON.parse(readFileSync(join(schemasDir, 'oh-package.schema.json'), 'utf8'));

    it('should support overrides (API 13+)', () => {
      expect(schema.properties.overrides).toBeDefined();
    });

    it('should support overrideDependencyMap (API 14+)', () => {
      expect(schema.properties.overrideDependencyMap).toBeDefined();
    });
  });
});
