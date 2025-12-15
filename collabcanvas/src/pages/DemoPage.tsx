/**
 * DemoPage - Step-by-step demo walkthrough of the TrueCost estimation workflow
 * Shows hardcoded bathroom remodel example through Scope → Annotate → Estimate
 * Toggle through each step with Previous/Next buttons
 */

import { useState, useEffect, useCallback } from "react";
import { PublicLayout } from "../components/layouts/PublicLayout";

// All demo steps in order
const DEMO_STEPS = [
  { id: "scope", label: "Project Scope", phase: "scope" },
  { id: "annotate-plan", label: "Plan Annotations", phase: "annotate" },
  { id: "annotate-chat", label: "AI Clarification", phase: "annotate" },
  { id: "gen-1", label: "Analyzing blueprints", phase: "generating" },
  { id: "gen-2", label: "Extracting scope items", phase: "generating" },
  { id: "gen-3", label: "Calculating materials", phase: "generating" },
  { id: "gen-4", label: "Pricing & labor", phase: "generating" },
  { id: "gen-5", label: "Building timeline", phase: "generating" },
  { id: "gen-6", label: "Analyzing risks", phase: "generating" },
  { id: "gen-7", label: "Final assembly", phase: "generating" },
  { id: "result-summary", label: "Estimate Summary", phase: "results" },
  { id: "result-materials", label: "Materials", phase: "results" },
  { id: "result-labor", label: "Labor", phase: "results" },
  { id: "result-timeline", label: "Timeline", phase: "results" },
  { id: "result-risks", label: "Risk Analysis", phase: "results" },
  { id: "result-price-compare", label: "Price Comparison", phase: "results" },
  { id: "result-accuracy", label: "Estimate Accuracy", phase: "results" },
] as const;

// Hardcoded demo data
const DEMO_SCOPE = {
  projectName: "Primary Bathroom Remodel",
  location: "San Francisco, CA 94110",
  projectType: "Bathroom Remodel",
  scopeText: `Complete primary bathroom remodel. We will replace the drywall, install waterproofing, remove rotten knee wall framing between shower cabin and bathtub and replace with new framing, put large format tiles on walls of shower cabin, replace all tiles on the floor. Install new recessed lighting. Replace toilet. Paint cabinets. Modify plumbing to allow for ceiling shower head.`,
  estimateConfig: {
    overheadPercent: 10,
    profitPercent: 10,
    contingencyPercent: 5,
    wasteFactorPercent: 10,
    startDate: "2025-01-15",
  },
};

const DEMO_ANNOTATIONS = [
  { id: 1, label: "Shower Cabin", area: "42 sq ft", type: "tile" },
  { id: 2, label: "Floor Area", area: "85 sq ft", type: "tile" },
  { id: 3, label: "Knee Wall", area: "12 linear ft", type: "framing" },
  { id: 4, label: "Recessed Lights", count: "6 fixtures", type: "electrical" },
  { id: 5, label: "Toilet Location", count: "1 unit", type: "plumbing" },
  { id: 6, label: "Cabinets", area: "24 sq ft", type: "paint" },
];

const DEMO_ESTIMATE = {
  summary: {
    totalCost: 28750,
    costPerSqft: 338,
    duration: "3-4 weeks",
    riskLevel: "medium",
  },
  costBreakdown: {
    materials: 12450,
    labor: 11200,
    equipment: 850,
    overhead: 2445,
    profit: 2445,
    contingency: 1225,
  },
  materials: [
    { id: 1, category: "Tile & Stone", item: "Large Format Porcelain Tile (24x48)", qty: 150, unit: "sq ft", unitCost: 8.50, total: 1275 },
    { id: 2, category: "Tile & Stone", item: "Tile Adhesive (Modified Thinset)", qty: 6, unit: "bags", unitCost: 45, total: 270 },
    { id: 3, category: "Tile & Stone", item: "Grout (Epoxy)", qty: 2, unit: "units", unitCost: 85, total: 170 },
    { id: 4, category: "Waterproofing", item: "Waterproof Membrane (Kerdi)", qty: 60, unit: "sq ft", unitCost: 4.50, total: 270 },
    { id: 5, category: "Waterproofing", item: "Waterproofing Corners & Bands", qty: 1, unit: "kit", unitCost: 125, total: 125 },
    { id: 6, category: "Drywall", item: "Moisture Resistant Drywall (1/2\")", qty: 12, unit: "sheets", unitCost: 18, total: 216 },
    { id: 7, category: "Drywall", item: "Joint Compound", qty: 2, unit: "buckets", unitCost: 22, total: 44 },
    { id: 8, category: "Framing", item: "Pressure Treated 2x4 Studs", qty: 24, unit: "pcs", unitCost: 8.50, total: 204 },
    { id: 9, category: "Framing", item: "Construction Screws", qty: 2, unit: "boxes", unitCost: 18, total: 36 },
    { id: 10, category: "Electrical", item: "6\" LED Recessed Light Kit", qty: 6, unit: "units", unitCost: 45, total: 270 },
    { id: 11, category: "Electrical", item: "Dimmer Switch", qty: 1, unit: "unit", unitCost: 65, total: 65 },
    { id: 12, category: "Electrical", item: "Romex 12/2 Wire", qty: 50, unit: "ft", unitCost: 1.20, total: 60 },
    { id: 13, category: "Plumbing", item: "Ceiling Mount Shower Head Assembly", qty: 1, unit: "unit", unitCost: 285, total: 285 },
    { id: 14, category: "Plumbing", item: "Copper Pipe (3/4\")", qty: 20, unit: "ft", unitCost: 8.50, total: 170 },
    { id: 15, category: "Plumbing", item: "Toilet (Elongated, Comfort Height)", qty: 1, unit: "unit", unitCost: 385, total: 385 },
    { id: 16, category: "Plumbing", item: "Wax Ring & Bolts", qty: 1, unit: "kit", unitCost: 15, total: 15 },
    { id: 17, category: "Paint", item: "Cabinet Paint (Semi-Gloss)", qty: 2, unit: "gal", unitCost: 55, total: 110 },
    { id: 18, category: "Paint", item: "Primer (Bonding)", qty: 1, unit: "gal", unitCost: 45, total: 45 },
  ],
  labor: [
    { id: 1, trade: "Tile Setter", hours: 24, rate: 75, total: 1800 },
    { id: 2, trade: "Plumber", hours: 16, rate: 95, total: 1520 },
    { id: 3, trade: "Electrician", hours: 8, rate: 85, total: 680 },
    { id: 4, trade: "Carpenter (Framing)", hours: 12, rate: 65, total: 780 },
    { id: 5, trade: "Drywall Installer", hours: 10, rate: 60, total: 600 },
    { id: 6, trade: "Painter", hours: 8, rate: 55, total: 440 },
    { id: 7, trade: "General Labor", hours: 20, rate: 45, total: 900 },
    { id: 8, trade: "Project Supervision", hours: 16, rate: 85, total: 1360 },
  ],
  timeline: [
    { phase: "Demo & Prep", days: 2, tasks: ["Remove existing tile", "Demo rotten framing", "Prep surfaces"] },
    { phase: "Rough-In", days: 4, tasks: ["New framing", "Plumbing rough-in", "Electrical rough-in"] },
    { phase: "Drywall & Waterproofing", days: 3, tasks: ["Install drywall", "Apply waterproofing", "Cure time"] },
    { phase: "Tile Installation", days: 5, tasks: ["Wall tile", "Floor tile", "Grout and seal"] },
    { phase: "Fixtures & Finish", days: 3, tasks: ["Install toilet", "Install lights", "Paint cabinets"] },
    { phase: "Final Inspection", days: 1, tasks: ["Clean up", "Final walkthrough", "Punch list"] },
  ],
  risks: [
    { level: "high", item: "Hidden water damage", mitigation: "Allow for additional demo contingency", impact: "$500-$2,000" },
    { level: "medium", item: "Plumbing modifications complexity", mitigation: "Verified ceiling access available", impact: "$300-$800" },
    { level: "low", item: "Tile delivery delays", mitigation: "Order materials 2 weeks ahead", impact: "1-3 day delay" },
  ],
};

