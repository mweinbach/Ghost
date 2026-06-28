const assert = require('node:assert/strict');
const sinon = require('sinon');

const CloudflareEmailProvider = require('../../../../../core/server/services/email-providers/cloudflare-email-provider');

describe('CloudflareEmailProvider', function () {
    afterEach(function () {
        sinon.restore();
    });

    it('requires the newsletter gate', async function () {
        const provider = new CloudflareEmailProvider({
            client: {send: sinon.stub()},
            config: {enableNewsletters: false}
        });

        await assert.rejects(provider.send({recipients: []}), /Cloudflare newsletter sending is not enabled/);
    });

    it('sends one rendered recipient with list unsubscribe headers', async function () {
        const sendStub = sinon.stub().resolves({
            message_id: '<message-id@example.com>',
            permanent_bounces: ['member@example.com']
        });
        const provider = new CloudflareEmailProvider({
            client: {send: sendStub},
            config: {enableNewsletters: true}
        });

        const response = await provider.send({
            subject: 'Hello %%{name}%%',
            html: '<p>Hello %%{name}%%</p>',
            plaintext: 'Hello %%{name}%%',
            from: 'ghost@example.com',
            replyTo: 'reply@example.com',
            emailId: 'email-id',
            recipients: [{
                email: 'member@example.com',
                replacements: [{
                    id: 'name',
                    token: /%%\{name\}%%/g,
                    value: 'Jane'
                }, {
                    id: 'list_unsubscribe',
                    token: /%%\{list_unsubscribe\}%%/g,
                    value: 'https://example.com/unsubscribe'
                }]
            }]
        });

        assert.equal(response.id, 'message-id@example.com');
        assert.equal(response.permanentBounces.length, 1);
        sinon.assert.calledWithMatch(sendStub, {
            to: 'member@example.com',
            html: '<p>Hello Jane</p>',
            text: 'Hello Jane',
            headers: {
                'List-Unsubscribe': '<https://example.com/unsubscribe>',
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                'X-Ghost-Email-ID': 'email-id'
            }
        });
    });
});
