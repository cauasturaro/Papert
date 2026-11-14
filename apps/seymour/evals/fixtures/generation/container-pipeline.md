# Copper container delivery guide

## Learning repository

The training repository packages a small Python worker in Docker. The worker reads local task descriptions and writes a summary file; it does not need a public endpoint. Keep the Dockerfile, dependency manifest, worker module, and pipeline configuration separate so reviewers can inspect the boundary between application behavior and packaging.

## Image conventions

Our image build stage is named `copper-build-seal`. Pin its base image explicitly, install only declared dependencies, and copy application files after dependencies where practical. The final image must run under the non-root account `copper_runner`. Define that account in the Dockerfile rather than relying on a host user identifier.

Runtime configuration enters through documented environment variables with safe local defaults. Do not copy local environment files into the image. The ignore file must exclude development caches and credentials. Explain which files the final stage actually needs and why build tools need not be present there.

## Pipeline conventions

The pipeline's review gate is called `amber-manifest-check`. It checks the declared image build inputs and the final-stage user before any release job becomes eligible. For a learning challenge, provide the gate configuration and test assertions as source; completing the roadmap must not require deploying an image or proving a live pipeline succeeded.

Reviewers check stage references, file copy paths, dependency pinning, job dependencies, and account ownership statically. Add an explicit failed-check dependency example in test source so bypassing the gate is visible during review.
