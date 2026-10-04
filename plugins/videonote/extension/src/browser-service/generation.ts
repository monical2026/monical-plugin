import type { Settings } from '@youtube-note/shared';
import {
  generationEngine,
  ticketSchema,
  type Ticket,
} from '../../../shared/src/ai/generation';
import { stored, store, locked } from './storage';
import { readSecret } from './vault';
import { requestJson } from './network';
const prefix = 'browserGeneration:';
const read = async (videoId: string) => {
  const value = await stored(prefix + videoId);
  return value === undefined ? null : ticketSchema.parse(value);
};
const write = async (ticket: Ticket) => {
  await store(prefix + ticket.videoId, ticket);
  return ticket;
};
const engine = generationEngine(
  {
    read,
    write,
    create: write,
    lock: (id, action) => locked(`generation:${id}`, action),
  },
  (_operation, account) => readSecret(account),
  (url, headers) => requestJson(url, headers),
);
export function generation(
  operation: string,
  input: unknown,
  settings: Settings,
) {
  if (operation === 'prepareGeneration')
    return engine.prepareGeneration(input, settings);
  if (operation === 'confirmGeneration')
    return engine.confirmGeneration(input, settings);
  return engine.readJob(input, settings);
}
