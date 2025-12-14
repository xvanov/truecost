/**
 * Room Scan Service Tests
 *
 * Unit tests for room scanning functionality:
 * - Room dimension calculations
 * - Canvas measurement parsing
 * - Scope generation from rooms
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRoomMetrics,
  createRoom,
  parseCanvasMeasurements,
  generateScopeFromRooms,
  getCanvasAppLink,
} from './roomScanService';
import type { ScannedRoom } from '../types/roomScan';

describe('roomScanService', () => {
  describe('calculateRoomMetrics', () => {
    it('should calculate area correctly', () => {
      const result = calculateRoomMetrics(12, 10, 8);
      expect(result.area).toBe(120);
    });

    it('should calculate volume correctly', () => {
      const result = calculateRoomMetrics(12, 10, 8);
      expect(result.volume).toBe(960);
    });

    it('should handle decimal dimensions', () => {
      const result = calculateRoomMetrics(12.5, 10.5, 8);
      expect(result.area).toBe(131.25);
      expect(result.volume).toBe(1050);
    });

    it('should preserve input dimensions', () => {
      const result = calculateRoomMetrics(15, 12, 9);
      expect(result.length).toBe(15);
      expect(result.width).toBe(12);
      expect(result.height).toBe(9);
    });
  });

  describe('createRoom', () => {
    it('should create a room with correct properties', () => {
      const room = createRoom('Living Room', 'living_room', 14, 12, 8);

      expect(room.name).toBe('Living Room');
      expect(room.type).toBe('living_room');
      expect(room.dimensions.length).toBe(14);
      expect(room.dimensions.width).toBe(12);
      expect(room.dimensions.height).toBe(8);
      expect(room.dimensions.area).toBe(168);
      expect(room.features).toEqual([]);
      expect(room.sourceApp).toBe('manual');
    });

    it('should set sourceApp when specified', () => {
      const room = createRoom('Kitchen', 'kitchen', 10, 10, 8, 'canvas');
      expect(room.sourceApp).toBe('canvas');
    });

    it('should generate unique IDs', () => {
      const room1 = createRoom('Room 1', 'other', 10, 10, 8);
      const room2 = createRoom('Room 2', 'other', 10, 10, 8);
      expect(room1.id).not.toBe(room2.id);
    });
  });

  describe('parseCanvasMeasurements', () => {
    it('should parse basic room with dimensions', () => {
      const input = `Living Room:
12' x 14'`;

      const { rooms } = parseCanvasMeasurements(input);

      expect(rooms.length).toBe(1);
      expect(rooms[0].name).toBe('Living Room');
      expect(rooms[0].dimensions?.length).toBe(12);
      expect(rooms[0].dimensions?.width).toBe(14);
    });

    it('should parse multiple rooms', () => {
      const input = `Living Room:
12' x 14'

Bedroom 1:
10' x 12'`;

      const { rooms } = parseCanvasMeasurements(input);

      expect(rooms.length).toBe(2);
      expect(rooms[0].name).toBe('Living Room');
      expect(rooms[1].name).toBe('Bedroom 1');
    });

    it('should parse room with windows and doors', () => {
      const input = `Living Room:
12' x 14'
2 Windows
1 Door`;

      const { rooms } = parseCanvasMeasurements(input);

      expect(rooms.length).toBe(1);
      expect(rooms[0].features?.length).toBe(2);
      expect(rooms[0].features?.find((f) => f.type === 'window')?.count).toBe(2);
      expect(rooms[0].features?.find((f) => f.type === 'door')?.count).toBe(1);
    });

    it('should parse dimensions without apostrophes', () => {
      const input = `Kitchen:
10 x 12`;

      const { rooms } = parseCanvasMeasurements(input);

      expect(rooms[0].dimensions?.length).toBe(10);
      expect(rooms[0].dimensions?.width).toBe(12);
    });

    it('should parse dimensions with ft notation', () => {
      const input = `Bedroom:
10ft x 12ft`;

      const { rooms } = parseCanvasMeasurements(input);

      expect(rooms[0].dimensions?.length).toBe(10);
      expect(rooms[0].dimensions?.width).toBe(12);
    });

    it('should handle area-only input', () => {
      const input = `Office:
Area: 120 sq ft`;

      const { rooms } = parseCanvasMeasurements(input);

      expect(rooms.length).toBe(1);
      expect(rooms[0].dimensions).toBeDefined();
    });

    it('should guess room type from name', () => {
      const input = `Master Bedroom:
12' x 14'

Main Bathroom:
8' x 10'

Kitchen:
10' x 12'`;

      const { rooms } = parseCanvasMeasurements(input);

      expect(rooms[0].type).toBe('bedroom');
      expect(rooms[1].type).toBe('bathroom');
      expect(rooms[2].type).toBe('kitchen');
    });

    it('should return empty array for invalid input', () => {
      const { rooms } = parseCanvasMeasurements('random text without rooms');
      expect(rooms.length).toBe(0);
    });

    it('should calculate total area', () => {
      const input = `Room 1:
10' x 10'

Room 2:
10' x 10'`;

      const { totalArea } = parseCanvasMeasurements(input);

      expect(totalArea).toBe(200);
    });
  });

  describe('generateScopeFromRooms', () => {
    it('should generate flooring scope for each room', () => {
      const rooms: ScannedRoom[] = [
        {
          id: '1',
          name: 'Living Room',
          type: 'living_room',
          dimensions: { length: 12, width: 10, height: 8, area: 120, volume: 960 },
          features: [],
          scanDate: new Date(),
          sourceApp: 'manual',
        },
      ];

      const scopeItems = generateScopeFromRooms(rooms);

      const flooringItem = scopeItems.find(
        (s) => s.category === 'Flooring' && s.item.includes('Living Room')
      );
      expect(flooringItem).toBeDefined();
      expect(flooringItem?.quantity).toBe(120);
      expect(flooringItem?.unit).toBe('sq ft');
    });

    it('should generate wall paint scope', () => {
      const rooms: ScannedRoom[] = [
        {
          id: '1',
          name: 'Bedroom',
          type: 'bedroom',
          dimensions: { length: 12, width: 10, height: 8, area: 120, volume: 960 },
          features: [],
          scanDate: new Date(),
          sourceApp: 'manual',
        },
      ];

      const scopeItems = generateScopeFromRooms(rooms);

      const paintItem = scopeItems.find(
        (s) => s.category === 'Paint' && s.item.includes('Wall paint')
      );
      expect(paintItem).toBeDefined();
      // Wall area = 2 * (12 + 10) * 8 = 352 sq ft
      expect(paintItem?.quantity).toBe(352);
    });

    it('should generate baseboard scope', () => {
      const rooms: ScannedRoom[] = [
        {
          id: '1',
          name: 'Office',
          type: 'office',
          dimensions: { length: 10, width: 10, height: 8, area: 100, volume: 800 },
          features: [],
          scanDate: new Date(),
          sourceApp: 'manual',
        },
      ];

      const scopeItems = generateScopeFromRooms(rooms);

      const baseboardItem = scopeItems.find((s) => s.category === 'Trim');
      expect(baseboardItem).toBeDefined();
      // Perimeter = 2 * (10 + 10) = 40 linear ft
      expect(baseboardItem?.quantity).toBe(40);
      expect(baseboardItem?.unit).toBe('linear ft');
    });

    it('should generate bathroom-specific items', () => {
      const rooms: ScannedRoom[] = [
        {
          id: '1',
          name: 'Bathroom',
          type: 'bathroom',
          dimensions: { length: 8, width: 6, height: 8, area: 48, volume: 384 },
          features: [],
          scanDate: new Date(),
          sourceApp: 'manual',
        },
      ];

      const scopeItems = generateScopeFromRooms(rooms);

      expect(scopeItems.some((s) => s.item.includes('Toilet'))).toBe(true);
      expect(scopeItems.some((s) => s.item.includes('Vanity'))).toBe(true);
      expect(scopeItems.some((s) => s.item.includes('Shower/Tub'))).toBe(true);
    });

    it('should generate kitchen-specific items', () => {
      const rooms: ScannedRoom[] = [
        {
          id: '1',
          name: 'Kitchen',
          type: 'kitchen',
          dimensions: { length: 12, width: 10, height: 8, area: 120, volume: 960 },
          features: [],
          scanDate: new Date(),
          sourceApp: 'manual',
        },
      ];

      const scopeItems = generateScopeFromRooms(rooms);

      expect(scopeItems.some((s) => s.category === 'Cabinets')).toBe(true);
      expect(scopeItems.some((s) => s.category === 'Countertops')).toBe(true);
    });

    it('should generate window scope from features', () => {
      const rooms: ScannedRoom[] = [
        {
          id: '1',
          name: 'Living Room',
          type: 'living_room',
          dimensions: { length: 12, width: 10, height: 8, area: 120, volume: 960 },
          features: [{ type: 'window', count: 3 }],
          scanDate: new Date(),
          sourceApp: 'manual',
        },
      ];

      const scopeItems = generateScopeFromRooms(rooms);

      const windowItem = scopeItems.find((s) => s.category === 'Windows');
      expect(windowItem).toBeDefined();
      expect(windowItem?.quantity).toBe(3);
    });

    it('should handle multiple rooms', () => {
      const rooms: ScannedRoom[] = [
        {
          id: '1',
          name: 'Living Room',
          type: 'living_room',
          dimensions: { length: 14, width: 12, height: 8, area: 168, volume: 1344 },
          features: [],
          scanDate: new Date(),
          sourceApp: 'manual',
        },
        {
          id: '2',
          name: 'Bedroom',
          type: 'bedroom',
          dimensions: { length: 12, width: 10, height: 8, area: 120, volume: 960 },
          features: [],
          scanDate: new Date(),
          sourceApp: 'manual',
        },
      ];

      const scopeItems = generateScopeFromRooms(rooms);

      const flooringItems = scopeItems.filter((s) => s.category === 'Flooring');
      expect(flooringItems.length).toBe(2);

      const totalFlooring = flooringItems.reduce((sum, s) => sum + s.quantity, 0);
      expect(totalFlooring).toBe(288); // 168 + 120
    });
  });

  describe('getCanvasAppLink', () => {
    it('should return iOS App Store link', () => {
      const { ios } = getCanvasAppLink();
      expect(ios).toContain('apps.apple.com');
      expect(ios).toContain('canvas');
    });

    it('should return instructions array', () => {
      const { instructions } = getCanvasAppLink();
      expect(Array.isArray(instructions)).toBe(true);
      expect(instructions.length).toBeGreaterThan(0);
    });

    it('should mention Canvas app in instructions', () => {
      const { instructions } = getCanvasAppLink();
      const hasCanvasMention = instructions.some((i) =>
        i.toLowerCase().includes('canvas')
      );
      expect(hasCanvasMention).toBe(true);
    });
  });
});
