import * as os from 'os';

export type NetworkFamily = 'IPv4' | 'IPv6';

export interface DeviceNetworkAddress {
  address: string;
  family: NetworkFamily;
  prefixLength?: number;
  interfaceName?: string;
}

export interface HostNetworkAddress {
  address: string;
  family: NetworkFamily;
  prefixLength?: number;
}

export interface DeviceIpv4Address {
  address: string;
  prefixLength?: number;
  interfaceName?: string;
}

interface HostIpv4Address {
  address: string;
  prefixLength?: number;
}

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function parseDeviceNetworkAddresses(stdout: string): DeviceNetworkAddress[] {
  const addresses: DeviceNetworkAddress[] = [];
  const seen = new Set<string>();

  for (const match of stdout.matchAll(/^\d+:\s+([^\s:]+)[^\n]*\b(inet6?)\s+([0-9a-zA-Z_.:%-]+)\/(\d{1,3})\b(?:[^\n]*\bscope\s+([a-zA-Z]+))?/gm)) {
    const family = match[2] === 'inet6' ? 'IPv6' : 'IPv4';
    const address = normalizeIpAddress(match[3], family);
    const candidate = {
      interfaceName: match[1],
      address,
      family,
      prefixLength: Number.parseInt(match[4], 10),
    } satisfies DeviceNetworkAddress;
    if (shouldKeepAddress(candidate, match[5]?.toLowerCase()) && !seen.has(toSeenKey(candidate))) {
      seen.add(toSeenKey(candidate));
      addresses.push(candidate);
    }
  }

  if (addresses.length > 0) {
    return addresses;
  }

  let currentInterface: string | undefined;
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd();
    const interfaceMatch = line.match(/^(?:\d+:\s+)?([A-Za-z0-9_.:-]+)(?:\s|:)/);
    if (interfaceMatch && !line.includes(' inet ')) {
      currentInterface = interfaceMatch[1];
    }

    const ipv4Match = line.match(/\binet\s(?:addr:)?(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?/);
    if (ipv4Match) {
      const candidate = {
        address: ipv4Match[1],
        family: 'IPv4',
        prefixLength: ipv4Match[2] ? Number.parseInt(ipv4Match[2], 10) : undefined,
        interfaceName: currentInterface,
      } satisfies DeviceNetworkAddress;
      if (shouldKeepAddress(candidate) && !seen.has(toSeenKey(candidate))) {
        seen.add(toSeenKey(candidate));
        addresses.push(candidate);
      }
      continue;
    }

    const ipv6Match = line.match(/\binet6\s(?:addr:\s*)?([0-9a-zA-Z_.:%-]+)(?:\/(\d{1,3}))?(?:.*\bprefixlen\s+(\d{1,3}))?/);
    if (!ipv6Match) {
      continue;
    }

    const candidate = {
      address: normalizeIpAddress(ipv6Match[1], 'IPv6'),
      family: 'IPv6',
      prefixLength: ipv6Match[2]
        ? Number.parseInt(ipv6Match[2], 10)
        : ipv6Match[3]
          ? Number.parseInt(ipv6Match[3], 10)
          : undefined,
      interfaceName: currentInterface,
    } satisfies DeviceNetworkAddress;
    const scope = line.match(/\bScope:([A-Za-z]+)|\bscope\s+([A-Za-z]+)/)?.slice(1).find(Boolean)?.toLowerCase();
    if (shouldKeepAddress(candidate, scope) && !seen.has(toSeenKey(candidate))) {
      seen.add(toSeenKey(candidate));
      addresses.push(candidate);
    }
  }

  return addresses;
}

