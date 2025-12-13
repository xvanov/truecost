/**
 * Seed Script for Global Materials Database
 * FR27-FR30: Import materials from Excel file to Firestore
 *
 * Usage:
 *   cd functions
 *   npx ts-node scripts/seedGlobalMaterials.ts <path-to-excel-file>
 *   npx ts-node scripts/seedGlobalMaterials.ts scripts/material_normalized.xlsx
 *
 * Expected Excel columns:
 *   - item_name: Product name
 *   - description: Product description
 *   - lowes link: Lowe's product URL
 *   - lowes price: Lowe's price (number)
 *   - home depot link: Home Depot product URL
 *   - home depot price: Home Depot price (number)
 *   - alias: Comma-separated search aliases
 */

import * as admin from 'firebase-admin';
import * as XLSX from 'xlsx';
import * as path from 'path';
import {
  GlobalMaterial,
  SeedRow,
  DEFAULT_ZIPCODE,
} from '../src/types/globalMaterials';
import {
  normalizeProductName,
  generateMaterialId,
  extractProductId,
} from '../src/globalMaterials';

// Initialize Firebase Admin
if (!admin.apps.length) {
  // For local development, use emulator or service account
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'demo-truecost' });
    console.log('[SEED] Using Firestore emulator:', process.env.FIRESTORE_EMULATOR_HOST);
  } else {
    admin.initializeApp();
    console.log('[SEED] Using production Firestore');
  }
}

const db = admin.firestore();

/**
 * Parse Excel file and return seed rows
 * FR27: System provides seed script to import from Excel file
 */
function parseExcelFile(xlsxPath: string): SeedRow[] {
  console.log(`[SEED] Reading Excel file: ${xlsxPath}`);

  const workbook = XLSX.readFile(xlsxPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows: SeedRow[] = XLSX.utils.sheet_to_json(sheet);
  console.log(`[SEED] Parsed ${rows.length} rows from sheet: ${sheetName}`);

  return rows;
}

/**
 * Convert a seed row to GlobalMaterial document
 * FR28-FR29: Extract URLs, prices, parse aliases
 */
function rowToMaterial(row: SeedRow, now: number): GlobalMaterial {
  const normalizedName = normalizeProductName(row.item_name);
  const id = generateMaterialId(row.item_name, DEFAULT_ZIPCODE);

  // FR29: Parse comma-separated aliases into array
  const aliases = row.alias
    ? row.alias.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
    : [];

  // Add the item name itself as an alias
  aliases.push(row.item_name.toLowerCase());

  return {
    id,
    name: row.item_name,
    normalizedName,
    description: row.description || '',
    aliases: [...new Set(aliases)], // Dedupe
    zipCode: DEFAULT_ZIPCODE,
    retailers: {
      lowes: row['lowes link'] ? {
        productUrl: row['lowes link'],
        productId: extractProductId(row['lowes link'], 'lowes'),
        price: typeof row['lowes price'] === 'number' ? row['lowes price'] : parseFloat(String(row['lowes price'])) || 0,
        priceUpdatedAt: now,
      } : undefined,
      homeDepot: row['home depot link'] ? {
        productUrl: row['home depot link'],
        productId: extractProductId(row['home depot link'], 'homeDepot'),
        price: typeof row['home depot price'] === 'number' ? row['home depot price'] : parseFloat(String(row['home depot price'])) || 0,
        priceUpdatedAt: now,
      } : undefined,
    },
    createdAt: now,
    updatedAt: now,
    matchCount: 0,
    source: 'seed',
  };
}

/**
 * Seed the global materials database from Excel file
 * FR30: Use batch writes for efficient Firestore operations
 */
export async function seedGlobalMaterials(xlsxPath: string): Promise<void> {
  const rows = parseExcelFile(xlsxPath);
  const now = Date.now();

  console.log(`[SEED] Seeding ${rows.length} materials to globalMaterials collection...`);

  // Firestore batch limit is 500 operations
  const BATCH_SIZE = 500;
  let totalSeeded = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = rows.slice(i, i + BATCH_SIZE);

    for (const row of chunk) {
      if (!row.item_name) {
        console.warn(`[SEED] Skipping row with missing item_name`);
        continue;
      }

      const material = rowToMaterial(row, now);
      const docRef = db.collection('globalMaterials').doc(material.id);
      batch.set(docRef, material);
      totalSeeded++;
    }

    await batch.commit();
    console.log(`[SEED] Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length})`);
  }

  console.log(`[SEED] Successfully seeded ${totalSeeded} materials to globalMaterials collection`);
  console.log(`[SEED] Default zipCode: ${DEFAULT_ZIPCODE}`);
}

/**
 * List all materials in the database (for verification)
 */
export async function listGlobalMaterials(): Promise<void> {
  const snapshot = await db.collection('globalMaterials').get();
  console.log(`[SEED] Global Materials Database contains ${snapshot.size} documents:`);

  snapshot.docs.forEach((doc, index) => {
    const data = doc.data() as GlobalMaterial;
    const lowePrice = data.retailers.lowes?.price || 'N/A';
    const hdPrice = data.retailers.homeDepot?.price || 'N/A';
    console.log(`  ${index + 1}. ${data.name} | Lowes: $${lowePrice} | HD: $${hdPrice} | Aliases: ${data.aliases.length}`);
  });
}

/**
 * Clear all materials (for testing)
 */
export async function clearGlobalMaterials(): Promise<void> {
  const snapshot = await db.collection('globalMaterials').get();

  if (snapshot.empty) {
    console.log('[SEED] Collection is already empty');
    return;
  }

  const BATCH_SIZE = 500;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const doc of chunk) {
      batch.delete(doc.ref);
    }

    await batch.commit();
  }

  console.log(`[SEED] Cleared ${docs.length} documents from globalMaterials collection`);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'list') {
    listGlobalMaterials()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[SEED] Error:', err);
        process.exit(1);
      });
  } else if (command === 'clear') {
    clearGlobalMaterials()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[SEED] Error:', err);
        process.exit(1);
      });
  } else if (command && !command.startsWith('-')) {
    // Assume it's a file path
    const xlsxPath = path.resolve(command);
    seedGlobalMaterials(xlsxPath)
      .then(() => listGlobalMaterials())
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[SEED] Error:', err);
        process.exit(1);
      });
  } else {
    console.log(`
Global Materials Seed Script

Usage (run from functions directory):
  npx ts-node scripts/seedGlobalMaterials.ts <path-to-excel-file>  - Seed from Excel
  npx ts-node scripts/seedGlobalMaterials.ts scripts/material_normalized.xlsx  - Use included Excel
  npx ts-node scripts/seedGlobalMaterials.ts list                  - List all materials
  npx ts-node scripts/seedGlobalMaterials.ts clear                 - Clear all materials

Environment:
  FIRESTORE_EMULATOR_HOST=localhost:8081  - Use Firestore emulator (local testing)
  (no env var)                            - Use production Firestore

Expected Excel columns:
  - item_name
  - description
  - lowes link
  - lowes price
  - home depot link
  - home depot price
  - alias (comma-separated)
`);
    process.exit(0);
  }
}
