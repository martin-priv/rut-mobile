import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as turf from '@turf/turf';
import { Cell, WorkSettings, TrackingStatus } from '../types';
import { checkBoundary, calculateCoverage } from './coverage';
import {
  initAudio,
  playBoundaryTick,
  playOutsideWarning,
  playCompletionChime,
  speakCue,
} from './audio';

export const LOCATION_TASK_NAME = 'RUT_BACKGROUND_TRACKER';

// Global session state
let activeCell: Cell | null = null;
let recordedPath: [number, number][] = [];
let currentSettings: WorkSettings = {
  sweepWidthMeters: 2.5,
  completionThreshold: 85,
  boundaryWarningDistance: 4.0,
  voiceGuidance: true,
  audioPings: true,
  serverUrl: 'https://rut.vercel.app',
};

let wasOutside = false;
let completedAnnounced = false;
let lastAnnouncedMilestone = 0;
let onStatusChangeCallback: ((status: TrackingStatus) => void) | null = null;

export function setStatusListener(cb: (status: TrackingStatus) => void) {
  onStatusChangeCallback = cb;
}

export function updateSettings(settings: Partial<WorkSettings>) {
  currentSettings = { ...currentSettings, ...settings };
}

export function setActiveCell(cell: Cell | null) {
  activeCell = cell;
  recordedPath = [];
  wasOutside = false;
  completedAnnounced = false;
  lastAnnouncedMilestone = 0;
}

export function getRecordedPath(): [number, number][] {
  return [...recordedPath];
}

/**
 * Manually simulate a step by an offset in meters from cell center.
 * Useful for indoor testing where GPS cannot move.
 */
export async function simulateOffsetStep(metersNorth: number) {
  if (!activeCell || !activeCell.geometry) return;
  const center = turf.center(activeCell.geometry as any);
  const pt = turf.destination(center, metersNorth / 1000, 0, { units: 'kilometers' });
  const [lon, lat] = pt.geometry.coordinates;
  await processNewLocation(lat, lon, 0);
}

/**
 * Core processing function for each new GPS coordinate.
 * Runs in both foreground and background with screen locked!
 */
export async function processNewLocation(lat: number, lon: number, heading: number | null) {
  recordedPath.push([lat, lon]);

  if (!activeCell || !activeCell.geometry) {
    notifyStatus(false, 0, 0, false, heading);
    return;
  }

  const { isInside, distanceToBoundary } = checkBoundary(activeCell.geometry, [lat, lon]);

  // 1. Boundary / Geofence audio logic
  if (!isInside) {
    if (!wasOutside) {
      wasOutside = true;
      if (currentSettings.audioPings) await playOutsideWarning();
      if (currentSettings.voiceGuidance) speakCue('Du klev utanför rutan', true);
    }
  } else {
    if (wasOutside) {
      wasOutside = false;
      if (currentSettings.voiceGuidance) speakCue('Tillbaka i rutan');
    }

    // Near boundary warning (proximity tick)
    if (distanceToBoundary <= currentSettings.boundaryWarningDistance) {
      if (currentSettings.audioPings) {
        await playBoundaryTick();
      }
    }
  }

  // 2. Coverage calculation
  const coverage = calculateCoverage(
    activeCell.geometry,
    recordedPath,
    currentSettings.sweepWidthMeters
  );

  // 3. Completion and milestone spoken feedback
  if (coverage >= currentSettings.completionThreshold && !completedAnnounced) {
    completedAnnounced = true;
    if (currentSettings.audioPings) await playCompletionChime();
    if (currentSettings.voiceGuidance) {
      speakCue('Rutan är klar! Bra jobbat.', true);
    }
  } else if (currentSettings.voiceGuidance) {
    // Announce 50% milestone
    if (coverage >= 50 && lastAnnouncedMilestone < 50) {
      lastAnnouncedMilestone = 50;
      speakCue('50 procent av rutan klar');
    }
  }

  notifyStatus(true, coverage, distanceToBoundary, !isInside, heading);
}

function notifyStatus(
  isActive: boolean,
  coverage: number,
  distance: number,
  outside: boolean,
  heading: number | null
) {
  if (onStatusChangeCallback) {
    onStatusChangeCallback({
      isActive,
      currentCell: activeCell,
      coveragePercent: coverage,
      distanceToBoundary: distance,
      isOutside: outside,
      pointsRecorded: recordedPath.length,
      heading,
    });
  }
}

// Register background task with Expo TaskManager
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const latest = locations[locations.length - 1];
      await processNewLocation(
        latest.coords.latitude,
        latest.coords.longitude,
        latest.coords.heading ?? null
      );
    }
  }
});

/**
 * Requests location permissions for foreground and background.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  return bgStatus === 'granted';
}

/**
 * Starts continuous background tracking.
 * Configures Android Foreground Service with sticky notification.
 */
export async function startBackgroundTracking(): Promise<boolean> {
  await initAudio();

  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000, // 1 second
      distanceInterval: 1, // 1 meter
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Rut: Röjningspass igång 🌲',
        notificationBody: 'Telefonen spårar i fickan och guidar med ljud.',
        notificationColor: '#28a745',
      },
    });

    if (currentSettings.voiceGuidance) {
      speakCue('Röjningspass startat. Stoppa mobilen i fickan.', true);
    }
    return true;
  } catch (err) {
    console.error('Failed to start background location:', err);
    return false;
  }
}

/**
 * Stops background tracking.
 */
export async function stopBackgroundTracking(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  if (currentSettings.voiceGuidance) {
    speakCue('Röjningspass pausat');
  }
}
