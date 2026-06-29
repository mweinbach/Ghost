const logging = require('@tryghost/logging');

const DEFAULT_PROVIDER_NAME = 'Single sign-on';
const REQUIRED_CONFIG_KEYS = ['issuer', 'clientId', 'clientSecret'];

let warnedAboutMissingConfig = false;

function getConfig(config) {
    return config.get('staffAuth:oauth') || {};
}

function getProviderName(oauthConfig) {
    return oauthConfig.providerName || DEFAULT_PROVIDER_NAME;
}

function getMissingConfigKeys(oauthConfig) {
    return REQUIRED_CONFIG_KEYS.filter((key) => {
        return !oauthConfig[key];
    });
}

function warnOnceAboutMissingConfig(missingKeys, logger = logging) {
    if (warnedAboutMissingConfig) {
        return;
    }

    warnedAboutMissingConfig = true;
    logger.warn(`Staff OAuth is enabled but missing required config: ${missingKeys.join(', ')}. Staff OAuth login will be disabled.`);
}

function isEnabled(config, logger = logging) {
    const oauthConfig = getConfig(config);

    if (oauthConfig.enabled !== true) {
        return false;
    }

    const missingKeys = getMissingConfigKeys(oauthConfig);
    if (missingKeys.length > 0) {
        warnOnceAboutMissingConfig(missingKeys, logger);
        return false;
    }

    return true;
}

function getPublicConfig(config, logger = logging) {
    const oauthConfig = getConfig(config);

    return {
        enabled: isEnabled(config, logger),
        providerName: getProviderName(oauthConfig)
    };
}

module.exports = {
    DEFAULT_PROVIDER_NAME,
    REQUIRED_CONFIG_KEYS,
    getConfig,
    getMissingConfigKeys,
    getProviderName,
    getPublicConfig,
    isEnabled,
    _resetWarningsForTest() {
        warnedAboutMissingConfig = false;
    }
};
