/**
 * ChatPanel - AI Assistant for construction estimation
 * Features: clarification, annotation check, material estimation, canvas commands
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { ChatMessage } from './ChatMessage';
import { useCanvasStore } from '../../store/canvasStore';
import { useScopeStore } from '../../store/scopeStore';
import { useEstimationStore } from '../../store/estimationStore';
import { useProjectStore } from '../../store/projectStore';
import type { EstimateConfig } from '../../pages/project/ScopePage';
import { useAuth } from '../../hooks/useAuth';
import { processDialogueRequest } from '../../services/aiDialogueService';
import { MaterialAIService } from '../../services/materialAIService';
import {
  validatePreflight,
  generatePreflightPrompt,
  generateClarifyingQuestions,
  type PreflightCheck,
} from '../../services/preflightService';
import { AIService } from '../../services/aiService';
import { saveBOM } from '../../services/bomService';
import { saveCPM } from '../../services/cpmService';
import { formatErrorForDisplay } from '../../utils/errorHandler';
import { invokeAnnotationEndpoint } from '../../services/sagemakerService';
import { useScopedCanvasStore } from '../../store/projectCanvasStore';
import { useShapes } from '../../hooks/useShapes';
import { useLayers } from '../../hooks/useLayers';
import { createBoundingBoxShape } from '../../services/shapeService';
import { functions } from '../../services/firebase';
import {
  saveChatMessage,
  subscribeToChatMessages,
  deleteChatMessage,
} from '../../services/chatService';
import { loadScopeConfig } from '../../services/scopeConfigService';

interface ChatPanelProps {
  onClarificationComplete?: (complete: boolean) => void;
  projectId?: string;
  estimateConfig?: EstimateConfig;
  navigateToEstimate?: string;
}

type Message = {
  id: string;
  role: 'agent' | 'user';
  content: string;
  timestamp: Date;
  metadata?: {
    createdShapes?: number;
    modifiedShapes?: number;
    deletedShapes?: number;
    calculation?: {
      materials: Array<{ name: string; quantity: number; unit: string }>;
    };
  };
};

/**
 * ChatPanel - Glass chat UI with AI assistant for estimation.
 * Supports: clarification, annotation check, material estimation, canvas commands
 */
