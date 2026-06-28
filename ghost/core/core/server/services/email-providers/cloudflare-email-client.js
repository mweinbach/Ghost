const got = require('got').default;
const errors = require('@tryghost/errors');
const metrics = require('@tryghost/metrics');

const API_FIELD_HEADERS = new Set(['from', 'to', 'cc', 'bcc', 'subject', 'reply-to', 'sender']);
const ALLOWED_HEADERS = new Set([
    'in-reply-to',
    'references',
    'list-unsubscribe',
    'list-unsubscribe-post',
    'list-id',
    'list-archive',
    'list-help',
    'list-owner',
    'list-post',
    'list-subscribe',
    'precedence',
    'auto-submitted',
    'content-language',
    'keywords',
    'comments',
    'importance',
    'sensitivity',
    'organization',
    'require-recipient-valid-since',
    'archived-at'
]);

function normalizeAddress(address) {
    if (!address) {
        return undefined;
    }

    return address;
}

function normalizeRecipients(recipients) {
    if (!recipients) {
        return undefined;
    }

    if (Array.isArray(recipients)) {
        return recipients.filter(Boolean);
    }

    return recipients;
}

function filterHeaders(headers = {}) {
    return Object.entries(headers).reduce((acc, [key, value]) => {
        if (!key || value === undefined || value === null || value === '') {
            return acc;
        }

        const normalizedKey = key.toLowerCase();
        if (API_FIELD_HEADERS.has(normalizedKey)) {
            return acc;
        }

        if (normalizedKey.startsWith('x-') || ALLOWED_HEADERS.has(normalizedKey)) {
            acc[key] = String(value);
        }

        return acc;
    }, {});
}

function mapAttachments(attachments = []) {
    if (!Array.isArray(attachments)) {
        return undefined;
    }

    const mapped = attachments.map((attachment) => {
        if (!attachment?.content || !attachment.filename) {
            return null;
        }

        const content = Buffer.isBuffer(attachment.content) ? attachment.content.toString('base64') : attachment.content;

        return {
            content,
            filename: attachment.filename,
            type: attachment.contentType || attachment.type || 'application/octet-stream',
            disposition: attachment.cid ? 'inline' : 'attachment',
            ...(attachment.cid ? {content_id: attachment.cid} : {})
        };
    }).filter(Boolean);

    return mapped.length > 0 ? mapped : undefined;
}

function removeUndefinedValues(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => {
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        if (value && typeof value === 'object') {
            return Object.keys(value).length > 0;
        }
        return value !== undefined && value !== null && value !== '';
    }));
}

class CloudflareEmailClient {
    #config;

    constructor({config}) {
        this.#config = config;
    }

    isConfigured() {
        return !!(this.#config?.accountId && this.#config?.apiToken && this.#config?.senderDomain);
    }

    getConfig() {
        return this.#config;
    }

    createPayload(message) {
        const headers = filterHeaders(message.headers);
        const payload = {
            from: normalizeAddress(message.from),
            reply_to: normalizeAddress(message.replyTo || message.reply_to),
            to: normalizeRecipients(message.to),
            cc: normalizeRecipients(message.cc),
            bcc: normalizeRecipients(message.bcc),
            subject: message.subject,
            html: message.html,
            text: message.text || message.plaintext,
            headers,
            attachments: mapAttachments(message.attachments)
        };

        return removeUndefinedValues(payload);
    }

    async send(message) {
        if (!this.isConfigured()) {
            throw new errors.EmailError({
                message: 'Cloudflare Email Service is not configured.',
                statusCode: 500,
                code: 'CLOUDFLARE_EMAIL_NOT_CONFIGURED'
            });
        }

        const payload = this.createPayload(message);
        const startTime = Date.now();
        try {
            const response = await got.post(`${this.#config.baseUrl}/accounts/${this.#config.accountId}/email/sending/send`, {
                json: payload,
                responseType: 'json',
                timeout: {
                    request: 60000
                },
                headers: {
                    Authorization: `Bearer ${this.#config.apiToken}`
                }
            }).json();

            if (response.success === false) {
                const cloudflareError = response.errors?.[0] || response.errors || {message: 'Cloudflare Email Service request failed.'};
                throw new errors.EmailError({
                    message: cloudflareError.message,
                    statusCode: 500,
                    context: cloudflareError.code ? `Cloudflare Error ${cloudflareError.code}` : 'Cloudflare Email Service error',
                    errorDetails: JSON.stringify({error: cloudflareError, messageData: payload}),
                    code: 'CLOUDFLARE_EMAIL_SEND_FAILED'
                });
            }

            metrics.metric('cloudflare-send-mail', {
                value: Date.now() - startTime,
                statusCode: 200
            });

            return response.result || response;
        } catch (err) {
            const statusCode = err.response?.statusCode || err.statusCode || 500;
            metrics.metric('cloudflare-send-mail', {
                value: Date.now() - startTime,
                statusCode
            });

            const cloudflareError = err.response?.body?.errors?.[0] || err.response?.body?.errors || err;
            throw new errors.EmailError({
                err,
                message: cloudflareError?.message || err.message || 'Cloudflare Email Service request failed.',
                statusCode,
                context: cloudflareError?.code ? `Cloudflare Error ${cloudflareError.code}` : 'Cloudflare Email Service error',
                errorDetails: JSON.stringify({
                    error: cloudflareError,
                    messageData: {
                        ...payload,
                        html: payload.html ? '[redacted]' : undefined,
                        text: payload.text ? '[redacted]' : undefined
                    }
                }),
                code: 'CLOUDFLARE_EMAIL_SEND_FAILED'
            });
        }
    }

    async queryGraphql({query, variables}) {
        if (!this.#config?.apiToken || !this.#config?.zoneId) {
            return null;
        }

        return await got.post(this.#config.graphqlUrl, {
            json: {query, variables},
            responseType: 'json',
            timeout: {
                request: 60000
            },
            headers: {
                Authorization: `Bearer ${this.#config.apiToken}`
            }
        }).json();
    }
}

CloudflareEmailClient.filterHeaders = filterHeaders;

module.exports = CloudflareEmailClient;
