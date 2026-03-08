# Free Proxy List 项目详细极客规划 (DETAILS)

本文件是对 `ROADMAP.md` 的深度解析、技术架构设计、内存约束解决方案及后续开发 TASK / TODO 清单的高维指导手册。该规划专为下一步的 AI Vibe Coding 提供精确的上下文与约束条件。

---

## 1. 系统架构与核心业务流分析

整个项目采用 **Node.js + Python** 单体应用架构，所有的核心调度与数据存储均受限于单实例内存约束。为保障系统不发生不可控的内存溢出（OOM），放弃常见的高并发网络 I/O 扫描与常驻内存对象集，转而使用强制防抖与磁盘数据库轮询策略。

### 1.1 核心状态流转模型 (State Machine)

系统的核心即对爬虫获取到的无序、未知状态代理 IP 的生命周期进行管控与淘汰：

1. **抓取态 (Scraped)** -> 插件从各个网站拉取解析出原始节点（含基础 Protocol / IP / Port 等）。
2. **准备态 (Ready List)** -> 进行 Hash 排重并插入（跳过已存在或处于近期 Delete 态的 Hash），等待联通性初判。
3. **可用态 (Available List)** -> 进行 `Ping` 测试及真实网络请求测试（204 极速延时）。若成功且 < 5000ms 则转入此态。这部分可输出前端使用。
4. **高性能态 (High-Performance List)** -> 可用节点中，测速模块测试下载速度 > 10MB/s 且具备较低延迟特性的极品节点组。
5. **废弃态 (Deleted List)** -> 任一环节测试失败（丢包、超时、无响应）即进入。软删除保护期为 24 小时（在此期间防重新采集）。

### 1.2 内存（极度收敛）与双架构引擎方案

* **Docker 环境**：基于 Alpine 的体积极致压缩镜像。内置 Node.js Runtime 和 Python3 (带 pip 请求库集合如 requests / aiohttp 等)。
* **配置驱使引擎 (Config-Driven Engine)**：Node.js 作为主守护进程长驻，通过读取 `config.yml` 使用 `cron` 时钟驱动任务。它通过 `child_process.spawn()` 在隔离沙箱中周期唤醒短暂 Python 爬取插件，读取并处理 stdout JSON 后杀掉进程，防止 Python 进程内存泄露。
* **低内存数据库实现探讨**：不能使用需要将整体实例全部载入内存的模块（如全局 Array、原生 JSON 完整读写、Lowdb），应当使用 Node 原生编译的 `better-sqlite3` 或者流式读取的数据引擎。通过 SQLite 的磁盘级排查实现去重、验证调度。

### 1.3 调度器节流保护机制 (Throttling System)

按照 ROADMAP.md 的严苛要求：

* 每完成一个任务，**强制等待 1 秒钟**。
* 单线程，每次只发起单个 IP 节点的扫描或者测速。
这使得哪怕有十万个垃圾代理涌入，系统仍以恒定的超低 CPU / RAM 频率在稳定清洗。利用 JavaScript 的 `setTimeout()` 或者基于 Promise 的 Sleep 方法进行队列处理。

### 1.4 API 服务层及仪表盘监控

* **API 与 Subconverter**：开辟前端所需的列表 JSON 查询 API，包含后端分页检索。支持动态重写路由以对接外部 acl4ssr 的 subconverter 配置生成。
* **前台前端页面**：开发极轻量的 Vanilla JS 打包静态展现，主要由前端接管状态并拉取接口（加入每屏最大数量限压措施），以列表可视化统计现有三大池（准备、可用、删除）的概况。

---

## 2. 数据库建模指导方案 (Schema)

建议构建 SQLite 两大核心表体系：

1. **`proxies` 表**：
   * `hash` (TEXT, PK): 通过 `protocol://ip:port` SHA-256 计算后的后 7 位字符，全局 UUID。
   * `protocol` (TEXT), `ip` (TEXT), `port` (INTEGER),
   * `short_name` (TEXT), `long_name` (TEXT), `remark` (TEXT)
   * `status` (INTEGER): `0`=Ready, `1`=Available, `2`=High-Performance
   * `first_added` (INTEGER), `last_added` (INTEGER), `last_checked` (INTEGER), `speed_check_time` (INTEGER)
   * `ping_latency` (INTEGER), `google_latency` (INTEGER), `msft_latency` (INTEGER), `download_speed_bps` (INTEGER)
   _索引：为 `status`、`last_checked` 建立组合索引，方便按状态查询及淘汰过期未检验节点。_

2. **`deleted_logs` 表**：
   * `hash` (TEXT, PK), `deleted_at` (INTEGER)
   _作用：硬性记录并拦截被证明死链的 Hash（记录时间戳）。调度器每次拉取入库前必须校验此表并在 24 小时后将其 purge。_

---

## 3. 分期构建详细 TASK / TODO 清单

### 阶段一：宿主与底层数据通信铺设基础设施

