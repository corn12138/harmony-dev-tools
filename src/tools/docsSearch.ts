import * as vscode from 'vscode';
import { getDecorators, getComponents, apiLabel, type DecoratorMeta, type ComponentMeta } from '../utils/metadata';
import { LATEST_HARMONY_RELEASE } from '../utils/harmonySdk';

interface DocItem extends vscode.QuickPickItem {
  docUrl: string;
}

const OFFICIAL_SHORTCUTS: DocItem[] = [
  {
    label: 'HarmonyOS 版本说明 / Release Notes',
    detail: `查看公开版本历史，当前已知最新公开版本为 ${LATEST_HARMONY_RELEASE.sdkVersion}`,
    docUrl: 'https://developer.huawei.com/consumer/en/doc/harmonyos-releases/overview-allversion',
  },
  {
    label: 'HarmonyOS 知识地图 / Knowledge Map',
    detail: '从官方知识地图按场景查看 ArkUI、工程、调试和分发资料',
    docUrl: 'https://developer.huawei.com/consumer/cn/app/knowledge-map/',
  },
  {
    label: 'HarmonyOS Command Line Tools',
    detail: '查看 sdkmgr / ohpm / codelinter 的获取与使用说明',
    docUrl: 'https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-commandline-get',
  },
  {
    label: 'HarmonyOS 下载中心 / Downloads',
    detail: '下载最新 SDK、Command Line Tools、DevEco Studio 等工具',
    docUrl: 'https://developer.huawei.com/consumer/en/download/',
  },
];

const CURRENT_ARKUI_SHORTCUTS: DocItem[] = [
  {
    label: 'ArkUI Repeat / 差量复用渲染',
    detail: '官方 Repeat 指南：相较 ForEach，在部分更新场景有更好的渲染性能',
    docUrl: 'https://gitee.com/openharmony/docs/blob/f013f0d3312a247aac9c4eb1e6f29d636eafbeed/en/application-dev/quick-start/arkts-new-rendering-control-repeat.md',
  },
  {
    label: 'Component Freeze / freezeWhenInactive',
    detail: '官方组件冻结指南：用于页面路由、Tabs、LazyForEach、Navigation 等场景',
    docUrl: 'https://gitee.com/openharmony/docs/blob/1a3ce694233182c1e66fa10dcdcede2ad5592661/en/application-dev/quick-start/arkts-custom-components-freeze.md',
  },
  {
    label: 'WithTheme / 应用内主题换肤',
    detail: '官方 WithTheme 组件文档：局部主题、深浅色模式和自定义配色入口',
    docUrl: 'https://gitee.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-arkui/arkui-ts/ts-container-with-theme.md',
  },
  {
    label: 'ThemeControl / 应用级主题设置',
    detail: '官方 ThemeControl 文档：应用级 setDefaultTheme 与主题对象接口',
    docUrl: 'https://gitee.com/openharmony/docs/blob/14c2fb4ddf051bda012f7c0fbfad196192d8c934/zh-cn/application-dev/reference/apis-arkui/js-apis-arkui-theme.md',
  },
  {
    label: 'State Management V2 Overview / 状态管理 V2 概览',
    detail: '官方对 V1/V2 差异、兼容关系、withTheme API 16 支持等的最新说明',
    docUrl: 'https://gitee.com/openharmony/docs/blob/2625097b75653e461804aafe08ffc780c69d9f91/zh-cn/application-dev/quick-start/arkts-state-management-overview.md',
  },
];

export async function openDocs(prefill?: string): Promise<void> {
  const items = buildDocItems();

  const pick = await vscode.window.showQuickPick(items, {
    title: 'HarmonyOS 文档快速跳转 / Quick Docs',
    placeHolder: prefill || '输入装饰器或组件名，如 @State, Column, @ComponentV2 …',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!pick) return;

  if (pick.docUrl) {
    vscode.env.openExternal(vscode.Uri.parse(pick.docUrl));
    return;
  }

  const searchUrl = `https://developer.huawei.com/consumer/cn/search?keyword=${encodeURIComponent(pick.label)}&filterType=doc`;
  vscode.env.openExternal(vscode.Uri.parse(searchUrl));
}

function buildDocItems(): DocItem[] {
  const items: DocItem[] = [];

  const decorators = getDecorators();
  const components = getComponents();

  items.push({ label: '官方入口 / Official Shortcuts', kind: vscode.QuickPickItemKind.Separator, docUrl: '' });
  items.push(...OFFICIAL_SHORTCUTS);
  items.push({ label: '当前 ArkUI 主题 / Current ArkUI Topics', kind: vscode.QuickPickItemKind.Separator, docUrl: '' });
  items.push(...CURRENT_ARKUI_SHORTCUTS);

  const decsByModel = new Map<string, DecoratorMeta[]>();
  for (const d of decorators) {
    const key = d.stateModel === 'v1' ? 'V1 装饰器' : d.stateModel === 'v2' ? 'V2 装饰器 (API 12+)' : '通用装饰器';
    if (!decsByModel.has(key)) decsByModel.set(key, []);
    decsByModel.get(key)!.push(d);
  }

  for (const [group, decs] of decsByModel) {
    items.push({ label: group, kind: vscode.QuickPickItemKind.Separator, docUrl: '' });
    for (const d of decs) {
      const tag = apiLabel(d.minApi);
      items.push({
        label: d.name,
        description: tag || undefined,
        detail: d.zh,
        docUrl: d.docUrl,
      });
    }
  }

  const compsByCat = new Map<string, ComponentMeta[]>();
  for (const c of components) {
    const catLabel = componentCategoryLabel(c.category);
    if (!compsByCat.has(catLabel)) compsByCat.set(catLabel, []);
    compsByCat.get(catLabel)!.push(c);
  }

  for (const [group, comps] of compsByCat) {
    items.push({ label: group, kind: vscode.QuickPickItemKind.Separator, docUrl: '' });
    for (const c of comps) {
      const tag = apiLabel(c.minApi);
      items.push({
        label: c.name,
        description: tag || undefined,
        detail: c.zh,
        docUrl: c.docUrl,
      });
    }
  }

  items.push({ label: '其他 / Other', kind: vscode.QuickPickItemKind.Separator, docUrl: '' });
  items.push({
    label: '搜索官方文档 / Search HarmonyOS Docs …',
    detail: '输入关键词搜索华为开发者文档',
    docUrl: '',
  });

  return items;
}

function componentCategoryLabel(cat: string): string {
  switch (cat) {
    case 'layout': return '布局组件 / Layout';
    case 'basic': return '基础组件 / Basic';
    case 'media': return '媒体组件 / Media & Web';
    case 'canvas': return '画布组件 / Canvas & Drawing';
    case 'menu': return '菜单组件 / Menu';
    default: return '其他组件 / Other';
  }
}
