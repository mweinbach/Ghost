const path = require('path');
const {URL} = require('url');

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DEFAULT_HOST_ARG = /.*/;

const getUrlHost = (configuredUrl) => {
    const parsedUrl = new URL(configuredUrl);
    return parsedUrl.host;
};

const getUrlHostname = (configuredUrl) => {
    const parsedUrl = new URL(configuredUrl);
    return parsedUrl.hostname;
};

const getHostInfo = (config) => {
    const frontendHost = getUrlHost(config.getSiteUrl());
    const frontendHostname = getUrlHostname(config.getSiteUrl());

    const backendHost = config.getAdminUrl() ? getUrlHost(config.getAdminUrl()) : '';
    const backendHostname = config.getAdminUrl() ? getUrlHostname(config.getAdminUrl()) : '';
    const hasSeparateBackendHost = backendHost && backendHost !== frontendHost;
    const hasSeparateBackendHostname = backendHostname && backendHostname !== frontendHostname;

    return {
        backendHost,
        backendHostname,
        hasSeparateBackendHost,
        hasSeparateBackendHostname
    };
};

/**
 *
 * @returns {string|RegExp}
 */
const getBackendMountPath = function getBackendMountPath() {
    const {backendHostname, hasSeparateBackendHost} = getHostInfo(this);

    // mw-vhost matches against hostname only. Full host+port filtering happens in the parent host gate.
    return (hasSeparateBackendHost) && backendHostname ? backendHostname : DEFAULT_HOST_ARG;
};

/**
 *
 * @returns {string|RegExp}
 */
const getFrontendMountPath = function getFrontendMountPath() {
    const {backendHostname, hasSeparateBackendHostname} = getHostInfo(this);

    // with a separate admin hostname we adjust the frontend vhost to exclude requests to that hostname.
    // If only the port differs, both apps must mount on the hostname and the parent host gate splits them by full Host.
    return (hasSeparateBackendHostname && backendHostname) ? new RegExp(`^(?!${escapeRegExp(backendHostname)}).*`) : DEFAULT_HOST_ARG;
};

/**
 * @callback isPrivacyDisabledFn
 * @param {string} privacyFlag - the flag to be looked up
 * @returns {boolean}
 */
const isPrivacyDisabled = function isPrivacyDisabled(privacyFlag) {
    if (!this.get('privacy')) {
        return false;
    }

    // CASE: disable all privacy features
    if (this.get('privacy').useTinfoil === true) {
        // CASE: you can still enable single features
        if (this.get('privacy')[privacyFlag] === true) {
            return false;
        }

        return true;
    }

    return this.get('privacy')[privacyFlag] === false;
};

/**
 * @callback getContentPathFn
 * @param {string} type - the type of context you want the path for
 * @returns {string}
 */
const getContentPath = function getContentPath(type) {
    switch (type) {
    case 'images':
        return path.join(this.get('paths:contentPath'), 'images/');
    case 'media':
        return path.join(this.get('paths:contentPath'), 'media/');
    case 'files':
        return path.join(this.get('paths:contentPath'), 'files/');
    case 'themes':
        return path.join(this.get('paths:contentPath'), 'themes/');
    case 'adapters':
        return path.join(this.get('paths:contentPath'), 'adapters/');
    case 'logs':
        return path.join(this.get('paths:contentPath'), 'logs/');
    case 'data':
        return path.join(this.get('paths:contentPath'), 'data/');
    case 'settings':
        return path.join(this.get('paths:contentPath'), 'settings/');
    case 'public':
        return path.join(this.get('paths:contentPath'), 'public/');
    default:
        // new Error is allowed here, as we do not want config to depend on @tryghost/error
        // @TODO: revisit this decision when @tryghost/error is no longer dependent on all of ghost-ignition
        // eslint-disable-next-line ghost/ghost-custom/no-native-error
        throw new Error('getContentPath was called with: ' + type);
    }
};

/**
 * @typedef ConfigHelpers
 * @property {isPrivacyDisabledFn} isPrivacyDisabled
 * @property {getContentPathFn} getContentPath
 */
module.exports.bindAll = (nconf) => {
    nconf.isPrivacyDisabled = isPrivacyDisabled.bind(nconf);
    nconf.getContentPath = getContentPath.bind(nconf);
    nconf.getBackendMountPath = getBackendMountPath.bind(nconf);
    nconf.getFrontendMountPath = getFrontendMountPath.bind(nconf);
};
