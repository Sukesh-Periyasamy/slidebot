import { apiClient, extractData } from '@/lib/apiClient';
import type { RoomDetail, RoomListItem } from '../types/room';

export async function listRecentRooms(): Promise<RoomListItem[]> {
  const response = await apiClient.get<{ data: RoomListItem[] }>('/rooms');
  return extractData(response);
}

export async function getRoomById(roomId: string): Promise<RoomDetail> {
  const response = await apiClient.get<{ data: RoomDetail }>(`/rooms/${roomId}`);
  return extractData(response);
}

export async function joinRoom(roomId: string): Promise<void> {
  await apiClient.post(`/rooms/${roomId}/join`);
}

export async function leaveRoom(roomId: string): Promise<void> {
  await apiClient.post(`/rooms/${roomId}/leave`);
}

export async function deleteRoom(roomId: string): Promise<void> {
  await apiClient.delete(`/rooms/${roomId}`);
}
