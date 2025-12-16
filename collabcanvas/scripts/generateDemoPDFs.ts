/**
 * Script to generate demo PDF reports matching the DemoPage data
 * Run with: npx tsx scripts/generateDemoPDFs.ts
 */

import { jsPDF } from 'jspdf';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Demo estimate data from DemoPage.tsx
const DEMO_ESTIMATE = {
  projectName: "Bathroom Renovation - 742 Evergreen Terrace",
  location: "742 Evergreen Terrace, Cary, NC 27513",
  projectType: "Residential Renovation",
  squareFootage: 85,
  scope: "Full bathroom renovation including tile installation, plumbing fixtures, electrical updates, and complete refinishing with standing bathtub.",
  summary: {
    totalCost: 24508,
    costPerSqft: 288,
    duration: "3-4 weeks",
    riskLevel: "moderate",
  },
  costBreakdown: {
    materials: 10200,
    labor: 7902,
    equipment: 750,
    overhead: 1885,
    profit: 2828,
    contingency: 943,
  },
  materials: [
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
  labor: [
    { id: 1, trade: "Tile Setter", hours: 36, rate: 50, total: 1800 },
    { id: 2, trade: "Plumber", hours: 24, rate: 55, total: 1320 },
    { id: 3, trade: "Electrician", hours: 12, rate: 68, total: 816 },
    { id: 4, trade: "Carpenter (Framing)", hours: 18, rate: 42, total: 756 },
    { id: 5, trade: "Drywall Installer", hours: 16, rate: 36, total: 576 },
    { id: 6, trade: "Painter", hours: 14, rate: 23, total: 322 },
    { id: 7, trade: "General Labor", hours: 32, rate: 20, total: 640 },
    { id: 8, trade: "Project Supervision", hours: 24, rate: 38, total: 912 },
    { id: 9, trade: "Demolition", hours: 16, rate: 24, total: 384 },
    { id: 10, trade: "Bathtub Installation", hours: 8, rate: 47, total: 376 },
  ],
};

// Calculate confidence intervals (P50, P80, P90)
const P50 = DEMO_ESTIMATE.summary.totalCost;
const P80 = Math.round(P50 * 1.038); // ~3.8% higher
const P90 = Math.round(P50 * 1.058); // ~5.8% higher

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function generateContractorPDF(): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;

  // Helper to add new page if needed
  const checkPage = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
      // Add header on new page
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
      doc.setTextColor(0);
      y = 20;
    }
  };

  // Page 1: Cover
  doc.setFontSize(32);
  doc.setTextColor(0, 168, 232);
  doc.text('TrueCost', pageWidth / 2, 60, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(100);
  doc.text('Professional Construction Estimation', pageWidth / 2, 72, { align: 'center' });

  doc.setFontSize(24);
  doc.setTextColor(30);
  doc.text('Bathroom Renovation', pageWidth / 2, 100, { align: 'center' });
  doc.setFontSize(12);
  doc.text('742 Evergreen Terrace, Cary, NC 27513', pageWidth / 2, 112, { align: 'center' });

  // Total cost box
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(50, 130, pageWidth - 100, 40, 3, 3, 'F');
  doc.setFontSize(36);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(P50), pageWidth / 2, 152, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`P50: ${formatCurrency(P50)} | P80: ${formatCurrency(P80)} | P90: ${formatCurrency(P90)}`, pageWidth / 2, 165, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(128);
  doc.text('Prepared: December 16, 2025', pageWidth / 2, 200, { align: 'center' });
  doc.text('Estimate ID: demo_bathroom_2025', pageWidth / 2, 208, { align: 'center' });

  doc.setFontSize(8);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 1 of 10', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Page 2: Executive Summary
  doc.addPage();
  y = margin;

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
  doc.setTextColor(0);

  doc.setFontSize(20);
  doc.setTextColor(30);
  doc.text('Executive Summary', margin, y + 10);
  y += 25;

  // Summary boxes
  doc.setFillColor(245, 245, 245);
  const boxWidth = (pageWidth - margin * 2 - 20) / 3;

  // Total Cost
  doc.roundedRect(margin, y, boxWidth, 35, 2, 2, 'F');
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(P50), margin + boxWidth/2, y + 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('TOTAL ESTIMATED COST', margin + boxWidth/2, y + 28, { align: 'center' });

  // Duration
  doc.roundedRect(margin + boxWidth + 10, y, boxWidth, 35, 2, 2, 'F');
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text('3-4 weeks', margin + boxWidth + 10 + boxWidth/2, y + 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('ESTIMATED DURATION', margin + boxWidth + 10 + boxWidth/2, y + 28, { align: 'center' });

  // Contingency
  doc.roundedRect(margin + (boxWidth + 10) * 2, y, boxWidth, 35, 2, 2, 'F');
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text('3.85%', margin + (boxWidth + 10) * 2 + boxWidth/2, y + 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('RECOMMENDED CONTINGENCY', margin + (boxWidth + 10) * 2 + boxWidth/2, y + 28, { align: 'center' });

  y += 50;

  // Project Overview
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('Project Overview', margin, y);
  y += 10;

  doc.setFontSize(10);
  const overviewData = [
    ['Project Name:', DEMO_ESTIMATE.projectName],
    ['Location:', DEMO_ESTIMATE.location],
    ['Project Type:', DEMO_ESTIMATE.projectType],
    ['Square Footage:', `${DEMO_ESTIMATE.squareFootage} sq ft`],
    ['Scope:', DEMO_ESTIMATE.scope],
  ];

  overviewData.forEach(([label, value]) => {
    doc.setTextColor(100);
    doc.text(label, margin, y);
    doc.setTextColor(30);
    if (label === 'Scope:') {
      const lines = doc.splitTextToSize(value, pageWidth - margin * 2 - 40);
      doc.text(lines, margin + 40, y);
      y += lines.length * 5;
    } else {
      doc.text(value, margin + 40, y);
    }
    y += 8;
  });

  y += 10;

  // Cost Confidence Levels
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('Cost Confidence Levels', margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Based on Monte Carlo simulation with 1000 iterations, accounting for material price volatility and labor market conditions.', margin, y);
  y += 10;

  // Confidence table
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Percentile', margin, y);
  doc.text('Estimated Cost', margin + 30, y);
  doc.text('Description', margin + 60, y);
  y += 6;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const confidenceData = [
    ['P50', formatCurrency(P50), '50% probability the actual cost will be at or below this amount (median)'],
    ['P80', formatCurrency(P80), '80% probability the actual cost will be at or below this amount (likely)'],
    ['P90', formatCurrency(P90), '90% probability the actual cost will be at or below this amount (conservative)'],
  ];

  doc.setTextColor(30);
  confidenceData.forEach(([p, cost, desc]) => {
    doc.setFillColor(p === 'P50' ? 16 : p === 'P80' ? 245 : 251, p === 'P50' ? 185 : p === 'P80' ? 158 : 146, p === 'P50' ? 129 : p === 'P80' ? 11 : 146);
    doc.roundedRect(margin, y - 3, 12, 6, 1, 1, 'F');
    doc.setTextColor(255);
    doc.setFontSize(7);
    doc.text(p, margin + 6, y, { align: 'center' });
    doc.setTextColor(30);
    doc.setFontSize(9);
    doc.text(cost, margin + 30, y);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(desc, margin + 60, y);
    y += 10;
  });

  y += 5;

  // Key Cost Drivers
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('Key Cost Drivers', margin, y);
  y += 8;

  const costDrivers = [
    `Standing Bathtub: ${formatCurrency(4000)} (16% of materials)`,
    `Tile & Stone: ${formatCurrency(2206)} (22% of materials)`,
    `Plumbing: ${formatCurrency(5235)} (51% of materials)`,
    `Labor: ${formatCurrency(DEMO_ESTIMATE.costBreakdown.labor)} (32% of total)`,
  ];

  doc.setFontSize(9);
  costDrivers.forEach(driver => {
    doc.setTextColor(30);
    doc.text('•', margin, y);
    doc.text(driver, margin + 5, y);
    y += 6;
  });

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 2 of 10', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Page 3: Cost Breakdown by Division
  doc.addPage();
  y = margin;

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
  doc.setTextColor(0);

  doc.setFontSize(20);
  doc.setTextColor(30);
  doc.text('Cost Breakdown by Division', margin, y + 10);
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Costs organized according to CSI MasterFormat divisions. Each division shows material costs, labor costs, and combined totals.', margin, y);
  y += 15;

  // Group materials by category
  const categories = [...new Set(DEMO_ESTIMATE.materials.map(m => m.category))];

  categories.forEach(category => {
    checkPage(50);
    const categoryMaterials = DEMO_ESTIMATE.materials.filter(m => m.category === category);
    const categoryTotal = categoryMaterials.reduce((sum, m) => sum + m.total, 0);

    // Category header
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 8, 1, 1, 'F');
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.text(category, margin + 3, y + 5.5);
    doc.setTextColor(16, 185, 129);
    doc.text(formatCurrency(categoryTotal), pageWidth - margin - 3, y + 5.5, { align: 'right' });
    y += 12;

    // Items
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Item', margin + 3, y);
    doc.text('Quantity', margin + 90, y);
    doc.text('Unit Cost', margin + 115, y);
    doc.text('Total', pageWidth - margin - 3, y, { align: 'right' });
    y += 4;
    doc.setDrawColor(220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    doc.setTextColor(60);
    categoryMaterials.forEach(mat => {
      checkPage(8);
      doc.text(mat.item.substring(0, 45), margin + 3, y);
      doc.text(`${mat.qty} ${mat.unit}`, margin + 90, y);
      doc.text(formatCurrency(mat.unitCost), margin + 115, y);
      doc.text(formatCurrency(mat.total), pageWidth - margin - 3, y, { align: 'right' });
      y += 6;
    });

    y += 8;
  });

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 3 of 10', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Page 4: Cost Summary
  doc.addPage();
  y = margin;

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
  doc.setTextColor(0);

  doc.setFontSize(20);
  doc.setTextColor(30);
  doc.text('Cost Summary', margin, y + 10);
  y += 25;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 80, 2, 2, 'F');

  const summaryItems = [
    ['Material Costs', DEMO_ESTIMATE.costBreakdown.materials, '42%'],
    ['Labor Costs', DEMO_ESTIMATE.costBreakdown.labor, '32%'],
    ['Equipment', DEMO_ESTIMATE.costBreakdown.equipment, '3%'],
    ['Overhead (10%)', DEMO_ESTIMATE.costBreakdown.overhead, '8%'],
    ['Profit (15%)', DEMO_ESTIMATE.costBreakdown.profit, '12%'],
    ['Contingency (5%)', DEMO_ESTIMATE.costBreakdown.contingency, '4%'],
  ];

  let sy = y + 10;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Category', margin + 5, sy);
  doc.text('Amount', margin + 100, sy);
  doc.text('% of Total', pageWidth - margin - 5, sy, { align: 'right' });
  sy += 4;
  doc.setDrawColor(200);
  doc.line(margin + 5, sy, pageWidth - margin - 5, sy);
  sy += 8;

  doc.setTextColor(60);
  summaryItems.forEach(([label, amount, pct]) => {
    doc.text(label as string, margin + 5, sy);
    doc.text(formatCurrency(amount as number), margin + 100, sy);
    doc.text(pct as string, pageWidth - margin - 5, sy, { align: 'right' });
    sy += 8;
  });

  sy += 2;
  doc.setDrawColor(30);
  doc.line(margin + 5, sy, pageWidth - margin - 5, sy);
  sy += 8;
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text('Grand Total', margin + 5, sy);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(DEMO_ESTIMATE.summary.totalCost), margin + 100, sy);
  doc.setTextColor(30);
  doc.text('100%', pageWidth - margin - 5, sy, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 4 of 10', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Page 5: Labor Analysis
  doc.addPage();
  y = margin;

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
  doc.setTextColor(0);

  doc.setFontSize(20);
  doc.setTextColor(30);
  doc.text('Labor Analysis', margin, y + 10);
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Detailed breakdown of labor requirements by trade, including estimated hours and costs based on local market rates for Cary, NC area.', margin, y);
  y += 15;

  // Labor table
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 1, 1, 'F');
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text('Labor Summary by Trade', margin + 5, y + 7);
  y += 15;

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Trade', margin + 5, y);
  doc.text('Hours', margin + 70, y);
  doc.text('Rate/Hr', margin + 95, y);
  doc.text('Total', pageWidth - margin - 5, y, { align: 'right' });
  y += 4;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const totalHours = DEMO_ESTIMATE.labor.reduce((sum, l) => sum + l.hours, 0);

  doc.setTextColor(60);
  DEMO_ESTIMATE.labor.forEach(labor => {
    doc.text(labor.trade, margin + 5, y);
    doc.text(labor.hours.toString(), margin + 70, y);
    doc.text(formatCurrency(labor.rate), margin + 95, y);
    doc.text(formatCurrency(labor.total), pageWidth - margin - 5, y, { align: 'right' });
    y += 7;
  });

  y += 2;
  doc.setDrawColor(30);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(30);
  doc.text('Total Labor', margin + 5, y);
  doc.text(totalHours.toString(), margin + 70, y);
  doc.text(formatCurrency(DEMO_ESTIMATE.costBreakdown.labor), pageWidth - margin - 5, y, { align: 'right' });

  y += 25;

  // Summary boxes
  const lBoxWidth = (pageWidth - margin * 2 - 30) / 4;
  doc.setFillColor(245, 245, 245);

  doc.roundedRect(margin, y, lBoxWidth, 30, 2, 2, 'F');
  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text(totalHours.toString(), margin + lBoxWidth/2, y + 14, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text('TOTAL LABOR HOURS', margin + lBoxWidth/2, y + 24, { align: 'center' });

  doc.roundedRect(margin + lBoxWidth + 10, y, lBoxWidth, 30, 2, 2, 'F');
  doc.setFontSize(16);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(DEMO_ESTIMATE.costBreakdown.labor), margin + lBoxWidth + 10 + lBoxWidth/2, y + 14, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text('TOTAL LABOR COST', margin + lBoxWidth + 10 + lBoxWidth/2, y + 24, { align: 'center' });

  doc.roundedRect(margin + (lBoxWidth + 10) * 2, y, lBoxWidth, 30, 2, 2, 'F');
  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text('32%', margin + (lBoxWidth + 10) * 2 + lBoxWidth/2, y + 14, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text('LABOR % OF TOTAL', margin + (lBoxWidth + 10) * 2 + lBoxWidth/2, y + 24, { align: 'center' });

  doc.roundedRect(margin + (lBoxWidth + 10) * 3, y, lBoxWidth, 30, 2, 2, 'F');
  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text(Math.ceil(totalHours / 8).toString(), margin + (lBoxWidth + 10) * 3 + lBoxWidth/2, y + 14, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text('CREW DAYS (8HR)', margin + (lBoxWidth + 10) * 3 + lBoxWidth/2, y + 24, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 5 of 10', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Page 6: Project Schedule
  doc.addPage();
  y = margin;

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
  doc.setTextColor(0);

  doc.setFontSize(20);
  doc.setTextColor(30);
  doc.text('Project Schedule', margin, y + 10);
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Estimated project timeline based on scope of work, crew availability, and typical construction sequencing.', margin, y);
  y += 15;

  // Schedule summary boxes
  const sBoxWidth = (pageWidth - margin * 2 - 20) / 3;
  doc.setFillColor(245, 245, 245);

  doc.roundedRect(margin, y, sBoxWidth, 35, 2, 2, 'F');
  doc.setFontSize(18);
  doc.setTextColor(16, 185, 129);
  doc.text('3-4 wks', margin + sBoxWidth/2, y + 18, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text('TOTAL DURATION', margin + sBoxWidth/2, y + 28, { align: 'center' });

  doc.roundedRect(margin + sBoxWidth + 10, y, sBoxWidth, 35, 2, 2, 'F');
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('Upon', margin + sBoxWidth + 10 + sBoxWidth/2, y + 14, { align: 'center' });
  doc.text('contract', margin + sBoxWidth + 10 + sBoxWidth/2, y + 20, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text('ESTIMATED START', margin + sBoxWidth + 10 + sBoxWidth/2, y + 28, { align: 'center' });

  doc.roundedRect(margin + (sBoxWidth + 10) * 2, y, sBoxWidth, 35, 2, 2, 'F');
  doc.setFontSize(14);
  doc.setTextColor(16, 185, 129);
  doc.text('3-4 weeks', margin + (sBoxWidth + 10) * 2 + sBoxWidth/2, y + 14, { align: 'center' });
  doc.text('from start', margin + (sBoxWidth + 10) * 2 + sBoxWidth/2, y + 20, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text('ESTIMATED COMPLETION', margin + (sBoxWidth + 10) * 2 + sBoxWidth/2, y + 28, { align: 'center' });

  y += 50;

  // Phase Schedule
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text('Phase Schedule', margin, y);
  y += 10;

  const phases = [
    ['1', 'Pre-Construction', '2-3 days', 'Week 1', 'Week 1', '-'],
    ['1.1', 'Permits & Approvals', '2-3 days', 'Day 1', 'Day 3', 'Contract signed'],
    ['1.2', 'Material Ordering', '1-2 days', 'Day 2', 'Day 3', 'Permits filed'],
    ['2', 'Demolition', '2 days', 'Week 1', 'Week 1', 'Pre-construction'],
    ['3', 'Rough Work', '4-5 days', 'Week 1', 'Week 2', 'Demolition'],
    ['3.1', 'Plumbing Rough-in', '2 days', 'Week 1', 'Week 2', 'Demo complete'],
    ['3.2', 'Electrical Rough-in', '1 day', 'Week 2', 'Week 2', 'Demo complete'],
    ['4', 'Inspections', '1 day', 'Week 2', 'Week 2', 'Rough work'],
    ['5', 'Finishes', '5-7 days', 'Week 2', 'Week 3', 'Inspections passed'],
    ['5.1', 'Waterproofing', '1 day', 'Week 2', 'Week 2', 'Inspection passed'],
    ['5.2', 'Tile Installation', '3-4 days', 'Week 2', 'Week 3', 'Waterproofing'],
    ['6', 'Fixtures & Final', '2-3 days', 'Week 3', 'Week 4', 'Finishes'],
    ['7', 'Final Inspection', '1 day', 'Week 4', 'Week 4', 'All work complete'],
  ];

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('#', margin, y);
  doc.text('Phase / Task', margin + 10, y);
  doc.text('Duration', margin + 70, y);
  doc.text('Start', margin + 100, y);
  doc.text('End', margin + 125, y);
  doc.text('Dependencies', margin + 145, y);
  y += 4;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setTextColor(60);
  phases.forEach(phase => {
    const isMain = !phase[0].includes('.');
    if (isMain) {
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    doc.text(phase[0], margin, y);
    doc.text(phase[1], margin + 10, y);
    doc.text(phase[2], margin + 70, y);
    doc.text(phase[3], margin + 100, y);
    doc.text(phase[4], margin + 125, y);
    doc.setFontSize(7);
    doc.text(phase[5], margin + 145, y);
    doc.setFontSize(8);
    y += 6;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 6 of 10', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Pages 7-10: Additional pages (Risk Analysis, Assumptions, etc.)
  for (let i = 7; i <= 10; i++) {
    doc.addPage();
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
    doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
    doc.text(`Page ${i} of 10`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  return doc;
}

function generateClientPDF(): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;

  // Page 1: Cover
  doc.setFontSize(32);
  doc.setTextColor(0, 168, 232);
  doc.text('TrueCost', pageWidth / 2, 60, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(100);
  doc.text('Construction Cost Estimate', pageWidth / 2, 72, { align: 'center' });

  doc.setFontSize(24);
  doc.setTextColor(30);
  doc.text('Bathroom Renovation', pageWidth / 2, 100, { align: 'center' });
  doc.setFontSize(12);
  doc.text('742 Evergreen Terrace, Cary, NC 27513', pageWidth / 2, 112, { align: 'center' });

  // Total cost box
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(50, 135, pageWidth - 100, 35, 3, 3, 'F');
  doc.setFontSize(36);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(DEMO_ESTIMATE.summary.totalCost), pageWidth / 2, 157, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('Total Project Estimate', pageWidth / 2, 167, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(128);
  doc.text('Prepared: December 16, 2025', pageWidth / 2, 200, { align: 'center' });

  doc.setFontSize(8);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 1 of 5', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Page 2: Executive Summary
  doc.addPage();
  y = margin;

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
  doc.setTextColor(0);

  doc.setFontSize(20);
  doc.setTextColor(30);
  doc.text('Executive Summary', margin, y + 10);
  y += 25;

  // Summary boxes
  doc.setFillColor(245, 245, 245);
  const boxWidth = (pageWidth - margin * 2 - 20) / 3;

  doc.roundedRect(margin, y, boxWidth, 35, 2, 2, 'F');
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(DEMO_ESTIMATE.summary.totalCost), margin + boxWidth/2, y + 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('TOTAL PROJECT ESTIMATE', margin + boxWidth/2, y + 28, { align: 'center' });

  doc.roundedRect(margin + boxWidth + 10, y, boxWidth, 35, 2, 2, 'F');
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text('3-4 weeks', margin + boxWidth + 10 + boxWidth/2, y + 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('ESTIMATED DURATION', margin + boxWidth + 10 + boxWidth/2, y + 28, { align: 'center' });

  doc.roundedRect(margin + (boxWidth + 10) * 2, y, boxWidth, 35, 2, 2, 'F');
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text(`$${DEMO_ESTIMATE.summary.costPerSqft}/sf`, margin + (boxWidth + 10) * 2 + boxWidth/2, y + 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('COST PER SQ FT', margin + (boxWidth + 10) * 2 + boxWidth/2, y + 28, { align: 'center' });

  y += 50;

  // Project Overview
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('Project Overview', margin, y);
  y += 10;

  doc.setFontSize(10);
  const overviewData = [
    ['Project Name:', DEMO_ESTIMATE.projectName],
    ['Location:', DEMO_ESTIMATE.location],
    ['Project Type:', DEMO_ESTIMATE.projectType],
    ['Square Footage:', `${DEMO_ESTIMATE.squareFootage} sq ft`],
    ['Scope:', DEMO_ESTIMATE.scope],
  ];

  overviewData.forEach(([label, value]) => {
    doc.setTextColor(100);
    doc.text(label, margin, y);
    doc.setTextColor(30);
    if (label === 'Scope:') {
      const lines = doc.splitTextToSize(value, pageWidth - margin * 2 - 40);
      doc.text(lines, margin + 40, y);
      y += lines.length * 5;
    } else {
      doc.text(value, margin + 40, y);
    }
    y += 8;
  });

  y += 10;

  // About This Estimate
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('About This Estimate', margin, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(100);
  const aboutText = 'This estimate has been prepared based on current market pricing for materials and labor in your area. The total includes all work described in the project scope, permits, and standard project management.';
  const aboutLines = doc.splitTextToSize(aboutText, pageWidth - margin * 2);
  doc.text(aboutLines, margin, y);
  y += aboutLines.length * 5 + 10;

  // Key Cost Drivers
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('Key Cost Drivers', margin, y);
  y += 8;

  const costDrivers = [
    `Standing Bathtub: ${formatCurrency(4000)} (16% of materials)`,
    `Tile & Stone: ${formatCurrency(2206)} (22% of materials)`,
    `Plumbing Fixtures: ${formatCurrency(5235)} (51% of materials)`,
    `Labor: ${formatCurrency(DEMO_ESTIMATE.costBreakdown.labor)} (32% of total)`,
  ];

  doc.setFontSize(9);
  costDrivers.forEach(driver => {
    doc.setTextColor(30);
    doc.text('•', margin, y);
    doc.text(driver, margin + 5, y);
    y += 6;
  });

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 2 of 5', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Page 3: Cost Summary
  doc.addPage();
  y = margin;

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
  doc.setTextColor(0);

  doc.setFontSize(20);
  doc.setTextColor(30);
  doc.text('Cost Summary', margin, y + 10);
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Summary of project costs by major category. All prices are inclusive of materials, labor, and applicable fees.', margin, y);
  y += 15;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 90, 2, 2, 'F');

  // Client-friendly categories (simplified)
  const clientCategories = [
    ['Tile & Stone Work', 2700],
    ['Plumbing & Fixtures', 5800],
    ['Electrical', 500],
    ['Framing & Carpentry', 400],
    ['Waterproofing', 550],
    ['Paint & Finishes', 300],
    ['Demolition & Permits', 1100],
    ['Labor & Installation', DEMO_ESTIMATE.costBreakdown.labor],
    ['Project Management', DEMO_ESTIMATE.costBreakdown.overhead + DEMO_ESTIMATE.costBreakdown.profit],
  ];

  // Adjust to match total
  const clientTotal = clientCategories.reduce((sum, [, amt]) => sum + (amt as number), 0);
  const diff = DEMO_ESTIMATE.summary.totalCost - clientTotal;
  clientCategories[clientCategories.length - 1][1] = (clientCategories[clientCategories.length - 1][1] as number) + diff;

  let sy = y + 10;
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text('Project Cost Summary', margin + 5, sy);
  sy += 8;

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Category', margin + 5, sy);
  doc.text('Amount', pageWidth - margin - 5, sy, { align: 'right' });
  sy += 4;
  doc.setDrawColor(200);
  doc.line(margin + 5, sy, pageWidth - margin - 5, sy);
  sy += 6;

  doc.setTextColor(60);
  clientCategories.forEach(([label, amount]) => {
    doc.text(label as string, margin + 5, sy);
    doc.text(formatCurrency(amount as number), pageWidth - margin - 5, sy, { align: 'right' });
    sy += 7;
  });

  sy += 2;
  doc.setDrawColor(30);
  doc.line(margin + 5, sy, pageWidth - margin - 5, sy);
  sy += 8;
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text('Total Project Estimate', margin + 5, sy);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(DEMO_ESTIMATE.summary.totalCost), pageWidth - margin - 5, sy, { align: 'right' });

  y += 105;

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'italic');
  doc.text('Note: This is a preliminary estimate. Final costs will be confirmed after site visit and detailed scope review.', margin, y);
  doc.setFont('helvetica', 'normal');

  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
  doc.text('Page 3 of 5', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // Pages 4-5: Assumptions and Disclaimers
  for (let i = 4; i <= 5; i++) {
    doc.addPage();
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text('TrueCost Construction Estimate', pageWidth / 2, 10, { align: 'center' });
    doc.text('Confidential - Prepared for Client', margin, pageHeight - 10);
    doc.text(`Page ${i} of 5`, pageWidth - margin, pageHeight - 10, { align: 'right' });

    if (i === 4) {
      y = margin;
      doc.setFontSize(20);
      doc.setTextColor(30);
      doc.text('Assumptions & Exclusions', margin, y + 10);
      y += 25;

      doc.setFontSize(12);
      doc.text('Key Assumptions', margin, y);
      y += 10;

      const assumptions = [
        'Site access is adequate for material delivery',
        'Work performed during normal business hours (8am-5pm, Monday-Friday)',
        'No hidden damage, asbestos, lead paint, or mold present',
        'All required permits will be obtainable within 5 business days',
        'Existing electrical panel has adequate capacity',
        'Existing plumbing can support new fixture locations',
        'Material prices valid for 30 days from estimate date',
      ];

      doc.setFontSize(9);
      doc.setTextColor(60);
      assumptions.forEach(a => {
        doc.text('•', margin, y);
        doc.text(a, margin + 5, y);
        y += 7;
      });
    }
  }

  return doc;
}

// Main execution
async function main() {
  console.log('Generating demo PDFs...');

  const outputDir = path.join(__dirname, '..', 'public');

  // Generate contractor report
  console.log('Generating contractor report...');
  const contractorDoc = generateContractorPDF();
  const contractorBuffer = Buffer.from(contractorDoc.output('arraybuffer'));
  fs.writeFileSync(path.join(outputDir, 'contractor_report.pdf'), contractorBuffer);
  console.log('Saved contractor_report.pdf');

  // Generate client report
  console.log('Generating client report...');
  const clientDoc = generateClientPDF();
  const clientBuffer = Buffer.from(clientDoc.output('arraybuffer'));
  fs.writeFileSync(path.join(outputDir, 'client_report.pdf'), clientBuffer);
  console.log('Saved client_report.pdf');

  console.log('Done! PDFs generated in public/');
}

main().catch(console.error);
