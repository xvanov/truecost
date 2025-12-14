"use strict";
/**
 * Global Materials Database Operations
 * FR7-FR36: CRUD, search, LLM validation, and auto-population
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractProductId = exports.incrementMatchCount = exports.saveToGlobalMaterials = exports.validateGlobalMatch = exports.selectBestGlobalMatch = exports.findInGlobalMaterials = exports.generateMaterialId = exports.normalizeProductName = exports.GLOBAL_MATCH_CONFIDENCE_THRESHOLD = exports.DEFAULT_ZIPCODE = void 0;
const firestore_1 = require("firebase-admin/firestore");
const openai_1 = require("openai");
const globalMaterials_1 = require("./types/globalMaterials");
Object.defineProperty(exports, "DEFAULT_ZIPCODE", { enumerable: true, get: function () { return globalMaterials_1.DEFAULT_ZIPCODE; } });
Object.defineProperty(exports, "GLOBAL_MATCH_CONFIDENCE_THRESHOLD", { enumerable: true, get: function () { return globalMaterials_1.GLOBAL_MATCH_CONFIDENCE_THRESHOLD; } });
// ============ NORMALIZATION (FR31-FR33) ============
/**
 * Normalize a product name into a URL-safe key
 * FR31: System normalizes product names to URL-safe keys
 */
function normalizeProductName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except hyphens
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Collapse multiple hyphens
        .trim()
        .substring(0, 100); // Max length for Firestore doc ID
}
exports.normalizeProductName = normalizeProductName;
/**
 * Generate document ID from name and zipCode
 * FR6, FR32: Document IDs follow format {normalizedName}_{zipCode}
 */
function generateMaterialId(name, zipCode) {
    return `${normalizeProductName(name)}_${zipCode}`;
}
exports.generateMaterialId = generateMaterialId;
// ============ SEARCH (FR7-FR10) ============
/**
 * Search global materials database
 * FR7-FR10: Query by zipCode and aliases array-contains
 * Returns candidates matching the search query for the given zipCode
 */
async function findInGlobalMaterials(db, searchQuery, zipCode) {
    const effectiveZipCode = zipCode || globalMaterials_1.DEFAULT_ZIPCODE;
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 1);
    console.log(`[GLOBAL_MATERIALS] ========== SEARCH START ==========`);
    console.log(`[GLOBAL_MATERIALS] Search query: "${searchQuery}"`);
    console.log(`[GLOBAL_MATERIALS] Query words: ${JSON.stringify(queryWords)}`);
    console.log(`[GLOBAL_MATERIALS] ZipCode: ${effectiveZipCode}`);
    try {
        // Step 1: Try exact alias match first (fast path)
        const exactSnapshot = await db.collection('globalMaterials')
            .where('zipCode', '==', effectiveZipCode)
            .where('aliases', 'array-contains', normalizedQuery)
            .limit(5)
            .get();
        if (!exactSnapshot.empty) {
            const candidates = exactSnapshot.docs.map(doc => doc.data());
            console.log(`[GLOBAL_MATERIALS] EXACT MATCH found: ${candidates.length} candidate(s)`);
            return candidates;
        }
        console.log(`[GLOBAL_MATERIALS] No exact alias match, trying fuzzy search...`);
        // Step 2: Fuzzy search - check if any query word matches an alias
        // Try each significant word from the query
        for (const word of queryWords) {
            if (word.length < 2)
                continue;
            const wordSnapshot = await db.collection('globalMaterials')
                .where('zipCode', '==', effectiveZipCode)
                .where('aliases', 'array-contains', word)
                .limit(10)
                .get();
            if (!wordSnapshot.empty) {
                const candidates = wordSnapshot.docs.map(doc => doc.data());
                console.log(`[GLOBAL_MATERIALS] FUZZY MATCH on word "${word}": ${candidates.length} candidate(s)`);
                // Return candidates that have the most word overlap
                return candidates;
            }
        }
        // Step 3: If still no match, get all materials for zipCode and let LLM pick
        console.log(`[GLOBAL_MATERIALS] No word match, fetching all for zipCode...`);
        const allSnapshot = await db.collection('globalMaterials')
            .where('zipCode', '==', effectiveZipCode)
            .limit(50)
            .get();
        if (!allSnapshot.empty) {
            const allMaterials = allSnapshot.docs.map(doc => doc.data());
            console.log(`[GLOBAL_MATERIALS] Returning ${allMaterials.length} materials for LLM selection`);
            return allMaterials;
        }
        console.log(`[GLOBAL_MATERIALS] NO MATERIALS found for zipCode ${effectiveZipCode}`);
        console.log(`[GLOBAL_MATERIALS] ========== SEARCH END ==========`);
        return [];
    }
    catch (error) {
        console.error(`[GLOBAL_MATERIALS] Search error:`, error);
        return [];
    }
}
exports.findInGlobalMaterials = findInGlobalMaterials;
// ============ LLM VALIDATION (FR11-FR15) ============
/**
 * Use LLM to select the best matching material from multiple candidates
 * Returns the best candidate with confidence score
 */
