import { describe, it, expect } from 'vitest';
import { parseArkUI, renderToHtml, type ArkNode } from '../src/preview/arkuiRenderer';

describe('arkuiRenderer', () => {
  describe('parseArkUI', () => {
    it('should parse a simple Column with Text', () => {
      const source = `
@Entry
@Component
struct Index {
  build() {
    Column() {
      Text('Hello World')
        .fontSize(24)
    }
    .width('100%')
    .height('100%')
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Column');
      expect(tree!.styles.width).toBe('100%');
      expect(tree!.styles.height).toBe('100%');
      expect(tree!.children.length).toBeGreaterThanOrEqual(1);

      const textNode = tree!.children[0];
      expect(textNode.type).toBe('Text');
      expect(textNode.styles.fontSize).toBe('24');
    });

    it('should parse nested Row inside Column', () => {
      const source = `
@Component
struct MyComp {
  build() {
    Column() {
      Row() {
        Text('Left')
        Text('Right')
      }
      .justifyContent(FlexAlign.SpaceBetween)
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Column');

      const row = tree!.children[0];
      expect(row.type).toBe('Row');
      expect(row.styles.justifyContent).toBe('space-between');
      expect(row.children.length).toBe(2);
    });

    it('should parse V2 component', () => {
      const source = `
@Entry
@ComponentV2
struct Page {
  @Local msg: string = 'hi';
  build() {
    Column() {
      Text(this.msg)
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Column');
    });

    it('should parse Button with text param', () => {
      const source = `
@Component
struct Comp {
  build() {
    Column() {
      Button('Click Me')
        .width(200)
        .height(40)
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      const btn = tree!.children[0];
      expect(btn.type).toBe('Button');
      expect(btn.styles.width).toBe('200');
    });

    it('should parse TextInput with placeholder', () => {
      const source = `
@Component
struct Comp {
  build() {
    Column() {
      TextInput({ placeholder: 'Enter name' })
        .width('100%')
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      const input = tree!.children[0];
      expect(input.type).toBe('TextInput');
    });

    it('should parse Stack layout', () => {
      const source = `
@Component
struct Comp {
  build() {
    Stack() {
      Image('bg.png')
      Text('Overlay')
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Stack');
      expect(tree!.children.length).toBe(2);
    });

    it('should parse space parameter', () => {
      const source = `
@Component
struct Comp {
  build() {
    Column({ space: 12 }) {
      Text('A')
      Text('B')
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.params).toContain('space: 12');
    });

    it('should return null for source without build()', () => {
      const source = `
const x = 1;
function foo() {}
`;
      const tree = parseArkUI(source);
      expect(tree).toBeNull();
    });

    it('should handle empty build()', () => {
      const source = `
@Component
struct Comp {
  build() {
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeNull();
    });
  });

  describe('renderToHtml', () => {
    it('should render Column as flex column', () => {
      const node: ArkNode = {
        type: 'Column',
        params: '',
        styles: { width: '100%' },
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('flex-direction:column');
      expect(html).toContain('width:100%');
    });

    it('should render Row as flex row', () => {
      const node: ArkNode = {
        type: 'Row',
        params: '',
        styles: {},
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('flex-direction:row');
    });

    it('should render Text with content', () => {
      const node: ArkNode = {
        type: 'Text',
        params: "'Hello'",
        styles: { fontSize: '16' },
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('Hello');
      expect(html).toContain('font-size:16px');
    });

    it('should render Button', () => {
      const node: ArkNode = {
        type: 'Button',
        params: "'Submit'",
        styles: {},
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('Submit');
      expect(html).toContain('ark-btn');
    });

    it('should render Image placeholder', () => {
      const node: ArkNode = {
        type: 'Image',
        params: "$r('app.media.icon')",
        styles: {},
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('IMG');
      expect(html).toContain('ark-img-placeholder');
    });

    it('should render nested structure', () => {
      const tree: ArkNode = {
        type: 'Column',
        params: '{ space: 12 }',
        styles: { width: '100%' },
        children: [
          { type: 'Text', params: "'Title'", styles: { fontSize: '24' }, children: [] },
          {
            type: 'Row',
            params: '',
            styles: {},
            children: [
              { type: 'Button', params: "'OK'", styles: {}, children: [] },
              { type: 'Button', params: "'Cancel'", styles: {}, children: [] },
            ],
          },
        ],
      };
      const html = renderToHtml(tree);
      expect(html).toContain('Title');
      expect(html).toContain('OK');
      expect(html).toContain('Cancel');
      expect(html).toContain('flex-direction:column');
      expect(html).toContain('flex-direction:row');
    });

    it('should render Grid with template', () => {
      const node: ArkNode = {
        type: 'Grid',
        params: '',
        styles: { columnsTemplate: '1fr 1fr', rowsGap: '10', columnsGap: '10' },
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('display:grid');
      expect(html).toContain('grid-template-columns:1fr 1fr');
    });

    it('should render Divider', () => {
      const node: ArkNode = { type: 'Divider', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('ark-divider');
    });

    it('should render Progress', () => {
      const node: ArkNode = { type: 'Progress', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('ark-progress');
    });

    it('should render TextInput with placeholder', () => {
      const node: ArkNode = { type: 'TextInput', params: "{ placeholder: 'Name' }", styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('Name');
      expect(html).toContain('ark-input');
    });

    it('should render TextArea', () => {
      const node: ArkNode = { type: 'TextArea', params: "{ placeholder: 'Bio' }", styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('Bio');
      expect(html).toContain('ark-textarea');
    });

    it('should render Toggle', () => {
      const node: ArkNode = { type: 'Toggle', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('ark-toggle');
    });

    it('should render Slider', () => {
      const node: ArkNode = { type: 'Slider', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('ark-slider');
    });

    it('should render Search', () => {
      const node: ArkNode = { type: 'Search', params: "{ placeholder: 'Find' }", styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('Find');
      expect(html).toContain('ark-search');
    });

    it('should render Checkbox and Radio', () => {
      const checkbox: ArkNode = { type: 'Checkbox', params: '', styles: {}, children: [] };
      const radio: ArkNode = { type: 'Radio', params: '', styles: {}, children: [] };
      expect(renderToHtml(checkbox)).toContain('checkbox');
      expect(renderToHtml(radio)).toContain('radio');
    });

    it('should render Rating', () => {
      const node: ArkNode = { type: 'Rating', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('ark-rating');
    });

    it('should render Blank with flex:1', () => {
      const node: ArkNode = { type: 'Blank', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('flex:1');
    });

    it('should render unknown leaf component', () => {
      const node: ArkNode = { type: 'Badge', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('ark-unknown');
      expect(html).toContain('Badge');
    });

    it('should render Stack as grid', () => {
      const node: ArkNode = { type: 'Stack', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('display:grid');
    });

    it('should render List as scrollable column', () => {
      const node: ArkNode = { type: 'List', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('overflow:auto');
    });

    it('should render Flex with wrap', () => {
      const node: ArkNode = { type: 'Flex', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('flex-wrap:wrap');
    });

    it('should render Scroll as overflow auto', () => {
      const node: ArkNode = { type: 'Scroll', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('overflow:auto');
    });

    it('should render LoadingProgress', () => {
      const node: ArkNode = { type: 'LoadingProgress', params: '', styles: {}, children: [] };
      const html = renderToHtml(node);
      expect(html).toContain('ark-progress');
    });

    it('should map Color enum values', () => {
      const node: ArkNode = {
        type: 'Column',
        params: '',
        styles: { backgroundColor: '#FF0000' },
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('background-color:#FF0000');
    });

    it('should map vp/fp units to px', () => {
      const node: ArkNode = {
        type: 'Column',
        params: '',
        styles: { width: '100vp', height: '200fp' },
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('width:100px');
      expect(html).toContain('height:200px');
    });

    it('should handle numeric-only size values', () => {
      const node: ArkNode = {
        type: 'Column',
        params: '',
        styles: { width: '360', padding: '12' },
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('width:360px');
      expect(html).toContain('padding:12px');
    });

    it('should handle percentage sizes', () => {
      const node: ArkNode = {
        type: 'Column',
        params: '',
        styles: { width: '100%' },
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('width:100%');
    });

    it('should render gap from space param', () => {
      const node: ArkNode = {
        type: 'Column',
        params: '{ space: 16 }',
        styles: {},
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('gap:16px');
    });

    it('should handle opacity and layoutWeight', () => {
      const node: ArkNode = {
        type: 'Column',
        params: '',
        styles: { opacity: '0.5', layoutWeight: '1' },
        children: [],
      };
      const html = renderToHtml(node);
      expect(html).toContain('opacity:0.5');
      expect(html).toContain('flex:1');
    });
  });

  describe('parseArkUI edge cases', () => {
    it('should handle multiple root components by wrapping in Column', () => {
      const source = `
@Component
struct Comp {
  build() {
    Text('A')
    Text('B')
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Column');
      expect(tree!.children.length).toBe(2);
    });

    it('should parse deeply nested layouts', () => {
      const source = `
@Component
struct Comp {
  build() {
    Column() {
      Row() {
        Column() {
          Text('Deep')
            .fontSize(12)
        }
      }
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Column');
      const row = tree!.children[0];
      expect(row.type).toBe('Row');
      const innerCol = row.children[0];
      expect(innerCol.type).toBe('Column');
      expect(innerCol.children[0].type).toBe('Text');
    });

    it('should parse component with many chained styles', () => {
      const source = `
@Component
struct Comp {
  build() {
    Column() {
      Text('styled')
        .fontSize(20)
        .fontColor('#333')
        .width('100%')
        .padding(12)
        .backgroundColor('#f5f5f5')
        .borderRadius(8)
    }
  }
}`;
      const tree = parseArkUI(source);
      const text = tree!.children[0];
      expect(text.styles.fontSize).toBe('20');
      expect(text.styles.fontColor).toBe('#333');
      expect(text.styles.width).toBe('100%');
      expect(text.styles.padding).toBe('12');
      expect(text.styles.backgroundColor).toBe('#f5f5f5');
      expect(text.styles.borderRadius).toBe('8');
    });

    it('should handle Grid with columnsTemplate', () => {
      const source = `
@Component
struct Comp {
  build() {
    Grid() {
      Text('A')
      Text('B')
    }
    .columnsTemplate('1fr 1fr')
    .rowsGap(8)
    .columnsGap(8)
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Grid');
      expect(tree!.styles.columnsTemplate).toBe('1fr 1fr');
      expect(tree!.styles.rowsGap).toBe('8');
    });

    it('should handle Tabs component', () => {
      const source = `
@Component
struct Comp {
  build() {
    Tabs() {
      TabContent() {
        Text('Page 1')
      }
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Tabs');
    });

    it('should handle Navigation component', () => {
      const source = `
@Component
struct Comp {
  build() {
    Navigation() {
      Text('Home')
    }
  }
}`;
      const tree = parseArkUI(source);
      expect(tree).toBeTruthy();
      expect(tree!.type).toBe('Navigation');
    });
  });
});
