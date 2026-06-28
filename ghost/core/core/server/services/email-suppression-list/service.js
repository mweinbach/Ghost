const models = require('../../models');
const configService = require('../../../shared/config');
const settingsCache = require('../../../shared/settings-cache');
const labs = require('../../../shared/labs');
const MailgunClient = require('../lib/mailgun-client');
const MailgunEmailSuppressionList = require('./mailgun-email-suppression-list');
const {providerStatus} = require('../email-providers');

const mailgunClient = new MailgunClient({
    config: configService,
    settings: settingsCache,
    labs
});

const getApiClient = () => {
    const selectedProvider = providerStatus.getSelectedEmailProvider({
        settings: settingsCache
    });

    return selectedProvider === 'cloudflare' ? null : mailgunClient;
};

const apiClient = {
    removeBounce(email) {
        return getApiClient()?.removeBounce(email);
    },
    removeComplaint(email) {
        return getApiClient()?.removeComplaint(email);
    },
    removeUnsubscribe(email) {
        return getApiClient()?.removeUnsubscribe(email);
    }
};

module.exports = new MailgunEmailSuppressionList({
    Suppression: models.Suppression,
    apiClient
});
