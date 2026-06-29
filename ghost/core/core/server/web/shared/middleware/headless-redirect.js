const url = require('url');
const config = require('../../../../shared/config');
const urlUtils = require('../../../../shared/url-utils');

const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);
const PRESERVED_PATH_PREFIXES = [
    '/assets/',
    '/content/',
    '/ghost/',
    '/members/',
    '/public/'
];
const PRESERVED_EXACT_PATHS = new Set([
    '/assets',
    '/content',
    '/favicon.ico',
    '/ghost',
    '/members',
    '/public',
    '/sitemap.xsl'
]);

function isEnabled() {
    return config.get('headless:enabled') === true;
}

function getRedirectStatus() {
    const redirectStatus = Number(config.get('headless:redirectStatus'));
    return REDIRECT_STATUSES.has(redirectStatus) ? redirectStatus : 302;
}

function getFrontendUrl() {
    return new URL(urlUtils.urlFor('home', true));
}

function getRequestedHost(req) {
    return req.vhost ? req.vhost.host : req.get('host');
}

function isSameOriginRequest(req, frontendUrl) {
    return getRequestedHost(req) === frontendUrl.host && (frontendUrl.protocol !== 'https:' || req.secure);
}

function shouldPreservePath(pathname) {
    if (PRESERVED_EXACT_PATHS.has(pathname)) {
        return true;
    }

    return PRESERVED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getRedirectUrl(req) {
    if (!isEnabled()) {
        return null;
    }

    const parsedRequestUrl = url.parse(req.originalUrl || req.url);
    const pathname = parsedRequestUrl.pathname || '/';
    if (shouldPreservePath(pathname)) {
        return null;
    }

    const frontendUrl = getFrontendUrl();
    if (isSameOriginRequest(req, frontendUrl)) {
        return false;
    }

    const redirectUrl = new URL(frontendUrl.href);
    redirectUrl.pathname = urlUtils.urlJoin(frontendUrl.pathname, pathname);
    redirectUrl.search = parsedRequestUrl.search || '';
    return redirectUrl.href;
}

function headlessRedirect(req, res, next) {
    const redirectUrl = getRedirectUrl(req);
    if (!redirectUrl) {
        if (redirectUrl === false) {
            return res.sendStatus(404);
        }

        return next();
    }

    return res.redirect(getRedirectStatus(), redirectUrl);
}

module.exports = headlessRedirect;
module.exports._private = {
    getRedirectStatus,
    getRedirectUrl,
    shouldPreservePath
};
