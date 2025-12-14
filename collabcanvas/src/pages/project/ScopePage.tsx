import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthenticatedLayout } from '../../components/layouts/AuthenticatedLayout';
import { Button, GlassPanel, Input, Select, Textarea, AddressAutocomplete } from '../../components/ui';
import type { ParsedAddress } from '../../components/ui';
import { FileUploadZone } from '../../components/estimate/FileUploadZone';
import { FilePreview } from '../../components/estimate/FilePreview';
import { EstimateStepper } from '../../components/estimate/EstimateStepper';
import { useProjectStore } from '../../store/projectStore';
import { useAuth } from '../../hooks/useAuth';
import { useStepCompletion } from '../../hooks/useStepCompletion';
import { saveScopeConfig, loadScopeConfig } from '../../services/scopeConfigService';
import { uploadPlanImage } from '../../services/estimationService';
import type { BackgroundImage } from '../../types';
import type { EstimateConfig } from '../../types/project';

// Re-export EstimateConfig for backward compatibility
export type { EstimateConfig } from '../../types/project';

/**
 * ScopePage - Combined form for project creation/editing with file upload.
 * Merged from NewEstimate.tsx and PlanView.tsx.
 *
 * Features:
 * - Project Name, Location, Project Type, Size fields
 * - File upload zone (required)
 * - Scope Definition textarea (renamed from "Additional Details")
 * - ZIP code override + Labor type toggle
 * - NO chatbot (chatbot is on Annotate page only)
 * - NO "Extracted Quantities" section
 * - "Continue to Annotate" button
 */
