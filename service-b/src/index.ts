import express from 'express';
import { envs } from './config/envs';
import router from './routes';
import './config/worker';
import { startPendingSweep } from './config/sweep';

const app = express();
const port = envs.PORT || 3000;

app.use(express.json());

app.use('/', router);

startPendingSweep();

app.listen(port, () => {
  console.log(`Service B corriendo en puerto: ${port}`);
});