import { runAllFetchers } from './fetchers.js';

export default async function () {
  try {
    return await runAllFetchers();
  } catch (err) {
    console.error(`[Proxypool Plugin] 抓取异常: ${err.message}`);
    return [];
  }
}
