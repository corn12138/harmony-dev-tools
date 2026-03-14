import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getSdkPath, getHdcPath, resolveHdcPath, resolveToolPath } from '../utils/config';
import { CONFIG_FILES } from '../utils/constants';
import { getPreferredWorkspaceFolder } from '../utils/workspace';

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
  } else {
    warn('未在设置中配置 harmony.sdkPath（可选，构建由 hvigor 管理）');
    channel.appendLine(`  如需指定: 设置 → harmony.sdkPath | ${DOC_SDK}`);
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
  } else {
    warn('未检测到 HarmonyOS Command Line Tools（sdkmgr / ohpm / codelinter）');
    channel.appendLine(`  安装入口: ${DOC_DOWNLOADS}`);
    channel.appendLine(`  使用文档: ${DOC_COMMAND_LINE_TOOLS}`);
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
  } else {
    try {
      const resolved = await resolveHdcPath();
      if (resolved && resolved !== 'hdc' && fs.existsSync(resolved)) {
        ok(`自动检测: ${resolved}`);
      } else if (resolved === 'hdc') {
        warn('未找到 HDC，设备/模拟器操作将不可用');
        fail('请安装 HarmonyOS SDK 或配置 harmony.hdcPath', DOC_HDC);
      } else {
        ok(`使用: ${resolved}`);
      }
    } catch {
      fail('HDC 解析失败，请配置 harmony.hdcPath', DOC_HDC);
    }
  }
  channel.appendLine('');

  // 4. 当前工作区鸿蒙工程
  channel.appendLine('4. 当前工作区');
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
  const hvigorw = path.join(root, process.platform === 'win32' ? 'hvigorw.bat' : 'hvigorw');

  if (fs.existsSync(buildProfile)) {
    ok(`鸿蒙工程: ${root}`);
    if (fs.existsSync(hvigorw)) {
      ok('hvigor 脚本存在，可执行构建');
    } else {
      warn('未找到 hvigorw / hvigorw.bat，无法在 VS Code 中直接构建');
    }
  } else {
    warn('当前文件夹未检测到 build-profile.json5，非鸿蒙工程根目录');
  }

  channel.appendLine('');
  channel.appendLine('--- 完成。建议补充官方入口到本地书签 ---');
  channel.appendLine(`  Command Line Tools: ${DOC_COMMAND_LINE_TOOLS}`);
  channel.appendLine(`  版本说明: ${DOC_RELEASE_NOTES}`);
  channel.appendLine(`  知识地图: ${DOC_KNOWLEDGE_MAP}`);
}
