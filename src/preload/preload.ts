import {contextBridge, ipcRenderer} from "electron";
import type {
  ConnectionStatusMessage,
  DataRequestOptions,
  DataResponse,
  NewDataNotification,
  PollingStatusMessage,
  WorkerErrorMessage
} from '../../types/types';

contextBridge.exposeInMainWorld('electronAPI', {
  // 데이터 요청
  requestData: (options: DataRequestOptions): Promise<any> => {
    return new Promise((resolve, reject) => {
      const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);

      const responseHandler = (_event: Electron.IpcRendererEvent, response: DataResponse) => {
        if (response.requestId === requestId) {
          ipcRenderer.removeListener('data-response', responseHandler);

          if (response.error)
            reject(new Error(response.error));
          else
            resolve(response.data);
        }
      };

      setTimeout(() => {
        ipcRenderer.removeListener('data-response', responseHandler);
        reject(new Error('Timeout'));
      }, 10000);

      ipcRenderer.on('data-response', responseHandler);

      ipcRenderer.send('data-request', {
        type: 'data-request',
        requestId: requestId,
        options: options
      });
    });
  },

  // 새 데이터 알림
  onNewData: (callback: (data: NewDataNotification) => void): (() => void) => {
    const wrappedCallback = (_event: Electron.IpcRendererEvent, data: NewDataNotification) => callback(data);
    ipcRenderer.on('new-data-notification', wrappedCallback);

    return () => {
      ipcRenderer.removeListener('new-data-notification', wrappedCallback);
    };
  },

  // 폴링 상태 변경
  onPollingStatusChange: (callback: (data: PollingStatusMessage) => void): (() => void) => {
    const wrappedCallback = (_event: Electron.IpcRendererEvent, data: PollingStatusMessage) => callback(data);
    ipcRenderer.on('polling-status-change', wrappedCallback);

    return () => {
      ipcRenderer.removeListener('polling-status-change', wrappedCallback);
    };
  },

  // 연결 상태 변경
  onConnectionStatusChange: (callback: (data: ConnectionStatusMessage) => void): (() => void) => {
    const wrappedCallback = (_event: Electron.IpcRendererEvent, data:ConnectionStatusMessage) => callback(data);
    ipcRenderer.on('connection-status-change', wrappedCallback);

    return () => {
      ipcRenderer.removeListener('connection-status-change', wrappedCallback);
    };
  },

  // 워커 오류
  onWorkerError: (callback: (data: WorkerErrorMessage) => void): (() => void) => {
    const wrappedCallback = (_event: Electron.IpcRendererEvent, data: WorkerErrorMessage) => callback(data);
    ipcRenderer.on('worker-error', wrappedCallback);

    return () => {
      ipcRenderer.removeListener('worker-error', wrappedCallback);
    };
  },

  // 폴링 제어
  controlPolling: (command: 'start' | 'stop' | 'set-polling-interval', interval?: number): void => {
    let message: any = { type: `${command}-polling` };
    if (interval)
      message.interval = interval;

    ipcRenderer.send('data-request', message);
  },

  // 캐시 무효화
  invalidateCache: (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);

      const responseHandler = (_event: Electron.IpcRendererEvent, response: DataResponse) => {
        if (response.requestId === requestId) {
          ipcRenderer.removeListener('data-response', responseHandler);

          if (response.error)
            reject(new Error(response.error));
          else
            resolve(response.status || 'Success');
        }
      };

      ipcRenderer.on('data-response', responseHandler);

      ipcRenderer.send('data-request', {
        type: 'invalidate-cache',
        requestId: requestId,
      });
    });
  }
});
