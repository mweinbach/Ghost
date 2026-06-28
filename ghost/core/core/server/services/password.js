/* global Bun */

const security = require('@tryghost/security');

// Bun ships a native password hasher (Bun.password, backed by Zig/CryptoKit).
// When Ghost runs on the Bun runtime we use it; otherwise we fall back to
// @tryghost/security (bcryptjs). Both paths speak bcrypt, and
// Bun.password.verify auto-detects the algorithm from the hash string, so:
//   - hashes produced by the bcryptjs fallback ($2a/$2b) verify unchanged on Bun
//   - hashes produced by Bun.password (bcrypt) verify under the bcryptjs fallback
// This keeps production/Node deploys and the Node-based Vitest CI run unaffected,
// while the Bun runtime (dev + production Docker) gets native hashing with zero
// migration of existing stored passwords.
//
// Note: bcrypt is deliberately chosen (not Bun's default argon2id) so hashes stay
// verifiable if a deployment ever runs on Node. Switching new hashes to argon2id
// can wait until the Node fallback is retired.
const hasBunPassword = typeof Bun !== 'undefined' && Bun !== null && typeof Bun.password !== 'undefined';

// Bun.password bcrypt enforces a minimum cost of 4 (the bcryptjs fallback uses 1
// in testing); keep the normal cost at 10 to match the previous behaviour.
const BCRYPT_COST = process.env.NODE_ENV && process.env.NODE_ENV.startsWith('testing') ? 4 : 10;

async function hash(plainPassword) {
    if (hasBunPassword) {
        return Bun.password.hash(plainPassword, {algorithm: 'bcrypt', cost: BCRYPT_COST});
    }
    return security.password.hash(plainPassword);
}

function compare(plainPassword, hashedPassword) {
    if (hasBunPassword) {
        return Bun.password.verify(plainPassword, hashedPassword);
    }
    return security.password.compare(plainPassword, hashedPassword);
}

module.exports = {
    hash,
    compare
};
