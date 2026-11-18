import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  tokenAllowed,
  storedPairing,
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
    expect(command).toContain("-LogDir 'C:\\logs\\$profile''s files'");
    expect(command).toContain("'https://viewer.example/cato-live-logs-win-install.ps1'");
    expect(command).toContain("-Origin 'https://viewer.example'");
    expect(command).toContain(`-Token '${getPairingToken()}'`);
    expect(command).not.toContain('iex');
  });
  it('requires a paired token on every route, health included', () => {
    const response = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
    handleRequest({ method: 'GET', url: '/health', headers: { host: 'localhost:4000' } }, response);
    expect(response.writeHead).toHaveBeenCalledWith(401, expect.anything());
  });
  it('accepts any paired token and nothing else', () => {
    const tokens = ['first-token-0123456789', 'second-token-0123456789'];
    expect(tokenAllowed('second-token-0123456789', tokens)).toBe(true);
    expect(tokenAllowed('second-token', tokens)).toBe(false);
    expect(tokenAllowed(undefined, tokens)).toBe(false);
    expect(tokenAllowed('anything', [])).toBe(false);
  });
  it('reads only well-formed origins and tokens from the stored pairing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pairing-'));
    const file = join(dir, 'config.json');
    writeFileSync(
      file,
      '\uFEFF' +
        JSON.stringify({
          logDir: 'C:\\logs',
          origins: ['https://viewer.example', 'javascript:alert(1)', 'https://a.example/path'],
          tokens: ['good-token-0123456789', 'short', 42],
        }),
    );
    expect(storedPairing(file)).toEqual({
      origins: ['https://viewer.example'],
      tokens: ['good-token-0123456789'],
    });
    expect(storedPairing(join(dir, 'missing.json'))).toEqual({ origins: [], tokens: [] });
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
