import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { OpenAI } from 'openai';
import { z } from 'zod';

// Lazy initialization to avoid timeout during module load
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[AI_COMMAND] OPENAI_API_KEY not configured');
      throw new Error('OPENAI_API_KEY not configured');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// Define command schema using Zod
const CommandSchema = z.object({
  type: z.enum(['CREATE', 'MOVE', 'RESIZE', 'ROTATE', 'DELETE', 'ALIGN', 'EXPORT', 'LAYER', 'COLOR', 'DUPLICATE']),
  action: z.string(),
  parameters: z.object({
    shapeType: z.enum(['rect', 'circle', 'text', 'line']).optional(),
    color: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    radius: z.number().optional(),
    w: z.number().optional(),
    h: z.number().optional(),
    text: z.string().optional(),
    fontSize: z.number().optional(),
    strokeWidth: z.number().optional(),
    points: z.array(z.number()).optional(),
    targetShapes: z.array(z.string()).optional(),
    alignment: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom', 'distribute-horizontal', 'distribute-vertical']).optional(),
    exportFormat: z.enum(['PNG', 'SVG']).optional(),
    exportQuality: z.number().optional(),
    layerName: z.string().optional(),
    layerId: z.string().optional(),
    targetColor: z.string().optional(),
    template: z.string().optional(),
    elementCount: z.number().optional()
  }),
  confidence: z.number().min(0).max(1)
});

async function parseCommandWithOpenAI(commandText: string) {
  // Simple caching for common commands to avoid OpenAI calls
  const commonCommands: Record<string, {
    type: string;
    action: string;
    parameters: Record<string, unknown>;
    confidence: number;
  }> = {
    'create a circle': {
      type: 'CREATE',
      action: 'create_circle',
      parameters: { shapeType: 'circle', x: 100, y: 100, radius: 50, color: '#3B82F6' },
      confidence: 0.95
    },
    'create circle': {
      type: 'CREATE',
      action: 'create_circle', 
      parameters: { shapeType: 'circle', x: 100, y: 100, radius: 50, color: '#3B82F6' },
      confidence: 0.95
    },
    'add a circle': {
      type: 'CREATE',
      action: 'create_circle',
      parameters: { shapeType: 'circle', x: 100, y: 100, radius: 50, color: '#3B82F6' },
      confidence: 0.95
    },
    'add circle': {
      type: 'CREATE',
      action: 'create_circle',
      parameters: { shapeType: 'circle', x: 100, y: 100, radius: 50, color: '#3B82F6' },
      confidence: 0.95
    },
    'add a red circle': {
      type: 'CREATE',
      action: 'create_circle',
      parameters: { shapeType: 'circle', x: 100, y: 100, radius: 50, color: '#EF4444' },
      confidence: 0.95
    },
    'create a red circle': {
      type: 'CREATE',
      action: 'create_circle',
      parameters: { shapeType: 'circle', x: 100, y: 100, radius: 50, color: '#EF4444' },
      confidence: 0.95
    },
    'add red circle': {
      type: 'CREATE',
      action: 'create_circle',
      parameters: { shapeType: 'circle', x: 100, y: 100, radius: 50, color: '#EF4444' },
      confidence: 0.95
    },
    'create a rectangle': {
      type: 'CREATE',
      action: 'create_rectangle',
      parameters: { shapeType: 'rect', x: 100, y: 100, w: 100, h: 100, color: '#3B82F6' },
      confidence: 0.95
    },
    'create rectangle': {
      type: 'CREATE',
      action: 'create_rectangle',
      parameters: { shapeType: 'rect', x: 100, y: 100, w: 100, h: 100, color: '#3B82F6' },
      confidence: 0.95
    },
    'add a rectangle': {
      type: 'CREATE',
      action: 'create_rectangle',
      parameters: { shapeType: 'rect', x: 100, y: 100, w: 100, h: 100, color: '#3B82F6' },
      confidence: 0.95
    },
    'add rectangle': {
      type: 'CREATE',
      action: 'create_rectangle',
      parameters: { shapeType: 'rect', x: 100, y: 100, w: 100, h: 100, color: '#3B82F6' },
      confidence: 0.95
    },
    'add text saying hello': {
      type: 'CREATE',
      action: 'create_text',
      parameters: { shapeType: 'text', x: 100, y: 100, text: 'Hello', fontSize: 16, color: '#3B82F6' },
      confidence: 0.95
    }
  };

  const lowerCommand = commandText.toLowerCase().trim();
  
  // Check cache first
  if (commonCommands[lowerCommand]) {
    console.log('🚀 Using cached command for:', commandText);
    return {
      ...commonCommands[lowerCommand],
      timestamp: Date.now(),
      commandId: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  // For more complex commands, use OpenAI with optimized prompt
  const prompt = `Parse this canvas command into JSON:

Command: "${commandText}"

Examples:
- "create a circle" → {"type":"CREATE","action":"create_circle","parameters":{"shapeType":"circle","x":100,"y":100,"radius":50,"color":"#3B82F6"},"confidence":0.9}
- "add a red circle" → {"type":"CREATE","action":"create_circle","parameters":{"shapeType":"circle","x":100,"y":100,"radius":50,"color":"#EF4444"},"confidence":0.9}
- "add text saying Hello" → {"type":"CREATE","action":"create_text","parameters":{"shapeType":"text","x":100,"y":100,"text":"Hello","fontSize":16,"color":"#3B82F6"},"confidence":0.9}
- "create a red rectangle" → {"type":"CREATE","action":"create_rectangle","parameters":{"shapeType":"rect","x":100,"y":100,"w":100,"h":100,"color":"#EF4444"},"confidence":0.9}

Available types: CREATE, MOVE, DELETE, ALIGN
Available shapes: circle, rect, text, line
Available colors: #3B82F6, #EF4444, #10B981, #F59E0B, #8B5CF6

Return ONLY the JSON, no other text.`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 100, // Reduced from 200
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    const parsed = JSON.parse(responseText);
    
    // Validate against schema
    const validated = CommandSchema.parse(parsed);
    
    console.log('🤖 OpenAI parsed command:', commandText, '→', validated);
    
    return {
      ...validated,
      timestamp: Date.now(),
      commandId: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  } catch (error) {
    console.error('OpenAI parsing error:', error);
    throw new Error(`Failed to parse command: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const aiCommand = onCall({
  cors: true, // Enable CORS for all origins (Firebase Functions v2 handles this automatically)
  secrets: ['OPENAI_API_KEY'], // Grant access to OpenAI API key secret
}, async (request) => {
  try {
    const { commandText, userId } = request.data;
    
    if (!commandText || !userId) {
      throw new HttpsError('invalid-argument', 'Command text and userId are required');
    }

    // Use OpenAI + LangChain for parsing
    const command = await parseCommandWithOpenAI(commandText);
    (command as Record<string, unknown>).userId = userId;

    return {
      success: true,
      message: `Successfully parsed command: ${commandText}`,
      executedCommands: [command],
      createdShapeIds: [],
      modifiedShapeIds: [],
      deletedShapeIds: []
    };

  } catch (error) {
    console.error('AI Command Function Error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    // Handle parsing errors gracefully
    return {
      success: false,
      message: `Could not understand command: ${error instanceof Error ? error.message : String(error)}`,
      executedCommands: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
});