export function ScopePage() {
  const navigate = useNavigate();
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const loadProject = useProjectStore((state) => state.loadProject);
  const updateProjectScopeAction = useProjectStore((state) => state.updateProjectScopeAction);
  const loading = useProjectStore((state) => state.loading);

  const isEditMode = !!projectId;
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    address: '', // Full formatted address from autocomplete
    type: '',
    scopeDefinition: '',
    useUnionLabor: false,
  });

  // Parsed address components (extracted from autocomplete selection)
  const [parsedAddress, setParsedAddress] = useState<ParsedAddress | null>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [preparedBackground, setPreparedBackground] = useState<BackgroundImage | null>(null);
  const [existingPlanUrl, setExistingPlanUrl] = useState<string | null>(null);
  const [existingPlanFileName, setExistingPlanFileName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estimate configuration state
  const defaultStartDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14); // 2 weeks from today
    return date.toISOString().split('T')[0];
  }, []);

  const [overheadPercent, setOverheadPercent] = useState(10);
  const [profitPercent, setProfitPercent] = useState(10);
  const [contingencyPercent, setContingencyPercent] = useState(5);
  const [wasteFactorPercent, setWasteFactorPercent] = useState(10);
  const [startDate, setStartDate] = useState(defaultStartDate);

  // Load existing project data if in edit mode
  useEffect(() => {
    if (isEditMode && projectId && !isDataLoaded) {
      // First try to load from project document
      loadProject(projectId).then((project) => {
        if (project) {
          // Build formatted address from components if not available
          const addr = project.address;
          const formattedAddr = addr?.formattedAddress ||
            (addr ? `${addr.streetAddress}, ${addr.city}, ${addr.state} ${addr.zipCode}`.trim() : '');

          setFormData({
            name: project.name || '',
            address: formattedAddr,
            type: project.projectType || '',
            scopeDefinition: project.description || '',
            useUnionLabor: project.useUnionLabor || false,
          });

          // Restore parsed address components if available
          if (addr) {
            setParsedAddress({
              formattedAddress: formattedAddr,
              streetAddress: addr.streetAddress || '',
              city: addr.city || '',
              state: addr.state || '',
              zipCode: addr.zipCode || '',
              country: 'US',
            });
          }

          // Load estimate config if exists
          if (project.estimateConfig) {
            setOverheadPercent(project.estimateConfig.overheadPercent ?? 10);
            setProfitPercent(project.estimateConfig.profitPercent ?? 10);
            setContingencyPercent(project.estimateConfig.contingencyPercent ?? 5);
            setWasteFactorPercent(project.estimateConfig.wasteFactorPercent ?? 10);
            setStartDate(project.estimateConfig.startDate || defaultStartDate);
          }

          // Load existing plan image if available
          if (project.planImageUrl) {
            setExistingPlanUrl(project.planImageUrl);
            setExistingPlanFileName(project.planImageFileName || 'Uploaded plan');
          }

          setIsDataLoaded(true);
        }
      }).catch((err) => {
        console.error('Failed to load project:', err);
      });

      // Also try to load from scope config (for additional fields)
      loadScopeConfig(projectId).then((config) => {
        if (config) {
          // Build formatted address from components if not available
          const addr = config.address;
          const formattedAddr = addr?.formattedAddress ||
            (addr ? `${addr.streetAddress}, ${addr.city}, ${addr.state} ${addr.zipCode}`.trim() : '');

          // Merge with existing form data, preferring project data
          setFormData((prev) => ({
            name: prev.name || config.projectName || '',
            address: prev.address || formattedAddr,
            type: prev.type || config.projectType || '',
            scopeDefinition: prev.scopeDefinition || config.scopeText || '',
            useUnionLabor: prev.useUnionLabor || config.useUnionLabor || false,
          }));

          // Merge parsed address if available
          if (addr && !parsedAddress) {
            setParsedAddress({
              formattedAddress: formattedAddr,
              streetAddress: addr.streetAddress || '',
              city: addr.city || '',
              state: addr.state || '',
              zipCode: addr.zipCode || '',
              country: 'US',
            });
          }
        }
      }).catch((err) => {
        console.error('Failed to load scope config:', err);
      });
    }
  }, [isEditMode, projectId, isDataLoaded, loadProject, defaultStartDate, parsedAddress]);

  const prepareBackgroundImage = (file: File): Promise<BackgroundImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          resolve({
            id: `bg-${Date.now()}`,
            url: dataUrl,
            fileName: file.name,
            fileSize: file.size,
            width: img.width,
            height: img.height,
            aspectRatio: img.width / img.height,
            uploadedAt: Date.now(),
            uploadedBy: user?.uid || 'local',
          });
        };
        img.onerror = reject;
        img.src = dataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFileSelect = (file: File) => {
    setUploadedFile(file);
    prepareBackgroundImage(file)
      .then((bg) => setPreparedBackground(bg))
      .catch((err) => {
        console.error('Failed to prepare background image', err);
        setPreparedBackground(null);
      });
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setPreparedBackground(null);
    setExistingPlanUrl(null);
    setExistingPlanFileName(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('You must be logged in to create a project');
      return;
    }

    // In edit mode, allow submission if we have an existing plan or new upload
    const hasPlan = uploadedFile || existingPlanUrl;
    if (!hasPlan) {
      setError('Please upload a plan file');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Build estimate config with all project details
      const estimateConfig: EstimateConfig = {
        // Project details from scope page
        projectName: formData.name,
        address: parsedAddress ? {
          formattedAddress: parsedAddress.formattedAddress,
          streetAddress: parsedAddress.streetAddress,
          city: parsedAddress.city,
          state: parsedAddress.state,
          zipCode: parsedAddress.zipCode,
        } : undefined,
        projectType: formData.type,
        useUnionLabor: formData.useUnionLabor,
        scopeText: formData.scopeDefinition,
        // Estimate configuration
        overheadPercent,
        profitPercent,
        contingencyPercent,
        wasteFactorPercent,
        startDate,
      };

      let finalProjectId = projectId;
      let planImageUrl = existingPlanUrl;
      let planImageFileName = existingPlanFileName;

      // Upload new plan image if provided
      if (uploadedFile && finalProjectId) {
        const planImage = await uploadPlanImage(finalProjectId, uploadedFile, user.uid);
        planImageUrl = planImage.url;
        planImageFileName = planImage.fileName;
      }

      if (isEditMode && projectId) {
        // Update existing project
        await updateProjectScopeAction(projectId, {
          name: formData.name,
          description: formData.scopeDefinition,
          address: parsedAddress ? {
            formattedAddress: parsedAddress.formattedAddress,
            streetAddress: parsedAddress.streetAddress,
            city: parsedAddress.city,
            state: parsedAddress.state,
            zipCode: parsedAddress.zipCode,
          } : undefined,
          projectType: formData.type,
          useUnionLabor: formData.useUnionLabor,
          estimateConfig,
          planImageUrl: planImageUrl || undefined,
          planImageFileName: planImageFileName || undefined,
        }, user.uid);

        // Also save to scope config for persistence
        await saveScopeConfig(projectId, user.uid, estimateConfig);
      } else {
        // Create new project with all scope data
        const project = await createNewProject(
          formData.name,
          formData.scopeDefinition,
          user.uid,
          {
            address: parsedAddress ? {
              formattedAddress: parsedAddress.formattedAddress,
              streetAddress: parsedAddress.streetAddress,
              city: parsedAddress.city,
              state: parsedAddress.state,
              zipCode: parsedAddress.zipCode,
            } : undefined,
            projectType: formData.type,
            useUnionLabor: formData.useUnionLabor,
            estimateConfig,
          }
        );
        finalProjectId = project.id;

        // Upload plan image for new project
        if (uploadedFile) {
          const planImage = await uploadPlanImage(finalProjectId, uploadedFile, user.uid);
          planImageUrl = planImage.url;
          planImageFileName = planImage.fileName;

          // Update project with plan image URL
          await updateProjectScopeAction(finalProjectId, {
            planImageUrl,
            planImageFileName,
          }, user.uid);
        }

        // Save to scope config for persistence
        await saveScopeConfig(finalProjectId, user.uid, estimateConfig);
      }

      // Navigate to Annotate page with the background image and estimate config
      navigate(`/project/${finalProjectId}/annotate`, {
        state: {
          backgroundImage: preparedBackground,
          estimateConfig,
        }
      });
    } catch (err) {
      console.error('Failed to create/update project:', err);
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form is valid if we have a name, a valid parsed address with ZIP code, scope definition, and a plan file
  const isFormValid = formData.name.trim() &&
    parsedAddress &&
    parsedAddress.zipCode.trim().length >= 5 &&
    formData.scopeDefinition.trim() &&
    (uploadedFile || existingPlanUrl);

  // Get actual completion state from hook
  const { completedSteps } = useStepCompletion(projectId);

  return (
    <AuthenticatedLayout>
      <div className="container-spacious max-w-full pt-20 pb-14 md:pt-24">
        {/* Stepper */}
        {isEditMode && projectId && (
          <EstimateStepper
            currentStep="scope"
            projectId={projectId}
            completedSteps={completedSteps}
          />
        )}

        {/* Header */}
        <div className="mb-6 space-y-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-body-meta font-medium text-white border border-truecost-glass-border">
            {isEditMode ? 'Edit Project' : 'New Project'}
          </span>
          <h1 className="font-heading text-h1 text-truecost-text-primary">
            {isEditMode ? 'Update Project Scope' : 'Define Your Project Scope'}
          </h1>
          <p className="font-body text-body text-truecost-text-secondary/90">
            Provide project details and upload your plans to get started.
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="glass-panel bg-truecost-danger/10 border-truecost-danger/30 p-4 mb-6">
            <p className="font-body text-body text-truecost-danger">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          {/* Left: Form */}
          <div className="space-y-6">
            <GlassPanel className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Project Name */}
                <Input
                  label="Project Name *"
                  id="name"
                  name="name"
                  type="text"
                  placeholder="e.g., Smith Residence Addition"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />

                {/* Project Address */}
                <AddressAutocomplete
                  label="Project Address *"
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={(address, parsed) => {
                    setFormData((prev) => ({ ...prev, address }));
                    setParsedAddress(parsed);
                  }}
                  placeholder="Start typing an address..."
                  required
                />

                {/* Project Type */}
                <Select
                  label="Project Type"
                  id="type"
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                >
                  <option value="">Select type...</option>
                  <option value="residential-new">Residential - New Construction</option>
                  <option value="residential-addition">Residential - Addition</option>
                  <option value="residential-remodel">Residential - Remodel</option>
                  <option value="commercial-new">Commercial - New Construction</option>
                  <option value="commercial-renovation">Commercial - Renovation</option>
                  <option value="other">Other</option>
                </Select>

                {/* File Upload */}
                <div className="space-y-2">
                  <label className="block font-body text-body font-medium text-truecost-text-primary">
                    Upload Plans *
                  </label>
                  {!uploadedFile && !existingPlanUrl ? (
                    <FileUploadZone onFileSelect={handleFileSelect} />
                  ) : (
                    <FilePreview
                      file={uploadedFile}
                      existingUrl={existingPlanUrl}
                      existingFileName={existingPlanFileName}
                      onRemove={handleRemoveFile}
                    />
                  )}
                </div>

                {/* Scope Definition */}
                <Textarea
                  label="Scope Definition *"
                  id="scopeDefinition"
                  name="scopeDefinition"
                  value={formData.scopeDefinition}
                  onChange={handleInputChange}
                  placeholder="Describe the project scope, specific requirements, constraints, or preferences..."
                  required
                  rows={4}
                  helperText="Provide any additional details that will help generate an accurate estimate"
                />

                {/* Labor Type */}
                <div className="space-y-2">
                  <label className="block font-body text-body font-medium text-truecost-text-primary">
                    Labor Type
                  </label>
                  <label className="flex items-center gap-3 glass-panel p-3 cursor-pointer hover:bg-truecost-glass-bg/50 transition-colors">
                    <input
                      type="checkbox"
                      name="useUnionLabor"
                      checked={formData.useUnionLabor}
                      onChange={handleInputChange}
                      className="w-5 h-5 accent-truecost-cyan"
                    />
                    <span className="font-body text-body text-truecost-text-primary">
                      Use Union Labor Rates
                    </span>
                  </label>
                </div>

                {/* Estimate Configuration */}
                <div className="pt-4 border-t border-truecost-glass-border">
                  <h3 className="font-heading text-lg text-truecost-text-primary mb-4">
                    Estimate Configuration
                  </h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 font-body text-body-meta font-medium text-truecost-text-secondary">
                        Overhead %
                        <span className="relative group cursor-help">
                          <svg className="w-4 h-4 text-truecost-text-muted group-hover:text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                            Indirect costs: office, utilities, insurance, admin
                          </span>
                        </span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={overheadPercent}
                        onChange={(e) => setOverheadPercent(parseFloat(e.target.value) || 0)}
                        className="glass-input w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 font-body text-body-meta font-medium text-truecost-text-secondary">
                        Profit %
                        <span className="relative group cursor-help">
                          <svg className="w-4 h-4 text-truecost-text-muted group-hover:text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                            Your profit margin on top of all costs
                          </span>
                        </span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={profitPercent}
                        onChange={(e) => setProfitPercent(parseFloat(e.target.value) || 0)}
                        className="glass-input w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 font-body text-body-meta font-medium text-truecost-text-secondary">
                        Contingency %
                        <span className="relative group cursor-help">
                          <svg className="w-4 h-4 text-truecost-text-muted group-hover:text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                            Buffer for unexpected costs or changes
                          </span>
                        </span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={contingencyPercent}
                        onChange={(e) => setContingencyPercent(parseFloat(e.target.value) || 0)}
                        className="glass-input w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 font-body text-body-meta font-medium text-truecost-text-secondary">
                        Waste Factor %
                        <span className="relative group cursor-help">
                          <svg className="w-4 h-4 text-truecost-text-muted group-hover:text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                            Extra materials for cuts, damage, waste
                          </span>
                        </span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={wasteFactorPercent}
                        onChange={(e) => setWasteFactorPercent(parseFloat(e.target.value) || 0)}
                        className="glass-input w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block font-body text-body-meta font-medium text-truecost-text-secondary">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="glass-input w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    disabled={!isFormValid || isSubmitting || loading}
                  >
                    {isSubmitting ? 'Saving...' : isEditMode ? 'Save & Continue to Annotate' : 'Continue to Annotate'}
                  </Button>
                </div>
              </form>
            </GlassPanel>
          </div>

          {/* Right: Tips */}
          <GlassPanel className="p-6 h-fit">
            <div className="space-y-6">
              <div>
                <h3 className="font-heading text-h3 text-truecost-cyan mb-3">Quick Tips</h3>
              </div>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-truecost-cyan/20 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-truecost-cyan"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-body text-body font-medium text-truecost-text-primary mb-1">
                      Be Specific with Location
                    </h4>
                    <p className="text-body-meta text-truecost-text-secondary">
                      Accurate location data helps provide region-specific labor rates, permits, and
                      material costs.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-truecost-cyan/20 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-truecost-cyan"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-body text-body font-medium text-truecost-text-primary mb-1">
                      Upload Your Plans
                    </h4>
                    <p className="text-body-meta text-truecost-text-secondary">
                      CAD files (DWG, DXF) or images (PDF, PNG, JPG) help us analyze your
                      construction plans accurately.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-truecost-cyan/20 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-truecost-cyan"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-body text-body font-medium text-truecost-text-primary mb-1">
                      Next: Annotate & Clarify
                    </h4>
                    <p className="text-body-meta text-truecost-text-secondary">
                      After defining scope, you'll annotate your plans and chat with our AI to
                      clarify project details.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
