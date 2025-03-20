import * as path from 'path';
import {CachedData, DataRequestOptions, FilterParsingResult, IncomingData, Product} from "../../types/types";
import * as fs from "fs";
import {parentPort} from "node:worker_threads";
import {clearInterval} from "node:timers";
import Database from "better-sqlite3";

// DB 설정
const DB_PATH = path.join(__dirname, '../../data', 'data.db');
let db: Database.Database;

// Polling 설정
let pollingInterval = 5000;
let pollingTimer: NodeJS.Timeout | null = null;
let isPolling = false;
let lastDataTimestamp: number = Date.now();

// Caching
const requestCache: Map<string, CachedData> = new Map();
const CACHE_TIMEOUT = 60000;
let lastCacheCleanup: number = Date.now();

// 제어 플래그
let shouldStop = false;

// Last Data Collected
let lastCollectedData: {count: number; timestamp: number } | null = null;
let lastUiUpdateTimestamp: number | null = null;

// Worker 초기화
async function initialize(): Promise<void> {
  try {
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir))
      fs.mkdirSync(dataDir, { recursive: true });

    await initDatabase();

    if (parentPort) {
      parentPort.postMessage({
        type: 'polling-status',
        status: 'initialized'
      });
    }

    console.log('Worker initialized');
  } catch (error: any) {
    console.error('Worker initialized failed: ', error);
    if (parentPort) {
      parentPort.postMessage({
        type: 'polling-error',
        error: `Initializing Error: ${error.message}`
      });
    }
  }
}

// DB 초기화
async function initDatabase(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db = new Database(DB_PATH, {});

    // 제품 테이블
    db.exec(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL,
      category TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // 실시간 데이터 테이블
    db.exec(`CREATE TABLE IF NOT EXISTS realtime_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT,
      value REAL,
      timestamp TEXT,
      processed BOOLEAN DEFAULT 0
    )`);

    // 샘플 데이터 추가 (필요시)
    const count = db.prepare("SELECT COUNT(*) as count FROM products").pluck().get();
    if (count === 0)
      insertSampleData();
  });
}

// 샘플 데이터 삽입
function insertSampleData(): void {
  const products: Product[] = [
    { name: '노트북', description: '고성능 비즈니스 노트북', price: 1200000, category: '전자제품' },
    { name: '스마트폰', description: '최신형 스마트폰', price: 900000, category: '전자제품' },
    { name: '무선 이어폰', description: '노이즈 캔슬링 기능', price: 250000, category: '액세서리' },
    { name: '스마트워치', description: '건강 모니터링 기능', price: 350000, category: '웨어러블' },
    { name: '태블릿', description: '10인치 디스플레이', price: 700000, category: '전자제품' }
  ];

  const stmt = db.prepare("INSERT INTO products (name, description, price, category) VALUES (?, ?, ?, ?)");

  products.forEach(product => {
    stmt.run(product.name, product.description, product.price, product.category);
  });

  console.log('Sample data added');
}

// Cache key 생성
function createCacheKey(options: DataRequestOptions): string {
  return JSON.stringify({
    type: options.type || 'query',
    search: options.searchValue || null,
    filter: options.filter || null,
    sort: options.sort || null,
    skip: options.skip || 0,
    take: options.take || 20
  });
}

// Cache 정리
function cleanupCache(): void {
  const now = Date.now();

  if (now - lastCacheCleanup > 60000) {
    let expiredCount = 0;

    for (const [key, entry] of requestCache.entries()) {
      if (now - entry.timestamp > CACHE_TIMEOUT) {
        requestCache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`Clear cache: Deleted ${expiredCount} items`);
    }

    lastCacheCleanup = now;
  }
}

// 데이터 요청 처리
async function processDataRequest(options: DataRequestOptions): Promise<any> {
  try {
    cleanupCache();

    const cacheKey = createCacheKey(options);
    if (requestCache.has(cacheKey)) {
      const cachedResult = requestCache.get(cacheKey);
      if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TIMEOUT) {
        console.log('Return data from cache');
        return cachedResult.data;
      }
    }

    if (options.type === 'check-new-data')
      return await checkNewDataStatus();

    if (options.type === 'mark-data-delivered') {
      markDataAsDelivered();
      return { success: true };
    }

    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];

    if (options.searchValue) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      const searchPattern = `%${options.searchValue}%`;
      params.push(searchPattern, searchPattern);
    }

    if (options.filter) {
      const filterCondition = parseFilter(options.filter);
      if (filterCondition.sql) {
        query += ` AND ${filterCondition.sql}`;
        params.push(...filterCondition.params);
      }
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalCount = await queryDatabase(countQuery, params);

    if (options.sort && options.sort.length) {
      query += ' ORDER BY ';
      options.sort.forEach((sortInfo: any, index: any) => {
        if (index > 0) query += ', ';
        query += `${sortInfo.selector} ${sortInfo.desc ? 'DESC' : 'ASC'}`;
      });
    } else
      query += ' ORDER BY id ASC';

    if (options.skip !== undefined || options.take !== undefined) {
      const skip = options.skip || 0;
      const take = options.take || 20;
      query += ` LIMIT ${take} OFFSET ${skip}`;
    }

    const data = await queryDatabase(query, params);

    const result = {
      data: data,
      totalCount: totalCount[0]?.count || 0,
      searchTerm: options.searchValue || ""
    };

    requestCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  } catch (error: any) {
    console.error('Error occurred: ', error);
    throw error;
  }
}

