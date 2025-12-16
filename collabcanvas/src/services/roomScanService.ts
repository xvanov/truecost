/**
 * Room Scan Service
 *
 * Handles room scanning integration:
 * - Parse Canvas OBJ exports
 * - Manual room entry
 * - Calculate areas and volumes
 * - Link to TrueCost projects
 */

import { firestore } from './firebase';
import {
  doc,
  setDoc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type {
  ScannedRoom,
  ScanProject,
  RoomDimensions,
  RoomType,
} from '../types/roomScan';

const SCAN_PROJECTS_COLLECTION = 'scanProjects';

/**
 * Calculate room area and volume from dimensions
 */
export function calculateRoomMetrics(
  length: number,
  width: number,
  height: number
): RoomDimensions {
  return {
    length,
    width,
    height,
    area: Math.round(length * width * 100) / 100,
    volume: Math.round(length * width * height * 100) / 100,
  };
}

/**
 * Create a new scanned room
 */
export function createRoom(
  name: string,
  type: RoomType,
  length: number,
  width: number,
  height: number,
  sourceApp: ScannedRoom['sourceApp'] = 'manual'
): ScannedRoom {
  return {
    id: `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    type,
    dimensions: calculateRoomMetrics(length, width, height),
    features: [],
    scanDate: new Date(),
    sourceApp,
  };
}

/**
 * Save scan project to Firestore
 */
export async function saveScanProject(
  userId: string,
  projectId: string,
  rooms: ScannedRoom[]
): Promise<string> {
  const scanProjectId = `${projectId}_scan`;
  const totalSqFt = rooms.reduce((sum, room) => sum + room.dimensions.area, 0);

  const scanProject: Omit<ScanProject, 'createdAt' | 'updatedAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
    userId: string;
  } = {
    id: scanProjectId,
    projectId,
    rooms,
    totalSqFt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    userId,
  };

  await setDoc(doc(firestore, SCAN_PROJECTS_COLLECTION, scanProjectId), scanProject);
  return scanProjectId;
}

/**
 * Get scan project for a TrueCost project
 */
export async function getScanProject(
  projectId: string
): Promise<ScanProject | null> {
  const scanProjectId = `${projectId}_scan`;
  const docRef = doc(firestore, SCAN_PROJECTS_COLLECTION, scanProjectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as ScanProject;
}

/**
 * Add room to existing scan project
 */
export async function addRoomToProject(
  projectId: string,
  room: ScannedRoom
): Promise<void> {
  const scanProjectId = `${projectId}_scan`;
  const docRef = doc(firestore, SCAN_PROJECTS_COLLECTION, scanProjectId);

  await runTransaction(firestore, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new Error('Scan project not found');
    }

    const data = docSnap.data();
    const rooms = [...(data.rooms || []), room];
    const totalSqFt = rooms.reduce(
      (sum: number, r: ScannedRoom) => sum + r.dimensions.area,
      0
    );

    transaction.update(docRef, {
      rooms,
      totalSqFt,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Update room in scan project
 */
export async function updateRoom(
  projectId: string,
  roomId: string,
  updates: Partial<ScannedRoom>
): Promise<void> {
  const scanProjectId = `${projectId}_scan`;
  const docRef = doc(firestore, SCAN_PROJECTS_COLLECTION, scanProjectId);

  await runTransaction(firestore, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new Error('Scan project not found');
    }

    const data = docSnap.data();
    const rooms = data.rooms.map((r: ScannedRoom) =>
      r.id === roomId ? { ...r, ...updates } : r
    );
    const totalSqFt = rooms.reduce(
      (sum: number, r: ScannedRoom) => sum + r.dimensions.area,
      0
    );

    transaction.update(docRef, {
      rooms,
      totalSqFt,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Delete room from scan project
 */
export async function deleteRoom(
  projectId: string,
  roomId: string
): Promise<void> {
  const scanProjectId = `${projectId}_scan`;
  const docRef = doc(firestore, SCAN_PROJECTS_COLLECTION, scanProjectId);

  await runTransaction(firestore, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new Error('Scan project not found');
    }

    const data = docSnap.data();
    const rooms = data.rooms.filter((r: ScannedRoom) => r.id !== roomId);
    const totalSqFt = rooms.reduce(
      (sum: number, r: ScannedRoom) => sum + r.dimensions.area,
      0
    );

    transaction.update(docRef, {
      rooms,
      totalSqFt,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Parse Canvas measurement report (simplified parser)
 * Canvas exports measurements in various formats - this handles basic text format
 */
export function parseCanvasMeasurements(measurementText: string): {
  rooms: Partial<ScannedRoom>[];
  totalArea: number;
} {
  const rooms: Partial<ScannedRoom>[] = [];
  let totalArea = 0;

  // Split by common room delimiters
  const lines = measurementText.split('\n').filter((line) => line.trim());

  let currentRoom: Partial<ScannedRoom> | null = null;

  for (const line of lines) {
    // Look for room headers (e.g., "Living Room:", "Bedroom 1:")
    const roomMatch = line.match(/^([A-Za-z\s]+\d*)[\s:]+$/);
    if (roomMatch) {
      if (currentRoom) {
        rooms.push(currentRoom);
      }
      currentRoom = {
        name: roomMatch[1].trim(),
        type: guessRoomType(roomMatch[1]),
        sourceApp: 'canvas',
      };
      continue;
    }

    // Look for dimensions (e.g., "12' x 14'" or "12ft x 14ft" or "12 x 14")
    const dimMatch = line.match(
      /(\d+\.?\d*)\s*(?:'|ft|feet)?\s*[xX×]\s*(\d+\.?\d*)\s*(?:'|ft|feet)?/
    );
    if (dimMatch && currentRoom) {
      const length = parseFloat(dimMatch[1]);
      const width = parseFloat(dimMatch[2]);
      currentRoom.dimensions = calculateRoomMetrics(length, width, 8); // Assume 8ft ceiling
      totalArea += currentRoom.dimensions.area;
      continue;
    }

    // Look for area (e.g., "Area: 168 sq ft")
    const areaMatch = line.match(/[Aa]rea[\s:]+(\d+\.?\d*)\s*(?:sq\.?\s*ft|SF)?/);
    if (areaMatch && currentRoom) {
      const area = parseFloat(areaMatch[1]);
      if (!currentRoom.dimensions) {
        // Estimate dimensions from area (assume square-ish room)
        const side = Math.sqrt(area);
        currentRoom.dimensions = calculateRoomMetrics(side, side, 8);
      }
      totalArea = Math.max(totalArea, area);
    }

    // Look for ceiling height
    const heightMatch = line.match(
      /[Cc]eiling[\s:]+(\d+\.?\d*)\s*[\'ft]?|[Hh]eight[\s:]+(\d+\.?\d*)\s*[\'ft]?/
    );
    if (heightMatch && currentRoom?.dimensions) {
      const height = parseFloat(heightMatch[1] || heightMatch[2]);
      currentRoom.dimensions = calculateRoomMetrics(
        currentRoom.dimensions.length,
        currentRoom.dimensions.width,
        height
      );
    }

    // Look for windows
    const windowMatch = line.match(/(\d+)\s*[Ww]indows?/);
    if (windowMatch && currentRoom) {
      currentRoom.features = currentRoom.features || [];
      currentRoom.features.push({
        type: 'window',
        count: parseInt(windowMatch[1]),
      });
    }

    // Look for doors
    const doorMatch = line.match(/(\d+)\s*[Dd]oors?/);
    if (doorMatch && currentRoom) {
      currentRoom.features = currentRoom.features || [];
      currentRoom.features.push({
        type: 'door',
        count: parseInt(doorMatch[1]),
      });
    }
  }

  // Don't forget the last room
  if (currentRoom) {
    rooms.push(currentRoom);
  }

  return { rooms, totalArea };
}

/**
 * Guess room type from name
 */
function guessRoomType(name: string): RoomType {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('living')) return 'living_room';
  if (lowerName.includes('bed')) return 'bedroom';
  if (lowerName.includes('bath')) return 'bathroom';
  if (lowerName.includes('kitchen')) return 'kitchen';
  if (lowerName.includes('dining')) return 'dining_room';
  if (lowerName.includes('office') || lowerName.includes('study'))
    return 'office';
  if (lowerName.includes('garage')) return 'garage';
  if (lowerName.includes('basement')) return 'basement';
  if (lowerName.includes('attic')) return 'attic';
  if (lowerName.includes('hall')) return 'hallway';
  if (lowerName.includes('closet')) return 'closet';
  if (lowerName.includes('laundry')) return 'laundry';

  return 'other';
}

/**
 * Generate scope items from scanned rooms
 * This creates suggested scope items based on room types and features
 */
export function generateScopeFromRooms(rooms: ScannedRoom[]): {
  category: string;
  item: string;
  quantity: number;
  unit: string;
}[] {
  const scopeItems: {
    category: string;
    item: string;
    quantity: number;
    unit: string;
  }[] = [];

  for (const room of rooms) {
    const { dimensions, features, type } = room;

    // Flooring
    scopeItems.push({
      category: 'Flooring',
      item: `${room.name} - Floor covering`,
      quantity: dimensions.area,
      unit: 'sq ft',
    });

    // Paint - walls
    const wallArea =
      2 * (dimensions.length + dimensions.width) * dimensions.height;
    scopeItems.push({
      category: 'Paint',
      item: `${room.name} - Wall paint`,
      quantity: Math.round(wallArea),
      unit: 'sq ft',
    });

    // Paint - ceiling
    scopeItems.push({
      category: 'Paint',
      item: `${room.name} - Ceiling paint`,
      quantity: dimensions.area,
      unit: 'sq ft',
    });

    // Baseboards
    const perimeter = 2 * (dimensions.length + dimensions.width);
    scopeItems.push({
      category: 'Trim',
      item: `${room.name} - Baseboard`,
      quantity: Math.round(perimeter),
      unit: 'linear ft',
    });

    // Room-specific items
    if (type === 'bathroom') {
      scopeItems.push(
        { category: 'Plumbing', item: `${room.name} - Toilet`, quantity: 1, unit: 'each' },
        { category: 'Plumbing', item: `${room.name} - Vanity`, quantity: 1, unit: 'each' },
        { category: 'Plumbing', item: `${room.name} - Shower/Tub`, quantity: 1, unit: 'each' }
      );
    }

    if (type === 'kitchen') {
      scopeItems.push(
        { category: 'Cabinets', item: `${room.name} - Base cabinets`, quantity: Math.round(perimeter * 0.6), unit: 'linear ft' },
        { category: 'Cabinets', item: `${room.name} - Wall cabinets`, quantity: Math.round(perimeter * 0.4), unit: 'linear ft' },
        { category: 'Countertops', item: `${room.name} - Countertop`, quantity: Math.round(perimeter * 0.6 * 2), unit: 'sq ft' }
      );
    }

    // Features
    for (const feature of features) {
      if (feature.type === 'window') {
        scopeItems.push({
          category: 'Windows',
          item: `${room.name} - Window`,
          quantity: feature.count,
          unit: 'each',
        });
      }
      if (feature.type === 'door') {
        scopeItems.push({
          category: 'Doors',
          item: `${room.name} - Door`,
          quantity: feature.count,
          unit: 'each',
        });
      }
    }
  }

  return scopeItems;
}

/**
 * Get App Store link for Canvas
 */
export function getCanvasAppLink(): {
  ios: string;
  instructions: string[];
} {
  return {
    ios: 'https://apps.apple.com/us/app/canvas-lidar-3d-measurements/id1169235377',
    instructions: [
      '1. Download Canvas from the App Store (requires iPhone 12 Pro+ or iPad Pro with LiDAR)',
      '2. Open Canvas and create a new scan',
      '3. Walk through each room, following the on-screen guide',
      '4. Review and name each room in Canvas',
      '5. Export the measurement report (Share > Export Measurements)',
      '6. Copy the measurements or save as PDF',
      '7. Return to TrueCost and paste/upload the measurements',
    ],
  };
}
