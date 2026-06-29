import { describe, expect, it } from 'vitest';
import { buildDigiNetUpdateScript } from '../utils/diginetUpdateScript.js';

describe('buildDigiNetUpdateScript', () => {
  it('builds a PowerShell script that downloads the package from the server', () => {
    const script = buildDigiNetUpdateScript({
      packageName: 'DigiNET v3.0.3(1)',
      packageUrl: 'http://192.168.85.30:3001/api/scales/diginet/download/DigiNET%20v3.0.3(1)',
      tempRoot: 'C:\\Temp'
    });

    expect(script).toContain('Invoke-WebRequest');
    expect(script).toContain('Expand-Archive');
    expect(script).toContain('http://192.168.85.30:3001/api/scales/diginet/download/DigiNET%20v3.0.3(1)');
  });
});
