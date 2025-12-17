/**
 * DemoPage - Full-screen step-by-step demo walkthrough of the TrueCost estimation workflow
 * Shows hardcoded bathroom remodel example through Scope → Annotate → Estimate
 * Toggle through each step with keyboard arrows
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";

// Asset imports
import heroVideo from "../assets/animated_hero.mp4";
import logo from "../assets/logo.png";
import floorPlanGemini from "../assets/floor_plan_gemini.png";
import qrCodeImage from "../assets/qr-code.png";
import fireImage from "../assets/fires.png";
import { teamMembers } from "../assets/team/teamMembers";
import "../styles/hero.css";

// All demo steps in order (simplified - removed materials, labor, timeline, risk pages)
const DEMO_STEPS = [
  { id: "start", label: "Start", phase: "start" },
  { id: "home", label: "Welcome", phase: "home" },
  { id: "scope", label: "Project Scope", phase: "scope" },
  { id: "annotate-plan", label: "Plan Annotations", phase: "annotate" },
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
  { id: "mobile-app", label: "Mobile App", phase: "about" },
  { id: "pricing", label: "Pricing", phase: "about" },
  { id: "about-us", label: "Contact Us", phase: "about" },
] as const;

// Hardcoded demo data
const DEMO_SCOPE = {
  projectName: "Primary Bathroom Remodel",
  location: "105 Chatsworth St, Cary, NC 27513",
  projectType: "Bathroom Remodel",
  scopeText: `Complete primary bathroom remodel: We will install large format 24x48 tiles from the shower cabin all the way till the end of the wall touching the countertop. In that section we will remove rotten knee wall framing between shower cabin and bathtub, repair minor water damage to subfloor, remove the built-in bathtub (which will be replaced with standing bathtub), replace the drywall with cement board, install waterproofing, put large format tiles on walls of shower cabin, replace all tiles on the floor. Install new recessed lighting. Replace the toilet. Paint cabinets. Modify plumbing to move the shower head to be closer to the ceiling.`,
  estimateConfig: {
    overheadPercent: 10,
    profitPercent: 15,
    contingencyPercent: 5,
    wasteFactorPercent: 10,
    startDate: "2025-01-15",
  },
};

// CSI Divisions detected from scope
const CSI_DIVISIONS = [
  { code: "02", name: "Existing Conditions", items: ["Demolition of built-in bathtub", "Removal of existing floor tiles", "Removal of rotten knee wall framing", "Minor subfloor water damage repair"] },
  { code: "06", name: "Wood, Plastics, and Composites", items: ["Knee wall framing replacement", "Subfloor repair", "Pressure treated 2x4 studs"] },
  { code: "07", name: "Thermal & Moisture Protection", items: ["Waterproof membrane (Kerdi)", "Waterproofing corners & bands", "Cement board installation"] },
  { code: "09", name: "Finishes", items: ["Large format 24x48 porcelain tile (walls)", "Floor tiles", "Tile adhesive", "Epoxy grout", "Cabinet paint"] },
  { code: "22", name: "Plumbing", items: ["Ceiling mount shower head relocation", "Standing bathtub installation", "Copper pipe", "Toilet replacement", "Wax ring & bolts"] },
  { code: "26", name: "Electrical", items: ["LED recessed light kit", "Dimmer switch", "Romex wire"] },
];

const DEMO_ESTIMATE = {
  summary: {
    // Total = Base (18,852) + overhead + profit + contingency = 24,508
    totalCost: 24508,
    costPerSqft: 288,
    duration: "3-4 weeks",
    riskLevel: "medium",
  },
  costBreakdown: {
    // Base: materials (7,336) + labor (10,766) + equipment (750) = 18,852
    materials: 7336,
    labor: 10766,
    equipment: 750,
    overhead: 1885,      // 10% of 18,852
    profit: 2828,        // 15% of 18,852
    contingency: 943,    // 5% of 18,852
    // Total: 18,852 + 1,885 + 2,828 + 943 = 24,508
  },
  materials: [
    // Items from Price Comparison - subtotal: 7,336
    { id: 1, category: "Tile & Stone", item: "Large Format Porcelain Tile (24x48)", qty: 150, unit: "sq ft", unitCost: 7.25, total: 1088 },
    { id: 2, category: "Tile & Stone", item: "Floor Tile (12x24)", qty: 85, unit: "sq ft", unitCost: 5.49, total: 467 },
    { id: 3, category: "Tile & Stone", item: "Tile Adhesive (Modified Thinset) 50lb", qty: 6, unit: "bags", unitCost: 38.98, total: 234 },
    { id: 4, category: "Tile & Stone", item: "Epoxy Grout 9lb", qty: 2, unit: "units", unitCost: 78.98, total: 158 },
    { id: 5, category: "Waterproofing", item: "Kerdi Waterproof Membrane", qty: 60, unit: "sq ft", unitCost: 4.15, total: 249 },
    { id: 6, category: "Waterproofing", item: "Cement Board (1/2\")", qty: 10, unit: "sheets", unitCost: 13.98, total: 140 },
    { id: 7, category: "Electrical", item: "6\" LED Recessed Light Kit", qty: 6, unit: "units", unitCost: 38.97, total: 234 },
    { id: 8, category: "Plumbing", item: "Toilet - Elongated Comfort Height", qty: 1, unit: "unit", unitCost: 345, total: 345 },
    { id: 9, category: "Plumbing", item: "Ceiling Mount Rain Shower Head", qty: 1, unit: "unit", unitCost: 259, total: 259 },
    { id: 10, category: "Framing", item: "Pressure Treated 2x4 Studs 8ft", qty: 24, unit: "pcs", unitCost: 6.75, total: 162 },
    { id: 11, category: "Plumbing", item: "Standing Bathtub", qty: 1, unit: "unit", unitCost: 4000, total: 4000 },
    // Additional items - subtotal: 2,864
    { id: 12, category: "Waterproofing", item: "Waterproofing Corners & Bands", qty: 1, unit: "kit", unitCost: 145, total: 145 },
    { id: 13, category: "Framing", item: "Construction Screws & Fasteners", qty: 1, unit: "kit", unitCost: 65, total: 65 },
    { id: 14, category: "Framing", item: "Subfloor Patch Material", qty: 1, unit: "kit", unitCost: 125, total: 125 },
    { id: 15, category: "Electrical", item: "Dimmer Switch", qty: 1, unit: "unit", unitCost: 65, total: 65 },
    { id: 16, category: "Electrical", item: "Romex 12/2 Wire", qty: 75, unit: "ft", unitCost: 1.25, total: 94 },
    { id: 17, category: "Electrical", item: "GFCI Outlets", qty: 2, unit: "units", unitCost: 35, total: 70 },
    { id: 18, category: "Plumbing", item: "Copper Pipe (3/4\")", qty: 25, unit: "ft", unitCost: 8.50, total: 213 },
    { id: 19, category: "Plumbing", item: "Shower Valve & Trim Kit", qty: 1, unit: "unit", unitCost: 285, total: 285 },
    { id: 20, category: "Plumbing", item: "Wax Ring & Bolts", qty: 1, unit: "kit", unitCost: 18, total: 18 },
    { id: 21, category: "Plumbing", item: "Bathtub Drain Kit", qty: 1, unit: "kit", unitCost: 115, total: 115 },
    { id: 22, category: "Paint", item: "Cabinet Paint (Semi-Gloss)", qty: 3, unit: "gal", unitCost: 52, total: 156 },
    { id: 23, category: "Paint", item: "Primer (Bonding)", qty: 2, unit: "gal", unitCost: 42, total: 84 },
    { id: 24, category: "Demolition", item: "Disposal & Hauling", qty: 1, unit: "load", unitCost: 550, total: 550 },
    { id: 25, category: "Permits", item: "Building Permit", qty: 1, unit: "permit", unitCost: 525, total: 525 },
    { id: 26, category: "Tile & Stone", item: "Tile Trim & Edging", qty: 1, unit: "kit", unitCost: 194, total: 194 },
    { id: 27, category: "Tile & Stone", item: "Grout Sealer", qty: 1, unit: "bottle", unitCost: 65, total: 65 },
    { id: 28, category: "Supplies", item: "Caulk, Backer Rod & Sealants", qty: 1, unit: "kit", unitCost: 95, total: 95 },
  ],
  // Price Comparison items total: 7,336 (items 1-11)
  labor: [
    // Total labor: 10,766
    { id: 1, trade: "Tile Setter", hours: 48, rate: 50, total: 2400 },
    { id: 2, trade: "Plumber", hours: 30, rate: 55, total: 1650 },
    { id: 3, trade: "Electrician", hours: 16, rate: 68, total: 1088 },
    { id: 4, trade: "Carpenter (Framing)", hours: 24, rate: 42, total: 1008 },
    { id: 5, trade: "Drywall Installer", hours: 20, rate: 36, total: 720 },
    { id: 6, trade: "Painter", hours: 16, rate: 23, total: 368 },
    { id: 7, trade: "General Labor", hours: 45, rate: 20, total: 900 },
    { id: 8, trade: "Project Supervision", hours: 30, rate: 38, total: 1140 },
    { id: 9, trade: "Demolition", hours: 23, rate: 24, total: 552 },
    { id: 10, trade: "Bathtub Installation", hours: 20, rate: 47, total: 940 },
  ],
};

// Actual DeepAgent pipeline stages (no emojis)
const PIPELINE_STAGES = [
  { id: "gen-1", name: "Scope Agent", description: "Extracting and validating project scope from description", percent: 10 },
  { id: "gen-2", name: "Location Agent", description: "Analyzing regional labor rates and material costs for Cary, NC area", percent: 25 },
  { id: "gen-3", name: "Cost Agent", description: "Calculating material quantities and pricing from multiple vendors", percent: 40 },
  { id: "gen-4", name: "Code Compliance Agent", description: "Verifying building codes and permit requirements", percent: 55 },
  { id: "gen-5", name: "Risk Agent", description: "Identifying potential risks and mitigation strategies", percent: 70 },
  { id: "gen-6", name: "Timeline Agent", description: "Building project schedule with trade dependencies", percent: 85 },
  { id: "gen-7", name: "Final Agent", description: "Assembling comprehensive estimate with Monte Carlo simulation", percent: 100 },
];

// Price comparison data - Home Depot vs Lowes vs Local Vendor
const PRICE_COMPARISON = [
  {
    item: "Floor Tile (12x24)",
    qty: 85,
    unit: "sq ft",
    homeDepot: { price: 5.98, sku: "HD-FT1224-GRY", inStock: true },
    lowes: { price: 5.49, sku: "LW-1045893", inStock: true },
    localVendor: { price: 5.75, name: "Triangle Tile & Stone", inStock: true },
    selected: "lowes" as const,
  },
  {
    item: "Large Format Porcelain Tile (24x48)",
    qty: 150,
    unit: "sq ft",
    homeDepot: { price: 7.97, sku: "HD-PT24X48-GRY", inStock: true },
    lowes: { price: 7.49, sku: "LW-1045892", inStock: true },
    localVendor: { price: 7.25, name: "Triangle Tile & Stone", inStock: true },
    selected: "localVendor" as const,
  },
  {
    item: "Tile Adhesive (Modified Thinset) 50lb",
    qty: 6,
    unit: "bags",
    homeDepot: { price: 38.98, sku: "HD-VERSABOND-50", inStock: true },
    lowes: { price: 41.99, sku: "LW-4829103", inStock: false },
    localVendor: null,
    selected: "homeDepot" as const,
  },
  {
    item: "Epoxy Grout 9lb",
    qty: 2,
    unit: "units",
    homeDepot: { price: 82.00, sku: "HD-SPECEPOXY-9", inStock: true },
    lowes: { price: 78.98, sku: "LW-2938471", inStock: true },
    localVendor: null,
    selected: "lowes" as const,
  },
  {
    item: "Kerdi Waterproof Membrane",
    qty: 60,
    unit: "sq ft",
    homeDepot: { price: 4.15, sku: "HD-KERDI-108", inStock: true },
    lowes: { price: 4.49, sku: "LW-9182736", inStock: true },
    localVendor: { price: 4.29, name: "Cary Building Supply", inStock: true },
    selected: "homeDepot" as const,
  },
  {
    item: "6\" LED Recessed Light Kit",
    qty: 6,
    unit: "units",
    homeDepot: { price: 38.97, sku: "HD-HLBSL6-WH", inStock: true },
    lowes: { price: 42.98, sku: "LW-8273645", inStock: true },
    localVendor: null,
    selected: "homeDepot" as const,
  },
  {
    item: "Cement Board (1/2\")",
    qty: 10,
    unit: "sheets",
    homeDepot: { price: 14.48, sku: "HD-DUROCK-12", inStock: true },
    lowes: { price: 13.98, sku: "LW-8827364", inStock: true },
    localVendor: null,
    selected: "lowes" as const,
  },
  {
    item: "Toilet - Elongated Comfort Height",
    qty: 1,
    unit: "unit",
    homeDepot: { price: 349.00, sku: "HD-KOHLER-CH", inStock: true },
    lowes: { price: 369.00, sku: "LW-7364528", inStock: true },
    localVendor: { price: 345.00, name: "Ferguson Bath & Kitchen", inStock: true },
    selected: "localVendor" as const,
  },
  {
    item: "Ceiling Mount Rain Shower Head",
    qty: 1,
    unit: "unit",
    homeDepot: { price: 279.00, sku: "HD-MOEN-RAIN12", inStock: false },
    lowes: { price: 259.00, sku: "LW-6253419", inStock: true },
    localVendor: { price: 275.00, name: "Ferguson Bath & Kitchen", inStock: true },
    selected: "lowes" as const,
  },
  {
    item: "Pressure Treated 2x4 Studs 8ft",
    qty: 24,
    unit: "pcs",
    homeDepot: { price: 6.75, sku: "HD-PT2X4-8", inStock: true },
    lowes: { price: 7.28, sku: "LW-5142308", inStock: true },
    localVendor: { price: 6.95, name: "Cary Building Supply", inStock: true },
    selected: "homeDepot" as const,
  },
  {
    item: "Standing Bathtub",
    qty: 1,
    unit: "unit",
    homeDepot: { price: 4199.00, sku: "HD-STBTUB-60", inStock: true },
    lowes: { price: 4349.00, sku: "LW-9988776", inStock: false },
    localVendor: { price: 4000.00, name: "Ferguson Bath & Kitchen", inStock: true },
    selected: "localVendor" as const,
  },
];

// Estimate accuracy comparison data
const ACCURACY_COMPARISON = {
  manualEstimate: {
    label: "Manual Estimate",
    description: "Traditional spreadsheet-based estimate by junior estimator",
    // Underestimate: missed bathtub value, used wrong labor rates
    materials: 9628,
    labor: 7216,
    overhead: 1686,
    contingency: 840,
    total: 19370,
    // Difference from actual: $4,675 (23% underestimate)
    timeToCreate: "4-6 hours",
    issues: [
      "Used generic $1,850 bathtub instead of specified $4,000 model",
      "Missed permit fees and disposal costs",
      "Used outdated 2023 labor rates",
      "Underestimated tile setter and plumber hours",
    ],
  },
  trueCostEstimate: {
    label: "TrueCost AI Estimate",
    description: "AI-powered estimate with real-time pricing",
    // Matches DEMO_ESTIMATE breakdown
    materials: 7336,
    labor: 10766,
    overhead: 1885,
    contingency: 943,
    total: 24508,
    // Within 1.4% of actual cost
    timeToCreate: "30 minutes",
    features: [
      "Auto-detected all scope items from description",
      "Real-time pricing from multiple vendors + local suppliers",
      "Region-adjusted labor rates for Cary, NC area",
    ],
  },
  actualCost: {
    label: "Actual Project Cost",
    description: "Final invoiced amount after project completion",
    materials: 12500,
    labor: 9200,
    overhead: 2384,
    contingency: 1500,
    total: 25584,
    // TrueCost variance: $1,076 (4.2%)
    notes: [
      "Minor tile overage due to cuts (+$250)",
      "Plumber needed extra 4 hours for pipe rerouting (+$220)",
      "Contingency partially used for unexpected subfloor damage",
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

// Auto-label type
type AutoLabel = {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
};

// Default auto-detected labels for the floor plan
const DEFAULT_AUTO_LABELS: AutoLabel[] = [
  { id: "shower", label: "Shower Pan", x: 25, y: 35, color: "#00D4FF" },
  { id: "bathtub", label: "Bathtub", x: 60, y: 35, color: "#10B981" },
  { id: "door1", label: "Entry Door", x: 85, y: 75, color: "#F59E0B" },
  { id: "window1", label: "Window", x: 15, y: 60, color: "#8B5CF6" },
  { id: "toilet", label: "Toilet", x: 75, y: 55, color: "#EF4444" },
  { id: "vanity", label: "Vanity", x: 45, y: 70, color: "#EC4899" },
];

export function DemoPage() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<AnnotationPoint[]>([]);
  const [annotationMode, setAnnotationMode] = useState<"polyline" | "polygon" | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfsGenerated, setPdfsGenerated] = useState(false);
  const [isYearly, setIsYearly] = useState(false);
  const [autoLabels, setAutoLabels] = useState<AutoLabel[]>(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem("demo-auto-labels");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_AUTO_LABELS;
      }
    }
    return DEFAULT_AUTO_LABELS;
  });
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);
  const [spotlightEnabled, setSpotlightEnabled] = useState(true);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const planContainerRef = useRef<HTMLDivElement>(null);

  const currentStep = DEMO_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === DEMO_STEPS.length - 1;

  const goNext = useCallback(() => {
    if (!isLastStep) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  }, [isLastStep]);

  const goPrev = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [isFirstStep]);

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
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSpotlightEnabled((prev) => !prev);
      }
    },
    [goNext, goPrev]
  );

  // Track mouse position for cursor spotlight
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

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
  const renderStartContent = () => (
    <section className="hero" style={{ minHeight: "100vh", paddingTop: 0 }}>
      <div className="hero__background">
        <img
          className="hero__bg-image"
          src={fireImage}
          alt="Construction chaos"
          style={{ objectFit: "cover", objectPosition: "center center", width: "100%", height: "100%", position: "absolute", inset: 0 }}
        />
        <div className="hero__overlay" />
      </div>

      <div className="hero__content container-spacious">
        <div className="hero__card" style={{ opacity: 0.85, animation: "none", padding: 0, overflow: "hidden", transform: "scale(1.15)" }}>
          {/* Excel-like spreadsheet */}
          <div style={{
            background: "rgba(20, 30, 40, 0.95)",
            border: "1px solid rgba(59, 227, 245, 0.3)",
            borderRadius: "12px",
            overflow: "hidden"
          }}>
            {/* Excel header bar */}
            <div style={{
              background: "rgba(59, 227, 245, 0.1)",
              borderBottom: "1px solid rgba(59, 227, 245, 0.3)",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
              </div>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", marginLeft: "8px" }}>
                bathroom_estimate_v3_FINAL_final2.xlsx
              </span>
            </div>

            {/* Spreadsheet grid */}
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "monospace",
              fontSize: "13px"
            }}>
              <thead>
                <tr style={{ background: "rgba(59, 227, 245, 0.05)" }}>
                  <th style={{ width: 40, padding: "8px 4px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.4)" }}></th>
                  <th style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(59, 227, 245, 0.7)", fontWeight: 500 }}>A</th>
                  <th style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(59, 227, 245, 0.7)", fontWeight: 500 }}>B</th>
                  <th style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(59, 227, 245, 0.7)", fontWeight: 500 }}>C</th>
                  <th style={{ padding: "8px 12px", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(59, 227, 245, 0.7)", fontWeight: 500 }}>D</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "8px 4px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>1</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.8)" }}>Item</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.8)" }}>Qty</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.8)" }}>Unit Cost</td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.8)" }}>Total</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 4px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>2</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>Tile</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>150</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "#ff6b6b", fontWeight: 600 }}>#REF!</td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "#ff6b6b", fontWeight: 600 }}>#REF!</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 4px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>3</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>Labor</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>24</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>$75/hr</td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "#ff6b6b", fontWeight: 600 }}>#VALUE!</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 4px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>4</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>Plumbing</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "#ff6b6b", fontWeight: 600 }}>#N/A</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>$95/hr</td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "#ff6b6b", fontWeight: 600 }}>#REF!</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 4px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>5</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>Electrical</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>8</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>$85/hr</td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.6)" }}>$680</td>
                </tr>
                <tr style={{ background: "rgba(59, 227, 245, 0.05)" }}>
                  <td style={{ padding: "8px 4px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>6</td>
                  <td style={{ padding: "8px 12px", borderRight: "1px solid rgba(59, 227, 245, 0.2)", color: "rgba(255,255,255,0.8)", fontWeight: 600 }} colSpan={3}>TOTAL</td>
                  <td style={{ padding: "8px 12px", color: "#ff6b6b", fontWeight: 700, fontSize: "14px" }}>#ERROR!</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );

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
              Start Demo
            </button>
            <Link to="/signup" className="hero__btn hero__btn--secondary">
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </section>
  );

  const renderScopeContent = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-8 pb-8 px-4">
      <div className="flex-1 max-w-6xl mx-auto w-full space-y-4">
        {/* Badge */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border mb-4">
            <span className="text-truecost-cyan text-sm font-medium">Scope Definition</span>
          </div>
        </div>

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

  // Drag handlers for auto-labels
  const handleLabelDragStart = (labelId: string) => {
    if (!annotationMode) {
      setDraggingLabel(labelId);
    }
  };

  const handleLabelDrag = (e: React.MouseEvent | React.TouchEvent, labelId: string) => {
    if (draggingLabel !== labelId || !planContainerRef.current) return;

    const container = planContainerRef.current;
    const rect = container.getBoundingClientRect();

    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    // Clamp to container bounds
    const clampedX = Math.max(5, Math.min(95, x));
    const clampedY = Math.max(5, Math.min(95, y));

    setAutoLabels(prev => {
      const updated = prev.map(label =>
        label.id === labelId ? { ...label, x: clampedX, y: clampedY } : label
      );
      // Save to localStorage
      localStorage.setItem("demo-auto-labels", JSON.stringify(updated));
      return updated;
    });
  };

  const handleLabelDragEnd = () => {
    setDraggingLabel(null);
  };

  // Full-screen Plan Annotations with professional toolbar
  const renderAnnotatePlanContent = () => (
    <div className="fixed inset-0 bg-truecost-bg-primary flex flex-col">
      {/* Professional Navbar/Toolbar */}
      <header className="bg-truecost-bg-primary/95 backdrop-blur-md border-b border-truecost-glass-border/70">
        <nav className="px-4">
          <div className="flex items-center justify-between h-12">
            {/* Left: Logo + Title */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <img src={logo} alt="TrueCost" className="h-6 w-6" />
                <span className="text-truecost-text-primary font-semibold">TrueCost</span>
              </div>
              <div className="h-6 w-px bg-truecost-glass-border" />
              <span className="text-truecost-text-secondary text-sm">Plan Annotations</span>
            </div>

            {/* Center: Tool buttons */}
            <div className="flex items-center gap-1">
              {/* File menu */}
              <div className="relative">
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg/50 rounded-md transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Upload Plan
                </button>
              </div>

              <div className="h-6 w-px bg-truecost-glass-border mx-1" />

              {/* Annotation Tools */}
              <button
                onClick={() => setAnnotationMode("polyline")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  annotationMode === "polyline"
                    ? "bg-truecost-cyan text-truecost-bg-primary"
                    : "text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg/50"
                }`}
                title="Draw walls and lines"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6l6 6 4-4 6 6" />
                </svg>
                Polyline
              </button>

              <button
                onClick={() => setAnnotationMode("polygon")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  annotationMode === "polygon"
                    ? "bg-truecost-cyan text-truecost-bg-primary"
                    : "text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg/50"
                }`}
                title="Draw areas"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l4 8h8l-6 6 2 8-6-4-6 4 2-8-6-6h8z" />
                </svg>
                Polygon
              </button>

              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg/50 rounded-md transition-colors"
                title="Draw bounding box"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="4" y="4" width="16" height="16" strokeWidth="2" rx="1" />
                </svg>
                Box
              </button>

              <div className="h-6 w-px bg-truecost-glass-border mx-1" />

              {/* Action buttons */}
              {currentAnnotation.length >= 2 && (
                <button
                  onClick={finishAnnotation}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Finish
                </button>
              )}

              {annotations.length > 0 && (
                <button
                  onClick={clearAnnotations}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 rounded-md transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear
                </button>
              )}
            </div>

            {/* Right: Zoom + Generate */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-truecost-text-muted px-2">100%</span>
              <button className="px-4 py-1.5 text-sm font-medium bg-truecost-cyan text-truecost-bg-primary rounded-md hover:bg-truecost-cyan/90 transition-colors">
                Generate Estimate
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div
          ref={planContainerRef}
          className="flex-1 relative bg-gray-900 overflow-hidden"
          onMouseMove={(e) => draggingLabel && handleLabelDrag(e, draggingLabel)}
          onMouseUp={handleLabelDragEnd}
          onMouseLeave={handleLabelDragEnd}
          onTouchMove={(e) => draggingLabel && handleLabelDrag(e, draggingLabel)}
          onTouchEnd={handleLabelDragEnd}
        >
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

          {/* Auto-detected labels overlay - draggable */}
          {autoLabels.map((label) => (
            <div
              key={label.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
                !annotationMode ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
              } ${draggingLabel === label.id ? "z-50 scale-110" : "z-10"} transition-transform`}
              style={{ left: `${label.x}%`, top: `${label.y}%` }}
              onMouseDown={() => handleLabelDragStart(label.id)}
              onTouchStart={() => handleLabelDragStart(label.id)}
            >
              <div
                className={`px-2 py-1 rounded text-xs font-medium text-white shadow-lg select-none ${
                  draggingLabel === label.id ? "ring-2 ring-white/50" : ""
                }`}
                style={{ backgroundColor: label.color }}
              >
                {label.label}
              </div>
              <div
                className="w-2 h-2 rounded-full mx-auto mt-1"
                style={{ backgroundColor: label.color }}
              />
            </div>
          ))}

          {/* Annotation mode hint */}
          {annotationMode && (
            <div className="absolute top-4 left-4 px-3 py-2 bg-truecost-bg-primary/90 rounded-lg border border-truecost-cyan text-truecost-cyan text-sm">
              Click to add points. {currentAnnotation.length >= 2 ? "Click 'Finish' when done." : `${2 - currentAnnotation.length} more point(s) needed.`}
            </div>
          )}

          {/* Hints */}
          {!annotationMode && (
            <div className="absolute top-4 left-4 px-3 py-2 bg-truecost-bg-primary/90 rounded-lg border border-truecost-glass-border text-truecost-text-secondary text-sm">
              Drag labels to reposition them
            </div>
          )}
          <div className="absolute bottom-4 right-4 text-truecost-text-muted text-xs bg-truecost-bg-primary/80 px-2 py-1 rounded">
            Arrow keys to navigate
          </div>
        </div>

        {/* Right sidebar - AI Clarification Chat */}
        <div className="w-[512px] bg-truecost-bg-secondary/50 border-l border-truecost-glass-border flex flex-col">
          <div className="p-3 border-b border-truecost-glass-border">
            <h3 className="text-sm font-semibold text-truecost-text-primary">AI Clarification Chat</h3>
            <p className="text-xs text-truecost-text-muted mt-1">AI asks clarifying questions for accurate estimates</p>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
                I've analyzed the floor plan. The bathroom is approximately 85 sq ft. Can you confirm the ceiling height?
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="flex-1 max-w-[85%] p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
                The ceiling height is 9 feet. We want 6 recessed lights.
              </div>
              <div className="w-7 h-7 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-xs flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
                For the wall tiles, what size? 24x48 or 12x24 porcelain?
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="flex-1 max-w-[85%] p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
                24x48 porcelain tiles. Grey/neutral color.
              </div>
              <div className="w-7 h-7 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-xs flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
                What size tiles for the floor?
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="flex-1 max-w-[85%] p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
                12x24 porcelain for the floor.
              </div>
              <div className="w-7 h-7 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-xs flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
                What finish for the shower head assembly?
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="flex-1 max-w-[85%] p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
                Chrome finish for all fixtures.
              </div>
              <div className="w-7 h-7 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-xs flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
                I see a knee wall between the shower and bathtub. Should it be rebuilt to the same height?
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="flex-1 max-w-[85%] p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
                Yes, same height - about 4 feet.
              </div>
              <div className="w-7 h-7 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-xs flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
                What type of toilet are you considering? Standard, elongated, or wall-mounted?
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="flex-1 max-w-[85%] p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
                Elongated, comfort height. Kohler or similar.
              </div>
              <div className="w-7 h-7 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-xs flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
                For the cabinet painting, should we include new hardware?
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="flex-1 max-w-[85%] p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
                Yes, brushed nickel pulls and knobs.
              </div>
              <div className="w-7 h-7 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-xs flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-cyan/20 rounded-lg text-truecost-text-primary text-sm">
                Will you need a permit? Cary, NC typically requires one for plumbing/electrical changes.
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="flex-1 max-w-[85%] p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm">
                Yes, please include permit costs in the estimate.
              </div>
              <div className="w-7 h-7 rounded-full bg-truecost-glass-border flex items-center justify-center text-truecost-text-secondary text-xs flex-shrink-0">
                U
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-truecost-cyan/20 flex items-center justify-center text-truecost-cyan text-xs flex-shrink-0">
                AI
              </div>
              <div className="flex-1 p-2.5 bg-truecost-glass-bg rounded-lg text-truecost-text-primary text-sm border border-green-500/30">
                <span className="text-green-400 font-medium">All clarifications complete!</span><br />
                Ready to generate your estimate.
              </div>
            </div>
          </div>

          {/* Input area (disabled for demo) */}
          <div className="p-3 border-t border-truecost-glass-border">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                disabled
                className="flex-1 p-2 text-sm bg-truecost-glass-bg rounded-lg border border-truecost-glass-border text-truecost-text-primary placeholder-truecost-text-muted"
              />
              <button disabled className="px-3 py-2 bg-truecost-glass-border text-truecost-text-muted rounded-lg text-sm">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Mobile App slide - shows web and mobile side by side
  const renderMobileApp = () => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-truecost-bg-primary p-8">
      <div className="text-center mb-8">
        <h2 className="text-5xl font-bold text-truecost-text-primary">Web & Mobile</h2>
      </div>

      {/* Side by side screenshots */}
      <div className="flex items-center justify-center gap-16">
        {/* Web screenshot */}
        <div className="flex flex-col items-center">
          <div className="relative">
            {/* Browser chrome mockup */}
            <div className="bg-gray-800 rounded-t-xl px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 ml-4">
                <div className="bg-gray-700 rounded-md px-3 py-1 text-xs text-gray-400 max-w-xs">
                  app.truecost.ai
                </div>
              </div>
            </div>
            <div className="bg-gray-900 rounded-b-xl overflow-hidden shadow-2xl border border-gray-700">
              <img
                src="/demo-webpage.png"
                alt="TrueCost Web App"
                className="h-[700px] w-auto"
              />
            </div>
          </div>
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
              <svg className="w-5 h-5 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-truecost-text-primary font-medium">Web Application</span>
            </div>
          </div>
        </div>

        {/* Mobile screenshot */}
        <div className="flex flex-col items-center">
          <div className="relative">
            {/* Phone mockup frame */}
            <div className="bg-black rounded-[3rem] p-3 shadow-2xl">
              <div className="bg-black rounded-[2.5rem] overflow-hidden relative">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-28 h-7 bg-black rounded-b-2xl z-10" />
                <img
                  src="/demo-mobile.png"
                  alt="TrueCost Mobile App"
                  className="w-[340px] h-auto"
                />
              </div>
            </div>
          </div>
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
              <svg className="w-5 h-5 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-truecost-text-primary font-medium">Mobile App</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Fixed Generating Content - no emojis, only show completed + current
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

            {/* Agent checklist - only show completed and current */}
            <div className="space-y-3">
              {PIPELINE_STAGES.slice(0, currentStageIndex + 1).map((stage, index) => {
                const isCompleted = index < currentStageIndex;

                return (
                  <div
                    key={stage.id}
                    className={`flex items-start gap-4 p-4 rounded-lg transition-all ${
                      isCompleted
                        ? "bg-truecost-cyan/10 border border-truecost-cyan/30"
                        : "bg-truecost-glass-bg border border-truecost-cyan"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-truecost-cyan/20 flex items-center justify-center flex-shrink-0">
                      {isCompleted ? (
                        <svg className="w-5 h-5 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className="w-4 h-4 border-2 border-truecost-cyan rounded-full border-t-transparent animate-spin" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-truecost-text-primary">
                          {stage.name}
                        </span>
                      </div>
                      <p className="text-sm mt-1 text-truecost-text-secondary">
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

  // Fixed Result Summary - no emojis, dark background tables
  const renderResultSummary = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-8 pb-8 px-4">
      <div className="flex-1 max-w-6xl mx-auto w-full space-y-6">
        {/* Badge */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
            <span className="text-truecost-cyan text-sm font-medium">Estimate Summary</span>
          </div>
        </div>

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
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-4 flex items-center justify-between">
              <span>Materials</span>
              <span className="text-2xl font-bold text-truecost-cyan">
                ${DEMO_ESTIMATE.costBreakdown.materials.toLocaleString()}
              </span>
            </h3>
            <div className="space-y-2">
              {DEMO_ESTIMATE.materials.slice(0, 11).map((mat) => (
                <div key={mat.id} className="flex justify-between items-center p-3 rounded border border-truecost-glass-border">
                  <div>
                    <p className="text-sm text-truecost-text-primary">{mat.item}</p>
                    <p className="text-xs text-truecost-text-muted">{mat.qty} {mat.unit}</p>
                  </div>
                  <span className="font-mono text-truecost-cyan">${mat.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Labor Summary */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-4 flex items-center justify-between">
              <span>Labor</span>
              <span className="text-2xl font-bold text-truecost-teal">
                ${DEMO_ESTIMATE.costBreakdown.labor.toLocaleString()}
              </span>
            </h3>
            <div className="space-y-2">
              {DEMO_ESTIMATE.labor.map((labor) => (
                <div key={labor.id} className="flex justify-between items-center p-3 rounded border border-truecost-glass-border">
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
            <div className="text-center p-4 rounded-lg border border-truecost-glass-border">
              <p className="text-2xl font-bold text-truecost-text-primary">
                ${DEMO_ESTIMATE.costBreakdown.equipment.toLocaleString()}
              </p>
              <p className="text-xs text-truecost-text-secondary">Equipment</p>
            </div>
            <div className="text-center p-4 rounded-lg border border-truecost-glass-border">
              <p className="text-2xl font-bold text-truecost-text-primary">
                ${DEMO_ESTIMATE.costBreakdown.overhead.toLocaleString()}
              </p>
              <p className="text-xs text-truecost-text-secondary">Overhead (10%)</p>
            </div>
            <div className="text-center p-4 rounded-lg border border-truecost-glass-border">
              <p className="text-2xl font-bold text-truecost-text-primary">
                ${DEMO_ESTIMATE.costBreakdown.profit.toLocaleString()}
              </p>
              <p className="text-xs text-truecost-text-secondary">Profit (10%)</p>
            </div>
            <div className="text-center p-4 rounded-lg border border-yellow-500/30">
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
    const localTotal = PRICE_COMPARISON.reduce((sum, item) => {
      if (item.localVendor) return sum + item.localVendor.price * item.qty;
      return sum + Math.min(item.homeDepot.price, item.lowes.price) * item.qty;
    }, 0);
    const getBestPrice = (item: typeof PRICE_COMPARISON[0]) => {
      if (item.selected === "localVendor" && item.localVendor) return item.localVendor.price;
      if (item.selected === "homeDepot") return item.homeDepot.price;
      return item.lowes.price;
    };
    const bestTotal = PRICE_COMPARISON.reduce((sum, item) => sum + getBestPrice(item) * item.qty, 0);
    const savings = Math.min(hdTotal, lowesTotal) - bestTotal;

    return (
      <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-8 pb-8 px-4">
        <div className="flex-1 max-w-7xl mx-auto w-full space-y-6">
          {/* Badge */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
              <span className="text-truecost-cyan text-sm font-medium">Price Comparison</span>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <span className="text-orange-500 font-bold text-sm">HD</span>
                </div>
                <div>
                  <p className="text-sm text-truecost-text-secondary">Home Depot</p>
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
                  <p className="text-sm text-truecost-text-secondary">Lowe's</p>
                  <p className="text-xl font-bold text-truecost-text-primary">${lowesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
            <div className="glass-panel p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <span className="text-purple-500 font-bold text-sm">LC</span>
                </div>
                <div>
                  <p className="text-sm text-truecost-text-secondary">Local Vendors</p>
                  <p className="text-xl font-bold text-truecost-text-primary">${localTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                  <p className="text-sm text-truecost-text-secondary">Optimized Mix</p>
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
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="text-left text-xs text-truecost-text-secondary uppercase border-b border-truecost-glass-border">
                    <th className="pb-3 pr-4 w-[22%]">Item</th>
                    <th className="pb-3 pr-4 text-center w-[10%]">Qty</th>
                    <th className="pb-3 pr-4 text-center w-[17%]">Home Depot</th>
                    <th className="pb-3 pr-4 text-center w-[17%]">Lowe's</th>
                    <th className="pb-3 pr-4 text-center w-[17%]">Local Vendor</th>
                    <th className="pb-3 text-center w-[17%]">Best Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-truecost-glass-border/50">
                  {PRICE_COMPARISON.map((item, index) => (
                    <tr key={index}>
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
                      <td className="py-3 pr-4">
                        {item.localVendor ? (
                          <div className={`text-center p-2 rounded ${item.selected === "localVendor" ? "bg-purple-500/10 border border-purple-500/30" : ""}`}>
                            <p className="font-mono font-medium">${item.localVendor.price.toFixed(2)}</p>
                            <span className="text-xs text-purple-400 block truncate" title={item.localVendor.name}>
                              {item.localVendor.name}
                            </span>
                          </div>
                        ) : (
                          <div className="text-center p-2 text-truecost-text-muted">
                            <p className="font-mono">—</p>
                            <span className="text-xs">Not available</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        <p className="font-mono font-bold text-truecost-cyan">
                          ${(getBestPrice(item) * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

  // PDF Reports - using object tag to avoid sidebar
  const renderPDFReports = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-8 pb-8 px-4">
      <div className="flex-1 max-w-7xl mx-auto w-full">
        {/* Badge */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
            <span className="text-truecost-cyan text-sm font-medium">Reports</span>
          </div>
        </div>

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
              <div className="bg-white rounded-lg overflow-hidden" style={{ height: "700px" }}>
                <object
                  data="/contractor_report.pdf#toolbar=0&navpanes=0&scrollbar=0"
                  type="application/pdf"
                  className="w-full h-full"
                >
                  <p className="p-4 text-center text-truecost-text-secondary">
                    PDF cannot be displayed.{" "}
                    <a href="/contractor_report.pdf" className="text-truecost-cyan hover:underline" target="_blank" rel="noopener noreferrer">
                      Download PDF
                    </a>
                  </p>
                </object>
              </div>
            ) : (
              <div className="bg-truecost-glass-bg rounded-lg flex items-center justify-center" style={{ height: "700px" }}>
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
              <div className="bg-white rounded-lg overflow-hidden" style={{ height: "700px" }}>
                <object
                  data="/client_report.pdf#toolbar=0&navpanes=0&scrollbar=0"
                  type="application/pdf"
                  className="w-full h-full"
                >
                  <p className="p-4 text-center text-truecost-text-secondary">
                    PDF cannot be displayed.{" "}
                    <a href="/client_report.pdf" className="text-truecost-cyan hover:underline" target="_blank" rel="noopener noreferrer">
                      Download PDF
                    </a>
                  </p>
                </object>
              </div>
            ) : (
              <div className="bg-truecost-glass-bg rounded-lg flex items-center justify-center" style={{ height: "700px" }}>
                <p className="text-truecost-text-muted">Click "Generate PDF Reports" to view</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Estimate Accuracy with full detail panels
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
      <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-8 pb-8 px-4">
        <div className="flex-1 max-w-6xl mx-auto w-full space-y-6">
          {/* Badge */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
              <span className="text-truecost-cyan text-sm font-medium">Accuracy Comparison</span>
            </div>
          </div>

          {/* Header */}
          <div className="glass-panel p-6 text-center">
            <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Estimate Accuracy Comparison</h2>
            <p className="text-truecost-text-secondary">See how TrueCost AI compares to traditional manual estimates</p>
          </div>

          {/* Visual comparison bar */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-8">Total Cost Comparison</h3>
            <div className="relative h-48 mb-4">
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
              <div className="p-4 rounded-lg border border-red-500/30">
                <p className="text-2xl font-bold text-red-400">{manualVariance.toFixed(1)}%</p>
                <p className="text-xs text-truecost-text-secondary">Manual Variance</p>
                <p className="text-lg font-bold text-truecost-text-primary mt-1">${manualEstimate.total.toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-lg border border-green-500/30">
                <p className="text-2xl font-bold text-green-400">Actual</p>
                <p className="text-xs text-truecost-text-secondary">Final Project Cost</p>
                <p className="text-lg font-bold text-truecost-text-primary mt-1">${actualCost.total.toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-lg border border-truecost-cyan/30">
                <p className="text-2xl font-bold text-truecost-cyan">{trueCostVariance.toFixed(1)}%</p>
                <p className="text-xs text-truecost-text-secondary">TrueCost Variance</p>
                <p className="text-lg font-bold text-truecost-text-primary mt-1">${trueCostEstimate.total.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Bottom line */}
          <div className="glass-panel p-6 bg-gradient-to-r from-truecost-cyan/10 to-truecost-teal/10 border border-truecost-cyan/30">
            <div>
              <h4 className="font-semibold text-truecost-text-primary mb-2">Bottom Line</h4>
              <p className="text-sm text-truecost-text-secondary mb-2">
                TrueCost was within <span className="text-truecost-cyan font-semibold">{Math.abs(trueCostVariance).toFixed(1)}%</span> of actual costs,
                while the manual estimate was off by <span className="text-red-400 font-semibold">{Math.abs(manualVariance).toFixed(1)}%</span> —
                a difference of <span className="text-green-400 font-semibold">${(actualCost.total - manualEstimate.total).toLocaleString()}</span> that would have impacted profitability.
              </p>
              <p className="text-sm text-truecost-text-secondary">
                <span className="text-truecost-cyan font-semibold">More accurate estimates mean contractors can bid confidently, protect their margins, and stay profitable on every job.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Why Choose TrueCost - no emojis, with comparison
  const renderDifferentiatorContent = () => (
    <div className="min-h-screen flex flex-col bg-truecost-bg-primary pt-8 pb-8 px-4">
      <div className="flex-1 max-w-6xl mx-auto w-full space-y-6">
        {/* Badge */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
            <span className="text-truecost-cyan text-sm font-medium">Why TrueCost</span>
          </div>
        </div>

        {/* Header */}
        <div className="glass-panel p-6 text-center">
          <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Why Choose TrueCost?</h2>
          <p className="text-truecost-text-secondary">Built by contractors, for contractors</p>
        </div>

        {/* Comparison Table */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-truecost-text-primary mb-6">How We Compare</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Manual/Excel Method */}
            <div className="p-6 rounded-lg border border-red-500/40 bg-red-500/10">
              <h4 className="font-semibold text-red-400 mb-4">Manual / Excel</h4>
              <ul className="space-y-3">
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-red-400">×</span> 4-6 hours per estimate
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-red-400">×</span> Prone to human error
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-red-400">×</span> Outdated pricing data
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-red-400">×</span> Inconsistent formatting
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-red-400">×</span> No vendor comparison
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-red-400">×</span> Manual updates required
                </li>
              </ul>
            </div>

            {/* Other Solutions */}
            <div className="p-6 rounded-lg border border-yellow-500/40 bg-yellow-500/10">
              <h4 className="font-semibold text-yellow-400 mb-4">Other Solutions</h4>
              <ul className="space-y-3">
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-yellow-400">~</span> Built by tech companies
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-yellow-400">~</span> Generic AI models
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-yellow-400">~</span> Limited trade knowledge
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-yellow-400">~</span> No field validation
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-yellow-400">~</span> Support by non-contractors
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-yellow-400">~</span> Theoretical accuracy
                </li>
              </ul>
            </div>

            {/* TrueCost */}
            <div className="p-6 rounded-lg border-2 border-truecost-cyan/60 bg-truecost-cyan/15">
              <h4 className="font-semibold text-truecost-cyan mb-4">TrueCost AI</h4>
              <ul className="space-y-3">
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-truecost-cyan">✓</span> 30 minutes per estimate
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-truecost-cyan">✓</span> Built by licensed GCs
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-truecost-cyan">✓</span> Real-time pricing APIs
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-truecost-cyan">✓</span> Multi-vendor comparison
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-truecost-cyan">✓</span> Field-tested accuracy
                </li>
                <li className="text-sm text-truecost-text-secondary flex items-start gap-2">
                  <span className="text-truecost-cyan">✓</span> Contractor support team
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-panel p-6 text-center">
            <p className="text-xl font-bold text-truecost-cyan">Generate Multiple Estimates</p>
            <p className="text-sm text-truecost-text-secondary">Quickly & Automatically</p>
          </div>
          <div className="glass-panel p-6 text-center">
            <p className="text-3xl font-bold text-green-400">$0</p>
            <p className="text-sm text-truecost-text-secondary">To Try</p>
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
        monthlyPrice: "Free",
        yearlyPrice: "Free",
        period: "",
        description: "Try TrueCost with full capabilities",
        features: ["1 trial project", "Full AI analysis", "Detailed CSI breakdown", "Export to PDF"],
        cta: "Start Trial",
        highlighted: false,
      },
      {
        name: "Professional",
        monthlyPrice: "$399",
        yearlyPrice: "$319",
        period: "/month",
        description: "For contractors and small teams",
        features: ["Unlimited projects", "Advanced AI analysis", "Priority support", "Detailed CSI breakdown", "Risk assessment", "Timeline generation"],
        cta: "Start Free Trial",
        highlighted: true,
      },
      {
        name: "Enterprise",
        monthlyPrice: "Custom",
        yearlyPrice: "Custom",
        period: "",
        description: "For large organizations",
        features: ["Everything in Professional", "Custom integrations", "Dedicated account manager", "On-premise deployment", "SLA guarantee", "Custom AI training"],
        cta: "Contact Sales",
        highlighted: false,
      },
    ];

    return (
      <div className="min-h-screen bg-truecost-bg-primary py-12 px-4">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border mb-5">
            <span className="text-truecost-cyan text-sm font-medium">Simple Pricing</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-heading font-bold text-truecost-text-primary mb-4">
            Choose Your <span className="text-truecost-cyan">Plan</span>
          </h1>

          <p className="text-lg text-truecost-text-secondary max-w-2xl mx-auto mb-8">
            Start free and scale as you grow. All plans include our core AI-powered estimation features.
          </p>

          {/* Monthly/Yearly Toggle */}
          <div className="inline-flex items-center gap-4 p-1.5 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                !isYearly
                  ? "bg-truecost-cyan text-truecost-bg-primary"
                  : "text-truecost-text-secondary hover:text-truecost-text-primary"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                isYearly
                  ? "bg-truecost-cyan text-truecost-bg-primary"
                  : "text-truecost-text-secondary hover:text-truecost-text-primary"
              }`}
            >
              Yearly
              <span className={`text-xs px-2 py-0.5 rounded-full ${isYearly ? "bg-truecost-bg-primary/20" : "bg-green-500/20 text-green-400"}`}>
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => {
            const displayPrice = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
            const showYearlySavings = isYearly && plan.name === "Professional";

            return (
              <div
                key={plan.name}
                className={`glass-panel p-8 rounded-2xl relative transition-all duration-300 ${
                  plan.highlighted
                    ? "border-truecost-cyan ring-1 ring-truecost-cyan/50"
                    : "hover:border-truecost-glass-border/80"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-truecost-cyan text-truecost-bg-primary text-sm font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-2xl font-heading font-bold text-truecost-text-primary mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-truecost-text-muted text-sm mb-4">
                    {plan.description}
                  </p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-heading font-bold text-truecost-text-primary">
                      {displayPrice}
                    </span>
                    {plan.period && (
                      <span className="text-truecost-text-muted">{plan.period}</span>
                    )}
                  </div>
                  {showYearlySavings && (
                    <p className="text-green-400 text-sm mt-2">
                      Billed annually (${(319 * 12).toLocaleString()}/year)
                    </p>
                  )}
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-truecost-cyan flex-shrink-0 mt-0.5"
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
                      <span className="text-truecost-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to={plan.name === "Enterprise" ? "/contact" : "/signup"}
                  className={`block w-full py-3 rounded-xl font-semibold text-center transition-colors ${
                    plan.highlighted
                      ? "bg-truecost-cyan text-truecost-bg-primary hover:bg-truecost-cyan/90"
                      : "bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary hover:border-truecost-cyan/50"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="text-center mt-12">
          <p className="text-truecost-text-muted">
            Have questions about our pricing?{" "}
            <Link to="/contact" className="text-truecost-cyan hover:underline">
              Contact our sales team
            </Link>
          </p>
        </div>
      </div>
    );
  };

  // Contact Us - styled like About Us page
  const renderAboutUsContent = () => (
    <div className="min-h-screen bg-truecost-bg-primary py-4 px-4">
      {/* Contact Us Header */}
      <section className="relative pb-2">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-truecost-text-primary mb-4">
            Contact <span className="text-truecost-cyan">us</span>
          </h2>

          {/* URL and Large Centered QR Code */}
          <p className="text-2xl md:text-3xl font-semibold text-truecost-cyan mb-3">
            https://www.gettruecost.com/
          </p>
          <div className="flex justify-center mb-2">
            <div className="w-70 h-70 md:w-[27rem] md:h-[27rem] lg:w-[33rem] lg:h-[33rem] bg-white rounded-2xl p-4 shadow-xl">
              <img src={qrCodeImage} alt="QR Code" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-2">
        <div className="max-w-5xl mx-auto">

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {teamMembers.map((member, index) => (
              <div
                key={index}
                className="glass-panel p-5 rounded-xl hover:border-truecost-cyan/50 transition-colors"
              >
                <div className="w-28 h-28 mx-auto mb-3 rounded-full bg-truecost-glass-bg border-2 border-truecost-glass-border flex items-center justify-center overflow-hidden">
                  {member.image ? (
                    <img
                      src={member.image}
                      alt={member.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg className="w-16 h-16 text-truecost-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>

                <div className="text-center">
                  <h3 className="text-base font-heading font-semibold text-truecost-text-primary mb-0.5">
                    {member.name}
                  </h3>
                  <p className={`text-truecost-cyan text-sm font-medium${member.desc ? ' mb-2' : ''}`}>
                    {member.role}
                  </p>
                  {member.desc && (
                    <p className="text-truecost-text-secondary text-xs leading-relaxed">
                      {member.desc}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-4">
        <div className="max-w-5xl mx-auto">
          <div className="glass-panel p-5 rounded-xl">
            <h2 className="text-xl font-heading font-bold text-truecost-text-primary mb-3">
              Our Mission
            </h2>
            <p className="text-truecost-text-secondary text-sm leading-relaxed mb-3">
              Construction cost estimation has long been a time-consuming, error-prone process
              that relies heavily on experience and guesswork. We founded TrueCost to change that.
            </p>
            <p className="text-truecost-text-secondary text-sm leading-relaxed">
              By combining deep construction industry expertise with cutting-edge AI technology,
              we've created a platform that generates accurate, detailed estimates in minutes
              instead of days.
            </p>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-4">
        <div className="max-w-5xl mx-auto">
          <div className="glass-panel p-5 text-center rounded-xl">
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-1">Get in Touch</h3>
            <p className="text-truecost-text-secondary text-sm mb-4">
              Ready to transform your estimation workflow?
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link
                to="/contact"
                className="px-5 py-2 bg-truecost-cyan text-truecost-bg-primary rounded-lg font-medium hover:bg-truecost-cyan/90 transition-colors"
              >
                Contact Us
              </Link>
              <Link
                to="/signup"
                className="px-5 py-2 bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary rounded-lg font-medium hover:border-truecost-cyan/50 transition-colors"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  // Main content renderer based on current step
  const renderContent = () => {
    switch (currentStep.id) {
      case "start":
        return renderStartContent();
      case "home":
        return renderHomeContent();
      case "scope":
        return renderScopeContent();
      case "annotate-plan":
        return renderAnnotatePlanContent();
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
      case "mobile-app":
        return renderMobileApp();
      case "pricing":
        return renderPricingContent();
      case "about-us":
        return renderAboutUsContent();
      default:
        return null;
    }
  };

  // All pages now use arrow key navigation only
  return (
    <div className="min-h-screen bg-truecost-bg-primary">
      <div className="animate-fadeIn">
        {renderContent()}
      </div>

      {/* Cursor Spotlight for presentations - Toggle with 'S' key */}
      {spotlightEnabled && (
        <div
          className="pointer-events-none fixed z-[9999] rounded-full"
          style={{
            left: cursorPos.x - 50,
            top: cursorPos.y - 50,
            width: 100,
            height: 100,
            background: "radial-gradient(circle, rgba(255,220,0,0.5) 0%, rgba(255,220,0,0.3) 30%, rgba(255,220,0,0.1) 50%, transparent 70%)",
            boxShadow: "0 0 40px 15px rgba(255,220,0,0.35)",
            transition: "left 0.05s ease-out, top 0.05s ease-out",
          }}
        />
      )}

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
