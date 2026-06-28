const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');

class CloudflareEmailProvider {
    #client;
    #config;

    constructor({client, config}) {
        this.#client = client;
        this.#config = config;
    }

    #applyRecipientReplacements(content, recipient) {
        if (!content) {
            return content;
        }

        return recipient.replacements.reduce((result, replacement) => {
            return result.replace(replacement.token, replacement.value);
        }, content);
    }

    #createHeaders({recipient, emailId}) {
        const replacementData = recipient.replacements.reduce((acc, replacement) => {
            acc[replacement.id] = replacement.value;
            return acc;
        }, {});
        const headers = {
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'OOF, AutoReply',
            'X-Ghost-Email-ID': emailId
        };

        if (replacementData.list_unsubscribe) {
            headers['List-Unsubscribe'] = `<${replacementData.list_unsubscribe}>`;
            headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
        }

        return headers;
    }

    async send(data) {
        if (!this.#config.enableNewsletters) {
            throw new errors.EmailError({
                statusCode: 400,
                message: 'Cloudflare newsletter sending is not enabled. Set bulkEmail.cloudflare.enableNewsletters to true to send newsletters with Cloudflare Email Service.',
                context: 'Cloudflare Email Service is currently intended for transactional mail; newsletter sending is gated by config.',
                code: 'BULK_EMAIL_SEND_FAILED'
            });
        }

        if (data.recipients.length !== 1) {
            throw new errors.EmailError({
                statusCode: 400,
                message: 'Cloudflare newsletter sending supports one rendered recipient per request.',
                code: 'BULK_EMAIL_SEND_FAILED'
            });
        }

        const recipient = data.recipients[0];
        logging.info(`Sending email to 1 recipient via Cloudflare Email Service`);

        const response = await this.#client.send({
            to: recipient.email,
            from: data.from,
            replyTo: data.replyTo,
            subject: data.subject,
            html: this.#applyRecipientReplacements(data.html, recipient),
            text: this.#applyRecipientReplacements(data.plaintext, recipient),
            headers: this.#createHeaders({recipient, emailId: data.emailId})
        });

        return {
            id: response.message_id?.trim?.().replace(/^<|>$/g, '') || response.message_id,
            permanentBounces: (response.permanent_bounces || []).map(email => ({
                email,
                error: {
                    code: 607,
                    enhancedCode: 'cloudflare:permanent_bounce',
                    message: 'Cloudflare Email Service reported a permanent bounce'
                }
            }))
        };
    }

    getMaximumRecipients() {
        return 1;
    }

    getTargetDeliveryWindow() {
        return 0;
    }
}

module.exports = CloudflareEmailProvider;
