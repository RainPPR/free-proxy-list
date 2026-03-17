示例文件：

```js
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

async function run() {
  // 这里是爬取的逻辑

  // 写入临时文件
  const outputPath = join(tmpdir(), `name-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(totalNodes), 'utf-8');
  
  // 输出文件路径到 stdout
  console.log(outputPath);
  process.exit(0);
}

run();
```

上面的 totalNodes 是节点的列表，`name` 是这个插件的名称，如果一个插件有多个入口，请单独配置名称。