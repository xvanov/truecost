/**
 * Project Page Component
 * Main project page with four-view navigation (Scope | Time | Space | Money)
 */

import { useParams, useNavigate, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProjectStore } from '../store/projectStore';
import { useViewIndicatorsStore } from '../store/viewIndicatorsStore';
import { Board } from './Board';
import { ScopeView } from '../components/scope/ScopeView';
import { TimeView } from '../components/time/TimeView';
import { MoneyView } from '../components/money/MoneyView';
import { EstimationView } from '../components/estimation/EstimationView';
import { ViewIndicator } from '../components/shared/ViewIndicator';
import { PresenceIndicator } from '../components/shared/PresenceIndicator';
import { getDoc, doc } from 'firebase/firestore';
import { firestore } from '../services/firebase';
import type { Project } from '../types/project';

/**
 * Convert Firestore document to Project
 */
function firestoreDocToProject(docId: string, data: Record<string, unknown>): Project {
  const createdAtValue = data.createdAt;
  const updatedAtValue = data.updatedAt;
  
  return {
    id: docId,
    name: (typeof data.name === 'string' ? data.name : '') || '',
    description: (typeof data.description === 'string' ? data.description : '') || '',
    status: (typeof data.status === 'string' ? data.status : 'estimating') as Project['status'],
    ownerId: (typeof data.ownerId === 'string' ? data.ownerId : '') || '',
    collaborators: (Array.isArray(data.collaborators) ? data.collaborators : []) as Project['collaborators'],
    createdAt: (createdAtValue && typeof createdAtValue === 'object' && 'toMillis' in createdAtValue && typeof createdAtValue.toMillis === 'function')
      ? createdAtValue.toMillis()
      : (typeof createdAtValue === 'number' ? createdAtValue : Date.now()),
    updatedAt: (updatedAtValue && typeof updatedAtValue === 'object' && 'toMillis' in updatedAtValue && typeof updatedAtValue.toMillis === 'function')
      ? updatedAtValue.toMillis()
      : (typeof updatedAtValue === 'number' ? updatedAtValue : Date.now()),
    createdBy: (typeof data.createdBy === 'string' ? data.createdBy : '') || '',
    updatedBy: (typeof data.updatedBy === 'string' ? data.updatedBy : '') || '',
    profitLoss: typeof data.profitLoss === 'number' ? data.profitLoss : undefined,
    actualCosts: typeof data.actualCosts === 'number' ? data.actualCosts : undefined,
    estimateTotal: typeof data.estimateTotal === 'number' ? data.estimateTotal : undefined,
  };
}

/**
 * Project Page with Four-View Navigation
 */
