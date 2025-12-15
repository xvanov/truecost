import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
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
import ARCoreRoomScanner, { type ScanResult } from '../../plugins/ARCoreRoomScanner';
import { generateFloorPlanFromScan } from '../../services/floorPlanGenerator';
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

  // Room Scanner state
  const [planInputMode, setPlanInputMode] = useState<'upload' | 'scan'>('upload');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [arCoreAvailable, setArCoreAvailable] = useState<boolean | null>(null);
  const [_arCoreChecking, setArCoreChecking] = useState(false);
  const isNativePlatform = Capacitor.isNativePlatform();
  // Note: _arCoreChecking can be used for loading states in the UI if needed

  // AR Room Scan feature is enabled on native platforms (Android)
  // The plugin now uses lazy initialization to avoid crashes on app startup
  const isARFeatureEnabled = true;

  // Debug: Log platform detection
  useEffect(() => {
    console.log('📱 Platform detection:', {
      isNativePlatform,
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform(),
    });
  }, [isNativePlatform]);

  // Check ARCore availability on mount (only on native platforms)
  useEffect(() => {
    if (!isNativePlatform) {
      console.log('🔍 Not native platform, skipping ARCore check');
      return;
    }

    console.log('🔍 Checking ARCore availability...');
    setArCoreChecking(true);

    ARCoreRoomScanner.checkAvailability()
      .then((result) => {
        console.log('✅ ARCore availability result:', result);
        setArCoreAvailable(result.isSupported);
      })
      .catch((error) => {
        console.error('❌ ARCore availability check failed:', error);
        setArCoreAvailable(false);
      })
      .finally(() => {
        setArCoreChecking(false);
      });
  }, [isNativePlatform]);

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

  // ARCore Room Scanner handler
  const handleStartScan = async () => {
    setIsScanning(true);
    setError(null);

    try {
      // Request camera permission first
      const permission = await ARCoreRoomScanner.requestPermission();
      if (!permission.granted) {
        setError('Camera permission is required for room scanning');
        setIsScanning(false);
        return;
      }

      // Check if ARCore needs to be installed
      const installStatus = await ARCoreRoomScanner.installARCore();
      if (!installStatus.installed && installStatus.status === 'INSTALL_REQUESTED') {
        setError('Please install ARCore from the Play Store and try again');
        setIsScanning(false);
        return;
      }

      // Start the scan
      const result = await ARCoreRoomScanner.startScan();

      console.log('📱 AR Scan result received:', JSON.stringify(result));

      if (result.success && result.dimensions) {
        console.log('✅ Scan successful! Dimensions:', result.dimensions);
        setScanResult(result);
        // Auto-populate scope definition with scan results
        const dims = result.dimensions;
        const scanDescription = `Room scanned with ARCore:\n- Dimensions: ${dims.length.toFixed(1)}ft x ${dims.width.toFixed(1)}ft x ${dims.height.toFixed(1)}ft\n- Floor Area: ${dims.area.toFixed(1)} sq ft\n- Volume: ${dims.volume.toFixed(1)} cu ft`;

        if (result.features && result.features.length > 0) {
          const features = result.features.map(f => `${f.count} ${f.type}(s)`).join(', ');
          setFormData(prev => ({
            ...prev,
            scopeDefinition: prev.scopeDefinition
              ? `${prev.scopeDefinition}\n\n${scanDescription}\n- Detected: ${features}`
              : `${scanDescription}\n- Detected: ${features}`
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            scopeDefinition: prev.scopeDefinition
              ? `${prev.scopeDefinition}\n\n${scanDescription}`
              : scanDescription
          }));
        }
      } else {
        setError(result.reason || 'Scan failed. Please try again.');
      }
    } catch (err) {
      console.error('Room scan error:', err);
      setError(err instanceof Error ? err.message : 'Failed to scan room');
    } finally {
      setIsScanning(false);
    }
  };

  const handleClearScan = () => {
    setScanResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('You must be logged in to create a project');
      return;
    }

    // Allow submission if we have an existing plan, new upload, or successful scan
    const hasPlanOrScanData = uploadedFile || existingPlanUrl || scanResult?.success;
    if (!hasPlanOrScanData) {
      setError('Please upload a plan file or scan a room');
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

      // Generate floor plan from scan result if available
      let backgroundForAnnotate = preparedBackground;

      console.log('🏠 Generating floor plan check:', {
        hasPreparedBackground: !!preparedBackground,
        hasScanResult: !!scanResult,
        scanSuccess: scanResult?.success,
        scanDimensions: scanResult?.dimensions,
      });

      if (!backgroundForAnnotate && scanResult?.success && scanResult.dimensions) {
        console.log('🎨 Generating floor plan from scan...', scanResult.dimensions);

        // Generate a floor plan image from the scan results
        const floorPlan = generateFloorPlanFromScan({
          dimensions: scanResult.dimensions,
          features: scanResult.features || [],
        });

        console.log('✅ Floor plan generated:', {
          width: floorPlan.width,
          height: floorPlan.height,
          dataUrlLength: floorPlan.dataUrl?.length,
          dataUrlPreview: floorPlan.dataUrl?.substring(0, 50),
        });

        const now = Date.now();
        backgroundForAnnotate = {
          id: `scan-${now}`,
          url: floorPlan.dataUrl,
          fileName: `room-scan-${now}.png`,
          fileSize: floorPlan.dataUrl.length, // Approximate size
          width: floorPlan.width,
          height: floorPlan.height,
          aspectRatio: floorPlan.width / floorPlan.height,
          uploadedAt: now,
          uploadedBy: user.uid,
        };

        console.log('📦 Background for annotate created:', {
          id: backgroundForAnnotate.id,
          width: backgroundForAnnotate.width,
          height: backgroundForAnnotate.height,
        });
      }

      // Navigate to Annotate page with the background image and estimate config
      navigate(`/project/${finalProjectId}/annotate`, {
        state: {
          backgroundImage: backgroundForAnnotate,
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

  // Form is valid if we have a name, a valid parsed address with ZIP code, scope definition, and either a plan file OR a scan result
  const hasPlanOrScan = uploadedFile || existingPlanUrl || scanResult?.success;
  const isFormValid = formData.name.trim() &&
    parsedAddress &&
    parsedAddress.zipCode.trim().length >= 5 &&
    formData.scopeDefinition.trim() &&
    hasPlanOrScan;

  // Get actual completion state from hook
  const { completedSteps } = useStepCompletion(projectId);

  return (
    <AuthenticatedLayout>
      <div className="container-spacious max-w-full px-3 md:px-6 pt-16 pb-14 md:pt-24">
        {/* Stepper */}
        {isEditMode && projectId && (
          <EstimateStepper
            currentStep="scope"
            projectId={projectId}
            completedSteps={completedSteps}
          />
        )}

        {/* Header - Smaller on mobile */}
        <div className="mb-4 md:mb-6 space-y-1 md:space-y-2">
          <span className="inline-flex items-center px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs md:text-body-meta font-medium text-white border border-truecost-glass-border">
            {isEditMode ? 'Edit Project' : 'New Project'}
          </span>
          <h1 className="font-heading text-xl md:text-h1 text-truecost-text-primary">
            {isEditMode ? 'Update Project Scope' : 'Define Your Project Scope'}
          </h1>
          <p className="font-body text-sm md:text-body text-truecost-text-secondary/90">
            Provide project details and upload your plans to get started.
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="glass-panel bg-truecost-danger/10 border-truecost-danger/30 p-4 mb-6">
            <p className="font-body text-body text-truecost-danger">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-6">
          {/* Left: Form */}
          <div className="space-y-4 md:space-y-6">
            <GlassPanel className="p-4 md:p-8">
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

                {/* Plan Input - Upload OR Scan */}
                <div className="space-y-3">
                  <label className="block font-body text-body font-medium text-truecost-text-primary">
                    Construction Plan *
                  </label>

                  {/* Mode Toggle - Show on native platform when AR feature is enabled */}
                  {isNativePlatform && isARFeatureEnabled && (
                    <div className="flex rounded-lg overflow-hidden border border-truecost-glass-border">
                      <button
                        type="button"
                        onClick={() => setPlanInputMode('upload')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                          planInputMode === 'upload'
                            ? 'bg-truecost-cyan/20 text-truecost-cyan border-r border-truecost-glass-border'
                            : 'bg-truecost-glass-bg/30 text-truecost-text-secondary hover:bg-truecost-glass-bg/50 border-r border-truecost-glass-border'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Upload Plan
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlanInputMode('scan')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                          planInputMode === 'scan'
                            ? 'bg-truecost-cyan/20 text-truecost-cyan'
                            : 'bg-truecost-glass-bg/30 text-truecost-text-secondary hover:bg-truecost-glass-bg/50'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        AR Room Scan
                      </button>
                    </div>
                  )}

                  {/* Upload Mode */}
                  {planInputMode === 'upload' && (
                    <>
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
                    </>
                  )}

                  {/* Scan Mode */}
                  {planInputMode === 'scan' && (
                    <div className="space-y-3">
                      {/* ARCore not available message */}
                      {arCoreAvailable === false && (
                        <div className="glass-panel p-6 text-center bg-truecost-warning/5 border-truecost-warning/30">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-truecost-warning/10 flex items-center justify-center">
                            <svg className="w-8 h-8 text-truecost-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <h4 className="font-heading text-lg text-truecost-text-primary mb-2">
                            ARCore Not Available
                          </h4>
                          <p className="text-sm text-truecost-text-secondary mb-4">
                            AR Room Scanning requires ARCore. Please install ARCore from the Play Store or use the Upload Plan option instead.
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setPlanInputMode('upload')}
                          >
                            Switch to Upload Plan
                          </Button>
                        </div>
                      )}

                      {/* ARCore checking */}
                      {arCoreAvailable === null && (
                        <div className="glass-panel p-6 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-truecost-cyan/10 flex items-center justify-center">
                            <svg className="animate-spin w-8 h-8 text-truecost-cyan" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          </div>
                          <h4 className="font-heading text-lg text-truecost-text-primary mb-2">
                            Checking AR Support...
                          </h4>
                          <p className="text-sm text-truecost-text-secondary">
                            Please wait while we check if your device supports AR room scanning.
                          </p>
                        </div>
                      )}

                      {/* ARCore available - show scan UI */}
                      {arCoreAvailable === true && !scanResult?.success && (
                        <div className="glass-panel p-6 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-truecost-cyan/10 flex items-center justify-center">
                            <svg className="w-8 h-8 text-truecost-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <h4 className="font-heading text-lg text-truecost-text-primary mb-2">
                            Scan Room with AR
                          </h4>
                          <p className="text-sm text-truecost-text-secondary mb-4">
                            Use your phone's camera to scan the room and automatically capture dimensions.
                          </p>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={handleStartScan}
                            disabled={isScanning}
                          >
                            {isScanning ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Scanning...
                              </>
                            ) : (
                              <>
                                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                Start AR Scan
                              </>
                            )}
                          </Button>
                        </div>
                      )}

                      {/* Scan result success */}
                      {scanResult?.success && (
                        <div className="glass-panel p-4 bg-truecost-success/5 border-truecost-success/30">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-truecost-success/20 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-truecost-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-heading text-base text-truecost-text-primary mb-1">
                                Room Scanned Successfully
                              </h4>
                              {scanResult.dimensions && (
                                <div className="grid grid-cols-2 gap-2 text-sm text-truecost-text-secondary">
                                  <div>
                                    <span className="text-truecost-text-muted">Dimensions:</span>{' '}
                                    {scanResult.dimensions.length.toFixed(1)}' x {scanResult.dimensions.width.toFixed(1)}' x {scanResult.dimensions.height.toFixed(1)}'
                                  </div>
                                  <div>
                                    <span className="text-truecost-text-muted">Area:</span>{' '}
                                    {scanResult.dimensions.area.toFixed(1)} sq ft
                                  </div>
                                </div>
                              )}
                              {scanResult.features && scanResult.features.length > 0 && (
                                <div className="text-sm text-truecost-text-secondary mt-1">
                                  <span className="text-truecost-text-muted">Detected:</span>{' '}
                                  {scanResult.features.map(f => `${f.count} ${f.type}(s)`).join(', ')}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={handleClearScan}
                              className="p-1 rounded hover:bg-truecost-glass-bg text-truecost-text-muted hover:text-truecost-text-secondary"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={handleStartScan}
                            disabled={isScanning}
                            className="mt-3 text-sm text-truecost-cyan hover:underline"
                          >
                            Scan another room
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hint for web users */}
                  {!isNativePlatform && (
                    <p className="text-xs text-truecost-text-muted">
                      AR Room Scanning is available in the mobile app. Upload your construction plans to continue.
                    </p>
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
                  <h3 className="font-heading text-base md:text-lg text-truecost-text-primary mb-3 md:mb-4">
                    Estimate Configuration
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
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

          {/* Right: Tips - Hidden on mobile */}
          <GlassPanel className="hidden lg:block p-6 h-fit">
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
