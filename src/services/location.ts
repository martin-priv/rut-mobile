import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as turf from '@turf/turf';
import { Cell, WorkSettings, TrackingStatus } from '../types';
import { checkBoundary, calculateCoverage } from './coverage';
import {
  initAudio,
  playBoundaryTick,
  playOutsideWarning,
  playBackInsideSound,
  playCompletionChime,
  speakCue,
} from './audio';

export const LOCATION_TASK_NAME = 'RUT_BACKGROUND_TRACKER';

// Global session state
let activeCell: Cell | null = null;
let recordedPath: [number, number][] = [];
let currentSettings: WorkSettings = {
  sweepWidthMeters: 1.5,
  completionThreshold: 85,
  boundaryWarningDistance: 1.2,
  voiceGuidance: false, // Pure audio cues by default
  audioPings: true,
  serverUrl: 'https://rut.vercel.app',
};

let wasOutside = false;
let completedAnnounced = false;
let lastAnnouncedMilestone = 0;
let lastBoundaryTickTime = 0;
let lastOutsideAlertTime = 0;
let foregroundSubscription: Location.LocationSubscription | null = null;
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
  lastBoundaryTickTime = 0;
  lastOutsideAlertTime = 0;
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
  const now = Date.now();

  // 1. Boundary / Geofence audio logic
  if (!isInside) {
    if (!wasOutside) {
      wasOutside = true;
      lastOutsideAlertTime = now;
      if (currentSettings.audioPings) await playOutsideWarning();
      if (currentSettings.voiceGuidance) speakCue('Du klev utanför rutan', true);
    } else {
      // Periodic warning sound while remaining outside (every 1.8s)
      if (now - lastOutsideAlertTime >= 1800) {
        lastOutsideAlertTime = now;
        if (currentSettings.audioPings) await playOutsideWarning();
      }
    }
  } else {
    if (wasOutside) {
      wasOutside = false;
      // Play distinct "back inside" confirmation sound
      if (currentSettings.audioPings) await playBackInsideSound();
      if (currentSettings.voiceGuidance) speakCue('Tillbaka i rutan');
    }

    // Near boundary warning: parking-sensor style
    // The closer to the boundary, the faster the ticks (from 1200ms down to 220ms)
    if (distanceToBoundary <= currentSettings.boundaryWarningDistance) {
      const distRatio = Math.max(0, Math.min(1, distanceToBoundary / currentSettings.boundaryWarningDistance));
      const tickIntervalMs = Math.round(220 + distRatio * 900);

      if (now - lastBoundaryTickTime >= tickIntervalMs) {
        lastBoundaryTickTime = now;
        if (currentSettings.audioPings) {
          await playBoundaryTick();
        }
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
    // Announce 50% milestone if voice enabled
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
 * Starts continuous tracking.
 * Configures 400ms raw location stream without distance suppression
 * to eliminate lag.
 */
export async function startBackgroundTracking(): Promise<boolean> {
  await initAudio();

  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }

  try {
    // 1. Fast foreground listener for immediate sub-second response
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 400,
        distanceInterval: 0, // No distance suppression
      },
      loc => {
        processNewLocation(
          loc.coords.latitude,
          loc.coords.longitude,
          loc.coords.heading ?? null
        );
      }
    );

    // 2. Background service for when screen is off in pocket
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 400,
      distanceInterval: 0, // Stream fixes without waiting for 1m move
      deferredUpdatesInterval: 400,
      deferredUpdatesDistance: 0,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Rut: Röjningspass igång 🌲',
        notificationBody: 'Telefonen spårar i fickan och guidar med ljud.',
        notificationColor: '#28a745',
      },
    });

    if (currentSettings.voiceGuidance) {
      speakCue('Röjningspass startat.', true);
    }
    return true;
  } catch (err) {
    console.error('Failed to start location tracking:', err);
    return false;
  }
}

/**
 * Stops tracking.
 */
export async function stopBackgroundTracking(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  if (currentSettings.voiceGuidance) {
    speakCue('Röjningspass pausat');
  }
}
