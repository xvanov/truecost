/**
 * DemoPage - Full-screen step-by-step demo walkthrough of the TrueCost estimation workflow
 * Shows hardcoded bathroom remodel example through Scope → Annotate → Estimate
 * Toggle through each step with Previous/Next buttons
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";

// Asset imports
import heroVideo from "../assets/animated_hero.mp4";
import logo from "../assets/logo.png";
import floorPlanGemini from "../assets/floor_plan_gemini.png";
import qrCodeImage from "../assets/qr-code.png";
import { teamMembers } from "../assets/team/teamMembers";
import "../styles/hero.css";

// All demo steps in order (simplified - removed materials, labor, timeline, risk pages)
const DEMO_STEPS = [
  { id: "home", label: "Welcome", phase: "home" },
  { id: "scope", label: "Project Scope", phase: "scope" },
  { id: "annotate-plan", label: "Plan Annotations", phase: "annotate" },
  { id: "annotate-chat", label: "AI Clarification", phase: "annotate" },
  { id: "gen-1", label: "Scope Agent", phase: "generating" },
  { id: "gen-2", label: "Location Agent", phase: "generating" },
  { id: "gen-3", label: "Cost Agent", phase: "generating" },
  { id: "gen-4", label: "Code Compliance Agent", phase: "generating" },
  { id: "gen-5", label: "Risk Agent", phase: "generating" },
  { id: "gen-6", label: "Timeline Agent", phase: "generating" },
  { id: "gen-7", label: "Final Agent", phase: "generating" },
  { id: "result-summary", label: "Estimate Summary", phase: "results" },
  { id: "result-price-compare", label: "Price Comparison", phase: "results" },
  { id: "result-pdf", label: "PDF Reports", phase: "results" },
  { id: "result-accuracy", label: "Estimate Accuracy", phase: "results" },
  { id: "differentiator", label: "Why TrueCost", phase: "about" },
  { id: "pricing", label: "Pricing", phase: "about" },
  { id: "about-us", label: "Meet the Team", phase: "about" },
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

// CSI Divisions detected from scope
const CSI_DIVISIONS = [
  { code: "03", name: "Concrete", items: ["Foundation repair allowance"] },
  { code: "06", name: "Wood, Plastics, and Composites", items: ["Knee wall framing", "Pressure treated 2x4 studs"] },
  { code: "07", name: "Thermal & Moisture Protection", items: ["Waterproof membrane (Kerdi)", "Waterproofing corners & bands"] },
  { code: "09", name: "Finishes", items: ["Large format porcelain tile", "Tile adhesive", "Epoxy grout", "Moisture resistant drywall", "Cabinet paint"] },
  { code: "22", name: "Plumbing", items: ["Ceiling mount shower head", "Copper pipe", "Toilet", "Wax ring & bolts"] },
  { code: "26", name: "Electrical", items: ["LED recessed light kit", "Dimmer switch", "Romex wire"] },
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
};

// Actual DeepAgent pipeline stages
const PIPELINE_STAGES = [
  { id: "gen-1", name: "Scope Agent", description: "Extracting and validating project scope from description", icon: "📋", percent: 10 },
  { id: "gen-2", name: "Location Agent", description: "Analyzing regional labor rates and material costs for SF Bay Area", icon: "📍", percent: 25 },
  { id: "gen-3", name: "Cost Agent", description: "Calculating material quantities and pricing from multiple vendors", icon: "💰", percent: 40 },
  { id: "gen-4", name: "Code Compliance Agent", description: "Verifying building codes and permit requirements", icon: "📜", percent: 55 },
  { id: "gen-5", name: "Risk Agent", description: "Identifying potential risks and mitigation strategies", icon: "⚠️", percent: 70 },
  { id: "gen-6", name: "Timeline Agent", description: "Building project schedule with trade dependencies", icon: "📅", percent: 85 },
  { id: "gen-7", name: "Final Agent", description: "Assembling comprehensive estimate with Monte Carlo simulation", icon: "✅", percent: 100 },
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

// Annotation types
type AnnotationPoint = { x: number; y: number };
type Annotation = {
  id: number;
  type: "polyline" | "polygon";
  points: AnnotationPoint[];
  label: string;
  color: string;
};

export function DemoPage() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<AnnotationPoint[]>([]);
  const [annotationMode, setAnnotationMode] = useState<"polyline" | "polygon" | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfsGenerated, setPdfsGenerated] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

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

  // Canvas annotation handling
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!annotationMode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCurrentAnnotation([...currentAnnotation, { x, y }]);
  };

  const finishAnnotation = () => {
    if (currentAnnotation.length < 2) return;

    const colors = ["#00D4FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
    const newAnnotation: Annotation = {
      id: Date.now(),
      type: annotationMode!,
      points: currentAnnotation,
      label: `Area ${annotations.length + 1}`,
      color: colors[annotations.length % colors.length],
    };

    setAnnotations([...annotations, newAnnotation]);
    setCurrentAnnotation([]);
    setAnnotationMode(null);
  };

  const clearAnnotations = () => {
    setAnnotations([]);
    setCurrentAnnotation([]);
    setAnnotationMode(null);
  };

  // Draw annotations on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || currentStep.id !== "annotate-plan") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and redraw
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing annotations
    annotations.forEach((ann) => {
      if (ann.points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 3;
      ctx.fillStyle = ann.color + "33";

      const startX = (ann.points[0].x / 100) * canvas.width;
      const startY = (ann.points[0].y / 100) * canvas.height;
      ctx.moveTo(startX, startY);

      ann.points.slice(1).forEach((p) => {
        ctx.lineTo((p.x / 100) * canvas.width, (p.y / 100) * canvas.height);
      });

      if (ann.type === "polygon") {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();

      // Draw label
      const centerX = ann.points.reduce((sum, p) => sum + p.x, 0) / ann.points.length;
      const centerY = ann.points.reduce((sum, p) => sum + p.y, 0) / ann.points.length;
      ctx.fillStyle = ann.color;
      ctx.font = "bold 14px Inter";
      ctx.fillText(ann.label, (centerX / 100) * canvas.width - 20, (centerY / 100) * canvas.height);
    });

    // Draw current annotation in progress
    if (currentAnnotation.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "#00D4FF";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      const startX = (currentAnnotation[0].x / 100) * canvas.width;
      const startY = (currentAnnotation[0].y / 100) * canvas.height;
      ctx.moveTo(startX, startY);

      currentAnnotation.slice(1).forEach((p) => {
        ctx.lineTo((p.x / 100) * canvas.width, (p.y / 100) * canvas.height);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw points
      currentAnnotation.forEach((p) => {
        ctx.beginPath();
        ctx.arc((p.x / 100) * canvas.width, (p.y / 100) * canvas.height, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#00D4FF";
        ctx.fill();
      });
    }
  }, [annotations, currentAnnotation, currentStep.id]);

  // Generate PDFs
  const generatePdfs = async () => {
    setPdfLoading(true);
    // Simulate PDF generation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setPdfsGenerated(true);
    setPdfLoading(false);
  };

  // Content renderers
  const renderHomeContent = () => (
    <section className="hero" style={{ minHeight: "100vh", paddingTop: 0 }}>
      <div className="hero__background">
        <video
          className="hero__bg-image"
          src={heroVideo}
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="hero__overlay" />
      </div>

      <div className="hero__content container-spacious">
        <div className="hero__card" style={{ opacity: 1, animation: "none" }}>
          <div className="hero__logo">
            <img src={logo} alt="TrueCost logo" className="hero__logo-img" />
            <span className="hero__logo-text">TRUECOST</span>
          </div>

          <h1 className="hero__title">AI-Powered Construction Estimating</h1>
          <p className="hero__subtitle">
            Transform project blueprints into accurate, detailed estimates in minutes, not hours.
            Watch our demo to see TrueCost in action.
          </p>

          <div className="hero__actions">
            <button onClick={goNext} className="hero__btn hero__btn--primary">
              Start Demo →
            </button>
            <Link to="/signup" className="hero__btn hero__btn--secondary">
              <span className="hero__btn-icon">▶</span> Get Started
            </Link>
          </div>
        </div>
      </div>
    </section>
  );

  const renderScopeContent = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
      <div className="flex-1 max-w-6xl mx-auto w-full space-y-4">
        {/* Project Details */}
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

        {/* Scope Description */}
        <div className="glass-panel p-6">
          <h2 className="text-xl font-semibold text-truecost-text-primary mb-4">Scope Description</h2>
          <div className="p-4 bg-truecost-glass-bg rounded-lg text-truecost-text-primary leading-relaxed">
            {DEMO_SCOPE.scopeText}
          </div>
        </div>

        {/* Estimate Configuration */}
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

        {/* Auto-generated CSI Divisions */}
        <div className="glass-panel p-6 flex-1">
          <h2 className="text-xl font-semibold text-truecost-text-primary mb-4">
            Auto-Detected CSI Divisions
            <span className="ml-2 text-sm font-normal text-truecost-text-secondary">(from scope analysis)</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CSI_DIVISIONS.map((div) => (
              <div key={div.code} className="p-4 bg-truecost-glass-bg rounded-lg border border-truecost-glass-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-truecost-cyan/20 text-truecost-cyan text-xs font-mono rounded">
                    Div {div.code}
                  </span>
                  <span className="font-medium text-truecost-text-primary text-sm">{div.name}</span>
                </div>
                <ul className="space-y-1">
                  {div.items.map((item, idx) => (
                    <li key={idx} className="text-xs text-truecost-text-secondary flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-truecost-cyan" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnnotatePlanContent = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
      <div className="flex-1 max-w-6xl mx-auto w-full">
        <div className="glass-panel p-6 h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-truecost-text-primary">Plan Annotations</h2>
              <p className="text-truecost-text-secondary text-sm">
                Draw polylines and polygons to annotate areas on the floor plan
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAnnotationMode("polyline")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  annotationMode === "polyline"
                    ? "bg-truecost-cyan text-truecost-bg-primary"
                    : "bg-truecost-glass-bg text-truecost-text-primary border border-truecost-glass-border hover:border-truecost-cyan/50"
                }`}
              >
                📏 Polyline
              </button>
              <button
                onClick={() => setAnnotationMode("polygon")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  annotationMode === "polygon"
                    ? "bg-truecost-cyan text-truecost-bg-primary"
                    : "bg-truecost-glass-bg text-truecost-text-primary border border-truecost-glass-border hover:border-truecost-cyan/50"
                }`}
              >
                ⬡ Polygon
              </button>
              {currentAnnotation.length >= 2 && (
                <button
                  onClick={finishAnnotation}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600"
                >
                  ✓ Finish
                </button>
              )}
              {annotations.length > 0 && (
                <button
                  onClick={clearAnnotations}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Floor plan with canvas overlay */}
          <div className="relative flex-1 bg-white rounded-xl overflow-hidden" style={{ minHeight: "500px" }}>
            <img
              ref={imageRef}
              src={floorPlanGemini}
              alt="Floor Plan"
              className="absolute inset-0 w-full h-full object-contain"
              onLoad={() => {
                if (canvasRef.current && imageRef.current) {
                  canvasRef.current.width = imageRef.current.clientWidth;
                  canvasRef.current.height = imageRef.current.clientHeight;
                }
              }}
            />
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className={`absolute inset-0 w-full h-full ${annotationMode ? "cursor-crosshair" : ""}`}
              style={{ pointerEvents: annotationMode ? "auto" : "none" }}
            />
            {annotationMode && (
              <div className="absolute top-4 left-4 px-3 py-2 bg-truecost-bg-primary/90 rounded-lg border border-truecost-cyan text-truecost-cyan text-sm">
                Click to add points. {currentAnnotation.length >= 2 ? "Click 'Finish' when done." : `${2 - currentAnnotation.length} more point(s) needed.`}
              </div>
            )}
          </div>

          {/* Annotations list */}
          {annotations.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {annotations.map((ann) => (
                <div
                  key={ann.id}
                  className="p-3 bg-truecost-glass-bg rounded-lg border border-truecost-glass-border"
                  style={{ borderLeftColor: ann.color, borderLeftWidth: 4 }}
                >
                  <span className="font-medium text-truecost-text-primary text-sm">{ann.label}</span>
                  <p className="text-xs text-truecost-text-secondary">
                    {ann.type === "polyline" ? "Line" : "Area"} • {ann.points.length} points
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderAnnotateChatContent = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
      <div className="flex-1 max-w-4xl mx-auto w-full">
        <div className="glass-panel p-6 h-full flex flex-col" style={{ minHeight: "calc(100vh - 200px)" }}>
          <h2 className="text-xl font-semibold text-truecost-text-primary mb-2">AI Clarification Chat</h2>
          <p className="text-truecost-text-secondary mb-4">
            The AI assistant asks clarifying questions to ensure accurate estimates:
          </p>

          {/* Chat messages with scroller */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2" style={{ maxHeight: "calc(100vh - 350px)" }}>
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-sm flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-4 bg-truecost-glass-bg rounded-lg text-truecost-text-primary">
                I've analyzed the floor plan. The bathroom is approximately 85 sq ft. I see a separate shower cabin and
                bathtub with a knee wall between them. Can you confirm the ceiling height for the recessed lighting?
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <div className="flex-1 max-w-[80%] p-4 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary">
                The ceiling height is 9 feet. We want 6 recessed lights total, evenly distributed.
              </div>
              <div className="w-10 h-10 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-sm flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-sm flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-4 bg-truecost-glass-bg rounded-lg text-truecost-text-primary">
                Perfect. For the large format tiles on the shower walls, what size are you planning? Standard options are
                24x48 or 12x24 porcelain.
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <div className="flex-1 max-w-[80%] p-4 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary">
                24x48 porcelain tiles for a modern look. Grey/neutral color.
              </div>
              <div className="w-10 h-10 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-sm flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-sm flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-4 bg-truecost-glass-bg rounded-lg text-truecost-text-primary">
                The knee wall between the shower and bathtub - should this be rebuilt to the same height, or do you want
                modifications? Also, what finish for the shower head assembly?
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <div className="flex-1 max-w-[80%] p-4 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary">
                Same height, about 4 feet. Chrome finish for all fixtures.
              </div>
              <div className="w-10 h-10 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-sm flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-sm flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-4 bg-truecost-glass-bg rounded-lg text-truecost-text-primary">
                Great! One more question - do you have an existing permit or will you need one pulled? San Francisco
                typically requires permits for bathroom remodels involving plumbing and electrical changes.
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <div className="flex-1 max-w-[80%] p-4 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary">
                We'll need to pull a permit. Please include that in the estimate.
              </div>
              <div className="w-10 h-10 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-sm flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-sm flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-4 bg-truecost-glass-bg rounded-lg text-truecost-text-primary border border-green-500/30">
                <span className="text-green-400 font-medium">✓ All clarifications complete!</span><br /><br />
                I have all the information needed to generate your estimate. The system will now run through our
                multi-agent pipeline to create a comprehensive, accurate estimate.
              </div>
            </div>
          </div>

          {/* Input area (disabled for demo) */}
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              placeholder="Type a message..."
              disabled
              className="flex-1 p-3 bg-truecost-glass-bg rounded-lg border border-truecost-glass-border text-truecost-text-primary placeholder-truecost-text-muted"
            />
            <button disabled className="px-6 py-3 bg-truecost-glass-border text-truecost-text-muted rounded-lg">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGeneratingContent = () => {
    const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentStep.id);
    const currentStage = PIPELINE_STAGES[currentStageIndex];

    return (
      <div className="min-h-screen flex items-center justify-center bg-truecost-bg-primary px-4">
        <div className="w-full max-w-3xl">
          <div className="glass-panel p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-truecost-text-primary mb-2">Generating Your Estimate</h2>
              <p className="text-truecost-text-secondary">Our DeepAgent pipeline is analyzing your project...</p>
            </div>

            {/* Progress bar */}
            <div className="mb-8">
              <div className="flex justify-between text-sm text-truecost-text-secondary mb-2">
                <span>{currentStage?.name || "Starting..."}</span>
                <span>{currentStage?.percent || 0}%</span>
              </div>
              <div className="w-full h-4 bg-truecost-glass-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-truecost-cyan to-truecost-teal transition-all duration-500 ease-out"
                  style={{ width: `${currentStage?.percent || 0}%` }}
                />
              </div>
            </div>

            {/* Agent checklist */}
            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage, index) => {
                const isCompleted = index < currentStageIndex;
                const isCurrent = index === currentStageIndex;

                return (
                  <div
                    key={stage.id}
                    className={`flex items-start gap-4 p-4 rounded-lg transition-all ${
                      isCompleted
                        ? "bg-truecost-cyan/10 border border-truecost-cyan/30"
                        : isCurrent
                        ? "bg-truecost-glass-bg border border-truecost-cyan animate-pulse"
                        : "bg-truecost-glass-bg/50 border border-transparent"
                    }`}
                  >
                    <div className="text-2xl">{stage.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isCompleted || isCurrent ? "text-truecost-text-primary" : "text-truecost-text-muted"}`}>
                          {stage.name}
                        </span>
                        {isCompleted && (
                          <svg className="w-5 h-5 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {isCurrent && (
                          <div className="w-4 h-4 border-2 border-truecost-cyan rounded-full border-t-transparent animate-spin" />
                        )}
                      </div>
                      <p className={`text-sm mt-1 ${isCompleted || isCurrent ? "text-truecost-text-secondary" : "text-truecost-text-muted"}`}>
                        {stage.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderResultSummary = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
      <div className="flex-1 max-w-6xl mx-auto w-full space-y-6">
        {/* Cost Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel p-6 text-center">
            <p className="text-4xl font-bold text-truecost-cyan">${DEMO_ESTIMATE.summary.totalCost.toLocaleString()}</p>
            <p className="text-sm text-truecost-text-secondary mt-1">Total Estimate</p>
          </div>
          <div className="glass-panel p-6 text-center">
            <p className="text-4xl font-bold text-truecost-teal">${DEMO_ESTIMATE.summary.costPerSqft}</p>
            <p className="text-sm text-truecost-text-secondary mt-1">Per Sq Ft</p>
          </div>
          <div className="glass-panel p-6 text-center">
            <p className="text-4xl font-bold text-truecost-text-primary">{DEMO_ESTIMATE.summary.duration}</p>
            <p className="text-sm text-truecost-text-secondary mt-1">Duration</p>
          </div>
          <div className="glass-panel p-6 text-center">
            <p className="text-4xl font-bold capitalize text-yellow-400">{DEMO_ESTIMATE.summary.riskLevel}</p>
            <p className="text-sm text-truecost-text-secondary mt-1">Risk Level</p>
          </div>
        </div>

        {/* Main breakdown with materials and labor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Materials Summary */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-4 flex items-center gap-2">
              <span className="text-2xl">🧱</span> Materials
              <span className="ml-auto text-2xl font-bold text-truecost-cyan">
                ${DEMO_ESTIMATE.costBreakdown.materials.toLocaleString()}
              </span>
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {DEMO_ESTIMATE.materials.slice(0, 10).map((mat) => (
                <div key={mat.id} className="flex justify-between items-center p-2 bg-truecost-glass-bg/50 rounded">
                  <div>
                    <p className="text-sm text-truecost-text-primary">{mat.item}</p>
                    <p className="text-xs text-truecost-text-muted">{mat.qty} {mat.unit}</p>
                  </div>
                  <span className="font-mono text-truecost-cyan">${mat.total}</span>
                </div>
              ))}
              <p className="text-xs text-truecost-text-muted text-center">+ {DEMO_ESTIMATE.materials.length - 10} more items</p>
            </div>
          </div>

          {/* Labor Summary */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-4 flex items-center gap-2">
              <span className="text-2xl">👷</span> Labor
              <span className="ml-auto text-2xl font-bold text-truecost-teal">
                ${DEMO_ESTIMATE.costBreakdown.labor.toLocaleString()}
              </span>
            </h3>
            <div className="space-y-2">
              {DEMO_ESTIMATE.labor.map((labor) => (
                <div key={labor.id} className="flex justify-between items-center p-2 bg-truecost-glass-bg/50 rounded">
                  <div>
                    <p className="text-sm text-truecost-text-primary">{labor.trade}</p>
                    <p className="text-xs text-truecost-text-muted">{labor.hours} hrs @ ${labor.rate}/hr</p>
                  </div>
                  <span className="font-mono text-truecost-teal">${labor.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Additional costs */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-truecost-text-primary mb-4">Additional Costs</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-truecost-glass-bg rounded-lg">
              <p className="text-2xl font-bold text-truecost-text-primary">
                ${DEMO_ESTIMATE.costBreakdown.equipment.toLocaleString()}
              </p>
              <p className="text-xs text-truecost-text-secondary">Equipment</p>
            </div>
            <div className="text-center p-4 bg-truecost-glass-bg rounded-lg">
              <p className="text-2xl font-bold text-truecost-text-primary">
                ${DEMO_ESTIMATE.costBreakdown.overhead.toLocaleString()}
              </p>
              <p className="text-xs text-truecost-text-secondary">Overhead (10%)</p>
            </div>
            <div className="text-center p-4 bg-truecost-glass-bg rounded-lg">
              <p className="text-2xl font-bold text-truecost-text-primary">
                ${DEMO_ESTIMATE.costBreakdown.profit.toLocaleString()}
              </p>
              <p className="text-xs text-truecost-text-secondary">Profit (10%)</p>
            </div>
            <div className="text-center p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
              <p className="text-2xl font-bold text-yellow-400">
                ${DEMO_ESTIMATE.costBreakdown.contingency.toLocaleString()}
              </p>
              <p className="text-xs text-truecost-text-secondary">Contingency (5%)</p>
            </div>
          </div>
        </div>
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
      <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
        <div className="flex-1 max-w-6xl mx-auto w-full space-y-6">
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
          <div className="glass-panel p-6 flex-1">
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-4">Material Price Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-truecost-text-secondary uppercase border-b border-truecost-glass-border">
                    <th className="pb-3 pr-4">Item</th>
                    <th className="pb-3 pr-4 text-center">Qty</th>
                    <th className="pb-3 pr-4 text-center">Home Depot</th>
                    <th className="pb-3 pr-4 text-center">Lowe's</th>
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
                          <span className={`text-xs ${item.homeDepot.inStock ? "text-green-400" : "text-red-400"}`}>
                            {item.homeDepot.inStock ? "In Stock" : "Out of Stock"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className={`text-center p-2 rounded ${item.selected === "lowes" ? "bg-blue-500/10 border border-blue-500/30" : ""}`}>
                          <p className="font-mono font-medium">${item.lowes.price.toFixed(2)}</p>
                          <span className={`text-xs ${item.lowes.inStock ? "text-green-400" : "text-red-400"}`}>
                            {item.lowes.inStock ? "In Stock" : "Out of Stock"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <p className="font-mono font-bold text-truecost-cyan">
                          ${((item.selected === "homeDepot" ? item.homeDepot.price : item.lowes.price) * item.qty).toFixed(2)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPDFReports = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
      <div className="flex-1 max-w-6xl mx-auto w-full">
        <div className="glass-panel p-6 text-center mb-6">
          <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">PDF Reports</h2>
          <p className="text-truecost-text-secondary">
            Generate professional contractor and client reports
          </p>
          {!pdfsGenerated && (
            <button
              onClick={generatePdfs}
              disabled={pdfLoading}
              className="mt-4 px-6 py-3 bg-truecost-cyan text-truecost-bg-primary rounded-lg font-medium hover:bg-truecost-cyan/90 disabled:opacity-50"
            >
              {pdfLoading ? "Generating..." : "Generate PDF Reports"}
            </button>
          )}
        </div>

        {/* Side by side PDFs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contractor Report */}
          <div className="glass-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-14 bg-red-500/20 rounded flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-truecost-text-primary">Contractor Report</h3>
                <p className="text-sm text-truecost-text-secondary">Full breakdown with unit costs & labor rates</p>
              </div>
            </div>
            {pdfsGenerated ? (
              <div className="bg-white rounded-lg overflow-hidden" style={{ height: "500px" }}>
                <iframe
                  src="/contractor_report.pdf"
                  className="w-full h-full"
                  title="Contractor Report"
                />
              </div>
            ) : (
              <div className="bg-truecost-glass-bg rounded-lg flex items-center justify-center" style={{ height: "500px" }}>
                <p className="text-truecost-text-muted">Click "Generate PDF Reports" to view</p>
              </div>
            )}
          </div>

          {/* Client Report */}
          <div className="glass-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-14 bg-blue-500/20 rounded flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-truecost-text-primary">Client Report</h3>
                <p className="text-sm text-truecost-text-secondary">Executive summary without sensitive pricing</p>
              </div>
            </div>
            {pdfsGenerated ? (
              <div className="bg-white rounded-lg overflow-hidden" style={{ height: "500px" }}>
                <iframe
                  src="/client_report.pdf"
                  className="w-full h-full"
                  title="Client Report"
                />
              </div>
            ) : (
              <div className="bg-truecost-glass-bg rounded-lg flex items-center justify-center" style={{ height: "500px" }}>
                <p className="text-truecost-text-muted">Click "Generate PDF Reports" to view</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAccuracyComparison = () => {
    const { manualEstimate, trueCostEstimate, actualCost } = ACCURACY_COMPARISON;
    const manualVariance = ((manualEstimate.total - actualCost.total) / actualCost.total) * 100;
    const trueCostVariance = ((trueCostEstimate.total - actualCost.total) / actualCost.total) * 100;

    // Calculate positions for the linear graph (scale from 70% to 110% of actual)
    const scale = (value: number) => ((value / actualCost.total - 0.7) / 0.4) * 100;
    const manualPos = Math.max(0, Math.min(100, scale(manualEstimate.total)));
    const trueCostPos = Math.max(0, Math.min(100, scale(trueCostEstimate.total)));
    const actualPos = scale(actualCost.total);

    return (
      <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
        <div className="flex-1 max-w-6xl mx-auto w-full space-y-6">
          {/* Header */}
          <div className="glass-panel p-6 text-center">
            <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Estimate Accuracy Comparison</h2>
            <p className="text-truecost-text-secondary">See how TrueCost AI compares to traditional manual estimates</p>
          </div>

          {/* Visual comparison bar - FIXED label overlap */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-8">Total Cost Comparison</h3>
            <div className="relative h-32 mb-4">
              {/* Scale line */}
              <div className="absolute top-12 left-0 right-0 h-2 bg-truecost-glass-border rounded-full" />

              {/* Scale labels */}
              <div className="absolute top-16 left-0 text-xs text-truecost-text-muted">$20k</div>
              <div className="absolute top-16 right-0 text-xs text-truecost-text-muted">$32k</div>

              {/* Manual estimate marker - positioned above line */}
              <div
                className="absolute transform -translate-x-1/2"
                style={{ left: `${manualPos}%`, top: 0 }}
              >
                <div className="flex flex-col items-center">
                  <span className="text-xs text-red-400 font-medium whitespace-nowrap mb-1">Manual</span>
                  <span className="text-xs text-red-400 font-bold">${(manualEstimate.total/1000).toFixed(1)}k</span>
                  <div className="w-0.5 h-4 bg-red-500/50 my-1" />
                  <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-truecost-bg-primary" />
                </div>
              </div>

              {/* TrueCost estimate marker - positioned below line */}
              <div
                className="absolute transform -translate-x-1/2"
                style={{ left: `${trueCostPos}%`, top: "52px" }}
              >
                <div className="flex flex-col items-center">
                  <div className="w-4 h-4 rounded-full bg-truecost-cyan border-2 border-truecost-bg-primary" />
                  <div className="w-0.5 h-4 bg-truecost-cyan/50 my-1" />
                  <span className="text-xs text-truecost-cyan font-bold">${(trueCostEstimate.total/1000).toFixed(1)}k</span>
                  <span className="text-xs text-truecost-cyan font-medium whitespace-nowrap mt-1">TrueCost</span>
                </div>
              </div>

              {/* Actual cost marker - centered with different styling */}
              <div
                className="absolute transform -translate-x-1/2"
                style={{ left: `${actualPos}%`, top: "4px" }}
              >
                <div className="flex flex-col items-center">
                  <span className="text-xs text-green-400 font-medium whitespace-nowrap px-2 py-1 bg-green-500/20 rounded">Actual: ${(actualCost.total/1000).toFixed(1)}k</span>
                  <div className="w-0.5 h-2 bg-green-500/50 my-1" />
                  <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-truecost-bg-primary flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Variance indicators */}
            <div className="grid grid-cols-3 gap-4 text-center mt-8">
              <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                <p className="text-2xl font-bold text-red-400">{manualVariance.toFixed(1)}%</p>
                <p className="text-xs text-truecost-text-secondary">Manual Variance</p>
              </div>
              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                <p className="text-2xl font-bold text-green-400">Baseline</p>
                <p className="text-xs text-truecost-text-secondary">Actual Cost</p>
              </div>
              <div className="p-4 bg-truecost-cyan/10 rounded-lg border border-truecost-cyan/30">
                <p className="text-2xl font-bold text-truecost-cyan">{trueCostVariance.toFixed(1)}%</p>
                <p className="text-xs text-truecost-text-secondary">TrueCost Variance</p>
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
      </div>
    );
  };

  const renderDifferentiatorContent = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
      <div className="flex-1 max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="glass-panel p-6 text-center">
          <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Why Choose TrueCost?</h2>
          <p className="text-truecost-text-secondary">Built by contractors, for contractors</p>
        </div>

        {/* Key differentiator - Field Experience */}
        <div className="glass-panel p-8 bg-gradient-to-r from-truecost-cyan/10 to-truecost-teal/10 border border-truecost-cyan/30">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-truecost-cyan/20 flex items-center justify-center flex-shrink-0">
              <span className="text-5xl">🏗️</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-truecost-text-primary mb-2">
                We're Builders First, Tech Company Second
              </h3>
              <p className="text-truecost-text-secondary leading-relaxed">
                TrueCost was founded by <span className="text-truecost-cyan font-semibold">licensed general contractors</span> with
                decades of field experience. We're not a Silicon Valley AI company trying to "disrupt" construction —
                we're <span className="text-truecost-cyan font-semibold">builders who got frustrated</span> with inaccurate estimates
                and decided to do something about it. Every feature, every calculation, every assumption in our system comes
                from <span className="text-truecost-cyan font-semibold">real-world experience</span> on job sites, not textbooks.
              </p>
            </div>
          </div>
        </div>

        {/* Key Differentiators Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel p-6">
            <div className="w-12 h-12 rounded-full bg-truecost-cyan/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-truecost-text-primary mb-2">120x Faster</h3>
            <p className="text-truecost-text-secondary">
              What takes 6+ hours manually, TrueCost completes in 3 minutes.
              More time for client relationships, less time on spreadsheets.
            </p>
          </div>

          <div className="glass-panel p-6">
            <div className="w-12 h-12 rounded-full bg-truecost-teal/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-truecost-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-truecost-text-primary mb-2">Field-Tested Accuracy</h3>
            <p className="text-truecost-text-secondary">
              Our estimates are calibrated against <span className="text-truecost-teal font-semibold">real project outcomes</span>.
              We know the difference between a bid and a realistic budget.
            </p>
          </div>

          <div className="glass-panel p-6">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-truecost-text-primary mb-2">No Fluff, Just Facts</h3>
            <p className="text-truecost-text-secondary">
              We don't pad estimates or hide fees. What you see is what the job actually costs.
              Built on <span className="text-green-500 font-semibold">real vendor pricing</span> and regional labor data.
            </p>
          </div>

          <div className="glass-panel p-6">
            <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-truecost-text-primary mb-2">Contractor Community</h3>
            <p className="text-truecost-text-secondary">
              We speak your language. Our support team includes <span className="text-purple-500 font-semibold">licensed contractors</span> who
              understand the realities of running a construction business.
            </p>
          </div>
        </div>

        {/* Quote */}
        <div className="glass-panel p-6 text-center">
          <blockquote className="text-lg text-truecost-text-primary italic">
            "We built TrueCost because we were tired of losing money on jobs we under-bid
            and losing clients on jobs we over-bid. Now our estimates are right, every time."
          </blockquote>
          <p className="text-sm text-truecost-cyan mt-4">— TrueCost Founding Team</p>
        </div>
      </div>
    </div>
  );

  const renderPricingContent = () => {
    const plans = [
      {
        name: "Trial",
        price: "Free",
        period: "",
        description: "Try TrueCost with full capabilities",
        features: ["1 trial project", "Full AI analysis", "Detailed CSI breakdown", "Export to PDF"],
        highlighted: false,
      },
      {
        name: "Professional",
        price: "$399",
        period: "/month",
        description: "For contractors and small teams",
        features: ["Unlimited projects", "Advanced AI analysis", "Priority support", "Detailed CSI breakdown", "Risk assessment", "Timeline generation"],
        highlighted: true,
      },
      {
        name: "Enterprise",
        price: "Custom",
        period: "",
        description: "For large organizations",
        features: ["Everything in Professional", "Custom integrations", "Dedicated account manager", "On-premise deployment", "SLA guarantee", "Custom AI training"],
        highlighted: false,
      },
    ];

    return (
      <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
        <div className="flex-1 max-w-5xl mx-auto w-full space-y-6">
          {/* Header */}
          <div className="glass-panel p-6 text-center">
            <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Simple, Transparent Pricing</h2>
            <p className="text-truecost-text-secondary">Start free and scale as you grow</p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`glass-panel p-6 relative ${
                  plan.highlighted ? "border-truecost-cyan ring-1 ring-truecost-cyan/50" : ""
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-truecost-cyan text-truecost-bg-primary text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-truecost-text-primary mb-1">{plan.name}</h3>
                  <p className="text-sm text-truecost-text-muted mb-3">{plan.description}</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-3xl font-bold text-truecost-text-primary">{plan.price}</span>
                    {plan.period && <span className="text-truecost-text-muted">{plan.period}</span>}
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-truecost-cyan flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-truecost-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to={plan.name === "Enterprise" ? "/contact" : "/signup"}
                  className={`block w-full py-2.5 rounded-lg font-medium text-center transition-colors ${
                    plan.highlighted
                      ? "bg-truecost-cyan text-truecost-bg-primary hover:bg-truecost-cyan/90"
                      : "bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary hover:border-truecost-cyan/50"
                  }`}
                >
                  {plan.name === "Enterprise" ? "Contact Sales" : "Start Free Trial"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderAboutUsContent = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-4 pb-8 px-4">
      <div className="flex-1 max-w-5xl mx-auto w-full space-y-6">
        {/* Header with QR and title at top */}
        <div className="glass-panel p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Meet the Team</h2>
              <p className="text-truecost-text-secondary">The builders behind TrueCost AI</p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-4">
              <div className="w-28 h-28 bg-white rounded-xl p-2 shadow-lg">
                <img src={qrCodeImage} alt="QR Code" className="w-full h-full object-contain" />
              </div>
              <div className="text-left">
                <p className="text-sm text-truecost-cyan font-medium">Scan to visit</p>
                <p className="text-xs text-truecost-text-muted">truecost.ai</p>
              </div>
            </div>
          </div>
        </div>

        {/* Team Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {teamMembers.map((member) => (
            <div key={member.name} className="glass-panel p-5 text-center">
              <img
                src={member.image}
                alt={member.name}
                className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-2 border-truecost-glass-border"
              />
              <h4 className="font-semibold text-truecost-text-primary text-base">{member.name}</h4>
              <p className="text-sm text-truecost-cyan">{member.role}</p>
              {member.desc && (
                <p className="text-sm text-truecost-text-muted mt-2">{member.desc}</p>
              )}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="glass-panel p-6 text-center">
          <h3 className="text-xl font-semibold text-truecost-text-primary mb-2">Get in Touch</h3>
          <p className="text-truecost-text-secondary mb-4">
            Ready to transform your estimation workflow?
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              to="/contact"
              className="px-6 py-2 bg-truecost-cyan text-truecost-bg-primary rounded-lg font-medium hover:bg-truecost-cyan/90 transition-colors"
            >
              Contact Us
            </Link>
            <Link
              to="/signup"
              className="px-6 py-2 bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary rounded-lg font-medium hover:border-truecost-cyan/50 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  // Main content renderer based on current step
  const renderContent = () => {
    switch (currentStep.id) {
      case "home":
        return renderHomeContent();
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
      case "result-price-compare":
        return renderPriceComparison();
      case "result-pdf":
        return renderPDFReports();
      case "result-accuracy":
        return renderAccuracyComparison();
      case "differentiator":
        return renderDifferentiatorContent();
      case "pricing":
        return renderPricingContent();
      case "about-us":
        return renderAboutUsContent();
      default:
        return null;
    }
  };

  // For home page, render without navigation wrapper
  if (currentStep.id === "home") {
    return (
      <div className="min-h-screen bg-truecost-bg-primary">
        {renderContent()}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-truecost-bg-primary">
      {/* Content */}
      <div className="animate-fadeIn">
        {renderContent()}
      </div>

      {/* Navigation buttons - fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-truecost-bg-primary/95 backdrop-blur-sm border-t border-truecost-glass-border py-4 px-4 z-50">
        <div className="max-w-4xl mx-auto flex justify-center items-center gap-4">
          <button
            onClick={goPrev}
            disabled={isFirstStep}
            className={`px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 ${
              isFirstStep
                ? "bg-truecost-glass-bg text-truecost-text-muted cursor-not-allowed"
                : "bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary hover:border-truecost-cyan/50"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          <span className="text-truecost-text-secondary text-sm px-4 min-w-[80px] text-center">
            {currentStepIndex + 1} / {DEMO_STEPS.length}
          </span>

          <button
            onClick={goNext}
            disabled={isLastStep}
            className={`px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 ${
              isLastStep
                ? "bg-truecost-glass-bg text-truecost-text-muted cursor-not-allowed"
                : "bg-truecost-cyan text-truecost-bg-primary hover:bg-truecost-cyan/90"
            }`}
          >
            Next
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
      `}</style>
    </div>
  );
}
