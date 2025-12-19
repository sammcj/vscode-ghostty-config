import * as path from 'path';
import * as fs from 'fs';
import { GhosttySchema } from '../types';

let cachedSchema: GhosttySchema | null = null;

// Load schema from a specific path (for testing)
export function loadSchemaFromPath(schemaPath: string): GhosttySchema {
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  return JSON.parse(schemaContent) as GhosttySchema;
}

// Load schema using VSCode extension context
export async function loadSchema(context: { extensionPath: string }): Promise<GhosttySchema> {
  if (cachedSchema) {
    return cachedSchema;
  }

  const schemaPath = path.join(context.extensionPath, 'schema', 'ghostty-config.schema.json');

  try {
    cachedSchema = loadSchemaFromPath(schemaPath);
    return cachedSchema;
  } catch {
    // Return a minimal schema to prevent crashes
    return {
      version: '0.0.0',
      description: 'Fallback schema',
      options: {},
      types: {},
      repeatableKeys: [],
    };
  }
}

export function getOptionInfo(schema: GhosttySchema, key: string) {
  return schema.options[key];
}

export function getSchema(): GhosttySchema | null {
  return cachedSchema;
}

export function isRepeatableKey(schema: GhosttySchema, key: string): boolean {
  // Check if explicitly in repeatableKeys array
  if (schema.repeatableKeys.includes(key)) {
    return true;
  }

  // Check if option has repeatable: true
  const option = schema.options[key];
  return option?.repeatable === true;
}
