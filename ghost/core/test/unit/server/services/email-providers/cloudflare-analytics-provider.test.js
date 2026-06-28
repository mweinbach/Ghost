const assert = require('node:assert/strict');
const nock = require('nock');

const CloudflareAnalyticsProvider = require('../../../../../core/server/services/email-providers/cloudflare-analytics-provider');

describe('CloudflareAnalyticsProvider', function () {
    afterEach(function () {
        nock.cleanAll();
    });

    it('normalizes Cloudflare delivery events', async function () {
        const provider = new CloudflareAnalyticsProvider({
            config: {
                apiToken: 'token',
                zoneId: 'zone-id',
                graphqlUrl: 'https://api.cloudflare.test/graphql'
            }
        });

        nock('https://api.cloudflare.test')
            .post('/graphql')
            .reply(200, {
                data: {
                    viewer: {
                        zones: [{
                            emailSendingAdaptive: [{
                                datetime: '2026-06-28T12:00:00Z',
                                to: 'member@example.com',
                                status: 'delivered',
                                messageId: '<message-id@example.com>',
                                errorCause: null,
                                errorDetail: null
                            }, {
                                datetime: '2026-06-28T12:01:00Z',
                                to: 'bad@example.com',
                                status: 'deliveryFailed',
                                messageId: '<failed-id@example.com>',
                                errorCause: 'bounce',
                                errorDetail: 'mailbox unavailable'
                            }, {
                                datetime: '2026-06-28T12:02:00Z',
                                to: 'queued@example.com',
                                status: 'sent',
                                messageId: '<queued-id@example.com>'
                            }]
                        }]
                    }
                }
            });

        const batches = [];
        await provider.fetchLatest(async (events) => {
            batches.push(events);
        }, {
            begin: new Date('2026-06-28T11:00:00Z'),
            end: new Date('2026-06-28T13:00:00Z'),
            maxEvents: 10,
            events: ['delivered', 'failed']
        });

        assert.equal(batches.length, 1);
        assert.deepEqual(batches[0].map(event => ({
            type: event.type,
            severity: event.severity,
            recipientEmail: event.recipientEmail,
            providerId: event.providerId
        })), [{
            type: 'delivered',
            severity: undefined,
            recipientEmail: 'member@example.com',
            providerId: 'message-id@example.com'
        }, {
            type: 'failed',
            severity: 'permanent',
            recipientEmail: 'bad@example.com',
            providerId: 'failed-id@example.com'
        }]);
    });
});
