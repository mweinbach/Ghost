const {addSetting, combineTransactionalMigrations} = require('../../utils');

module.exports = combineTransactionalMigrations(
    addSetting({
        key: 'email_provider',
        value: 'mailgun',
        type: 'string',
        group: 'email'
    }),
    addSetting({
        key: 'cloudflare_email_account_id',
        value: null,
        type: 'string',
        group: 'email'
    }),
    addSetting({
        key: 'cloudflare_email_zone_id',
        value: null,
        type: 'string',
        group: 'email'
    }),
    addSetting({
        key: 'cloudflare_email_api_token',
        value: null,
        type: 'string',
        group: 'email'
    }),
    addSetting({
        key: 'cloudflare_email_sender_domain',
        value: null,
        type: 'string',
        group: 'email'
    })
);
