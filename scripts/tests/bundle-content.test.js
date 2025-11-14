/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

describe('Bundle content verification', () => {
  const bundleDir = path.join(root, 'bundle');

  beforeAll(() => {
    // Ensure bundle directory exists
    if (!fs.existsSync(bundleDir)) {
      throw new Error(
        'Bundle directory does not exist. Run npm run build first.',
      );
    }
  });

  describe('Provider aliases', () => {
    it('should include provider aliases directory in bundle', () => {
      const aliasesDir = path.join(bundleDir, 'providers', 'aliases');
      expect(fs.existsSync(aliasesDir)).toBe(true);
    });

    it('should include all required provider alias config files', () => {
      const aliasesDir = path.join(bundleDir, 'providers', 'aliases');

      const requiredAliases = [
        'xai.config',
        'fireworks.config',
        'openrouter.config',
        'cerebras-code.config',
        'chutes-ai.config',
        'llama-cpp.config',
        'lm-studio.config',
        'synthetic.config',
      ];

      requiredAliases.forEach((alias) => {
        const aliasPath = path.join(aliasesDir, alias);
        expect(fs.existsSync(aliasPath)).toBe(true);
      });
    });

    it('should have valid alias configuration format', () => {
      const aliasesDir = path.join(bundleDir, 'providers', 'aliases');

      const aliasFiles = fs
        .readdirSync(aliasesDir)
        .filter((f) => f.endsWith('.config'));

      aliasFiles.forEach((file) => {
        const content = fs.readFileSync(path.join(aliasesDir, file), 'utf-8');
        const config = JSON.parse(content);

        // Validate required fields
        expect(config).toHaveProperty('baseProvider');
        expect(typeof config.baseProvider).toBe('string');

        if (config.baseUrl) {
          expect(config.baseUrl).toMatch(/^https?:\/\//);
        }
      });
    });
  });

  describe('Other bundle assets', () => {
    it('should include tiktoken WASM file', () => {
      const tiktokenPath = path.join(bundleDir, 'tiktoken_bg.wasm');
      expect(fs.existsSync(tiktokenPath)).toBe(true);
    });

    it('should include default prompts manifest', () => {
      const promptsPath = path.join(bundleDir, 'default-prompts.json');
      expect(fs.existsSync(promptsPath)).toBe(true);
    });

    it('should include main CLI bundle', () => {
      const cliPath = path.join(bundleDir, 'llxprt.js');
      expect(fs.existsSync(cliPath)).toBe(true);
    });
  });
});
