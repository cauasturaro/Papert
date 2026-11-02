import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export function configureHttp(app: INestApplication) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (/^\/internal(?:\/|$)/i.test(req.path)) {
      res.status(403).json({ message: 'Internal HTTP access is not enabled.' });
      return;
    }

    next();
  });
}
