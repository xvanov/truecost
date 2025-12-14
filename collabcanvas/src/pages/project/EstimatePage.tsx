/**
 * EstimatePage - Two-phase estimate generation and results view
 * Story: 6-2 - Estimate Page with Two-Phase UI, Tabs & Dual PDF Export
 *
 * Phase 1: Generate Estimate
 * - Shows "Generate Estimate" button if no estimate exists
 * - Progress bar showing pipeline stage during generation
 * - Real-time updates via Firestore subscription
 *
 * Phase 2: Results View
 * - Six tabs: Summary, Materials, Labor, Time, Price Comparison, Estimate vs Actual
 * - Dual PDF export buttons (Contractor/Client)
 * - Raw JSON viewer
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { AuthenticatedLayout } from "../../components/layouts/AuthenticatedLayout";
import { EstimateStepper } from "../../components/estimate/EstimateStepper";
import { MoneyView } from "../../components/money/MoneyView";
import { ComparisonView } from "../../components/money/ComparisonView";
import { TimeView } from "../../components/time/TimeView";
import { PriceComparisonPanel } from "../../components/estimate/PriceComparisonPanel";
import { PipelineDebugPanel } from "../../components/estimate/PipelineDebugPanel";
import { RiskAnalysisView } from "../../components/estimate/RiskAnalysisView";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";
import { useAuth } from "../../hooks/useAuth";
import { useStepCompletion } from "../../hooks/useStepCompletion";
import { getBOM } from "../../services/bomService";
import { loadScopeConfig } from "../../services/scopeConfigService";
import { functions, firestore } from "../../services/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getProjectCanvasStoreApi } from "../../store/projectCanvasStore";
import {
  subscribeToPipelineProgress,
  triggerEstimatePipeline,
  type PipelineProgress,
  type ClarificationOutputPayload,
  INITIAL_PROGRESS,
  PIPELINE_STAGES,
  getPipelineStatus,
} from "../../services/pipelineService";
import {
  exportEstimateAsPDF,
  type BOMExportView,
} from "../../services/exportService";
import type { EstimateConfig } from "./ScopePage";
import type {
  CSIDivision,
  AnnotationSnapshot,
  AnnotatedShape,
  AnnotatedLayer,
} from "../../types/estimation";
import type { BillOfMaterials } from "../../types/material";

type EstimatePhase = "generate" | "results";
type ResultTab =
  | "summary"
  | "materials"
  | "labor"
  | "time"
  | "riskAnalysis"
  | "priceComparison"
  | "estimateVsActual";

/**
 * Tab configuration for the results view
 */
const RESULT_TABS: { id: ResultTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "materials", label: "Materials" },
  { id: "labor", label: "Labor" },
  { id: "time", label: "Time" },
  { id: "riskAnalysis", label: "Risk Analysis" },
  { id: "priceComparison", label: "Price Comparison" },
  { id: "estimateVsActual", label: "Estimate vs Actual" },
];

const getEstimateStorageKey = (projectId: string) =>
  `truecost:lastEstimateId:${projectId}`;

// Map frontend project types to schema-valid values
const mapProjectType = (
  frontendType: string | undefined,
  projectName?: string
): string => {
  // First, try to infer from projectName
  if (projectName) {
    const nameLower = projectName.toLowerCase();
    console.log(
      "[mapProjectType] Checking projectName:",
      projectName,
      "nameLower:",
      nameLower
    );
    if (nameLower.includes("bathroom")) {
      console.log("[mapProjectType] Matched bathroom -> bathroom_remodel");
      return "bathroom_remodel";
    }
    if (nameLower.includes("kitchen")) return "kitchen_remodel";
    if (nameLower.includes("bedroom")) return "bedroom_remodel";
    if (nameLower.includes("living")) return "living_room_remodel";
    if (nameLower.includes("basement")) return "basement_finish";
    if (nameLower.includes("attic")) return "attic_conversion";
    if (nameLower.includes("deck") || nameLower.includes("patio"))
      return "deck_patio";
    if (nameLower.includes("garage")) return "garage";
    if (nameLower.includes("addition")) return "addition";
  } else {
    console.log("[mapProjectType] No projectName provided, using fallback");
  }

  // Fallback to generic category mapping
  const typeMap: Record<string, string> = {
    "residential-new": "addition",
    "residential-addition": "addition",
    "residential-remodel": "whole_house_remodel",
    "commercial-new": "other",
    "commercial-renovation": "other",
    other: "other",
  };
  console.log(
    "[mapProjectType] Fallback result:",
    typeMap[frontendType || ""] || "other"
  );
  return typeMap[frontendType || ""] || "other";
};

