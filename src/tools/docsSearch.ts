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
