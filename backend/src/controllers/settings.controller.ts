import { Request, Response } from 'express';
import { db } from '../config/database.js';
import { systemSettings } from '../config/schema.js';
import { eq } from 'drizzle-orm';

export const getSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await db.select().from(systemSettings).all();
    const settingsMap = settings.reduce((acc: any, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  } catch (error) {
    console.error('Failed to get settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  let settings = req.body.settings || req.body;

  // If body is empty or not an object
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ message: 'Invalid settings data' });
  }

  try {
    const entries = Object.entries(settings);

    for (const [key, value] of entries) {
      const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).get();

      if (existing) {
        await db.update(systemSettings)
          .set({ value: String(value), updatedAt: new Date().toISOString() })
          .where(eq(systemSettings.key, key))
          .run();
      } else {
        await db.insert(systemSettings)
          .values({ key, value: String(value), updatedAt: new Date().toISOString() })
          .run();
      }
    }

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
