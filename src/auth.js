
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from './config.js';

const ADMIN_CREDS_PATH = path.resolve(process.cwd(), 'data/admin_creds.txt');

// 内存中缓存当前凭据，避免频繁读文件
let currentCreds = {
    uuid: null,
    token: null
};

/**
 * 加载或生成初始凭据
 */
export function initAuth() {
    if (fs.existsSync(ADMIN_CREDS_PATH)) {
        try {
            const content = fs.readFileSync(ADMIN_CREDS_PATH, 'utf8');
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
            logger.error(`[Auth] 读取凭据文件失败: ${err.message}`);
        }
    }

    // 如果文件不存在或格式不对，生成新的
    resetAdminCreds(true);
}

/**
 * 重置管理凭据
 * @param {boolean} isInitial 是否为初始化调用
 */
export function resetAdminCreds(isInitial = false) {
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
        if (!fs.existsSync(path.dirname(ADMIN_CREDS_PATH))) {
            fs.mkdirSync(path.dirname(ADMIN_CREDS_PATH), { recursive: true });
        }
        fs.writeFileSync(ADMIN_CREDS_PATH, content, 'utf8');
        
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
