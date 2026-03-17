# 代理列表项目 - 迁移到Bun的未完成任务文档

## 项目概述
这是一个免费代理列表项目，用于收集、验证和提供代理服务器列表。项目最初使用Node.js开发，目前正在进行迁移到Bun的改造。Bun是一个现代化的JavaScript运行时，提供更快的性能、内置的工具和更好的开发体验。

## 项目结构重组状态
根据用户的要求，项目结构已经重组为：

```
/
├── core/              # 核心功能模块
│   ├── auth.js       # 身份验证管理
│   ├── config.js     # 配置管理
│   ├── db.js         # 数据库操作（SQLite）
│   ├── maintenance.js # 维护任务
│   ├── scheduler.js  # 任务调度器
│   ├── speedtest.js  # 速度测试
│   └── validator.js  # 代理验证器
├── plugins/          # 插件系统
│   ├── plugins.js    # 插件加载器
│   └── [各种插件目录]/
├── server/           # Web服务器和前端
│   ├── server.js     # HTTP服务器
│   ├── render.js     # 页面渲染
│   └── styles.css    # 样式表
├── utils/            # 工具函数
│   ├── fetch-utils.js
│   └── html-utils.js
└── (根目录文件)
    ├── index.js      # 应用入口
    ├── build.js      # 构建脚本
    ├── config.toml   # TOML配置文件
    └── package.json
```

## 当前状态

### ✅ 已完成的工作

1. **项目结构重组**：
   - 从`src/`目录迁移到新的目录结构
   - 创建了core、plugins、utils、server目录
   - 将文件移动到相应的目录

2. **配置文件迁移**：
   - 从YAML配置迁移到TOML格式（config.toml）
   - 更新了core/config.js使用TOML解析

3. **部分Bun API迁移**：
   - core/config.js：修复了`Bun.readFileSync` -> `Bun.file().text()`
   - core/auth.js：修复了`Bun.readFileSync` -> `Bun.file().text()`
   - plugins目录：修复了import路径（从`../src/...`到`../utils/...`）

4. **TOML配置文件**：
   ```
   [app]
   port = 8080
   log_level = "info"
   db_path = "./data/proxy.sqlite"
   
   [runtime]
   validation_concurrency = 32
   plugin_interval_seconds = 14400
   ```

### ⚠️ 已知问题

1. **Bun API兼容性问题**：
   - 测试发现`Bun.readFileSync`、`Bun.readTextFileSync`、`Bun.readSync`等同步文件读取API不存在
   - `Bun.dirname`、`Bun.mkdir`、`Bun.exists`等文件系统API可能不存在
   - 正确的Bun文件系统API是：`Bun.file()`、`await file.text()`、`await Bun.write()`

2. **core/db.js问题**：
   ```javascript
   // 当前代码（可能有问题）：
   const dbDir = Bun.dirname(config.app.dbPath);
   if (!Bun.exists(dbDir)) {
     Bun.mkdir(dbDir, { recursive: true });
   }
   ```
   需要替换为标准的Node.js `path`和`fs`模块或找到正确的Bun API。

3. **异步/同步API混合**：
   - core/config.js现在使用了`await configFile.text()`，但文件顶部是同步代码
   - 可能需要将config.js改为异步模块或使用不同的初始化方式

4. **Bun API文档参考**：
   用户提供了Bun API文档，但具体可用的API需要验证：
   - `Bun.file()` - 创建文件引用
   - `await file.text()` - 读取文件内容
   - `await Bun.write()` - 写入文件
   - `Bun.resolveSync()` - 解析文件路径
   - `Bun.TOML.parse()` - 解析TOML
   - `Bun.connect()` - TCP连接（用于validator.js）
   - `Bun.CryptoHasher` - 加密哈希（用于scheduler.js）

## 🔧 未完成的任务

### 高优先级

1. **修复core/db.js的Bun API调用**：
   - 替换`Bun.dirname()`为`import { dirname } from 'path'`
   - 替换`Bun.exists()`为`import { existsSync } from 'fs'`
   - 替换`Bun.mkdir()`为`import { mkdirSync } from 'fs'`

2. **验证所有core文件的Bun API使用**：
   - 检查core/scheduler.js的`Bun.CryptoHasher`使用
   - 检查core/validator.js的`Bun.connect`使用
   - 检查core/maintenance.js和core/speedtest.js

3. **修复config.js的异步问题**：
   - 当前使用了`await`但模块可能不是异步的
   - 考虑使用立即执行的异步函数或不同的初始化策略

4. **测试插件import路径修复**：
   - 确认所有插件正确导入`../utils/...`而不是`../src/...`
   - 测试插件加载功能

### 中优先级

5. **更新package.json脚本**：
   - 从Node.js脚本迁移到Bun脚本
   - 更新dev、start、build脚本

6. **更新README.md文档**：
   - 反映Bun架构的变化
   - 更新安装和运行说明

7. **测试整个应用**：
   - 运行`bun run index.js`测试启动
   - 测试代理收集、验证、速度测试流程
   - 测试Web服务器功能

8. **Docker配置更新**：
   - 更新Dockerfile使用Bun而不是Node.js
   - 确保构建过程正确

### 低优先级

