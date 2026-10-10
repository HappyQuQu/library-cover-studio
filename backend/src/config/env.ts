import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Existing process variables and backend-local overrides take precedence over the workspace .env.
dotenv.config({ path: [path.join(backendRoot, '.env'), path.join(backendRoot, '../.env')] });
