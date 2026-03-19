import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Config file Hover Provider
//
// Provides inline documentation when hovering over keys in HarmonyOS JSON5
// config files (build-profile.json5, module.json5, app.json5, oh-package.json5).
// Addresses the pain point: "JSON 配置文件可读性差、不能写注释"
// ---------------------------------------------------------------------------

const CONFIG_KEY_DOCS: Record<string, Record<string, string>> = {
  'build-profile': {
    targetSdkVersion: '目标 SDK 版本。新版 HarmonyOS 5.x/6.x 工程通常使用字符串版本号，例如 `6.0.0(20)` 或 `6.0.2(22)`。\n\nTarget SDK version. Modern HarmonyOS projects usually use release strings such as `6.0.0(20)` or `6.0.2(22)`.',
    compileSdkVersion: '旧版编译 SDK 版本号（如 12、13、14）。为兼容历史工程保留，新工程更常见的是 `targetSdkVersion`。\n\nLegacy compile SDK version number. Retained for older projects; newer projects more commonly use `targetSdkVersion`.',
    compatibleSdkVersion: '最低兼容 SDK 版本。可以是数字（如 14）或新版字符串（如 `5.0.5(17)`）。\n\nMinimum compatible SDK version. Can be a plain number or a release string such as `5.0.5(17)`.',
    products: '产品维度配置数组。每个 product 定义一个构建变体（如 default）。\n\nProduct flavor configurations array.',
    modules: '模块列表，每个模块引用 entry/feature/har 目录。\n\nModule list referencing entry/feature/har directories.',
    signingConfigs: '签名配置，包含 keystore 路径、密码等。发布前必须配置。\n\nSigning configurations for release builds.',
    buildOption: '构建选项：sourceOption、externalNativeOptions 等。\n\nBuild options: source options, native build settings.',
    buildOptionSet: '构建选项集合。可定义多套编译选项供不同 product 选用。\n\nBuild option sets for different product variants.',
    buildModeSet: '构建模式集合。新版样例工程常见 `debug` / `release` 两个模式。\n\nBuild mode set. Modern sample projects usually declare `debug` and `release` modes here.',
    targets: '编译目标配置（target name → 可选的 source/runtimeOS）。\n\nCompilation target configurations.',
  },
  module: {
    module: '模块配置根节点。\n\nModule configuration root.',
    name: '模块名称，在整个应用中必须唯一。\n\nModule name, must be unique within the app.',
    type: '模块类型：entry（入口）| feature（动态加载功能）| har（静态共享包）| hsp（动态共享包）。\n\nModule type: entry | feature | har | hsp.',
    srcEntry: '模块入口文件路径（AbilityStage 或 Extension）。\n\nModule entry file path.',
    description: '模块描述，可使用 $string 资源引用。\n\nModule description.',
    mainElement: '模块的入口 Ability 或 ExtensionAbility 名称。\n\nMain ability name of this module.',
    deviceTypes: '支持的设备类型列表：phone, tablet, 2in1, tv, wearable, car。\n\nSupported device types.',
    routerMap: '系统路由表配置文件路径（通常指向 src/main/resources/base/profile/route_map.json），用于 Navigation + NavPathStack 的命名路由。\n\nSystem route map file path, typically route_map.json for Navigation + NavPathStack named routes.',
    deliveryWithInstall: '是否随应用安装时一起下载。entry 必须为 true。\n\nWhether to deliver with initial install.',
    installationFree: '是否支持免安装。feature 模块可设置为 true 以启用原子化服务。\n\nEnable installation-free (atomic service).',
    pages: '页面配置文件路径（通常指向 src/main/resources/base/profile/main_pages.json）。\n\nPage routing configuration file path.',
    abilities: 'Ability 配置数组。\n\nAbility configurations array.',
    extensionAbilities: 'ExtensionAbility 配置数组（FormExtension, WorkScheduler 等）。\n\nExtensionAbility configurations.',
    requestPermissions: '运行时所需权限声明。\n\nRequired runtime permissions.',
    metadata: '自定义元数据键值对数组。\n\nCustom metadata key-value pairs.',
  },
  app: {
    app: '应用级配置根节点。\n\nApplication-level configuration root.',
    bundleName: '应用包名，全局唯一（如 com.example.myapp）。\n\nApplication bundle name, globally unique.',
    vendor: '应用开发者/厂商名称。\n\nApplication vendor.',
    versionCode: '应用版本号（整数），每次更新必须递增。\n\nApplication version code (integer), must increment on each release.',
    versionName: '用户可见的版本名称字符串（如 "1.0.0"）。\n\nUser-visible version name string.',
    icon: '应用图标资源引用（$media:icon）。\n\nApplication icon resource reference.',
    label: '应用名称资源引用（$string:app_name）。\n\nApplication label resource reference.',
    minAPIVersion: '最低支持的 API 版本。\n\nMinimum supported API version.',
    targetAPIVersion: '目标 API 版本。\n\nTarget API version.',
    apiReleaseType: 'API 发布类型：Release | Beta | Canary。\n\nAPI release type.',
  },
  'oh-package': {
    modelVersion: 'OHPM 模型版本。官方 HarmonyOS 5.x/6.x 样例常见为 `5.0.5`。\n\nOHPM model version. Official HarmonyOS 5.x/6.x samples commonly use `5.0.5`.',
    name: '包名称。\n\nPackage name.',
    version: '语义化版本号（如 "1.0.0"）。\n\nSemantic version.',
    description: '包描述。\n\nPackage description.',
    main: '包入口文件路径。\n\nPackage entry file.',
    author: '作者信息。\n\nAuthor information.',
    license: '许可证（如 "Apache-2.0"）。\n\nLicense identifier.',
    dependencies: '运行时依赖。键为包名，值为版本范围。\n\nRuntime dependencies.',
    devDependencies: '开发时依赖（测试工具、构建插件等）。\n\nDevelopment dependencies.',
    dynamicDependencies: '动态依赖，按需下载的 HSP 包。\n\nDynamic dependencies (on-demand HSP).',
    ohos: 'OpenHarmony 特定配置（如 org）。\n\nOpenHarmony specific configurations.',
  },
};

