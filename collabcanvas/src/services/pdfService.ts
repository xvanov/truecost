/**
 * PDF Service
 * Frontend wrapper for PDF generation Cloud Function
 * Story: 6-2 - Dual PDF export (Contractor vs Client)
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/**
 * PDF generation options
 */
export interface PDFGenerateOptions {
  projectId: string;
  clientReady: boolean;
  sections?: string[];
}

/**
 * PDF generation result
 */
export interface PDFGenerateResult {
  success: boolean;
  pdfUrl?: string;
  error?: string;
}

/**
 * Generate a PDF estimate document
 * Calls the generate_pdf Cloud Function from Epic 4
 *
 * @param projectId - The project ID to generate PDF for
 * @param clientReady - true for simplified client PDF, false for full contractor PDF
 * @param sections - Optional array of sections to include (defaults to all)
 * @returns Promise with PDF URL or error
 */
export async function generatePDF(
  projectId: string,
  clientReady: boolean,
  sections?: string[]
): Promise<PDFGenerateResult> {
  try {
    // Call the generate_pdf Cloud Function
    // This was implemented in Epic 4 with WeasyPrint + Jinja2
    const generatePdfFn = httpsCallable(functions, 'generate_pdf');

    const result = await generatePdfFn({
      project_id: projectId,
      client_ready: clientReady,
      sections: sections,
    });

    const data = result.data as { success: boolean; pdf_url?: string; error?: string };

    if (!data.success) {
      return {
        success: false,
        error: data.error || 'PDF generation failed',
      };
    }

    return {
      success: true,
      pdfUrl: data.pdf_url,
    };
  } catch (error) {
    console.error('[PDF] Error generating PDF:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    };
  }
}

/**
 * Generate contractor PDF (full version with all details)
 * Includes: BOM, labor breakdown, margins, risks, timeline
 */
export async function generateContractorPDF(projectId: string): Promise<PDFGenerateResult> {
  return generatePDF(projectId, false);
}

/**
 * Generate client PDF (simplified version)
 * Includes: Summary, materials overview, timeline
 * Excludes: Margins, detailed costs, internal notes
 */
export async function generateClientPDF(projectId: string): Promise<PDFGenerateResult> {
  return generatePDF(projectId, true);
}

/**
 * Open PDF in new browser tab
 * Utility function to handle PDF URL result
 */
export function openPDFInNewTab(pdfUrl: string): void {
  window.open(pdfUrl, '_blank', 'noopener,noreferrer');
}
