import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  getSdkPath,
  getHdcPath,
  resolveEmulatorPath,
  resolveHdcPath,
  resolveHvigorPath,
  resolveToolPath,
} from '../utils/config';
import { coerceHdcCommandError, describeHdcCommandError } from '../utils/hdc';
import { formatHvigorProjectSetupIssue, inspectHvigorProjectSetup } from '../utils/hvigor';
import {
  formatSigningBundleNameMismatch,
  formatSigningProfileSetupIssue,
  inspectSigningProfileSetup,
} from './signingProfile';
import {
  buildLocalSigningRecoverySteps,
  discoverLocalSigningMaterials,
  formatLocalSigningCandidates,
} from './localSigning';
import { detectEmulators } from '../device/emulatorManager';
import { CONFIG_FILES } from '../utils/constants';
import { getPreferredWorkspaceFolder } from '../utils/workspace';
import { resolveDevToolsBrowser } from '../webview/browser';
import { probeEmulatorBinary } from '../device/emulatorSupport';
import { probeHvigorEnvironment } from '../utils/hvigorProbe';
import { readBundleName } from '../utils/projectMetadata';
import { probeHdcEnvironment } from '../utils/hdcProbe';
import { getHvigorFailureRecoverySteps } from '../utils/hvigorOutput';

const DOC_SDK = 'https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-install-sdk-0000001052513743';
const DOC_HDC = 'https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-connect-device-0000001054293509';
const DOC_COMMAND_LINE_TOOLS = 'https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-commandline-get';
const DOC_DOWNLOADS = 'https://developer.huawei.com/consumer/en/download/';
const DOC_RELEASE_NOTES = 'https://developer.huawei.com/consumer/en/doc/harmonyos-releases/overview-allversion';
const DOC_KNOWLEDGE_MAP = 'https://developer.huawei.com/consumer/cn/app/knowledge-map/';

