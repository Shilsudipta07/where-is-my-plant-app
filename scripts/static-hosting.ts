import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';

export function staticHosting(directory = path.resolve('dist')) {
  const router = express.Router();
  router.use('/seo-history.json', (_req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('X-Robots-Tag', 'noindex');
    next();
  });
  router.use((req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method) && req.path.length > 1 && req.path.endsWith('/')) {
      try {
        const pathname = req.path.replace(/\/+$/, '');
        const file = path.resolve(directory, '.' + decodeURIComponent(pathname) + '.html');
        if (file.startsWith(directory + path.sep) && existsSync(file)) {
          res.redirect(301, pathname + req.url.slice(req.path.length));
          return;
        }
      } catch { /* Malformed URLs fall through to the standard error handling. */ }
    }
    next();
  });
  router.use(express.static(directory, { extensions: ['html'] }));
  router.get('*', (_req, res) => res.status(404).sendFile(path.join(directory, '404.html')));
  return router;
}
