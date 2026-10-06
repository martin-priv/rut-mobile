import { Mission, Cell } from '../types';

export async function fetchMission(
  serverUrl: string,
  hash: string
): Promise<{ mission: Mission; cells: Cell[] }> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/missions/${hash}/status`);
  if (!res.ok) {
    throw new Error(`Kunde inte hämta uppdrag (${res.status})`);
  }
  const data = await res.json();
  return {
    mission: data.mission,
    cells: data.cells,
  };
}

export async function updateCellStatus(
  serverUrl: string,
  hash: string,
  cellId: string,
  status: 'open' | 'assigned' | 'completed',
  userName: string,
  userId: string
): Promise<void> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  await fetch(`${cleanUrl}/api/missions/${hash}/cells/${cellId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, userName, userId }),
  });
}

export async function syncTrackToServer(
  serverUrl: string,
  hash: string,
  userName: string,
  userId: string,
  path: [number, number][]
): Promise<void> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  await fetch(`${cleanUrl}/api/missions/${hash}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName, userId, path }),
  });
}
