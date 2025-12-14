interface FilePreviewProps {
  file?: File | null;
  existingUrl?: string | null;
  existingFileName?: string | null;
  onRemove: () => void;
}

/**
 * FilePreview - Shows selected file or existing uploaded file with icon and metadata.
 */
export function FilePreview({ file, existingUrl, existingFileName, onRemove }: FilePreviewProps) {
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();

    if (ext === 'pdf') {
      return (
        <svg className="w-8 h-8 text-truecost-danger" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
          <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" fill="white" />
        </svg>
      );
    }
    if (ext === 'dwg' || ext === 'dxf') {
      return (
        <svg className="w-8 h-8 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-8 h-8 text-truecost-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Determine what to display - new file takes priority over existing
  const displayName = file?.name || existingFileName || 'Uploaded file';
  const displaySize = file?.size ? formatFileSize(file.size) : (existingUrl ? 'Uploaded' : 'Unknown size');
  const isExisting = !file && !!existingUrl;

  return (
    <div className="glass-panel p-4 flex items-center gap-4">
      <div className="flex-shrink-0 w-16 h-16 bg-truecost-glass-bg rounded-lg flex items-center justify-center">
        {getFileIcon(displayName)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-body text-body text-truecost-text-primary truncate mb-1">{displayName}</p>
        <div className="flex items-center gap-2">
          <p className="font-body text-body-meta text-truecost-text-secondary">{displaySize}</p>
          {isExisting && (
            <span className="text-xs px-2 py-0.5 bg-truecost-cyan/20 text-truecost-cyan rounded-full">
              Saved
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onRemove}
        className="flex-shrink-0 text-truecost-danger hover:text-red-400 transition-colors p-2"
        title="Remove file"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
