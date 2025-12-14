/**
 * Project Card Component - TrueCost glassmorphic redesign.
 * Displays project status, metadata, and actions (view, share, delete).
 */

import { useNavigate } from 'react-router-dom';
import type { Project } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useAuth } from '../../hooks/useAuth';
import { ShareProjectModal } from './ShareProjectModal';
import { useState } from 'react';
import { formatErrorForDisplay } from '../../utils/errorHandler';
import { canDeleteProject, canShareProject } from '../../utils/projectAccess';

interface ProjectCardProps {
  project: Project;
}

// TrueCost theme status colors
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

export function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const deleteProjectAction = useProjectStore((state) => state.deleteProjectAction);
  const loading = useProjectStore((state) => state.loading);
  const [showShareModal, setShowShareModal] = useState(false);

  const canDelete = user ? canDeleteProject(project, user.uid) : false;
  const canShare = user ? canShareProject(project, user.uid) : false;

  const handleProjectClick = () => {
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
        className="glass-panel p-6 cursor-pointer transition-all duration-300 hover:shadow-glow hover:-translate-y-1 group"
        onClick={handleProjectClick}
      >
        {/* Header: Project Name + Action Icons */}
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-heading text-h3 text-truecost-text-primary flex-1 pr-4">
            {project.name}
          </h3>

          <div className="flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
            {canShare && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowShareModal(true);
                }}
                disabled={loading}
                className="text-truecost-cyan hover:text-truecost-teal transition-colors disabled:opacity-50 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-truecost-cyan focus-visible:outline-offset-2 rounded"
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
                className="text-truecost-danger hover:text-red-400 transition-colors disabled:opacity-50 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-truecost-danger focus-visible:outline-offset-2 rounded"
                title="Delete project"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Status Pill */}
        <div className="mb-4">
          <span className={`inline-flex items-center px-3 py-1 rounded-pill text-body-meta font-medium border ${statusColors[project.status]}`}>
            {statusLabels[project.status]}
          </span>
        </div>

        {/* Metadata */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center text-body-meta text-truecost-text-secondary">
            <svg className="w-4 h-4 mr-2 text-truecost-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Updated {new Date(project.updatedAt).toLocaleDateString()}
          </div>

          {project.estimateTotal !== undefined && (
            <div className="flex items-center text-body-meta text-truecost-cyan">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ${project.estimateTotal.toLocaleString()}
            </div>
          )}
        </div>

        {/* Primary action */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleProjectClick();
          }}
          className="w-full btn-pill-secondary text-center"
        >
          View Estimate
        </button>
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