export function listHostNetworkAddresses(
  networkInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): HostNetworkAddress[] {
  const seen = new Set<string>();
  const results: HostNetworkAddress[] = [];

  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      const family = normalizeHostFamily(entry.family);
      if (!family || entry.internal) {
        continue;
      }

      const candidate = {
        address: normalizeIpAddress(entry.address, family),
        family,
        prefixLength: cidrToPrefixLength(entry.cidr),
      } satisfies HostNetworkAddress;

      if (!shouldKeepAddress(candidate) || seen.has(toSeenKey(candidate))) {
        continue;
      }

      seen.add(toSeenKey(candidate));
      results.push(candidate);
    }
  }

  return results;
}

export function pickPreferredDeviceAddress(
  deviceAddresses: DeviceNetworkAddress[],
  hostAddresses: HostNetworkAddress[],
): DeviceNetworkAddress | undefined {
  const ipv4Match = findSameSubnetMatch(
    deviceAddresses.filter((entry) => entry.family === 'IPv4'),
    hostAddresses.filter((entry) => entry.family === 'IPv4'),
  );
  if (ipv4Match) {
    return ipv4Match;
  }

  const ipv6Match = findSameSubnetMatch(
    deviceAddresses.filter((entry) => entry.family === 'IPv6'),
    hostAddresses.filter((entry) => entry.family === 'IPv6'),
  );
  if (ipv6Match) {
    return ipv6Match;
  }

  return [...deviceAddresses].sort(compareAddressPreference)[0];
}

export function formatDebugTarget(address: string, port: number): string {
  return address.includes(':') ? `[${address}]:${port}` : `${address}:${port}`;
}

export function parseDeviceIpv4Addresses(stdout: string): DeviceIpv4Address[] {
  return parseDeviceNetworkAddresses(stdout)
    .filter((entry): entry is DeviceNetworkAddress & { family: 'IPv4' } => entry.family === 'IPv4')
    .map((entry) => ({
      address: entry.address,
      prefixLength: entry.prefixLength,
      interfaceName: entry.interfaceName,
    }));
}

export function listHostIpv4Addresses(
  networkInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): HostIpv4Address[] {
  return listHostNetworkAddresses(networkInterfaces)
    .filter((entry): entry is HostNetworkAddress & { family: 'IPv4' } => entry.family === 'IPv4')
    .map((entry) => ({
      address: entry.address,
      prefixLength: entry.prefixLength,
    }));
}

export function pickPreferredDeviceIpv4(
  deviceAddresses: DeviceIpv4Address[],
  hostAddresses: HostIpv4Address[],
): DeviceIpv4Address | undefined {
  const picked = pickPreferredDeviceAddress(
    deviceAddresses.map((entry) => ({ ...entry, family: 'IPv4' as const })),
    hostAddresses.map((entry) => ({ ...entry, family: 'IPv4' as const })),
  );

  return picked
    ? {
      address: picked.address,
      prefixLength: picked.prefixLength,
      interfaceName: picked.interfaceName,
    }
    : undefined;
}

