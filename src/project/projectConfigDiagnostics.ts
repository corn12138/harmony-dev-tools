import * as path from 'path';
import * as vscode from 'vscode';
import { extractJson5StringValue } from '../utils/json5';
import { analyzeBuildProfileMigration } from './buildProfileMigration';
import { resolveSigningProfileInfo } from './signingProfile';

export const PROJECT_CONFIG_DIAG_SOURCE = 'HarmonyOS Project';

export const PROJECT_CONFIG_DIAG_CODES = {
  TARGET_SDK_MISSING: 'harmony-target-sdk-missing',
  BUILD_MODE_SET_MISSING: 'harmony-build-mode-set-missing',
  MODULE_PAGES_MISSING: 'harmony-module-pages-missing',
  PAGES_FILE_MISSING: 'harmony-pages-file-missing',
  MAIN_PAGES_EMPTY: 'harmony-main-pages-empty',
  PAGE_FILE_MISSING: 'harmony-page-file-missing',
  ENTRY_ABILITY_FILE_MISSING: 'harmony-entry-ability-file-missing',
  LOAD_CONTENT_MISSING: 'harmony-load-content-missing',
  LOAD_CONTENT_ROUTE_MISMATCH: 'harmony-load-content-route-mismatch',
  PAGE_ENTRY_MISSING: 'harmony-page-entry-missing',
  PAGE_ENTRY_DUPLICATE: 'harmony-page-entry-duplicate',
  ROUTER_MAP_FILE_MISSING: 'harmony-router-map-file-missing',
  ROUTE_MAP_EMPTY: 'harmony-route-map-empty',
  ROUTE_NAME_DUPLICATE: 'harmony-route-name-duplicate',
  ROUTE_PAGE_FILE_MISSING: 'harmony-route-page-file-missing',
  ROUTE_BUILDER_FUNCTION_MISSING: 'harmony-route-builder-function-missing',
  ROUTE_BUILDER_DECORATOR_MISSING: 'harmony-route-builder-decorator-missing',
  NAVIGATION_ROUTE_UNKNOWN: 'harmony-navigation-route-unknown',
  SIGNING_BUNDLE_NAME_MISMATCH: 'harmony-signing-bundle-name-mismatch',
} as const;

type ProjectConfigDiagCode = (typeof PROJECT_CONFIG_DIAG_CODES)[keyof typeof PROJECT_CONFIG_DIAG_CODES];

interface AnalysisIssue {
  code: ProjectConfigDiagCode;
  message: string;
  severity: vscode.DiagnosticSeverity;
  target: 'buildProfile' | 'module' | 'pages' | 'entryAbility' | 'page' | 'app';
  needle?: string;
  route?: string;
}

interface StartupAnalysisInput {
  moduleText: string;
  pagesText?: string;
  entryAbilityText?: string;
  pageTexts: Record<string, string | undefined>;
}

interface ModuleAnalysisResult {
  issues: AnalysisIssue[];
  pagesRef?: string;
  routes: string[];
}

export interface RouteMapEntry {
  name: string;
  pageSourceFile: string;
  buildFunction: string;
}

export interface NavigationRouteUsage {
  routeName: string;
  api: string;
  needle: string;
}

export type BuilderFunctionState = 'ok' | 'missingFunction' | 'missingDecorator';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingBracket(text: string, start: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let quote: '"' | '\'' | undefined;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        index++;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth++;
      continue;
    }

    if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findJson5ArrayBlock(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`(?:["']${escapeRegExp(key)}["']|\\b${escapeRegExp(key)}\\b)\\s*:\\s*\\[`));
  if (!match || match.index === undefined) {
    return undefined;
  }

  const arrayStart = text.indexOf('[', match.index);
  if (arrayStart < 0) {
    return undefined;
  }

  const arrayEnd = findMatchingBracket(text, arrayStart, '[', ']');
  if (arrayEnd < 0) {
    return undefined;
  }

  return text.slice(arrayStart + 1, arrayEnd);
}

