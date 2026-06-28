const assert = require('node:assert/strict');
const nock = require('nock');

const CloudflareEmailClient = require('../../../../../core/server/services/email-providers/cloudflare-email-client');

describe('CloudflareEmailClient', function () {
    afterEach(function () {
        nock.cleanAll();
    });

    it('filters headers to Cloudflare allowed/custom headers', function () {
        const headers = CloudflareEmailClient.filterHeaders({
            Sender: 'sender@example.com',
            Subject: 'Nope',
            'List-Unsubscribe': '<https://example.com/unsubscribe>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'X-Ghost-Email-ID': 'email-id',
            Date: 'today'
        });

        assert.deepEqual(headers, {
            'List-Unsubscribe': '<https://example.com/unsubscribe>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'X-Ghost-Email-ID': 'email-id'
        });
    });

    it('sends email through the Cloudflare REST API', async function () {
        const client = new CloudflareEmailClient({
            config: {
                accountId: 'account-id',
                apiToken: 'token',
                senderDomain: 'example.com',
                baseUrl: 'https://api.cloudflare.test'
            }
        });

        const request = nock('https://api.cloudflare.test', {
            reqheaders: {
                authorization: 'Bearer token'
            }
        })
            .post('/accounts/account-id/email/sending/send', (body) => {
                assert.equal(body.from, '"Ghost" <ghost@example.com>');
                assert.equal(body.reply_to, 'reply@example.com');
                assert.equal(body.to, 'member@example.com');
                assert.equal(body.subject, 'Hello');
                assert.equal(body.html, '<p>Hello</p>');
                assert.equal(body.text, 'Hello');
                assert.equal(body.headers['X-Ghost-Email-ID'], 'email-id');
                assert.equal(body.headers.Sender, undefined);
                return true;
            })
            .reply(200, {
                success: true,
                result: {
                    message_id: '<message-id@example.com>',
                    delivered: ['member@example.com'],
                    permanent_bounces: [],
                    queued: []
                }
            });

        const response = await client.send({
            from: '"Ghost" <ghost@example.com>',
            replyTo: 'reply@example.com',
            to: 'member@example.com',
            subject: 'Hello',
            html: '<p>Hello</p>',
            text: 'Hello',
            headers: {
                Sender: '"Ghost" <ghost@example.com>',
                'X-Ghost-Email-ID': 'email-id'
            }
        });

        assert.equal(response.message_id, '<message-id@example.com>');
        assert.equal(request.isDone(), true);
    });

    it('maps Cloudflare API errors to EmailError without storing body content', async function () {
        const client = new CloudflareEmailClient({
            config: {
                accountId: 'account-id',
                apiToken: 'token',
                senderDomain: 'example.com',
                baseUrl: 'https://api.cloudflare.test'
            }
        });

        nock('https://api.cloudflare.test')
            .post('/accounts/account-id/email/sending/send')
            .reply(403, {
                success: false,
                errors: [{
                    code: 10102,
                    message: 'email.sending.error.authentication.forbidden'
                }]
            });

        await assert.rejects(client.send({
            from: 'ghost@example.com',
            to: 'member@example.com',
            subject: 'Hello',
            html: '<p>secret</p>',
            text: 'secret'
        }), (err) => {
            assert.equal(err.statusCode, 403);
            assert.equal(err.code, 'CLOUDFLARE_EMAIL_SEND_FAILED');
            assert.equal(err.errorDetails.includes('<p>secret</p>'), false);
            assert.equal(err.errorDetails.includes('secret'), false);
            return true;
        });
    });
});