- [ ] 构建符合项目限制环境的全量化 `Dockerfile`（Alpine Node + Python 配置）。处理左上关闭等信号捕获 (`SIGINT`, `SIGTERM`) 优雅存档并退出。
* [ ] 初始化基于 Node.js 的应用架构，解析并挂载 `config.yml` 验证环境设定。
* [ ] 建设极致省内存的 SQLite DB 操作模块 (`db.js`) 及其初始化建表语句注入。

### 阶段二：配置驱动运行的插件任务调度管道

- [ ] 完善定时任务派发机制（挂接 cron 解析器）。
* [ ] 实现 `PluginExecutor` 插件核心调用工具层，封装 `child_process.execFile`。限制单次爬取的最长耗时，读取规范 JSON，注入到 DB `Ready` 队列，与 `deleted_logs` 表做互斥去重。

### 阶段三：主验核心：防溢流验证引擎

- [ ] 构建严格节流的同步级工作流（验证单线程），遵循 1 秒钟的后置停顿：每次选取首位（非可用状态）执行尝试。
* [ ] 联通性子模块：实施底层的原生 Ping （避免调用厚实第三方包引发内存暴增）+ HTTP(S) 直连测试 (Google 204 及 MSFT TXT)。设置 3 次硬性重试阀门与 5000ms 强制超时限流。
* [ ] 高速测试流：针对已有 Available 节点，引入延时最低排序的优先测试机制，发起 10s 请求截断 Cloudflare 数据 10MB 并量化入库，提升标签地位。

### 阶段四：代理池维护周期脚本开发

- [ ] **8 小时活性自检器**：抽取入库 `Available`, `High-Performance` 标签时间超过 8h 的节点，进行复测（包含其连通或降级逻辑，超 7500ms 取消 `status` 但不进抛弃日志防抖）。
* [ ] **24 小时抛弃队列垃圾清理器**。

### 阶段五：对外服务与 Dashboard 建设

- [ ] 利用 Express / Fastify 注册 `/api/stats`, `/api/nodes/available`（严格基于 LIMIT & OFFSET SQL 构建） 及订阅转换路由（第三方 `GET /sub` 透接外置 subconverter API）。
* [ ] 建立极简前台渲染架构实现视图轮询监控。

---

## 4. 插件文档约束与分析设计（附录核心指导）

以下部分是对所要求挂载在核心规划当中的两个 Python 插件开发的具体指引。插件输出不应该在 stderr 中泄露无关进度，而应在 stdout 中抛出单行纯洁 JSON。

### @[d:\Github\proxy\free-proxy-list\plugins\freeproxylist\README.md]

**业务作用域**：该插件指向如 `FreeProxyList` 等以直接网页表格/DOM渲染形式免费公开发布的节点池来源。

**具体撰写指导规则：**

* **采集技术栈**：`requests` 配合 `BeautifulSoup4` 进行 DOM 层级的剥离选取。
* **爬取执行逻辑**：
  1. 通过伪造常见浏览器 UA 与规避型 Headers 抓取目标网站如 `https://free-proxy-list.net/` 的 DOM。
  2. 针对返回页面进行 `html.parser` 提纯，检索具有表格 IP 与 Port 映射的 `table tbody > tr`。
  3. 各列抽取：强制判断 Https 标签，若值为 `yes/true` 标记 `protocol` 为 `https` 否则降级成 `http`。
  4. 利用其提供的国别原始名称（如 `Country Code` = "US"）进行重组，构建 `shortName`。同时打上特属来源 `remark` ("freeproxylist")。
* **限错要求**：爬虫内部 `requests.get` 需要使用 `timeout=10` 保底限制。由于这类代理经常受到反自动化限流打击（如被挡住或网页不可用），必须以 try-catch 平滑跳出并打出空 `[]` 输出。不应造成核心系统阻塞。

---

### @[d:\Github\proxy\free-proxy-list\plugins\proxyscrape\README.md]

**业务作用域**：该插件指向类似开源接口站 `ProxyScrape` 开发的高通量 API 节点。这种站点的共同特性是能一键开放下载无格式区别、只以换行符分隔的批量地址纯文本集。

**具体撰写指导规则：**

* **采集技术栈**：纯原生组件 `requests` 与基础正则或简单的 split() 切片，轻量至死。
* **爬取执行逻辑**：
  1. 根据分析获取的并发 URL （通常具有如 `&type=http`, `&type=socks4`, `&type=socks5` 的标识查询字符）进行并发或顺序的拉取。
  2. 此类海量文本不包含具体的属相与可辨认地势标记（国家/城市），考虑到 64MB 的极限运存与外部 API 高昂的网络验证成本（例如反查其 GeoIP）：对此类产生的批量结构强制为其赋予硬编码标识如 `shortName: "Unknown"`, `longName: "Unknown"`。
  3. 规组其最终 JSON 输出组并打印输出，其处理体量极大（甚至存在万级别节点），不应该用内存中创建过大临时变量导致宿主 Python 内存崩盘。尽量保持生成式的数组构造直接 `json.dumps()` 扔向标准流输出即可。
