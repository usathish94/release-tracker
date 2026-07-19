import { Router } from 'express';
import { listCloudSkills, chatWithCloudSkill } from '../services/cloudSkillService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const cloudSkillsRouter = Router();

cloudSkillsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const skills = await listCloudSkills();
    res.json({ skills });
  })
);

cloudSkillsRouter.post(
  '/:skillId/chat',
  asyncHandler(async (req, res) => {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Body must include a "message" string.' });
    }
    const result = await chatWithCloudSkill(req.params.skillId, message);
    res.json(result);
  })
);
