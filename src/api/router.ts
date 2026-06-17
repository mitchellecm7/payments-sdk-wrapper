// API router for handling incoming payment requests

import { CoreEngine } from '../core/engine';

export const router = {
  handle: (req: { id: string }) => {
    new CoreEngine().processTx(req.id);
  },
};
