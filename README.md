# Rut Fält 🌲📱

Mobil fältklient för **Rut** – designad för skogsarbete (röjning, plantering, eftersök) där du inte kan titta på en mobilskärm.

Fungerar helt och hållet i fickan med skärmen släckt, och guidar dig via **ljud och talsyntes** i dina Bluetooth-hörselkåpor/hörlurar.

---

## Hur det fungerar

1. **Bakgrunds-GPS med Android Förgrundstjänst:**
   Appen håller igång en officiell Android Foreground Service så att operativsystemet aldrig stryper GPS:en eller ljudet i fickan.
2. **Virtuellt stängsel (Geofence):**
   - **Nära kanten (< 4 meter):** Diskreta klickande pulser i lurarna (som en parkeringssensor).
   - **Utanför rutan:** Tydlig låg varningston + röstmeddelande *"Du klev utanför rutan"*.
   - **Tillbaka in:** Röstmeddelande *"Tillbaka i rutan"*.
3. **Automatisk täckningsgrad:**
   Medan du rör dig med röjsågen skapas en 2.5 m bred "pensel" längs ditt spår med Turf.js.
   - När du når 50 %: Röstmeddelande *"50 procent av rutan klar"*.
   - När du når 85 %: Belönande fanfarpling + *"Rutan är klar! Bra jobbat."*
4. **Snabbtest var som helst:**
   Du behöver inte skapa ett uppdrag på datorn för att testa! Klicka bara på **Starta provpass här** så ritas en 40×40 m ruta ut direkt där du står.

---

## Kom igång och testa på din telefon

1. Installera appen **Expo Go** på din Android-telefon från Google Play Store (gratis).
2. Starta utvecklingsservern på datorn:
   ```bash
   npx expo start
   ```
3. Öppna **Expo Go** på mobilen och scanna QR-koden som visas i terminalen.
4. Tillåt platstjänster ("Tillåt alltid" / bakgrundsplats).
5. Sätt på dig hörlurarna/hörselkåporna, tryck på **Starta provpass här**, släck skärmen och stoppa mobilen i fickan!

---

## Teknisk stack

* **Ramverk:** React Native med Expo (SDK 57, TypeScript)
* **Geospatial logik:** `@turf/turf` (booleanPointInPolygon, buffer, intersect, lineDistance)
* **Platstjänster:** `expo-location`, `expo-task-manager`
* **Ljud:** `expo-av`, `expo-speech` (svensk röstsyntes)
* **Lagring:** `@react-native-async-storage/async-storage`
