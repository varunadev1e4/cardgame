export type GameId = 'blackjack' | 'inbetween' | 'flip7' | 'leastcount' | 'elimination';
export type RoomStatus = 'waiting' | 'active' | 'completed' | 'closed';
export interface PublicPlayer { id: string; nickname: string; connected: boolean; isHost: boolean }
export type ClientMsg =
  | { t: 'join'; token: string; nickname: string }
  | { t: 'config'; game: GameId; settings: Record<string, unknown> }
  | { t: 'start' } | { t: 'rematch' }
  | { t: 'kick'; playerId: string }
  | { t: 'action'; seq: number; action: unknown }
  | { t: 'chat'; text: string } | { t: 'react'; emoji: string };
export type ServerMsg =
  | { t: 'joined'; playerId: string }
  | { t: 'room'; code: string; status: RoomStatus; game: GameId; settings: unknown; players: PublicPlayer[] }
  | { t: 'state'; view: unknown } | { t: 'chat'; from: string; text: string; system?: boolean }
  | { t: 'react'; from: string; emoji: string } | { t: 'error'; message: string };
