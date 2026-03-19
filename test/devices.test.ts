import { describe, expect, it } from 'vitest';
import { getDeviceStatusBarState, type ConnectedDevice } from '../src/device/devices';
import { COMMANDS } from '../src/utils/constants';
import { HdcCommandError } from '../src/utils/hdc';

describe('device status bar state', () => {
  const device: ConnectedDevice = {
    id: '127.0.0.1:5555',
    name: '127.0.0.1:5555',
    type: 'emulator',
    status: 'online',
  };

  it('shows a dedicated HDC offline state', () => {
    const state = getDeviceStatusBarState({
      devices: [],
      error: new HdcCommandError(
        'HDC is installed, but it could not connect to the HDC server.',
        'connect-failed',
        'hdc',
        ['list', 'targets'],
      ),
    });

    expect(state.text).toBe('$(warning) HDC Offline');
    expect(state.command).toBe(COMMANDS.CHECK_ENVIRONMENT);
    expect(state.tooltip).toContain('HDC server');
  });

  it('keeps the simple no-device state when HDC is healthy', () => {
    const state = getDeviceStatusBarState({ devices: [] });

    expect(state.text).toBe('$(device-mobile) No Device');
    expect(state.command).toBe(COMMANDS.SELECT_DEVICE);
  });

  it('shows the active device when one is selected', () => {
    const state = getDeviceStatusBarState({
      devices: [device],
      current: device,
    });

    expect(state.text).toContain('127.0.0.1:5555');
    expect(state.command).toBe(COMMANDS.SELECT_DEVICE);
  });
});
