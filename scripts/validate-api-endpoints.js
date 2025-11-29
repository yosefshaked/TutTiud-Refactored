/**
 * API Endpoint Validation Script
 * Validates all API endpoints for common issues before deployment:
 * - Import path correctness
 * - Export name correctness
 * - Handler signature (context, req) for Azure Functions v4
 * - Required dependencies existence
 */

import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const API_DIR = join(__dirname, '../api');

// Will be populated dynamically
const VALID_EXPORTS = {};

const STORAGE_DRIVERS_PATH = '../cross-platform/storage-drivers/index.js';
const DEPRECATED_IMPORTS = {
  'checkOrgMembership': 'Use ensureMembership instead',
  '../_shared/supabase-tenant.js': 'Use resolveTenantClient from org-bff.js instead',
  '_shared/storage-drivers': 'Use ../cross-platform/storage-drivers/index.js instead',
};

const errors = [];
const warnings = [];

/**
 * Dynamically extract exports from a JavaScript module file
 */
async function extractExports(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const exports = [];

    // Match export function/async function declarations
    const functionMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    for (const match of functionMatches) {
      exports.push(match[1]);
    }

    // Match export const declarations
    const constMatches = content.matchAll(/export\s+const\s+(\w+)/g);
    for (const match of constMatches) {
      exports.push(match[1]);
    }

    // Match destructured exports like: export { foo, bar }
    const destructuredMatches = content.matchAll(/export\s+{\s*([^}]+)\s*}/g);
    for (const match of destructuredMatches) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
      exports.push(...names);
    }

    return exports;
  } catch (err) {
    return [];
  }
}

/**
 * Populate VALID_EXPORTS for critical shared modules
 */
async function loadSharedModuleExports() {
  const sharedDir = join(API_DIR, '_shared');
  const criticalModules = [
    'org-bff.js',
    'supabase-admin.js',
    'audit-log.js',
    'validation.js',
    'permissions-utils.js',
    'http.js'
  ];

  for (const moduleName of criticalModules) {
    const modulePath = join(sharedDir, moduleName);
    const exports = await extractExports(modulePath);
    if (exports.length > 0) {
      VALID_EXPORTS[moduleName] = exports;
    }
  }
}

