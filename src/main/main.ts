import {app, BrowserWindow, ipcMain} from 'electron';
import {Worker} from "worker_threads";
import * as path from "path";
import {clearInterval} from "node:timers";

let mainWindow: BrowserWindow | null = null;
let worker: Worker | null = null;
let workerWatchdog: NodeJS.Timeout | null = null;

declare global {
  namespace NodeJS {
    interface Global {
      isQuitting: boolean;
    }
  }
}

(app as any).isQuitting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Worker Process 생성 및 관리
function createWorker(): void {
  console.log('Creating worker...');
  worker = new Worker(path.join(__dirname, 'worker.js'));

  worker.on('message', (message: any) => {
    if (!mainWindow)
      return;

    switch (message.type) {
      // 데이터 응답을 렌더러에 전달
      case 'data-response':
        mainWindow.webContents.send('data-response', message);
        break;

      // 새 데이터 알림
      case 'new-data-available':
        mainWindow.webContents.send('new-data-notification', message);
        break;

      // 폴링 상태 변경 알림
      case 'polling-status':
      case 'polling-error':
        mainWindow.webContents.send('polling-status-change', message);
        break;

      // 연결 상태 변경 알림
      case 'connection-status':
        mainWindow.webContents.send('connection-status-change', message);
        break;

      // 헬스체크 확인
      case 'health-check-response':
        console.log('Worker alive');
        break;

      default:
        console.log('Unknown message: ', message.type);
    }
  });

  worker.on('error', (error: Error) => {
    console.error('Worker error: ', error);
    if (mainWindow)
      mainWindow.webContents.send('worker-error', {error: error.message});
  });

  worker.on('exit', (code: number) => {
    console.log('Worker exited with code ', code);

    if (workerWatchdog) {
      clearInterval(workerWatchdog);
      workerWatchdog = null;
    }

    // 비정상 종료시 워커 재시작
    if (code != 0 && !(app as any).isQuitting) {
      console.log('Restarting worker...');
      setTimeout(createWorker, 1000);
    }
  });

  workerWatchdog = setInterval(async () => {
    if (worker) {
      try {
        worker.postMessage({type: 'health-check'});

        const timeoutCheck = setTimeout(async () => {
          console.error('Worker health check timeout');

          try {
            if (worker)
              await worker.terminate();
          } catch (e) {
            console.error('Worker exited: ', e);
          }

          worker = null;
          if (workerWatchdog) {
            clearInterval(workerWatchdog);
            workerWatchdog = null;
          }

          createWorker();
        }, 5000);

        const responseHandler = (message: any) => {
          if (message.type === 'health-check-response') {
            clearTimeout(timeoutCheck);
            if (worker)
              worker.removeListener('message', responseHandler);
          }
        };

        if (worker)
          worker.on('message', responseHandler);
      } catch (error) {
        console.error('Worker error: ', error);

        if (workerWatchdog) {
          clearInterval(workerWatchdog);
          workerWatchdog = null;
        }

        if (worker) {
          try {
            await worker.terminate();
          } catch (e) {}

          worker = null;
        }

        createWorker();
      }
    }
  }, 30000);
}

app.whenReady().then(() => {
  createWindow();
  createWorker();

  ipcMain.on('data-request', async (event, request: any) => {
    if (!worker) {
      console.error('Worker not exits');

      event.reply('data-response', {
        type: 'data-response',
        error: 'Worker not exits. Please restart application.'
      });
      return;
    }

    try {
      worker.postMessage(request);
    } catch (error: any) {
      console.error('Worker error: ', error);
      event.reply('data-response', {
        type: 'data-response',
        requestId: request.requestId,
        error: 'Data processing error.'
      });

      if (error.message && error.message.includes('dead worker')) {
        if (worker) {
          try {
            await worker.terminate();
          } catch (e) {}

          worker = null;
        }

        createWorker();
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0)
    createWindow();
});

app.on('before-quit', async () => {
  (app as any).isQuitting = true;

  if (workerWatchdog) {
    clearInterval(workerWatchdog);
    workerWatchdog = null;
  }

  if (worker) {
    try {
      worker.postMessage({type: 'shutdown'});
      await worker.terminate();
    } catch (e) {
      console.error('Worker shutdown error: ', e);
    }

    worker = null;
  }
});