// Map filename patterns to doc sets
function getDocSetForFile(fileName: string): Record<string, string> | undefined {
  if (fileName.includes('build-profile')) return CONFIG_KEY_DOCS['build-profile'];
  if (fileName.includes('module.json')) return CONFIG_KEY_DOCS['module'];
  if (fileName.includes('app.json')) return CONFIG_KEY_DOCS['app'];
  if (fileName.includes('oh-package')) return CONFIG_KEY_DOCS['oh-package'];
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createConfigHoverProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const selector: vscode.DocumentSelector = [
    { language: 'json', scheme: 'file', pattern: '**/*.json5' },
    { language: 'jsonc', scheme: 'file', pattern: '**/*.json5' },
    { language: 'json5', scheme: 'file', pattern: '**/*.json5' },
  ];

  const provider = vscode.languages.registerHoverProvider(selector, {
    provideHover(document, position) {
      const docs = getDocSetForFile(document.fileName);
      if (!docs) return undefined;

      const range = document.getWordRangeAtPosition(position, /["\']?[\w]+["\']?/);
      if (!range) return undefined;

      const word = document.getText(range).replace(/['"]/g, '');
      const doc = docs[word];
      if (!doc) return undefined;

      const md = new vscode.MarkdownString();
      md.appendCodeblock(word, 'json');
      md.appendMarkdown(`\n\n${doc}`);
      md.appendMarkdown('\n\n---\n*HarmonyOS Dev Tools — 配置字段文档*');
      return new vscode.Hover(md, range);
    },
  });

  context.subscriptions.push(provider);
  return provider;
}

// Export docs for testing
export { CONFIG_KEY_DOCS, getDocSetForFile };