function splitTopLevelObjects(arrayText: string): string[] {
  const objects: string[] = [];

  for (let index = 0; index < arrayText.length; index++) {
    if (arrayText[index] !== '{') {
      continue;
    }

    const end = findMatchingBracket(arrayText, index, '{', '}');
    if (end < 0) {
      break;
    }

    objects.push(arrayText.slice(index, end + 1));
    index = end;
  }

  return objects;
}

function extractAbilityEntries(moduleText: string): Array<{ name: string; srcEntry: string }> {
  const abilitiesBlock = findJson5ArrayBlock(moduleText, 'abilities');
  if (!abilitiesBlock) {
    return [];
  }

  return splitTopLevelObjects(abilitiesBlock)
    .map((item) => ({
      name: extractJson5StringValue(item, 'name'),
      srcEntry: extractJson5StringValue(item, 'srcEntry'),
    }))
    .filter((item): item is { name: string; srcEntry: string } => Boolean(item.name && item.srcEntry));
}

function extractPagesRoutes(text: string): string[] {
  const match = text.match(/"src"\s*:\s*\[([\s\S]*?)\]/);
  if (!match) {
    return [];
  }

  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
}

export function extractLoadContentRoutes(text: string): string[] {
  return Array.from(text.matchAll(/loadContent\(\s*['"]([^'"]+)['"]/g)).map((item) => item[1]);
}

export function countEntryDecorators(text: string): number {
  return Array.from(text.matchAll(/^\s*@Entry\b/gm)).length;
}

export function parseRouteMapEntries(text: string): RouteMapEntry[] {
  try {
    const parsed = JSON.parse(text) as {
      routerMap?: Array<Partial<RouteMapEntry>>;
    };

    if (!Array.isArray(parsed.routerMap)) {
      return [];
    }

    return parsed.routerMap
      .filter((item): item is RouteMapEntry => (
        typeof item?.name === 'string'
        && typeof item?.pageSourceFile === 'string'
        && typeof item?.buildFunction === 'string'
      ));
  } catch {
    return [];
  }
}

export function inspectBuilderFunction(text: string, buildFunction: string): BuilderFunctionState {
  const escaped = escapeRegExp(buildFunction);
  const hasBuilderDecorator = new RegExp(
    `@Builder[\\s\\S]{0,160}(?:export\\s+)?function\\s+${escaped}\\s*\\(`
  ).test(text);

  if (hasBuilderDecorator) {
    return 'ok';
  }

  const hasFunction = new RegExp(`(?:export\\s+)?function\\s+${escaped}\\s*\\(`).test(text);
  return hasFunction ? 'missingDecorator' : 'missingFunction';
}

export function extractNavigationRouteUsages(text: string): NavigationRouteUsage[] {
  const usages: NavigationRouteUsage[] = [];
  const literalPatterns: Array<{ api: string; pattern: RegExp }> = [
    {
      api: 'pushPath/replacePath/pushDestination/replaceDestination',
      pattern: /\b(pushPath|replacePath|pushDestination|replaceDestination)\(\s*\{[\s\S]{0,160}?\bname\s*:\s*['"]([^'"]+)['"]/g,
    },
    {
      api: 'pushPathByName/replacePathByName/pushDestinationByName/replaceDestinationByName',
      pattern: /\b(pushPathByName|replacePathByName|pushDestinationByName|replaceDestinationByName)\(\s*['"]([^'"]+)['"]/g,
    },
  ];

  for (const { api, pattern } of literalPatterns) {
    for (const match of text.matchAll(pattern)) {
      const routeName = match[2];
      usages.push({
        routeName,
        api,
        needle: routeName,
      });
    }
  }

  return usages;
}

function toRelativeProfilePath(pagesRef: string): string | undefined {
  if (!pagesRef.startsWith('$profile:')) {
    return undefined;
  }

  return path.join('src', 'main', 'resources', 'base', 'profile', `${pagesRef.slice('$profile:'.length)}.json`);
}

function toModuleRelativePath(filePath: string): string {
  return filePath.replace(/^[./\\]+/, '');
}

export function analyzeBuildProfileDiagnostics(text: string): AnalysisIssue[] {
  const analysis = analyzeBuildProfileMigration(text);
  return analysis.issues.map((issue) => ({
    code: issue.code === 'targetSdkVersionMissing'
      ? PROJECT_CONFIG_DIAG_CODES.TARGET_SDK_MISSING
      : PROJECT_CONFIG_DIAG_CODES.BUILD_MODE_SET_MISSING,
    message: issue.message,
    severity: vscode.DiagnosticSeverity.Warning,
    target: 'buildProfile',
    needle: issue.code === 'targetSdkVersionMissing'
      ? 'compatibleSdkVersion'
      : 'app',
  }));
}

export function analyzeSigningBundleNameDiagnostics(
  appBundleName: string | undefined,
  signingBundleName: string | undefined,
): AnalysisIssue[] {
  if (!appBundleName || !signingBundleName || appBundleName === signingBundleName) {
    return [];
  }

  return [{
    code: PROJECT_CONFIG_DIAG_CODES.SIGNING_BUNDLE_NAME_MISMATCH,
    message: `当前 app.json5 的 bundleName 为 ${appBundleName}，但签名 profile 里的 bundleName 为 ${signingBundleName}，SignHap 会失败。`,
    severity: vscode.DiagnosticSeverity.Warning,
    target: 'app',
    needle: appBundleName,
  }];
}

export function analyzeStartupConfiguration(input: StartupAnalysisInput): ModuleAnalysisResult {
  const issues: AnalysisIssue[] = [];
  const moduleType = extractJson5StringValue(input.moduleText, 'type');
  if (moduleType && moduleType !== 'entry') {
    return { issues, routes: [] };
  }

  const pagesRef = extractJson5StringValue(input.moduleText, 'pages');
  if (!pagesRef) {
    issues.push({
      code: PROJECT_CONFIG_DIAG_CODES.MODULE_PAGES_MISSING,
      message: 'entry 模块缺少 pages 配置，启动页面和页面路由会失效。',
      severity: vscode.DiagnosticSeverity.Warning,
      target: 'module',
      needle: 'mainElement',
    });
    return { issues, routes: [] };
  }

  if (!input.pagesText) {
    issues.push({
      code: PROJECT_CONFIG_DIAG_CODES.PAGES_FILE_MISSING,
      message: `未找到 ${pagesRef} 对应的页面配置文件。`,
      severity: vscode.DiagnosticSeverity.Warning,
      target: 'module',
      needle: pagesRef,
    });
    return { issues, pagesRef, routes: [] };
  }

  const routes = extractPagesRoutes(input.pagesText);
  if (routes.length === 0) {
    issues.push({
      code: PROJECT_CONFIG_DIAG_CODES.MAIN_PAGES_EMPTY,
      message: 'main_pages.json 未声明任何页面路由，应用启动后容易出现空白页。',
      severity: vscode.DiagnosticSeverity.Warning,
      target: 'pages',
      needle: 'src',
    });
  }

  const mainElement = extractJson5StringValue(input.moduleText, 'mainElement');
  const abilityEntries = extractAbilityEntries(input.moduleText);
  const entryAbility = mainElement
    ? abilityEntries.find((item) => item.name === mainElement)
    : abilityEntries[0];

  if (!entryAbility) {
    issues.push({
      code: PROJECT_CONFIG_DIAG_CODES.ENTRY_ABILITY_FILE_MISSING,
      message: 'module.json5 找不到 mainElement 对应的 Ability 源码入口。',
      severity: vscode.DiagnosticSeverity.Warning,
      target: 'module',
      needle: mainElement ?? 'abilities',
    });
  } else if (!input.entryAbilityText) {
    issues.push({
      code: PROJECT_CONFIG_DIAG_CODES.ENTRY_ABILITY_FILE_MISSING,
      message: `${entryAbility.name} 的 srcEntry 文件不存在。`,
      severity: vscode.DiagnosticSeverity.Warning,
      target: 'module',
      needle: entryAbility.srcEntry,
    });
  } else {
    const loadRoutes = extractLoadContentRoutes(input.entryAbilityText);
    if (loadRoutes.length === 0) {
      issues.push({
        code: PROJECT_CONFIG_DIAG_CODES.LOAD_CONTENT_MISSING,
        message: 'EntryAbility 未调用 windowStage.loadContent()，启动页可能无法正常加载。',
        severity: vscode.DiagnosticSeverity.Warning,
        target: 'entryAbility',
      });
    }

    for (const route of loadRoutes) {
      if (!routes.includes(route)) {
        issues.push({
          code: PROJECT_CONFIG_DIAG_CODES.LOAD_CONTENT_ROUTE_MISMATCH,
          message: `loadContent('${route}') 未出现在 main_pages.json 的 src 列表中。`,
          severity: vscode.DiagnosticSeverity.Warning,
          target: 'entryAbility',
          needle: route,
          route,
        });
      }
    }
  }

  for (const route of routes) {
    const pageText = input.pageTexts[route];
    if (!pageText) {
      issues.push({
        code: PROJECT_CONFIG_DIAG_CODES.PAGE_FILE_MISSING,
        message: `页面路由 ${route} 对应的 ArkTS 文件不存在。`,
        severity: vscode.DiagnosticSeverity.Warning,
        target: 'pages',
        needle: route,
        route,
      });
      continue;
    }

    const entryCount = countEntryDecorators(pageText);
    if (entryCount === 0) {
      issues.push({
        code: PROJECT_CONFIG_DIAG_CODES.PAGE_ENTRY_MISSING,
        message: `${route}.ets 缺少 @Entry，页面可能无法被正常加载。`,
        severity: vscode.DiagnosticSeverity.Warning,
        target: 'page',
        route,
      });
      continue;
    }

    if (entryCount > 1) {
      issues.push({
        code: PROJECT_CONFIG_DIAG_CODES.PAGE_ENTRY_DUPLICATE,
        message: `${route}.ets 存在多个 @Entry，页面文件必须且只能保留一个 @Entry。`,
        severity: vscode.DiagnosticSeverity.Warning,
        target: 'page',
        route,
      });
    }
  }

  return { issues, pagesRef, routes };
}

function indexToPosition(text: string, index: number): vscode.Position {
  const before = text.slice(0, Math.max(index, 0));
  const lines = before.split('\n');
  return new vscode.Position(lines.length - 1, lines[lines.length - 1]?.length ?? 0);
}

function buildRange(text: string, needle?: string): vscode.Range {
  if (!needle) {
    return new vscode.Range(0, 0, 0, 1);
  }

  const index = text.indexOf(needle);
  if (index < 0) {
    return new vscode.Range(0, 0, 0, 1);
  }

  const start = indexToPosition(text, index);
  const end = indexToPosition(text, index + Math.max(needle.length, 1));
  return new vscode.Range(start, end);
}

function createDiagnostic(text: string, issue: AnalysisIssue): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    buildRange(text, issue.needle),
    issue.message,
    issue.severity,
  );
  diagnostic.code = issue.code;
  diagnostic.source = PROJECT_CONFIG_DIAG_SOURCE;
  return diagnostic;
}

function isRelevantDocument(document: vscode.TextDocument): boolean {
  return document.fileName.endsWith('build-profile.json5')
    || document.fileName.endsWith(path.join('AppScope', 'app.json5'))
    || document.fileName.endsWith('module.json5')
    || document.fileName.endsWith('main_pages.json')
    || document.fileName.endsWith('route_map.json')
    || document.fileName.endsWith('.ets');
}

async function safeReadText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString('utf8');
  } catch {
    return undefined;
  }
}