// Filter parsing
function parseFilter(filter: any): FilterParsingResult {
  if (!filter) return { sql: "", params: [] };

  try {
    if (Array.isArray(filter) && filter.length === 3 && typeof filter[1] === 'string') {
      const [field, operator, value] = filter;
      let sqlOperator;

      switch (operator) {
        case '=': sqlOperator = '='; break;
        case '<>': sqlOperator = '<>'; break;
        case '>': sqlOperator = '>'; break;
        case '>=': sqlOperator = '>='; break;
        case '<': sqlOperator = '<'; break;
        case '<=': sqlOperator = '<='; break;
        case 'contains': return { sql: `${field} LIKE ?`, params: [`%${value}%`] };
        case 'startswith': return { sql: `${field} LIKE ?`, params: [`${value}%`] };
        case 'endswith': return { sql: `${field} LIKE ?`, params: [`%${value}`] };
        default: return { sql: "", params: [] };
      }

      return { sql: `${field} ${sqlOperator} ?`, params: [value] };
    }

    if (Array.isArray(filter) && filter.length === 3) {
      if (filter[1] === 'and' || filter[1] === 'or') {
        const leftCondition = parseFilter(filter[0]);
        const rightCondition = parseFilter(filter[2]);

        if (leftCondition.sql && rightCondition.sql) {
          const sqlOperator = filter[1].toUpperCase();
          return {
            sql: `(${leftCondition.sql}) ${sqlOperator} (${rightCondition.sql})`,
            params: [...leftCondition.params, ...rightCondition.params]
          };
        }
      }
    }

    return { sql: "", params: [] };
  } catch (error) {
    console.error('Error parsing filter: ', error);
    return { sql: "", params: [] };
  }
}

// Execute DB Query
function queryDatabase(query: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    try {
      const result = db.prepare(query).all(params);
      resolve(result);
    } catch (err) {
      reject(err);
      return;
    }
  });
}

// Start polling
async function startPolling(): Promise<void> {
  if (isPolling)
    return;

  isPolling = true;
  shouldStop = false;

  await pollRealTimeData();

  pollingTimer = setInterval(() => {
    if (!shouldStop)
      pollRealTimeData();
    else
      stopPolling();
  }, pollingInterval);

  if (parentPort) {
    parentPort.postMessage({
      type: 'polling-status',
      status: 'started',
      interval: pollingInterval
    });
  }

  console.log(`Start polling (Interval: ${pollingInterval}ms)`);
}

// Stop polling
function stopPolling(): void {
  if (!isPolling)
    return;

  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }

  isPolling = false;
  shouldStop = false;

  if (parentPort) {
    parentPort.postMessage({
      type: 'polling-status',
      status: 'stopped'
    });
  }

  console.log('Polling stopped');
}

async function pollRealTimeData(): Promise<void> {
  try {
    const newData = await fetchNewData();

    if (newData && newData.length > 0) {
      await saveToDatabase(newData);
      lastDataTimestamp = Date.now();
      invalidateCache();
      lastCollectedData = {
        count: newData.length,
        timestamp: lastDataTimestamp
      };
    }
  } catch (error: any) {
    console.error('Error polling real time data: ', error);
  }
}

async function checkNewDataStatus(): Promise<{
  hasNewData: boolean;
  lastCheck: number;
  lastCollection?: {
    count: number;
    timestamp: number;
  } | null;
}> {
  return {
    hasNewData: lastCollectedData !== null && (lastUiUpdateTimestamp === null || lastCollectedData.timestamp > lastUiUpdateTimestamp),
    lastCheck: Date.now(),
    lastCollection: lastCollectedData
  };
}

function markDataAsDelivered() {
  lastUiUpdateTimestamp = Date.now();
}