async function selectBestGlobalMatch(searchQuery, candidates) {
    var _a, _b;
    if (candidates.length === 0) {
        return { candidate: null, confidence: 0, reasoning: 'No candidates' };
    }
    if (candidates.length === 1) {
        const validation = await validateGlobalMatch(searchQuery, candidates[0]);
        return { candidate: candidates[0], confidence: validation.confidence, reasoning: validation.reasoning };
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn('[GLOBAL_MATERIALS] OPENAI_API_KEY not configured - returning first candidate');
        return { candidate: candidates[0], confidence: 0.5, reasoning: 'OpenAI not configured' };
    }
    const openai = new openai_1.default({ apiKey });
    // Create a summary of candidates for LLM
    const candidateSummary = candidates.slice(0, 20).map((c, i) => `${i}: "${c.name}" (aliases: ${c.aliases.slice(0, 3).join(', ')})`).join('\n');
    console.log(`[GLOBAL_MATERIALS] LLM selecting from ${candidates.length} candidates for "${searchQuery}"`);
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                    role: 'user',
                    content: `Which product BEST matches the search query "${searchQuery}"?

Available Products:
${candidateSummary}

Select the BEST match. Consider:
1. Same product type/category
2. Compatible specifications
3. What someone searching for "${searchQuery}" would want

Return ONLY JSON: { "index": number (0-${Math.min(candidates.length - 1, 19)}), "confidence": number (0-1), "reasoning": "brief" }
If NO good match, return: { "index": -1, "confidence": 0, "reasoning": "no match" }`
                }],
            temperature: 0.1,
        });
        const content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '{}';
        console.log(`[GLOBAL_MATERIALS] LLM selection response: ${content.substring(0, 200)}`);
        const cleaned = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const index = typeof parsed.index === 'number' ? parsed.index : -1;
        const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
        const reasoning = parsed.reasoning || 'No reasoning';
        if (index >= 0 && index < candidates.length) {
            console.log(`[GLOBAL_MATERIALS] Selected candidate ${index}: "${candidates[index].name}" (confidence: ${confidence})`);
            return { candidate: candidates[index], confidence, reasoning };
        }
        return { candidate: null, confidence: 0, reasoning };
    }
    catch (err) {
        console.error('[GLOBAL_MATERIALS] LLM selection error:', err);
        // Fallback: use word overlap to pick best candidate
        let bestCandidate = candidates[0];
        let bestOverlap = 0;
        for (const c of candidates) {
            const overlap = calculateWordOverlap(searchQuery, c);
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                bestCandidate = c;
            }
        }
        const confidence = Math.min(bestOverlap + 0.3, 0.95);
        console.log(`[GLOBAL_MATERIALS] LLM failed - word overlap selected "${bestCandidate.name}" (${bestOverlap.toFixed(2)} -> ${confidence.toFixed(2)})`);
        return { candidate: bestCandidate, confidence, reasoning: `Word overlap fallback (${(bestOverlap * 100).toFixed(0)}% match)` };
    }
}
exports.selectBestGlobalMatch = selectBestGlobalMatch;
/**
 * Use LLM to validate if a global material matches the search query
 * FR11-FR13: Validates cache matches using LLM confidence scoring
 */
/**
 * Simple word overlap scoring for fallback matching
 */
