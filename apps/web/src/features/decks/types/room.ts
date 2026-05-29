export interface RoomListItem {
  roomId: string;
  deckId: string;
  presenterId: string;
  status: 'active' | 'ended';
  createdAt: string;
  endedAt: string | null;
  deck: {
    deckId: string;
    name: string;
    slides: number;
  };
}

export interface RoomDeckPayload {
  deckId: string;
  name: string;
  slides: number;
  storagePath: string;
  signedUrl: string;
  signedUrlExpiresIn: number;
  /** Present for PPTX decks */
  sourceType?: 'pdf' | 'pptx';
  /** Conversion status for PPTX decks */
  conversionStatus?: 'none' | 'pending' | 'processing' | 'completed' | 'failed';
}

export interface RoomDetail {
  roomId: string;
  deckId: string;
  presenterId: string;
  status: 'active' | 'ended';
  createdAt: string;
  endedAt: string | null;
  deck: RoomDeckPayload;
  participants: Array<{
    userId: string;
    role: 'presenter' | 'viewer';
    joinedAt: string;
    leftAt: string | null;
  }>;
}