export async function checkEnvironment(): Promise<void> {
  const channel = vscode.window.createOutputChannel('HarmonyOS Environment');
  channel.clear();
  channel.show();

  const ok = (msg: string) => {
    channel.appendLine(`  ✓ ${msg}`);
  };
  const warn = (msg: string) => {
    channel.appendLine(`  ⚠ ${msg}`);
  };
  const fail = (msg: string, doc?: string) => {
    channel.appendLine(`  ✗ ${msg}`);
    if (doc) channel.appendLine(`    → ${doc}`);
  };

  channel.appendLine('=== HarmonyOS 开发环境检查 ===');
  channel.appendLine('');

  // 1. SDK
  channel.appendLine('1. SDK 路径');
  const sdkPath = getSdkPath();
  if (sdkPath && fs.existsSync(sdkPath)) {
    ok(`已配置且存在: ${sdkPath}`);
  } else if (sdkPath) {
    fail(`已配置但路径不存在: ${sdkPath}`, DOC_SDK);
    appendSdkManualHint(channel);
  } else {
    warn('未在设置中配置 harmony.sdkPath（可选，构建由 hvigor 管理）');
    channel.appendLine(`  如需指定: 设置 → harmony.sdkPath | ${DOC_SDK}`);
    appendSdkManualHint(channel);
  }
  channel.appendLine('');

  // 2. Command Line Tools
  channel.appendLine('2. Command Line Tools');
  const commandLineTools = await Promise.all([
    resolveToolPath('sdkmgr'),
    resolveToolPath('ohpm'),
    resolveToolPath('codelinter'),
  ]);
  const commandLineStatuses = [
    { name: 'sdkmgr', path: commandLineTools[0] },
    { name: 'ohpm', path: commandLineTools[1] },
    { name: 'codelinter', path: commandLineTools[2] },
  ];

  const detectedTools = commandLineStatuses.filter((tool) => tool.path);
  if (detectedTools.length === commandLineStatuses.length) {
    ok(`已检测到完整命令行工具链: ${detectedTools.map((tool) => tool.name).join(', ')}`);
  } else if (detectedTools.length > 0) {
    warn(`仅检测到部分命令行工具: ${detectedTools.map((tool) => tool.name).join(', ')}`);
    appendCommandLineToolsManualHint(channel);
  } else {
    warn('未检测到 HarmonyOS Command Line Tools（sdkmgr / ohpm / codelinter）');
    channel.appendLine(`  安装入口: ${DOC_DOWNLOADS}`);
    channel.appendLine(`  使用文档: ${DOC_COMMAND_LINE_TOOLS}`);
    appendCommandLineToolsManualHint(channel);
  }

  for (const tool of commandLineStatuses) {
    if (tool.path) {
      ok(`${tool.name}: ${tool.path}`);
    } else {
      warn(`${tool.name}: 未找到`);
    }
  }
  channel.appendLine('');

  // 3. HDC
  channel.appendLine('3. HDC（设备连接与调试）');
  const configuredHdc = getHdcPath();
  if (configuredHdc && fs.existsSync(configuredHdc)) {
    ok(`已配置: ${configuredHdc}`);
    await appendHdcRuntimeStatus(ok, warn, fail);
  } else {
    try {
      const resolved = await resolveHdcPath();
      if (resolved && resolved !== 'hdc' && fs.existsSync(resolved)) {
        ok(`自动检测: ${resolved}`);
        await appendHdcRuntimeStatus(ok, warn, fail);
      } else if (resolved === 'hdc') {
        warn('未找到 HDC，设备/模拟器操作将不可用');
        fail('请安装 HarmonyOS SDK 或配置 harmony.hdcPath', DOC_HDC);
        appendHdcManualHint(channel);
      } else {
        ok(`使用: ${resolved}`);
        await appendHdcRuntimeStatus(ok, warn, fail);
      }
    } catch (error) {
      fail(describeHdcCommandError(coerceHdcCommandError(error, 'hdc', ['list', 'targets'])), DOC_HDC);
      appendHdcManualHint(channel);
    }
  }
  channel.appendLine('');

  // 4. Emulator
  channel.appendLine('4. Emulator（可选）');
  const emulatorPath = await resolveEmulatorPath();
  const emulators = detectEmulators();
  const emulatorProbe = emulatorPath && fs.existsSync(emulatorPath)
    ? await probeEmulatorBinary(emulatorPath)
    : undefined;
  if (emulatorPath && fs.existsSync(emulatorPath)) {
    ok(`模拟器入口: ${emulatorPath}`);
  } else {
    warn('未检测到 DevEco 模拟器可执行文件；如需从扩展启动模拟器，请配置 harmony.emulatorPath');
    appendEmulatorManualHint(channel);
  }

  if (emulatorProbe?.listWorks) {
    if (emulatorProbe.listedNames.length > 0) {
      ok(`模拟器 CLI 可列出镜像: ${emulatorProbe.listedNames.join(', ')}`);
    } else {
      warn('模拟器 CLI 可执行，但没有列出任何镜像');
    }
  } else if (emulatorProbe?.errorMessage) {
    warn(`模拟器 CLI 自检失败: ${emulatorProbe.errorMessage.split('\n')[0]}`);
  }

  if (emulators.length > 0) {
    ok(`已检测到 ${emulators.length} 个本地模拟器镜像`);
    const cliReadyEmulators = emulators.filter((emulator) => emulator.launchRoot && emulator.imageRoot);
    if (cliReadyEmulators.length > 0) {
      ok(`命令行启动元数据完整: ${cliReadyEmulators.map((emulator) => emulator.name).join(', ')}`);
    } else if (emulatorPath && fs.existsSync(emulatorPath)) {
      warn('已检测到本地模拟器镜像，但未解析到完整的 CLI 启动元数据（-path / -imageRoot）；命令行启动可能失败。');
    }
  } else {
    warn('未检测到本地模拟器镜像；如需启动模拟器，请先在 DevEco Studio 中创建');
    appendEmulatorManualHint(channel);
  }

  if (emulatorProbe && emulators.length > 0 && !emulatorProbe.listWorks) {
    warn('本地镜像目录存在，但 emulator -list 失败，命令行启动模拟器时可能直接报错。');
    appendEmulatorManualHint(channel);
  }
  channel.appendLine('');

  // 5. WebView DevTools Browser
  channel.appendLine('5. WebView DevTools Browser（可选）');
  const devToolsBrowser = await resolveDevToolsBrowser();
  if (devToolsBrowser.executablePath) {
    ok(`浏览器入口: ${devToolsBrowser.displayName} (${devToolsBrowser.executablePath})`);
  } else {
    warn('未检测到 Chrome / Edge；WebView DevTools 将回退到系统默认浏览器，可能无法直接处理 inspect 协议。');
  }
  for (const warningMessage of devToolsBrowser.warnings) {
    warn(warningMessage);
  }
  channel.appendLine('');

  // 6. 当前工作区鸿蒙工程
  channel.appendLine('6. 当前工作区');
  const folder = getPreferredWorkspaceFolder();
  if (!folder) {
    warn('未打开文件夹');
    channel.appendLine('');
    channel.appendLine('--- 完成。可继续查看官方版本说明与知识地图 ---');
    channel.appendLine(`  版本说明: ${DOC_RELEASE_NOTES}`);
    channel.appendLine(`  知识地图: ${DOC_KNOWLEDGE_MAP}`);
    return;
  }

  const root = folder.uri.fsPath;
  const buildProfile = path.join(root, CONFIG_FILES.BUILD_PROFILE);
  const hvigorSetup = inspectHvigorProjectSetup(root);
  const externalHvigor = await resolveHvigorPath();
  const hasRunnableHvigor = (hvigorSetup.exists && hvigorSetup.missingRuntimePaths.length === 0) || Boolean(externalHvigor);
  const signingSetup = await inspectSigningProfileSetup(folder.uri);
  const appBundleName = await readBundleName(folder.uri).catch(() => undefined);
  const localSigningDiscovery = await discoverLocalSigningMaterials(signingSetup?.bundleName ?? appBundleName);

  if (fs.existsSync(buildProfile)) {
    ok(`鸿蒙工程: ${root}`);
    if (hvigorSetup.exists && hvigorSetup.missingRuntimePaths.length === 0) {
      ok('hvigor 脚本存在，可执行构建');
      for (const warningMessage of hvigorSetup.warnings) {
        warn(warningMessage);
      }
    } else if (externalHvigor) {
      warn(formatHvigorProjectSetupIssue(root, hvigorSetup));
      ok(`已检测到外部 hvigor，可作为回退构建入口: ${externalHvigor}`);
      for (const warningMessage of hvigorSetup.warnings) {
        warn(warningMessage);
      }
    } else if (hvigorSetup.exists) {
      warn(formatHvigorProjectSetupIssue(root, hvigorSetup));
      for (const warningMessage of hvigorSetup.warnings) {
        warn(warningMessage);
      }
    } else {
      warn('未找到 hvigorw / hvigorw.bat，无法在 VS Code 中直接构建');
    }

    if (signingSetup?.configured) {
      if (signingSetup.exists && signingSetup.readable) {
        ok(`签名 profile: ${signingSetup.profilePath}`);
        if (appBundleName && signingSetup.bundleName && appBundleName !== signingSetup.bundleName) {
          fail(formatSigningBundleNameMismatch(appBundleName, signingSetup.bundleName));
        }
      } else {
        warn(formatSigningProfileSetupIssue(signingSetup));
      }
      for (const warningMessage of signingSetup.warnings) {
        warn(warningMessage);
      }
    }

    appendLocalSigningDiscovery(channel, warn, localSigningDiscovery, signingSetup, appBundleName);

    if (hasRunnableHvigor) {
      const probe = await probeHvigorEnvironment(root);
      if (probe.ok) {
        ok('hvigor SDK 自检通过（tasks --no-daemon）');
      } else if (probe.kind === 'sdkLicenseNotAccepted') {
        fail('hvigor SDK 自检失败：当前机器未接受 HarmonyOS SDK License', DOC_SDK);
        for (const step of probe.summary ? getHvigorFailureRecoverySteps(probe.summary) : []) {
          channel.appendLine(`    → 手动处理: ${step}`);
        }
      } else if (probe.kind === 'sdkHomeMissing') {
        fail('hvigor SDK 自检失败：未解析到 sdk.dir / OHOS_BASE_SDK_HOME', DOC_SDK);
        for (const step of probe.summary ? getHvigorFailureRecoverySteps(probe.summary) : []) {
          channel.appendLine(`    → 手动处理: ${step}`);
        }
      } else if (probe.kind === 'sdkPathNotWritable') {
        fail('hvigor SDK 自检失败：当前 SDK 根目录不可写', DOC_SDK);
        for (const step of probe.summary ? getHvigorFailureRecoverySteps(probe.summary) : []) {
          channel.appendLine(`    → 手动处理: ${step}`);
        }
      } else if (probe.kind === 'sdkComponentMissing') {
        fail('hvigor SDK 自检失败：当前机器缺少 HarmonyOS SDK 必需组件', DOC_SDK);
        for (const step of probe.summary ? getHvigorFailureRecoverySteps(probe.summary) : []) {
          channel.appendLine(`    → 手动处理: ${step}`);
        }
      } else {
        const summaryLine = probe.summary?.message
          ?? probe.output
            .split('\n')
            .map((line) => line.trim())
            .find((line) => Boolean(line));
        warn(`hvigor SDK 自检失败：${summaryLine ?? 'tasks --no-daemon 未通过'}`);
      }
    }
  } else {
    warn('当前文件夹未检测到 build-profile.json5，非鸿蒙工程根目录');
  }

  channel.appendLine('');
  channel.appendLine('--- 完成。建议补充官方入口到本地书签 ---');
  channel.appendLine(`  Command Line Tools: ${DOC_COMMAND_LINE_TOOLS}`);
  channel.appendLine(`  版本说明: ${DOC_RELEASE_NOTES}`);
  channel.appendLine(`  知识地图: ${DOC_KNOWLEDGE_MAP}`);

  async function appendHdcRuntimeStatus(
    okStatus: (message: string) => void,
    warnStatus: (message: string) => void,
    failStatus: (message: string, doc?: string) => void,
  ): Promise<void> {
    const probe = await probeHdcEnvironment({
      listTimeoutMs: 3_000,
      targetTimeoutMs: 2_000,
    });
    if (!probe.ok) {
      failStatus(probe.error ? describeHdcCommandError(probe.error) : 'HDC probe failed.', DOC_HDC);
      return;
    }

    okStatus(`HDC 服务可访问，当前在线目标: ${probe.targets.length}`);
    if (probe.targets.length === 0) {
      warnStatus('HDC 服务正常，但当前没有在线设备/模拟器');
      return;
    }

    const shellReadyTargets = probe.targetProbes.filter((item) => item.shellReady);
    const shellPendingTargets = probe.targetProbes.filter((item) => !item.shellReady);

    if (shellReadyTargets.length > 0) {
      okStatus(`HDC shell 可访问: ${shellReadyTargets.map((item) => item.deviceId).join(', ')}`);
    }

    for (const pendingTarget of shellPendingTargets) {
      warnStatus(`在线目标 ${pendingTarget.deviceId} 已出现，但 shell 尚未就绪: ${pendingTarget.message ?? 'HDC shell probe failed.'}`);
    }
  }
}

