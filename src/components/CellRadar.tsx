import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polygon, Polyline, Circle, Line, Rect, G } from 'react-native-svg';
import * as turf from '@turf/turf';
import { Cell } from '../types';

interface CellRadarProps {
  cell: Cell | null;
  currentLocation: [number, number] | null; // [latitude, longitude]
  heading: number | null; // in degrees (0-360)
  recordedPath?: [number, number][]; // [[lat, lon], ...]
  isOutside?: boolean;
  distanceToBoundary?: number;
  boundaryWarningDistance?: number;
  sizeMeters?: number;
}

export const CellRadar: React.FC<CellRadarProps> = ({
  cell,
  currentLocation,
  heading,
  recordedPath = [],
  isOutside = false,
  distanceToBoundary = 0,
  boundaryWarningDistance = 1.2,
  sizeMeters,
}) => {
  const containerWidth = Dimensions.get('window').width - 48; // padding accounted
  const height = 250;
  const width = Math.max(260, containerWidth);

  if (!cell || !cell.geometry || !cell.geometry.coordinates) {
    return null;
  }

  const rawCoords: [number, number][] = cell.geometry.coordinates[0] || [];
  if (rawCoords.length === 0) return null;

  // 1. Calculate cell centroid for metric projection
  const centerFeature = turf.center(cell.geometry as any);
  const [midLon, midLat] = centerFeature.geometry.coordinates;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  // 2. Project cell polygon corners to metric (x, y) meters from center
  const polyMetric = rawCoords.map(([lon, lat]) => ({
    x: (lon - midLon) * 111320 * cosLat,
    y: (lat - midLat) * 111320,
  }));

  // 3. Project current user position if available
  let userMetric: { x: number; y: number } | null = null;
  if (currentLocation) {
    userMetric = {
      x: (currentLocation[1] - midLon) * 111320 * cosLat,
      y: (currentLocation[0] - midLat) * 111320,
    };
  }

  // 4. Project recorded trail
  // Downsample to max 120 points for buttery smooth rendering
  const stride = Math.max(1, Math.floor(recordedPath.length / 100));
  const trailMetric = recordedPath
    .filter((_, idx) => idx % stride === 0 || idx === recordedPath.length - 1)
    .map(([lat, lon]) => ({
      x: (lon - midLon) * 111320 * cosLat,
      y: (lat - midLat) * 111320,
    }));

  // 5. Compute dynamic bounding box to keep both cell AND user dot visible
  let minX = Math.min(...polyMetric.map(p => p.x));
  let maxX = Math.max(...polyMetric.map(p => p.x));
  let minY = Math.min(...polyMetric.map(p => p.y));
  let maxY = Math.max(...polyMetric.map(p => p.y));

  if (userMetric) {
    minX = Math.min(minX, userMetric.x);
    maxX = Math.max(maxX, userMetric.x);
    minY = Math.min(minY, userMetric.y);
    maxY = Math.max(maxY, userMetric.y);
  }

  // Add 25% padding around bounding box
  const spanX = Math.max(6, (maxX - minX) * 1.3);
  const spanY = Math.max(6, (maxY - minY) * 1.3);

  const scale = Math.min((width - 40) / spanX, (height - 40) / spanY);
  const cx = width / 2;
  const cy = height / 2;
  const midBoxX = (minX + maxX) / 2;
  const midBoxY = (minY + maxY) / 2;

  const toSvg = (xM: number, yM: number) => ({
    x: cx + (xM - midBoxX) * scale,
    y: cy - (yM - midBoxY) * scale, // invert Y for screen coords
  });

  const svgPolyPoints = polyMetric
    .map(p => {
      const sp = toSvg(p.x, p.y);
      return `${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
    })
    .join(' ');

  const svgTrailPoints = trailMetric
    .map(p => {
      const sp = toSvg(p.x, p.y);
      return `${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
    })
    .join(' ');

  const userSvg = userMetric ? toSvg(userMetric.x, userMetric.y) : null;

  // Heading pointer coordinates
  let headingTriangle = '';
  if (userSvg && heading != null) {
    const rad = (heading * Math.PI) / 180;
    const tipX = userSvg.x + 14 * Math.sin(rad);
    const tipY = userSvg.y - 14 * Math.cos(rad);
    const b1X = userSvg.x + 6 * Math.sin(rad + 2.5);
    const b1Y = userSvg.y - 6 * Math.cos(rad + 2.5);
    const b2X = userSvg.x + 6 * Math.sin(rad - 2.5);
    const b2Y = userSvg.y - 6 * Math.cos(rad - 2.5);
    headingTriangle = `${tipX.toFixed(1)},${tipY.toFixed(1)} ${b1X.toFixed(1)},${b1Y.toFixed(1)} ${b2X.toFixed(1)},${b2Y.toFixed(1)}`;
  }

  // Nearest border line point for guide line if outside
  let nearestSvg: { x: number; y: number } | null = null;
  if (isOutside && currentLocation) {
    const boundaryLine = turf.polygonToLine(cell.geometry as any);
    if (boundaryLine) {
      const targetLine = boundaryLine.type === 'FeatureCollection' ? (boundaryLine as any).features[0] : boundaryLine;
      const userPt = turf.point([currentLocation[1], currentLocation[0]]);
      const near = turf.nearestPointOnLine(targetLine, userPt);
      const [nLon, nLat] = near.geometry.coordinates;
      const nx = (nLon - midLon) * 111320 * cosLat;
      const ny = (nLat - midLat) * 111320;
      nearestSvg = toSvg(nx, ny);
    }
  }

  // Determine approx cell side length
  const approxSide = sizeMeters || Math.round(maxX - minX) || 10;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle}>🗺️ FÄLTRADAR ({approxSide}×{approxSide} m)</Text>
        <Text style={[styles.statusTag, isOutside ? styles.tagOutside : styles.tagInside]}>
          {isOutside ? `⚠️ UTANFÖR (${distanceToBoundary}m)` : `✅ INNE (${distanceToBoundary}m)`}
        </Text>
      </View>

      <View style={[styles.svgWrapper, { width, height }]}>
        <Svg width={width} height={height}>
          {/* Subtle grid background */}
          <Rect x="0" y="0" width={width} height={height} fill="#0d111d" rx="12" />

          {/* Crosshair grid lines at cell center */}
          <Line
            x1={toSvg(0, -100).x}
            y1={0}
            x2={toSvg(0, -100).x}
            y2={height}
            stroke="#1c253b"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <Line
            x1={0}
            y1={toSvg(-100, 0).y}
            x2={width}
            y2={toSvg(-100, 0).y}
            stroke="#1c253b"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Cell Polygon (The active box) */}
          <Polygon
            points={svgPolyPoints}
            fill={isOutside ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.12)'}
            stroke={isOutside ? '#ef4444' : '#22c55e'}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* User Trail / Path */}
          {svgTrailPoints.length > 0 && (
            <Polyline
              points={svgTrailPoints}
              stroke="#0284c7"
              strokeWidth="2.5"
              strokeOpacity={0.65}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}

          {/* Guide dashed line back into the box when outside */}
          {isOutside && userSvg && nearestSvg && (
            <Line
              x1={userSvg.x}
              y1={userSvg.y}
              x2={nearestSvg.x}
              y2={nearestSvg.y}
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}

          {/* User Position Dot */}
          {userSvg && (
            <G>
              {/* Pulsing halo */}
              <Circle
                cx={userSvg.x}
                cy={userSvg.y}
                r="11"
                fill={isOutside ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)'}
              />
              {/* Solid dot */}
              <Circle
                cx={userSvg.x}
                cy={userSvg.y}
                r="6"
                fill={isOutside ? '#ef4444' : '#22c55e'}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              {/* Compass heading pointer */}
              {headingTriangle.length > 0 && (
                <Polygon points={headingTriangle} fill="#38bdf8" />
              )}
            </G>
          )}
        </Svg>

        {/* North compass indicator in top-left */}
        <View style={styles.compassBadge}>
          <Text style={styles.compassText}>N ▲</Text>
        </View>

        {/* Footnote / scale in bottom-left */}
        <View style={styles.scaleBadge}>
          <Text style={styles.scaleText}>Grön ruta = din zon | Blå linje = spår</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#121624',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#242f49',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTag: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagInside: {
    backgroundColor: '#143823',
    color: '#4ade80',
  },
  tagOutside: {
    backgroundColor: '#451616',
    color: '#f87171',
  },
  svgWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
  },
  compassBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  compassText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
  },
  scaleBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scaleText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },
});
