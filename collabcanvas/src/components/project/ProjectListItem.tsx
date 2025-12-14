import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useAuth } from '../../hooks/useAuth';
import { ShareProjectModal } from './ShareProjectModal';
import { formatErrorForDisplay } from '../../utils/errorHandler';
import { canDeleteProject, canShareProject } from '../../utils/projectAccess';

/**
 * ProjectListItem Component - Table row for list view with glass styling.
 */
interface ProjectListItemProps {
  project: Project;
}

// TrueCost theme status colors (matching ProjectCard)
const statusColors: Record<Project['status'], string> = {
  estimating: 'bg-truecost-warning/20 text-truecost-warning border-truecost-warning/30',
  'bid-ready': 'bg-truecost-cyan/20 text-truecost-cyan border-truecost-cyan/30',
  'bid-lost': 'bg-truecost-danger/20 text-truecost-danger border-truecost-danger/30',
  executing: 'bg-truecost-teal/20 text-truecost-teal border-truecost-teal/30',
  'completed-profitable': 'bg-truecost-teal/20 text-truecost-teal border-truecost-teal/30',
  'completed-unprofitable': 'bg-truecost-warning/20 text-truecost-warning border-truecost-warning/30',
  'completed-unknown': 'bg-truecost-text-muted/20 text-truecost-text-muted border-truecost-text-muted/30',
};

// User-readable status labels
const statusLabels: Record<Project['status'], string> = {
  estimating: 'Estimating',
  'bid-ready': 'Bid Ready',
  'bid-lost': 'Bid Lost',
  executing: 'Executing',
  'completed-profitable': 'Completed',
  'completed-unprofitable': 'Completed',
  'completed-unknown': 'Completed',
};

export function ProjectListItem({ project }: ProjectListItemProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const deleteProjectAction = useProjectStore((state) => state.deleteProjectAction);
  const loading = useProjectStore((state) => state.loading);
  const [showShareModal, setShowShareModal] = useState(false);

  const canDelete = user ? canDeleteProject(project, user.uid) : false;
  const canShare = user ? canShareProject(project, user.uid) : false;

  const handleRowClick = () => {
    // Navigate to scope page for the project
    navigate(`/project/${project.id}/scope`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !canDelete) {
      alert('You do not have permission to delete this project.');
      return;
    }
    if (!confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteProjectAction(project.id, user.uid);
    } catch (error) {
      console.error('Failed to delete project:', error);
      const errorInfo = formatErrorForDisplay(error);
      alert(`${errorInfo.title}: ${errorInfo.message}`);
    }
  };

  return (
    <>
      <div
        className="glass-panel p-4 cursor-pointer transition-all duration-300 hover:shadow-glow group grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-center"
        onClick={handleRowClick}
      >
        {/* Name */}
        <div className="min-w-0">
          <h3 className="font-heading text-body text-truecost-text-primary truncate">
            {project.name}
          </h3>
        </div>

        {/* Status */}
        <div>
          <span className={`inline-flex items-center px-3 py-1 rounded-pill text-body-meta font-medium border ${statusColors[project.status]}`}>
            {statusLabels[project.status]}
          </span>
        </div>

        {/* Updated */}
        <div className="text-body-meta text-truecost-text-secondary">
          {new Date(project.updatedAt).toLocaleDateString()}
        </div>

        {/* Estimate */}
        <div className="text-body-meta text-truecost-cyan">
          {project.estimateTotal !== undefined ? `$${project.estimateTotal.toLocaleString()}` : '—'}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          {canShare && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowShareModal(true);
              }}
              disabled={loading}
              className="text-truecost-cyan hover:text-truecost-teal transition-colors disabled:opacity-50 p-1"
              title="Share project"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="text-truecost-danger hover:text-red-400 transition-colors disabled:opacity-50 p-1"
              title="Delete project"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showShareModal && (
        <ShareProjectModal
          project={project}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}

