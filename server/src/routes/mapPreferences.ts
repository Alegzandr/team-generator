import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    MapPreferencesRecord,
    getMapPreferences,
    saveMapPreferences,
} from '../services/mapPreferenceService';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
    try {
        const preferences = await getMapPreferences(req.authUser!.networkId);
        res.json(preferences);
    } catch (error) {
        res.status(500).json({ message: 'Failed to load map preferences' });
    }
});

router.put('/', async (req, res) => {
    const body = (req.body || {}) as Partial<MapPreferencesRecord>;
    try {
        const saved = await saveMapPreferences(req.authUser!.networkId, body);
        res.json(saved);
    } catch (error) {
        res.status(500).json({ message: 'Failed to save map preferences' });
    }
});

export default router;