async function validateEndpoint(endpointDir, fileName) {
  const filePath = join(endpointDir, fileName);
  const content = await readFile(filePath, 'utf-8');
  const relativePath = filePath.replace(API_DIR, 'api');

  // Check for deprecated imports
  for (const [deprecated, message] of Object.entries(DEPRECATED_IMPORTS)) {
    if (content.includes(deprecated)) {
      errors.push(`${relativePath}: Uses deprecated import '${deprecated}'. ${message}`);
    }
  }

  // Check for incorrect storage driver path
  if (content.includes('storage-drivers') && !content.includes(STORAGE_DRIVERS_PATH)) {
    errors.push(`${relativePath}: Incorrect storage-drivers import path. Use '${STORAGE_DRIVERS_PATH}'`);
  }

  // Check handler signature for Azure Functions v4
  const handlerMatch = content.match(/export\s+default\s+async\s+function\s+\w*\s*\(([^)]+)\)/);
  if (handlerMatch) {
    const params = handlerMatch[1].split(',').map(p => p.trim().split(/\s+/).pop());
    if (params.length === 2) {
      if (params[0] !== 'context' || params[1] !== 'req') {
        errors.push(`${relativePath}: Incorrect handler signature. Expected (context, req), got (${params.join(', ')})`);
      }
    } else if (params.length === 1) {
      warnings.push(`${relativePath}: Handler has only one parameter. Azure Functions v4 expects (context, req)`);
    }
  }

  // Check for proper import syntax (ES modules)
  const commonjsRequire = content.match(/const\s+.*=\s+require\(/);
  if (commonjsRequire) {
    errors.push(`${relativePath}: Uses CommonJS require() instead of ES import. Convert to: import ... from '...'`);
  }

  // Check for incorrect CommonJS named imports (common Azure Functions error)
  // parse-multipart-data is a CommonJS module that must use default import
  const badMultipartImport = content.match(/import\s+{\s*parseMultipartData\s*}\s+from\s+['"]parse-multipart-data['"]/);
  if (badMultipartImport) {
    errors.push(`${relativePath}: Incorrect import for CommonJS module 'parse-multipart-data'. Use: import pkg from 'parse-multipart-data'; const { parseMultipartData } = pkg;`);
  }

  // Generic check for potential CommonJS/ESM issues with known problematic packages
  const knownCommonJSPackages = [
    'parse-multipart-data',
    // Add more known CommonJS packages here as discovered
  ];
  
  for (const pkg of knownCommonJSPackages) {
    // Match: import { anything } from 'package-name'
    const namedImportPattern = new RegExp(`import\\s+{[^}]+}\\s+from\\s+['"]${pkg}['"]`);
    if (namedImportPattern.test(content) && pkg !== 'parse-multipart-data') {
      // We already checked parse-multipart-data above with specific message
      warnings.push(`${relativePath}: Named import from '${pkg}' may fail. This is a CommonJS module - use default import instead.`);
    }
  }

  // Check for exports from org-bff.js
  if (content.includes("from '../_shared/org-bff.js'")) {
    const importMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]\.\.\/\_shared\/org-bff\.js['"]/);
    if (importMatch) {
      const imports = importMatch[1].split(',').map(i => i.trim()).filter(i => i.length > 0);
      const validExports = VALID_EXPORTS['org-bff.js'];
      for (const imp of imports) {
        if (!validExports.includes(imp)) {
          errors.push(`${relativePath}: Imports non-existent '${imp}' from org-bff.js. Valid exports: ${validExports.join(', ')}`);
        }
      }
    }
  }

  // Check for try-catch around ensureMembership
  if (content.includes('ensureMembership')) {
    const hasTryCatch = content.match(/try\s*{[^}]*ensureMembership/s);
    if (!hasTryCatch) {
      warnings.push(`${relativePath}: ensureMembership call not wrapped in try-catch for error handling`);
    }

    // Check for incorrect usage pattern (membership.role instead of direct role)
    if (content.includes('membership.role')) {
      errors.push(`${relativePath}: Incorrect ensureMembership usage. It returns role string directly, not {role: string} object`);
    }
  }

  // Check for crypto.randomUUID() usage (should use database DEFAULT gen_random_uuid())
  if (content.includes('crypto.randomUUID()')) {
    warnings.push(`${relativePath}: Uses crypto.randomUUID(). Consider using database DEFAULT gen_random_uuid() instead for UUIDs`);
  }

  // Check for proper error response format
  if (content.includes('return {') && !content.includes('return { status:')) {
    warnings.push(`${relativePath}: Response objects should include explicit status code`);
  }
}

async function validateSharedModule(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const fileName = filePath.split(/[/\\]/).pop();
  const relativePath = filePath.replace(API_DIR, 'api');

  // Check exports match expected
  if (VALID_EXPORTS[fileName]) {
    const expectedExports = VALID_EXPORTS[fileName];
    for (const exp of expectedExports) {
      const hasExport = content.includes(`export async function ${exp}`) || 
                        content.includes(`export function ${exp}`) ||
                        content.includes(`export const ${exp}`);
      if (!hasExport) {
        warnings.push(`${relativePath}: Expected export '${exp}' not found`);
      }
    }
  }
}

async function scanDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      
      // Recursively scan subdirectories
      await scanDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      // Check if this is an endpoint (has index.js or function.json)
      const isEndpoint = entry.name === 'index.js';
      const isShared = fullPath.includes('_shared');
      
      if (isEndpoint) {
        await validateEndpoint(dir, entry.name);
      } else if (isShared) {
        await validateSharedModule(fullPath);
      }
    }
  }
}

async function checkStorageDrivers() {
  const storageDriverPath = join(API_DIR, 'cross-platform/storage-drivers/index.js');
  try {
    const content = await readFile(storageDriverPath, 'utf-8');
    if (!content.includes('export function getStorageDriver')) {
      errors.push('cross-platform/storage-drivers/index.js: Missing getStorageDriver export');
    }
  } catch (err) {
    errors.push(`cross-platform/storage-drivers/index.js: File not found or not readable`);
  }
}

async function main() {
  console.log('🔍 Validating API endpoints...\n');

  try {
    // First, load actual exports from shared modules
    await loadSharedModuleExports();
    
    // Scan all API directories
    await scanDirectory(API_DIR);
    
    // Check critical shared modules
    await checkStorageDrivers();

    // Report results
    console.log('📊 Validation Results:\n');
    
    if (errors.length === 0 && warnings.length === 0) {
      console.log('✅ All checks passed! No issues found.\n');
      process.exit(0);
    }

    if (errors.length > 0) {
      console.log(`❌ ERRORS (${errors.length}):`);
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
      console.log('');
    }

    if (warnings.length > 0) {
      console.log(`⚠️  WARNINGS (${warnings.length}):`);
      warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
      console.log('');
    }

    if (errors.length > 0) {
      console.log('❌ Validation failed. Fix errors before deploying.\n');
      process.exit(1);
    } else {
      console.log('✅ No critical errors. Warnings should be reviewed.\n');
      process.exit(0);
    }

  } catch (err) {
    console.error('💥 Validation script failed:', err);
    process.exit(1);
  }
}

main();