/**
 * Transform deep pipeline estimate data to BillOfMaterials format
 * This allows the results view to display data from the estimates collection
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const transformEstimateToBOM = (
  estimateData: any,
  estimateId: string
): BillOfMaterials | null => {
  const finalOutput = estimateData.finalOutput;
  const costOutput = estimateData.costOutput;
  const scopeOutput = estimateData.scopeOutput;

  console.log("[transformEstimateToBOM] Raw data:", {
    hasFinalOutput: !!finalOutput,
    hasCostOutput: !!costOutput,
    hasScopeOutput: !!scopeOutput,
    costOutputKeys: costOutput ? Object.keys(costOutput) : [],
    hasDivisions: !!costOutput?.divisions,
    divisionsCount: costOutput?.divisions?.length || 0,
  });

  // Need at least some output data
  if (!finalOutput && !costOutput && !scopeOutput) {
    console.warn("[transformEstimateToBOM] No output data found in estimate");
    return null;
  }

  // Extract materials from costOutput.divisions (the correct backend path!)
  const materials: MaterialSpec[] = [];

  // costOutput.divisions contains the detailed line items from Cost Agent
  const divisions = costOutput?.divisions || [];

  divisions.forEach((division: Record<string, unknown>) => {
    const divisionName = (division.divisionName as string) || "General";
    const lineItems = (division.lineItems as Record<string, unknown>[]) || [];

    lineItems.forEach((item: Record<string, unknown>, index: number) => {
      // Backend returns cost ranges as {low, medium, high} objects
      // We use the medium (P50) value for display
      const materialCostRange =
        (item.materialCost as {
          low?: number;
          medium?: number;
          high?: number;
        }) || {};
      const totalCostRange =
        (item.totalCost as { low?: number; medium?: number; high?: number }) ||
        {};
      const unitMaterialCostRange =
        (item.unitMaterialCost as {
          low?: number;
          medium?: number;
          high?: number;
        }) || {};

      const unitCost = unitMaterialCostRange.medium || 0;
      const totalCost = totalCostRange.medium || 0;

      materials.push({
        id:
          (item.lineItemId as string) ||
          `mat-${division.divisionCode}-${index}`,
        name: (item.description as string) || `Item ${index + 1}`,
        category: divisionName,
        quantity: (item.quantity as number) || 1,
        unit: (item.unit as string) || "ea",
        unitCost: unitCost,
        totalCost: totalCost,
        materialCost: materialCostRange.medium || 0,
        source: "deep-pipeline",
        trade: item.primaryTrade as string,
        laborHours: item.laborHours as number,
        laborCost: (item.laborCost as { medium?: number })?.medium || 0,
      });
    });
  });

  console.log(
    "[transformEstimateToBOM] Extracted materials:",
    materials.length
  );

  // Extract cost totals from costOutput.subtotals (the correct backend path!)
  const subtotals = costOutput?.subtotals || {};
  const materialCost =
    subtotals.materials?.medium || finalOutput?.costBreakdown?.materials || 0;
  const laborCost =
    subtotals.labor?.medium || finalOutput?.costBreakdown?.labor || 0;
  const equipmentCost =
    subtotals.equipment?.medium || finalOutput?.costBreakdown?.equipment || 0;
  const totalLaborHours = subtotals.totalLaborHours || 0;

  // Get total from costOutput.total (P50/P80/P90 ranges)
  const totalCostRange = costOutput?.total || {};
  const totalLow =
    totalCostRange.low || finalOutput?.executiveSummary?.totalCost * 0.9 || 0;
  const totalMedium =
    totalCostRange.medium || finalOutput?.executiveSummary?.totalCost || 0;
  const totalHigh = totalCostRange.high || totalMedium * 1.2 || 0;

  const now = Date.now();

  return {
    id: estimateId,
    projectName:
      estimateData.projectName ||
      finalOutput?.executiveSummary?.projectType ||
      "Deep Pipeline Estimate",
    calculations: [],
    totalMaterials: materials,
    createdAt: estimateData.createdAt || now,
    createdBy: estimateData.userId || "deep-pipeline",
    updatedAt: estimateData.updatedAt || now,
    notes: `Generated by Deep Agent Pipeline. Cost range: $${totalLow.toLocaleString()} - $${totalHigh.toLocaleString()}`,
    margin: {
      materialCost,
      laborCost,
      subtotal: materialCost + laborCost + equipmentCost,
      marginPercentage: costOutput?.adjustments?.profitPercentage || 10,
      marginDollars:
        costOutput?.adjustments?.profit?.medium ||
        (materialCost + laborCost) * 0.1,
      marginTimeSlack: finalOutput?.timeline?.totalDays || 30,
      total: totalMedium,
      calculatedAt: now,
    },
    // Store the original deep pipeline data for reference
    deepPipelineData: {
      estimateId,
      finalOutput,
      costOutput,
      scopeOutput,
      riskOutput: estimateData.riskOutput,
      timelineOutput: estimateData.timelineOutput,
      locationOutput: estimateData.locationOutput,
      // Store labor summary for LaborView
      laborAnalysis: {
        totalHours: totalLaborHours,
        byTrade: divisions.map((d: Record<string, unknown>) => ({
          trade: d.divisionName,
          hours: d.laborHoursSubtotal || 0,
          cost: (d.laborSubtotal as { medium?: number })?.medium || 0,
        })),
      },
    },
  } as BillOfMaterials & { deepPipelineData: unknown };
};

// Type for MaterialSpec used in transform (extended for deep pipeline data)
interface MaterialSpec {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  materialCost: number;
  source: string;
  trade?: string;
  laborHours?: number;
  laborCost?: number;
}

export function EstimatePage() {
  console.log("Functions URL:", import.meta.env.VITE_FIREBASE_FUNCTIONS_URL);
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Get estimate config from location state
  const locationState = location.state as {
    estimateConfig?: EstimateConfig;
  } | null;
  const locationEstimateConfig = locationState?.estimateConfig;

  // Default start date: 2 weeks from today
  const defaultStartDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split("T")[0];
  }, []);

  // Default estimate config
  const defaultEstimateConfig: EstimateConfig = useMemo(
    () => ({
      // Project details (defaults for when navigating directly to this page)
      projectName: "",
      projectType: "",
      useUnionLabor: false,
      // Scope
      scopeText: "",
      // Estimate configuration
      overheadPercent: 10,
      profitPercent: 10,
      contingencyPercent: 5,
      wasteFactorPercent: 10,
      startDate: defaultStartDate,
    }),
    [defaultStartDate]
  );

  // State for estimate config - prefer location state, then Firestore, then defaults
  const [estimateConfig, setEstimateConfig] = useState<EstimateConfig>(
    locationEstimateConfig || defaultEstimateConfig
  );

  // Load estimate config from Firestore if not in location state
  useEffect(() => {
    if (!locationEstimateConfig && projectId) {
      loadScopeConfig(projectId)
        .then((config) => {
          if (config) {
            setEstimateConfig(config);
          }
        })
        .catch((err) => {
          console.error("EstimatePage: Failed to load scope config:", err);
        });
    }
  }, [projectId, locationEstimateConfig]);

  // Phase state
  const [phase, setPhase] = useState<EstimatePhase>("generate");
  const [activeTab, setActiveTab] = useState<ResultTab>("summary");

  // Pipeline progress state
  const [progress, setProgress] = useState<PipelineProgress>(INITIAL_PROGRESS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PDF generation state
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfType, setPdfType] = useState<"contractor" | "client" | null>(null);

  // Debug panel state
  const [showDebug, setShowDebug] = useState(false);

  // JSON generation state (for TS estimation pipeline)
  const [isGeneratingJSON, setIsGeneratingJSON] = useState(false);
  const [showJSONViewer, setShowJSONViewer] = useState(false);
  const [jsonOutput, setJsonOutput] = useState<Record<string, unknown> | null>(null);

  // Clarification JSON payload shared between Generate JSON + pipeline trigger
  const [clarificationPayload, setClarificationPayload] =
    useState<ClarificationOutputPayload | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);

  // BOM state from store
  const billOfMaterials = useCanvasStore((state) => state.billOfMaterials);
  const setBillOfMaterials = useCanvasStore(
    (state) => state.setBillOfMaterials
  );

  const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(
    new Set()
  );

  // Unified summary data - pulls from clarificationPayload (active generation) or
  // billOfMaterials.deepPipelineData (loaded from previously generated estimate)
  const summaryData = useMemo(() => {
    // First priority: clarificationPayload from active generation flow
    if (clarificationPayload) {
      return {
        source: "clarificationPayload" as const,
        csiScope: clarificationPayload.csiScope,
        projectBrief: clarificationPayload.projectBrief,
        flags: clarificationPayload.flags,
        // Include raw payload for JSON viewer
        rawPayload: clarificationPayload,
      };
    }

    // Second priority: deep pipeline data from loaded BOM
    const deepData = (
      billOfMaterials as BillOfMaterials & {
        deepPipelineData?: {
          finalOutput?: Record<string, unknown>;
          costOutput?: Record<string, unknown>;
          scopeOutput?: Record<string, unknown>;
          riskOutput?: Record<string, unknown>;
          timelineOutput?: Record<string, unknown>;
          locationOutput?: Record<string, unknown>;
          laborAnalysis?: {
            totalHours: number;
            byTrade: Array<{ trade: string; hours: number; cost: number }>;
          };
        };
      }
    )?.deepPipelineData;

    if (
      deepData?.finalOutput ||
      deepData?.costOutput ||
      deepData?.scopeOutput
    ) {
      const execSummary = deepData.finalOutput?.executiveSummary as
        | Record<string, unknown>
        | undefined;
      const costBreakdown = deepData.finalOutput?.costBreakdown as
        | Record<string, unknown>
        | undefined;
      const timeline = deepData.finalOutput?.timeline as
        | Record<string, unknown>
        | undefined;
      const riskSummary = deepData.finalOutput?.riskSummary as
        | Record<string, unknown>
        | undefined;
      const scopeDivisions = (deepData.scopeOutput as Record<string, unknown>)
        ?.divisions as Array<Record<string, unknown>> | undefined;
      const costDivisions = (deepData.costOutput as Record<string, unknown>)
        ?.divisions as Array<Record<string, unknown>> | undefined;

      // Transform scope divisions to CSI format for display
      const csiScope: Record<string, CSIDivision> = {};
      const divisionsToUse = costDivisions || scopeDivisions || [];
      divisionsToUse.forEach((div, index) => {
        const code =
          (div.divisionCode as string) || String(index).padStart(2, "0");
        const lineItems =
          (div.lineItems as Array<Record<string, unknown>>) || [];
        csiScope[code] = {
          code,
          name: (div.divisionName as string) || "Unknown Division",
          status: "included",
          description: (div.description as string) || "",
          items: lineItems.map((item, itemIndex) => ({
            id: (item.lineItemId as string) || `${code}-${itemIndex}`,
            item:
              (item.description as string) ||
              (item.item as string) ||
              `Item ${itemIndex + 1}`,
            quantity: (item.quantity as number) || 0,
            unit: ((item.unit as string) ||
              "ea") as import("../../types/estimation").CSIUnit,
            confidence: (item.confidence as number) || 0.8,
            source:
              "cad_extraction" as import("../../types/estimation").LineItemSource,
          })),
        };
      });

      return {
        source: "deepPipelineData" as const,
        csiScope,
        projectBrief: {
          projectType: execSummary?.projectType || "Unknown",
          scopeSummary: {
            totalCost: execSummary?.totalCost || 0,
            costPerSqft: execSummary?.costPerSqft || 0,
            duration: execSummary?.duration || execSummary?.durationWeeks || 0,
            startDate: execSummary?.startDate || timeline?.startDate,
            endDate: execSummary?.endDate || timeline?.endDate,
          },
          location: execSummary?.location,
        },
        costBreakdown: {
          materials: costBreakdown?.materials || 0,
          labor: costBreakdown?.labor || 0,
          equipment: costBreakdown?.equipment || 0,
          overhead: costBreakdown?.overhead || 0,
          profit: costBreakdown?.profit || 0,
          contingency: costBreakdown?.contingency || 0,
          total:
            costBreakdown?.totalWithContingency || execSummary?.totalCost || 0,
        },
        timeline: {
          totalDays: timeline?.totalDays || 0,
          totalWeeks: timeline?.totalWeeks || 0,
          startDate: timeline?.startDate,
          endDate: timeline?.endDate,
          milestones: timeline?.milestones || [],
        },
        riskSummary: {
          riskLevel: riskSummary?.riskLevel || "medium",
          topRisks: riskSummary?.topRisks || [],
          contingencyRationale: riskSummary?.contingencyRationale,
        },
        laborAnalysis: deepData.laborAnalysis,
        flags: { lowConfidenceItems: [] },
        // Include raw deep pipeline data for JSON viewer
        rawPayload: deepData,
      };
    }

    return null;
  }, [clarificationPayload, billOfMaterials]);

  // Toggle CSI division expansion
  const toggleDivision = useCallback((divKey: string) => {
    setExpandedDivisions((prev) => {
      const next = new Set(prev);
      if (next.has(divKey)) {
        next.delete(divKey);
      } else {
        next.add(divKey);
      }
      return next;
    });
  }, []);

  // Check if estimate already exists OR if pipeline is running on mount
  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;

    const checkExistingState = async () => {
      try {
        const bom = await getBOM(projectId);
        if (!isMounted) return;
        if (bom && bom.totalMaterials.length > 0) {
          console.log(
            "[FLOW][Estimate] Existing BOM found. Showing results view."
          );
          setBillOfMaterials(bom);
          setPhase("results");
          return;
        }
      } catch (err) {
        console.error("Error loading BOM:", err);
      }

      const storedEstimateId = localStorage.getItem(
        getEstimateStorageKey(projectId)
      );
      if (!storedEstimateId) {
        return;
      }

      console.log(
        "[FLOW][Estimate] Restoring pipeline subscription with estimateId from storage:",
        storedEstimateId
      );
      setEstimateId(storedEstimateId);

      try {
        const pipelineStatus = await getPipelineStatus(storedEstimateId);
        if (!isMounted) return;

        if (pipelineStatus.status === "running") {
          console.log(
            "[FLOW][Estimate] Pipeline still running. Resuming subscription.",
            pipelineStatus
          );
          setIsGenerating(true);
          setProgress(pipelineStatus);
        } else if (pipelineStatus.status === "complete") {
          console.log(
            "[FLOW][Estimate] Pipeline previously completed. Loading BOM."
          );
          setIsGenerating(false);
          setProgress(pipelineStatus);
          const latestBOM = await getBOM(projectId);
          if (!isMounted) return;
          if (latestBOM) {
            setBillOfMaterials(latestBOM);
            setPhase("results");
          }
        } else if (pipelineStatus.status === "idle") {
          console.log(
            "[FLOW][Estimate] Stored estimate looks idle. Clearing cached estimateId."
          );
          localStorage.removeItem(getEstimateStorageKey(projectId));
          setEstimateId(null);
        }
      } catch (err) {
        console.error("Error checking existing pipeline state:", err);
      }
    };

    checkExistingState();
    return () => {
      isMounted = false;
    };
  }, [projectId, setBillOfMaterials]);

  // Subscribe to pipeline progress - subscribe whenever in generate phase
  // This handles both new pipelines and resuming existing ones
  useEffect(() => {
    if (!projectId || !estimateId || phase !== "generate") return;

    console.log(
      "[FLOW][Estimate] Subscribing to pipeline progress for estimate:",
      estimateId
    );
    const unsubscribe = subscribeToPipelineProgress(
      estimateId,
      (newProgress) => {
        // Only update if pipeline is actually doing something
        if (newProgress.status === "idle" && !isGenerating) {
          return; // Don't update for idle status if we haven't started
        }

        setProgress(newProgress);

        // If pipeline is running, make sure isGenerating is true
        if (newProgress.status === "running" && !isGenerating) {
          setIsGenerating(true);
        }

        // Check if pipeline completed
        if (newProgress.status === "complete") {
          console.log(
            "[FLOW][Estimate] Pipeline complete. Fetching results from estimates collection."
          );
          setIsGenerating(false);

          // First try to load from deep pipeline estimates collection
          if (estimateId) {
            const estimateRef = doc(firestore, "estimates", estimateId);
            getDoc(estimateRef)
              .then((estimateSnap) => {
                if (estimateSnap.exists()) {
                  const estimateData = estimateSnap.data();
                  console.log(
                    "[FLOW][Estimate] Estimate data loaded from estimates collection:",
                    {
                      hasFinaOutput: !!estimateData.finalOutput,
                      hasCostOutput: !!estimateData.costOutput,
                      hasScopeOutput: !!estimateData.scopeOutput,
                    }
                  );

                  // Transform deep pipeline output to BOM format
                  const bom = transformEstimateToBOM(estimateData, estimateId);
                  if (bom) {
                    console.log(
                      "[FLOW][Estimate] Transformed estimate to BOM. Switching to results."
                    );
                    setBillOfMaterials(bom);
                    setPhase("results");
                    return;
                  }
                }

                // Fallback: try legacy BOM path
                console.log(
                  "[FLOW][Estimate] No deep pipeline data, trying legacy BOM path."
                );
                getBOM(projectId).then((legacyBom) => {
                  if (legacyBom) {
                    console.log(
                      "[FLOW][Estimate] Legacy BOM loaded. Switching to results."
                    );
                    setBillOfMaterials(legacyBom);
                    setPhase("results");
                  } else {
                    console.warn(
                      "[FLOW][Estimate] No BOM data found in either location."
                    );
                  }
                });
              })
              .catch((err) => {
                console.error("[FLOW][Estimate] Error fetching estimate:", err);
                // Fallback to legacy BOM
                getBOM(projectId).then((legacyBom) => {
                  if (legacyBom) {
                    setBillOfMaterials(legacyBom);
                    setPhase("results");
                  }
                });
              });
          } else {
            // No estimateId, try legacy path
            getBOM(projectId).then((bom) => {
              if (bom) {
                console.log(
                  "[FLOW][Estimate] BOM loaded after completion. Switching to results."
                );
                setBillOfMaterials(bom);
                setPhase("results");
              }
            });
          }
        } else if (newProgress.status === "error") {
          setIsGenerating(false);
          setError(newProgress.error || "Pipeline failed");
          localStorage.removeItem(getEstimateStorageKey(projectId));
          setEstimateId(null);
          console.warn(
            "[FLOW][Estimate] Pipeline reported error. Cleared cached estimateId.",
            newProgress.error
          );
        }
      },
      (err) => {
        // Don't set error for permission errors on initial load
        // (pipeline doc may not exist yet)
        if (!isGenerating) {
          console.warn("[PIPELINE] Subscription warning:", err.message);
          return;
        }
        setError(err.message);
        setIsGenerating(false);
      }
    );

    return () => unsubscribe();
  }, [projectId, estimateId, phase, isGenerating, setBillOfMaterials]);

  const buildClarificationOutput =
    useCallback(async (): Promise<ClarificationOutputPayload | null> => {
      if (!projectId || !user) {
        console.warn(
          "[FLOW][Estimate] Cannot build clarification output without project/user context."
        );
        return null;
      }

      console.log(
        "[FLOW][Estimate] Building ClarificationOutput via estimationPipeline…"
      );

      try {
        const projectStore = getProjectCanvasStoreApi(projectId);
        const storeState = projectStore.getState();

        const shapes = Array.from(storeState.shapes.values());
        const layers = storeState.layers;

        const annotatedShapes: AnnotatedShape[] = shapes.map((shape) => {
          const annotated: AnnotatedShape = {
            id: shape.id,
            type: shape.type,
            x: shape.x,
            y: shape.y,
            w: shape.w,
            h: shape.h,
            confidence: shape.confidence ?? 1.0,
            source: (shape.source || "manual") as "ai" | "manual",
          };
          if (shape.itemType) annotated.label = shape.itemType;
          if (shape.itemType) annotated.itemType = shape.itemType;
          if (shape.points) annotated.points = shape.points;
          if (shape.layerId) annotated.layerId = shape.layerId;
          return annotated;
        });

        const annotatedLayers: AnnotatedLayer[] = layers.map((layer) => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible ?? true,
          shapeCount: shapes.filter((s) => s.layerId === layer.id).length,
        }));

        const annotationSnapshot: AnnotationSnapshot = {
          shapes: annotatedShapes,
          layers: annotatedLayers,
          capturedAt: Date.now(),
        };

        const scaleLine = storeState.canvasScale.scaleLine;
        if (scaleLine && scaleLine.realWorldLength > 0 && scaleLine.unit) {
          const dx = scaleLine.endX - scaleLine.startX;
          const dy = scaleLine.endY - scaleLine.startY;
          const pixelLength = Math.sqrt(dx * dx + dy * dy);
          const pixelsPerUnit = pixelLength / scaleLine.realWorldLength;

          annotationSnapshot.scale = {
            pixelsPerUnit,
            unit: scaleLine.unit as "feet" | "inches" | "meters",
          };
        }

        console.log(
          "[FLOW][Estimate] Annotation snapshot prepared:",
          annotationSnapshot
        );
        console.log("[FLOW][Estimate] Estimate config:", estimateConfig);

        const estimationPipelineFn = httpsCallable(
          functions,
          "estimationPipeline"
        );

        const result = await estimationPipelineFn({
          projectId,
          sessionId: `session-${Date.now()}`,
          planImageUrl: storeState.canvasScale.backgroundImage?.url || null,
          scopeText: estimateConfig.scopeText || "No scope provided",
          clarificationData: {
            // Pass structured location data from estimateConfig
            location: {
              fullAddress: estimateConfig.address?.formattedAddress ||
                (estimateConfig.address
                  ? `${estimateConfig.address.streetAddress}, ${estimateConfig.address.city}, ${estimateConfig.address.state} ${estimateConfig.address.zipCode}`
                  : ""),
              streetAddress: estimateConfig.address?.streetAddress || "",
              city: estimateConfig.address?.city || "",
              state: estimateConfig.address?.state || "",
              zipCode: estimateConfig.address?.zipCode || "",
            },
            projectType: mapProjectType(
              estimateConfig.projectType,
              useProjectStore.getState().currentProject?.name
            ),
            // Pass start date for timeline agent
            desiredStart: estimateConfig.startDate,
          },
          annotationSnapshot,
          passNumber: 1,
          estimateConfig: {
            overheadPercent: estimateConfig.overheadPercent,
            profitPercent: estimateConfig.profitPercent,
            contingencyPercent: estimateConfig.contingencyPercent,
            wasteFactorPercent: estimateConfig.wasteFactorPercent,
            startDate: estimateConfig.startDate,
          },
        });

        console.log(
          "[FLOW][Estimate] estimationPipeline callable returned:",
          result.data
        );

        const resultData = result.data as Record<string, unknown>;
        const finalJSON: ClarificationOutputPayload = {
          estimateId: `est-${projectId}-${Date.now()}`,
          ...(resultData.clarificationOutput || resultData),
          projectScope: estimateConfig.scopeText,
          estimateConfiguration: {
            overheadPercent: estimateConfig.overheadPercent,
            profitPercent: estimateConfig.profitPercent,
            contingencyPercent: estimateConfig.contingencyPercent,
            materialWasteFactorPercent: estimateConfig.wasteFactorPercent,
            projectStartDate: estimateConfig.startDate,
          },
        };

        console.log(
          "[FLOW][Estimate] Final ClarificationOutput JSON:",
          finalJSON
        );
        console.log("[FLOW][Estimate] ClarificationOutput ready.");
        return finalJSON;
      } catch (err) {
        console.error("❌ Clarification output generation failed:", err);
        return null;
      }
    }, [projectId, user, estimateConfig]);

  // Handle generate estimate button click - uses Python pipeline
  const handleGenerateEstimate = useCallback(async () => {
    if (!projectId || !user) return;

    console.log("[FLOW][Estimate] Generate Estimate clicked.");
    setIsGenerating(true);
    setError(null);
    setPhase("generate");
    localStorage.removeItem(getEstimateStorageKey(projectId));
    setEstimateId(null);
    setProgress({
      ...INITIAL_PROGRESS,
      status: "running",
      currentStage: "cad_analysis",
      stageName:
        PIPELINE_STAGES.find((stage) => stage.id === "cad_analysis")?.name ||
        "Analyzing blueprints",
      progressPercent: 5,
      startedAt: Date.now(),
    });

    try {
      let payload = clarificationPayload;
      if (!payload) {
        console.log(
          "[FLOW][Estimate] No cached clarification payload. Building now…"
        );
        payload = await buildClarificationOutput();
        if (payload) {
          setClarificationPayload(payload);
        }
      }

      if (!payload) {
        throw new Error(
          "Unable to build project data. Generate JSON before starting the pipeline."
        );
      }

      console.log("[FLOW][Estimate] Triggering pipeline with payload.", {
        projectId,
        userId: user.uid,
        estimateIdHint: payload.estimateId,
      });
      const result = await triggerEstimatePipeline(
        projectId,
        user.uid,
        payload
      );

      if (!result.success || !result.estimateId) {
        throw new Error(result.error || "Failed to start pipeline");
      }

      setEstimateId(result.estimateId);
      localStorage.setItem(getEstimateStorageKey(projectId), result.estimateId);
      console.log(
        "[FLOW][Estimate] Pipeline started. estimateId:",
        result.estimateId
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsGenerating(false);
      console.error("[FLOW][Estimate] Failed to trigger pipeline:", err);
    }
  }, [projectId, user, clarificationPayload, buildClarificationOutput]);

  // Handle generate JSON button click - always recalculates fresh, no caching
  const handleGenerateJSON = useCallback(async () => {
    if (!projectId || !user) return;

    setIsGeneratingJSON(true);
    // Clear any previous output to ensure fresh calculation
    setJsonOutput(null);
    
    try {
      // Always build fresh - no caching
      const payload = await buildClarificationOutput();
      if (payload) {
        // Only set for display, don't cache in clarificationPayload
        setJsonOutput(payload as unknown as Record<string, unknown>);
        setShowJSONViewer(true);
        console.log(
          "[FLOW][Estimate] JSON output generated fresh (no caching)."
        );
      }
    } finally {
      setIsGeneratingJSON(false);
    }
  }, [projectId, user, buildClarificationOutput]);

  // Handle PDF generation - uses local PDF generation from exportService
  const handleGeneratePDF = useCallback(
    (type: "contractor" | "client") => {
      if (!projectId || !billOfMaterials) {
        setError("No estimate data available to export");
        return;
      }

      setIsGeneratingPDF(true);
      setPdfType(type);

      try {
        // Use local PDF generation from exportService
        // Maps "contractor" -> "contractor" view, "client" -> "customer" view
        const view: BOMExportView =
          type === "contractor" ? "contractor" : "customer";
        exportEstimateAsPDF(billOfMaterials, view, {
          projectName: billOfMaterials.projectName || `Project-${projectId}`,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "PDF generation failed");
      } finally {
        setIsGeneratingPDF(false);
        setPdfType(null);
      }
    },
    [projectId, billOfMaterials]
  );

  // Navigation handlers
  const handleBackToAnnotate = () => {
    if (projectId) {
      navigate(`/project/${projectId}/annotate`);
    }
  };

  // Get actual completion state from hook
  const { completedSteps } = useStepCompletion(projectId);

  // Debug panel keyboard shortcut (Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Render Phase 1: Generate Estimate
  const renderGeneratePhase = () => (
    <div className="flex flex-col items-center justify-center min-h-[400px] glass-panel p-8">
      {isGenerating ? (
        // Progress view
        <div className="w-full max-w-xl">
          <div className="text-center mb-8">
            <h2 className="font-heading text-h2 text-truecost-text-primary mb-2">
              Generating Your Estimate
            </h2>
            <p className="text-body text-truecost-text-secondary">
              Our AI agents are analyzing your project...
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-body-meta text-truecost-text-secondary mb-2">
              <span>{progress.stageName || "Starting..."}</span>
              <span>{progress.progressPercent}%</span>
            </div>
            <div className="w-full h-3 bg-truecost-glass-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-truecost-cyan to-truecost-teal transition-all duration-500 ease-out"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Stage checklist */}
          <div className="space-y-2">
            {PIPELINE_STAGES.map((stage) => {
              const isCompleted = progress.completedStages.includes(stage.id);
              const isCurrent = progress.currentStage === stage.id;

              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isCompleted
                      ? "bg-truecost-cyan/10 text-truecost-cyan"
                      : isCurrent
                      ? "bg-truecost-glass-bg text-truecost-text-primary animate-pulse"
                      : "text-truecost-text-muted"
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : isCurrent ? (
                    <div className="w-5 h-5 border-2 border-truecost-cyan rounded-full border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-5 h-5 border-2 border-truecost-glass-border rounded-full" />
                  )}
                  <span className="text-body">{stage.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // Initial generate button view
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-truecost-cyan/20 to-truecost-teal/20 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-truecost-cyan"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="font-heading text-h2 text-truecost-text-primary mb-3">
            Ready to Generate Your Estimate
          </h2>
          <p className="text-body text-truecost-text-secondary mb-8 max-w-md">
            Our AI will analyze your project scope, calculate materials,
            estimate costs, and generate a comprehensive estimate.
          </p>
          <button
            onClick={handleGenerateEstimate}
            className="btn-pill-primary px-8 py-3 text-lg"
          >
            Generate Estimate
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <p className="font-semibold mb-1">Error</p>
          <p className="text-body-meta">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setProgress(INITIAL_PROGRESS);
            }}
            className="mt-2 text-truecost-cyan hover:underline text-body-meta"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );

  // Render Phase 2: Results tabs
  const renderResultsPhase = () => (
    <div className="space-y-6">
      {/* PDF Export buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
        <button
          onClick={() => handleGeneratePDF("contractor")}
          disabled={isGeneratingPDF}
          className="btn-pill-secondary flex items-center gap-2"
        >
          {isGeneratingPDF && pdfType === "contractor" ? (
            <div className="w-4 h-4 border-2 border-current rounded-full border-t-transparent animate-spin" />
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          )}
          Contractor Estimate
        </button>
        <button
          onClick={() => handleGeneratePDF("client")}
          disabled={isGeneratingPDF}
          className="btn-pill-primary flex items-center gap-2"
        >
          {isGeneratingPDF && pdfType === "client" ? (
            <div className="w-4 h-4 border-2 border-current rounded-full border-t-transparent animate-spin" />
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          )}
          Client Estimate
        </button>
      </div>

      {/* Tab navigation */}
      <div className="glass-panel p-1">
        <div className="flex flex-wrap gap-1">
          {RESULT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-body font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-gradient-to-br from-truecost-cyan to-truecost-teal text-truecost-bg-primary"
                  : "text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="glass-panel p-0 overflow-hidden">
        {activeTab === "summary" && (
          <div className="p-6 space-y-6">
            {/* Estimate Configuration */}
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-truecost-text-primary mb-4">
                Estimate Configuration
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-2xl font-bold text-truecost-cyan">
                    {estimateConfig.overheadPercent}%
                  </p>
                  <p className="text-xs text-truecost-text-secondary mt-1">
                    Overhead
                  </p>
                </div>
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-2xl font-bold text-truecost-cyan">
                    {estimateConfig.profitPercent}%
                  </p>
                  <p className="text-xs text-truecost-text-secondary mt-1">
                    Profit
                  </p>
                </div>
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-2xl font-bold text-truecost-cyan">
                    {estimateConfig.contingencyPercent}%
                  </p>
                  <p className="text-xs text-truecost-text-secondary mt-1">
                    Contingency
                  </p>
                </div>
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-2xl font-bold text-truecost-cyan">
                    {estimateConfig.wasteFactorPercent}%
                  </p>
                  <p className="text-xs text-truecost-text-secondary mt-1">
                    Waste Factor
                  </p>
                </div>
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-lg font-bold text-truecost-cyan">
                    {new Date(estimateConfig.startDate).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }
                    )}
                  </p>
                  <p className="text-xs text-truecost-text-secondary mt-1">
                    Start Date
                  </p>
                </div>
              </div>
            </div>

            {/* Project Scope */}
            {estimateConfig.scopeText && (
              <div className="glass-panel p-6">
                <h2 className="text-lg font-semibold text-truecost-text-primary mb-3">
                  Project Scope
                </h2>
                <p className="text-sm text-truecost-text-primary/80 whitespace-pre-wrap leading-relaxed">
                  {estimateConfig.scopeText}
                </p>
              </div>
            )}

            {/* CSI Scope Breakdown - uses unified summaryData */}
            {summaryData &&
              (() => {
                const csiScope = summaryData.csiScope as
                  | Record<string, CSIDivision>
                  | undefined;
                const projectBrief = summaryData.projectBrief as
                  | Record<string, unknown>
                  | undefined;
                const scopeSummary = projectBrief?.scopeSummary as
                  | Record<string, unknown>
                  | undefined;
                const flags = summaryData.flags as
                  | {
                      lowConfidenceItems?: Array<{
                        field: string;
                        reason: string;
                      }>;
                      missingData?: string[];
                    }
                  | undefined;

                // Deep pipeline specific data
                const costBreakdown = (
                  summaryData as { costBreakdown?: Record<string, number> }
                ).costBreakdown;
                const timeline = (
                  summaryData as { timeline?: Record<string, unknown> }
                ).timeline;
                const riskSummary = (
                  summaryData as { riskSummary?: Record<string, unknown> }
                ).riskSummary;

                return (
                  <>
                    {/* Project Summary */}
                    {projectBrief && (
                      <div className="glass-panel p-6">
                        <h2 className="text-lg font-semibold text-truecost-text-primary mb-4">
                          Project Summary
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-truecost-text-secondary uppercase">
                              Type
                            </p>
                            <p className="text-sm font-medium text-truecost-text-primary">
                              {String(
                                projectBrief.projectType || "Unknown"
                              ).replace(/_/g, " ")}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-truecost-text-secondary uppercase">
                              Size
                            </p>
                            <p className="text-sm font-medium text-truecost-text-primary">
                              {String(scopeSummary?.totalSqft || "0")} sq ft
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-truecost-text-secondary uppercase">
                              Finish Level
                            </p>
                            <p className="text-sm font-medium text-truecost-text-primary capitalize">
                              {String(
                                scopeSummary?.finishLevel || "standard"
                              ).replace(/_/g, " ")}
                            </p>
                          </div>
                          {scopeSummary?.totalIncluded !== undefined ? (
                            <div className="flex gap-2">
                              <div className="glass-panel p-2 text-center bg-green-500/10 border-green-500/30 flex-1">
                                <p className="text-lg font-bold text-green-400">
                                  {String(scopeSummary.totalIncluded || 0)}
                                </p>
                                <p className="text-xs text-green-400/70">
                                  Included
                                </p>
                              </div>
                              <div className="glass-panel p-2 text-center bg-red-500/10 border-red-500/30 flex-1">
                                <p className="text-lg font-bold text-red-400">
                                  {String(scopeSummary.totalExcluded || 0)}
                                </p>
                                <p className="text-xs text-red-400/70">
                                  Excluded
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="text-xs text-truecost-text-secondary uppercase">
                                Duration
                              </p>
                              <p className="text-sm font-medium text-truecost-text-primary">
                                {timeline?.totalWeeks
                                  ? `${String(timeline.totalWeeks)} weeks`
                                  : timeline?.totalDays
                                  ? `${String(timeline.totalDays)} days`
                                  : "TBD"}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Cost Breakdown - for deep pipeline data */}
                    {costBreakdown &&
                      (costBreakdown.total > 0 ||
                        costBreakdown.materials > 0) && (
                        <div className="glass-panel p-6">
                          <h2 className="text-lg font-semibold text-truecost-text-primary mb-4">
                            Cost Breakdown
                          </h2>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                            <div className="glass-panel p-4 text-center">
                              <p className="text-2xl font-bold text-truecost-cyan">
                                $
                                {(
                                  costBreakdown.materials || 0
                                ).toLocaleString()}
                              </p>
                              <p className="text-xs text-truecost-text-secondary uppercase">
                                Materials
                              </p>
                            </div>
                            <div className="glass-panel p-4 text-center">
                              <p className="text-2xl font-bold text-truecost-teal">
                                ${(costBreakdown.labor || 0).toLocaleString()}
                              </p>
                              <p className="text-xs text-truecost-text-secondary uppercase">
                                Labor
                              </p>
                            </div>
                            <div className="glass-panel p-4 text-center">
                              <p className="text-2xl font-bold text-truecost-text-primary">
                                $
                                {(
                                  costBreakdown.equipment || 0
                                ).toLocaleString()}
                              </p>
                              <p className="text-xs text-truecost-text-secondary uppercase">
                                Equipment
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div className="text-center">
                              <p className="text-lg font-semibold text-truecost-text-primary">
                                $
                                {(costBreakdown.overhead || 0).toLocaleString()}
                              </p>
                              <p className="text-xs text-truecost-text-secondary">
                                Overhead
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-semibold text-truecost-text-primary">
                                ${(costBreakdown.profit || 0).toLocaleString()}
                              </p>
                              <p className="text-xs text-truecost-text-secondary">
                                Profit
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-semibold text-yellow-400">
                                $
                                {(
                                  costBreakdown.contingency || 0
                                ).toLocaleString()}
                              </p>
                              <p className="text-xs text-truecost-text-secondary">
                                Contingency
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-semibold text-truecost-text-primary">
                                ${(costBreakdown.total || 0).toLocaleString()}
                              </p>
                              <p className="text-xs text-truecost-text-secondary">
                                Total
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Timeline Summary - for deep pipeline data */}
                    {timeline && (timeline.startDate || timeline.endDate) && (
                      <div className="glass-panel p-6">
                        <h2 className="text-lg font-semibold text-truecost-text-primary mb-4">
                          Timeline
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-truecost-text-secondary uppercase">
                              Start Date
                            </p>
                            <p className="text-sm font-medium text-truecost-text-primary">
                              {timeline.startDate
                                ? new Date(
                                    timeline.startDate as string
                                  ).toLocaleDateString()
                                : "TBD"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-truecost-text-secondary uppercase">
                              End Date
                            </p>
                            <p className="text-sm font-medium text-truecost-text-primary">
                              {timeline.endDate
                                ? new Date(
                                    timeline.endDate as string
                                  ).toLocaleDateString()
                                : "TBD"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-truecost-text-secondary uppercase">
                              Duration
                            </p>
                            <p className="text-sm font-medium text-truecost-text-primary">
                              {timeline.totalWeeks
                                ? `${String(timeline.totalWeeks)} weeks`
                                : timeline.totalDays
                                ? `${String(timeline.totalDays)} days`
                                : "TBD"}
                            </p>
                          </div>
                          {typeof riskSummary?.riskLevel === "string" && (
                            <div>
                              <p className="text-xs text-truecost-text-secondary uppercase">
                                Risk Level
                              </p>
                              <p
                                className={`text-sm font-medium capitalize ${
                                  riskSummary.riskLevel === "high"
                                    ? "text-red-400"
                                    : riskSummary.riskLevel === "medium"
                                    ? "text-yellow-400"
                                    : "text-green-400"
                                }`}
                              >
                                {riskSummary.riskLevel}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* CSI Divisions */}
                    {csiScope && Object.keys(csiScope).length > 0 && (
                      <div className="glass-panel">
                        <div className="px-6 py-4 border-b border-truecost-glass-border">
                          <h2 className="text-lg font-semibold text-truecost-text-primary">
                            CSI Scope Breakdown
                          </h2>
                        </div>
                        <div className="divide-y divide-truecost-glass-border max-h-96 overflow-y-auto">
                          {Object.entries(csiScope).map(([key, division]) => {
                            const div = division as CSIDivision;
                            const isExpanded = expandedDivisions.has(key);
                            const hasItems = div.items && div.items.length > 0;

                            return (
                              <div key={key} className="px-6 py-3">
                                <button
                                  onClick={() => toggleDivision(key)}
                                  className="w-full flex items-center justify-between text-left"
                                >
                                  <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                                    <span className="text-sm font-mono text-truecost-text-secondary">
                                      {div.code}
                                    </span>
                                    <span className="font-medium text-truecost-text-primary">
                                      {div.name}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 text-xs rounded-full ${
                                        div.status === "included"
                                          ? "bg-green-500/20 text-green-400"
                                          : div.status === "excluded"
                                          ? "bg-red-500/20 text-red-400"
                                          : div.status === "by_owner"
                                          ? "bg-yellow-500/20 text-yellow-400"
                                          : "bg-gray-500/20 text-gray-400"
                                      }`}
                                    >
                                      {div.status.replace(/_/g, " ")}
                                    </span>
                                    {hasItems && (
                                      <span className="text-xs text-truecost-text-secondary">
                                        ({div.items.length} items)
                                      </span>
                                    )}
                                  </div>
                                  <svg
                                    className={`w-5 h-5 text-truecost-text-secondary transition-transform ${
                                      isExpanded ? "rotate-180" : ""
                                    }`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 9l-7 7-7-7"
                                    />
                                  </svg>
                                </button>
                                {isExpanded && hasItems && (
                                  <div className="mt-3 ml-12">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-xs text-truecost-text-secondary uppercase">
                                          <th className="pb-2">Item</th>
                                          <th className="pb-2 text-right">
                                            Qty
                                          </th>
                                          <th className="pb-2">Unit</th>
                                          <th className="pb-2 text-right">
                                            Confidence
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-truecost-glass-border/50">
                                        {div.items.map((item) => (
                                          <tr key={item.id}>
                                            <td className="py-2 font-medium text-truecost-text-primary">
                                              {item.item}
                                            </td>
                                            <td className="py-2 text-right font-mono text-truecost-text-primary">
                                              {item.quantity}
                                            </td>
                                            <td className="py-2 text-truecost-text-secondary">
                                              {item.unit}
                                            </td>
                                            <td className="py-2 text-right">
                                              <span
                                                className={`inline-block w-12 text-center px-1 py-0.5 text-xs rounded ${
                                                  item.confidence >= 0.9
                                                    ? "bg-green-500/20 text-green-400"
                                                    : item.confidence >= 0.7
                                                    ? "bg-yellow-500/20 text-yellow-400"
                                                    : "bg-red-500/20 text-red-400"
                                                }`}
                                              >
                                                {Math.round(
                                                  item.confidence * 100
                                                )}
                                                %
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Flags */}
                    {flags &&
                      ((flags.lowConfidenceItems &&
                        flags.lowConfidenceItems.length > 0) ||
                        (flags.missingData &&
                          flags.missingData.length > 0)) && (
                        <div className="glass-panel p-6 bg-yellow-500/10 border-yellow-500/30">
                          <h2 className="text-lg font-semibold text-yellow-400 mb-4">
                            Review Required
                          </h2>
                          {flags.lowConfidenceItems &&
                            flags.lowConfidenceItems.length > 0 && (
                              <div className="mb-4">
                                <h3 className="text-sm font-medium text-yellow-400/80 mb-2">
                                  Low Confidence Items
                                </h3>
                                <ul className="list-disc list-inside text-sm text-yellow-400/70 space-y-1">
                                  {flags.lowConfidenceItems.map((item, i) => (
                                    <li key={i}>
                                      <span className="font-mono text-xs">
                                        {item.field}
                                      </span>
                                      : {item.reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          {flags.missingData &&
                            flags.missingData.length > 0 && (
                              <div>
                                <h3 className="text-sm font-medium text-yellow-400/80 mb-2">
                                  Missing Data
                                </h3>
                                <ul className="list-disc list-inside text-sm text-yellow-400/70 space-y-1">
                                  {flags.missingData.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        </div>
                      )}
                  </>
                );
              })()}

            {/* Raw JSON Viewer - uses summaryData.rawPayload */}
            {summaryData && (
              <details className="glass-panel">
                <summary className="px-6 py-4 cursor-pointer text-sm font-medium text-truecost-text-primary hover:bg-truecost-glass-bg/50">
                  View Raw JSON{" "}
                  {summaryData.source === "deepPipelineData" &&
                    "(Deep Pipeline Output)"}
                </summary>
                <pre className="px-6 py-4 text-xs overflow-auto max-h-96 bg-truecost-bg-secondary text-truecost-cyan rounded-b-lg">
                  {JSON.stringify(
                    {
                      source: summaryData.source,
                      ...(summaryData.rawPayload as Record<string, unknown>),
                      projectScope: estimateConfig.scopeText,
                      estimateConfiguration: {
                        overheadPercent: estimateConfig.overheadPercent,
                        profitPercent: estimateConfig.profitPercent,
                        contingencyPercent: estimateConfig.contingencyPercent,
                        materialWasteFactorPercent:
                          estimateConfig.wasteFactorPercent,
                        projectStartDate: estimateConfig.startDate,
                      },
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
            )}

            {/* Download JSON button */}
            {summaryData && (
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    const blob = new Blob(
                      [
                        JSON.stringify(
                          {
                            source: summaryData.source,
                            ...(summaryData.rawPayload as Record<
                              string,
                              unknown
                            >),
                            projectScope: estimateConfig.scopeText,
                            estimateConfiguration: {
                              overheadPercent: estimateConfig.overheadPercent,
                              profitPercent: estimateConfig.profitPercent,
                              contingencyPercent:
                                estimateConfig.contingencyPercent,
                              materialWasteFactorPercent:
                                estimateConfig.wasteFactorPercent,
                              projectStartDate: estimateConfig.startDate,
                            },
                          },
                          null,
                          2
                        ),
                      ],
                      { type: "application/json" }
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `estimate-${projectId}-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="btn-pill-secondary flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Download JSON
                </button>
              </div>
            )}

            {/* No results yet message */}
            {!summaryData && (
              <div className="glass-panel p-8 text-center">
                <p className="text-truecost-text-secondary">
                  No estimation results available yet. The summary will appear
                  here after the estimate is generated.
                </p>
              </div>
            )}
          </div>
        )}
        {activeTab === "materials" && <MoneyView mode="materials" />}
        {activeTab === "labor" && <MoneyView mode="labor" />}
        {activeTab === "time" && projectId && (
          <TimeView projectId={projectId} />
        )}
        {activeTab === "riskAnalysis" && projectId && (
          <RiskAnalysisView projectId={projectId} estimateId={estimateId} />
        )}
        {activeTab === "priceComparison" && projectId && (
          <PriceComparisonPanel projectId={projectId} />
        )}
        {activeTab === "estimateVsActual" && billOfMaterials && (
          <div className="p-6">
            <ComparisonView bom={billOfMaterials} />
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-truecost-cyan hover:underline text-body-meta"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-truecost-bg-primary">
      <AuthenticatedLayout>
        <div className="container-spacious max-w-full pt-20 pb-14 md:pt-24">
          {/* Stepper */}
          {projectId && (
            <EstimateStepper
              currentStep="estimate"
              projectId={projectId}
              completedSteps={completedSteps}
            />
          )}

          {/* Header */}
          <div className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-body-meta font-medium text-white border border-truecost-glass-border">
                Estimate
              </span>
              <h1 className="font-heading text-h1 text-truecost-text-primary">
                {phase === "generate"
                  ? "Generate Estimate"
                  : "Project Estimate"}
              </h1>
              <p className="font-body text-body text-truecost-text-secondary/90">
                {phase === "generate"
                  ? "Generate a comprehensive estimate for your construction project."
                  : "Review your estimate details and export reports."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleBackToAnnotate}
                className="btn-pill-secondary"
              >
                Back to Annotate
              </button>
              {/* Generate JSON button - triggers TS estimation pipeline, logs to console */}
              <button
                onClick={handleGenerateJSON}
                disabled={isGeneratingJSON}
                className="btn-pill-secondary flex items-center gap-2"
              >
                {isGeneratingJSON ? (
                  <div className="w-4 h-4 border-2 border-current rounded-full border-t-transparent animate-spin" />
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                )}
                Generate JSON
              </button>
              {/* Debug toggle button */}
              <button
                onClick={() => setShowDebug((prev) => !prev)}
                className={`px-3 py-2 rounded-lg text-xs font-mono transition-colors ${
                  showDebug
                    ? "bg-truecost-cyan/20 text-truecost-cyan border border-truecost-cyan/50"
                    : "bg-truecost-glass-bg text-truecost-text-muted hover:text-truecost-text-primary border border-truecost-glass-border"
                }`}
                title="Toggle debug panel (Shift+D)"
              >
                🔧 Debug
              </button>
            </div>
          </div>

          {/* Main content */}
          {phase === "generate" ? renderGeneratePhase() : renderResultsPhase()}
        </div>

        {/* Debug Panel */}
        {projectId && (
          <PipelineDebugPanel
            projectId={projectId}
            isVisible={showDebug}
            onClose={() => setShowDebug(false)}
          />
        )}

        {/* JSON Output Viewer Modal */}
        {showJSONViewer && jsonOutput && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-5xl max-h-[90vh] bg-truecost-bg-secondary border border-truecost-glass-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-truecost-glass-border bg-truecost-bg-primary/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-truecost-cyan/20">
                    <svg className="w-5 h-5 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-truecost-text-primary">
                      ClarificationOutput JSON
                    </h2>
                    <p className="text-xs text-truecost-text-muted">
                      Generated estimation pipeline output
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Copy button */}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(jsonOutput, null, 2));
                      // Could add toast notification here
                    }}
                    className="px-3 py-1.5 text-sm rounded-lg bg-truecost-glass-bg hover:bg-truecost-glass-bg/80 text-truecost-text-secondary hover:text-truecost-text-primary transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                  {/* Download button */}
                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(jsonOutput, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `clarification-output-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1.5 text-sm rounded-lg bg-truecost-cyan/20 hover:bg-truecost-cyan/30 text-truecost-cyan transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download
                  </button>
                  {/* Close button */}
                  <button
                    onClick={() => setShowJSONViewer(false)}
                    className="p-2 rounded-lg hover:bg-truecost-glass-bg text-truecost-text-muted hover:text-truecost-text-primary transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* JSON Content */}
              <div className="flex-1 overflow-auto p-4 bg-truecost-bg-primary/30">
                <pre className="text-sm font-mono text-truecost-text-primary/90 whitespace-pre-wrap break-words leading-relaxed">
                  <code>
                    {JSON.stringify(jsonOutput, null, 2)}
                  </code>
                </pre>
              </div>
              
              {/* Modal Footer */}
              <div className="px-6 py-3 border-t border-truecost-glass-border bg-truecost-bg-primary/50 flex justify-between items-center">
                <p className="text-xs text-truecost-text-muted">
                  Schema Version: {(jsonOutput as Record<string, unknown>)?.schemaVersion || 'N/A'} • 
                  Estimate ID: {(jsonOutput as Record<string, unknown>)?.estimateId || 'N/A'}
                </p>
                <button
                  onClick={() => setShowJSONViewer(false)}
                  className="btn-pill-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </AuthenticatedLayout>
    </div>
  );
}
