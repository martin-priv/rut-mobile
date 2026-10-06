export interface Cell {
  id: string;
  mission_hash: string;
  geometry: any; // GeoJSON Polygon
  status: 'open' | 'assigned' | 'completed';
  assigned_to?: string | null;
  assigned_user_id?: string | null;
}

export interface Mission {
  hash: string;
  name: string;
  boundary: any; // GeoJSON Polygon
  grid_size: number; // in meters
  created_at: string;
}

export interface WorkSettings {
  sweepWidthMeters: number; // e.g. 2.5 or 3.0 meters
  completionThreshold: number; // e.g. 85 %
  boundaryWarningDistance: number; // e.g. 4.0 meters
  voiceGuidance: boolean;
  audioPings: boolean;
  serverUrl: string; // default https://rut.vercel.app
}

export interface TrackingStatus {
  isActive: boolean;
  currentCell: Cell | null;
  coveragePercent: number;
  distanceToBoundary: number;
  isOutside: boolean;
  pointsRecorded: number;
  heading: number | null;
  pan: number; // -1.0 (Full Left) to +1.0 (Full Right)
  currentLocation: [number, number] | null; // [latitude, longitude]
  recordedPath: [number, number][]; // array of [lat, lon]
}
