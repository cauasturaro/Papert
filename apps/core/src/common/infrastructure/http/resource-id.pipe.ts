import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { z } from 'zod';

const resourceId = z.guid();

// Malformed identifiers are reported as missing so they reveal nothing about existing resources.
@Injectable()
export class ResourceIdPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!resourceId.safeParse(value).success) {
      throw new HttpException(
        { message: 'Resource not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    return value;
  }
}