function invalidateCache(): void {
  requestCache.clear();
  console.log('Invalidate cache');
}

async function fetchNewData(): Promise<IncomingData[]> {
  // TODO: 외부에서 데이터를 가져와야 하지만, 여기서는 새 데이터를 임의로 생성
  return new Promise((resolve) => {
    // 80% 확률로 새 데이터 없음 (폴링 부하 감소 시뮬레이션)
    if (Math.random() < 0.8) {
      resolve([]);
      return;
    }

    const count = Math.floor(Math.random() * 3) + 1;
    const data: IncomingData[] = [];

    for (let i = 0; i < count; i++) {
      // 50% 확률로 제품 데이터, 50% 확률로 측정 데이터
      if (Math.random() < 0.5) {
        // 제품 데이터
        data.push({
          type: 'product',
          name: `새 제품 ${Date.now()}-${i}`,
          description: `자동 생성된 제품 설명 ${i}`,
          price: Math.round(Math.random() * 1000000) / 100,
          category: ['전자제품', '가전', '웨어러블', '액세서리'][Math.floor(Math.random() * 4)],
          timestamp: new Date().toISOString()
        });
      } else {
        // 측정 데이터
        data.push({
          type: 'measurement',
          source: ['sensor-1', 'sensor-2', 'sensor-3'][Math.floor(Math.random() * 3)],
          value: Math.round(Math.random() * 10000) / 100,
          timestamp: new Date().toISOString()
        });
      }
    }

    resolve(data);
  });
}

async function saveToDatabase(data: IncomingData[]): Promise<void> {
  const productStatement = db.prepare("INSERT INTO products (name, description, price, category) VALUES (?, ?, ?, ?)");
  const realtimeStatement = db.prepare("INSERT INTO realtime_data (source, value, timestamp) VALUES (?, ?, ?)");

  return new Promise<void>((resolve, reject) => {
    db.exec("BEGIN TRANSACTION");

    try {
      data.forEach(item => {
        if (item.type === 'product' && item.name && item.description && item.price && item.category) {
          productStatement.run(item.name, item.description, item.price, item.category);
        } else if (item.type === 'measurement' && item.source && item.value) {
          realtimeStatement.run(item.source, item.value, item.timestamp);
        }
      });

      db.exec("COMMIT");
      resolve();
    } catch (error) {
      db.exec("ROLLBACK");
      reject(error);
    }
  });
}

// Memory Usage
function reportMemoryUsage(): void {
  const memoryUsage = process.memoryUsage();
  console.log(`Memory Usage: RSS=${Math.round(memoryUsage.rss / 1024 / 1024)}MB, `
    + `Heap=${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB/${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`);
}

// Request messages from main process
if (parentPort) {
  parentPort.on('message', async (message: any) => {
    try {
      switch (message.type) {
        case 'data-request': {
          const result = await processDataRequest(message.options || {});
          parentPort?.postMessage({
            type: 'data-request',
            requestId: message.requestId,
            data: result
          });
          break;
        }

        case 'start-polling':
          pollingInterval = message.interval || pollingInterval;
          await startPolling();
          break;

        case 'stop-polling':
          shouldStop = true;
          if (pollingTimer)
            stopPolling();
          break;

        case 'set-polling-interval':
          pollingInterval = message.interval;
          if (isPolling) {
            stopPolling();
            await startPolling();
          }
          parentPort?.postMessage({
            type: 'polling-status',
            status: isPolling ? 'started' : 'stopped',
            interval: pollingInterval
          });
          break;

        case 'health-check':
          parentPort?.postMessage({
            type: 'health-check-response',
            timestamp: Date.now()
          });
          reportMemoryUsage();
          break;

        case 'invalidate-cache':
          invalidateCache();
          parentPort?.postMessage({
            type: 'data-response',
            requestId: message.requestId,
            status: 'Cache invalidated'
          });
          break;

        case 'shutdown':
          console.log('Requested shutdown');
          stopPolling();
          if (db)
            db.close();

          setTimeout(() => {
            process.exit(0)
          }, 500);
          break;

        default:
          console.log('Unknown message: ', message.type);
      }
    } catch (err: any) {
      console.error('Error while processing message: ', err);
      parentPort?.postMessage({
        type: 'data-response',
        requestId: message.requestId,
        error: `Request error: ${err.message}`
      });
    }
  });
}

process.on('uncaughtException', (err: Error) => {
  console.error('UncaughtException', err);
  parentPort?.postMessage({
    type: 'polling-error',
    error: `Critical error: ${err.message}`
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

// Initialize & Start Polling
initialize().then(() => {
  startPolling();
});
