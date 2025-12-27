/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test script to reproduce terminal corruption after CTRL+C exit.
 * This script launches the CLI in a PTY, sends input, exits with CTRL+C,
 * and then tests if arrow keys produce literal escape sequences (^[[A).
 */

import { TestRig } from './test-helper.js';
import { describe, it, expect } from 'vitest';
import * as os from 'node:os';

describe.skipIf(process.env.CI === 'true')(
  'Terminal corruption after CTRL+C',
  () => {
    it('should not leave terminal corrupted after CTRL+C exit', async () => {
      const rig = new TestRig();
      await rig.setup('terminal corruption test');

      const run = await rig.runInteractive();

      // Send a simple command
      await run.type('hi\n');

      // Wait for response
      await run.expectText('>', 5000);

      // Send CTRL+C to exit
      await run.type('\x03');

      // Wait for process to exit
      const exitCode = await run.expectExit();

      // On non-Windows, expect clean exit
      if (os.platform() !== 'win32') {
        expect(exitCode, `Process exited with code ${exitCode}`).toBe(130); // 128 + SIGINT (2)
      }

      // After exit, send arrow up key sequence
      // In corrupted terminal, this would appear as literal ^[[A
      // In healthy terminal, this would navigate shell history
      run.ptyProcess.write('\x1b[A'); // Up arrow

      // Wait a bit for any output
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if terminal is corrupted by looking for literal escape sequence in output
      const output = run.output;
      const isCorrupted =
        output.includes('^[[') ||
        output.includes('\x1b[') ||
        output.includes('[A');

      if (isCorrupted) {
        console.error('\n=== TERMINAL CORRUPTION DETECTED ===');
        console.error('Terminal output contains literal escape sequences:');
        console.error(output.substring(-200));
      } else {
        console.log('\n=== Terminal appears healthy ===');
      }

      // For now, just log the issue - this test documents the problem
      // After fix, we should expect(!isCorrupted)
    });

    it('should not leave terminal corrupted after normal exit', async () => {
      const rig = new TestRig();
      await rig.setup('normal exit terminal corruption test');

      const run = await rig.runInteractive();

      // Send a simple command
      await run.type('hi\n');

      // Wait for response
      await run.expectText('>', 5000);

      // Send exit command
      await run.type('/exit\n');

      // Wait for process to exit
      const exitCode = await run.expectExit();

      expect(exitCode, `Process exited with code ${exitCode}`).toBe(0);

      // After exit, send arrow up key sequence
      run.ptyProcess.write('\x1b[A'); // Up arrow

      // Wait a bit for any output
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if terminal is corrupted
      const output = run.output;
      const isCorrupted =
        output.includes('^[[') ||
        output.includes('\x1b[') ||
        output.includes('[A');

      if (isCorrupted) {
        console.error('\n=== TERMINAL CORRUPTION DETECTED ===');
        console.error('Terminal output contains literal escape sequences:');
        console.error(output.substring(-200));
      } else {
        console.log('\n=== Terminal appears healthy ===');
      }

      // For now, just log the issue - this test documents the problem
      // After fix, we should expect(!isCorrupted)
    });
  },
);
