const assert = require('node:assert/strict');
const sinon = require('sinon');
const configUtils = require('../../../../../utils/config-utils');
const headlessRedirect = require('../../../../../../core/server/web/shared/middleware/headless-redirect');

describe('UNIT: headless redirect middleware', function () {
    let req;
    let res;
    let next;

    beforeEach(function () {
        req = {
            originalUrl: '/welcome/?utm=ghost',
            secure: false,
            get: sinon.stub().withArgs('host').returns('localhost:2368')
        };
        res = {
            redirect: sinon.spy(),
            sendStatus: sinon.spy()
        };
        next = sinon.spy();
    });

    afterEach(async function () {
        sinon.restore();
        await configUtils.restore();
    });

    it('redirects public page requests to the configured frontend URL', function () {
        configUtils.set({
            url: 'http://localhost:3000',
            admin: {
                url: 'http://localhost:2368/ghost/'
            },
            headless: {
                enabled: true,
                redirectStatus: 302
            }
        });

        headlessRedirect(req, res, next);

        sinon.assert.notCalled(next);
        sinon.assert.calledWith(res.redirect, 302, 'http://localhost:3000/welcome/?utm=ghost');
    });

    it('falls back to a temporary redirect for invalid redirect status config', function () {
        configUtils.set({
            url: 'http://localhost:3000',
            headless: {
                enabled: true,
                redirectStatus: 999
            }
        });

        headlessRedirect(req, res, next);

        sinon.assert.calledWith(res.redirect, 302, 'http://localhost:3000/welcome/?utm=ghost');
    });

    it('does not redirect preserved backend paths', function () {
        configUtils.set({
            url: 'http://localhost:3000',
            headless: {
                enabled: true
            }
        });

        for (const originalUrl of [
            '/ghost/',
            '/ghost/api/content/posts/',
            '/content/images/post.jpg',
            '/assets/built/app.js',
            '/public/cards.min.css',
            '/members/api/site/'
        ]) {
            req.originalUrl = originalUrl;
            headlessRedirect(req, res, next);
        }

        sinon.assert.callCount(next, 6);
        sinon.assert.notCalled(res.redirect);
    });

    it('returns 404 for public pages when the request already targets the frontend origin', function () {
        configUtils.set({
            url: 'http://localhost:3000',
            headless: {
                enabled: true
            }
        });
        req.get.withArgs('host').returns('localhost:3000');

        headlessRedirect(req, res, next);

        sinon.assert.notCalled(next);
        sinon.assert.notCalled(res.redirect);
        sinon.assert.calledWith(res.sendStatus, 404);
    });

    it('does nothing when headless mode is disabled', function () {
        configUtils.set({
            url: 'http://localhost:3000',
            headless: {
                enabled: false
            }
        });

        headlessRedirect(req, res, next);

        sinon.assert.calledOnce(next);
        sinon.assert.notCalled(res.redirect);
    });

    it('preserves frontend subdirectories when redirecting', function () {
        configUtils.set({
            url: 'http://localhost:3000/blog',
            headless: {
                enabled: true
            }
        });

        headlessRedirect(req, res, next);

        sinon.assert.calledWith(res.redirect, 302, 'http://localhost:3000/blog/welcome/?utm=ghost');
    });

    it('exposes private helpers for redirect status validation', function () {
        configUtils.set({
            headless: {
                redirectStatus: 307
            }
        });

        assert.equal(headlessRedirect._private.getRedirectStatus(), 307);
    });
});
