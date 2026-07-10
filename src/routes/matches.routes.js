import { Router } from 'express';
import { listMatches, getMatch } from '../services/matchService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const matchesRouter = Router();

matchesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    if (status && !['live', 'completed', 'upcoming'].includes(status)) {
      return res.status(400).json({ error: 'status must be one of live, completed, upcoming' });
    }
    const matches = await listMatches(status);
    res.json({ matches });
  })
);

matchesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const match = await getMatch(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json({ match });
  })
);
