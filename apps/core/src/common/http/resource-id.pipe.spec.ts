import { HttpException } from '@nestjs/common';
import { ResourceIdPipe } from './resource-id.pipe.js';

describe('Resource id pipe', () => {
  const pipe = new ResourceIdPipe();

  it('passes UUIDs through unchanged', () => {
    const id = '7f0c1f4e-2a6b-4c8d-9e1f-3a5b7c9d1e2f';

    expect(pipe.transform(id)).toBe(id);
  });

  it('reports malformed identifiers as a missing resource', () => {
    let error: unknown;

    try {
      pipe.transform('not-a-uuid');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(404);
    expect((error as HttpException).getResponse()).toEqual({
      message: 'Resource not found.',
    });
  });
});
