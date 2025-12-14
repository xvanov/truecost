/**
 * PDF Service
 * Frontend wrapper for PDF generation Cloud Function
 * Story: 6-2 - Dual PDF export (Contractor vs Client)
 */

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
  storagePath?: string;
  pageCount?: number;
  fileSizeBytes?: number;
  generatedAt?: string;
  error?: string;
}

/**
 * Get the Python Functions URL for PDF generation
 * PDF generation runs in the Python backend, not TypeScript Firebase Functions
 */
function getPythonFunctionsUrl(): string {
  // Check for explicit Python Functions URL (local development)
  const pythonUrl = import.meta.env.VITE_PYTHON_FUNCTIONS_URL;
  if (pythonUrl) {
    return pythonUrl;
  }

  // Production: Use Cloud Run or deployed Python functions URL
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

/**
 * Generate a PDF estimate document
 * Calls the generate_pdf Cloud Function from Epic 4
 *
 * @param estimateId - The estimate ID to generate PDF for
 * @param clientReady - true for simplified client PDF, false for full contractor PDF
 * @param sections - Optional array of sections to include (defaults to all)
 * @returns Promise with PDF URL or error
 */
export async function generatePDF(
  estimateId: string,
  clientReady: boolean,
  sections?: string[]
): Promise<PDFGenerateResult> {
  try {
    const baseUrl = getPythonFunctionsUrl();
    const url = `${baseUrl}/generate_pdf`;

    console.log('[PDF] Calling Cloud Function:', url, { estimateId, clientReady });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estimate_id: estimateId,
        client_ready: clientReady,
        sections: sections,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || `PDF generation failed (${response.status})`,
      };
    }

    return {
      success: true,
      pdfUrl: data.pdf_url,
      storagePath: data.storage_path,
      pageCount: data.page_count,
      fileSizeBytes: data.file_size_bytes,
      generatedAt: data.generated_at,
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
