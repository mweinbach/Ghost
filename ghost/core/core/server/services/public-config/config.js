const {isPlainObject} = require('lodash');
const config = require('../../../shared/config');
const settingsCache = require('../../../shared/settings-cache');
const labs = require('../../../shared/labs');
const databaseInfo = require('../../data/db/info');
const ghostVersion = require('@tryghost/version');
const {providerStatus} = require('../email-providers');

const tinybirdStatsPayloadProperties = [
    'endpoint',
    'endpointBrowser',
    'version',
    'datasource'
];

const tinybirdLocalStatsPayloadProperties = [
    'enabled',
    'endpoint',
    'datasource'
];

const copyPayloadProperties = (target, source, properties) => {
    for (const property of properties) {
        if (Object.prototype.hasOwnProperty.call(source, property)) {
            target[property] = source[property];
        }
    }
};

const getTinybirdStatsPayload = (statsConfig, siteUuid) => {
    const statsPayload = {};

    copyPayloadProperties(statsPayload, statsConfig, tinybirdStatsPayloadProperties);

    statsPayload.id = siteUuid;

    if (isPlainObject(statsConfig.local)) {
        const localStatsPayload = {};
        copyPayloadProperties(localStatsPayload, statsConfig.local, tinybirdLocalStatsPayloadProperties);

        if (Object.keys(localStatsPayload).length > 0) {
            statsPayload.local = localStatsPayload;
        }
    }

    return statsPayload;
};

function getHeadlessConfig() {
    const adminUrl = new URL(config.getAdminUrl() || config.getSiteUrl());
    const adminPathname = adminUrl.pathname.replace(/\/$/, '').endsWith('/ghost')
        ? `${adminUrl.pathname.replace(/\/$/, '')}/`
        : `${adminUrl.pathname.replace(/\/$/, '')}/ghost/`;
    const adminBaseUrl = new URL(adminPathname, adminUrl.origin);

    return {
        enabled: config.get('headless:enabled') === true,
        frontendUrl: config.get('url'),
        contentApiUrl: new URL('api/content/', adminBaseUrl).href,
        previewUrlTemplate: config.get('headless:previewUrlTemplate') || null
    };
}

module.exports = function getConfigProperties() {
    const mailProviders = providerStatus.getProviderStatus({config, settings: settingsCache});
    const configProperties = {
        version: process.env.GHOST_BUILD_VERSION || ghostVersion.original,
        environment: config.get('env'),
        database: databaseInfo.getEngine(),
        mail: isPlainObject(config.get('mail')) ? config.get('mail').transport : '',
        useGravatar: !config.isPrivacyDisabled('useGravatar'),
        labs: labs.getAll(),
        clientExtensions: config.get('clientExtensions') || {},
        enableDeveloperExperiments: config.get('enableDeveloperExperiments') || false,
        stripeDirect: config.get('stripeDirect'),
        mailgunIsConfigured: !!(config.get('bulkEmail') && config.get('bulkEmail').mailgun),
        mailProviderConfigured: mailProviders.configured,
        mailProviders,
        emailAnalytics: config.get('emailAnalytics:enabled'),
        hostSettings: config.get('hostSettings'),
        tenor: config.get('tenor'),
        klipy: config.get('klipy'),
        pintura: config.get('pintura'),
        signupForm: config.get('signupForm'),
        security: config.get('security'),
        headless: getHeadlessConfig()
    };

    if (config.get('explore') && config.get('explore:testimonials_url')) {
        configProperties.exploreTestimonialsUrl = config.get('explore:testimonials_url');
    }

    if (config.get('tinybird') && config.get('tinybird:stats')) {
        const statsConfig = config.get('tinybird:stats');
        const siteUuid = statsConfig.id || settingsCache.get('site_uuid');
        configProperties.stats = getTinybirdStatsPayload(statsConfig, siteUuid);
    }

    if (labs.isSet('featurebaseFeedback') && config.get('featurebase')) {
        // Expose only the public featurebase config properties
        configProperties.featurebase = {
            enabled: config.get('featurebase:enabled'),
            organization: config.get('featurebase:organization')
        };
    }

    return configProperties;
};
