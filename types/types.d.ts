// 데이터 요청 옵션
export interface DataRequestOptions {
  type?: string;
  searchValue?: string;
  filter?: any;
  sort?: Array<{
    selector: string;
    desc: boolean;
  }>;
  skip?: number;
  take?: number;
}

// 새 데이터 확인 응답
export interface NewDataStatusResponse {
  hasNewData: boolean;
  lastCheck: number;
  lastCollection?: {
    count: number;
    timestamp: number;
  }
}

// 새 데이터 알림 
export interface NewDataNotification {
  type: 'new-data-available',
  count: number;
  timestamp: number;
  data?: any;
}

// 폴링 상태 메시지 
export interface PollingStatusMessage {
  type: 'polling-status' | 'polling-error';
  status?: string;
  interval?: number;
  error?: string;
}

// 연결 상태 메시지 
export interface ConnectionStatusMessage {
  type: 'connection-status';
  status: 'connected' | 'disconnected' | 'error';
  error?: string;
}

// 워커 오류 메시지 
export interface WorkerErrorMessage {
  error: string;
}

// Health-check
export interface HealthCheckMessage {
  type: 'health-check-response';
  timestamp: number;
}

// 데이터 응답
export interface DataResponse {
  type: 'data-response';
  requestId: string;
  data?: any;
  error?: string;
  status?: string;
}

// 캐시된 데이터
export interface CachedData {
  data: any;
  timestamp: number;
}

// 데이터베이스 제품 레코드
export interface Product {
  id?: number;
  name: string;
  description: string;
  price: number;
  category: string;
  created_at?: string;
  updated_at?: string;
}

// 실시간 데이터 레코드
export interface RealtimeData {
  id?: number;
  source: string;
  value: number;
  timestamp: string;
  processed?: boolean;
}

// 수신 데이터
export interface IncomingData {
  type: 'product' | 'measurement';
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  source?: string;
  value?: number;
  timestamp: string;
}

// 필터 파싱 결과
export interface FilterParsingResult {
  sql: string;
  params: any[];
}

// 렌더러에 노출되는 일렉트론 API
export interface ElectronAPI {
  requestData: (options: DataRequestOptions) => Promise<any>;
  onNewData: (callback: (data: NewDataNotification) => void) => (() => void);
  onPollingStatusChange: (callback: (data: PollingStatusMessage) => void) => (() => void);
  onConnectionStatusChange: (callback: (data: ConnectionStatusMessage) => void) => (() => void);
  onWorkerError: (callback: (data: WorkerErrorMessage) => void) => (() => void);
  controlPolling: (command: 'start' | 'stop' | 'set-polling-interval', interval?: number) => void;
  invalidateCache: () => Promise<string>;
}

// Window 객체에 ElectronAPI 추가
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
