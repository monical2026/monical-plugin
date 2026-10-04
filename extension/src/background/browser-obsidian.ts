import { z } from 'zod';
import { rememberedDirectory } from '../export/browser-directory-store';
import {
  browserExportSchema,
  writeBrowserObsidian,
} from '../export/browser-obsidian';
export async function browserObsidian(
  action: 'status' | 'export',
  payload: unknown,
) {
  const directory = await rememberedDirectory();
  if (action === 'status')
    return directory ? { folder: directory.name, vault: directory.name } : null;
  const request = browserExportSchema
    .extend({ copy: z.boolean() })
    .parse(payload);
  if (
    !directory ||
    (await directory.queryPermission({ mode: 'readwrite' })) !== 'granted'
  )
    return { status: 'authorizationRequired' as const };
  return writeBrowserObsidian(directory, request, request.copy);
}
