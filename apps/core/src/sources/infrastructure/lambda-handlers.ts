import { applicationContext } from '../../lambda-context.js';
import { SourceIngestionService } from '../application/source-ingestion.service.js';

async function sources() {
  const app = await applicationContext();

  return app.get(SourceIngestionService);
}

// This Lambda has no HTTP event. Only the ingestion role may invoke it through IAM.
export async function sourceControl(event: unknown) {
  const service = await sources();

  return service.control(event);
}

export async function maintenance() {
  const service = await sources();

  const result = await service.maintenance();
  console.info(JSON.stringify({ metric: 'source_maintenance', ...result }));

  return result;
}
