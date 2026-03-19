import * as os from 'os';

export interface DeviceIpv4Address {
  address: string;
  prefixLength?: number;
  interfaceName?: string;
}

interface HostIpv4Address {
  address: string;
  prefixLength?: number;
}

const IPV4_PATTERN = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;

export function parseDeviceIpv4Addresses(stdout: string): DeviceIpv4Address[] {
  const addresses: DeviceIpv4Address[] = [];
  const seen = new Set<string>();

  for (const match of stdout.matchAll(/^\d+:\s+([^\s:]+)[^\n]*\binet\s+(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})\b/gm)) {
    const candidate = {
      interfaceName: match[1],
      address: match[2],
      prefixLength: Number.parseInt(match[3], 10),
    } satisfies DeviceIpv4Address;
    if (shouldKeepIpv4(candidate.address) && !seen.has(candidate.address)) {
      seen.add(candidate.address);
      addresses.push(candidate);
    }
  }

  if (addresses.length > 0) {
    return addresses;
  }

  let currentInterface: string | undefined;
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd();
    const interfaceMatch = line.match(/^([A-Za-z0-9_.:-]+)(?:\s|:)/);
    if (interfaceMatch && !line.includes(' inet ')) {
      currentInterface = interfaceMatch[1];
    }

    const inetMatch = line.match(/\binet\s(?:addr:)?(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?/);
    if (!inetMatch) {
      continue;
    }

    const address = inetMatch[1];
    if (!shouldKeepIpv4(address) || seen.has(address)) {
      continue;
    }

    seen.add(address);
    addresses.push({
      address,
      prefixLength: inetMatch[2] ? Number.parseInt(inetMatch[2], 10) : undefined,
      interfaceName: currentInterface,
    });
  }

  return addresses;
}

export function listHostIpv4Addresses(
  networkInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): HostIpv4Address[] {
  const seen = new Set<string>();
  const results: HostIpv4Address[] = [];

  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !shouldKeepIpv4(entry.address)) {
        continue;
      }

      if (seen.has(entry.address)) {
        continue;
      }

      seen.add(entry.address);
      results.push({
        address: entry.address,
        prefixLength: cidrToPrefixLength(entry.cidr),
      });
    }
  }

  return results;
}

export function pickPreferredDeviceIpv4(
  deviceAddresses: DeviceIpv4Address[],
  hostAddresses: HostIpv4Address[],
): DeviceIpv4Address | undefined {
  for (const candidate of deviceAddresses) {
    for (const host of hostAddresses) {
      const prefixLength = candidate.prefixLength ?? host.prefixLength ?? 24;
      if (isSameSubnet(candidate.address, host.address, prefixLength)) {
        return candidate;
      }
    }
  }

  return deviceAddresses.find((entry) => isPrivateIpv4(entry.address)) ?? deviceAddresses[0];
}

function shouldKeepIpv4(address: string): boolean {
  if (!IPV4_PATTERN.test(address)) {
    return false;
  }

  return !address.startsWith('127.') && !address.startsWith('169.254.');
}

function isPrivateIpv4(address: string): boolean {
  return address.startsWith('10.')
    || address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
}

function cidrToPrefixLength(cidr?: string | null): number | undefined {
  if (!cidr || !cidr.includes('/')) {
    return undefined;
  }
  const suffix = cidr.slice(cidr.lastIndexOf('/') + 1);
  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ipv4ToInt(address: string): number {
  return address.split('.').reduce((value, part) => ((value << 8) | Number.parseInt(part, 10)) >>> 0, 0);
}

function prefixLengthToMask(prefixLength: number): number {
  if (prefixLength <= 0) {
    return 0;
  }
  if (prefixLength >= 32) {
    return 0xffffffff;
  }
  return (0xffffffff << (32 - prefixLength)) >>> 0;
}

function isSameSubnet(left: string, right: string, prefixLength: number): boolean {
  const mask = prefixLengthToMask(prefixLength);
  return (ipv4ToInt(left) & mask) === (ipv4ToInt(right) & mask);
}
