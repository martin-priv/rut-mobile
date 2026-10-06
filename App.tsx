import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Cell, WorkSettings, TrackingStatus } from './src/types';
import { createLocalTestCell } from './src/services/coverage';
import {
  initAudio,
  speakCue,
  playBoundaryTick,
  playOutsideWarning,
  playBackInsideSound,
  playCompletionChime,
} from './src/services/audio';
import {
  requestLocationPermissions,
  startBackgroundTracking,
  stopBackgroundTracking,
  setActiveCell,
  setStatusListener,
  updateSettings,
  simulateOffsetStep,
} from './src/services/location';
import { fetchMission, updateCellStatus } from './src/services/api';

export default function App() {
  const [isTracking, setIsTracking] = useState(false);
  const [missionHash, setMissionHash] = useState('');
  const [userName, setUserName] = useState('Martin');
  const [userId, setUserId] = useState('user-' + Math.random().toString(36).substring(2, 9));
  const [currentCell, setCurrentCell] = useState<Cell | null>(null);
  const [loading, setLoading] = useState(false);

  // Settings
  const [testSize, setTestSize] = useState<number>(4); // default 4x4m for indoor testing
  const [sweepWidth, setSweepWidth] = useState<number>(1.5); // meters
  const [voiceEnabled, setVoiceEnabled] = useState(false); // Pure audio by default
  const [audioPingsEnabled, setAudioPingsEnabled] = useState(true);

  // Live status
  const [status, setStatus] = useState<TrackingStatus>({
    isActive: false,
    currentCell: null,
    coveragePercent: 0,
    distanceToBoundary: 0,
    isOutside: false,
    pointsRecorded: 0,
    heading: null,
  });

  useEffect(() => {
    initAudio();
    setStatusListener(setStatus);

    // Load saved settings
    AsyncStorage.getItem('rut_user_name').then(val => val && setUserName(val));
    AsyncStorage.getItem('rut_user_id').then(val => val && setUserId(val));
  }, []);

  const handleStartQuickTest = async () => {
    setLoading(true);
    const hasPerms = await requestLocationPermissions();
    if (!hasPerms) {
      setLoading(false);
      Alert.alert(
        'Platstillstånd krävs',
        'Tillåt alltid / i bakgrunden så att Rut kan spåra din röjning med skärmen släckt.'
      );
      return;
    }

    try {
      let pos;
      try {
        pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
      } catch (err) {
        pos = await Location.getLastKnownPositionAsync();
      }

      if (!pos) {
        throw new Error('Kunde inte fastställa GPS-position inomhus. Prova nära ett fönster.');
      }

      // Create a test cell around user with selected size (default 4x4m)
      const testCell = createLocalTestCell(pos.coords.latitude, pos.coords.longitude, testSize);
      setCurrentCell(testCell);
      setActiveCell(testCell);

      // Warning distance: for 4x4m cell, edge is 2.0m away, so warn at 1.2m.
      const warningDist = testSize <= 6 ? 1.2 : testSize <= 15 ? 2.5 : 4.0;

      updateSettings({
        sweepWidthMeters: sweepWidth,
        boundaryWarningDistance: warningDist,
        voiceGuidance: voiceEnabled,
        audioPings: audioPingsEnabled,
      });

      const started = await startBackgroundTracking();
      if (started) {
        setIsTracking(true);
      }
    } catch (e: any) {
      Alert.alert('Fel', 'Kunde inte starta provpass: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartMission = async () => {
    if (!missionHash.trim()) {
      Alert.alert('Ange uppdragskod', 'Skriv in uppdragets 8-teckens hash.');
      return;
    }

    setLoading(true);
    const hasPerms = await requestLocationPermissions();
    if (!hasPerms) {
      setLoading(false);
      Alert.alert('Platstillstånd krävs', 'Bakgrundsplats behövs för ljudguidning.');
      return;
    }

    try {
      const data = await fetchMission('https://rut.vercel.app', missionHash.trim());
      if (!data.cells || data.cells.length === 0) {
        throw new Error('Inga rutor hittades i uppdraget.');
      }

      // Pick first open cell or cell assigned to user
      const cellToWork = data.cells.find(c => c.status !== 'completed') || data.cells[0];
      setCurrentCell(cellToWork);
      setActiveCell(cellToWork);

      updateSettings({
        sweepWidthMeters: sweepWidth,
        voiceGuidance: voiceEnabled,
        audioPings: audioPingsEnabled,
      });

      const started = await startBackgroundTracking();
      if (started) {
        setIsTracking(true);
      }
    } catch (err: any) {
      Alert.alert('Fel', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    await stopBackgroundTracking();
    setIsTracking(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#12141c" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>RUT FÄLT 🌲</Text>
          <Text style={styles.subtitle}>Fick- och ljudguide för skogsarbete</Text>
        </View>

        {isTracking ? (
          /* ACTIVE SESSION VIEW */
          <View style={styles.activeCard}>
            <View style={styles.badgeRow}>
              <View style={[styles.liveDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.liveText}>RÖJNINGSPASS PÅGÅR (FICKLÄGE)</Text>
            </View>

            {/* Coverage Meter */}
            <View style={styles.metricContainer}>
              <Text style={styles.metricLabel}>TÄCKNING AV RUTAN</Text>
              <Text style={styles.metricValue}>{status.coveragePercent}%</Text>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, status.coveragePercent)}%`,
                      backgroundColor: status.coveragePercent >= 85 ? '#22c55e' : '#38bdf8',
                    },
                  ]}
                />
              </View>
            </View>

            {/* Geofence / Boundary Status */}
            <View
              style={[
                styles.statusBanner,
                status.isOutside ? styles.bannerOutside : styles.bannerInside,
              ]}
            >
              <Text style={styles.bannerText}>
                {status.isOutside
                  ? `⚠️ UTANFÖR RUTAN (${status.distanceToBoundary} m utanför)`
                  : `✅ Inom rutan (${status.distanceToBoundary} m till gräns)`}
              </Text>
            </View>

            {/* Indoor Simulation Row (Step simulator when testing inside) */}
            <Text style={styles.subSectionTitle}>🧪 Simulera steg ({testSize}×{testSize} m):</Text>
            <View style={styles.simRow}>
              <TouchableOpacity
                style={styles.simBtn}
                onPress={() => simulateOffsetStep(0)}
              >
                <Text style={styles.simBtnText}>🎯 Mitten (0 m)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.simBtn}
                onPress={() => simulateOffsetStep(testSize <= 6 ? 1.4 : testSize * 0.38)}
              >
                <Text style={styles.simBtnText}>🚶 Gräns ({testSize <= 6 ? '1.4 m' : Math.round(testSize * 0.38) + ' m'})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.simBtn}
                onPress={() => simulateOffsetStep(testSize <= 6 ? 2.5 : testSize * 0.6)}
              >
                <Text style={styles.simBtnText}>🏃 Utanför ({testSize <= 6 ? '2.5 m' : Math.round(testSize * 0.6) + ' m'})</Text>
              </TouchableOpacity>
            </View>

            {/* Audio Feedback Test Buttons */}
            <Text style={styles.subSectionTitle}>🔊 Ljudtest (hörlurar):</Text>
            <View style={styles.testAudioRow}>
              <TouchableOpacity
                style={styles.audioTestBtn}
                onPress={() => playBoundaryTick()}
              >
                <Text style={styles.audioTestBtnText}>🔔 Kant-pip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.audioTestBtn}
                onPress={() => playOutsideWarning()}
              >
                <Text style={styles.audioTestBtnText}>⚠️ Utanför</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.audioTestBtn}
                onPress={() => playBackInsideSound()}
              >
                <Text style={styles.audioTestBtnText}>✅ Inne igen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.audioTestBtn}
                onPress={() => playCompletionChime()}
              >
                <Text style={styles.audioTestBtnText}>🎉 Klart</Text>
              </TouchableOpacity>
            </View>

            {/* Instruction Tip */}
            <View style={styles.pocketTip}>
              <Text style={styles.pocketTipText}>
                💡 Stoppa telefonen i fickan med skärmen släckt. Ljudsignalerna guidar dig:
                tyst i rutan, tätare pip nära gränsen, varningslarm utanför och bekräftelse när du kliver in.
              </Text>
            </View>

            {/* Stop / Pause Button */}
            <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
              <Text style={styles.stopButtonText}>AVSLUTA / PAUSA PASS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* SETUP / LAUNCH VIEW */
          <View>
            {/* Quick Test Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🚀 Snabbtest ({testSize}×{testSize} m)</Text>
              <Text style={styles.cardDesc}>
                Skapar automatiskt en provruta centrerad där du står.
                Välj 4×4 m för att testa gränser och ljud direkt i vardagsrummet!
              </Text>

              {/* Test Size Selector */}
              <Text style={styles.settingLabel}>Rutans storlek:</Text>
              <View style={styles.pillRow}>
                {[
                  { size: 4, label: '4×4 m (Inne)' },
                  { size: 10, label: '10×10 m (Gård)' },
                  { size: 40, label: '40×40 m (Skog)' },
                ].map(item => (
                  <TouchableOpacity
                    key={item.size}
                    style={[styles.pill, testSize === item.size && styles.pillActive]}
                    onPress={() => setTestSize(item.size)}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        testSize === item.size && styles.pillTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleStartQuickTest}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    STARTA {testSize}×{testSize} M PROVPASS HÄR
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Remote Mission Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🗺️ Anslut till webbuppdrag</Text>
              <Text style={styles.cardDesc}>
                Ange 8-teckens hash från rut.vercel.app (t.ex. aB3xKp2q):
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Uppdragskod (t.ex. aB3xKp2q)"
                placeholderTextColor="#6b7280"
                value={missionHash}
                onChangeText={setMissionHash}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleStartMission}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>HÄMTA & STARTA UPPDRAG</Text>
              </TouchableOpacity>
            </View>

            {/* Settings Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>⚙️ Arbetsinställningar</Text>

              {/* Sweep Width Selector */}
              <Text style={styles.settingLabel}>Röjsågens arbetsbredd (pensel):</Text>
              <View style={styles.pillRow}>
                {[1.0, 1.5, 2.5, 3.5].map(w => (
                  <TouchableOpacity
                    key={w}
                    style={[styles.pill, sweepWidth === w && styles.pillActive]}
                    onPress={() => setSweepWidth(w)}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        sweepWidth === w && styles.pillTextActive,
                      ]}
                    >
                      {w} meter
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Audio Toggles */}
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, voiceEnabled && styles.toggleBtnActive]}
                  onPress={() => setVoiceEnabled(!voiceEnabled)}
                >
                  <Text style={styles.toggleBtnText}>
                    🗣️ Röstguidning: {voiceEnabled ? 'PÅ' : 'AV'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleBtn, audioPingsEnabled && styles.toggleBtnActive]}
                  onPress={() => setAudioPingsEnabled(!audioPingsEnabled)}
                >
                  <Text style={styles.toggleBtnText}>
                    🔔 Gränsklick: {audioPingsEnabled ? 'PÅ' : 'AV'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f111a',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    marginTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1a1d2c',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d334a',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#12141f',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  settingLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#12141f',
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  pillText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#ffffff',
  },
  toggleRow: {
    gap: 8,
  },
  toggleBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#12141f',
    borderWidth: 1,
    borderColor: '#374151',
  },
  toggleBtnActive: {
    borderColor: '#22c55e',
    backgroundColor: '#14291f',
  },
  toggleBtnText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  /* ACTIVE SESSION STYLES */
  activeCard: {
    backgroundColor: '#191d2d',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  liveDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  liveText: {
    color: '#22c55e',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
  },
  metricContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricValue: {
    fontSize: 64,
    fontWeight: '900',
    color: '#ffffff',
    marginVertical: 4,
  },
  progressBarBg: {
    width: '100%',
    height: 12,
    backgroundColor: '#0f111a',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  statusBanner: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  bannerInside: {
    backgroundColor: '#142e22',
    borderColor: '#16a34a',
    borderWidth: 1,
  },
  bannerOutside: {
    backgroundColor: '#3b1212',
    borderColor: '#dc2626',
    borderWidth: 1,
  },
  bannerText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  subSectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  simRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  simBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1a2236',
    borderWidth: 1,
    borderColor: '#38bdf8',
    alignItems: 'center',
  },
  simBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  testAudioRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  audioTestBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
  },
  audioTestBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  pocketTip: {
    backgroundColor: '#1e2438',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  pocketTipText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  stopButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
