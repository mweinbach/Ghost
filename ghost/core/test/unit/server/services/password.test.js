const assert = require('node:assert/strict');

const passwordService = require('../../../../core/server/services/password');
// @tryghost/security is the bcryptjs fallback; used here to produce "legacy" hashes
// and to assert cross-runtime compatibility.
const security = require('@tryghost/security');

describe('Password service (runtime-aware Bun/bcryptjs shim)', function () {
    it('hashes a password to a bcrypt hash and verifies it', async function () {
        const hash = await passwordService.hash('correct horse battery staple');

        assert.equal(typeof hash, 'string');
        assert.match(hash, /^\$2[ab]/); // bcrypt

        assert.equal(await passwordService.compare('correct horse battery staple', hash), true);
        assert.equal(await passwordService.compare('totally wrong password', hash), false);
    });

    it('verifies a legacy bcryptjs hash without re-hashing (zero migration)', async function () {
        // Simulates an existing stored hash produced by the bcryptjs fallback path.
        const legacyHash = await security.password.hash('legacy-password');

        assert.match(legacyHash, /^\$2[ab]/);
        assert.equal(await passwordService.compare('legacy-password', legacyHash), true);
        assert.equal(await passwordService.compare('not-the-password', legacyHash), false);
    });

    it('produces a hash the bcryptjs fallback can verify (cross-runtime compat)', async function () {
        // Hashed by the service (Bun.password on Bun, bcryptjs on Node) ...
        const hash = await passwordService.hash('cross-compat');
        // ... must also verify under the raw bcryptjs fallback.
        assert.equal(await security.password.compare('cross-compat', hash), true);
    });
});
