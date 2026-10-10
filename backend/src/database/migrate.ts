import '../config/env.js';
import { db, initDatabase } from '../config/database.js';
try { await initDatabase(); } finally { db.$client.close(); }
