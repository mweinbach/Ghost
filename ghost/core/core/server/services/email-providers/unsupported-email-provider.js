const errors = require('@tryghost/errors');

class UnsupportedEmailProvider {
    constructor({providerName}) {
        this.providerName = providerName;
    }

    async send() {
        throw new errors.EmailError({
            statusCode: 400,
            message: `The ${this.providerName} email provider is not implemented in this Ghost build.`,
            code: 'BULK_EMAIL_SEND_FAILED'
        });
    }

    getMaximumRecipients() {
        return 1;
    }

    getTargetDeliveryWindow() {
        return 0;
    }
}

module.exports = UnsupportedEmailProvider;
