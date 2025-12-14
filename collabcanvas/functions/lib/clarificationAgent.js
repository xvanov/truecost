"use strict";
/**
 * Clarification Agent Cloud Function
 * Handles the clarification chat for scope understanding
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clarificationAgent = void 0;
const https_1 = require("firebase-functions/v2/https");
const openai_1 = require("openai");
const dotenv = require("dotenv");
const path = require("path");
// Lazy initialization to avoid timeout during module load
let _openai = null;
let _apiKey = null;
function getApiKey() {
    var _a;
    if (_apiKey === null) {
        const envPath = path.resolve(process.cwd(), '.env');
        const envResult = dotenv.config({ path: envPath, override: true });
        const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV !== 'production';
        const apiKeyFromEnv = (_a = envResult.parsed) === null || _a === void 0 ? void 0 : _a.OPENAI_API_KEY;
        const apiKeyFromProcess = process.env.OPENAI_API_KEY;
        _apiKey = (isEmulator && apiKeyFromEnv) ? apiKeyFromEnv : (apiKeyFromProcess || apiKeyFromEnv || '');
        if (!_apiKey) {
            console.warn('⚠️ OPENAI_API_KEY not found. Clarification agent will not work.');
        }
    }
    return _apiKey;
}
function getOpenAI() {
    if (!_openai) {
        _openai = new openai_1.OpenAI({ apiKey: getApiKey() });
    }
    return _openai;
}
// System prompt for the clarification agent
const CLARIFICATION_SYSTEM_PROMPT = `You are a construction estimation assistant helping to clarify project scope.
Your role is to:
1. Understand the user's project description
2. Ask targeted clarifying questions to fill in MISSING details ONLY
3. Extract structured data from the conversation

CRITICAL RULES:
- DO NOT ask for information that has already been provided in the "ALREADY PROVIDED PROJECT DETAILS" section
- Location and address are THE SAME THING - if you have location, you have the address
- If project type is already provided, DO NOT ask about it again
- If approximate size is already provided, DO NOT ask about square footage again
- Focus ONLY on details that are genuinely missing

Key information to gather (ONLY IF NOT ALREADY PROVIDED):
- Finish level (budget, mid-range, high-end, luxury)
- Special requirements or constraints
- Specific work items (what rooms, what work in each room)
- Material preferences (flooring type, paint colors, fixture styles, etc.)
- Timeline and flexibility
- What's included vs excluded from scope
- Any structural changes needed

Be conversational but efficient. Ask 2-3 questions at a time maximum.
When you have enough information, indicate that clarification is complete.

Format your response as JSON:
{
  "message": "Your conversational response to the user",
  "questions": ["Question 1?", "Question 2?"],
  "extractedData": { ... any data extracted from this exchange ... },
  "clarificationComplete": false,
  "completionReason": null
}

When clarification is complete, set clarificationComplete to true and provide a completionReason.`;
exports.clarificationAgent = (0, https_1.onCall)({
    cors: true,
    // Note: secrets only used in production - emulator uses .env
    secrets: process.env.FUNCTIONS_EMULATOR === 'true' ? [] : ['OPENAI_API_KEY'],
    timeoutSeconds: 60,
}, async (request) => {
    var _a, _b;
    try {
        const data = request.data;
        const { scopeText, conversationHistory, userMessage, projectContext } = data;
        if (!scopeText && !projectContext) {
            throw new https_1.HttpsError('invalid-argument', 'Scope text or project context is required');
        }
        // Build a reminder about already-known information
        let knownInfoReminder = '';
        if (projectContext) {
            const known = [];
            if (projectContext.projectName)
                known.push(`Project Name: ${projectContext.projectName}`);
            if (projectContext.location)
                known.push(`Location/Address: ${projectContext.location} (REMEMBER: location = address, do NOT ask for address)`);
            if (projectContext.projectType)
                known.push(`Project Type: ${projectContext.projectType}`);
            if (projectContext.approximateSize)
                known.push(`Size: ${projectContext.approximateSize}`);
            if (projectContext.useUnionLabor)
                known.push(`Labor: Union rates`);
            if (projectContext.zipCodeOverride)
                known.push(`ZIP: ${projectContext.zipCodeOverride}`);
            if (known.length > 0) {
                knownInfoReminder = `\n\nIMPORTANT - The following information is ALREADY KNOWN and should NOT be asked about:\n${known.join('\n')}\n\nFocus your questions on details NOT listed above.`;
            }
        }
        // Build conversation messages for OpenAI
        const messages = [
            { role: 'system', content: CLARIFICATION_SYSTEM_PROMPT + knownInfoReminder },
            { role: 'user', content: `Initial scope description:\n${scopeText || 'No additional scope details provided.'}` },
        ];
        // Add conversation history
        for (const msg of conversationHistory) {
            messages.push({
                role: msg.role,
                content: msg.content,
            });
        }
        // Add current user message
        if (userMessage) {
            messages.push({ role: 'user', content: userMessage });
        }
        const completion = await getOpenAI().chat.completions.create({
            model: 'gpt-4o',
            messages,
            temperature: 0.7,
            max_tokens: 1000,
            response_format: { type: 'json_object' },
        });
        const responseText = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
        if (!responseText) {
            throw new Error('No response from OpenAI');
        }
        const response = JSON.parse(responseText);
        return Object.assign({ success: true }, response);
    }
    catch (error) {
        console.error('Clarification Agent Error:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        return {
            success: false,
            message: 'I encountered an error. Please try again.',
            questions: [],
            extractedData: {},
            clarificationComplete: false,
            completionReason: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
});
//# sourceMappingURL=clarificationAgent.js.map