function appendLocalSigningDiscovery(
  channel: vscode.OutputChannel,
  warn: (message: string) => void,
  discovery: Awaited<ReturnType<typeof discoverLocalSigningMaterials>>,
  signingSetup: Awaited<ReturnType<typeof inspectSigningProfileSetup>>,
  appBundleName: string | undefined,
): void {
  const shouldExplain = !signingSetup?.configured
    || !signingSetup.exists
    || !signingSetup.readable
    || (signingSetup.warnings?.length ?? 0) > 0;
  if (!shouldExplain) {
    return;
  }

  if (discovery.status === 'found' && discovery.candidate) {
    warn(`本机发现可复用的签名材料: ${discovery.candidate.stem}`);
    for (const step of buildLocalSigningRecoverySteps(discovery.candidate, { bundleName: appBundleName })) {
      channel.appendLine(`    → 手动处理: ${step}`);
    }
    return;
  }

  if (discovery.status === 'ambiguous') {
    warn('本机发现了多个可用签名候选，插件不会自动猜测。');
    for (const line of formatLocalSigningCandidates(discovery.candidates)) {
      channel.appendLine(`    ${line}`);
    }
    channel.appendLine('    → 手动处理: 进入默认签名目录 ~/.ohos/config、~/.ohos/config/openharmony，或你在 harmony.signingSearchPaths 里配置的目录，选择与当前 bundleName 匹配的一组。');
    channel.appendLine('    → 手动处理: 然后把 build-profile.json5 里的 profile / storeFile / certpath 改成那组路径。');
    return;
  }

  if (!signingSetup?.configured) {
    warn('当前 build-profile.json5 还没有绑定 signing profile，且本机也没有找到可自动复用的签名材料。');
    channel.appendLine('    → 手动处理: 打开 ~/.ohos/config、~/.ohos/config/openharmony，或你在 harmony.signingSearchPaths 里配置的目录，确认是否已经生成 .p7b / .p12 / .cer。');
    channel.appendLine('    → 手动处理: 若没有，请先在 DevEco Studio 里生成或导出签名材料，再回到 build-profile.json5 绑定。');
  }
}

