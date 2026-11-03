import { checkDockerfile } from './dockerfile-syntax.js';

describe('checkDockerfile', () => {
  it('accepts directives, continuations, heredocs and ONBUILD triggers', () => {
    const source = [
      '# escape=`',
      'FROM alpine:3.22 AS base',
      'RUN apk add --no-cache curl `',
      '  # comment inside a continuation',
      '  && echo ready',
      'RUN <<EOF',
      'echo "FROMM is data, not an instruction"',
      'EOF',
      'ENV A=1 B=2',
      'ENV LEGACY value',
      'ONBUILD COPY . /app',
      'HEALTHCHECK --interval=5s CMD curl -f http://localhost/',
      'SHELL ["/bin/sh", "-c"]',
    ].join('\n');

    const diagnostics = checkDockerfile(source);

    expect(diagnostics).toEqual([]);
  });

  it('rejects ordering, unknown keywords and malformed arguments', () => {
    const source = [
      'RUN echo first',
      'FROM node:24',
      'RUNN echo typo',
      'EXPOSE http',
      'SHELL /bin/sh',
      'ONBUILD FROM scratch',
      'RUN <<EOF',
      'echo never closed',
    ].join('\n');

    const diagnostics = checkDockerfile(source);

    expect(diagnostics.map((item) => item.line)).toEqual([1, 3, 4, 5, 6, 7]);
  });
});