const PIPELINE_STAGES = [
  { id: "gen-1", name: "Analyzing blueprints", percent: 10 },
  { id: "gen-2", name: "Extracting scope items", percent: 25 },
  { id: "gen-3", name: "Calculating material quantities", percent: 40 },
  { id: "gen-4", name: "Pricing materials and labor", percent: 55 },
  { id: "gen-5", name: "Building project timeline", percent: 70 },
  { id: "gen-6", name: "Analyzing project risks", percent: 85 },
  { id: "gen-7", name: "Assembling final estimate", percent: 100 },
];

// Price comparison data - Home Depot vs Lowes
const PRICE_COMPARISON = [
  {
    item: "Large Format Porcelain Tile (24x48)",
    qty: 150,
    unit: "sq ft",
    homeDepot: { price: 8.97, sku: "HD-PT24X48-GRY", inStock: true },
    lowes: { price: 8.49, sku: "LW-1045892", inStock: true },
    selected: "lowes" as const,
  },
  {
    item: "Tile Adhesive (Modified Thinset) 50lb",
    qty: 6,
    unit: "bags",
    homeDepot: { price: 42.98, sku: "HD-VERSABOND-50", inStock: true },
    lowes: { price: 45.99, sku: "LW-4829103", inStock: false },
    selected: "homeDepot" as const,
  },
  {
    item: "Epoxy Grout 9lb",
    qty: 2,
    unit: "units",
    homeDepot: { price: 89.00, sku: "HD-SPECEPOXY-9", inStock: true },
    lowes: { price: 84.98, sku: "LW-2938471", inStock: true },
    selected: "lowes" as const,
  },
  {
    item: "Kerdi Waterproof Membrane",
    qty: 60,
    unit: "sq ft",
    homeDepot: { price: 4.29, sku: "HD-KERDI-108", inStock: true },
    lowes: { price: 4.59, sku: "LW-9182736", inStock: true },
    selected: "homeDepot" as const,
  },
  {
    item: "6\" LED Recessed Light Kit",
    qty: 6,
    unit: "units",
    homeDepot: { price: 42.97, sku: "HD-HLBSL6-WH", inStock: true },
    lowes: { price: 47.98, sku: "LW-8273645", inStock: true },
    selected: "homeDepot" as const,
  },
  {
    item: "Toilet - Elongated Comfort Height",
    qty: 1,
    unit: "unit",
    homeDepot: { price: 379.00, sku: "HD-KOHLER-CH", inStock: true },
    lowes: { price: 399.00, sku: "LW-7364528", inStock: true },
    selected: "homeDepot" as const,
  },
  {
    item: "Ceiling Mount Rain Shower Head",
    qty: 1,
    unit: "unit",
    homeDepot: { price: 299.00, sku: "HD-MOEN-RAIN12", inStock: false },
    lowes: { price: 279.00, sku: "LW-6253419", inStock: true },
    selected: "lowes" as const,
  },
  {
    item: "Pressure Treated 2x4 Studs 8ft",
    qty: 24,
    unit: "pcs",
    homeDepot: { price: 7.98, sku: "HD-PT2X4-8", inStock: true },
    lowes: { price: 8.48, sku: "LW-5142308", inStock: true },
    selected: "homeDepot" as const,
  },
];

