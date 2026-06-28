const CloudflareEmailClient = require('./cloudflare-email-client');

const QUERY = `
query EmailSendingEvents($zoneTag: string!, $start: Time!, $end: Time!, $limit: Int!) {
  viewer {
    zones(filter: {zoneTag: $zoneTag}) {
      emailSendingAdaptive(
        filter: {datetime_geq: $start, datetime_leq: $end}
        limit: $limit
        orderBy: [datetime_ASC]
      ) {
        datetime
        to
        status
        messageId
        errorCause
        errorDetail
      }
    }
  }
}
`;

class CloudflareAnalyticsProvider {
    #client;
    #config;

    constructor({config}) {
        this.#config = config;
        this.#client = new CloudflareEmailClient({config});
    }

    #mapStatus(status) {
        if (status === 'delivered') {
            return {type: 'delivered'};
        }

        if (status === 'deliveryFailed' || status === 'rejected') {
            return {type: 'failed', severity: 'permanent'};
        }

        if (status === 'failed') {
            return {type: 'failed', severity: 'temporary'};
        }

        return null;
    }

    #normalizeEvent(event) {
        const mapped = this.#mapStatus(event.status);
        if (!mapped || !event.messageId || !event.to) {
            return null;
        }

        return {
            id: `${event.messageId}:${event.to}:${event.status}:${event.datetime}`,
            type: mapped.type,
            severity: mapped.severity,
            recipientEmail: event.to,
            providerId: event.messageId.replace(/^<|>$/g, ''),
            timestamp: new Date(event.datetime),
            error: mapped.type === 'failed' ? {
                code: event.status === 'rejected' ? 607 : 0,
                enhancedCode: `cloudflare:${event.status}`,
                message: event.errorDetail || event.errorCause || `Cloudflare Email Service status: ${event.status}`
            } : null
        };
    }

    async fetchLatest(batchHandler, options = {}) {
        if (!this.#config.zoneId || !this.#config.apiToken) {
            return;
        }

        if (options.events && options.events.length === 1 && options.events.includes('opened')) {
            return;
        }

        const response = await this.#client.queryGraphql({
            query: QUERY,
            variables: {
                zoneTag: this.#config.zoneId,
                start: options.begin.toISOString(),
                end: options.end.toISOString(),
                limit: Math.min(options.maxEvents || 10000, 10000)
            }
        });

        const events = response?.data?.viewer?.zones?.[0]?.emailSendingAdaptive || [];
        const normalizedEvents = events.map(event => this.#normalizeEvent(event)).filter(Boolean);

        if (normalizedEvents.length > 0) {
            await batchHandler(normalizedEvents);
        }
    }
}

module.exports = CloudflareAnalyticsProvider;