function isConfigDocument(document: vscode.TextDocument): boolean {
  return document.fileName.endsWith('build-profile.json5')
    || document.fileName.endsWith(path.join('AppScope', 'app.json5'))
    || document.fileName.endsWith('module.json5')
    || document.fileName.endsWith('main_pages.json')
    || document.fileName.endsWith('route_map.json');
}

function pushDiagnosticToMap(
  map: Map<string, vscode.Diagnostic[]>,
  uri: vscode.Uri,
  diagnostic: vscode.Diagnostic,
): void {
  const existing = map.get(uri.toString()) ?? [];
  existing.push(diagnostic);
  map.set(uri.toString(), existing);
}

function ensureDiagnosticEntry(
  map: Map<string, vscode.Diagnostic[]>,
  uri: vscode.Uri,
): void {
  if (!map.has(uri.toString())) {
    map.set(uri.toString(), []);
  }
}

function setDiagnosticsInSnapshot(
  snapshot: Map<string, vscode.Diagnostic[]>,
  uri: vscode.Uri,
  diagnostics: vscode.Diagnostic[],
): void {
  snapshot.set(uri.toString(), diagnostics);
}

function applyWorkspaceSnapshot(
  collection: vscode.DiagnosticCollection,
  previousUris: Set<string>,
  snapshot: Map<string, vscode.Diagnostic[]>,
): Set<string> {
  const nextUris = new Set(snapshot.keys());

  for (const uriString of previousUris) {
    if (!nextUris.has(uriString)) {
      collection.delete(vscode.Uri.parse(uriString));
    }
  }

  for (const [uriString, diagnostics] of snapshot) {
    collection.set(vscode.Uri.parse(uriString), diagnostics);
  }

  return nextUris;
}

