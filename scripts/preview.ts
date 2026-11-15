import express from 'express';
import { staticHosting } from './static-hosting';

const app = express();
app.use(staticHosting());
app.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Production preview: http://127.0.0.1:4173'));
