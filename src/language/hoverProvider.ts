import * as vscode from 'vscode';
import { ARKTS_DECORATORS } from '../utils/constants';

const DECORATOR_DOCS: Record<string, string> = {
  // ---- V1 Component & State (API 8+) ----
  '@Component': '[V1] Declares a struct as a custom ArkUI component. Must contain a `build()` method.\n\n[V1] 声明结构体为自定义 ArkUI 组件，必须包含 `build()` 方法。',
  '@Entry': 'Marks a component as the entry point of a page. Only one per page.\n\n标记组件为页面入口，每个页面只能有一个。',
  '@State': '[V1] Component-level reactive state. Changes trigger UI re-render.\n\n[V1] 组件级别响应式状态，变化触发 UI 重新渲染。',
  '@Prop': '[V1] One-way data binding from parent component. Child gets a copy.\n\n[V1] 从父组件单向数据绑定，子组件获得副本。',
  '@Link': '[V1] Two-way data binding between parent and child components.\n\n[V1] 父子组件之间双向数据绑定。',
  '@Provide': '[V1] Provides data to descendant components (paired with @Consume).\n\n[V1] 向后代组件提供数据（与 @Consume 配对使用）。',
  '@Consume': '[V1] Consumes data provided by ancestor @Provide.\n\n[V1] 消费祖先组件通过 @Provide 提供的数据。',
  '@Watch': '[V1] Registers a callback for state variable changes.\n\n[V1] 注册状态变量变化的回调函数。',
  '@Observed': '[V1] Marks a class for deep observation of property changes.\n\n[V1] 标记类为深度观察，监听属性变化。',
  '@ObjectLink': '[V1] Creates a reference to an @Observed class instance.\n\n[V1] 创建对 @Observed 类实例的引用。',

  // ---- V2 Component & State (API 12+ / HarmonyOS NEXT) ----
  '@ComponentV2': '[V2] Next-generation component decorator with enhanced state management. Use with @Local, @Param, @Event.\n\n[V2] 新一代组件装饰器，增强状态管理。与 @Local、@Param、@Event 配合使用。',
  '@ObservedV2': '[V2] Deep observation decorator. Used with @Trace for nested property tracking.\n\n[V2] 深度观察装饰器，与 @Trace 配合实现嵌套属性追踪。',
  '@Trace': '[V2] Marks properties for deep change tracking within @ObservedV2 classes.\n\n[V2] 标记属性用于 @ObservedV2 类中的深层变更追踪。',
  '@Local': '[V2] Component internal state in @ComponentV2. Replaces @State in V2.\n\n[V2] @ComponentV2 中的组件内部状态，替代 V1 的 @State。',
  '@Param': '[V2] Parent-to-child data passing in @ComponentV2. Replaces @Prop in V2.\n\n[V2] @ComponentV2 中父向子传参，替代 V1 的 @Prop。',
  '@Once': '[V2] One-time initialization parameter. Value is set once and never updated from parent.\n\n[V2] 一次性初始化参数，值设置一次后不再从父组件更新。',
  '@Event': '[V2] Child-to-parent event callback in @ComponentV2.\n\n[V2] @ComponentV2 中子向父事件回调。',
  '@Monitor': '[V2] Deep property change watcher. Can monitor nested classes and arrays. Replaces @Watch in V2.\n\n[V2] 深度属性变更监听器，可监听嵌套类和数组。替代 V1 的 @Watch。',
  '@Computed': '[V2] Computed property decorator. Derives values from reactive state.\n\n[V2] 计算属性装饰器，从响应式状态派生值。',
  '@Provider': '[V2] Provides data to descendants in V2 state management. Replaces @Provide in V2.\n\n[V2] V2 状态管理中向后代提供数据，替代 V1 的 @Provide。',
  '@Consumer': '[V2] Consumes data from ancestor @Provider in V2. Replaces @Consume in V2.\n\n[V2] V2 中消费祖先 @Provider 的数据，替代 V1 的 @Consume。',

  // ---- Common ----
  '@Builder': 'Defines a reusable UI building function.\n\n定义可复用的 UI 构建函数。',
  '@BuilderParam': 'Declares a builder function parameter in a component.\n\n声明组件中的 Builder 函数参数。',
  '@Styles': 'Defines reusable style combinations.\n\n定义可复用的样式组合。',
  '@Extend': 'Extends a built-in component with custom attribute methods.\n\n扩展内置组件的自定义属性方法。',
  '@CustomDialog': 'Declares a custom dialog component.\n\n声明自定义对话框组件。',
  '@Concurrent': 'Marks a function for concurrent execution in a Worker.\n\n标记函数用于 Worker 中并发执行。',
  '@Sendable': 'Marks a class as transferable between threads.\n\n标记类为线程间可传递。',
  '@Reusable': 'Marks a component for reuse in list scenarios.\n\n标记组件在列表场景中复用。',
  '@Preview': 'Enables component preview in the IDE previewer.\n\n在 IDE 预览器中启用组件预览。',
  '@Ability': 'Declares an Ability class for HarmonyOS application lifecycle.\n\n声明 HarmonyOS 应用生命周期的 Ability 类。',
  '@AnimatableExtend': 'Extends components with animatable custom attributes.\n\n扩展组件的可动画自定义属性。',
};

export function provideHover(
  document: vscode.TextDocument,
  position: vscode.Position,
  _token: vscode.CancellationToken
): vscode.Hover | undefined {
  const range = document.getWordRangeAtPosition(position, /@\w+/);
  if (!range) return undefined;

  const word = document.getText(range);
  const doc = DECORATOR_DOCS[word];
  if (!doc) return undefined;

  const markdown = new vscode.MarkdownString();
  markdown.appendCodeblock(word, 'arkts');
  markdown.appendMarkdown(`\n\n${doc}`);
  markdown.appendMarkdown(`\n\n[HarmonyOS Documentation](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/arkts-state-management-overview)`);

  return new vscode.Hover(markdown, range);
}
