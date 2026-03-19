import { describe, expect, it } from 'vitest';
import { listHostIpv4Addresses, parseDeviceIpv4Addresses, pickPreferredDeviceIpv4 } from '../src/webview/network';
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
});
