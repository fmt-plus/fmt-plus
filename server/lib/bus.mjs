// In-process events between route modules (wallets → telegram).
import { EventEmitter } from 'node:events';
export const bus = new EventEmitter();
bus.setMaxListeners(50);
