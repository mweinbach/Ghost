const sinon = require('sinon');
const configUtils = require('../../../../../utils/config-utils');
const hostGate = require('../../../../../../core/server/web/parent/middleware/host-gate');

describe('UNIT: parent host gate middleware', function () {
    let req;

    beforeEach(function () {
        req = {
            get: sinon.stub(),
            vhost: {
                host: 'localhost:2368'
            }
        };
    });

    afterEach(async function () {
        sinon.restore();
        await configUtils.restore();
    });

    it('handles backend requests only on the configured admin host and port', function () {
        configUtils.set({
            url: 'http://localhost:3000',
            admin: {
                url: 'http://localhost:2368'
            }
        });

        sinon.assert.match(hostGate._private.shouldHandleBackend(req), true);

        req.vhost.host = 'localhost:3000';
        sinon.assert.match(hostGate._private.shouldHandleBackend(req), false);
    });

    it('handles frontend requests on the same hostname when the port is not the admin port', function () {
        configUtils.set({
            url: 'http://localhost:3000',
            admin: {
                url: 'http://localhost:2368'
            }
        });

        sinon.assert.match(hostGate._private.shouldHandleFrontend(req), false);

        req.vhost.host = 'localhost:3000';
        sinon.assert.match(hostGate._private.shouldHandleFrontend(req), true);
    });

    it('does not filter when admin.url is missing or uses the same host', function () {
        configUtils.set({
            url: 'http://localhost:2368',
            admin: {
                url: null
            }
        });

        sinon.assert.match(hostGate._private.shouldHandleBackend(req), true);
        sinon.assert.match(hostGate._private.shouldHandleFrontend(req), true);
    });
});
