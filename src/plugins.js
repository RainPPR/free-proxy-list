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
import mmpx12 from '../plugins/mmpx12/index.js';
import monosans_cn from '../plugins/monosans/cn.js';
import monosans_global from '../plugins/monosans/index.js';
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

export const plugins = {
  global: {
    clarketm,
    freeproxydb: freeproxydb_global,
    freeproxylist: freeproxylist_main,
    geonode: geonode_global,
    // gfpcom,
    iplocate,
    iproyal: iproyal_global,
    jetkai: jetkai_global,
    lonekingcode: lonekingcode_global,
    mmpx12,
    monosans: monosans_global,
    openproxylist,
    proxifly: proxifly_global,
    proxyscrape: proxyscrape_global,
    proxyspace,
    r00tee,
    redscrape: redscrape_global,
    roosterkid: roosterkid_global,
    sockslistus: sockslistus_global,
    spys,
    thespeedx,
    vakhov: vakhov_global,
    zaeem20
  },
  cn: {
    freeproxydb: freeproxydb_cn,
    freeproxylist: freeproxylist_cn,
    geonode: geonode_cn,
    iproyal: iproyal_cn,
    jetkai: jetkai_cn,
    lonekingcode: lonekingcode_cn,
    monosans: monosans_cn,
    proxifly: proxifly_cn,
    proxyscrape: proxyscrape_cn,
    redscrape: redscrape_cn,
    roosterkid: roosterkid_cn,
    sockslistus: sockslistus_cn,
    vakhov: vakhov_cn
  }
};