9. **优化构建脚本**：
   - 利用Bun的内置打包工具替换esbuild
   - 优化生产构建

10. **性能测试**：
    - 比较Bun和Node.js的性能差异
    - 验证内存使用和启动时间

## 🧪 技术细节和测试方法

### Bun API验证
创建测试脚本来验证可用的Bun API：

```javascript
// test-bun-api.js
#!/usr/bin/env bun

// 测试文件系统API
console.log('Bun.file:', typeof Bun.file); // 应该存在
console.log('Bun.write:', typeof Bun.write); // 应该存在
console.log('Bun.readFileSync:', typeof Bun.readFileSync); // 可能不存在
console.log('Bun.TOML.parse:', typeof Bun.TOML?.parse); // 应该存在

// 测试路径和目录操作
const path = require('path'); // 使用Node.js的path模块
const fs = require('fs'); // 使用Node.js的fs模块
```

### 修复策略

1. **文件系统操作**：
   - 使用`Bun.file()`和`await file.text()`代替`Bun.readFileSync()`
   - 使用`await Bun.write()`代替`fs.writeFileSync()`
   - 对于目录操作，继续使用Node.js的`fs`和`path`模块

2. **异步初始化**：
   ```javascript
   // config.js修复方案
   let rawConfig = {};
   let configInitialized = false;
   
   async function initConfig() {
     if (configInitialized) return;
     const configFile = Bun.file(Bun.resolveSync('../config.toml', import.meta.dir));
     const configText = await configFile.text();
     rawConfig = Bun.TOML.parse(configText);
     configInitialized = true;
   }
   
   // 导出异步获取配置的函数
   export async function getConfig() {
     await initConfig();
     return { /* 配置对象 */ };
   }
   ```

3. **db.js修复示例**：
   ```javascript
   import { dirname } from 'path';
   import { existsSync, mkdirSync } from 'fs';
   
   // 确保数据库目录存在
   const dbDir = dirname(config.app.dbPath);
   if (!existsSync(dbDir)) {
     mkdirSync(dbDir, { recursive: true });
   }
   ```

## 🤖 提示词工程指导

### 给后续AI的指导

1. **上下文重点**：
   - 这是Bun迁移项目，不是普通的Node.js项目
   - 目标：用Bun内置API替换Node.js API
   - 但某些操作仍需要使用Node.js标准库（fs、path等）

2. **Bun API特点**：
   - Bun的文件API主要是异步的：`Bun.file()` -> `await file.text()`
   - Bun没有`Bun.readFileSync`这样的同步API
   - Bun有`Bun.TOML.parse()`用于TOML解析
   - Bun有`Bun.connect()`用于TCP连接
   - Bun有`Bun.CryptoHasher`用于加密哈希

3. **检查清单**：
   ```
   - [ ] 所有core/目录下的.js文件都检查了Bun API使用
   - [ ] 替换了不存在的Bun API（如Bun.dirname, Bun.exists）
   - [ ] 保持了可用的Bun API（如Bun.file, Bun.TOML.parse）
   - [ ] 测试了import路径正确性
   - [ ] 测试了应用启动
   ```

4. **测试命令**：
   ```bash
   # 测试Bun API可用性
   bun -e "console.log('Bun.file:', typeof Bun.file)"
   
   # 测试应用启动
   bun run index.js
   
   # 测试构建
   bun run build.js
   ```

5. **常见错误处理**：
   - 如果看到`Bun.readFileSync is not a function`：使用`Bun.file().text()`
   - 如果看到`Bun.dirname is not a function`：使用`import { dirname } from 'path'`
   - 如果看到`Bun.exists is not a function`：使用`import { existsSync } from 'fs'`
   - 如果插件import失败：检查路径是否从`../src/...`改为`../utils/...`

6. **优先级顺序**：
   1. 修复core/db.js的文件系统API
   2. 测试config.js的异步初始化
   3. 验证所有插件import路径
   4. 测试应用启动
   5. 更新package.json和文档

### 项目入口点
- 主入口：`index.js`
- 配置：`core/config.js`
- 数据库：`core/db.js`
- 插件：`plugins/plugins.js`

## 📝 下一步行动建议

1. **立即执行**：
   ```bash
   # 1. 修复db.js
   sed -i "s/Bun\.dirname/import { dirname } from 'path';\nconst dbDir = dirname/" core/db.js
   sed -i "s/Bun\.exists/existsSync/" core/db.js
   sed -i "s/Bun\.mkdir/mkdirSync/" core/db.js
   
   # 2. 测试启动
   bun run index.js
   ```

2. **验证修复**：
   - 运行测试脚本确认Bun API可用性
   - 检查所有core文件的import语句
   - 测试插件加载功能

3. **完整测试**：
   - 启动应用并访问http://localhost:8080
   - 测试代理收集和验证流程
   - 检查数据库操作

## 🔗 相关文件

- `core/config.js` - 配置管理（需要异步修复）
- `core/db.js` - 数据库操作（需要文件系统API修复）
- `core/auth.js` - 已修复Bun API
- `plugins/plugins.js` - 插件加载器
- `index.js` - 应用入口

---

*最后更新：2026-03-15 20:00*
*状态：迁移到Bun进行中，核心API需要修复*