// Estimate accuracy comparison data
const ACCURACY_COMPARISON = {
  manualEstimate: {
    label: "Manual Estimate",
    description: "Traditional spreadsheet-based estimate by junior estimator",
    materials: 9800,
    labor: 8500,
    overhead: 1830,
    contingency: 915,
    total: 21045,
    timeToCreate: "4-6 hours",
    issues: [
      "Missed waterproofing materials",
      "Underestimated tile quantity by 20%",
      "Used outdated labor rates",
      "No ceiling plumbing modification included",
      "Forgot epoxy grout premium",
    ],
  },
  trueCostEstimate: {
    label: "TrueCost AI Estimate",
    description: "AI-powered estimate with real-time pricing",
    materials: 12450,
    labor: 11200,
    overhead: 2445,
    contingency: 1225,
    total: 28750,
    timeToCreate: "3 minutes",
    features: [
      "Auto-detected all scope items from description",
      "Current pricing from multiple vendors",
      "Region-adjusted labor rates (SF Bay Area)",
      "Included ceiling plumbing complexity",
      "Proper waste factor calculations",
    ],
  },
  actualCost: {
    label: "Actual Project Cost",
    description: "Final invoiced amount after project completion",
    materials: 12890,
    labor: 11850,
    overhead: 2474,
    contingency: 980,
    total: 29194,
    notes: [
      "Minor tile overage due to cuts",
      "Plumber needed extra 4 hours",
      "Contingency partially used for hidden pipe repair",
    ],
  },
};

