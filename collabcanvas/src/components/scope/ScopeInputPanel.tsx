/**
 * Scope Input Panel Component
 * Handles scope text input and plan image upload for estimation workflow
 */

import { useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { uploadPlanImage } from '../../services/estimationService';
import type { PlanImage } from '../../types/scope';

interface ScopeInputPanelProps {
  onScopeSubmit: (scopeText: string, planImage: PlanImage) => void;
  loading?: boolean;
  existingScope?: string;
  existingImage?: PlanImage;
}

export function ScopeInputPanel({ 
  onScopeSubmit, 
  loading = false,
  existingScope = '',
  existingImage,
}: ScopeInputPanelProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  
  const [scopeText, setScopeText] = useState(existingScope);
  const [planImage, setPlanImage] = useState<PlanImage | null>(existingImage || null);
  const [imagePreview, setImagePreview] = useState<string | null>(existingImage?.url || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId || !user) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please upload a PNG, JPG, or WebP image.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Show preview immediately
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);

      // Upload to Firebase Storage
      const uploadedImage = await uploadPlanImage(projectId, file, user.uid);
      setPlanImage(uploadedImage);
      
      // Clean up blob URL after upload complete
      URL.revokeObjectURL(previewUrl);
      setImagePreview(uploadedImage.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
      setImagePreview(null);
      setPlanImage(null);
    } finally {
      setUploading(false);
    }
  }, [projectId, user]);

  const handleRemoveImage = useCallback(() => {
    setPlanImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!scopeText.trim()) {
      setError('Please enter a scope definition.');
      return;
    }
    if (!planImage) {
      setError('Please upload a plan image.');
      return;
    }
    
    setError(null);
    onScopeSubmit(scopeText, planImage);
  }, [scopeText, planImage, onScopeSubmit]);

  const canSubmit = scopeText.trim().length > 0 && planImage !== null && !loading && !uploading;

  return (
    <div className="space-y-6">
      {/* Plan Image Upload - Now first for better UX */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Floor Plan / Construction Plan
        </label>
        
        {imagePreview ? (
          <div className="relative">
            <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
              <img
                src={imagePreview}
                alt="Plan preview"
                className="w-full max-h-60 object-contain"
              />
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-white text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent mb-2"></div>
                    <p>Uploading...</p>
                  </div>
                </div>
              )}
            </div>
            {planImage && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {planImage.fileName} ({planImage.width}×{planImage.height}px)
                </span>
                <button
                  onClick={handleRemoveImage}
                  className="text-red-600 hover:text-red-700"
                  disabled={loading}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
          >
            <svg
              className="mx-auto h-10 w-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              Click to upload floor plan image
            </p>
            <p className="mt-1 text-xs text-gray-400">
              PNG, JPG, or WebP
            </p>
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Scope Definition Input */}
      <div>
        <label htmlFor="scope-text" className="block text-sm font-medium text-gray-700 mb-2">
          Scope Definition
        </label>
        <textarea
          id="scope-text"
          value={scopeText}
          onChange={(e) => setScopeText(e.target.value)}
          placeholder="Describe your project in detail. For example: 'Kitchen remodel in Denver, about 200 sq ft, mid-range finishes. We want new cabinets, granite countertops, hardwood flooring, and updated appliances. Keep existing plumbing locations.'"
          className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900 placeholder-gray-400"
          disabled={loading}
        />
        <p className="mt-1 text-xs text-gray-500">
          Include project type, location, size, finish level, and any special requirements.
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center ${
          canSubmit
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
            Processing...
          </span>
        ) : (
          <>
            <span>Save Scope & Continue</span>
            <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
