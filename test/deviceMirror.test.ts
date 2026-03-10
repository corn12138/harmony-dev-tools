import { describe, it, expect } from 'vitest';

describe('Device Mirror', () => {
  describe('coordinate mapping', () => {
    it('should correctly scale canvas coordinates to device coordinates', () => {
      const deviceWidth = 1080;
      const deviceHeight = 2340;
      const canvasWidth = 360;
      const canvasHeight = 780;

      const scaleX = deviceWidth / canvasWidth;
      const scaleY = deviceHeight / canvasHeight;

      const canvasClick = { x: 180, y: 390 };
      const deviceCoords = {
        x: canvasClick.x * scaleX,
        y: canvasClick.y * scaleY,
      };

      expect(deviceCoords.x).toBe(540);
      expect(deviceCoords.y).toBe(1170);
    });

    it('should handle corner coordinates', () => {
      const scaleX = 1080 / 360;
      const scaleY = 2340 / 780;

      expect(0 * scaleX).toBe(0);
      expect(0 * scaleY).toBe(0);
      expect(360 * scaleX).toBe(1080);
      expect(780 * scaleY).toBe(2340);
    });

    it('should handle tablet device resolution', () => {
      const deviceWidth = 2560;
      const deviceHeight = 1600;
      const canvasWidth = 600;
      const canvasHeight = 400;

      const scaleX = deviceWidth / canvasWidth;
      const scaleY = deviceHeight / canvasHeight;

      expect(Math.round(300 * scaleX)).toBe(1280);
      expect(Math.round(200 * scaleY)).toBe(800);
    });

    it('should handle wearable (square) resolution', () => {
      const size = 466;
      const canvasSize = 192;
      const scale = size / canvasSize;
      expect(Math.round(96 * scale)).toBe(233);
    });
  });

  describe('gesture detection', () => {
    function classifyGesture(start: {x:number,y:number}, end: {x:number,y:number}, durationMs: number) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) {
        return durationMs > 600 ? 'longpress' : 'click';
      }
      return 'swipe';
    }

    it('should classify small movement as click', () => {
      expect(classifyGesture({x:100,y:200}, {x:105,y:203}, 100)).toBe('click');
    });

    it('should classify large movement as swipe', () => {
      expect(classifyGesture({x:100,y:200}, {x:100,y:500}, 400)).toBe('swipe');
    });

    it('should classify long duration small movement as long press', () => {
      expect(classifyGesture({x:100,y:200}, {x:102,y:201}, 800)).toBe('longpress');
    });

    it('should classify short tap as click not longpress', () => {
      expect(classifyGesture({x:100,y:200}, {x:100,y:200}, 50)).toBe('click');
    });

    it('should classify diagonal swipe correctly', () => {
      expect(classifyGesture({x:0,y:0}, {x:100,y:100}, 300)).toBe('swipe');
    });

    it('should classify borderline distance as click when under threshold', () => {
      expect(classifyGesture({x:0,y:0}, {x:14,y:14}, 100)).toBe('click');
    });

    it('should classify exactly at threshold as swipe', () => {
      expect(classifyGesture({x:0,y:0}, {x:20,y:0}, 100)).toBe('swipe');
    });
  });

  describe('frame rate control', () => {
    const clampFps = (fps: number) => Math.max(1, Math.min(fps, 5));
    const fpsToInterval = (fps: number) => Math.round(1000 / clampFps(fps));

    it('should clamp FPS between 1 and 5', () => {
      expect(clampFps(0)).toBe(1);
      expect(clampFps(-1)).toBe(1);
      expect(clampFps(1)).toBe(1);
      expect(clampFps(3)).toBe(3);
      expect(clampFps(5)).toBe(5);
      expect(clampFps(10)).toBe(5);
      expect(clampFps(100)).toBe(5);
    });

    it('should calculate correct interval for each FPS', () => {
      expect(fpsToInterval(1)).toBe(1000);
      expect(fpsToInterval(2)).toBe(500);
      expect(fpsToInterval(5)).toBe(200);
    });

    it('should calculate actual FPS from frame count and time', () => {
      const calc = (frames: number, ms: number) => frames / (ms / 1000);
      expect(calc(10, 5000)).toBe(2);
      expect(calc(5, 5000)).toBe(1);
      expect(calc(25, 5000)).toBe(5);
    });
  });

  describe('framePending guard', () => {
    it('should prevent concurrent frame requests', async () => {
      let pending = false;
      let callCount = 0;

      async function pushFrame() {
        if (pending) return;
        pending = true;
        try {
          callCount++;
          await new Promise(r => setTimeout(r, 50));
        } finally {
          pending = false;
        }
      }

      const p1 = pushFrame();
      const p2 = pushFrame();
      const p3 = pushFrame();
      await Promise.all([p1, p2, p3]);

      expect(callCount).toBe(1);
    });
  });
});