function appendSdkManualHint(channel: vscode.OutputChannel): void {
  channel.appendLine(`  手动确认: 打开 ${getSdkSettingsEntry()}，查看实际 SDK 根目录。`);
  channel.appendLine(`  你应该能看到类似: ${getPlatformPathExamples().sdkRoot}`);
  channel.appendLine('  若项目根目录已有 local.properties 且包含 sdk.dir，也可直接复用那个路径。');
  channel.appendLine('  若 SDK 安装在非默认目录，可优先把根目录加到 harmony.sdkSearchPaths；仍不稳定时再直接填写 harmony.sdkPath。');
}

function appendCommandLineToolsManualHint(channel: vscode.OutputChannel): void {
  const examples = getPlatformPathExamples();
  channel.appendLine('  手动确认: 如果你使用的是单独解压的 Command Line Tools，请检查解压目录。');
  channel.appendLine(`  你应该能看到: ${examples.commandLineTools.bin}`);
  channel.appendLine(`  以及: ${examples.commandLineTools.toolchains}`);
  channel.appendLine('  若只安装了 DevEco Studio 而没有单独安装 Command Line Tools，sdkmgr / ohpm / codelinter 缺失是正常现象。');
  channel.appendLine('  若 command-line-tools 装在非默认目录，可把对应目录加到 harmony.commandLineToolsSearchPaths；若 DevEco Studio 装在非默认目录，也可加到 harmony.devEcoStudioSearchPaths。');
}

