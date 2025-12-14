/**
 * Firebase Cloud Functions Entry Point
 */

import { aiCommand } from './aiCommand';
import { materialEstimateCommand } from './materialEstimateCommand';
import { getHomeDepotPrice } from './pricing';
import { sagemakerInvoke } from './sagemakerInvoke';
import { clarificationAgent } from './clarificationAgent';
import { estimationPipeline } from './estimationPipeline';
import { comparePrices } from './priceComparison';
import { annotationCheckAgent } from './annotationCheckAgent';
import { triggerEstimatePipeline, updatePipelineStage } from './estimatePipelineOrchestrator';
// import { onProjectDeleted } from './projectDeletion'; // TODO: Uncomment when ready to deploy

export { 
  aiCommand, 
  materialEstimateCommand, 
  getHomeDepotPrice, 
  sagemakerInvoke,
  clarificationAgent,
  estimationPipeline,
  comparePrices,
  annotationCheckAgent,
  triggerEstimatePipeline,
  updatePipelineStage,
};
// export { onProjectDeleted }; // TODO: Uncomment when ready to deploy
