import { hexagonalArchitectureNestjs } from './showcase/hexagonal-architecture-nestjs.js';
import { ragFastapiPgvector } from './showcase/rag-fastapi-pgvector.js';
import { dockerCiCdProduction } from './showcase/docker-ci-cd-production.js';
import { postgresqlSchemaDesign } from './showcase/postgresql-schema-design.js';
import { typescriptRestApiExpress } from './showcase/typescript-rest-api-express.js';
import { pythonTestingPytest } from './showcase/python-testing-pytest.js';
import { reactDataFetchingTanstackQuery } from './showcase/react-data-fetching-tanstack-query.js';
import { eventDrivenAwsSqsLambda } from './showcase/event-driven-aws-sqs-lambda.js';
import type { RoadmapDefinition } from './study.js';

export type ShowcaseRoadmap = {
  id: string;
  definition: RoadmapDefinition;
};

export const SHOWCASE_ROADMAPS: ShowcaseRoadmap[] = [
  hexagonalArchitectureNestjs,
  ragFastapiPgvector,
  dockerCiCdProduction,
  postgresqlSchemaDesign,
  typescriptRestApiExpress,
  pythonTestingPytest,
  reactDataFetchingTanstackQuery,
  eventDrivenAwsSqsLambda,
];
