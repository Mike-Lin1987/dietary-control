import { randomBytes } from 'node:crypto';

import { deriveAccessCodeHash } from '../app/access-session.js';

const accessCode = randomBytes(18).toString('base64url');
const salt = randomBytes(24).toString('base64url');
const sessionSecret = randomBytes(48).toString('base64url');
const expectedHash = await deriveAccessCodeHash(accessCode, salt);

console.log(JSON.stringify({
  accessCode,
  sitesSecrets: {
    NUTRILENS_ACCESS_CODE_HASH: expectedHash,
    NUTRILENS_ACCESS_CODE_SALT: salt,
    NUTRILENS_ACCESS_SESSION_SECRET: sessionSecret,
    NUTRILENS_ACCESS_CODE_VERSION: '1',
  },
}, null, 2));
