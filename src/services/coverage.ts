import * as turf from '@turf/turf';
import { Cell } from '../types';

/**
 * Checks if a coordinate is inside the cell and returns distance to the perimeter.
 * coordinates are [latitude, longitude].
 */
export function checkBoundary(
  cellPolygon: any,
  coord: [number, number]
): { isInside: boolean; distanceToBoundary: number } {
  const pt = turf.point([coord[1], coord[0]]); // [lon, lat]

  const isInside = turf.booleanPointInPolygon(pt, cellPolygon);

  // Convert polygon boundary to line for distance calculation
  const boundaryLine = turf.polygonToLine(cellPolygon);
  let distanceToBoundary = 0;

  if (boundaryLine) {
    // If it's a FeatureCollection (e.g. MultiLineString), take the first line
    const targetLine = boundaryLine.type === 'FeatureCollection'
      ? (boundaryLine as any).features[0]
      : boundaryLine;

    distanceToBoundary = turf.pointToLineDistance(pt, targetLine as any, { units: 'meters' });
  }

  return {
    isInside,
    distanceToBoundary: Math.round(distanceToBoundary * 10) / 10,
  };
}

/**
 * Calculates the percentage of the cell area covered by the user's path buffer.
 * path is an array of [latitude, longitude].
 */
export function calculateCoverage(
  cellPolygon: any,
  path: [number, number][],
  sweepWidthMeters: number = 2.5
): number {
  if (path.length < 2) return 0;

  try {
    const totalArea = turf.area(cellPolygon);
    if (totalArea <= 0) return 0;

    // Convert points to [lon, lat]
    const coords = path.map(p => [p[1], p[0]]);
    const line = turf.lineString(coords);

    // Buffer the path by half the sweep width on each side
    const sweepBuffer = turf.buffer(line, sweepWidthMeters / 2, { units: 'meters' });
    if (!sweepBuffer) return 0;

    // Calculate overlap with cell
    const overlap = turf.intersect(turf.featureCollection([cellPolygon, sweepBuffer]));
    if (!overlap) return 0;

    const coveredArea = turf.area(overlap);
    const percent = Math.min(100, Math.round((coveredArea / totalArea) * 100));

    return percent;
  } catch (err) {
    // If geometry self-intersection occurs in buffer, fallback safely
    return 0;
  }
}

/**
 * Creates a local test square cell centered near the user's current GPS position.
 * Allows instant testing anywhere without needing a remote mission.
 */
export function createLocalTestCell(
  lat: number,
  lon: number,
  sizeMeters: number = 4
): Cell {
  const center = turf.point([lon, lat]);
  // Offset by half size to place user comfortably inside
  const half = (sizeMeters / 2) / 1000; // in km

  const minLon = turf.destination(center, half, -90, { units: 'kilometers' }).geometry.coordinates[0];
  const maxLon = turf.destination(center, half, 90, { units: 'kilometers' }).geometry.coordinates[0];
  const minLat = turf.destination(center, half, 180, { units: 'kilometers' }).geometry.coordinates[1];
  const maxLat = turf.destination(center, half, 0, { units: 'kilometers' }).geometry.coordinates[1];

  const bbox: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];
  const poly = turf.bboxPolygon(bbox);

  return {
    id: `local-test:${Date.now()}`,
    mission_hash: 'local-test',
    geometry: poly.geometry,
    status: 'assigned',
    assigned_to: 'Mig',
    assigned_user_id: 'local-user',
  };
}

/**
 * Finds the closest open or assigned cell to the user's current position.
 */
export function findNearestCell(cells: Cell[], coord: [number, number]): Cell | null {
  if (!cells || cells.length === 0) return null;

  const pt = turf.point([coord[1], coord[0]]);
  let closestCell: Cell | null = null;
  let minDistance = Infinity;

  for (const cell of cells) {
    if (cell.status === 'completed') continue;
    const center = turf.center(cell.geometry);
    const dist = turf.distance(pt, center, { units: 'meters' });
    if (dist < minDistance) {
      minDistance = dist;
      closestCell = cell;
    }
  }

  return closestCell || cells[0] || null;
}
