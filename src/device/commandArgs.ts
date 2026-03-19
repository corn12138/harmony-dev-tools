export function extractDeviceIdFromCommandArg(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string' && record.id.length > 0) {
    return record.id;
  }

  if (typeof record.deviceId === 'string' && record.deviceId.length > 0) {
    return record.deviceId;
  }

  const info = record.info;
  if (info && typeof info === 'object') {
    const infoRecord = info as Record<string, unknown>;
    if (typeof infoRecord.deviceId === 'string' && infoRecord.deviceId.length > 0) {
      return infoRecord.deviceId;
    }
  }

  return undefined;
}

export function extractEmulatorNameFromCommandArg(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && record.name.length > 0) {
    return record.name;
  }

  const info = record.info;
  if (info && typeof info === 'object') {
    const infoRecord = info as Record<string, unknown>;
    if (typeof infoRecord.name === 'string' && infoRecord.name.length > 0) {
      return infoRecord.name;
    }
  }

  return undefined;
}
