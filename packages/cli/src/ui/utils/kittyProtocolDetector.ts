/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';

let detectionComplete = false;
let protocolSupported = false;
let protocolEnabled = false;

function enableProtocolSequence() {
  process.stdout.write('\x1b[>1u');
  protocolEnabled = true;
}

/**
 * Detects Kitty keyboard protocol support.
 * Definitive document about this protocol lives at https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 * This function should be called once at app startup.
 */
export async function detectAndEnableKittyProtocol(): Promise<boolean> {
  if (detectionComplete) {
    return protocolSupported;
  }

  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      detectionComplete = true;
      resolve(false);
      return;
    }

    const originalRawMode = process.stdin.isRaw;
    if (!originalRawMode) {
      process.stdin.setRawMode(true);
    }

    let responseBuffer = '';
    let progressiveEnhancementReceived = false;
    let checkFinished = false;

    const handleData = (data: Buffer) => {
      responseBuffer += data.toString();

      // Check for progressive enhancement response (CSI ? <flags> u)
      if (responseBuffer.includes('\x1b[?') && responseBuffer.includes('u')) {
        progressiveEnhancementReceived = true;
      }

      // Check for device attributes response (CSI ? <attrs> c)
      if (responseBuffer.includes('\x1b[?') && responseBuffer.includes('c')) {
        if (!checkFinished) {
          checkFinished = true;
          process.stdin.removeListener('data', handleData);

          if (!originalRawMode) {
            process.stdin.setRawMode(false);
          }

          if (progressiveEnhancementReceived) {
            protocolSupported = true;
            enableProtocolSequence();

            process.on('exit', disableProtocol);
            process.on('SIGINT', disableProtocol);
            process.on('SIGTERM', disableProtocol);
            process.on('uncaughtException', disableProtocol);
            process.on('unhandledRejection', disableProtocol);
          }

          detectionComplete = true;
          resolve(protocolSupported);
        }
      }
    };

    process.stdin.on('data', handleData);

    // Send queries
    process.stdout.write('\x1b[?u'); // Query progressive enhancement
    process.stdout.write('\x1b[c'); // Query device attributes

    // Timeout after 50ms
    setTimeout(() => {
      if (!checkFinished) {
        process.stdin.removeListener('data', handleData);
        if (!originalRawMode) {
          process.stdin.setRawMode(false);
        }
        detectionComplete = true;
        resolve(false);
      }
    }, 50);
  });
}

function disableProtocol() {
  if (!protocolEnabled) {
    return;
  }
  protocolEnabled = false;
  try {
    fs.writeSync(process.stdout.fd, '\x1b[<u');
  } catch {}
}

export function enableSupportedProtocol(): void {
  if (!protocolSupported) {
    return;
  }
  enableProtocolSequence();
}

export function isKittyProtocolEnabled(): boolean {
  return protocolEnabled;
}

export function isKittyProtocolSupported(): boolean {
  return protocolSupported;
}
