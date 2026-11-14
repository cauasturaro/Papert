import * as argon2 from 'argon2';
import type { Passwords } from '../domain/ports/passwords.js';

export class ArgonPasswords implements Passwords {
  hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  verify(hash: string, password: string) {
    return argon2.verify(hash, password);
  }
}