export function Project() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const projects = useProjectStore((state) => state.projects);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);
  const { indicators, clearIndicator } = useViewIndicatorsStore();
  
  const [loadingProject, setLoadingProject] = useState(true);
  const [projectNotFound, setProjectNotFound] = useState(false);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const hasLoadedRef = useRef(false);
  const hasEverLoadedRef = useRef(false);
  const previousProjectIdRef = useRef<string | undefined>(undefined);

  // Clear indicator when user clicks on a tab
  useEffect(() => {
    const pathname = location.pathname;
    if (pathname.includes('/scope')) {
      clearIndicator('scope');
    } else if (pathname.includes('/time')) {
      clearIndicator('time');
    } else if (pathname.includes('/space')) {
      clearIndicator('space');
    } else if (pathname.includes('/money')) {
      clearIndicator('money');
    }
  }, [location.pathname, clearIndicator]);

  // Find the current project in local array - memoize to prevent unnecessary re-renders
  const localProject = useMemo(() => {
    return projectId ? projects.find(p => p.id === projectId) : null;
  }, [projectId, projects]);
  
  // Use projectData if available, otherwise use localProject
  const project = projectData || localProject;

  // Redirect to login if not authenticated (but only after auth loading is complete)
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  // Reset loading state ONLY when projectId actually changes (not on initial mount if same project)
  useEffect(() => {
    if (previousProjectIdRef.current !== projectId) {
      hasLoadedRef.current = false;
      hasEverLoadedRef.current = false;
      setProjectData(null);
      setProjectNotFound(false);
      setLoadingProject(true);
      previousProjectIdRef.current = projectId;
    }
  }, [projectId]);

  // Load project - check local array first, then Firestore
  // This effect only runs when projectId or user changes, not when projects array updates
  useEffect(() => {
    // Don't load if still checking auth or no project ID
    if (!projectId || authLoading || !user || hasLoadedRef.current) return;
    
    // Check local array first - use getState() to get latest value, not closure
    const currentProjects = useProjectStore.getState().projects;
    const foundProject = currentProjects.find(p => p.id === projectId);
    if (foundProject) {
      setProjectData(foundProject);
      setLoadingProject(false);
      setProjectNotFound(false);
      hasLoadedRef.current = true;
      hasEverLoadedRef.current = true;
      return;
    }
    
    // Load from Firestore only if not found locally
    const projectRef = doc(firestore, 'projects', projectId);
    getDoc(projectRef)
      .then((docSnapshot) => {
        // Double-check local array in case project was added while loading
        const currentProjects = useProjectStore.getState().projects;
        const localFound = currentProjects.find(p => p.id === projectId);
        if (localFound) {
          setProjectData(localFound);
          setLoadingProject(false);
          hasLoadedRef.current = true;
          hasEverLoadedRef.current = true;
          return;
        }
        
        hasLoadedRef.current = true;
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          // Check if user has access
          const isOwner = data.ownerId === user.uid;
          const isCollaborator = data.collaborators?.some(
            (c: { userId: string }) => c.userId === user.uid
          );
          
          if (isOwner || isCollaborator) {
            const loadedProject = firestoreDocToProject(docSnapshot.id, data);
            setProjectData(loadedProject);
            setLoadingProject(false);
            hasEverLoadedRef.current = true;
          } else {
            // Access denied
            setProjectNotFound(true);
            setLoadingProject(false);
          }
        } else {
          // Project doesn't exist in Firestore yet
          // Check local array one more time (handles race condition when project is just created)
          const currentProjects = useProjectStore.getState().projects;
          const localFound = currentProjects.find(p => p.id === projectId);
          if (localFound) {
            setProjectData(localFound);
            setLoadingProject(false);
            hasLoadedRef.current = true;
            hasEverLoadedRef.current = true;
          } else {
            // Don't mark as not found immediately - let the localProject effect handle it
            // This prevents premature "not found" when project is being created
            hasLoadedRef.current = true;
            setLoadingProject(false);
            // The localProject effect will set projectData when it appears
          }
        }
      })
      .catch((error) => {
        hasLoadedRef.current = true;
        console.error('Error loading project:', error);
        // Before marking as not found, check local array one more time
        const currentProjects = useProjectStore.getState().projects;
        const localFound = currentProjects.find(p => p.id === projectId);
        if (localFound) {
          setProjectData(localFound);
          setLoadingProject(false);
          hasEverLoadedRef.current = true;
        } else {
          setProjectNotFound(true);
          setLoadingProject(false);
        }
      });
  }, [projectId, user, authLoading]); // Added authLoading to dependencies

  // Update projectData when localProject changes (from subscription) - handles race conditions
  // This is critical for newly created projects that appear in the array after component mounts
  useEffect(() => {
    if (!localProject) return;
    
    // If we have a local project but no projectData, use it immediately
    if (!projectData) {
      setProjectData(localProject);
      setLoadingProject(false);
      setProjectNotFound(false);
      hasLoadedRef.current = true;
      hasEverLoadedRef.current = true;
      return;
    }
    
    // If localProject appeared after we marked as not found, recover
    if (projectNotFound && localProject.id === projectId) {
      setProjectData(localProject);
      setProjectNotFound(false);
      setLoadingProject(false);
      hasEverLoadedRef.current = true;
      return;
    }
    
    // If we have both and they're the same project, ensure loading is false
    if (localProject.id === projectData.id) {
      setLoadingProject(false);
      hasEverLoadedRef.current = true;
    }
  }, [localProject, projectData, projectNotFound, projectId]);

  // Set current project
  useEffect(() => {
    if (project) {
      setCurrentProject(project);
      hasEverLoadedRef.current = true;
    }
  }, [project, setCurrentProject]);

  // Redirect to space view by default if no view specified
  useEffect(() => {
    if (projectId && window.location.pathname === `/projects/${projectId}`) {
      navigate(`/projects/${projectId}/space`, { replace: true });
    }
  }, [projectId, navigate]);

  // Show project not found
  if (projectNotFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-truecost-bg-primary">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-truecost-text-primary mb-4">Project Not Found</h2>
          <p className="text-truecost-text-secondary mb-4">The project you're looking for doesn't exist or you don't have access to it.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-truecost-accent text-white rounded hover:bg-truecost-accent/80"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Show loading state ONLY if we're actively loading and haven't ever loaded a project
  // Once we've loaded a project, never show loading again (prevents unmounting Board)
  // Also, if we have a project available (from localProject), don't show loading
  if ((loadingProject || !project) && !hasEverLoadedRef.current && !projectNotFound && !localProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-truecost-bg-primary">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-truecost-accent border-t-transparent mx-auto"></div>
          <p className="text-truecost-text-secondary">Loading project...</p>
        </div>
      </div>
    );
  }

  // If we've loaded before but project is temporarily undefined, still render the structure
  // This prevents Board from unmounting during re-renders
  // Board will handle its own loading/error states
  if (!project && hasEverLoadedRef.current && !projectNotFound) {
    const basePath = `/projects/${projectId}`;
    return (
      <div className="flex h-screen flex-col bg-truecost-bg-primary">
        <div className="border-b border-truecost-border bg-truecost-bg-surface">
          <div className="flex">
            <NavLink
              to={`${basePath}/scope`}
              className={({ isActive }) =>
                `px-6 py-4 font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-truecost-accent text-truecost-accent'
                    : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-bg-primary/50'
                }`
              }
            >
              Scope
            </NavLink>
            <NavLink
              to={`${basePath}/space`}
              className={({ isActive }) =>
                `px-6 py-4 font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-truecost-accent text-truecost-accent'
                    : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-bg-primary/50'
                }`
              }
            >
              Space
            </NavLink>
            <NavLink
              to={`${basePath}/estimate`}
              className={({ isActive }) =>
                `px-6 py-4 font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`
              }
            >
              Estimate
            </NavLink>
            <NavLink
              to={`${basePath}/time`}
              className={({ isActive }) =>
                `px-6 py-4 font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-truecost-accent text-truecost-accent'
                    : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-bg-primary/50'
                }`
              }
            >
              Time
            </NavLink>
            <NavLink
              to={`${basePath}/money`}
              className={({ isActive }) =>
                `px-6 py-4 font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-truecost-accent text-truecost-accent'
                    : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-bg-primary/50'
                }`
              }
            >
              Money
            </NavLink>
            <div className="ml-auto flex items-center px-6">
              <button
                onClick={() => navigate('/')}
                className="text-sm text-truecost-text-secondary hover:text-truecost-text-primary"
              >
                ← Back to Projects
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="scope" element={<ScopeView />} />
            <Route path="space" element={<Board />} />
            <Route path="estimate" element={<EstimationView />} />
            <Route path="time" element={<TimeView projectId={projectId || ''} />} />
            <Route path="money" element={<MoneyView />} />
            <Route path="*" element={<ScopeView />} />
          </Routes>
        </div>
      </div>
    );
  }

  const basePath = `/projects/${projectId}`;

  return (
    <div className="flex h-screen flex-col bg-truecost-bg-primary">
      {/* Four-View Navigation Tabs */}
      <div className="border-b border-truecost-border bg-truecost-bg-surface">
        <div className="flex">
          <NavLink
            to={`${basePath}/scope`}
            className={({ isActive }) =>
              `px-6 py-4 font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-truecost-accent text-truecost-accent'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-bg-primary/50'
              }`
            }
          >
            Scope
            {indicators.scope && <ViewIndicator />}
            <PresenceIndicator view="scope" />
          </NavLink>
          <NavLink
            to={`${basePath}/space`}
            className={({ isActive }) =>
              `px-6 py-4 font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-truecost-accent text-truecost-accent'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-bg-primary/50'
              }`
            }
          >
            Space
            {indicators.space && <ViewIndicator />}
            <PresenceIndicator view="space" />
          </NavLink>
          <NavLink
            to={`${basePath}/estimate`}
            className={({ isActive }) =>
              `px-6 py-4 font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-green-600 text-green-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Estimate
            </span>
          </NavLink>
          <NavLink
            to={`${basePath}/time`}
            className={({ isActive }) =>
              `px-6 py-4 font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-truecost-accent text-truecost-accent'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-bg-primary/50'
              }`
            }
          >
            Time
            {indicators.time && <ViewIndicator />}
            <PresenceIndicator view="time" />
          </NavLink>
          <NavLink
            to={`${basePath}/money`}
            className={({ isActive }) =>
              `px-6 py-4 font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-truecost-accent text-truecost-accent'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-bg-primary/50'
              }`
            }
          >
            Money
            {indicators.money && <ViewIndicator />}
            <PresenceIndicator view="money" />
          </NavLink>
          <div className="ml-auto flex items-center px-6">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-truecost-text-secondary hover:text-truecost-text-primary"
            >
              ← Back to Projects
            </button>
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="scope" element={<ScopeView />} />
          <Route path="space" element={<Board />} />
          <Route path="estimate" element={<EstimationView />} />
          <Route path="time" element={<TimeView projectId={projectId || ''} />} />
          <Route path="money" element={<MoneyView />} />
          <Route path="*" element={<ScopeView />} />
        </Routes>
      </div>
    </div>
  );
}
