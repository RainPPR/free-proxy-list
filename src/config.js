import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import pluginsConfig from './plugins.js';

const defaultConfigPath = path.resolve(process.cwd(), 'config.yml');

let rawConfig = {};
try {
  if (fs.existsSync(defaultConfigPath)) {
    rawConfig = yaml.load(fs.readFileSync(defaultConfigPath, 'utf8')) || {};
  }
} catch (e) {
  console.error('[Config] ❌ Critical Error:', e.message);
  process.exit(1);
}

// ============== 配置对齐与聚合 ==============

export const config = {
  app: {
    port: parseInt(process.env.PORT, 10) || rawConfig?.app?.port || 8080,
    logLevel: rawConfig?.app?.log_level || 'info',
    dbPath: rawConfig?.app?.db_path || './data/proxy.sqlite',
  },
  runtime: {
    validationConcurrency: Math.min(parseInt(process.env.VALIDATION_CONCURRENCY, 10) || rawConfig?.runtime?.validation_concurrency || 8, 32),
    delayBetweenTestsMs: rawConfig?.runtime?.delay_between_tests ?? 0,
    timeoutMs: rawConfig?.runtime?.timeout_threshold || 5000,
    maxRetries: rawConfig?.runtime?.max_retries || 3,
    speedtestTimeoutMs: rawConfig?.runtime?.speedtest_timeout || 10000,
    delayBetweenSpeedtestsMs: rawConfig?.runtime?.delay_between_speedtests ?? 0,
    speedtestConcurrency: Math.min(parseInt(process.env.SPEEDTEST_CONCURRENCY, 10) || rawConfig?.runtime?.speedtest_concurrency || 1, 8),
    highPerformanceMinBps: rawConfig?.runtime?.high_performance_min_bps || 10485760,
    recheckIntervalMs: rawConfig?.runtime?.recheck_interval || 28800000,
    purgeDeletedLogsIntervalMs: rawConfig?.runtime?.purge_deleted_logs_interval || 86400000
  },
  pluginIntervalSeconds: rawConfig?.runtime?.plugin_interval_seconds || 14400,
  plugins: rawConfig?.plugins || pluginsConfig.plugins
};

// 工具方法：精简日志
export const logger = {
  levels: { debug: 0, info: 1, warn: 2, error: 3 },
  currentLevel() { return this.levels[config.app.logLevel.toLowerCase()] ?? 1; },
  log(level, ...msg) {
    if (this.levels[level] >= this.currentLevel()) {
      const ts = new Date().toISOString();
      const s = msg.map(m => typeof m === 'object' ? JSON.stringify(m) : m).join(' ');
      process.stdout.write(`[${ts}] [${level.toUpperCase()}] ${s}\n`);
    }
  },
  debug(...msg) { this.log('debug', ...msg); },
  info(...msg) { this.log('info', ...msg); },
  warn(...msg) { this.log('warn', ...msg); },
  error(...msg) { this.log('error', ...msg); }
};

export const globalState = {
  isPluginRunning: false
};