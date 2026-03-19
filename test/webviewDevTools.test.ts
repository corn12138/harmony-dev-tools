import { describe, expect, it } from 'vitest';
import {
  formatDebugTarget,
  listHostIpv4Addresses,
  listHostNetworkAddresses,
  parseDeviceIpv4Addresses,
  parseDeviceNetworkAddresses,
  pickPreferredDeviceAddress,
  pickPreferredDeviceIpv4,
} from '../src/webview/network';
import { parseWebDebuggingAccess } from '../src/webview/projectAnalysis';
import {
  parseHdcFportMappings,
  parseWebViewDevToolsSockets,
} from '../src/webview/devtools';

describe('webview devtools helpers', () => {
  it('should parse USB WebView DevTools enablement', () => {
    expect(parseWebDebuggingAccess(`
      import { webview } from '@kit.ArkWeb';
      webview.WebviewController.setWebDebuggingAccess(true);
    `)).toEqual({ enabled: true, port: undefined });
  });

  it('should parse wireless WebView DevTools enablement', () => {
    expect(parseWebDebuggingAccess(`
      import { webview } from '@kit.ArkWeb';
      webview.WebviewController.setWebDebuggingAccess(true, 8888);
    `)).toEqual({ enabled: true, port: 8888 });
  });

  it('should parse running WebView DevTools sockets from hdc shell output', () => {
    const stdout = `
0000000000000000: 00000002 00000000 00010000 0001 01 12345 @webview_devtools_remote_38532
0000000000000000: 00000002 00000000 00010000 0001 01 12346 @webview_devtools_remote_38540
0000000000000000: 00000002 00000000 00010000 0001 01 12346 @webview_devtools_remote_38540
`;

    expect(parseWebViewDevToolsSockets(stdout)).toEqual([
      'webview_devtools_remote_38532',
      'webview_devtools_remote_38540',
    ]);
  });

  it('should parse HDC fport mappings', () => {
    const stdout = `
tcp:9222 localabstract:webview_devtools_remote_38532
tcp:9230 tcp:9230
[Empty]
`;

    expect(parseHdcFportMappings(stdout)).toEqual([
      { local: 'tcp:9222', remote: 'localabstract:webview_devtools_remote_38532' },
      { local: 'tcp:9230', remote: 'tcp:9230' },
    ]);
  });

  it('should parse device IPv4 addresses from ip addr output', () => {
    const stdout = `
2: wlan0    inet 192.168.0.3/24 brd 192.168.0.255 scope global wlan0
5: rmnet0   inet 10.23.4.9/24 brd 10.23.4.255 scope global rmnet0
1: lo       inet 127.0.0.1/8 scope host lo
`;

    expect(parseDeviceIpv4Addresses(stdout)).toEqual([
      { interfaceName: 'wlan0', address: '192.168.0.3', prefixLength: 24 },
      { interfaceName: 'rmnet0', address: '10.23.4.9', prefixLength: 24 },
    ]);
  });

  it('should parse device IPv4 addresses from ifconfig output', () => {
    const stdout = `
wlan0     Link encap:Ethernet  HWaddr 00:11:22:33:44:55
          inet addr:192.168.8.6  Bcast:192.168.8.255  Mask:255.255.255.0
lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
`;

    expect(parseDeviceIpv4Addresses(stdout)).toEqual([
      { interfaceName: 'wlan0', address: '192.168.8.6', prefixLength: undefined },
    ]);
  });

  it('should parse device IPv6 addresses and ignore link-local output', () => {
    const stdout = `
2: wlan0    inet6 2408:8711:2222:3333::66/64 scope global dynamic
2: wlan0    inet6 fe80::1234:5678:9abc:def0/64 scope link
1: lo       inet6 ::1/128 scope host
`;

    expect(parseDeviceNetworkAddresses(stdout)).toEqual([
      { interfaceName: 'wlan0', address: '2408:8711:2222:3333::66', family: 'IPv6', prefixLength: 64 },
    ]);
  });

  it('should prefer a device address that matches the host subnet', () => {
    const deviceAddresses = [
      { interfaceName: 'rmnet0', address: '10.23.4.9', prefixLength: 24 },
      { interfaceName: 'wlan0', address: '192.168.8.6', prefixLength: 24 },
    ];
    const hostAddresses = [
      { address: '192.168.8.20', prefixLength: 24 },
    ];

    expect(pickPreferredDeviceIpv4(deviceAddresses, hostAddresses)).toEqual(
      { interfaceName: 'wlan0', address: '192.168.8.6', prefixLength: 24 },
    );
  });

  it('should prefer an IPv6 device address that matches the host subnet when IPv4 is unavailable', () => {
    const deviceAddresses = [
      { interfaceName: 'wlan0', address: '2408:8711:2222:3333::66', family: 'IPv6' as const, prefixLength: 64 },
      { interfaceName: 'rmnet0', address: 'fd00:1234:5678:9abc::10', family: 'IPv6' as const, prefixLength: 64 },
    ];
    const hostAddresses = [
      { address: '2408:8711:2222:3333::77', family: 'IPv6' as const, prefixLength: 64 },
    ];

    expect(pickPreferredDeviceAddress(deviceAddresses, hostAddresses)).toEqual(
      { interfaceName: 'wlan0', address: '2408:8711:2222:3333::66', family: 'IPv6', prefixLength: 64 },
    );
  });

  it('should list non-internal host IPv4 addresses', () => {
    expect(listHostIpv4Addresses({
      en0: [
        { address: '192.168.8.20', netmask: '255.255.255.0', family: 'IPv4', mac: 'aa', internal: false, cidr: '192.168.8.20/24' },
        { address: 'fe80::1', netmask: 'ffff', family: 'IPv6', mac: 'aa', internal: false, cidr: 'fe80::1/64', scopeid: 0 },
      ],
      lo0: [
        { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: 'bb', internal: true, cidr: '127.0.0.1/8' },
      ],
    })).toEqual([
      { address: '192.168.8.20', prefixLength: 24 },
    ]);
  });

  it('should list non-internal host IPv6 addresses', () => {
    expect(listHostNetworkAddresses({
      en0: [
        { address: '2408:8711:2222:3333::77', netmask: 'ffff', family: 'IPv6', mac: 'aa', internal: false, cidr: '2408:8711:2222:3333::77/64', scopeid: 0 },
        { address: 'fe80::1', netmask: 'ffff', family: 'IPv6', mac: 'aa', internal: false, cidr: 'fe80::1/64', scopeid: 1 },
      ],
    })).toEqual([
      { address: '2408:8711:2222:3333::77', family: 'IPv6', prefixLength: 64 },
    ]);
  });

  it('should format IPv6 debug targets using brackets', () => {
    expect(formatDebugTarget('2408:8711:2222:3333::66', 8888)).toBe('[2408:8711:2222:3333::66]:8888');
    expect(formatDebugTarget('192.168.8.6', 8888)).toBe('192.168.8.6:8888');
  });
});
