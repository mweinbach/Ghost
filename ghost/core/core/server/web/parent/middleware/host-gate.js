const config = require('../../../../shared/config');

function normalizeHost(host) {
    return typeof host === 'string' ? host.toLowerCase() : '';
}

function getUrlHost(configuredUrl) {
    if (!configuredUrl) {
        return '';
    }

    return normalizeHost(new URL(configuredUrl).host);
}

function getRequestedHost(req) {
    return normalizeHost(req.vhost ? req.vhost.host : req.get('host'));
}

function getBackendHost() {
    return getUrlHost(config.getAdminUrl());
}

function getFrontendHost() {
    return getUrlHost(config.getSiteUrl());
}

function hasSeparateBackendHost() {
    const backendHost = getBackendHost();
    return backendHost && backendHost !== getFrontendHost();
}

function shouldHandleBackend(req) {
    return !hasSeparateBackendHost() || getRequestedHost(req) === getBackendHost();
}

function shouldHandleFrontend(req) {
    return !hasSeparateBackendHost() || getRequestedHost(req) !== getBackendHost();
}

function backend(handle) {
    return function backendHostGate(req, res, next) {
        if (!shouldHandleBackend(req)) {
            return next();
        }

        return handle(req, res, next);
    };
}

function frontend(handle) {
    return function frontendHostGate(req, res, next) {
        if (!shouldHandleFrontend(req)) {
            return next();
        }

        return handle(req, res, next);
    };
}

module.exports = {
    backend,
    frontend,
    _private: {
        shouldHandleBackend,
        shouldHandleFrontend
    }
};
