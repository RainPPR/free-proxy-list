import clarketm from '../plugins/clarketm/index.js';
import freeproxydb_cn from '../plugins/freeproxydb/cn.js';
import freeproxydb_global from '../plugins/freeproxydb/index.js';
import freeproxylist_cn from '../plugins/freeproxylist/cn.js';
import freeproxylist_main from '../plugins/freeproxylist/main.js';
import geonode_cn from '../plugins/geonode/cn.js';
import geonode_global from '../plugins/geonode/index.js';
import gfpcom from '../plugins/gfpcom/index.js';
import iplocate from '../plugins/iplocate/index.js';
import iproyal_cn from '../plugins/iproyal/cn.js';
import iproyal_global from '../plugins/iproyal/index.js';
import jetkai_cn from '../plugins/jetkai/cn.js';
import jetkai_global from '../plugins/jetkai/index.js';
import lonekingcode_cn from '../plugins/lonekingcode/cn.js';
import lonekingcode_global from '../plugins/lonekingcode/index.js';
import monosans_cn from '../plugins/monosans/cn.js';
import monosans_global from '../plugins/monosans/index.js';
import mmpx12 from '../plugins/mmpx12/index.js';
import openproxylist from '../plugins/openproxylist/index.js';
import proxifly_cn from '../plugins/proxifly/cn.js';
import proxifly_global from '../plugins/proxifly/main.js';
import proxyscrape_cn from '../plugins/proxyscrape/cn.js';
import proxyscrape_global from '../plugins/proxyscrape/index.js';
import proxyspace from '../plugins/proxyspace/index.js';
import r00tee from '../plugins/r00tee/index.js';
import redscrape_cn from '../plugins/redscrape/cn.js';
import redscrape_global from '../plugins/redscrape/index.js';
import roosterkid_cn from '../plugins/roosterkid/cn.js';
import roosterkid_global from '../plugins/roosterkid/index.js';
import sockslistus_cn from '../plugins/sockslistus/cn.js';
import sockslistus_global from '../plugins/sockslistus/index.js';
import spys from '../plugins/spys/index.js';
import thespeedx from '../plugins/thespeedx/index.js';
import vakhov_cn from '../plugins/vakhov/cn.js';
import vakhov_global from '../plugins/vakhov/index.js';
import zaeem20 from '../plugins/zaeem20/index.js';

export default {
  plugins: [
    // 1. clarketm (global only)
    { name: "clarketm", region: "global", enabled: true, fn: clarketm },
    // 2. freeproxydb (both - 使用 global 版本)
    { name: "freeproxydb", region: "global", enabled: true, fn: freeproxydb_global },
    { name: "freeproxydb", region: "cn", enabled: true, fn: freeproxydb_cn },
    // 3. freeproxylist (both)
    { name: "freeproxylist", region: "global", enabled: true, fn: freeproxylist_main },
    { name: "freeproxylist", region: "cn", enabled: true, fn: freeproxylist_cn },
    // 4. geonode (both)
    { name: "geonode", region: "global", enabled: true, fn: geonode_global },
    { name: "geonode", region: "cn", enabled: true, fn: geonode_cn },
    // 5. gfpcom (global only, 默认禁用)
    { name: "gfpcom", region: "global", enabled: false, fn: gfpcom },
    // 6. iplocate (global only)
    { name: "iplocate", region: "global", enabled: true, fn: iplocate },
    // 7. iproyal (both)
    { name: "iproyal", region: "global", enabled: true, fn: iproyal_global },
    { name: "iproyal", region: "cn", enabled: true, fn: iproyal_cn },
    // 8. jetkai (both)
    { name: "jetkai", region: "global", enabled: true, fn: jetkai_global },
    { name: "jetkai", region: "cn", enabled: true, fn: jetkai_cn },
    // 9. lonekingcode (both)
    { name: "lonekingcode", region: "global", enabled: true, fn: lonekingcode_global },
    { name: "lonekingcode", region: "cn", enabled: true, fn: lonekingcode_cn },
    // 10. monosans (both)
    { name: "monosans", region: "global", enabled: true, fn: monosans_global },
    { name: "monosans", region: "cn", enabled: true, fn: monosans_cn },
    // 11. mmpx12 (global only)
    { name: "mmpx12", region: "global", enabled: true, fn: mmpx12 },
    // 12. openproxylist (global only)
    { name: "openproxylist", region: "global", enabled: true, fn: openproxylist },
    // 13. proxifly (both)
    { name: "proxifly", region: "global", enabled: true, fn: proxifly_global },
    { name: "proxifly", region: "cn", enabled: true, fn: proxifly_cn },
    // 14. proxyscrape (both)
    { name: "proxyscrape", region: "global", enabled: true, fn: proxyscrape_global },
    { name: "proxyscrape", region: "cn", enabled: true, fn: proxyscrape_cn },
    // 15. proxyspace (global only)
    { name: "proxyspace", region: "global", enabled: true, fn: proxyspace },
    // 16. r00tee (global only)
    { name: "r00tee", region: "global", enabled: true, fn: r00tee },
    // 17. redscrape (both)
    { name: "redscrape", region: "global", enabled: true, fn: redscrape_global },
    { name: "redscrape", region: "cn", enabled: true, fn: redscrape_cn },
    // 18. roosterkid (both)
    { name: "roosterkid", region: "global", enabled: true, fn: roosterkid_global },
    { name: "roosterkid", region: "cn", enabled: true, fn: roosterkid_cn },
    // 19. sockslistus (both)
    { name: "sockslistus", region: "global", enabled: true, fn: sockslistus_global },
    { name: "sockslistus", region: "cn", enabled: true, fn: sockslistus_cn },
    // 20. spys (global only)
    { name: "spys", region: "global", enabled: true, fn: spys },
    // 21. thespeedx (global only)
    { name: "thespeedx", region: "global", enabled: true, fn: thespeedx },
    // 22. vakhov (both)
    { name: "vakhov", region: "global", enabled: true, fn: vakhov_global },
    { name: "vakhov", region: "cn", enabled: true, fn: vakhov_cn },
    // 23. zaeem20 (global only)
    { name: "zaeem20", region: "global", enabled: true, fn: zaeem20 }
    // 注: highperf 特殊插件仅在需要额外高性能源时手动开启
  ]
};