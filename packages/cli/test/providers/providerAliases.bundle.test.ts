/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Provider aliases bundle verification', () => {
  describe('Bundle structure validation', () => {
    it('should have aliases copied to bundle during build', () => {
      const bundleAliasesDir = path.join(
        process.cwd(),
        '..',
        '..',
        'bundle',
        'providers',
        'aliases',
      );

      // Verify aliases directory exists in bundle
      expect(fs.existsSync(bundleAliasesDir)).toBe(true);

      // Verify all required alias files exist
      const requiredAliases = [
        'xai.config',
        'fireworks.config',
        'openrouter.config',
        'cerebras-code.config',
      ];

      requiredAliases.forEach((alias) => {
        const aliasPath = path.join(bundleAliasesDir, alias);
        expect(fs.existsSync(aliasPath)).toBe(true);
      });
    });

    it('should have valid alias configurations in bundle', () => {
      const bundleAliasesDir = path.join(
        process.cwd(),
        '..',
        '..',
        'bundle',
        'providers',
        'aliases',
      );

      const aliasFiles = fs
        .readdirSync(bundleAliasesDir)
        .filter((f) => f.endsWith('.config'));

      aliasFiles.forEach((file) => {
        const content = fs.readFileSync(
          path.join(bundleAliasesDir, file),
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
    it('should copy aliases from source to bundle', () => {
      const sourceAliasesDir = path.join(
        process.cwd(),
        'src',
        'providers',
        'aliases',
      );
      const bundleAliasesDir = path.join(
        process.cwd(),
        '..',
        '..',
        'bundle',
        'providers',
        'aliases',
      );

      // Verify source directory exists
      expect(fs.existsSync(sourceAliasesDir)).toBe(true);

      // Verify bundle directory exists
      expect(fs.existsSync(bundleAliasesDir)).toBe(true);

      // Verify file counts match
      const sourceFiles = fs
        .readdirSync(sourceAliasesDir)
        .filter((f) => f.endsWith('.config'));
      const bundleFiles = fs
        .readdirSync(bundleAliasesDir)
        .filter((f) => f.endsWith('.config'));

      expect(bundleFiles.length).toBe(sourceFiles.length);

      // Verify all source files are in bundle
      sourceFiles.forEach((file) => {
        expect(bundleFiles).toContain(file);
      });
    });
  });
});
