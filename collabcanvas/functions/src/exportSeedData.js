const XLSX = require('xlsx');
const fs = require('fs');

const path = '/Users/ankitrijal/Desktop/GauntletAI/truecost/docs/material_normalized.xlsx';
const workbook = XLSX.readFile(path);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 100);
}

function extractId(url) {
  if (!url) return '';
  const match = url.match(/\/(\d+)(?:\?|$)/);
  return match ? match[1] : '';
}

const now = Date.now();
const materials = {};

rows.forEach(row => {
  if (!row.item_name) return;

  const normalizedName = normalize(row.item_name);
  const id = normalizedName + '_78745';
  const aliases = row.alias ? row.alias.split(',').map(a => a.trim().toLowerCase()).filter(Boolean) : [];
  aliases.push(row.item_name.toLowerCase());

  materials[id] = {
    id,
    name: row.item_name,
    normalizedName,
    description: row.description || '',
    aliases: [...new Set(aliases)],
    zipCode: '78745',
    retailers: {
      lowes: row['lowes link'] ? {
        productUrl: row['lowes link'],
        productId: extractId(row['lowes link']),
        price: parseFloat(row['lowes price']) || 0,
        priceUpdatedAt: now
      } : null,
      homeDepot: row['home depot link'] ? {
        productUrl: row['home depot link'],
        productId: extractId(row['home depot link']),
        price: parseFloat(row['home depot price']) || 0,
        priceUpdatedAt: now
      } : null
    },
    createdAt: now,
    updatedAt: now,
    matchCount: 0,
    source: 'seed'
  };
});

// Output summary
console.log('Total materials:', Object.keys(materials).length);
console.log('\nSample (first 3):');
Object.keys(materials).slice(0, 3).forEach(id => {
  const m = materials[id];
  console.log(`  - ${m.name}`);
  console.log(`    HD: $${m.retailers.homeDepot?.price || 'N/A'} | Lowes: $${m.retailers.lowes?.price || 'N/A'}`);
  console.log(`    Aliases: ${m.aliases.slice(0, 3).join(', ')}...`);
});

// Save to JSON for manual import
const outputPath = '/Users/ankitrijal/Desktop/GauntletAI/truecost/docs/globalMaterials_seed.json';
fs.writeFileSync(outputPath, JSON.stringify(materials, null, 2));
console.log('\nExported to:', outputPath);
