import geonode from '../plugins/geonode/index.js';
import freeproxydb from '../plugins/freeproxydb/index.js';

async function test() {
  try {
    console.log('--- Testing freeproxydb ---');
    console.log('calling freeproxydb...');
    const fdb = await freeproxydb();
    console.log(`FreeProxyDB returned: ${fdb?.length || 0}`);
  } catch(e) { console.error(e); }

  try {
    console.log('--- Testing geonode ---');
    console.log('calling geonode...');
    const geo = await geonode();
    console.log(`Geonode returned: ${geo?.length || 0}`);
  } catch(e) { console.error(e); }
}
test();
