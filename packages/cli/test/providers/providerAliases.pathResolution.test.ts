/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Provider aliases path resolution', () => {
  it('should resolve correct alias directory path in current environment', () => {
    // Test the actual path resolution logic from providerAliases.ts
    // Simulate the __dirname that providerAliases.ts would have
    const providerDir = path.join(process.cwd(), 'src', 'providers');
    const __dirname = providerDir; // This simulates providerAliases.ts __dirname

    let BUILTIN_ALIAS_DIR: string;
    if (
      __dirname.includes('bundle') ||
      fs.existsSync(path.join(__dirname, 'providers'))
    ) {
      // Bundle environment
      BUILTIN_ALIAS_DIR = path.join(__dirname, 'providers', 'aliases');
    } else {
      // Development environment
      BUILTIN_ALIAS_DIR = path.join(__dirname, 'aliases');
    }

    // Verify the resolved path exists
    expect(fs.existsSync(BUILTIN_ALIAS_DIR)).toBe(true);

    // Get all alias config files
    const aliasFiles = fs
      .readdirSync(BUILTIN_ALIAS_DIR)
      .filter((f) => f.endsWith('.config'));

    expect(aliasFiles.length).toBeGreaterThan(0);

    // Test reading and parsing each config file
    aliasFiles.forEach((file) => {
      const configPath = path.join(BUILTIN_ALIAS_DIR, file);
      expect(fs.existsSync(configPath)).toBe(true);

      // Verify file can be read and parsed as JSON
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();

      const config = JSON.parse(content);

      // Verify required fields exist
      expect(config).toHaveProperty('baseProvider');
      expect(typeof config.baseProvider).toBe('string');
      expect(config.baseProvider.trim()).not.toBe('');

      // Verify optional fields have correct format if present
      if (config.baseUrl) {
        expect(config.baseUrl).toMatch(/^https?:\/\//);
      }
      if (config.defaultModel) {
        expect(typeof config.defaultModel).toBe('string');
        expect(config.defaultModel.trim()).not.toBe('');
      }
    });
  });

  it('should handle bundle environment path correctly', () => {
    // Simulate bundle environment path resolution
    const mockBundleDir = path.join(process.cwd(), 'bundle');
    const mockBundleAliasDir = path.join(mockBundleDir, 'providers', 'aliases');

    // In bundle environment, should look for providers/aliases/
    const expectedPath = path.join('bundle', 'providers', 'aliases');
    expect(expectedPath).toBe('bundle/providers/aliases');

    // If bundle exists, verify the structure
    if (fs.existsSync(mockBundleDir)) {
      expect(fs.existsSync(mockBundleAliasDir)).toBe(true);
    }
  });

  it('should validate all expected provider alias configs', () => {
    // Test that all expected provider configs exist and are valid
    const providerDir = path.join(process.cwd(), 'src', 'providers');
    const aliasesDir = path.join(providerDir, 'aliases');

    const expectedConfigs = [
      'xai.config',
      'fireworks.config',
      'openrouter.config',
      'cerebras-code.config',
      'chutes-ai.config',
      'llama-cpp.config',
      'lm-studio.config',
      'synthetic.config',
    ];

    expectedConfigs.forEach((configFile) => {
      const configPath = path.join(aliasesDir, configFile);

      // Verify file exists
      expect(fs.existsSync(configPath)).toBe(true);

      // Verify file can be read and parsed
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      // Verify structure
      expect(config).toHaveProperty('baseProvider');
      expect(typeof config.baseProvider).toBe('string');
      expect(config.baseProvider.trim()).not.toBe('');

      // Log the provider being tested for debugging
      console.log(
        `✓ Validated ${configFile}: baseProvider=${config.baseProvider}`,
      );
    });
  });
});