export function DemoPage() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStep = DEMO_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === DEMO_STEPS.length - 1;

  const goNext = () => {
    if (!isLastStep) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const goPrev = () => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const goToStep = (index: number) => {
    setCurrentStepIndex(index);
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Home") {
        e.preventDefault();
        setCurrentStepIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setCurrentStepIndex(DEMO_STEPS.length - 1);
      }
    },
    [isFirstStep, isLastStep]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Get current phase for the stepper highlight
  const getCurrentPhase = () => {
    if (currentStep.phase === "scope") return "scope";
    if (currentStep.phase === "annotate") return "annotate";
    return "estimate";
  };

  // Render the workflow stepper
  const renderStepper = () => {
    const phase = getCurrentPhase();
    const phases = [
      { id: "scope", label: "Scope" },
      { id: "annotate", label: "Annotate" },
      { id: "estimate", label: "Estimate" },
    ];

    return (
      <div className="flex items-center justify-center gap-4 mb-6">
        {phases.map((p, index) => {
          const isActive = p.id === phase;
          const isCompleted =
            (p.id === "scope" && (phase === "annotate" || phase === "estimate")) ||
            (p.id === "annotate" && phase === "estimate");

          return (
            <div key={p.id} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-truecost-cyan to-truecost-teal text-truecost-bg-primary font-semibold"
                    : isCompleted
                    ? "bg-truecost-cyan/20 text-truecost-cyan"
                    : "bg-truecost-glass-bg text-truecost-text-secondary"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                    isCompleted ? "bg-truecost-cyan text-truecost-bg-primary" : "bg-truecost-glass-border"
                  }`}
                >
                  {isCompleted ? "✓" : index + 1}
                </span>
                {p.label}
              </div>
              {index < 2 && <div className="w-8 h-0.5 bg-truecost-glass-border mx-2" />}
            </div>
          );
        })}
      </div>
    );
  };

  // Render step indicator dots
  const renderStepDots = () => (
    <div className="flex items-center justify-center gap-1 mb-6">
      {DEMO_STEPS.map((step, index) => (
        <button
          key={step.id}
          onClick={() => goToStep(index)}
          className={`w-2 h-2 rounded-full transition-all ${
            index === currentStepIndex
              ? "w-6 bg-truecost-cyan"
              : index < currentStepIndex
              ? "bg-truecost-cyan/50"
              : "bg-truecost-glass-border"
          }`}
          title={step.label}
        />
      ))}
    </div>
  );

  // Content renderers
  const renderScopeContent = () => (
    <div className="space-y-6 animate-fadeIn">
      <div className="glass-panel p-6">
        <h2 className="text-xl font-semibold text-truecost-text-primary mb-4">Project Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-truecost-text-secondary mb-1">Project Name</label>
            <div className="p-3 bg-truecost-glass-bg rounded-lg text-truecost-text-primary">
              {DEMO_SCOPE.projectName}
            </div>
          </div>
          <div>
            <label className="block text-sm text-truecost-text-secondary mb-1">Location</label>
            <div className="p-3 bg-truecost-glass-bg rounded-lg text-truecost-text-primary">
              {DEMO_SCOPE.location}
            </div>
          </div>
          <div>
            <label className="block text-sm text-truecost-text-secondary mb-1">Project Type</label>
            <div className="p-3 bg-truecost-glass-bg rounded-lg text-truecost-text-primary">
              {DEMO_SCOPE.projectType}
            </div>
          </div>
          <div>
            <label className="block text-sm text-truecost-text-secondary mb-1">Start Date</label>
            <div className="p-3 bg-truecost-glass-bg rounded-lg text-truecost-text-primary">
              {new Date(DEMO_SCOPE.estimateConfig.startDate).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h2 className="text-xl font-semibold text-truecost-text-primary mb-4">Scope Description</h2>
        <div className="p-4 bg-truecost-glass-bg rounded-lg text-truecost-text-primary leading-relaxed">
          {DEMO_SCOPE.scopeText}
        </div>
      </div>

      <div className="glass-panel p-6">
        <h2 className="text-xl font-semibold text-truecost-text-primary mb-4">Estimate Configuration</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-truecost-cyan/10 rounded-lg border border-truecost-cyan/30">
            <p className="text-2xl font-bold text-truecost-cyan">{DEMO_SCOPE.estimateConfig.overheadPercent}%</p>
            <p className="text-xs text-truecost-text-secondary">Overhead</p>
          </div>
          <div className="text-center p-3 bg-truecost-cyan/10 rounded-lg border border-truecost-cyan/30">
            <p className="text-2xl font-bold text-truecost-cyan">{DEMO_SCOPE.estimateConfig.profitPercent}%</p>
            <p className="text-xs text-truecost-text-secondary">Profit</p>
          </div>
          <div className="text-center p-3 bg-truecost-cyan/10 rounded-lg border border-truecost-cyan/30">
            <p className="text-2xl font-bold text-truecost-cyan">{DEMO_SCOPE.estimateConfig.contingencyPercent}%</p>
            <p className="text-xs text-truecost-text-secondary">Contingency</p>
          </div>
          <div className="text-center p-3 bg-truecost-cyan/10 rounded-lg border border-truecost-cyan/30">
            <p className="text-2xl font-bold text-truecost-cyan">{DEMO_SCOPE.estimateConfig.wasteFactorPercent}%</p>
            <p className="text-xs text-truecost-text-secondary">Waste Factor</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnnotatePlanContent = () => (
    <div className="space-y-6 animate-fadeIn">
      <div className="glass-panel p-6">
        <h2 className="text-xl font-semibold text-truecost-text-primary mb-4">Plan Annotations</h2>
        <p className="text-truecost-text-secondary mb-6">
          AI has analyzed the uploaded floor plan and identified the following areas for the bathroom remodel:
        </p>

        {/* Simulated floor plan */}
        <div className="relative bg-truecost-glass-bg rounded-lg p-4 mb-6">
          <div className="aspect-[4/3] bg-gradient-to-br from-truecost-bg-primary to-truecost-bg-secondary rounded-lg flex items-center justify-center relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #00D4FF 1px, transparent 1px), linear-gradient(to bottom, #00D4FF 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <div className="absolute inset-8 border-2 border-truecost-cyan/50 rounded">
              <div className="absolute top-2 left-2 w-1/3 h-2/5 border-2 border-dashed border-truecost-teal bg-truecost-teal/10 rounded flex items-center justify-center">
                <span className="text-xs text-truecost-teal font-medium">Shower Cabin</span>
              </div>
              <div className="absolute top-2 right-2 w-1/3 h-2/5 border-2 border-dashed border-blue-400 bg-blue-400/10 rounded flex items-center justify-center">
                <span className="text-xs text-blue-400 font-medium">Bathtub</span>
              </div>
              <div className="absolute top-2 left-[38%] w-[4%] h-2/5 bg-orange-400/30 border border-orange-400 flex items-center justify-center">
                <span className="text-[10px] text-orange-400 font-medium writing-vertical">Knee Wall</span>
              </div>
              <div className="absolute bottom-4 left-4 w-16 h-20 border-2 border-dashed border-purple-400 bg-purple-400/10 rounded flex items-center justify-center">
                <span className="text-xs text-purple-400 font-medium">Toilet</span>
              </div>
              <div className="absolute bottom-4 right-4 w-1/3 h-1/4 border-2 border-dashed border-yellow-400 bg-yellow-400/10 rounded flex items-center justify-center">
                <span className="text-xs text-yellow-400 font-medium">Cabinets</span>
              </div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="flex gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-4 h-4 rounded-full bg-yellow-300/60 border border-yellow-300" />
                  ))}
                </div>
                <div className="flex gap-6 mt-6">
                  {[4, 5, 6].map((i) => (
                    <div key={i} className="w-4 h-4 rounded-full bg-yellow-300/60 border border-yellow-300" />
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 flex items-center gap-2 text-truecost-text-secondary text-xs">
              <div className="w-16 h-0.5 bg-truecost-cyan" />
              <span>4 ft</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {DEMO_ANNOTATIONS.map((annotation) => (
            <div
              key={annotation.id}
              className="p-3 bg-truecost-glass-bg rounded-lg border border-truecost-glass-border"
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`w-3 h-3 rounded-full ${
                    annotation.type === "tile"
                      ? "bg-truecost-teal"
                      : annotation.type === "framing"
                      ? "bg-orange-400"
                      : annotation.type === "electrical"
                      ? "bg-yellow-400"
                      : annotation.type === "plumbing"
                      ? "bg-purple-400"
                      : "bg-yellow-400"
                  }`}
                />
                <span className="font-medium text-truecost-text-primary text-sm">{annotation.label}</span>
              </div>
              <p className="text-xs text-truecost-text-secondary">{annotation.area || annotation.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAnnotateChatContent = () => (
    <div className="space-y-6 animate-fadeIn">
      <div className="glass-panel p-6">
        <h2 className="text-xl font-semibold text-truecost-text-primary mb-4">AI Clarification Chat</h2>
        <p className="text-truecost-text-secondary mb-6">
          The AI assistant asks clarifying questions to ensure accurate estimates:
        </p>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-sm flex-shrink-0">
              AI
            </div>
            <div className="flex-1 p-3 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
              I've analyzed the floor plan. The bathroom is approximately 85 sq ft. I see a separate shower cabin and
              bathtub with a knee wall between them. Can you confirm the ceiling height for the recessed lighting?
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <div className="flex-1 max-w-[80%] p-3 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
              The ceiling height is 9 feet. We want 6 recessed lights total, evenly distributed.
            </div>
            <div className="w-8 h-8 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-sm flex-shrink-0">
              U
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-sm flex-shrink-0">
              AI
            </div>
            <div className="flex-1 p-3 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
              Perfect. For the large format tiles on the shower walls, what size are you planning? Standard options are
              24x48 or 12x24 porcelain.
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <div className="flex-1 max-w-[80%] p-3 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
              24x48 porcelain tiles for a modern look. Grey/neutral color.
            </div>
            <div className="w-8 h-8 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-sm flex-shrink-0">
              U
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-sm flex-shrink-0">
              AI
            </div>
            <div className="flex-1 p-3 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
              Got it. I have all the information needed to generate your estimate. Ready when you are!
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGeneratingContent = () => {
    // Find which stage we're on based on current step id
    const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentStep.id);
    const currentStage = PIPELINE_STAGES[currentStageIndex];

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] glass-panel p-8 animate-fadeIn">
        <div className="w-full max-w-xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-truecost-text-primary mb-2">Generating Your Estimate</h2>
            <p className="text-truecost-text-secondary">Our AI agents are analyzing your project...</p>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-truecost-text-secondary mb-2">
              <span>{currentStage?.name || "Starting..."}</span>
              <span>{currentStage?.percent || 0}%</span>
            </div>
            <div className="w-full h-3 bg-truecost-glass-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-truecost-cyan to-truecost-teal transition-all duration-300 ease-out"
                style={{ width: `${currentStage?.percent || 0}%` }}
              />
            </div>
          </div>

          {/* Stage checklist */}
          <div className="space-y-2">
            {PIPELINE_STAGES.map((stage, index) => {
              const isCompleted = index < currentStageIndex;
              const isCurrent = index === currentStageIndex;

              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isCompleted
                      ? "bg-truecost-cyan/10 text-truecost-cyan"
                      : isCurrent
                      ? "bg-truecost-glass-bg text-truecost-text-primary"
                      : "text-truecost-text-muted"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isCurrent ? (
                    <div className="w-5 h-5 border-2 border-truecost-cyan rounded-full border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-5 h-5 border-2 border-truecost-glass-border rounded-full" />
                  )}
                  <span>{stage.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderResultSummary = () => (
    <div className="space-y-6 animate-fadeIn">
      {/* Cost Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 text-center">
          <p className="text-3xl font-bold text-truecost-cyan">${DEMO_ESTIMATE.summary.totalCost.toLocaleString()}</p>
          <p className="text-sm text-truecost-text-secondary">Total Estimate</p>
        </div>
        <div className="glass-panel p-4 text-center">
          <p className="text-3xl font-bold text-truecost-teal">${DEMO_ESTIMATE.summary.costPerSqft}</p>
          <p className="text-sm text-truecost-text-secondary">Per Sq Ft</p>
        </div>
        <div className="glass-panel p-4 text-center">
          <p className="text-3xl font-bold text-truecost-text-primary">{DEMO_ESTIMATE.summary.duration}</p>
          <p className="text-sm text-truecost-text-secondary">Duration</p>
        </div>
        <div className="glass-panel p-4 text-center">
          <p className="text-3xl font-bold capitalize text-yellow-400">{DEMO_ESTIMATE.summary.riskLevel}</p>
          <p className="text-sm text-truecost-text-secondary">Risk Level</p>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-truecost-text-primary mb-4">Cost Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-truecost-glass-bg rounded-lg">
            <p className="text-2xl font-bold text-truecost-cyan">
              ${DEMO_ESTIMATE.costBreakdown.materials.toLocaleString()}
            </p>
            <p className="text-sm text-truecost-text-secondary">Materials</p>
          </div>
          <div className="p-4 bg-truecost-glass-bg rounded-lg">
            <p className="text-2xl font-bold text-truecost-teal">
              ${DEMO_ESTIMATE.costBreakdown.labor.toLocaleString()}
            </p>
            <p className="text-sm text-truecost-text-secondary">Labor</p>
          </div>
          <div className="p-4 bg-truecost-glass-bg rounded-lg">
            <p className="text-2xl font-bold text-truecost-text-primary">
              ${DEMO_ESTIMATE.costBreakdown.equipment.toLocaleString()}
            </p>
            <p className="text-sm text-truecost-text-secondary">Equipment</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold text-truecost-text-primary">
              ${DEMO_ESTIMATE.costBreakdown.overhead.toLocaleString()}
            </p>
            <p className="text-xs text-truecost-text-secondary">Overhead (10%)</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-truecost-text-primary">
              ${DEMO_ESTIMATE.costBreakdown.profit.toLocaleString()}
            </p>
            <p className="text-xs text-truecost-text-secondary">Profit (10%)</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-yellow-400">
              ${DEMO_ESTIMATE.costBreakdown.contingency.toLocaleString()}
            </p>
            <p className="text-xs text-truecost-text-secondary">Contingency (5%)</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderResultMaterials = () => (
    <div className="glass-panel p-6 animate-fadeIn">
      <h3 className="text-lg font-semibold text-truecost-text-primary mb-4">Bill of Materials</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-truecost-text-secondary uppercase border-b border-truecost-glass-border">
              <th className="pb-3 pr-4">Category</th>
              <th className="pb-3 pr-4">Item</th>
              <th className="pb-3 pr-4 text-right">Qty</th>
              <th className="pb-3 pr-4">Unit</th>
              <th className="pb-3 pr-4 text-right">Unit Cost</th>
              <th className="pb-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-truecost-glass-border/50">
            {DEMO_ESTIMATE.materials.map((mat) => (
              <tr key={mat.id} className="hover:bg-truecost-glass-bg/50">
                <td className="py-3 pr-4 text-truecost-text-secondary">{mat.category}</td>
                <td className="py-3 pr-4 text-truecost-text-primary">{mat.item}</td>
                <td className="py-3 pr-4 text-right font-mono">{mat.qty}</td>
                <td className="py-3 pr-4 text-truecost-text-secondary">{mat.unit}</td>
                <td className="py-3 pr-4 text-right font-mono">${mat.unitCost.toFixed(2)}</td>
                <td className="py-3 text-right font-mono text-truecost-cyan">${mat.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-truecost-glass-border font-semibold">
              <td colSpan={5} className="py-3 text-right text-truecost-text-primary">
                Total Materials:
              </td>
              <td className="py-3 text-right text-truecost-cyan">
                ${DEMO_ESTIMATE.materials.reduce((sum, m) => sum + m.total, 0).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  const renderResultLabor = () => (
    <div className="glass-panel p-6 animate-fadeIn">
      <h3 className="text-lg font-semibold text-truecost-text-primary mb-4">Labor Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-truecost-text-secondary uppercase border-b border-truecost-glass-border">
              <th className="pb-3 pr-4">Trade</th>
              <th className="pb-3 pr-4 text-right">Hours</th>
              <th className="pb-3 pr-4 text-right">Rate/Hr</th>
              <th className="pb-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-truecost-glass-border/50">
            {DEMO_ESTIMATE.labor.map((labor) => (
              <tr key={labor.id} className="hover:bg-truecost-glass-bg/50">
                <td className="py-3 pr-4 text-truecost-text-primary">{labor.trade}</td>
                <td className="py-3 pr-4 text-right font-mono">{labor.hours}</td>
                <td className="py-3 pr-4 text-right font-mono">${labor.rate}</td>
                <td className="py-3 text-right font-mono text-truecost-teal">${labor.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-truecost-glass-border font-semibold">
              <td className="py-3 text-truecost-text-primary">Total</td>
              <td className="py-3 text-right font-mono">
                {DEMO_ESTIMATE.labor.reduce((sum, l) => sum + l.hours, 0)} hrs
              </td>
              <td className="py-3"></td>
              <td className="py-3 text-right text-truecost-teal">
                ${DEMO_ESTIMATE.labor.reduce((sum, l) => sum + l.total, 0).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  const renderResultTimeline = () => (
    <div className="glass-panel p-6 animate-fadeIn">
      <h3 className="text-lg font-semibold text-truecost-text-primary mb-4">Project Timeline</h3>
      <div className="space-y-4">
        {DEMO_ESTIMATE.timeline.map((phase, index) => (
          <div key={index} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-truecost-cyan to-truecost-teal flex items-center justify-center text-truecost-bg-primary font-bold">
                {index + 1}
              </div>
              {index < DEMO_ESTIMATE.timeline.length - 1 && (
                <div className="w-0.5 flex-1 bg-truecost-glass-border my-2" />
              )}
            </div>
            <div className="flex-1 pb-6">
              <div className="flex items-center gap-3 mb-2">
                <h4 className="font-semibold text-truecost-text-primary">{phase.phase}</h4>
                <span className="px-2 py-0.5 bg-truecost-cyan/20 text-truecost-cyan text-xs rounded-full">
                  {phase.days} {phase.days === 1 ? "day" : "days"}
                </span>
              </div>
              <ul className="space-y-1">
                {phase.tasks.map((task, taskIndex) => (
                  <li key={taskIndex} className="text-sm text-truecost-text-secondary flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-truecost-text-muted" />
                    {task}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 p-4 bg-truecost-glass-bg rounded-lg text-center">
        <p className="text-truecost-text-secondary">
          Total Duration:{" "}
          <span className="font-semibold text-truecost-text-primary">
            {DEMO_ESTIMATE.timeline.reduce((sum, p) => sum + p.days, 0)} days (
            {Math.ceil(DEMO_ESTIMATE.timeline.reduce((sum, p) => sum + p.days, 0) / 5)} weeks)
          </span>
        </p>
      </div>
    </div>
  );

  const renderResultRisks = () => (
    <div className="glass-panel p-6 animate-fadeIn">
      <h3 className="text-lg font-semibold text-truecost-text-primary mb-4">Risk Analysis</h3>
      <div className="space-y-4">
        {DEMO_ESTIMATE.risks.map((risk, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border ${
              risk.level === "high"
                ? "bg-red-500/10 border-red-500/30"
                : risk.level === "medium"
                ? "bg-yellow-500/10 border-yellow-500/30"
                : "bg-green-500/10 border-green-500/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2 py-0.5 text-xs rounded-full font-medium uppercase ${
                  risk.level === "high"
                    ? "bg-red-500/20 text-red-400"
                    : risk.level === "medium"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-green-500/20 text-green-400"
                }`}
              >
                {risk.level}
              </span>
              <span className="font-semibold text-truecost-text-primary">{risk.item}</span>
            </div>
            <p className="text-sm text-truecost-text-secondary mb-2">
              <span className="font-medium">Mitigation:</span> {risk.mitigation}
            </p>
            <p className="text-sm text-truecost-text-secondary">
              <span className="font-medium">Potential Impact:</span> {risk.impact}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPriceComparison = () => {
    const hdTotal = PRICE_COMPARISON.reduce((sum, item) => sum + item.homeDepot.price * item.qty, 0);
    const lowesTotal = PRICE_COMPARISON.reduce((sum, item) => sum + item.lowes.price * item.qty, 0);
    const bestTotal = PRICE_COMPARISON.reduce(
      (sum, item) => sum + (item.selected === "homeDepot" ? item.homeDepot.price : item.lowes.price) * item.qty,
      0
    );
    const savings = Math.min(hdTotal, lowesTotal) - bestTotal;

    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-panel p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <span className="text-orange-500 font-bold text-sm">HD</span>
              </div>
              <div>
                <p className="text-sm text-truecost-text-secondary">Home Depot Total</p>
                <p className="text-xl font-bold text-truecost-text-primary">${hdTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
          <div className="glass-panel p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <span className="text-blue-500 font-bold text-sm">L</span>
              </div>
              <div>
                <p className="text-sm text-truecost-text-secondary">Lowe's Total</p>
                <p className="text-xl font-bold text-truecost-text-primary">${lowesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
          <div className="glass-panel p-4 border-2 border-truecost-cyan/50">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-truecost-cyan/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-truecost-text-secondary">Best Price (Mixed)</p>
                <p className="text-xl font-bold text-truecost-cyan">${bestTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            <p className="text-xs text-green-400">Save ${savings.toFixed(2)} with smart sourcing</p>
          </div>
        </div>

        {/* Price comparison table */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-truecost-text-primary mb-4">Material Price Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-truecost-text-secondary uppercase border-b border-truecost-glass-border">
                  <th className="pb-3 pr-4">Item</th>
                  <th className="pb-3 pr-4 text-center">Qty</th>
                  <th className="pb-3 pr-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="w-5 h-5 rounded bg-orange-500/20 text-orange-500 text-xs flex items-center justify-center font-bold">HD</span>
                      Home Depot
                    </div>
                  </th>
                  <th className="pb-3 pr-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-500 text-xs flex items-center justify-center font-bold">L</span>
                      Lowe's
                    </div>
                  </th>
                  <th className="pb-3 text-center">Best Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-truecost-glass-border/50">
                {PRICE_COMPARISON.map((item, index) => (
                  <tr key={index} className="hover:bg-truecost-glass-bg/50">
                    <td className="py-3 pr-4">
                      <p className="text-truecost-text-primary font-medium">{item.item}</p>
                    </td>
                    <td className="py-3 pr-4 text-center text-truecost-text-secondary">
                      {item.qty} {item.unit}
                    </td>
                    <td className="py-3 pr-4">
                      <div className={`text-center p-2 rounded ${item.selected === "homeDepot" ? "bg-orange-500/10 border border-orange-500/30" : ""}`}>
                        <p className="font-mono font-medium">${item.homeDepot.price.toFixed(2)}</p>
                        <p className="text-xs text-truecost-text-muted">{item.homeDepot.sku}</p>
                        <span className={`text-xs ${item.homeDepot.inStock ? "text-green-400" : "text-red-400"}`}>
                          {item.homeDepot.inStock ? "In Stock" : "Out of Stock"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className={`text-center p-2 rounded ${item.selected === "lowes" ? "bg-blue-500/10 border border-blue-500/30" : ""}`}>
                        <p className="font-mono font-medium">${item.lowes.price.toFixed(2)}</p>
                        <p className="text-xs text-truecost-text-muted">{item.lowes.sku}</p>
                        <span className={`text-xs ${item.lowes.inStock ? "text-green-400" : "text-red-400"}`}>
                          {item.lowes.inStock ? "In Stock" : "Out of Stock"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <p className="font-mono font-bold text-truecost-cyan">
                        ${((item.selected === "homeDepot" ? item.homeDepot.price : item.lowes.price) * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${item.selected === "homeDepot" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"}`}>
                        {item.selected === "homeDepot" ? "Home Depot" : "Lowe's"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Smart sourcing note */}
        <div className="glass-panel p-4 border-l-4 border-truecost-cyan">
          <p className="text-sm text-truecost-text-secondary">
            <span className="font-semibold text-truecost-text-primary">TrueCost Smart Sourcing:</span> We automatically compare prices across major retailers and factor in availability to recommend the best purchasing strategy for your project.
          </p>
        </div>
      </div>
    );
  };

  const renderAccuracyComparison = () => {
    const { manualEstimate, trueCostEstimate, actualCost } = ACCURACY_COMPARISON;
    const manualVariance = ((manualEstimate.total - actualCost.total) / actualCost.total) * 100;
    const trueCostVariance = ((trueCostEstimate.total - actualCost.total) / actualCost.total) * 100;

    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Header */}
        <div className="glass-panel p-6 text-center">
          <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Estimate Accuracy Comparison</h2>
          <p className="text-truecost-text-secondary">See how TrueCost AI compares to traditional manual estimates</p>
        </div>

        {/* Visual comparison bar */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-truecost-text-primary mb-6">Total Cost Comparison</h3>
          <div className="relative h-16 mb-8">
            {/* Scale line */}
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-truecost-glass-border rounded" />

            {/* Manual estimate marker */}
            <div
              className="absolute top-0 transform -translate-x-1/2"
              style={{ left: `${(manualEstimate.total / actualCost.total) * 50}%` }}
            >
              <div className="w-4 h-16 flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-truecost-bg-primary" />
                <div className="w-0.5 h-6 bg-red-500/50" />
                <span className="text-xs text-red-400 whitespace-nowrap mt-1">Manual</span>
              </div>
            </div>

            {/* TrueCost estimate marker */}
            <div
              className="absolute top-0 transform -translate-x-1/2"
              style={{ left: `${(trueCostEstimate.total / actualCost.total) * 50}%` }}
            >
              <div className="w-4 h-16 flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-truecost-cyan border-2 border-truecost-bg-primary" />
                <div className="w-0.5 h-6 bg-truecost-cyan/50" />
                <span className="text-xs text-truecost-cyan whitespace-nowrap mt-1">TrueCost</span>
              </div>
            </div>

            {/* Actual cost marker */}
            <div
              className="absolute top-0 transform -translate-x-1/2"
              style={{ left: "50%" }}
            >
              <div className="w-4 h-16 flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-truecost-bg-primary" />
                <div className="w-0.5 h-6 bg-green-500/50" />
                <span className="text-xs text-green-400 whitespace-nowrap mt-1">Actual</span>
              </div>
            </div>
          </div>

          {/* Variance indicators */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
              <p className="text-2xl font-bold text-red-400">{manualVariance.toFixed(1)}%</p>
              <p className="text-xs text-truecost-text-secondary">Manual Variance</p>
              <p className="text-lg font-semibold text-truecost-text-primary mt-1">${manualEstimate.total.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
              <p className="text-2xl font-bold text-green-400">Actual</p>
              <p className="text-xs text-truecost-text-secondary">Final Project Cost</p>
              <p className="text-lg font-semibold text-truecost-text-primary mt-1">${actualCost.total.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-truecost-cyan/10 rounded-lg border border-truecost-cyan/30">
              <p className="text-2xl font-bold text-truecost-cyan">{trueCostVariance.toFixed(1)}%</p>
              <p className="text-xs text-truecost-text-secondary">TrueCost Variance</p>
              <p className="text-lg font-semibold text-truecost-text-primary mt-1">${trueCostEstimate.total.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Detailed comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Manual Estimate */}
          <div className="glass-panel p-5 border-t-4 border-red-500">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h4 className="font-semibold text-truecost-text-primary">{manualEstimate.label}</h4>
            </div>
            <p className="text-xs text-truecost-text-secondary mb-4">{manualEstimate.description}</p>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Materials</span>
                <span className="font-mono">${manualEstimate.materials.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Labor</span>
                <span className="font-mono">${manualEstimate.labor.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Overhead</span>
                <span className="font-mono">${manualEstimate.overhead.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Contingency</span>
                <span className="font-mono">${manualEstimate.contingency.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-truecost-glass-border pt-2">
                <span>Total</span>
                <span className="text-red-400">${manualEstimate.total.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-truecost-text-secondary mb-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Time: {manualEstimate.timeToCreate}
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-red-400 mb-2">Issues Found:</p>
              <ul className="space-y-1">
                {manualEstimate.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-truecost-text-secondary flex items-start gap-1">
                    <span className="text-red-400 mt-0.5">×</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* TrueCost Estimate */}
          <div className="glass-panel p-5 border-t-4 border-truecost-cyan ring-2 ring-truecost-cyan/20">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h4 className="font-semibold text-truecost-text-primary">{trueCostEstimate.label}</h4>
            </div>
            <p className="text-xs text-truecost-text-secondary mb-4">{trueCostEstimate.description}</p>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Materials</span>
                <span className="font-mono">${trueCostEstimate.materials.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Labor</span>
                <span className="font-mono">${trueCostEstimate.labor.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Overhead</span>
                <span className="font-mono">${trueCostEstimate.overhead.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Contingency</span>
                <span className="font-mono">${trueCostEstimate.contingency.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-truecost-glass-border pt-2">
                <span>Total</span>
                <span className="text-truecost-cyan">${trueCostEstimate.total.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-truecost-cyan mb-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Time: {trueCostEstimate.timeToCreate}
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-truecost-cyan mb-2">Key Features:</p>
              <ul className="space-y-1">
                {trueCostEstimate.features.map((feature, i) => (
                  <li key={i} className="text-xs text-truecost-text-secondary flex items-start gap-1">
                    <span className="text-truecost-cyan mt-0.5">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Actual Cost */}
          <div className="glass-panel p-5 border-t-4 border-green-500">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="font-semibold text-truecost-text-primary">{actualCost.label}</h4>
            </div>
            <p className="text-xs text-truecost-text-secondary mb-4">{actualCost.description}</p>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Materials</span>
                <span className="font-mono">${actualCost.materials.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Labor</span>
                <span className="font-mono">${actualCost.labor.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Overhead</span>
                <span className="font-mono">${actualCost.overhead.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-truecost-text-secondary">Contingency Used</span>
                <span className="font-mono">${actualCost.contingency.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-truecost-glass-border pt-2">
                <span>Total</span>
                <span className="text-green-400">${actualCost.total.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-green-400 mb-2">Project Notes:</p>
              <ul className="space-y-1">
                {actualCost.notes.map((note, i) => (
                  <li key={i} className="text-xs text-truecost-text-secondary flex items-start gap-1">
                    <span className="text-green-400 mt-0.5">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom line */}
        <div className="glass-panel p-6 bg-gradient-to-r from-truecost-cyan/10 to-truecost-teal/10 border border-truecost-cyan/30">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="font-semibold text-truecost-text-primary mb-1">Bottom Line</h4>
              <p className="text-sm text-truecost-text-secondary">
                TrueCost was within <span className="text-truecost-cyan font-semibold">{Math.abs(trueCostVariance).toFixed(1)}%</span> of actual costs,
                while the manual estimate was off by <span className="text-red-400 font-semibold">{Math.abs(manualVariance).toFixed(1)}%</span> —
                a difference of <span className="text-green-400 font-semibold">${(actualCost.total - manualEstimate.total).toLocaleString()}</span> that would have impacted profitability.
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-truecost-cyan">{(Math.abs(manualVariance) / Math.abs(trueCostVariance)).toFixed(1)}x</p>
              <p className="text-xs text-truecost-text-secondary">More Accurate</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main content renderer based on current step
  const renderContent = () => {
    switch (currentStep.id) {
      case "scope":
        return renderScopeContent();
      case "annotate-plan":
        return renderAnnotatePlanContent();
      case "annotate-chat":
        return renderAnnotateChatContent();
      case "gen-1":
      case "gen-2":
      case "gen-3":
      case "gen-4":
      case "gen-5":
      case "gen-6":
      case "gen-7":
        return renderGeneratingContent();
      case "result-summary":
        return renderResultSummary();
      case "result-materials":
        return renderResultMaterials();
      case "result-labor":
        return renderResultLabor();
      case "result-timeline":
        return renderResultTimeline();
      case "result-risks":
        return renderResultRisks();
      case "result-price-compare":
        return renderPriceComparison();
      case "result-accuracy":
        return renderAccuracyComparison();
      default:
        return null;
    }
  };

  return (
    <PublicLayout>
      <div className="min-h-screen bg-truecost-bg-primary pt-20 pb-12">
        <div className="container-spacious max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-6">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-truecost-cyan/20 text-truecost-cyan border border-truecost-cyan/30 mb-4">
              Interactive Demo
            </span>
            <h1 className="text-3xl md:text-4xl font-bold text-truecost-text-primary mb-2">
              TrueCost Estimation Workflow
            </h1>
            <p className="text-truecost-text-secondary max-w-2xl mx-auto">
              See how TrueCost transforms project scope into accurate, detailed construction estimates
            </p>
          </div>

          {/* Workflow Stepper */}
          {renderStepper()}

          {/* Step indicator dots */}
          {renderStepDots()}

          {/* Current step label */}
          <div className="text-center mb-6">
            <span className="inline-flex items-center px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
              <span className="text-truecost-text-secondary text-sm mr-2">
                Step {currentStepIndex + 1} of {DEMO_STEPS.length}:
              </span>
              <span className="text-truecost-text-primary font-medium">{currentStep.label}</span>
            </span>
          </div>

          {/* Content */}
          {renderContent()}

          {/* Navigation buttons */}
          <div className="flex justify-center items-center gap-4 mt-8">
            <button
              onClick={goPrev}
              disabled={isFirstStep}
              className={`px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 ${
                isFirstStep
                  ? "bg-truecost-glass-bg text-truecost-text-muted cursor-not-allowed"
                  : "btn-pill-secondary"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            <span className="text-truecost-text-secondary text-sm px-4">
              {currentStepIndex + 1} / {DEMO_STEPS.length}
            </span>

            <button
              onClick={goNext}
              disabled={isLastStep}
              className={`px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 ${
                isLastStep
                  ? "bg-truecost-glass-bg text-truecost-text-muted cursor-not-allowed"
                  : "btn-pill-primary"
              }`}
            >
              Next
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Keyboard hint */}
          <p className="text-center text-truecost-text-muted text-xs mt-4">
            Press <kbd className="px-1.5 py-0.5 bg-truecost-glass-bg rounded border border-truecost-glass-border mx-0.5">→</kbd> or <kbd className="px-1.5 py-0.5 bg-truecost-glass-bg rounded border border-truecost-glass-border mx-0.5">Space</kbd> for next, <kbd className="px-1.5 py-0.5 bg-truecost-glass-bg rounded border border-truecost-glass-border mx-0.5">←</kbd> for previous
          </p>
        </div>
      </div>

      {/* Keyboard navigation */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .writing-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
      `}</style>
    </PublicLayout>
  );
}
