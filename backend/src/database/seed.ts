import '../config/env.js';
import { db, initDatabase } from '../config/database.js';
import { seedDefaultTemplates } from '../services/defaultTemplates.service.js';
import { initializeTemplateHistory } from '../services/templateHistory.service.js';
try { await initDatabase(); await seedDefaultTemplates(); await initializeTemplateHistory(); }
finally { db.$client.close(); }
