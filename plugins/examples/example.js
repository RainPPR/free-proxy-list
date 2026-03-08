/**
 * 例: JS 插件如何输出被 free-proxy-list 主控接管的合规格式
 *
 * 核心法则：
 * 1. 禁止 console.log 任何无用过程字符串！(会引发宿主解析报错崩溃)
 * 2. 如果遇到异常，请 try catch 静默吃掉，仅需打印空数组 `[]`
 * 3. 必须输出具有 protocol, ip, port 的对象数组，最后 `process.exit(0)`
 */

async function main() {
  try {
    // ... 模拟你的抓取代码过程
    const tempNodeList = [
      {
        protocol: 'socks5',
        ip: '127.0.0.1',
        port: 1080,
        shortName: 'US',
        longName: 'United States',
        remark: 'my-custom-js-crawler'
      }
    ];

    // 通过标准流只丢出一次完整字符串化的 JSON
    console.log(JSON.stringify(tempNodeList));
    process.exit(0);

  } catch (err) {
    console.log(JSON.stringify([]));
    process.exit(0);
  }
}

main();
