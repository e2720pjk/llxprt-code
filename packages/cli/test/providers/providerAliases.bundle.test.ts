/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Provider aliases package verification', () => {
  describe('Package structure validation', () => {
    it('should have aliases copied to dist during build', () => {
      const distAliasesDir = path.join(
        process.cwd(),
        'dist',
        'src',
        'providers',
        'aliases',
      );

      // Verify aliases directory exists in dist (copied by copy_files.js)
      expect(fs.existsSync(distAliasesDir)).toBe(true);

      // Verify all required alias files exist
      const requiredAliases = [
        'xai.config',
        'fireworks.config',
        'openrouter.config',
        'cerebras-code.config',
      ];

      requiredAliases.forEach((alias) => {
        const aliasPath = path.join(distAliasesDir, alias);
        expect(fs.existsSync(aliasPath)).toBe(true);
      });
    });

    it('should have valid alias configurations in dist', () => {
      const distAliasesDir = path.join(
        process.cwd(),
        'dist',
        'src',
        'providers',
        'aliases',
      );

      const aliasFiles = fs
        .readdirSync(distAliasesDir)
        .filter((f) => f.endsWith('.config'));

      aliasFiles.forEach((file) => {
        const content = fs.readFileSync(
          path.join(distAliasesDir, file),
          'utf-8',
        );
        const config = JSON.parse(content);

        // Validate required fields
        expect(config).toHaveProperty('baseProvider');
        expect(typeof config.baseProvider).toBe('string');
      });
    });
  });

  describe('Build process validation', () => {
    it('should copy aliases from source to dist during build', () => {
      const sourceAliasesDir = path.join(
        process.cwd(),
        'src',
        'providers',
        'aliases',
      );
      const distAliasesDir = path.join(
        process.cwd(),
        'dist',
        'src',
        'providers',
        'aliases',
      );

      // Verify source directory exists
      expect(fs.existsSync(sourceAliasesDir)).toBe(true);

      // Verify dist directory exists (copied by copy_files.js during build)
      expect(fs.existsSync(distAliasesDir)).toBe(true);

      // Verify file counts match
      const sourceFiles = fs
        .readdirSync(sourceAliasesDir)
        .filter((f) => f.endsWith('.config'));
      const distFiles = fs
        .readdirSync(distAliasesDir)
        .filter((f) => f.endsWith('.config'));

      expect(distFiles.length).toBe(sourceFiles.length);

      // Verify all source files are in dist
      sourceFiles.forEach((file) => {
        expect(distFiles).toContain(file);
      });
    });
  });
});
