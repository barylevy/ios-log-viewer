import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMacInstallCommand,
  buildSetupCommand,
  getPairingToken,
  setPairingToken,
} from '../utils/liveLogsServer';

const require = createRequire(import.meta.url);
const {
  isAllowedOrigin,
  tokenMatches,
  isLoopbackHost,
  handleRequest,
  boundLogText,
} = require('../../../scripts/live-logs-server.js');

describe('local server access control', () => {
  it('compares exact origins and rejects lookalike hosts', () => {
    const allowed = new Set(['https://viewer.example']);
    expect(isAllowedOrigin('https://viewer.example', allowed)).toBe(true);
    expect(isAllowedOrigin('https://viewer.example.attacker.test', allowed)).toBe(false);
    expect(isAllowedOrigin('null', allowed)).toBe(false);
    expect(isLoopbackHost('attacker.test:4000')).toBe(false);
  });
  it('requires the complete pairing token', () => {
    expect(tokenMatches('correct-token', 'correct-token')).toBe(true);
    expect(tokenMatches('correct', 'correct-token')).toBe(false);
    expect(tokenMatches(undefined, 'correct-token')).toBe(false);
  });
  it('rejects an unpaired configuration request without wildcard CORS', () => {
    const response = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
    handleRequest(
      {
        method: 'GET',
        url: '/config',
        headers: { host: 'localhost:4000', origin: 'http://localhost:3000' },
      },
      response,
    );
    expect(response.writeHead).toHaveBeenCalledWith(401, expect.anything());
    expect(response.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
  });
  it('rejects unexpected website origins before serving logs', () => {
    const response = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
    handleRequest(
      {
        method: 'GET',
        url: '/config',
        headers: { host: 'localhost:4000', origin: 'https://attacker.test' },
      },
      response,
    );
    expect(response.writeHead).toHaveBeenCalledWith(403, expect.anything());
  });
  it('bounds the sidecar buffer', () => {
    expect(
      Buffer.byteLength(boundLogText('x'.repeat(10 * 1024 * 1024)), 'utf8'),
    ).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
  it('quotes paths as PowerShell literals and binds setup to this viewer', () => {
    const command = buildSetupCommand('https://viewer.example', "C:\\logs\\$profile's files");
    expect(command).toContain("--dir='C:\\logs\\$profile''s files'");
    expect(command).toContain("--origin='https://viewer.example'");
    expect(command).toContain(getPairingToken());
  });
  it('binds the macOS install command to this viewer and quotes the token', () => {
    setPairingToken("abc'; rm -rf ~; echo '");
    const command = buildMacInstallCommand('https://viewer.example/some/page');
    expect(command).toContain("'https://viewer.example/cato-live-logs-mac-install.sh'");
    expect(command).toContain("'https://viewer.example/cato-live-logs-mac-server.pl'");
    expect(command).toContain("--origin='https://viewer.example'");
    expect(command).toContain("--token='abc'\\''; rm -rf ~; echo '\\'''");
    expect(command).not.toContain('| bash');
    setPairingToken(crypto.randomUUID());
  });
});
