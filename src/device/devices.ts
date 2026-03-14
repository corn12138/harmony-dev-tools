import { listHdcTargets } from '../utils/hdc';

export interface ConnectedDevice {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
}

export async function listConnectedDevices(): Promise<ConnectedDevice[]> {
  try {
    const targets = await listHdcTargets(5000);
    return targets.map((id) => {
      return {
        id,
        name: id,
        type: inferDeviceType(id),
        status: 'online' as const,
      };
    });
  } catch {
    return [];
  }
}

function inferDeviceType(id: string): string {
  if (id.includes('127.0.0.1') || id.includes('localhost') || id.includes('emulator')) {
    return 'emulator';
  }

  return 'device';
}
