import { logger } from './config.js';

const ADMIN_CREDS_PATH = Bun.resolveSync('./data/admin_creds.txt', import.meta.dir);

// 内存中缓存当前凭据，避免频繁读文件
let currentCreds = {
    uuid: null,
    token: null
};

/**
 * 加载或生成初始凭据
 */
export async function initAuth() {
    try {
        // 尝试读取文件，如果文件不存在会抛出错误
        const credsFile = Bun.file(ADMIN_CREDS_PATH);
        const content = await credsFile.text();
        const lines = content.split('\n');
        const uuidMatch = lines.find(l => l.startsWith('UUID:'))?.split(':')[1]?.trim();
        const tokenMatch = lines.find(l => l.startsWith('TOKEN:'))?.split(':')[1]?.trim();
        
        if (uuidMatch && tokenMatch) {
            currentCreds.uuid = uuidMatch;
            currentCreds.token = tokenMatch;
            logger.info(`[Auth] 🔑 已从文件加载现有管理凭据。`);
            return;
        }
    } catch (err) {
        // 文件不存在或读取失败，生成新的
        logger.info(`[Auth] 凭据文件不存在或无效: ${err.message}`);
    }

    // 如果文件不存在或格式不对，生成新的
    await resetAdminCreds(true);
}

/**
 * 重置管理凭据
 * @param {boolean} isInitial 是否为初始化调用
 */
export async function resetAdminCreds(isInitial = false) {
    const newUuid = crypto.randomUUID();
    const newToken = crypto.randomBytes(16).toString('hex');

    currentCreds.uuid = newUuid;
    currentCreds.token = newToken;

    const content = `
=========================================
      FREE PROXY LIST ADMIN CREDS
=========================================
UUID: ${newUuid}
TOKEN: ${newToken}
Generated at: ${new Date().toISOString()}
=========================================
`;

    try {
        // 使用Bun的文件系统API
        await Bun.write(ADMIN_CREDS_PATH, content);
        
        // 按照用户要求：输出到终端和文件
        console.log('\x1b[33m%s\x1b[0m', content); 
        logger.info(`[Auth] 🔑 管理凭据已重新生成并保存至 ${ADMIN_CREDS_PATH}`);
        
    } catch (err) {
        logger.error(`[Auth] 保存凭据文件失败: ${err.message}`);
    }
}

/**
 * 验证凭据
 */
export function verifyAuth(uuid, token) {
    if (!currentCreds.uuid || !currentCreds.token) return false;
    return uuid === currentCreds.uuid && token === currentCreds.token;
}