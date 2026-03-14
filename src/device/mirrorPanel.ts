import * as vscode from 'vscode';
import {
  captureScreenshot,
  sendTouchInput,
  sendSwipeInput,
  sendKeyEvent,
  sendLongPress,
} from '../debug/uiInspector';
import { listHdcTargets } from '../utils/hdc';

let panel: vscode.WebviewPanel | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let isStreaming = false;
let currentFps = 2;
let currentDeviceId: string | undefined;
let framePending = false;

/**
 * Open the Device Mirror panel. Optionally target a specific device.
 * If no device is specified, auto-selects the first online device.
 */
export async function openDeviceMirror(deviceId?: string): Promise<void> {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    if (deviceId) {
      currentDeviceId = deviceId;
    }
    return;
  }

  // Auto-detect device if not specified
  if (!deviceId) {
    deviceId = await autoSelectDevice();
  }
  currentDeviceId = deviceId;

  panel = vscode.window.createWebviewPanel(
    'harmonyDeviceMirror',
    currentDeviceId ? `Mirror: ${currentDeviceId}` : 'Device Mirror',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.iconPath = new vscode.ThemeIcon('device-mobile');

  panel.onDidDispose(() => {
    panel = undefined;
    stopStreaming();
    currentDeviceId = undefined;
    framePending = false;
  });

  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case 'touch':
        await sendTouchInput(msg.x, msg.y, currentDeviceId);
        break;
      case 'swipe':
        await sendSwipeInput(msg.x1, msg.y1, msg.x2, msg.y2, msg.duration, currentDeviceId);
        break;
      case 'longpress':
        await sendLongPress(msg.x, msg.y, msg.duration, currentDeviceId);
        break;
      case 'key':
        await sendKeyEvent(msg.key, currentDeviceId);
        break;
      case 'startStream':
        startStreaming(msg.fps || 2);
        break;
      case 'stopStream':
        stopStreaming();
        break;
      case 'setFps':
        setStreamFps(msg.fps);
        break;
      case 'refresh':
        await pushFrame();
        break;
    }
  });

  panel.webview.html = getMirrorHtml();

  const firstFrame = await captureScreenshot(currentDeviceId, 'jpeg');
  if (!firstFrame && panel) {
    panel.webview.postMessage({ command: 'noDevice' });
  } else if (firstFrame && panel) {
    panel.webview.postMessage({ command: 'frame', data: firstFrame, format: 'jpeg' });
    startStreaming(2);
  }
}

async function autoSelectDevice(): Promise<string | undefined> {
  try {
    return (await listHdcTargets(3000))[0];
  } catch {
    return undefined;
  }
}

function startStreaming(fps: number): void {
  stopStreaming();
  isStreaming = true;
  currentFps = Math.max(1, Math.min(fps, 5));
  const interval = Math.round(1000 / currentFps);
  refreshTimer = setInterval(() => pushFrame(), interval);
  panel?.webview.postMessage({ command: 'streamStatus', active: true, fps: currentFps });
}

function stopStreaming(): void {
  isStreaming = false;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  panel?.webview.postMessage({ command: 'streamStatus', active: false, fps: 0 });
}

function setStreamFps(fps: number): void {
  if (isStreaming) {
    startStreaming(fps);
  }
}

async function pushFrame(): Promise<void> {
  if (!panel || framePending) return;
  framePending = true;
  try {
    const base64 = await captureScreenshot(currentDeviceId, 'jpeg');
    if (base64 && panel) {
      panel.webview.postMessage({ command: 'frame', data: base64, format: 'jpeg' });
    } else if (panel) {
      panel.webview.postMessage({ command: 'noDevice' });
    }
  } finally {
    framePending = false;
  }
}

function getMirrorHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #1a1a1a; color: #d4d4d4;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
    user-select: none;
  }

  .toolbar {
    height: 40px; background: #2d2d2d; border-bottom: 1px solid #444;
    display: flex; align-items: center; padding: 0 12px; gap: 6px; flex-shrink: 0;
  }
  .toolbar .title { font-size: 13px; font-weight: 600; color: #ccc; margin-right: 8px; }
  .toolbar button {
    background: #3c3c3c; color: #ccc; border: 1px solid #555; padding: 4px 10px;
    border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px;
  }
  .toolbar button:hover { background: #4c4c4c; }
  .toolbar button.active { background: #0A59F7; color: #fff; border-color: #0A59F7; }
  .toolbar .sep { width: 1px; height: 20px; background: #444; margin: 0 4px; }
  .toolbar .fps-label { font-size: 11px; color: #888; }
  .toolbar select {
    background: #3c3c3c; color: #ccc; border: 1px solid #555;
    padding: 2px 6px; border-radius: 3px; font-size: 12px;
  }

  .mirror-container {
    flex: 1; display: flex; justify-content: center; align-items: flex-start;
    overflow: auto; padding: 12px;
  }

  .device-frame {
    position: relative; border: 3px solid #555; border-radius: 24px;
    overflow: hidden; background: #000; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    cursor: crosshair;
  }

  #mirrorCanvas {
    display: block; width: 100%; height: 100%;
  }

  .touch-indicator {
    position: absolute; width: 40px; height: 40px; border-radius: 50%;
    border: 2px solid rgba(10, 89, 247, 0.7);
    background: rgba(10, 89, 247, 0.15);
    pointer-events: none; transform: translate(-50%, -50%);
    opacity: 0; transition: opacity 0.1s;
  }
  .touch-indicator.visible { opacity: 1; }

  .key-bar {
    height: 48px; background: #252525; border-top: 1px solid #444;
    display: flex; align-items: center; justify-content: center; gap: 16px; flex-shrink: 0;
  }
  .key-bar button {
    width: 40px; height: 36px; border-radius: 8px; border: 1px solid #555;
    background: #3c3c3c; color: #ccc; cursor: pointer; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
  }
  .key-bar button:hover { background: #4c4c4c; }
  .key-bar button:active { background: #0A59F7; color: #fff; }

  .status-bar {
    height: 24px; background: #252525; border-top: 1px solid #333;
    display: flex; align-items: center; padding: 0 12px;
    font-size: 11px; color: #888; gap: 12px;
  }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; }
  .status-dot.on { background: #4caf50; }
  .status-dot.off { background: #f44336; }
  .no-device {
    color: #888; font-size: 14px; text-align: center; padding: 60px 20px;
  }
  .no-device .icon { font-size: 48px; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="toolbar">
    <span class="title">Device Mirror</span>
    <button onclick="refresh()" title="Refresh">&#x21BB;</button>
    <button id="streamBtn" class="active" onclick="toggleStream()" title="Toggle streaming">&#x25B6; Live</button>
    <div class="sep"></div>
    <span class="fps-label">FPS:</span>
    <select id="fpsSelect" onchange="changeFps(this.value)">
      <option value="1">1</option>
      <option value="2" selected>2</option>
      <option value="3">3</option>
      <option value="5">5</option>
    </select>
    <div class="sep"></div>
    <button onclick="fitToWindow()" title="Fit to window">&#x2922;</button>
  </div>

  <div class="mirror-container" id="container">
    <div class="device-frame" id="deviceFrame">
      <canvas id="mirrorCanvas"></canvas>
      <div class="touch-indicator" id="touchIndicator"></div>
    </div>
  </div>

  <div class="key-bar">
    <button onclick="sendKey('Back')" title="Back">&#x25C0;</button>
    <button onclick="sendKey('Home')" title="Home">&#x25CB;</button>
    <button onclick="sendKey('Recent')" title="Recent Apps">&#x25A1;</button>
    <div class="sep" style="height:28px"></div>
    <button onclick="sendKey('VolumeUp')" title="Volume Up">&#x1F50A;</button>
    <button onclick="sendKey('VolumeDown')" title="Volume Down">&#x1F509;</button>
    <button onclick="sendKey('Power')" title="Power">&#x23FB;</button>
  </div>

  <div class="status-bar">
    <span class="status-dot" id="statusDot"></span>
    <span id="statusText">Connecting...</span>
    <span id="fpsInfo"></span>
    <span id="resInfo"></span>
  </div>

  <script>
    const vscodeApi = acquireVsCodeApi();
    const canvas = document.getElementById('mirrorCanvas');
    const ctx = canvas.getContext('2d');
    const frame = document.getElementById('deviceFrame');
    const indicator = document.getElementById('touchIndicator');

    let deviceWidth = 0, deviceHeight = 0;
    let streaming = true;
    let frameCount = 0;
    let lastFpsTime = Date.now();
    let swipeStart = null;

    const img = new Image();
    img.onload = () => {
      if (deviceWidth !== img.width || deviceHeight !== img.height) {
        deviceWidth = img.width;
        deviceHeight = img.height;
        canvas.width = deviceWidth;
        canvas.height = deviceHeight;
        fitToWindow();
        document.getElementById('resInfo').textContent = deviceWidth + 'x' + deviceHeight;
      }
      ctx.drawImage(img, 0, 0);
      frameCount++;
      const now = Date.now();
      if (now - lastFpsTime >= 2000) {
        const actualFps = (frameCount / ((now - lastFpsTime) / 1000)).toFixed(1);
        document.getElementById('fpsInfo').textContent = actualFps + ' fps';
        frameCount = 0;
        lastFpsTime = now;
      }
    };

    function toDeviceCoords(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = deviceWidth / rect.width;
      const scaleY = deviceHeight / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    canvas.addEventListener('mousedown', (e) => {
      const pos = toDeviceCoords(e);
      swipeStart = { x: pos.x, y: pos.y, time: Date.now() };
      showIndicator(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
    });

    canvas.addEventListener('mouseup', (e) => {
      if (!swipeStart) return;
      const pos = toDeviceCoords(e);
      const dx = pos.x - swipeStart.x;
      const dy = pos.y - swipeStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const duration = Date.now() - swipeStart.time;

      if (dist < 20) {
        if (duration > 600) {
          vscodeApi.postMessage({ command: 'longpress', x: pos.x, y: pos.y, duration: Math.min(duration, 3000) });
        } else {
          vscodeApi.postMessage({ command: 'touch', x: pos.x, y: pos.y });
        }
      } else {
        vscodeApi.postMessage({
          command: 'swipe',
          x1: swipeStart.x, y1: swipeStart.y,
          x2: pos.x, y2: pos.y,
          duration: Math.max(300, Math.min(duration, 2000))
        });
      }
      swipeStart = null;
      hideIndicator();
    });

    function showIndicator(x, y) {
      indicator.style.left = x + 'px';
      indicator.style.top = y + 'px';
      indicator.classList.add('visible');
    }
    function hideIndicator() {
      indicator.classList.remove('visible');
    }

    function sendKey(key) {
      vscodeApi.postMessage({ command: 'key', key });
    }

    function refresh() {
      vscodeApi.postMessage({ command: 'refresh' });
    }

    function toggleStream() {
      streaming = !streaming;
      const btn = document.getElementById('streamBtn');
      if (streaming) {
        btn.classList.add('active');
        btn.innerHTML = '&#x25B6; Live';
        vscodeApi.postMessage({ command: 'startStream', fps: parseInt(document.getElementById('fpsSelect').value) });
      } else {
        btn.classList.remove('active');
        btn.innerHTML = '&#x23F8; Paused';
        vscodeApi.postMessage({ command: 'stopStream' });
      }
    }

    function changeFps(val) {
      vscodeApi.postMessage({ command: 'setFps', fps: parseInt(val) });
    }

    function fitToWindow() {
      if (!deviceWidth || !deviceHeight) return;
      const container = document.getElementById('container');
      const maxH = container.clientHeight - 24;
      const maxW = container.clientWidth - 24;
      const aspect = deviceWidth / deviceHeight;
      let w, h;
      if (maxH * aspect <= maxW) {
        h = maxH; w = h * aspect;
      } else {
        w = maxW; h = w / aspect;
      }
      frame.style.width = w + 'px';
      frame.style.height = h + 'px';
    }

    window.addEventListener('resize', () => fitToWindow());

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.command) {
        case 'frame': {
          const mimeType = msg.format === 'jpeg' ? 'image/jpeg' : 'image/png';
          img.src = 'data:' + mimeType + ';base64,' + msg.data;
          document.getElementById('statusDot').className = 'status-dot on';
          document.getElementById('statusText').textContent = 'Connected';
          break;
        }
        case 'streamStatus': {
          streaming = msg.active;
          const btn = document.getElementById('streamBtn');
          if (msg.active) {
            btn.classList.add('active');
            btn.innerHTML = '&#x25B6; Live';
          } else {
            btn.classList.remove('active');
            btn.innerHTML = '&#x23F8; Paused';
          }
          break;
        }
        case 'noDevice': {
          document.getElementById('statusDot').className = 'status-dot off';
          document.getElementById('statusText').textContent = 'No device connected';
          if (!deviceWidth) {
            frame.style.width = '360px';
            frame.style.height = '640px';
            ctx.canvas.width = 360;
            ctx.canvas.height = 640;
            ctx.fillStyle = '#222';
            ctx.fillRect(0, 0, 360, 640);
            ctx.fillStyle = '#888';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No device connected', 180, 300);
            ctx.fillText('Connect a device or start an emulator', 180, 324);
          }
          break;
        }
      }
    });

    document.getElementById('statusDot').className = 'status-dot off';
  </script>
</body>
</html>`;
}
