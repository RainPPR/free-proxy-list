#!/usr/bin/env bun

/**
 * 批量重写插件脚本
 * 将插件中的axios替换为Bun.fetch，cheerio替换为内置HTML解析器
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// 插件目录
const PLUGINS_DIR = 'plugins';

// 要重写的插件文件
const pluginFiles = [];

// 递归遍历插件目录
function findPluginFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findPluginFiles(fullPath);
    } else if (entry.name.endsWith('.js')) {
      pluginFiles.push(fullPath);
    }
  }
}

findPluginFiles(PLUGINS_DIR);

console.log(`找到 ${pluginFiles.length} 个插件文件`);

// 处理每个插件文件
for (const filePath of pluginFiles) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let modified = false;
    
    // 1. 替换axios导入
    if (content.includes('import axios from \'axios\'')) {
      content = content.replace(
        'import axios from \'axios\';',
        'import { fetchText } from \'../src/fetch-utils.js\';'
      );
      modified = true;
    }
    
    if (content.includes('import axios from "axios"')) {
      content = content.replace(
        'import axios from "axios";',
        'import { fetchText } from "../src/fetch-utils.js";'
      );
      modified = true;
    }
    
    // 2. 替换cheerio导入
    if (content.includes('import * as cheerio from \'cheerio\'')) {
      content = content.replace(
        'import * as cheerio from \'cheerio\';',
        'import { load } from \'../src/html-utils.js\';'
      );
      modified = true;
    }
    
    if (content.includes('import * as cheerio from "cheerio"')) {
      content = content.replace(
        'import * as cheerio from "cheerio";',
        'import { load } from "../src/html-utils.js";'
      );
      modified = true;
    }
    
    // 3. 替换axios.get调用为fetchText
    // 处理简单情况：const res = await axios.get(url, { responseType: 'text', timeout: 15000 });
    if (content.includes('await axios.get')) {
      content = content.replace(
        /const res = await axios\.get\(([^,]+), { responseType: 'text', timeout: (\d+) }\);/g,
        'const text = await fetchText($1, { timeout: $2 });'
      );
      
      content = content.replace(
        /const res = await axios\.get\(([^,]+), { timeout: (\d+) }\);/g,
        'const text = await fetchText($1, { timeout: $2 });'
      );
      
      content = content.replace(
        /const res = await axios\.get\(([^,]+), { responseType: 'text' }\);/g,
        'const text = await fetchText($1);'
      );
      
      content = content.replace(
        /const res = await axios\.get\(([^)]+)\);/g,
        'const text = await fetchText($1);'
      );
      
      // 替换res.data为text
      if (content.includes('res.data')) {
        content = content.replace(/res\.data/g, 'text');
      }
      
      modified = true;
    }
    
    // 4. 替换带有headers的axios调用
    if (content.includes('axios.get(url, {') && content.includes('headers:')) {
      // 需要更复杂的正则表达式处理
      // 暂时标记需要手动处理
      console.log(`⚠️  文件 ${filePath} 包含复杂axios配置，需要手动处理`);
    }
    
    // 5. 替换Promise.all中的axios调用
    if (content.includes('Promise.all') && content.includes('axios.get')) {
      console.log(`⚠️  文件 ${filePath} 包含Promise.all调用，需要手动处理`);
    }
    
    // 6. 写入修改后的文件
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      console.log(`✅ 已更新: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ 处理 ${filePath} 时出错:`, error.message);
  }
}

console.log('\n重写完成！');
console.log('注意：有些复杂的axios配置需要手动检查。');
console.log('建议运行以下命令测试插件：');
console.log('bun test-plugins.js');