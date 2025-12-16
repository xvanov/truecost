/**
 * Floor Plan Generator Service
 *
 * Generates simple floor plan images from AR scan results.
 * This creates a basic rectangular room layout that can be edited
 * in the canvas.
 */

interface RoomDimensions {
  length: number; // in feet
  width: number;  // in feet
  height: number; // in feet
}

interface RoomFeatures {
  windowCount: number;
  doorCount: number;
}

interface FloorPlanOptions {
  /** Pixels per foot for the generated image */
  scale?: number;
  /** Background color */
  backgroundColor?: string;
  /** Wall color */
  wallColor?: string;
  /** Wall thickness in pixels */
  wallThickness?: number;
  /** Show dimensions on the plan */
  showDimensions?: boolean;
  /** Show door/window indicators */
  showFeatures?: boolean;
}

const DEFAULT_OPTIONS: Required<FloorPlanOptions> = {
  scale: 25, // 25 pixels per foot for better visibility
  backgroundColor: '#ffffff',
  wallColor: '#1a1a2e',
  wallThickness: 8,
  showDimensions: true,
  showFeatures: true,
};

/**
 * Generate a floor plan image from room dimensions
 * Returns a data URL that can be used as a background image
 */
export function generateFloorPlan(
  dimensions: RoomDimensions,
  features: RoomFeatures,
  options: FloorPlanOptions = {}
): { dataUrl: string; width: number; height: number } {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Add padding around the room for labels
  const padding = 80; // pixels - extra space for dimension labels

  // Calculate canvas size
  const roomWidth = dimensions.length * opts.scale;
  const roomHeight = dimensions.width * opts.scale;
  const canvasWidth = roomWidth + padding * 2;
  const canvasHeight = roomHeight + padding * 2;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // Fill background
  ctx.fillStyle = opts.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw room outline (walls)
  ctx.strokeStyle = opts.wallColor;
  ctx.lineWidth = opts.wallThickness;
  ctx.lineCap = 'square';

  const roomX = padding;
  const roomY = padding;

  // Draw outer walls
  ctx.beginPath();
  ctx.rect(roomX, roomY, roomWidth, roomHeight);
  ctx.stroke();

  // Fill room interior with a light color
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(
    roomX + opts.wallThickness / 2,
    roomY + opts.wallThickness / 2,
    roomWidth - opts.wallThickness,
    roomHeight - opts.wallThickness
  );

  // Draw features (doors and windows)
  if (opts.showFeatures) {
    drawFeatures(ctx, roomX, roomY, roomWidth, roomHeight, features, opts);
  }

  // Draw dimensions
  if (opts.showDimensions) {
    drawDimensions(ctx, roomX, roomY, roomWidth, roomHeight, dimensions, padding, opts);
  }

  // Round dimensions for display
  const lengthRounded = Math.round(dimensions.length * 10) / 10;
  const widthRounded = Math.round(dimensions.width * 10) / 10;
  const heightRounded = Math.round(dimensions.height * 10) / 10;
  const areaRounded = Math.round(lengthRounded * widthRounded);

  // Add room label
  ctx.fillStyle = '#666666';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${lengthRounded}' x ${widthRounded}'`,
    canvasWidth / 2,
    roomY + roomHeight / 2 - 15
  );
  ctx.font = '14px Arial';
  ctx.fillText(
    `Area: ${areaRounded} sq ft`,
    canvasWidth / 2,
    roomY + roomHeight / 2 + 10
  );
  ctx.fillText(
    `Height: ${heightRounded}'`,
    canvasWidth / 2,
    roomY + roomHeight / 2 + 30
  );

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvasWidth,
    height: canvasHeight,
  };
}

