import type { ShowcaseRoadmap } from '../showcase-roadmaps.js';

export const dockerCiCdProduction: ShowcaseRoadmap = {
  id: 'docker-ci-cd-production',
  definition: {
    title: 'Production Containers and Delivery Pipelines',
    description:
      'Describe a repeatable container build and a gated delivery workflow in files. Connect a multi-stage Dockerfile, Compose services, and GitHub Actions without performing a deployment.',
    level: 'intermediate',
    steps: [
      {
        id: 'separate-build-stages',
        title: 'Carry only runtime artifacts forward',
        content:
          'A container image has a build history, but its final filesystem should contain only what the application needs to start. Separate dependency installation and compilation from the runtime stage. Copy the package manifest and lockfile before application source so dependency layers have a clear cache boundary. Development dependencies can support compilation without entering the final image. Use an explicit supported runtime tag consistently across stages and document why it was chosen. A nonroot runtime identity reduces the damage a compromised process can cause, while an explicit working directory makes copied paths easier to inspect.',
        concepts: ['multi-stage builds', 'layer caching', 'nonroot runtime'],
        requires: [],
        challenge: {
          instructions:
            'Complete Dockerfile for a TypeScript service with dependency, build, and runtime stages. Create a minimal lockfile placeholder note in docs/delivery.md explaining the required committed lockfile, and define build/start scripts in package.json.',
          criteria: [
            {
              id: 'stage-boundaries',
              description:
                'Dockerfile copies manifests before source, uses a lockfile-based install, compiles in a build stage, and copies only runtime dependencies and compiled output into the final stage.',
            },
            {
              id: 'runtime-user',
              description:
                'Dockerfile uses a consistent explicit runtime tag, WORKDIR, a nonroot USER, and a command targeting compiled output.',
            },
          ],
        },
      },
      {
        id: 'bound-build-context',
        title: 'Keep private and transient files outside the image',
        content:
          'The build context is the set of files available to a container build. A careful COPY instruction helps, but a narrow context prevents accidental inclusion before copying even begins. Exclude dependency folders, repository history, local environment files, and generated output. Do not put a credential into an image argument or environment declaration: image metadata and layers can outlive the machine that built them. Document which settings are public defaults and which must be supplied at runtime. A source-only configuration review can detect these exposure paths even though no image is built inside this workspace.',
        concepts: [
          'build context',
          'secret boundaries',
          'runtime configuration',
        ],
        requires: ['separate-build-stages'],
        challenge: {
          instructions:
            'Create .dockerignore and extend docs/delivery.md with runtime configuration names and secret handling. Inspect Dockerfile and remove any embedded credential or secret build argument.',
          criteria: [
            {
              id: 'context-exclusions',
              description:
                '.dockerignore excludes node_modules, .git, local environment files, and generated build output.',
            },
            {
              id: 'secret-handling',
              description:
                'Dockerfile contains no credentials or secret ARG values, and docs/delivery.md distinguishes runtime secrets from public defaults.',
            },
          ],
        },
      },
      {
        id: 'compose-services',
        title: 'Describe service readiness and durable data',
        content:
          'Compose describes how local services relate, including networking, settings, health checks, and storage. Use service names for connections inside its network; localhost from the application container points back to that same container. A dependency being created does not mean its database is ready, so express a health check and a readiness condition. A named volume makes database persistence explicit and separates data from a disposable container filesystem. Publish only the application port unless a documented local need requires database access. Configuration placeholders should communicate required inputs without embedding a working credential in the repository.',
        concepts: ['Compose', 'health checks', 'persistent volumes'],
        requires: ['bound-build-context'],
        challenge: {
          instructions:
            'Complete compose.yaml with app and PostgreSQL services, a database health check, a healthy dependency condition, a named data volume, and required runtime setting placeholders.',
          criteria: [
            {
              id: 'service-readiness',
              description:
                'compose.yaml connects the app to the database service name and uses a database health check with a service_healthy dependency condition.',
            },
            {
              id: 'data-and-ports',
              description:
                'compose.yaml mounts a named database volume, publishes only the app port, and uses placeholders rather than literal credentials.',
            },
          ],
        },
      },
      {
        id: 'gate-delivery',
        title: 'Make publication and deployment deliberate',
        content:
          'A delivery workflow should explain which evidence allows an artifact to move forward. Pull requests can verify source and container definitions without publishing an image. Publication should happen only from the intended protected branch after verification succeeds. Tag the image with the commit identifier so the deployment refers to a fixed artifact rather than a moving label. Keep permissions narrow and put the deployment behind an environment approval boundary. Recording a rollback target is part of the design: a previous immutable image reference gives an operator a precise choice when the newest release is unsuitable.',
        concepts: ['GitHub Actions', 'immutable artifacts', 'deployment gates'],
        requires: ['compose-services'],
        challenge: {
          instructions:
            'Complete .github/workflows/delivery.yaml with verification, branch-gated image publication, and an environment-gated deployment job consuming the commit-tagged image. Add a rollback procedure to docs/delivery.md; use named secret references and no actual credentials.',
          criteria: [
            {
              id: 'pipeline-gates',
              description:
                'delivery.yaml verifies pull requests, restricts publication to the chosen main branch, uses needs dependencies, and gates deployment with an environment.',
            },
            {
              id: 'artifact-and-access',
              description:
                'delivery.yaml tags and deploys the image by commit, grants only required job permissions, and references secrets by name.',
            },
            {
              id: 'rollback-plan',
              description:
                'docs/delivery.md explains how to select a previously published immutable image and which deployment setting would change.',
            },
          ],
        },
      },
    ],
    starterFiles: {
      Dockerfile:
        '# TODO: Separate dependency installation, compilation, and runtime.\n',
      'compose.yaml':
        '# TODO: Describe the application and database services.\n',
      '.github/workflows/delivery.yaml':
        '# TODO: Define verification, image publication, and gated deployment.\n',
      'package.json':
        '{"name":"workshop-service","private":true,"scripts":{}}\n',
    },
  },
};
