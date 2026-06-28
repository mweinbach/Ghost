const config = require('../../../shared/config');
const settingsCache = require('../../../shared/settings-cache');

const PROVIDER_NAMES = ['mailgun', 'resend', 'cloudflare'];

const PROVIDER_CAPABILITIES = {
    mailgun: {
        transactional: true,
        newsletters: true,
        deliveryEvents: true,
        suppressions: true,
        clickTracking: true,
        openTracking: true
    },
    resend: {
        transactional: false,
        newsletters: false,
        deliveryEvents: false,
        suppressions: false,
        clickTracking: false,
        openTracking: false
    },
    cloudflare: {
        transactional: true,
        newsletters: true,
        deliveryEvents: true,
        suppressions: false,
        clickTracking: true,
        openTracking: false
    }
};

function normalizeProviderName(providerName) {
    if (!providerName || typeof providerName !== 'string') {
        return null;
    }

    const normalized = providerName.toLowerCase();
    return PROVIDER_NAMES.includes(normalized) ? normalized : null;
}

function getSetting(settings, key) {
    return settings?.get?.(key);
}

function getConfigObject(configService, key) {
    const value = configService?.get?.(key);
    return value && typeof value === 'object' ? value : {};
}

function getMailgunConfig({config: configService = config, settings = settingsCache} = {}) {
    const bulkEmailConfig = getConfigObject(configService, 'bulkEmail');
    const settingConfig = {
        apiKey: getSetting(settings, 'mailgun_api_key'),
        domain: getSetting(settings, 'mailgun_domain'),
        baseUrl: getSetting(settings, 'mailgun_base_url')
    };

    return bulkEmailConfig.mailgun || settingConfig;
}

function isMailgunConfigured({config: configService = config, settings = settingsCache} = {}) {
    const mailgunConfig = getMailgunConfig({config: configService, settings});
    return !!(mailgunConfig?.apiKey && mailgunConfig?.domain && mailgunConfig?.baseUrl);
}

function getCloudflareConfig({config: configService = config, settings = settingsCache} = {}) {
    const bulkEmailConfig = getConfigObject(configService, 'bulkEmail');
    const mailConfig = getConfigObject(configService, 'mail');
    const cloudflareConfig = {
        ...(bulkEmailConfig.cloudflare || {}),
        ...(mailConfig.cloudflare || {})
    };

    return {
        accountId: cloudflareConfig.accountId || getSetting(settings, 'cloudflare_email_account_id'),
        zoneId: cloudflareConfig.zoneId || getSetting(settings, 'cloudflare_email_zone_id'),
        apiToken: cloudflareConfig.apiToken || getSetting(settings, 'cloudflare_email_api_token'),
        senderDomain: cloudflareConfig.senderDomain || getSetting(settings, 'cloudflare_email_sender_domain'),
        baseUrl: cloudflareConfig.baseUrl || 'https://api.cloudflare.com/client/v4',
        graphqlUrl: cloudflareConfig.graphqlUrl || 'https://api.cloudflare.com/client/v4/graphql',
        enableNewsletters: cloudflareConfig.enableNewsletters === true
    };
}

function isCloudflareConfigured({config: configService = config, settings = settingsCache} = {}) {
    const cloudflareConfig = getCloudflareConfig({config: configService, settings});
    return !!(cloudflareConfig.accountId && cloudflareConfig.apiToken && cloudflareConfig.senderDomain);
}

function getSelectedEmailProvider({settings = settingsCache} = {}) {
    return normalizeProviderName(getSetting(settings, 'email_provider')) || 'mailgun';
}

function getNewsletterProviderName({config: configService = config, settings = settingsCache} = {}) {
    const configuredProvider = normalizeProviderName(configService?.get?.('bulkEmail:provider'));
    if (configuredProvider) {
        return configuredProvider;
    }

    const selectedProvider = getSelectedEmailProvider({config: configService, settings});
    if (selectedProvider) {
        return selectedProvider;
    }

    return 'mailgun';
}

function getTransactionalProviderName({config: configService = config, settings = settingsCache} = {}) {
    const mailConfig = getConfigObject(configService, 'mail');
    const explicitProvider = normalizeProviderName(mailConfig.provider);
    if (explicitProvider) {
        return explicitProvider;
    }

    const transport = typeof mailConfig.transport === 'string' ? mailConfig.transport.toLowerCase() : 'direct';
    if (transport && transport !== 'direct') {
        return null;
    }

    const selectedProvider = getSelectedEmailProvider({config: configService, settings});
    if (selectedProvider === 'cloudflare' && isCloudflareConfigured({config: configService, settings})) {
        return selectedProvider;
    }

    return null;
}

function getProviderStatus({config: configService = config, settings = settingsCache} = {}) {
    const selected = getSelectedEmailProvider({config: configService, settings});
    const cloudflareConfig = getCloudflareConfig({config: configService, settings});
    const providers = {
        mailgun: {
            configured: isMailgunConfigured({config: configService, settings}),
            capabilities: PROVIDER_CAPABILITIES.mailgun
        },
        resend: {
            configured: false,
            capabilities: PROVIDER_CAPABILITIES.resend
        },
        cloudflare: {
            configured: isCloudflareConfigured({config: configService, settings}),
            missing: [
                !cloudflareConfig.accountId && 'cloudflare_email_account_id',
                !cloudflareConfig.zoneId && 'cloudflare_email_zone_id',
                !cloudflareConfig.apiToken && 'cloudflare_email_api_token',
                !cloudflareConfig.senderDomain && 'cloudflare_email_sender_domain'
            ].filter(Boolean),
            newslettersEnabled: cloudflareConfig.enableNewsletters,
            capabilities: PROVIDER_CAPABILITIES.cloudflare
        }
    };

    return {
        selected,
        configured: !!providers[selected]?.configured,
        providers
    };
}

module.exports = {
    PROVIDER_CAPABILITIES,
    getCloudflareConfig,
    getMailgunConfig,
    getNewsletterProviderName,
    getProviderStatus,
    getSelectedEmailProvider,
    getTransactionalProviderName,
    isCloudflareConfigured,
    isMailgunConfigured,
    normalizeProviderName
};
