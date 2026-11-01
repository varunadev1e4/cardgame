import { GameEngine } from '../engine';
import { blackjack } from './blackjack';
import { inbetween } from './inbetween';
import { flip7 } from './flip7';
import { leastcount } from './leastcount';
import { elimination } from './elimination';
export const engines: Record<string, GameEngine> = { blackjack, inbetween, flip7, leastcount, elimination };
