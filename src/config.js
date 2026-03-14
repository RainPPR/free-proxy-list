import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// 读取当前目录或上层的 config.yml (以支持挂载或原生开发)
const defaultConfigPath = path.resolve(process.cwd(), 'config.yml');

let rawConfig = {};

try {
  if (fs.existsSync(defaultConfigPath)) {
    const fileContents = fs.readFileSync(defaultConfigPath, 'utf8');
    rawConfig = yaml.load(fileContents);
  } else {
    console.warn(`[Config] ⚠️ 没有找到 ${defaultConfigPath}，试图回退空载...`);
  }
} catch (e) {
  console.error('[Config] ❌ 解析 config.yml 时出错:', e.message);
  process.exit(1);
}

// ============== 挂载环境与配置聚合 ==============

export const config = {
  app: {
    port: parseInt(process.env.PORT, 10) || rawConfig?.app?.port || 8080,
    logLevel: rawConfig?.app?.log_level || 'info',
    dbPath: rawConfig?.app?.db_path || './data/proxy.sqlite',
  },
  external: {
    subconverterUrl: rawConfig?.external?.subconverter_url || 'https://api.wcc.best/sub'
  },
  runtime: {
    // 验证并发线程数 (最大 32)
    validationConcurrency: Math.min(
      parseInt(process.env.VALIDATION_CONCURRENCY, 10) || rawConfig?.runtime?.validation_concurrency || 8,
      32
    ),
    // 相邻检验任务之间的等待时间
    delayBetweenTestsMs: rawConfig?.runtime?.delay_between_tests ?? 0,
    // 单次网络操作超时阈值
    timeoutMs: rawConfig?.runtime?.timeout_threshold || 5000,
    // 重试次数
    maxRetries: rawConfig?.runtime?.max_retries || 3,
    // 测速超时
    speedtestTimeoutMs: rawConfig?.runtime?.speedtest_timeout || 10000,
    // 测速间隔（两个速度测试之间的额外等待，单位 ms）
    delayBetweenSpeedtestsMs: rawConfig?.runtime?.delay_between_speedtests ?? 0,
    // 测速并发线程数（最大 8，默认 1）
    speedtestConcurrency: Math.min(
      parseInt(process.env.SPEEDTEST_CONCURRENCY, 10) || rawConfig?.runtime?.speedtest_concurrency || 1,
      8
    ),
    // 高性能判定阈值 (Bytes/s)
    highPerformanceMinBps: rawConfig?.runtime?.high_performance_min_bps || 10485760,
    // 节点老化复检周期 (ms)
    recheckIntervalMs: rawConfig?.runtime?.recheck_interval || 28800000,
    // 删除日志清理周期 (ms)
    purgeDeletedLogsIntervalMs: rawConfig?.runtime?.purge_deleted_logs_interval || 86400000
  },
  // 插件执行间隔时间（秒）
  pluginIntervalSeconds: rawConfig?.runtime?.plugin_interval_seconds || 21600,
  plugins: rawConfig?.plugins || []
};

// 工具方法：简单的按级别输出日志
export const logger = {
  levels: { debug: 0, info: 1, warn: 2, error: 3 },
  currentLevel() {
    return this.levels[config.app.logLevel.toLowerCase()] ?? 1;
  },
  log(level, ...msg) {
    if (this.levels[level] >= this.currentLevel()) {
      const ts = new Date().toISOString();
      const s = msg.map(m => typeof m === 'object' ? JSON.stringify(m) : m).join(' ');
      if (level === 'error') console.error(`[${ts}] [${level.toUpperCase()}]`, s);
      else if (level === 'warn') console.warn(`[${ts}] [${level.toUpperCase()}]`, s);
      else console.log(`[${ts}] [${level.toUpperCase()}]`, s);
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