function appendHdcManualHint(channel: vscode.OutputChannel): void {
  const examples = getPlatformPathExamples();
  channel.appendLine(`  手动确认: 打开 ${getSdkSettingsEntry()}，记下实际 SDK 根目录。`);
  channel.appendLine('  你应该能在 SDK 根目录里看到其中一个:');
  channel.appendLine(`    - ${examples.hdc.direct}`);
  channel.appendLine(`    - ${examples.hdc.defaultOpenHarmony}`);
  channel.appendLine(`    - ${examples.hdc.defaultHarmonyOS}`);
  channel.appendLine(`    - ${examples.hdc.defaultHms}`);
  channel.appendLine(`    - ${examples.commandLineTools.toolchains}`);
  channel.appendLine('  若 HDC 位于非默认 SDK / command-line-tools 目录，可先补 harmony.sdkSearchPaths、harmony.commandLineToolsSearchPaths 或 harmony.devEcoStudioSearchPaths。');
  channel.appendLine('  若路径存在但扩展仍未自动识别，再把该文件直接填到 harmony.hdcPath。');
}

function appendEmulatorManualHint(channel: vscode.OutputChannel): void {
  const examples = getPlatformPathExamples();
  channel.appendLine(`  手动确认: 打开 ${getEmulatorSettingsEntry()} > Local Emulator。`);
  channel.appendLine('  你应该能看到已创建的模拟器列表，以及 Edit 里的 Local Emulator Location。');
  channel.appendLine(`  常见实例目录: ${examples.emulator.deployed}`);
  channel.appendLine(`  常见镜像目录: ${examples.emulator.images}`);
  channel.appendLine(`  常见可执行文件: ${examples.emulator.binary}`);
  channel.appendLine('  如果你改过 Local Emulator Location，或设置过 HarmonyOS_HVD_HOME，请以那个真实目录为准。');
  channel.appendLine('  若模拟器实例目录或 deployed 根目录不在默认位置，可先补 harmony.emulatorSearchPaths；若 DevEco Studio 装在非默认目录，可补 harmony.devEcoStudioSearchPaths。');
  channel.appendLine('  若找到了 emulator 可执行文件但扩展仍未自动识别，再把它填到 harmony.emulatorPath。');
}

