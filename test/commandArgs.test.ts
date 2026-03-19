import { describe, expect, it } from 'vitest';
import { extractDeviceIdFromCommandArg, extractEmulatorNameFromCommandArg } from '../src/device/commandArgs';

describe('device command args', () => {
  it('extracts a device id from supported command argument shapes', () => {
    expect(extractDeviceIdFromCommandArg('device-001')).toBe('device-001');
    expect(extractDeviceIdFromCommandArg({ id: 'device-002' })).toBe('device-002');
    expect(extractDeviceIdFromCommandArg({ deviceId: 'device-003' })).toBe('device-003');
    expect(extractDeviceIdFromCommandArg({ info: { deviceId: 'device-004' } })).toBe('device-004');
  });

  it('extracts an emulator name from tree-view shaped items', () => {
    expect(extractEmulatorNameFromCommandArg('Mate 70 Pro')).toBe('Mate 70 Pro');
    expect(extractEmulatorNameFromCommandArg({ name: 'Mate 60' })).toBe('Mate 60');
    expect(extractEmulatorNameFromCommandArg({ info: { name: 'Phone Preview' } })).toBe('Phone Preview');
    expect(extractEmulatorNameFromCommandArg({ info: {} })).toBeUndefined();
  });
});