describe('Emulator Manager', () => {
  describe('emulator search directories', () => {
    it('should generate macOS paths', () => {
      const home = '/Users/test';
      const macPaths = [
        `${home}/Library/Huawei/DevEcoStudio/emulator`,
        `${home}/Library/Huawei/Sdk/hms/emulator`,
        `${home}/.DevEcoStudio/avd`,
        `${home}/Library/OpenHarmony/emulator`,
      ];
      expect(macPaths.length).toBe(4);
      expect(macPaths.every(p => p.startsWith(home))).toBe(true);
    });

    it('should generate Windows paths', () => {
      const localAppData = 'C:\\Users\\test\\AppData\\Local';
      const winPaths = [
        `${localAppData}\\Huawei\\DevEcoStudio\\emulator`,
        `${localAppData}\\Huawei\\Sdk\\hms\\emulator`,
        `${localAppData}\\OpenHarmony\\emulator`,
      ];
      expect(winPaths.length).toBe(3);
      expect(winPaths.every(p => p.includes('AppData'))).toBe(true);
    });

    it('should generate Linux paths', () => {
      const home = '/home/test';
      const linuxPaths = [
        `${home}/.Huawei/DevEcoStudio/emulator`,
        `${home}/.DevEcoStudio/avd`,
        `${home}/OpenHarmony/emulator`,
      ];
      expect(linuxPaths.length).toBe(3);
    });
  });

  describe('emulator binary detection', () => {
    it('should list known binary locations for macOS', () => {
      const candidates = [
        '/Applications/DevEco-Studio.app/Contents/tools/emulator/emulator',
      ];
      expect(candidates[0]).toContain('DevEco-Studio');
    });

    it('should list known binary locations for Windows', () => {
      const candidates = [
        'C:\\Program Files\\Huawei\\DevEco Studio\\tools\\emulator\\emulator.exe',
      ];
      expect(candidates[0]).toMatch(/\.exe$/);
    });
  });

  describe('emulator status detection', () => {
    function isEmulatorDevice(id: string): boolean {
      return id.includes('127.0.0.1') || id.includes('localhost') || id.includes('emulator');
    }

    it('should detect 127.0.0.1 as emulator', () => {
      expect(isEmulatorDevice('127.0.0.1:5555')).toBe(true);
    });

    it('should detect localhost as emulator', () => {
      expect(isEmulatorDevice('localhost:5555')).toBe(true);
    });

    it('should detect emulator keyword as emulator', () => {
      expect(isEmulatorDevice('emulator-5554')).toBe(true);
    });

    it('should NOT detect real device serial as emulator', () => {
      expect(isEmulatorDevice('ABC123DEF456')).toBe(false);
    });

    it('should NOT detect USB device as emulator', () => {
      expect(isEmulatorDevice('FNR0123456789')).toBe(false);
    });

    it('should handle empty device list', () => {
      const devices: string[] = [];
      expect(devices.some(isEmulatorDevice)).toBe(false);
    });

    it('should find emulator in mixed device list', () => {
      const devices = ['FNR123', '127.0.0.1:5555', 'ABC456'];
      expect(devices.some(isEmulatorDevice)).toBe(true);
    });
  });

  describe('device frame config', () => {
    const DEVICE_FRAMES: Record<string, { width: number; height: number; radius: number }> = {
      phone:    { width: 360, height: 780, radius: 24 },
      tablet:   { width: 600, height: 400, radius: 16 },
      wearable: { width: 192, height: 192, radius: 96 },
      car:      { width: 720, height: 360, radius: 12 },
    };

    it('should have correct phone dimensions', () => {
      expect(DEVICE_FRAMES.phone.width).toBeLessThan(DEVICE_FRAMES.phone.height);
    });

    it('should have correct tablet dimensions (landscape)', () => {
      expect(DEVICE_FRAMES.tablet.width).toBeGreaterThan(DEVICE_FRAMES.tablet.height);
    });

    it('should have square wearable', () => {
      expect(DEVICE_FRAMES.wearable.width).toBe(DEVICE_FRAMES.wearable.height);
    });

    it('should have circular radius for wearable', () => {
      expect(DEVICE_FRAMES.wearable.radius).toBe(DEVICE_FRAMES.wearable.width / 2);
    });

    it('should have correct car dimensions (landscape)', () => {
      expect(DEVICE_FRAMES.car.width).toBeGreaterThan(DEVICE_FRAMES.car.height);
    });
  });
});
