/**
 * useDataLayer - 前端数据层 Hook
 *
 * 功能：
 * 1. 分层缓存策略（内存 + localStorage + IndexedDB）
 * 2. 增量更新机制
 * 3. 离线支持
 * 4. 数据一致性保证
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TrackerTopic, TrackerPaper, TopicId } from '../types/tracker';

// ============ 类型定义 ============

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string;
  version: number;
}

export interface DataLayerConfig {
  memoryCacheTTL: number;      // 内存缓存有效期（ms）
  localStorageTTL: number;     // localStorage 有效期（ms）
  indexedDBName: string;
  indexedDBVersion: number;
  syncInterval: number;        // 自动同步间隔（ms）
  enableOffline: boolean;
}

export interface SyncResult {
  success: boolean;
  updated: boolean;
  changes: DataChange[];
  error?: string;
}

export interface DataChange {
  type: 'topic' | 'paper' | 'editorial' | 'memory';
  id: string;
  action: 'create' | 'update' | 'delete';
  timestamp: number;
  data?: unknown;
}

export interface DataLayerState {
  topics: Map<TopicId, TrackerTopic>;
  papers: Map<string, TrackerPaper>;
  lastSync: number;
  isOnline: boolean;
  isSyncing: boolean;
  pendingChanges: DataChange[];
}

// ============ 配置 ============

const DEFAULT_CONFIG: DataLayerConfig = {
  memoryCacheTTL: 5 * 60 * 1000,      // 5 分钟
  localStorageTTL: 60 * 60 * 1000,    // 1 小时
  indexedDBName: 'DailyReportDB',
  indexedDBVersion: 1,
  syncInterval: 5 * 60 * 1000,        // 5 分钟
  enableOffline: true,
};

// ============ IndexedDB 管理器 ============

class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private config: DataLayerConfig;

  constructor(config: DataLayerConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        this.config.indexedDBName,
        this.config.indexedDBVersion
      );

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建存储对象
        if (!db.objectStoreNames.contains('topics')) {
          db.createObjectStore('topics', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('papers')) {
          db.createObjectStore('papers', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('changes')) {
          const changeStore = db.createObjectStore('changes', {
            keyPath: 'id',
            autoIncrement: true,
          });
          changeStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// ============ 数据层 Hook ============

export function useDataLayer(config: Partial<DataLayerConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // 状态
  const [state, setState] = useState<DataLayerState>({
    topics: new Map(),
    papers: new Map(),
    lastSync: 0,
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingChanges: [],
  });

  // Refs
  const memoryCache = useRef<Map<string, CacheEntry<unknown>>>(new Map());
  const dbManager = useRef<IndexedDBManager | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 初始化
  useEffect(() => {
    const init = async () => {
      try {
        // 初始化 IndexedDB
        dbManager.current = new IndexedDBManager(finalConfig);
        await dbManager.current.init();

        // 从 IndexedDB 加载数据
        await loadFromIndexedDB();

        // 从 localStorage 加载（作为补充）
        await loadFromLocalStorage();

        // 初始同步
        await sync();
      } catch (error) {
        console.error('[DataLayer] 初始化失败:', error);
      }
    };

    init();

    // 监听网络状态
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      sync();
    };
    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 自动同步
    if (finalConfig.syncInterval > 0) {
      syncIntervalRef.current = setInterval(sync, finalConfig.syncInterval);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  // ============ 缓存操作 ============

  const getFromCache = useCallback(<T,>(key: string): T | null => {
    // 1. 检查内存缓存
    const memoryEntry = memoryCache.current.get(key);
    if (memoryEntry) {
      const age = Date.now() - memoryEntry.timestamp;
      if (age < finalConfig.memoryCacheTTL) {
        return memoryEntry.data as T;
      }
      // 过期，从内存移除
      memoryCache.current.delete(key);
    }

    // 2. 检查 localStorage
    try {
      const localData = localStorage.getItem(`dr_cache_${key}`);
      if (localData) {
        const entry: CacheEntry<T> = JSON.parse(localData);
        const age = Date.now() - entry.timestamp;

        if (age < finalConfig.localStorageTTL) {
          // 重新放入内存缓存
          memoryCache.current.set(key, entry);
          return entry.data;
        }

        // 过期，清除
        localStorage.removeItem(`dr_cache_${key}`);
      }
    } catch (error) {
      console.error('[DataLayer] localStorage 读取失败:', error);
    }

    return null;
  }, [finalConfig.memoryCacheTTL, finalConfig.localStorageTTL]);

  const setCache = useCallback(<T,>(key: string, data: T, etag?: string) => {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      etag,
      version: 1,
    };

    // 1. 更新内存缓存
    memoryCache.current.set(key, entry);

    // 2. 更新 localStorage
    try {
      localStorage.setItem(`dr_cache_${key}`, JSON.stringify(entry));
    } catch (error) {
      console.error('[DataLayer] localStorage 写入失败:', error);
    }

    // 3. 更新 IndexedDB
    if (dbManager.current) {
      dbManager.current.put('metadata', {
        key,
        ...entry,
      }).catch(console.error);
    }
  }, []);

  const invalidateCache = useCallback((key?: string) => {
    if (key) {
      // 清除特定 key
      memoryCache.current.delete(key);
      localStorage.removeItem(`dr_cache_${key}`);
      dbManager.current?.delete('metadata', key);
    } else {
      // 清除所有缓存
      memoryCache.current.clear();
      // 清除所有 localStorage 缓存
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('dr_cache_')) {
          localStorage.removeItem(key);
        }
      }
    }
  }, []);

  // ============ 数据加载 ============

  const loadFromIndexedDB = async () => {
    if (!dbManager.current) return;

    try {
      const [topics, papers] = await Promise.all([
        dbManager.current.getAll<TrackerTopic>('topics'),
        dbManager.current.getAll<TrackerPaper>('papers'),
      ]);

      setState(prev => ({
        ...prev,
        topics: new Map<string, TrackerTopic>(topics.map(t => [t.id, t])),
        papers: new Map<string, TrackerPaper>(papers.map(p => [p.id, p])),
      }));

      console.log('[DataLayer] 从 IndexedDB 加载:', topics.length, '主题,', papers.length, '论文');
    } catch (error) {
      console.error('[DataLayer] IndexedDB 加载失败:', error);
    }
  };

  const loadFromLocalStorage = async () => {
    try {
      const topicsData = localStorage.getItem('dr_topics');
      const papersData = localStorage.getItem('dr_papers');

      if (topicsData || papersData) {
        const parsedTopics = topicsData ? JSON.parse(topicsData) as Array<[string, TrackerTopic]> : null;
        const parsedPapers = papersData ? JSON.parse(papersData) as Array<[string, TrackerPaper]> : null;

        setState(prev => ({
          ...prev,
          topics: parsedTopics ? new Map(parsedTopics) : prev.topics,
          papers: parsedPapers ? new Map(parsedPapers) : prev.papers,
        }));
      }
    } catch (error) {
      console.error('[DataLayer] localStorage 加载失败:', error);
    }
  };

  // ============ 同步 ============

  const sync = async (): Promise<SyncResult> => {
    if (!state.isOnline || state.isSyncing) {
      return { success: false, updated: false, changes: [], error: '离线或正在同步' };
    }

    setState(prev => ({ ...prev, isSyncing: true }));

    try {
      // 1. 获取服务器变更列表
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE}/api/sync/status`);
      if (!response.ok) throw new Error('同步请求失败');

      const result = await response.json();
      const serverChanges: DataChange[] = []; // 暂时为空，后续实现增量同步

      // 2. 应用变更
      const changes: DataChange[] = [];

      for (const change of serverChanges) {
        await applyChange(change);
        changes.push(change);
      }

      // 3. 推送本地变更
      if (state.pendingChanges.length > 0) {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
        const pushResponse = await fetch(`${API_BASE}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes: state.pendingChanges }),
        });

        if (pushResponse.ok) {
          setState(prev => ({ ...prev, pendingChanges: [] }));
        }
      }

      // 4. 更新状态
      setState(prev => ({
        ...prev,
        lastSync: Date.now(),
        isSyncing: false,
      }));

      return {
        success: true,
        updated: changes.length > 0,
        changes,
      };
    } catch (error) {
      setState(prev => ({ ...prev, isSyncing: false }));

      return {
        success: false,
        updated: false,
        changes: [],
        error: error instanceof Error ? error.message : '同步失败',
      };
    }
  };

  const applyChange = async (change: DataChange): Promise<void> => {
    switch (change.type) {
      case 'topic':
        if (change.action === 'delete') {
          setState(prev => {
            const topics = new Map(prev.topics);
            topics.delete(change.id);
            return { ...prev, topics };
          });
          await dbManager.current?.delete('topics', change.id);
        } else if (change.data) {
          const topic = change.data as TrackerTopic
          setState(prev => {
            const topics = new Map(prev.topics);
            topics.set(change.id, topic);
            return { ...prev, topics };
          });
          await dbManager.current?.put('topics', topic);
        }
        break;

      case 'paper':
        if (change.action === 'delete') {
          setState(prev => {
            const papers = new Map(prev.papers);
            papers.delete(change.id);
            return { ...prev, papers };
          });
          await dbManager.current?.delete('papers', change.id);
        } else if (change.data) {
          const paper = change.data as TrackerPaper
          setState(prev => {
            const papers = new Map(prev.papers);
            papers.set(change.id, paper);
            return { ...prev, papers };
          });
          await dbManager.current?.put('papers', paper);
        }
        break;
    }

    // 保存到 localStorage（备份）
    saveToLocalStorage();
  };

  const saveToLocalStorage = () => {
    try {
      localStorage.setItem('dr_topics', JSON.stringify(Array.from(state.topics.entries())));
      localStorage.setItem('dr_papers', JSON.stringify(Array.from(state.papers.entries())));
      localStorage.setItem('dr_lastSync', state.lastSync.toString());
    } catch (error) {
      console.error('[DataLayer] localStorage 保存失败:', error);
    }
  };

  // ============ 数据操作 ============

  const getTopic = useCallback((id: TopicId): TrackerTopic | undefined => {
    // 1. 检查内存
    const topic = state.topics.get(id);
    if (topic) return topic;

    // 2. 检查缓存
    const cached = getFromCache<TrackerTopic>(`topic:${id}`);
    if (cached) return cached;

    return undefined;
  }, [state.topics, getFromCache]);

  const getPaper = useCallback((id: string): TrackerPaper | undefined => {
    // 1. 检查内存
    const paper = state.papers.get(id);
    if (paper) return paper;

    // 2. 检查缓存
    const cached = getFromCache<TrackerPaper>(`paper:${id}`);
    if (cached) return cached;

    return undefined;
  }, [state.papers, getFromCache]);

  const updateTopic = useCallback(async (topic: TrackerTopic): Promise<void> => {
    // 1. 更新内存状态
    setState(prev => {
      const topics = new Map(prev.topics);
      topics.set(topic.id, topic);
      return { ...prev, topics };
    });

    // 2. 更新缓存
    setCache(`topic:${topic.id}`, topic);

    // 3. 更新 IndexedDB
    await dbManager.current?.put('topics', topic);

    // 4. 记录变更
    const change: DataChange = {
      type: 'topic',
      id: topic.id,
      action: 'update',
      timestamp: Date.now(),
      data: topic,
    };

    setState(prev => ({
      ...prev,
      pendingChanges: [...prev.pendingChanges, change],
    }));

    // 5. 保存到 localStorage
    saveToLocalStorage();
  }, [setCache]);

  const updatePaper = useCallback(async (paper: TrackerPaper): Promise<void> => {
    // 1. 更新内存状态
    setState(prev => {
      const papers = new Map(prev.papers);
      papers.set(paper.id, paper);
      return { ...prev, papers };
    });

    // 2. 更新缓存
    setCache(`paper:${paper.id}`, paper);

    // 3. 更新 IndexedDB
    await dbManager.current?.put('papers', paper);

    // 4. 记录变更
    const change: DataChange = {
      type: 'paper',
      id: paper.id,
      action: 'update',
      timestamp: Date.now(),
      data: paper,
    };

    setState(prev => ({
      ...prev,
      pendingChanges: [...prev.pendingChanges, change],
    }));

    // 5. 保存到 localStorage
    saveToLocalStorage();
  }, [setCache]);

  // ============ 导出 ============

  return {
    // 状态
    topics: state.topics,
    papers: state.papers,
    isOnline: state.isOnline,
    isSyncing: state.isSyncing,
    lastSync: state.lastSync,
    pendingChangesCount: state.pendingChanges.length,

    // 方法
    getTopic,
    getPaper,
    updateTopic,
    updatePaper,
    sync,
    invalidateCache,
  };
}

export default useDataLayer;