function findSameSubnetMatch(
  deviceAddresses: DeviceNetworkAddress[],
  hostAddresses: HostNetworkAddress[],
): DeviceNetworkAddress | undefined {
  for (const candidate of deviceAddresses) {
    for (const host of hostAddresses) {
      if (candidate.family !== host.family) {
        continue;
      }

      const prefixLength = candidate.prefixLength ?? host.prefixLength ?? (candidate.family === 'IPv4' ? 24 : 64);
      if (isSameSubnet(candidate.address, host.address, prefixLength, candidate.family)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function compareAddressPreference(left: DeviceNetworkAddress, right: DeviceNetworkAddress): number {
  return scoreAddress(right) - scoreAddress(left);
}

function scoreAddress(candidate: DeviceNetworkAddress): number {
  if (candidate.family === 'IPv4') {
    if (isPrivateIpv4(candidate.address)) {
      return 40;
    }
    return 30;
  }

  if (isUniqueLocalIpv6(candidate.address)) {
    return 20;
  }
  if (isGlobalIpv6(candidate.address)) {
    return 10;
  }
  return 0;
}

function shouldKeepAddress(
  candidate: Pick<DeviceNetworkAddress, 'address' | 'family'>,
  scope?: string,
): boolean {
  if (candidate.family === 'IPv4') {
    return shouldKeepIpv4(candidate.address);
  }

  return shouldKeepIpv6(candidate.address, scope);
}

function shouldKeepIpv4(address: string): boolean {
  if (!IPV4_PATTERN.test(address)) {
    return false;
  }

  return !address.startsWith('127.') && !address.startsWith('169.254.');
}

function shouldKeepIpv6(address: string, scope?: string): boolean {
  const normalized = normalizeIpAddress(address, 'IPv6');
  if (!normalized.includes(':')) {
    return false;
  }
  if (normalized === '::1' || normalized === '::') {
    return false;
  }
  if (scope === 'host' || scope === 'link') {
    return false;
  }
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return false;
  }
  if (normalized.startsWith('ff')) {
    return false;
  }
  return true;
}

function toSeenKey(candidate: Pick<DeviceNetworkAddress, 'family' | 'address'>): string {
  return `${candidate.family}:${candidate.address}`;
}

function normalizeHostFamily(family: string | number): NetworkFamily | undefined {
  if (family === 'IPv4' || family === 4) {
    return 'IPv4';
  }
  if (family === 'IPv6' || family === 6) {
    return 'IPv6';
  }
  return undefined;
}

function normalizeIpAddress(address: string, family: NetworkFamily): string {
  return family === 'IPv6'
    ? address.split('%')[0].toLowerCase()
    : address;
}

function isPrivateIpv4(address: string): boolean {
  return address.startsWith('10.')
    || address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
}

function isUniqueLocalIpv6(address: string): boolean {
  return /^[fd][0-9a-f]/.test(normalizeIpAddress(address, 'IPv6'));
}

function isGlobalIpv6(address: string): boolean {
  const normalized = normalizeIpAddress(address, 'IPv6');
  return /^[23][0-9a-f]/.test(normalized) || normalized.startsWith('2001:');
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

function ipv6ToBigInt(address: string): bigint {
  const normalized = normalizeIpAddress(address, 'IPv6');
  const [head, tail] = normalized.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail ? tail.split(':').filter(Boolean) : [];
  const expandedTail = tailParts.flatMap(expandIpv6Chunk);
  const expandedHead = headParts.flatMap(expandIpv6Chunk);
  const missing = 8 - (expandedHead.length + expandedTail.length);
  const segments = [
    ...expandedHead,
    ...new Array(Math.max(missing, 0)).fill('0'),
    ...expandedTail,
  ].slice(0, 8);

  return segments.reduce<bigint>(
    (value, part) => (value << 16n) | BigInt(Number.parseInt(part, 16)),
    0n,
  );
}

function expandIpv6Chunk(chunk: string): string[] {
  if (!chunk.includes('.')) {
    return [chunk];
  }

  const parts = chunk.split('.').map((item) => Number.parseInt(item, 10));
  const left = ((parts[0] << 8) | parts[1]).toString(16);
  const right = ((parts[2] << 8) | parts[3]).toString(16);
  return [left, right];
}

function prefixLengthToMask(prefixLength: number, family: NetworkFamily): bigint {
  if (prefixLength <= 0) {
    return 0n;
  }

  const size = family === 'IPv4' ? 32n : 128n;
  const capped = BigInt(Math.min(prefixLength, Number(size)));
  if (capped >= size) {
    return (1n << size) - 1n;
  }

  return ((1n << capped) - 1n) << (size - capped);
}

function isSameSubnet(left: string, right: string, prefixLength: number, family: NetworkFamily): boolean {
  if (family === 'IPv4') {
    const mask = Number(prefixLengthToMask(prefixLength, family));
    return (ipv4ToInt(left) & mask) === (ipv4ToInt(right) & mask);
  }

  const mask = prefixLengthToMask(prefixLength, family);
  return (ipv6ToBigInt(left) & mask) === (ipv6ToBigInt(right) & mask);
}
