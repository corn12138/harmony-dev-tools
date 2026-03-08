import * as vscode from 'vscode';
import * as path from 'path';

export type TemplateId = 'empty' | 'list' | 'tabs' | 'login';

interface ProjectOptions {
  templateId: TemplateId;
  projectName: string;
  bundleName: string;
}

interface FileEntry {
  relativePath: string;
  content: string;
}

export async function generateProject(projectRoot: string, options: ProjectOptions): Promise<void> {
  const files = [
    ...getCommonFiles(options),
    ...getTemplateFiles(options),
  ];

  for (const file of files) {
    const uri = vscode.Uri.file(path.join(projectRoot, file.relativePath));
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(file.content, 'utf8'));
  }
}

// ---- Common files shared by all templates ----

function getCommonFiles(opts: ProjectOptions): FileEntry[] {
  return [
    {
      relativePath: 'build-profile.json5',
      content: `{
  "app": {
    "signingConfigs": [],
    "products": [
      {
        "name": "default",
        "signingConfig": "default",
        "compatibleSdkVersion": "5.0.0(12)",
        "compileSdkVersion": "5.0.0(12)",
        "runtimeOS": "HarmonyOS"
      }
    ]
  },
  "modules": [
    {
      "name": "entry",
      "srcPath": "./entry"
    }
  ]
}
`,
    },
    {
      relativePath: 'oh-package.json5',
      content: `{
  "name": "${opts.projectName.toLowerCase()}",
  "version": "1.0.0",
  "description": "",
  "main": "",
  "author": "",
  "license": "Apache-2.0",
  "dependencies": {},
  "devDependencies": {}
}
`,
    },
    {
      relativePath: 'AppScope/app.json5',
      content: `{
  "app": {
    "bundleName": "${opts.bundleName}",
    "vendor": "",
    "versionCode": 1,
    "versionName": "1.0.0",
    "icon": "$media:app_icon",
    "label": "$string:app_name"
  }
}
`,
    },
    {
      relativePath: 'AppScope/resources/base/element/string.json',
      content: JSON.stringify({
        string: [{ name: 'app_name', value: opts.projectName }],
      }, null, 2) + '\n',
    },
    {
      relativePath: 'entry/oh-package.json5',
      content: `{
  "name": "entry",
  "version": "1.0.0",
  "description": "",
  "main": "",
  "author": "",
  "license": "Apache-2.0",
  "dependencies": {}
}
`,
    },
    {
      relativePath: 'entry/src/main/module.json5',
      content: `{
  "module": {
    "name": "entry",
    "type": "entry",
    "description": "$string:module_desc",
    "mainElement": "EntryAbility",
    "deviceTypes": ["phone", "tablet"],
    "deliveryWithInstall": true,
    "installationFree": false,
    "pages": "$profile:main_pages",
    "abilities": [
      {
        "name": "EntryAbility",
        "srcEntry": "./ets/entryability/EntryAbility.ets",
        "description": "$string:EntryAbility_desc",
        "icon": "$media:icon",
        "label": "$string:EntryAbility_label",
        "startWindowIcon": "$media:startIcon",
        "startWindowBackground": "$color:start_window_background",
        "exported": true,
        "skills": [
          {
            "entities": ["entity.system.home"],
            "actions": ["action.system.home"]
          }
        ]
      }
    ]
  }
}
`,
    },
    {
      relativePath: 'entry/src/main/resources/base/profile/main_pages.json',
      content: JSON.stringify({
        src: ['pages/Index'],
      }, null, 2) + '\n',
    },
    {
      relativePath: 'entry/src/main/resources/base/element/string.json',
      content: JSON.stringify({
        string: [
          { name: 'module_desc', value: 'Entry module' },
          { name: 'EntryAbility_desc', value: 'Entry ability' },
          { name: 'EntryAbility_label', value: opts.projectName },
        ],
      }, null, 2) + '\n',
    },
    {
      relativePath: 'entry/src/main/resources/base/element/color.json',
      content: JSON.stringify({
        color: [{ name: 'start_window_background', value: '#FFFFFF' }],
      }, null, 2) + '\n',
    },
    {
      relativePath: 'entry/src/main/ets/entryability/EntryAbility.ets',
      content: `import UIAbility from '@ohos.app.ability.UIAbility';
import hilog from '@ohos.hilog';
import window from '@ohos.window';

export default class EntryAbility extends UIAbility {
  onCreate(want, launchParam): void {
    hilog.info(0x0000, 'EntryAbility', 'onCreate');
  }

  onDestroy(): void {
    hilog.info(0x0000, 'EntryAbility', 'onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(0x0000, 'EntryAbility', 'onWindowStageCreate');
    windowStage.loadContent('pages/Index', (err, data) => {
      if (err.code) {
        hilog.error(0x0000, 'EntryAbility', 'Failed to load content: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(0x0000, 'EntryAbility', 'Succeeded in loading content');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(0x0000, 'EntryAbility', 'onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(0x0000, 'EntryAbility', 'onForeground');
  }

  onBackground(): void {
    hilog.info(0x0000, 'EntryAbility', 'onBackground');
  }
}
`,
    },
  ];
}

// ---- Template-specific page files ----

function getTemplateFiles(opts: ProjectOptions): FileEntry[] {
  const generators: Record<TemplateId, () => FileEntry[]> = {
    empty: () => getEmptyTemplate(opts),
    list: () => getListTemplate(opts),
    tabs: () => getTabsTemplate(opts),
    login: () => getLoginTemplate(opts),
  };
  return generators[opts.templateId]();
}