async function analyzeWorkspaceFolder(
  folder: vscode.WorkspaceFolder,
  isFresh: () => boolean,
): Promise<Map<string, vscode.Diagnostic[]> | undefined> {
  const snapshot = new Map<string, vscode.Diagnostic[]>();
  const buildProfileUri = vscode.Uri.joinPath(folder.uri, 'build-profile.json5');
  const buildProfileText = await safeReadText(buildProfileUri);
  if (buildProfileText) {
    const diagnostics = analyzeBuildProfileDiagnostics(buildProfileText).map((issue) => createDiagnostic(buildProfileText, issue));
    setDiagnosticsInSnapshot(snapshot, buildProfileUri, diagnostics);
  }

  const appJsonUri = vscode.Uri.joinPath(folder.uri, 'AppScope', 'app.json5');
  const appJsonText = await safeReadText(appJsonUri);
  if (appJsonText) {
    const signingInfo = await resolveSigningProfileInfo(folder.uri);
    const appBundleName = extractJson5StringValue(appJsonText, 'bundleName');
    const diagnostics = analyzeSigningBundleNameDiagnostics(appBundleName, signingInfo?.bundleName)
      .map((issue) => createDiagnostic(appJsonText, issue));
    setDiagnosticsInSnapshot(snapshot, appJsonUri, diagnostics);
  }

  const moduleFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder.uri, '**/src/main/module.json5'),
    '**/node_modules/**',
  );

  for (const moduleUri of moduleFiles) {
    if (!isFresh()) {
      return undefined;
    }

    const moduleText = await safeReadText(moduleUri);
    if (!moduleText) {
      continue;
    }

    const pagesRef = extractJson5StringValue(moduleText, 'pages');
    const moduleRoot = path.dirname(path.dirname(path.dirname(moduleUri.fsPath)));
    const pagesRelativePath = pagesRef ? toRelativeProfilePath(pagesRef) : undefined;
    const pagesUri = pagesRelativePath ? vscode.Uri.file(path.join(moduleRoot, pagesRelativePath)) : undefined;
    const pagesText = pagesUri ? await safeReadText(pagesUri) : undefined;

    const mainElement = extractJson5StringValue(moduleText, 'mainElement');
    const abilityEntries = extractAbilityEntries(moduleText);
    const entryAbility = mainElement
      ? abilityEntries.find((item) => item.name === mainElement)
      : abilityEntries[0];
    const entryAbilityUri = entryAbility
      ? vscode.Uri.file(path.join(moduleRoot, 'src', 'main', entryAbility.srcEntry.replace(/^\.\//, '')))
      : undefined;
    const entryAbilityText = entryAbilityUri ? await safeReadText(entryAbilityUri) : undefined;

    const pageTexts: Record<string, string | undefined> = {};
    if (pagesText) {
      for (const route of extractPagesRoutes(pagesText)) {
        const pageUri = vscode.Uri.file(path.join(moduleRoot, 'src', 'main', 'ets', `${route}.ets`));
        pageTexts[route] = await safeReadText(pageUri);
      }
    }

    const analysis = analyzeStartupConfiguration({
      moduleText,
      pagesText,
      entryAbilityText,
      pageTexts,
    });

    const moduleDiagnostics: vscode.Diagnostic[] = [];
    const pagesDiagnostics: vscode.Diagnostic[] = [];
    const entryAbilityDiagnostics: vscode.Diagnostic[] = [];
    const pageDiagnostics = new Map<string, vscode.Diagnostic[]>();
    const routePageDiagnostics = new Map<string, vscode.Diagnostic[]>();
    const navUsageDiagnostics = new Map<string, vscode.Diagnostic[]>();

    for (const issue of analysis.issues) {
      if (issue.target === 'module') {
        moduleDiagnostics.push(createDiagnostic(moduleText, issue));
        continue;
      }

      if (issue.target === 'pages' && pagesText && pagesUri) {
        pagesDiagnostics.push(createDiagnostic(pagesText, issue));
        continue;
      }

      if (issue.target === 'entryAbility' && entryAbilityText && entryAbilityUri) {
        entryAbilityDiagnostics.push(createDiagnostic(entryAbilityText, issue));
        continue;
      }

      if (issue.target === 'page' && issue.route) {
        const pageUri = vscode.Uri.file(path.join(moduleRoot, 'src', 'main', 'ets', `${issue.route}.ets`));
        const pageText = pageTexts[issue.route];
        if (!pageText) {
          continue;
        }
        ensureDiagnosticEntry(pageDiagnostics, pageUri);
        pushDiagnosticToMap(pageDiagnostics, pageUri, createDiagnostic(pageText, issue));
      }
    }

    const routerMapRef = extractJson5StringValue(moduleText, 'routerMap');
    const routeMapRelativePath = routerMapRef ? toRelativeProfilePath(routerMapRef) : undefined;
    const routeMapUri = routeMapRelativePath ? vscode.Uri.file(path.join(moduleRoot, routeMapRelativePath)) : undefined;
    const routeMapText = routeMapUri ? await safeReadText(routeMapUri) : undefined;
    const routeMapDiagnostics: vscode.Diagnostic[] = [];

    if (routerMapRef && !routeMapText) {
      moduleDiagnostics.push(createDiagnostic(moduleText, {
        code: PROJECT_CONFIG_DIAG_CODES.ROUTER_MAP_FILE_MISSING,
        message: `未找到 ${routerMapRef} 对应的系统路由表文件。`,
        severity: vscode.DiagnosticSeverity.Warning,
        target: 'module',
        needle: routerMapRef,
      }));
    }

    if (routeMapText && routeMapUri) {
      const routeEntries = parseRouteMapEntries(routeMapText);
      if (routeEntries.length === 0) {
        routeMapDiagnostics.push(createDiagnostic(routeMapText, {
          code: PROJECT_CONFIG_DIAG_CODES.ROUTE_MAP_EMPTY,
          message: 'route_map.json 未声明任何有效路由项，Navigation 跳转将无法命中目标页面。',
          severity: vscode.DiagnosticSeverity.Warning,
          target: 'pages',
          needle: 'routerMap',
        }));
      }

      const routeNames = new Set<string>();
      const seenRouteNames = new Set<string>();

      for (const entry of routeEntries) {
        if (seenRouteNames.has(entry.name)) {
          routeMapDiagnostics.push(createDiagnostic(routeMapText, {
            code: PROJECT_CONFIG_DIAG_CODES.ROUTE_NAME_DUPLICATE,
            message: `路由名 ${entry.name} 重复，Navigation 只应保留一个唯一 name。`,
            severity: vscode.DiagnosticSeverity.Warning,
            target: 'pages',
            needle: entry.name,
          }));
          continue;
        }

        seenRouteNames.add(entry.name);
        routeNames.add(entry.name);

        const routePageUri = vscode.Uri.file(path.join(moduleRoot, toModuleRelativePath(entry.pageSourceFile)));
        const routePageText = await safeReadText(routePageUri);
        if (!routePageText) {
          routeMapDiagnostics.push(createDiagnostic(routeMapText, {
            code: PROJECT_CONFIG_DIAG_CODES.ROUTE_PAGE_FILE_MISSING,
            message: `路由 ${entry.name} 指向的页面文件不存在：${entry.pageSourceFile}。`,
            severity: vscode.DiagnosticSeverity.Warning,
            target: 'pages',
            needle: entry.pageSourceFile,
          }));
          continue;
        }

        ensureDiagnosticEntry(routePageDiagnostics, routePageUri);
        const builderState = inspectBuilderFunction(routePageText, entry.buildFunction);
        if (builderState === 'missingFunction') {
          routeMapDiagnostics.push(createDiagnostic(routeMapText, {
            code: PROJECT_CONFIG_DIAG_CODES.ROUTE_BUILDER_FUNCTION_MISSING,
            message: `route_map.json 要求的构建函数 ${entry.buildFunction} 不存在。`,
            severity: vscode.DiagnosticSeverity.Warning,
            target: 'pages',
            needle: entry.buildFunction,
          }));
        } else if (builderState === 'missingDecorator') {
          pushDiagnosticToMap(routePageDiagnostics, routePageUri, createDiagnostic(routePageText, {
            code: PROJECT_CONFIG_DIAG_CODES.ROUTE_BUILDER_DECORATOR_MISSING,
            message: `${entry.buildFunction} 缺少 @Builder，系统路由表中的 buildFunction 必须由 @Builder 修饰。`,
            severity: vscode.DiagnosticSeverity.Warning,
            target: 'page',
            needle: entry.buildFunction,
          }));
        }
      }

      const moduleEtsFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(vscode.Uri.file(moduleRoot), 'src/main/**/*.ets'),
        '**/node_modules/**',
      );

      for (const etsUri of moduleEtsFiles) {
        const etsText = await safeReadText(etsUri);
        if (!etsText) {
          continue;
        }

        ensureDiagnosticEntry(navUsageDiagnostics, etsUri);
        for (const usage of extractNavigationRouteUsages(etsText)) {
          if (routeNames.has(usage.routeName)) {
            continue;
          }

          pushDiagnosticToMap(navUsageDiagnostics, etsUri, createDiagnostic(etsText, {
            code: PROJECT_CONFIG_DIAG_CODES.NAVIGATION_ROUTE_UNKNOWN,
            message: `${usage.api} 使用了未在 route_map.json 中声明的路由名 ${usage.routeName}。`,
            severity: vscode.DiagnosticSeverity.Warning,
            target: 'page',
            needle: usage.needle,
          }));
        }
      }

      setDiagnosticsInSnapshot(snapshot, routeMapUri, routeMapDiagnostics);
    }

    setDiagnosticsInSnapshot(snapshot, moduleUri, moduleDiagnostics);

    if (pagesUri && pagesText) {
      setDiagnosticsInSnapshot(snapshot, pagesUri, pagesDiagnostics);
    }

    if (entryAbilityUri && entryAbilityText) {
      setDiagnosticsInSnapshot(snapshot, entryAbilityUri, entryAbilityDiagnostics);
    }

    for (const route of analysis.routes) {
      const pageText = pageTexts[route];
      if (!pageText) {
        continue;
      }
      const pageUri = vscode.Uri.file(path.join(moduleRoot, 'src', 'main', 'ets', `${route}.ets`));
      ensureDiagnosticEntry(pageDiagnostics, pageUri);
    }

    const combinedPageDiagnostics = new Map<string, vscode.Diagnostic[]>();
    for (const [uriString, diagnostics] of pageDiagnostics) {
      combinedPageDiagnostics.set(uriString, [...diagnostics]);
    }
    for (const [uriString, diagnostics] of navUsageDiagnostics) {
      const existing = combinedPageDiagnostics.get(uriString) ?? [];
      combinedPageDiagnostics.set(uriString, [...existing, ...diagnostics]);
    }
    for (const [uriString, diagnostics] of routePageDiagnostics) {
      const existing = combinedPageDiagnostics.get(uriString) ?? [];
      combinedPageDiagnostics.set(uriString, [...existing, ...diagnostics]);
    }

    for (const [uriString, diagnostics] of combinedPageDiagnostics) {
      setDiagnosticsInSnapshot(snapshot, vscode.Uri.parse(uriString), diagnostics);
    }
  }

  return snapshot;
}

export function createProjectConfigDiagnosticProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection('harmony-project-config');
  let timer: NodeJS.Timeout | undefined;
  let refreshVersion = 0;
  const managedWorkspaceUris = new Map<string, Set<string>>();
  let refreshAll = false;
  const pendingFolderKeys = new Set<string>();

  const refresh = (folder?: vscode.WorkspaceFolder) => {
    if (!folder) {
      refreshAll = true;
      pendingFolderKeys.clear();
    } else if (!refreshAll) {
      pendingFolderKeys.add(folder.uri.toString());
    }

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(async () => {
      const currentVersion = ++refreshVersion;
      const isFresh = () => currentVersion === refreshVersion;
      const allFolders = vscode.workspace.workspaceFolders ?? [];
      const folders = refreshAll
        ? allFolders
        : allFolders.filter((item) => pendingFolderKeys.has(item.uri.toString()));

      refreshAll = false;
      pendingFolderKeys.clear();

      const snapshots = await Promise.all(
        folders.map(async (workspaceFolder) => ({
          folderKey: workspaceFolder.uri.toString(),
          snapshot: await analyzeWorkspaceFolder(workspaceFolder, isFresh),
        })),
      );

      if (!isFresh()) {
        return;
      }

      if (folders.length === 0) {
        collection.clear();
        managedWorkspaceUris.clear();
        return;
      }

      if (allFolders.length === folders.length) {
        const liveFolderKeys = new Set(allFolders.map((item) => item.uri.toString()));
        for (const [folderKey, uris] of managedWorkspaceUris) {
          if (liveFolderKeys.has(folderKey)) {
            continue;
          }
          for (const uriString of uris) {
            collection.delete(vscode.Uri.parse(uriString));
          }
          managedWorkspaceUris.delete(folderKey);
        }
      }

      for (const entry of snapshots) {
        if (!entry.snapshot) {
          return;
        }
        const previousUris = managedWorkspaceUris.get(entry.folderKey) ?? new Set<string>();
        const nextUris = applyWorkspaceSnapshot(collection, previousUris, entry.snapshot);
        managedWorkspaceUris.set(entry.folderKey, nextUris);
      }
    }, 250);
  };

  refresh();

  const onOpen = vscode.workspace.onDidOpenTextDocument((document) => {
    if (isConfigDocument(document)) {
      refresh(vscode.workspace.getWorkspaceFolder(document.uri));
    }
  });
  const onSave = vscode.workspace.onDidSaveTextDocument((document) => {
    if (isRelevantDocument(document)) {
      refresh(vscode.workspace.getWorkspaceFolder(document.uri));
    }
  });
  const onChange = vscode.workspace.onDidChangeTextDocument((event) => {
    if (isConfigDocument(event.document)) {
      refresh(vscode.workspace.getWorkspaceFolder(event.document.uri));
    }
  });
  const onFolders = vscode.workspace.onDidChangeWorkspaceFolders(() => refresh());

  const disposable = vscode.Disposable.from(collection, onOpen, onSave, onChange, onFolders, {
    dispose: () => {
      if (timer) {
        clearTimeout(timer);
      }
    },
  });

  context.subscriptions.push(disposable);
  return disposable;
}