function calculateWordOverlap(query, candidate) {
    const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    const candidateWords = new Set([
        ...candidate.name.toLowerCase().split(/\s+/),
        ...candidate.aliases.flatMap(a => a.toLowerCase().split(/\s+/))
    ].filter(w => w.length > 1));
    let matches = 0;
    for (const word of queryWords) {
        if (candidateWords.has(word))
            matches++;
    }
    return queryWords.size > 0 ? matches / queryWords.size : 0;
}
async function validateGlobalMatch(searchQuery, candidate) {
    var _a, _b;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        // Fallback: use word overlap scoring
        const overlap = calculateWordOverlap(searchQuery, candidate);
        const confidence = Math.min(overlap + 0.3, 0.95); // Boost overlap score
        console.log(`[GLOBAL_MATERIALS] No API key - word overlap: ${overlap.toFixed(2)} -> confidence: ${confidence.toFixed(2)}`);
        return { confidence, reasoning: `Word overlap fallback (${(overlap * 100).toFixed(0)}% match)` };
    }
    const openai = new openai_1.default({ apiKey });
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                    role: 'user',
                    content: `Is this product a good match for the search query?

Search Query: "${searchQuery}"

Product from Database:
- Name: ${candidate.name}
- Description: ${candidate.description}
- Aliases: ${candidate.aliases.join(', ')}

Consider:
1. Is this the same type of product?
2. Would someone searching for "${searchQuery}" want this product?
3. Are the specifications compatible?

Return ONLY JSON: { "confidence": number (0-1), "reasoning": "brief explanation" }`
                }],
            temperature: 0.1,
        });
        const content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '{}';
        console.log(`[GLOBAL_MATERIALS] LLM validation response: ${content.substring(0, 150)}...`);
        // Parse response
        const cleaned = content
            .replace(/```json\n?/gi, '')
            .replace(/```\n?/g, '')
            .trim();
        try {
            const parsed = JSON.parse(cleaned);
            return {
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
                reasoning: parsed.reasoning || 'No reasoning provided',
            };
        }
        catch (_c) {
            console.warn('[GLOBAL_MATERIALS] JSON parse failed for LLM response');
            return { confidence: 0.5, reasoning: 'JSON parse failed - using moderate confidence' };
        }
    }
    catch (err) {
        console.error('[GLOBAL_MATERIALS] OpenAI error:', err);
        // Fallback to word overlap when OpenAI fails
        const overlap = calculateWordOverlap(searchQuery, candidate);
        const confidence = Math.min(overlap + 0.3, 0.95);
        console.log(`[GLOBAL_MATERIALS] OpenAI failed - using word overlap: ${overlap.toFixed(2)} -> confidence: ${confidence.toFixed(2)}`);
        return { confidence, reasoning: `Word overlap fallback (${(overlap * 100).toFixed(0)}% match)` };
    }
}
exports.validateGlobalMatch = validateGlobalMatch;
// ============ AUTO-POPULATION (FR23-FR26) ============
/**
 * Save a new material or update existing after successful API scrape
 * FR23-FR26: Auto-population with upsert logic
 */
async function saveToGlobalMaterials(db, material, searchQuery) {
    const id = generateMaterialId(material.name, material.zipCode);
    const docRef = db.collection('globalMaterials').doc(id);
    console.log(`[GLOBAL_MATERIALS] Saving material: ${id}`);
    try {
        const existingDoc = await docRef.get();
        const now = Date.now();
        if (existingDoc.exists) {
            // FR25: Update existing - merge aliases, update retailers
            const existing = existingDoc.data();
            const updatedAliases = Array.from(new Set([
                ...existing.aliases,
                searchQuery.toLowerCase().trim()
            ]));
            // Merge retailer data
            const mergedRetailers = Object.assign(Object.assign({}, existing.retailers), material.retailers);
            await docRef.update({
                aliases: updatedAliases,
                retailers: mergedRetailers,
                updatedAt: now,
                matchCount: (existing.matchCount || 0) + 1,
            });
            console.log(`[GLOBAL_MATERIALS] Updated existing material: ${id} (matchCount: ${(existing.matchCount || 0) + 1})`);
        }
        else {
            // Create new document
            const newMaterial = {
                id,
                name: material.name,
                normalizedName: material.normalizedName,
                description: material.description,
                aliases: [...new Set([...material.aliases, searchQuery.toLowerCase().trim()])],
                zipCode: material.zipCode,
                retailers: material.retailers,
                createdAt: now,
                updatedAt: now,
                matchCount: 1,
                source: material.source,
            };
            await docRef.set(newMaterial);
            console.log(`[GLOBAL_MATERIALS] Created new material: ${id}`);
        }
    }
    catch (err) {
        console.error(`[GLOBAL_MATERIALS] Save error for ${id}:`, err);
        // Don't throw - cache failures shouldn't break the comparison
    }
}
exports.saveToGlobalMaterials = saveToGlobalMaterials;
/**
 * Increment match count for cache hits (fire-and-forget)
 * FR18: System increments matchCount on cache hits
 */
function incrementMatchCount(db, materialId) {
    db.collection('globalMaterials').doc(materialId).update({
        matchCount: firestore_1.FieldValue.increment(1),
        updatedAt: Date.now(),
    }).catch((err) => {
        console.warn(`[GLOBAL_MATERIALS] Failed to increment matchCount for ${materialId}:`, err);
    });
}
exports.incrementMatchCount = incrementMatchCount;
// ============ UTILITY FUNCTIONS ============
/**
 * Extract product ID from retailer URL
 * Used by seed script and auto-population
 */
function extractProductId(url, retailer) {
    if (!url)
        return '';
    if (retailer === 'lowes') {
        // https://www.lowes.com/pd/.../.../5014027045 -> 5014027045
        const match = url.match(/\/(\d+)(?:\?|$)/);
        return match ? match[1] : '';
    }
    else {
        // https://www.homedepot.com/p/.../206970948 -> 206970948
        const match = url.match(/\/(\d+)(?:\?|$)/);
        return match ? match[1] : '';
    }
}
exports.extractProductId = extractProductId;
//# sourceMappingURL=globalMaterials.js.map