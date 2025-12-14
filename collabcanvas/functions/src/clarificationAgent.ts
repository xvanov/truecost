/**
 * Clarification Agent Cloud Function
 * Handles the clarification chat for scope understanding
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Lazy initialization to avoid timeout during module load
let _openai: OpenAI | null = null;
let _apiKey: string | null = null;

function getApiKey(): string {
  if (_apiKey === null) {
    const envPath = path.resolve(process.cwd(), '.env');
    const envResult = dotenv.config({ path: envPath, override: true });

    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV !== 'production';
    const apiKeyFromEnv = envResult.parsed?.OPENAI_API_KEY;
    const apiKeyFromProcess = process.env.OPENAI_API_KEY;
    _apiKey = (isEmulator && apiKeyFromEnv) ? apiKeyFromEnv : (apiKeyFromProcess || apiKeyFromEnv || '');

    if (!_apiKey) {
      console.warn('⚠️ OPENAI_API_KEY not found. Clarification agent will not work.');
    }
  }
  return _apiKey;
}

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: getApiKey() });
  }
  return _openai;
}

// System prompt for the clarification agent
const CLARIFICATION_SYSTEM_PROMPT = `You are a construction estimation assistant helping to clarify project scope.
Your role is to:
1. Understand the user's project description
2. Ask targeted clarifying questions to fill in MISSING details ONLY
3. Extract structured data from the conversation
4. Maintain context across the conversation

IMPORTANT: CONVERSATION CONTEXT
You have access to the full conversation history. The user may be:
1. Starting a new clarification session
2. Answering your previous questions (e.g., "1) budget 2) no 3) yes", "mid-range", etc.)
3. Providing additional details about their project
4. Asking questions about the process

When the user answers your previous questions:
- Parse their response carefully (they might use numbered answers, bullet points, or natural language)
- Acknowledge their answers and extract the data
- Don't repeat questions they've already answered
- Move on to the next set of missing information
- If they say "no" or "none" to something, record that as clarified and don't ask again

CRITICAL RULES:
- DO NOT ask for information that has already been provided in the "ALREADY PROVIDED PROJECT DETAILS" section
- DO NOT ask questions that were already answered in the conversation history
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

HANDLING FOLLOW-UP RESPONSES:
- If user provides numbered answers like "1) budget 2) 3 months", match each to your previous questions
- Acknowledge what you learned: "Got it - you're looking for budget-level finishes with a 3-month timeline."
- Extract data from their answers into extractedData
- Only ask new questions if critical information is still missing

Format your response as JSON:
{
  "message": "Your conversational response - acknowledge their answers if they provided any",
  "questions": ["Only NEW questions, not ones already answered"],
  "extractedData": { "finishLevel": "budget", "timeline": "3 months", ... extracted from this exchange },
  "clarificationComplete": false,
  "completionReason": null
}

When clarification is complete, set clarificationComplete to true and provide a completionReason.`;

// System prompt for general contextual chat
const GENERAL_CHAT_SYSTEM_PROMPT = `You are TrueCost AI, a helpful construction estimation assistant. You have access to the conversation history and can provide contextual responses.

IMPORTANT: CONVERSATION CONTEXT
You have access to the full conversation history. Use it to:
1. Understand what was previously discussed
2. Recognize when users are answering previous questions
3. Maintain continuity in the conversation
4. Not repeat information or questions that were already covered

Your capabilities:
- Clarify project scope and requirements
- Check annotation completeness
- Help with material estimation
- Answer questions about the estimation process
- Guide users through the workflow

When responding:
1. Review the conversation history to understand context
2. If the user is answering a previous question, acknowledge it and continue naturally
3. If they provide numbered answers (e.g., "1) yes 2) no"), match to previous questions
4. Be helpful and provide relevant guidance
5. If you're unsure what the user wants, ask for clarification

HANDLING FOLLOW-UP RESPONSES:
- If the user says "yes", "no", or provides short answers, relate them to the previous assistant message
- Acknowledge their input: "Thanks for clarifying..."
- Continue the conversation naturally based on their response
- Don't show error messages for valid conversational responses

Current workflow steps:
1. Define project scope (description, location, project type)
2. Upload floor plan and set scale
3. Annotate rooms, walls, doors, windows
4. Run annotation check to verify completeness
5. Generate estimate

Available commands users can try:
- "clarify scope" - Start scope clarification
- "annotation check" - Verify annotations
- "proceed to estimate" - Generate estimate
- "generate bom" - Generate Bill of Materials
- "annotate plan" - Auto-detect elements

Format your response as JSON:
{
  "message": "Your conversational response - be helpful and contextual",
  "questions": [],
  "extractedData": {},
  "clarificationComplete": false,
  "completionReason": null
}`;


interface ProjectContext {
  projectName?: string;
  location?: string; // Note: location and address are the same thing
  projectType?: string;
  useUnionLabor?: boolean;
  zipCodeOverride?: string;
  // For general chat mode
  projectId?: string;
  hasAnnotations?: boolean;
  annotationCount?: number;
  layerCount?: number;
  hasScale?: boolean;
  isGeneralChat?: boolean;
}

interface ClarificationRequest {
  projectId: string;
  sessionId: string;
  scopeText: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  userMessage: string;
  projectContext?: ProjectContext; // Optional project context from scope page
}

interface ClarificationResponse {
  message: string;
  questions: string[];
  extractedData: Record<string, unknown>;
  clarificationComplete: boolean;
  completionReason: string | null;
}

export const clarificationAgent = onCall({
  cors: true,
  // Note: secrets only used in production - emulator uses .env
  secrets: process.env.FUNCTIONS_EMULATOR === 'true' ? [] : ['OPENAI_API_KEY'],
  timeoutSeconds: 60,
}, async (request) => {
  try {
    const data = request.data as ClarificationRequest;
    const { scopeText, conversationHistory, userMessage, projectContext } = data;

    // Check if this is general chat mode
    const isGeneralChat = projectContext?.isGeneralChat === true;

    if (!isGeneralChat && !scopeText && !projectContext) {
      throw new HttpsError('invalid-argument', 'Scope text or project context is required');
    }

    // Build a reminder about already-known information
    let knownInfoReminder = '';
    if (projectContext && !isGeneralChat) {
      const known: string[] = [];
      if (projectContext.projectName) known.push(`Project Name: ${projectContext.projectName}`);
      if (projectContext.location) known.push(`Location/Address: ${projectContext.location} (REMEMBER: location = address, do NOT ask for address)`);
      if (projectContext.projectType) known.push(`Project Type: ${projectContext.projectType}`);
      if (projectContext.useUnionLabor) known.push(`Labor: Union rates`);
      if (projectContext.zipCodeOverride) known.push(`ZIP: ${projectContext.zipCodeOverride}`);
      
      if (known.length > 0) {
        knownInfoReminder = `\n\nIMPORTANT - The following information is ALREADY KNOWN and should NOT be asked about:\n${known.join('\n')}\n\nFocus your questions on details NOT listed above.`;
      }
    }

    // Build context for general chat mode
    let generalChatContext = '';
    if (isGeneralChat && projectContext) {
      const contextParts: string[] = [];
      if (projectContext.hasAnnotations) {
        contextParts.push(`Current annotations: ${projectContext.annotationCount} shapes across ${projectContext.layerCount} layers`);
      }
      if (projectContext.hasScale) {
        contextParts.push('Scale: Set');
      } else {
        contextParts.push('Scale: Not set');
      }
      generalChatContext = contextParts.length > 0 
        ? `\n\nCurrent project state:\n${contextParts.join('\n')}`
        : '';
    }

    // Choose system prompt based on mode
    const systemPrompt = isGeneralChat 
      ? GENERAL_CHAT_SYSTEM_PROMPT + generalChatContext
      : CLARIFICATION_SYSTEM_PROMPT + knownInfoReminder;

    // Build conversation messages for OpenAI
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Only add scope description for non-general chat
    if (!isGeneralChat && scopeText) {
      messages.push({ role: 'user', content: `Initial scope description:\n${scopeText}` });
    } else if (!isGeneralChat) {
      messages.push({ role: 'user', content: 'Initial scope description:\nNo additional scope details provided.' });
    }

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

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    const response: ClarificationResponse = JSON.parse(responseText);

    return {
      success: true,
      ...response,
    };
  } catch (error) {
    console.error('Clarification Agent Error:', error);

    if (error instanceof HttpsError) {
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