function drawFeatures(
  ctx: CanvasRenderingContext2D,
  roomX: number,
  roomY: number,
  roomWidth: number,
  roomHeight: number,
  features: RoomFeatures,
  opts: Required<FloorPlanOptions>
) {
  const doorWidth = 36 * opts.scale / 20; // ~36" door
  const windowWidth = 30 * opts.scale / 20; // ~30" window

  // Draw door(s) on bottom wall
  ctx.fillStyle = opts.backgroundColor;
  ctx.strokeStyle = '#2563eb'; // Blue for doors
  ctx.lineWidth = 2;

  for (let i = 0; i < features.doorCount; i++) {
    const doorX = roomX + (roomWidth * (i + 1)) / (features.doorCount + 1) - doorWidth / 2;
    const doorY = roomY + roomHeight - opts.wallThickness / 2;

    // Clear wall for door opening
    ctx.fillRect(doorX, doorY - opts.wallThickness / 2, doorWidth, opts.wallThickness + 2);

    // Draw door arc
    ctx.beginPath();
    ctx.arc(doorX, doorY, doorWidth, -Math.PI / 2, 0);
    ctx.stroke();

    // Draw door leaf
    ctx.beginPath();
    ctx.moveTo(doorX, doorY);
    ctx.lineTo(doorX + doorWidth, doorY);
    ctx.stroke();
  }

  // Draw window(s) on top wall
  ctx.strokeStyle = '#059669'; // Green for windows
  ctx.lineWidth = 3;

  for (let i = 0; i < features.windowCount; i++) {
    const windowX = roomX + (roomWidth * (i + 1)) / (features.windowCount + 1) - windowWidth / 2;
    const windowY = roomY;

    // Draw double line for window
    ctx.beginPath();
    ctx.moveTo(windowX, windowY - 2);
    ctx.lineTo(windowX + windowWidth, windowY - 2);
    ctx.moveTo(windowX, windowY + 2);
    ctx.lineTo(windowX + windowWidth, windowY + 2);
    ctx.stroke();
  }

  // Add legend
  ctx.font = '10px Arial';
  ctx.fillStyle = '#2563eb';
  ctx.textAlign = 'left';
  ctx.fillText(`Doors: ${features.doorCount}`, roomX, roomY + roomHeight + 25);
  ctx.fillStyle = '#059669';
  ctx.fillText(`Windows: ${features.windowCount}`, roomX + 80, roomY + roomHeight + 25);
}

function drawDimensions(
  ctx: CanvasRenderingContext2D,
  roomX: number,
  roomY: number,
  roomWidth: number,
  roomHeight: number,
  dimensions: RoomDimensions,
  _padding: number,
  _opts: Required<FloorPlanOptions>
) {
  // Round dimensions for display
  const lengthRounded = Math.round(dimensions.length * 10) / 10;
  const widthRounded = Math.round(dimensions.width * 10) / 10;

  const arrowSize = 8;
  const offset = 25;

  ctx.strokeStyle = '#333333';
  ctx.fillStyle = '#333333';
  ctx.lineWidth = 1;
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';

  // Bottom dimension (length)
  const bottomY = roomY + roomHeight + offset;

  // Line
  ctx.beginPath();
  ctx.moveTo(roomX, bottomY);
  ctx.lineTo(roomX + roomWidth, bottomY);
  ctx.stroke();

  // Left arrow
  ctx.beginPath();
  ctx.moveTo(roomX, bottomY);
  ctx.lineTo(roomX + arrowSize, bottomY - arrowSize / 2);
  ctx.lineTo(roomX + arrowSize, bottomY + arrowSize / 2);
  ctx.fill();

  // Right arrow
  ctx.beginPath();
  ctx.moveTo(roomX + roomWidth, bottomY);
  ctx.lineTo(roomX + roomWidth - arrowSize, bottomY - arrowSize / 2);
  ctx.lineTo(roomX + roomWidth - arrowSize, bottomY + arrowSize / 2);
  ctx.fill();

  // Label
  ctx.fillText(`${lengthRounded}'`, roomX + roomWidth / 2, bottomY - 6);

  // Right dimension (width)
  const rightX = roomX + roomWidth + offset;

  ctx.save();
  ctx.translate(rightX, roomY + roomHeight / 2);
  ctx.rotate(Math.PI / 2);

  // Line
  ctx.beginPath();
  ctx.moveTo(-roomHeight / 2, 0);
  ctx.lineTo(roomHeight / 2, 0);
  ctx.stroke();

  // Arrows
  ctx.beginPath();
  ctx.moveTo(-roomHeight / 2, 0);
  ctx.lineTo(-roomHeight / 2 + arrowSize, -arrowSize / 2);
  ctx.lineTo(-roomHeight / 2 + arrowSize, arrowSize / 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(roomHeight / 2, 0);
  ctx.lineTo(roomHeight / 2 - arrowSize, -arrowSize / 2);
  ctx.lineTo(roomHeight / 2 - arrowSize, arrowSize / 2);
  ctx.fill();

  // Label
  ctx.fillText(`${widthRounded}'`, 0, -6);

  ctx.restore();
}

/**
 * Generate a floor plan from AR scan result
 */
export function generateFloorPlanFromScan(
  scanResult: {
    dimensions: {
      length: number;
      width: number;
      height: number;
    };
    features: Array<{ type: string; count: number }>;
  }
): { dataUrl: string; width: number; height: number } {
  // Extract window and door counts
  let windowCount = 0;
  let doorCount = 0;

  for (const feature of scanResult.features) {
    if (feature.type === 'window') {
      windowCount = feature.count;
    } else if (feature.type === 'door') {
      doorCount = feature.count;
    }
  }

  return generateFloorPlan(
    {
      length: scanResult.dimensions.length,
      width: scanResult.dimensions.width,
      height: scanResult.dimensions.height,
    },
    {
      windowCount,
      doorCount,
    }
  );
}
