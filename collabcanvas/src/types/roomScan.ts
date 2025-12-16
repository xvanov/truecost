/**
 * Room Scan Types
 *
 * Types for 3D room scanning integration with Canvas/LiDAR
 */

export interface RoomDimensions {
  length: number; // in feet
  width: number;  // in feet
  height: number; // in feet
  area: number;   // sq ft (auto-calculated)
  volume: number; // cubic ft (auto-calculated)
}

export interface ScannedRoom {
  id: string;
  name: string;
  type: RoomType;
  dimensions: RoomDimensions;
  features: RoomFeature[];
  scanDate: Date;
  sourceApp?: 'canvas' | 'manual' | 'arcore' | 'arkit';
  rawData?: string; // OBJ or measurement file reference
}

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'dining_room'
  | 'office'
  | 'garage'
  | 'basement'
  | 'attic'
  | 'hallway'
  | 'closet'
  | 'laundry'
  | 'other';

export interface RoomFeature {
  type: FeatureType;
  dimensions?: {
    width: number;
    height: number;
  };
  count: number;
  notes?: string;
}

export type FeatureType =
  | 'window'
  | 'door'
  | 'closet_door'
  | 'outlet'
  | 'light_switch'
  | 'ceiling_fan'
  | 'fireplace'
  | 'built_in_shelving'
  | 'crown_molding'
  | 'baseboard';

export interface ScanProject {
  id: string;
  projectId: string; // TrueCost project ID
  rooms: ScannedRoom[];
  totalSqFt: number;
  createdAt: Date;
  updatedAt: Date;
}

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living_room: 'Living Room',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  dining_room: 'Dining Room',
  office: 'Office/Study',
  garage: 'Garage',
  basement: 'Basement',
  attic: 'Attic',
  hallway: 'Hallway',
  closet: 'Closet',
  laundry: 'Laundry Room',
  other: 'Other',
};

export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  window: 'Window',
  door: 'Door',
  closet_door: 'Closet Door',
  outlet: 'Electrical Outlet',
  light_switch: 'Light Switch',
  ceiling_fan: 'Ceiling Fan',
  fireplace: 'Fireplace',
  built_in_shelving: 'Built-in Shelving',
  crown_molding: 'Crown Molding',
  baseboard: 'Baseboard',
};