export function ChatPanel({ 
  onClarificationComplete, 
  projectId: propProjectId,
  estimateConfig: propEstimateConfig,
  navigateToEstimate,
}: ChatPanelProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: routeProjectId, id: routeId } = useParams<{ projectId?: string; id?: string }>();
  const projectId = propProjectId || routeProjectId || routeId;
  const { user } = useAuth();

  // Get estimate config from props first, then fall back to location state, then Firestore
  const locationState = location.state as { estimateConfig?: EstimateConfig } | null;
  const initialEstimateConfig = propEstimateConfig || locationState?.estimateConfig;
  
  // State for estimate config - load from Firestore if not provided via props/location
  const [estimateConfig, setEstimateConfig] = useState<EstimateConfig | undefined>(initialEstimateConfig);
  
  // Load estimate config from Firestore if not available
  useEffect(() => {
    if (!initialEstimateConfig && projectId) {
      loadScopeConfig(projectId).then((config) => {
        if (config) {
          setEstimateConfig(config);
        }
      }).catch((err) => {
        console.error('ChatPanel: Failed to load scope config:', err);
      });
    }
  }, [projectId, initialEstimateConfig]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [annotationCheckComplete, setAnnotationCheckComplete] = useState(false);
  const [annotationCheckConversation, setAnnotationCheckConversation] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [showProceedAnywayButton, setShowProceedAnywayButton] = useState(false);

  // Scope clarification state
  const [clarificationConversation, setClarificationConversation] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [clarificationExtractedData, setClarificationExtractedData] = useState<Record<string, unknown>>({});
  const [clarificationComplete, setClarificationComplete] = useState(false);
  const [clarificationStarted, setClarificationStarted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get estimation session for scope text
  const { session: estimationSession, loadSession: loadEstimationSession } = useEstimationStore();

  // Get project data for scope text fallback (description field)
  const loadProject = useProjectStore((state) => state.loadProject);
  const currentProject = useProjectStore((state) => state.currentProject);
  const [projectDescription, setProjectDescription] = useState<string>('');

  // Load estimation session for scope text
  useEffect(() => {
    if (projectId) {
      loadEstimationSession(projectId);
    }
  }, [projectId, loadEstimationSession]);

  // Track if we've loaded initial messages to prevent overwriting
  const initialLoadRef = useRef(false);

  // Subscribe to chat messages from Firestore
  useEffect(() => {
    if (!projectId || !user?.uid) return;

    initialLoadRef.current = false;

    const unsubscribe = subscribeToChatMessages(projectId, user.uid, (loadedMessages) => {
      // Only update if we have messages and haven't loaded yet, or if remote has more messages
      if (loadedMessages.length > 0) {
        setMessages((currentMessages) => {
          // Merge: keep local messages that aren't in remote, add remote messages
          const remoteIds = new Set(loadedMessages.map((m) => m.id));
          const localOnlyMessages = currentMessages.filter((m) => !remoteIds.has(m.id));
          return [...loadedMessages, ...localOnlyMessages].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        });
      }
      initialLoadRef.current = true;
    });

    return () => {
      unsubscribe();
    };
  }, [projectId, user?.uid]);

  // Load project data to get description as scope text fallback
  useEffect(() => {
    if (projectId) {
      loadProject(projectId).then((project) => {
        if (project?.description) {
          setProjectDescription(project.description);
        }
      }).catch((err) => {
        console.error('Failed to load project for scope text:', err);
      });
    }
  }, [projectId, loadProject]);

  // Also update from currentProject if it changes
  useEffect(() => {
    if (currentProject?.id === projectId && currentProject?.description) {
      setProjectDescription(currentProject.description);
    }
  }, [currentProject, projectId]);

  // Use refs to ensure single instance per component mount
  const materialAIRef = useRef<MaterialAIService | null>(null);
  const aiServiceRef = useRef<AIService | null>(null);

  if (!materialAIRef.current) {
    materialAIRef.current = new MaterialAIService();
  }
  if (!aiServiceRef.current) {
    aiServiceRef.current = new AIService();
  }

  const materialAI = materialAIRef.current;
  const aiService = aiServiceRef.current;

  // Normalize projectId
  const normalizedProjectId: string | undefined = projectId || undefined;

  // Use project-scoped store
  const projectLayers = useScopedCanvasStore(normalizedProjectId, (state) => state.layers);
  const projectShapes = useScopedCanvasStore(normalizedProjectId, (state) => state.shapes);
  const projectScaleLine = useScopedCanvasStore(normalizedProjectId, (state) => state.canvasScale?.scaleLine);
  const projectBackgroundImage = useScopedCanvasStore(normalizedProjectId, (state) => state.canvasScale?.backgroundImage);

  // Fallback to global store
  const globalLayers = useCanvasStore((state) => state.layers);
  const globalShapes = useCanvasStore((state) => state.shapes);
  const globalScaleLine = useCanvasStore((state) => state.canvasScale?.scaleLine);
  const globalBackgroundImage = useCanvasStore((state) => state.canvasScale?.backgroundImage);

  // Use project-scoped data if available
  const layers = projectLayers.length > 0 ? projectLayers : globalLayers;
  const shapes = projectShapes.size > 0 ? projectShapes : globalShapes;
  const scaleLine = projectScaleLine || globalScaleLine;
  const backgroundImage = projectBackgroundImage || globalBackgroundImage;

  // Get shape and layer hooks
  const { createShape } = useShapes(normalizedProjectId);
  const { layers: hookLayers, createLayer: hookCreateLayer, updateLayer: hookUpdateLayer } = useLayers(normalizedProjectId);

  // Scope state for pre-flight validation
  const scope = useScopeStore((state) => state.scope);

  // Material Estimation state
  const dialogue = useCanvasStore((state) => state.materialDialogue);
  const startDialogue = useCanvasStore((state) => state.startMaterialDialogue);
  const updateDialogue = useCanvasStore((state) => state.updateMaterialDialogue);
  const addCalculation = useCanvasStore((state) => state.addMaterialCalculation);
  const setBillOfMaterials = useCanvasStore((state) => state.setBillOfMaterials);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load scope for pre-flight validation
  useEffect(() => {
    if (!projectId) return;
    const { loadScope, subscribe } = useScopeStore.getState();
    loadScope(projectId).catch(console.error);
    subscribe(projectId);
    return () => {
      const { unsubscribe } = useScopeStore.getState();
      if (unsubscribe) unsubscribe();
    };
  }, [projectId]);

  // Calculate scale factor
  const scaleFactor = scaleLine
    ? scaleLine.realWorldLength / Math.sqrt(Math.pow(scaleLine.endX - scaleLine.startX, 2) + Math.pow(scaleLine.endY - scaleLine.startY, 2))
    : 1;

  // Helper to add message (also persists to Firestore)
  const addMessage = useCallback((role: 'agent' | 'user', content: string, metadata?: Message['metadata']) => {
    const msg: Message = {
      id: `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
      metadata,
    };
    setMessages((prev) => [...prev, msg]);
    
    // Persist to Firestore
    if (projectId && user?.uid) {
      saveChatMessage(projectId, user.uid, msg).catch((err) => {
        console.error('Failed to save chat message:', err);
      });
    }
    
    return msg.id;
  }, [projectId, user?.uid]);

  // Helper to remove message by id (also deletes from Firestore)
  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    
    // Delete from Firestore
    if (projectId && user?.uid) {
      deleteChatMessage(projectId, user.uid, id).catch((err) => {
        console.error('Failed to delete chat message:', err);
      });
    }
  }, [projectId, user?.uid]);

  // Command detection
  const detectProceedToEstimateCommand = (query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    const keywords = ['proceed to estimate', 'go to estimate', 'start estimate', 'ready to estimate', 'generate estimate', 'create estimate', 'proceed anyway', 'continue to estimate', 'move to estimate', 'am i ready', 'ready for estimate', "let's estimate", 'begin estimate'];
    return keywords.some((kw) => lowerQuery.includes(kw));
  };

  const detectAnnotationCheckCommand = (query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    const keywords = ['annotation check', 'check annotation', 'check annotations', 'verify annotations', 'are my annotations complete', 'annotation verification', 'check my work', "what's missing", 'what am i missing', 'check if complete'];
    return keywords.some((kw) => lowerQuery.includes(kw));
  };

  const detectScopeClarificationCommand = (query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    const keywords = ['clarify scope', 'clarify project', 'clarify my project', 'ask questions', 'ask clarifying questions', 'clarification questions', 'need more details', 'what questions', 'help me define', 'scope questions', 'project details', 'tell me more', 'start clarification'];
    return keywords.some((kw) => lowerQuery.includes(kw));
  };

  const detectBOMCPMGeneration = (query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    const keywords = ['generate bom', 'create bom', 'generate bill of materials', 'generate critical path', 'generate bom and critical path', 'generate bom and cpm', 'create bill of materials', 'generate materials list'];
    return keywords.some((kw) => lowerQuery.includes(kw));
  };

  const detectAnnotationCommand = (query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    const keywords = ['annotate plan', 'automatically annotate', 'detect windows', 'detect doors', 'auto annotate', 'automatic annotation', 'detect fixtures', 'find windows and doors', 'identify windows', 'identify doors'];
    return keywords.some((kw) => lowerQuery.includes(kw));
  };

  const detectMaterialQuery = (query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    const keywords = ['material', 'bom', 'estimate', 'calculate', 'framing', 'drywall', 'paint', 'stud', 'epoxy', 'tile', 'carpet', 'flooring', 'lumber', 'metal', 'wall', 'floor', 'door', 'doors', 'window', 'windows', 'hardware', 'hinges', 'lockset', 'flashing', 'caulk', 'sealant', 'change', 'add', 'remove', 'switch', 'use', 'height', 'insulation', 'frp', 'panel', 'spacing', 'how many', 'count', 'find', 'identify', 'analyze plan', 'look at', 'in the plan', 'trim for'];
    return keywords.some((kw) => lowerQuery.includes(kw));
  };

  const needsVisionAnalysis = (query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    const keywords = ['how many doors', 'how many windows', 'count doors', 'count windows', 'find doors', 'find windows', 'in the plan', 'from the plan', 'based on plan', 'based on the plan', 'from the image', 'analyze plan', 'look at plan', 'identify rooms', 'see in the plan', 'number of doors', 'number of windows', 'doors in', 'windows in'];
    return keywords.some((kw) => lowerQuery.includes(kw));
  };

  // Navigate to estimate
  const handleNavigateToEstimate = useCallback(() => {
    if (projectId) {
      const targetPath = navigateToEstimate || `/project/${projectId}/estimate`;
      navigate(targetPath, { state: { estimateConfig } });
    }
  }, [projectId, navigate, estimateConfig, navigateToEstimate]);

  // Handle annotation check
  const handleAnnotationCheck = async (userMessage: string) => {
    if (!projectId || !user) {
      addMessage('agent', '❌ Error: Project ID or user not available');
      return;
    }

    const baseScopeText = estimateConfig?.scopeText || estimationSession?.scopeText || projectDescription || '';
    let comprehensiveScopeText = baseScopeText;
    if (Object.keys(clarificationExtractedData).length > 0) {
      comprehensiveScopeText += '\n\n--- Clarification Details ---\n';
      comprehensiveScopeText += JSON.stringify(clarificationExtractedData, null, 2);
    }

    if (!comprehensiveScopeText.trim()) {
      addMessage('agent', "❌ No project scope found. Please use 'clarify scope' first to define your project details, or go back to the Plan page to enter your project scope.");
      return;
    }

    const loadingId = addMessage('agent', '🔍 Checking annotations against project scope...');

    try {
      const annotations = Array.from(shapes.values());
      const annotatedShapes = annotations.map((shape) => ({
        id: shape.id, type: shape.type, label: shape.itemType, itemType: shape.itemType, points: shape.points, x: shape.x, y: shape.y, w: shape.w, h: shape.h, layerId: shape.layerId, confidence: shape.confidence ?? 1.0, source: (shape.source || 'manual') as 'ai' | 'manual',
      }));
      const annotatedLayers = layers.map((layer) => ({
        id: layer.id, name: layer.name, visible: layer.visible ?? true, shapeCount: annotations.filter((s) => s.layerId === layer.id).length,
      }));
      const annotationSnapshot = {
        shapes: annotatedShapes, layers: annotatedLayers,
        scale: scaleLine && scaleLine.realWorldLength > 0 ? {
          pixelsPerUnit: Math.sqrt(Math.pow(scaleLine.endX - scaleLine.startX, 2) + Math.pow(scaleLine.endY - scaleLine.startY, 2)) / scaleLine.realWorldLength,
          unit: scaleLine.unit as 'feet' | 'inches' | 'meters',
        } : undefined,
      };

      const annotationCheckAgentFn = httpsCallable<unknown, { success: boolean; message: string; isComplete: boolean; missingAnnotations: string[]; clarificationQuestions: string[]; annotationSummary: { hasScale: boolean; wallCount: number; roomCount: number; doorCount: number; windowCount: number; totalWallLength: number; totalFloorArea: number } }>(functions, 'annotationCheckAgent');

      const result = await annotationCheckAgentFn({
        projectId, scopeText: comprehensiveScopeText, annotationSnapshot, conversationHistory: annotationCheckConversation,
        userMessage: userMessage.includes('annotation check') ? undefined : userMessage,
      });

      removeMessage(loadingId);
      const response = result.data;
      let messageContent = response.message;
      const summary = response.annotationSummary;
      messageContent += '\n\n**Current Annotations:**\n';
      messageContent += `• Scale: ${summary.hasScale ? '✅ Set' : '❌ Not set'}\n`;
      messageContent += `• Walls: ${summary.wallCount}${summary.hasScale ? ` (${summary.totalWallLength.toFixed(1)} linear units)` : ''}\n`;
      messageContent += `• Rooms: ${summary.roomCount}${summary.hasScale ? ` (${summary.totalFloorArea.toFixed(1)} sq units)` : ''}\n`;
      messageContent += `• Doors: ${summary.doorCount}\n`;
      messageContent += `• Windows: ${summary.windowCount}`;

      if (response.clarificationQuestions && response.clarificationQuestions.length > 0) {
        messageContent += '\n\n**Questions:**\n';
        response.clarificationQuestions.forEach((q, i) => { messageContent += `${i + 1}. ${q}\n`; });
      }

      setAnnotationCheckConversation((prev) => [...prev, { role: 'user', content: userMessage }, { role: 'assistant', content: response.message }]);

      if (response.isComplete) {
        setAnnotationCheckComplete(true);
        onClarificationComplete?.(true);
        messageContent += '\n\n✅ **All required annotations are complete!**';
      }

      addMessage('agent', messageContent);
    } catch (error) {
      removeMessage(loadingId);
      const errorInfo = formatErrorForDisplay(error);
      addMessage('agent', `❌ **Annotation Check Error**\n\n${errorInfo.title}: ${errorInfo.message}`);
    }
  };

  // Handle proceed to estimate
  const handleProceedToEstimate = async () => {
    if (!projectId) {
      addMessage('agent', '❌ Error: Project ID not available');
      return;
    }

    const baseScopeText = estimateConfig?.scopeText || estimationSession?.scopeText || projectDescription || '';
    let comprehensiveScopeText = baseScopeText;
    if (Object.keys(clarificationExtractedData).length > 0) {
      comprehensiveScopeText += '\n\n--- Clarification Details ---\n';
      comprehensiveScopeText += JSON.stringify(clarificationExtractedData, null, 2);
    }

    const loadingId = addMessage('agent', '🔍 Checking if you\'re ready to estimate...');

    try {
      const annotations = Array.from(shapes.values());
      const annotatedShapes = annotations.map((shape) => ({
        id: shape.id, type: shape.type, label: shape.itemType, itemType: shape.itemType, points: shape.points, x: shape.x, y: shape.y, w: shape.w, h: shape.h, layerId: shape.layerId, confidence: shape.confidence ?? 1.0, source: (shape.source || 'manual') as 'ai' | 'manual',
      }));
      const annotationSnapshot = {
        shapes: annotatedShapes, layers: layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible ?? true, shapeCount: annotations.filter((s) => s.layerId === l.id).length })),
        scale: scaleLine && scaleLine.realWorldLength > 0 ? {
          pixelsPerUnit: Math.sqrt(Math.pow(scaleLine.endX - scaleLine.startX, 2) + Math.pow(scaleLine.endY - scaleLine.startY, 2)) / scaleLine.realWorldLength,
          unit: scaleLine.unit as 'feet' | 'inches' | 'meters',
        } : undefined,
      };

      const hasScale = annotationSnapshot.scale && annotationSnapshot.scale.pixelsPerUnit > 0;
      const wallCount = annotatedShapes.filter((s) => s.type === 'polyline').length;
      const roomCount = annotatedShapes.filter((s) => s.type === 'polygon').length;

      let statusMessage = '**📋 Estimation Readiness Check**\n\n';
      statusMessage += '**Current Annotations:**\n';
      statusMessage += `• Scale: ${hasScale ? '✅ Set' : '⚠️ Not set (recommended)'}\n`;
      statusMessage += `• Walls: ${wallCount} wall segments\n`;
      statusMessage += `• Rooms: ${roomCount} room areas\n`;
      statusMessage += `• Total shapes: ${annotatedShapes.length}\n\n`;

      const suggestions: string[] = [];
      if (!hasScale) suggestions.push('Set a scale line for accurate measurements');
      if (wallCount === 0 && roomCount === 0) suggestions.push('Add wall or room annotations for material calculations');
      if (!comprehensiveScopeText.trim()) suggestions.push("Use 'clarify scope' to provide project details");

      if (suggestions.length > 0) {
        statusMessage += '**⚠️ Suggestions (optional):**\n';
        suggestions.forEach((s, i) => { statusMessage += `${i + 1}. ${s}\n`; });
        statusMessage += '\n';
      }

      statusMessage += '---\n\n';
      statusMessage += suggestions.length > 0
        ? 'You can still proceed with the estimate. The AI will work with the available information.\n\n**Click the button below to continue:**'
        : "✅ Looks good! You're ready to generate an estimate.\n\n**Click the button below to continue:**";

      removeMessage(loadingId);
      addMessage('agent', statusMessage);
      setShowProceedAnywayButton(true);
    } catch (error) {
      removeMessage(loadingId);
      const errorInfo = formatErrorForDisplay(error);
      addMessage('agent', `❌ **Error checking readiness**\n\n${errorInfo.message}\n\nYou can still try to proceed to the estimate.`);
      setShowProceedAnywayButton(true);
    }
  };

  // Handle scope clarification
  const handleScopeClarification = async (userMessage: string, isInitial: boolean = false) => {
    if (!projectId) {
      addMessage('agent', '❌ Error: Project ID not available');
      return;
    }

    // Build comprehensive project context from scope page
    const fullAddress = estimateConfig?.address 
      ? `${estimateConfig.address.streetAddress}, ${estimateConfig.address.city}, ${estimateConfig.address.state} ${estimateConfig.address.zipCode}`
      : '';
    const projectContext = {
      projectName: estimateConfig?.projectName || '',
      address: estimateConfig?.address?.formattedAddress || fullAddress,
      city: estimateConfig?.address?.city || '',
      state: estimateConfig?.address?.state || '',
      zipCode: estimateConfig?.address?.zipCode || '',
      projectType: estimateConfig?.projectType || '',
      useUnionLabor: estimateConfig?.useUnionLabor || false,
    };

    // Build scope text that includes project context
    let comprehensiveScopeText = '';
    
    // Add known project details that should NOT be asked again
    const knownDetails: string[] = [];
    if (projectContext.projectName) knownDetails.push(`Project Name: ${projectContext.projectName}`);
    if (projectContext.address) knownDetails.push(`Address: ${projectContext.address}`);
    if (projectContext.projectType) knownDetails.push(`Project Type: ${projectContext.projectType}`);
    if (projectContext.useUnionLabor) knownDetails.push(`Labor Type: Union Labor`);
    
    if (knownDetails.length > 0) {
      comprehensiveScopeText += '--- ALREADY PROVIDED PROJECT DETAILS (DO NOT ASK AGAIN) ---\n';
      comprehensiveScopeText += knownDetails.join('\n');
      comprehensiveScopeText += '\n\n';
    }
    
    // Add scope definition text (with projectDescription as fallback)
    const scopeText = estimateConfig?.scopeText || estimationSession?.scopeText || projectDescription || '';
    if (scopeText) {
      comprehensiveScopeText += '--- SCOPE DEFINITION ---\n';
      comprehensiveScopeText += scopeText;
    }

    if (!comprehensiveScopeText.trim() && !clarificationStarted) {
      addMessage('agent', 'ℹ️ No project scope text found. Please provide a project description first, then I can ask clarifying questions to help refine your estimate.');
      return;
    }

    if (!clarificationStarted) setClarificationStarted(true);

    if (isInitial) {
      addMessage('agent', "🔍 Starting scope clarification. I'll ask some questions to better understand your project...");
    }

    try {
      const clarificationAgentFn = httpsCallable<unknown, { success: boolean; message: string; questions: string[]; extractedData: Record<string, unknown>; clarificationComplete: boolean; completionReason: string | null; error?: string }>(functions, 'clarificationAgent');

      const result = await clarificationAgentFn({
        projectId, 
        sessionId: projectId, 
        scopeText: comprehensiveScopeText, 
        conversationHistory: clarificationConversation, 
        userMessage: isInitial ? '' : userMessage,
        projectContext, // Pass the project context separately too
      });

      const response = result.data;
      if (!response.success && response.error) throw new Error(response.error);

      const newExtractedData = { ...clarificationExtractedData, ...response.extractedData };
      setClarificationExtractedData(newExtractedData);

      if (!isInitial && userMessage) {
        setClarificationConversation((prev) => [...prev, { role: 'user', content: userMessage }]);
      }

      let assistantContent = response.message;
      if (response.questions && response.questions.length > 0) {
        assistantContent += '\n\n' + response.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
      }

      setClarificationConversation((prev) => [...prev, { role: 'assistant', content: assistantContent }]);
      addMessage('agent', assistantContent);

      if (response.clarificationComplete) {
        setClarificationComplete(true);
        addMessage('agent', `✅ **Scope Clarification Complete!**\n\n${response.completionReason || 'I have all the information I need.'}\n\n📋 **Extracted Information:**\n${Object.entries(newExtractedData).map(([key, value]) => `• ${key}: ${JSON.stringify(value)}`).join('\n')}\n\nYou can now use "annotation check" to verify your annotations, or continue adding annotations to the canvas.`);
      }
    } catch (error) {
      console.error('Clarification error:', error);
      const errorInfo = formatErrorForDisplay(error);
      addMessage('agent', `❌ **Clarification Error**\n\n${errorInfo.title}: ${errorInfo.message}`);
    }
  };

  // Handle BOM/CPM generation
  const handleBOMCPMGeneration = async () => {
    if (!projectId || !user) {
      addMessage('agent', '❌ Error: Project ID or user not available');
      return;
    }

    const validationResult = validatePreflight({ scaleLine: scaleLine || undefined, layers, shapes, scope });
    addMessage('agent', generatePreflightChecklistUI(validationResult.checks));

    if (!validationResult.canGenerate) {
      addMessage('agent', generatePreflightPrompt(validationResult));
      const questions = generateClarifyingQuestions(validationResult);
      if (questions.length > 0) {
        addMessage('agent', '**Clarifying Questions:**\n\n' + questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
      }
      return;
    }

    const annotations = Array.from(shapes.values());

    try {
      const result = await aiService.generateBOMAndCPM(
        { projectId, userId: user.uid, annotations, scope: scope || undefined, scaleFactor, autoFetchPrices: true, onPriceProgress: () => {} },
        { projectId, userId: user.uid, scope: scope || undefined, annotations },
        () => {}
      );

      if (result.bothSucceeded) {
        if (result.bom.bom) { await saveBOM(projectId, result.bom.bom, user.uid); setBillOfMaterials(result.bom.bom); }
        if (result.cpm.cpm) { await saveCPM(projectId, result.cpm.cpm, user.uid); }
        addMessage('agent', '✅ BOM and Critical Path generated successfully!\n\n- BOM is available in Money view\n- Critical Path is available in Time view');
      } else if (result.partialSuccess) {
        let message = '⚠️ Partial generation completed:\n\n';
        if (result.bom.success && result.bom.bom) { await saveBOM(projectId, result.bom.bom, user.uid); setBillOfMaterials(result.bom.bom); message += '✅ BOM generated successfully\n'; }
        else { message += `❌ BOM generation failed: ${result.bom.error || 'Unknown error'}\n`; }
        if (result.cpm.success && result.cpm.cpm) { await saveCPM(projectId, result.cpm.cpm, user.uid); message += '✅ Critical Path generated successfully\n'; }
        else { message += `❌ Critical Path generation failed: ${result.cpm.error || 'Unknown error'}\n`; }
        message += '\nYou can retry the failed generation separately.';
        addMessage('agent', message);
      } else {
        const errorInfoBOM = formatErrorForDisplay(result.bom.error);
        const errorInfoCPM = formatErrorForDisplay(result.cpm.error);
        addMessage('agent', `❌ Generation failed:\n\n**BOM Generation:**\n${errorInfoBOM.title}: ${errorInfoBOM.message}\n\n**Critical Path Generation:**\n${errorInfoCPM.title}: ${errorInfoCPM.message}`);
      }
    } catch (error) {
      const errorInfo = formatErrorForDisplay(error);
      addMessage('agent', `❌ Error during generation:\n\n**${errorInfo.title}**\n${errorInfo.message}`);
    }
  };

  const generatePreflightChecklistUI = (checks: PreflightCheck[]): string => {
    let message = '**Pre-flight Checklist:**\n\n';
    checks.forEach((check) => {
      const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
      const category = check.category === 'required' ? '[Required]' : '[Recommended]';
      message += `${icon} ${category} ${check.label}: ${check.message}\n`;
    });
    return message;
  };

  // Image to base64
  const imageUrlToBase64 = async (imageUrl: string): Promise<string> => {
    const { ref, getBytes } = await import('firebase/storage');
    const { storage } = await import('../../services/firebase');
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);
    if (!pathMatch) {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => { const base64String = reader.result as string; resolve(base64String.split(',')[1] || base64String); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    const storagePath = decodeURIComponent(pathMatch[1]);
    const storageRef = ref(storage, storagePath);
    const bytes = await getBytes(storageRef);
    const uint8Array = new Uint8Array(bytes);
    const chunkSize = 8192;
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk) as number[]);
    }
    return btoa(binaryString);
  };

  // Handle annotation command
  const handleAnnotationCommand = async () => {
    if (!projectId || !user) { addMessage('agent', '❌ Error: Project ID or user not available'); return; }
    if (!backgroundImage?.url) { addMessage('agent', '❌ No plan image found. Please upload a plan image first before requesting automatic annotation.'); return; }

    const loadingId = addMessage('agent', '⏳ Processing plan image and invoking AI annotation endpoint... This may take 30-60 seconds.');

    try {
      const imageBase64 = await imageUrlToBase64(backgroundImage.url);
      const detections = await invokeAnnotationEndpoint(imageBase64, projectId);
      removeMessage(loadingId);

      if (detections.length === 0) { addMessage('agent', 'ℹ️ No items were detected in the plan image.'); return; }

      const detectionsByType = new Map<string, typeof detections>();
      for (const detection of detections) {
        const itemType = detection.name_hint.toLowerCase();
        if (!detectionsByType.has(itemType)) detectionsByType.set(itemType, []);
        detectionsByType.get(itemType)!.push(detection);
      }

      const formatLayerName = (itemType: string): string => {
        const capitalized = itemType.charAt(0).toUpperCase() + itemType.slice(1);
        return itemType.endsWith('s') ? capitalized : `${capitalized}s`;
      };

      const getColorForItemType = (itemType: string): string => {
        const colors: Record<string, string> = { door: '#EF4444', window: '#3B82F6', sink: '#10B981', stove: '#F59E0B', toilet: '#8B5CF6' };
        return colors[itemType.toLowerCase()] || '#10B981';
      };

      const layerMap = new Map<string, { id: string; name: string; color: string }>();
      let createdCount = 0;

      for (const [itemType, typeDetections] of detectionsByType) {
        const layerName = formatLayerName(itemType);
        const itemLayer = hookLayers.find((l) => l.name === layerName);
        let layerId: string;
        let layerColor: string;

        if (!itemLayer) {
          try {
            layerId = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            layerColor = getColorForItemType(itemType);
            await hookCreateLayer(layerName, layerId);
            await new Promise((resolve) => setTimeout(resolve, 300));
            try { await hookUpdateLayer(layerId, { color: layerColor, visible: true, locked: false, order: hookLayers.length + layerMap.size }); } catch { /* Layer update failure is non-critical, continue with defaults */ }
            layerMap.set(itemType, { id: layerId, name: layerName, color: layerColor });
          } catch {
            const defaultLayer = hookLayers.find((l) => l.id === 'default-layer') || hookLayers[0];
            if (!defaultLayer) throw new Error(`Failed to create ${layerName} layer`);
            layerId = defaultLayer.id;
            layerColor = defaultLayer.color || getColorForItemType(itemType);
            layerMap.set(itemType, { id: layerId, name: defaultLayer.name, color: layerColor });
          }
        } else {
          layerId = itemLayer.id;
          layerColor = itemLayer.color || getColorForItemType(itemType);
          layerMap.set(itemType, { id: layerId, name: itemLayer.name, color: layerColor });
        }

        const layerInfo = layerMap.get(itemType)!;
        for (const detection of typeDetections) {
          const [xMin, yMin, xMax, yMax] = detection.bbox;
          const shape = createBoundingBoxShape(xMin, yMin, xMax - xMin, yMax - yMin, detection.name_hint, layerInfo.color, user.uid, layerInfo.id, 'ai', detection.confidence, true);
          if (shape.layerId !== layerInfo.id) shape.layerId = layerInfo.id;
          await createShape(shape);
          createdCount++;
        }
      }

      const layerNames = Array.from(layerMap.values()).map((l) => l.name);
      const layerSummary = layerNames.length > 0 ? `\n\nCreated layers: ${layerNames.join(', ')}` : '';
      addMessage('agent', `✅ Successfully created ${createdCount} AI annotation${createdCount !== 1 ? 's' : ''}${layerSummary}.\n\nDetected items: ${detections.map((d) => `${d.name_hint} (${(d.confidence * 100).toFixed(0)}%)`).join(', ')}`);
    } catch (error) {
      removeMessage(loadingId);
      const errorInfo = formatErrorForDisplay(error);
      addMessage('agent', `❌ **Annotation Error**\n\n${errorInfo.title}: ${errorInfo.message}`);
    }
  };

  // Handle vision query
  const handleVisionQuery = async (messageText: string) => {
    const loadingId = addMessage('agent', '👁️ Analyzing the plan image... This may take 10-15 seconds.');

    try {
      const visionResult = await materialAI.analyzePlanImage(messageText, backgroundImage!.url);
      removeMessage(loadingId);
      if (!visionResult) throw new Error('No response from Vision AI');
      addMessage('agent', visionResult.answer || 'Analysis complete');

      const materialImpact = visionResult.materialImpact || {};
      if (materialImpact.doors || materialImpact.windows) {
        addMessage('agent', `Would you like me to calculate trim materials for ${materialImpact.doors || 0} doors and ${materialImpact.windows || 0} windows?`);
        startDialogue(`Calculate trim for ${materialImpact.doors} doors and ${materialImpact.windows} windows`);
      }
    } catch (error) {
      removeMessage(loadingId);
      addMessage('agent', `Vision analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Simple keyword parser
  const parseSimpleKeywords = (text: string): Record<string, unknown> => {
    const lower = text.toLowerCase();
    const specs: Record<string, unknown> = {};
    if (lower.includes('epoxy')) specs.type = 'epoxy';
    else if (lower.includes('tile')) specs.type = 'tile';
    else if (lower.includes('carpet')) specs.type = 'carpet';
    else if (lower.includes('hardwood')) specs.type = 'hardwood';
    if (lower.includes('lumber') || lower.includes('wood')) { const spacing = lower.includes('24') ? 24 : 16; specs.framing = { type: 'lumber', spacing }; }
    else if (lower.includes('metal') || lower.includes('steel')) { const spacing = lower.includes('24') ? 24 : 16; specs.framing = { type: 'metal', spacing }; }
    if (lower.includes('drywall')) { const thickness = lower.includes('5/8') ? '5/8"' : '1/2"'; specs.surface = { type: 'drywall', thickness }; }
    else if (lower.includes('frp') || lower.includes('panel')) { const thickness = lower.includes('120') ? '0.120"' : '0.090"'; specs.surface = { type: 'frp', thickness }; }
    const heightMatch = lower.match(/(\d+)\s*(ft|feet|foot|')/);
    if (heightMatch) specs.height = parseInt(heightMatch[1]);
    if (lower.includes('r-19') || lower.includes('r19')) specs.insulation = { type: 'batt', rValue: 19 };
    else if (lower.includes('r-15') || lower.includes('r15')) specs.insulation = { type: 'batt', rValue: 15 };
    else if (lower.includes('r-13') || lower.includes('r13')) specs.insulation = { type: 'batt', rValue: 13 };
    else if (lower.includes('spray foam')) specs.insulation = { type: 'spray-foam', rValue: 21 };
    else if (lower.includes('no insulation')) specs.insulation = { type: 'none' };
    const doorMatch = lower.match(/(\d+)\s*door/);
    const windowMatch = lower.match(/(\d+)\s*window/);
    if (doorMatch) specs.doors = parseInt(doorMatch[1]);
    if (windowMatch) specs.windows = parseInt(windowMatch[1]);
    return specs;
  };

  // Handle material estimation
  const handleMaterialEstimation = async (messageText: string) => {
    if (!dialogue) {
      startDialogue(messageText);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const currentDialogue = useCanvasStore.getState().materialDialogue;
      if (currentDialogue && currentDialogue.currentRequest) {
        const aiSpecs = parseSimpleKeywords(messageText);
        if (Object.keys(aiSpecs).length > 0) {
          updateDialogue({ currentRequest: { ...currentDialogue.currentRequest, specifications: { ...currentDialogue.currentRequest.specifications, ...aiSpecs } } });
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    }

    const currentDialogue = useCanvasStore.getState().materialDialogue;
    if (!currentDialogue) throw new Error('Failed to create dialogue');

    const response = await processDialogueRequest(currentDialogue, layers, shapes, scaleFactor);
    addMessage('agent', response.message, { calculation: response.calculation });

    if (currentDialogue) {
      updateDialogue({ stage: response.type === 'estimate' ? 'complete' : response.type === 'clarification' ? 'gathering' : currentDialogue.stage, lastCalculation: response.calculation || currentDialogue.lastCalculation });
    }
    if (response.calculation) addCalculation(response.calculation);
  };

  // Main send handler
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setIsProcessing(true);
    addMessage('user', messageText);

    try {
      if (detectProceedToEstimateCommand(messageText)) { await handleProceedToEstimate(); return; }
      if (detectAnnotationCheckCommand(messageText)) { await handleAnnotationCheck(messageText); return; }
      if (clarificationStarted && !clarificationComplete) { await handleScopeClarification(messageText, false); return; }
      if (detectScopeClarificationCommand(messageText)) { await handleScopeClarification(messageText, true); return; }
      if (detectBOMCPMGeneration(messageText)) { await handleBOMCPMGeneration(); return; }
      if (detectAnnotationCommand(messageText)) { await handleAnnotationCommand(); return; }
      if (needsVisionAnalysis(messageText) && backgroundImage?.url) { await handleVisionQuery(messageText); return; }

      const hasActiveDialogue = dialogue && dialogue.stage !== 'complete';
      const hasCompletedDialogue = dialogue && dialogue.stage === 'complete';
      const isMaterialQuery = detectMaterialQuery(messageText);
      const isRefinement = hasCompletedDialogue && isMaterialQuery;
      const shouldUseMaterialEstimation = hasActiveDialogue || isRefinement || isMaterialQuery;

      if (shouldUseMaterialEstimation) {
        await handleMaterialEstimation(messageText);
      } else {
        // No matching command found
        addMessage('agent', `I didn't recognize that command. Try one of these:\n\n• **"clarify scope"** - Define project details\n• **"annotation check"** - Verify your annotations\n• **"proceed to estimate"** - Continue to estimation\n• **"generate bom"** - Generate Bill of Materials\n• **"annotate plan"** - Auto-detect elements\n• Or ask about materials (e.g., "how much drywall do I need?")`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      addMessage('agent', `Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Generate Estimate Button - shown when annotation check is complete */}
      {annotationCheckComplete && (
        <div className="px-4 py-3 bg-green-500/10 border-b border-green-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-green-400">Ready to generate estimate</span>
            </div>
            <button onClick={handleNavigateToEstimate} className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
              Generate Estimate →
            </button>
          </div>
        </div>
      )}

      {/* Proceed to Estimate Button */}
      {showProceedAnywayButton && !annotationCheckComplete && (
        <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-blue-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="text-sm font-medium text-blue-400">Continue to estimation</span>
            </div>
            <button onClick={() => { setShowProceedAnywayButton(false); handleNavigateToEstimate(); }} className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              Proceed to Estimate →
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-3 border-b border-truecost-glass-border">
        <h3 className="font-heading text-sm font-semibold text-truecost-text-primary">Project Assistant</h3>
        <p className="text-xs text-truecost-text-secondary">Clarify details for accurate estimates</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-truecost-text-secondary mb-4">AI Assistant Ready</p>
            <div className="space-y-2 text-left">
              <div className="glass-panel p-2 bg-amber-500/10 border-amber-500/30">
                <p className="text-xs font-semibold text-amber-400">💬 Clarify Scope</p>
                <p className="text-xs text-truecost-text-secondary">"clarify scope"</p>
              </div>
              <div className="glass-panel p-2 bg-green-500/10 border-green-500/30">
                <p className="text-xs font-semibold text-green-400">✓ Annotation Check</p>
                <p className="text-xs text-truecost-text-secondary">"annotation check"</p>
              </div>
              <div className="glass-panel p-2 bg-blue-500/10 border-blue-500/30">
                <p className="text-xs font-semibold text-blue-400">🚀 Proceed to Estimate</p>
                <p className="text-xs text-truecost-text-secondary">"proceed to estimate"</p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} role={message.role} content={message.content} timestamp={message.timestamp} />
          ))
        )}
        {isProcessing && (
          <div className="flex justify-start mb-4">
            <div className="glass-panel p-4 rounded-2xl bg-truecost-cyan/10 border-truecost-cyan/30">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-truecost-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-truecost-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-truecost-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-truecost-glass-border p-4 bg-truecost-bg-primary/80 backdrop-blur-md">
        <form onSubmit={handleSend} className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question or provide details..."
            disabled={isProcessing}
            className="glass-input flex-1"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isProcessing}
            className="btn-pill-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
