import { describe, it, expect } from 'vitest';
import { checkPageIsolation, checkComponentPurity, checkRouterInComponent } from '../src/language/architecturalDiagnostics';
import { DIAG_CODES } from '../src/language/diagnosticProvider';

describe('Harness Architectural Diagnostics', () => {
  it('should flag page importing another page', () => {
    const lines = [
      "import { OtherPage } from '../pages/OtherPage';",
      "@Entry @Component struct MyPage {}"
    ];
    const diags = checkPageIsolation(lines, '/src/main/ets/pages/MyPage.ets');
    expect(diags.length).toBe(1);
    expect(diags[0].code).toBe(DIAG_CODES.ARCH_PAGE_ISOLATION);
  });

  it('should not flag component importing from utils', () => {
    const lines = [
      "import { util } from '../utils/util';",
      "@Component struct MyComp {}"
    ];
    const diags = checkPageIsolation(lines, '/src/main/ets/pages/MyPage.ets');
    expect(diags.length).toBe(0);
  });

  it('should flag component using @Entry', () => {
    const lines = [
      "@Entry",
      "@Component",
      "struct ReusableComp {}"
    ];
    const diags = checkComponentPurity(lines, lines.join('\\n'), '/src/main/ets/components/ReusableComp.ets');
    expect(diags.length).toBe(1);
    expect(diags[0].code).toBe(DIAG_CODES.ARCH_COMPONENT_PURITY);
  });

  it('should not flag page using @Entry', () => {
    const lines = [
      "@Entry",
      "@Component",
      "struct MyPage {}"
    ];
    const diags = checkComponentPurity(lines, lines.join('\\n'), '/src/main/ets/pages/MyPage.ets');
    expect(diags.length).toBe(0);
  });

  it('should flag router usage inside components', () => {
    const lines = [
      "import router from '@ohos.router';",
      "@Component struct MyComp {",
      "  onClick() { router.pushUrl({ url: 'pages/Index' }); }",
      "}"
    ];
    const diags = checkRouterInComponent(lines, '/src/main/ets/components/MyComp.ets');
    expect(diags.length).toBe(1);
    expect(diags[0].code).toBe(DIAG_CODES.ARCH_ROUTER_IN_COMPONENT);
  });
});
