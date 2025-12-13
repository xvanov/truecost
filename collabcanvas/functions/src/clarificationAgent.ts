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
2. Ask targeted clarifying questions to fill in missing details
3. Extract structured data from the conversation

Key information to gather:
- Project type (kitchen remodel, bathroom remodel, addition, etc.)
- Location (full address with city, state, zip)
- Square footage and room dimensions
- Finish level (budget, mid-range, high-end, luxury)
- Special requirements or constraints
- Timeline and flexibility
- What's included vs excluded from scope

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

interface ClarificationRequest {
  projectId: string;
  sessionId: string;
  scopeText: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  userMessage: string;
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
    const { scopeText, conversationHistory, userMessage } = data;

    if (!scopeText) {
      throw new HttpsError('invalid-argument', 'Scope text is required');
    }

    // Build conversation messages for OpenAI
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: CLARIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: `Initial scope description:\n${scopeText}` },
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

