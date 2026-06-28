const assert = require('node:assert/strict');
const sinon = require('sinon');

const providerStatus = require('../../../../../core/server/services/email-providers/provider-status');

describe('email provider status', function () {
    let config;
    let settings;

    beforeEach(function () {
        config = {get: sinon.stub()};
        settings = {get: sinon.stub()};
    });

    afterEach(function () {
        sinon.restore();
    });

    it('keeps explicit non-direct mail transports on Nodemailer', function () {
        config.get.withArgs('mail').returns({transport: 'smtp'});
        settings.get.withArgs('email_provider').returns('cloudflare');

        assert.equal(providerStatus.getTransactionalProviderName({config, settings}), null);
    });

    it('selects Cloudflare for transactional mail when configured and selected', function () {
        config.get.withArgs('mail').returns({transport: 'direct'});
        config.get.withArgs('bulkEmail').returns({});
        settings.get.withArgs('email_provider').returns('cloudflare');
        settings.get.withArgs('cloudflare_email_account_id').returns('account-id');
        settings.get.withArgs('cloudflare_email_api_token').returns('token');
        settings.get.withArgs('cloudflare_email_sender_domain').returns('example.com');

        assert.equal(providerStatus.getTransactionalProviderName({config, settings}), 'cloudflare');
    });

    it('lets bulkEmail.provider override the selected newsletter provider', function () {
        config.get.withArgs('bulkEmail:provider').returns('cloudflare');
        settings.get.withArgs('email_provider').returns('mailgun');

        assert.equal(providerStatus.getNewsletterProviderName({config, settings}), 'cloudflare');
    });
});