function getSdkSettingsEntry(): string {
  return process.platform === 'darwin'
    ? 'DevEco Studio > Preferences > OpenHarmony SDK'
    : 'DevEco Studio > Settings > OpenHarmony SDK';
}

function getEmulatorSettingsEntry(): string {
  return 'DevEco Studio > Tools > Device Manager';
}

function getPlatformPathExamples(): {
  sdkRoot: string;
  commandLineTools: { bin: string; toolchains: string };
  hdc: {
    direct: string;
    defaultOpenHarmony: string;
    defaultHarmonyOS: string;
    defaultHms: string;
  };
  emulator: { deployed: string; images: string; binary: string };
} {
  if (process.platform === 'win32') {
    return {
      sdkRoot: 'C:\\Users\\<你>\\AppData\\Local\\Huawei\\Sdk 或 C:\\Program Files\\Huawei\\DevEco Studio\\sdk',
      commandLineTools: {
        bin: '<解压目录>\\command-line-tools\\bin\\sdkmgr(.exe/.cmd)',
        toolchains: '<解压目录>\\command-line-tools\\sdk\\default\\openharmony\\toolchains\\hdc.exe',
      },
      hdc: {
        direct: '<SDK根>\\toolchains\\hdc.exe',
        defaultOpenHarmony: '<SDK根>\\default\\openharmony\\toolchains\\hdc.exe',
        defaultHarmonyOS: '<SDK根>\\default\\harmonyos\\toolchains\\hdc.exe',
        defaultHms: '<SDK根>\\default\\hms\\toolchains\\hdc.exe',
      },
      emulator: {
        deployed: '%LOCALAPPDATA%\\Huawei\\Emulator\\deployed 或 %LOCALAPPDATA%\\Huawei\\HarmonyOSEmulator\\deployed',
        images: '%LOCALAPPDATA%\\Huawei\\Sdk',
        binary: 'C:\\Program Files\\Huawei\\DevEco Studio\\tools\\emulator\\emulator.exe',
      },
    };
  }

  return {
    sdkRoot: '/Applications/DevEco-Studio.app/Contents/sdk 或 ~/Library/Huawei/Sdk',
    commandLineTools: {
      bin: '<解压目录>/command-line-tools/bin/sdkmgr',
      toolchains: '<解压目录>/command-line-tools/sdk/default/openharmony/toolchains/hdc',
    },
    hdc: {
      direct: '<SDK根>/toolchains/hdc',
      defaultOpenHarmony: '<SDK根>/default/openharmony/toolchains/hdc',
      defaultHarmonyOS: '<SDK根>/default/harmonyos/toolchains/hdc',
      defaultHms: '<SDK根>/default/hms/toolchains/hdc',
    },
    emulator: {
      deployed: '~/.Huawei/Emulator/deployed',
      images: '~/Library/Huawei/Sdk',
      binary: '/Applications/DevEco-Studio.app/Contents/tools/emulator/emulator',
    },
  };
}