function getEmptyTemplate(_opts: ProjectOptions): FileEntry[] {
  return [{
    relativePath: 'entry/src/main/ets/pages/Index.ets',
    content: `@Entry
@Component
struct Index {
  @State message: string = 'Hello World';

  build() {
    Column() {
      Text(this.message)
        .fontSize(36)
        .fontWeight(FontWeight.Bold)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }
}
`,
  }];
}

function getListTemplate(_opts: ProjectOptions): FileEntry[] {
  return [{
    relativePath: 'entry/src/main/ets/pages/Index.ets',
    content: `@Entry
@Component
struct Index {
  @State items: string[] = [];
  @State isRefreshing: boolean = false;

  aboutToAppear(): void {
    this.loadData();
  }

  build() {
    Column() {
      Text('My List')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .width('100%')
        .padding(16)

      Refresh({ refreshing: $$this.isRefreshing }) {
        List({ space: 8 }) {
          ForEach(this.items, (item: string, index: number) => {
            ListItem() {
              Row() {
                Text(\`\${index + 1}\`)
                  .fontSize(16)
                  .fontColor('#999999')
                  .width(40)
                  .textAlign(TextAlign.Center)
                Text(item)
                  .fontSize(16)
                  .layoutWeight(1)
              }
              .width('100%')
              .padding(16)
              .backgroundColor('#FFFFFF')
              .borderRadius(8)
            }
          }, (item: string) => item)
        }
        .width('100%')
        .layoutWeight(1)
        .padding({ left: 16, right: 16 })
      }
      .onRefreshing(() => {
        this.loadData();
        setTimeout(() => {
          this.isRefreshing = false;
        }, 1000);
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F5F5F5')
  }

  private loadData(): void {
    this.items = Array.from({ length: 20 }, (_, i) => \`Item \${i + 1}\`);
  }
}
`,
  }];
}

function getTabsTemplate(_opts: ProjectOptions): FileEntry[] {
  return [{
    relativePath: 'entry/src/main/ets/pages/Index.ets',
    content: `@Entry
@Component
struct Index {
  @State currentIndex: number = 0;

  @Builder
  tabBuilder(title: string, index: number, icon: Resource) {
    Column() {
      Image(icon)
        .width(24)
        .height(24)
        .fillColor(this.currentIndex === index ? '#0A59F7' : '#999999')
      Text(title)
        .fontSize(12)
        .fontColor(this.currentIndex === index ? '#0A59F7' : '#999999')
        .margin({ top: 4 })
    }
    .width('100%')
    .height(56)
    .justifyContent(FlexAlign.Center)
  }

  build() {
    Tabs({ barPosition: BarPosition.End }) {
      TabContent() {
        this.buildHomePage()
      }.tabBar(this.tabBuilder('Home', 0, $r('sys.media.ohos_ic_public_home')))

      TabContent() {
        this.buildDiscoverPage()
      }.tabBar(this.tabBuilder('Discover', 1, $r('sys.media.ohos_ic_public_search')))

      TabContent() {
        this.buildProfilePage()
      }.tabBar(this.tabBuilder('Profile', 2, $r('sys.media.ohos_ic_public_contacts')))
    }
    .onChange((index: number) => {
      this.currentIndex = index;
    })
  }

  @Builder
  buildHomePage() {
    Column() {
      Text('Home')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }

  @Builder
  buildDiscoverPage() {
    Column() {
      Text('Discover')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }

  @Builder
  buildProfilePage() {
    Column() {
      Text('Profile')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }
}
`,
  }];
}

function getLoginTemplate(_opts: ProjectOptions): FileEntry[] {
  return [{
    relativePath: 'entry/src/main/ets/pages/Index.ets',
    content: `@Entry
@Component
struct Index {
  @State username: string = '';
  @State password: string = '';
  @State isLoading: boolean = false;
  @State errorMsg: string = '';

  build() {
    Column({ space: 20 }) {
      // Logo area
      Image($r('app.media.icon'))
        .width(80)
        .height(80)
        .margin({ top: 80, bottom: 20 })

      Text('Welcome')
        .fontSize(28)
        .fontWeight(FontWeight.Bold)

      Text('Sign in to continue')
        .fontSize(14)
        .fontColor('#999999')
        .margin({ bottom: 20 })

      // Username
      TextInput({ placeholder: 'Username', text: this.username })
        .width('85%')
        .height(48)
        .onChange((value: string) => {
          this.username = value;
          this.errorMsg = '';
        })

      // Password
      TextInput({ placeholder: 'Password', text: this.password })
        .width('85%')
        .height(48)
        .type(InputType.Password)
        .onChange((value: string) => {
          this.password = value;
          this.errorMsg = '';
        })

      // Error message
      if (this.errorMsg) {
        Text(this.errorMsg)
          .fontSize(13)
          .fontColor('#FF4444')
      }

      // Login button
      Button(this.isLoading ? 'Signing in...' : 'Sign In')
        .width('85%')
        .height(48)
        .backgroundColor('#0A59F7')
        .enabled(!this.isLoading)
        .onClick(() => this.handleLogin())

      // Register link
      Text('Don\\'t have an account? Sign Up')
        .fontSize(13)
        .fontColor('#0A59F7')
        .margin({ top: 12 })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Start)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#FFFFFF')
  }

  private handleLogin(): void {
    if (!this.username.trim()) {
      this.errorMsg = 'Please enter username';
      return;
    }
    if (!this.password.trim()) {
      this.errorMsg = 'Please enter password';
      return;
    }
    this.isLoading = true;
    this.errorMsg = '';
    // Simulate login request
    setTimeout(() => {
      this.isLoading = false;
    }, 2000);
  }
}
`,
  }];
}
