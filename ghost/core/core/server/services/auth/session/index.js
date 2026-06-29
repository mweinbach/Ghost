const adapterManager = require('../../adapter-manager');
const createSessionService = require('./session-service');
const createStaffOAuthService = require('./oauth-service');
const sessionFromToken = require('./session-from-token');
const createSessionMiddleware = require('./middleware');
const settingsCache = require('../../../../shared/settings-cache');
const {GhostMailer} = require('../../mail');
const {t} = require('../../i18n');
const logging = require('@tryghost/logging');

const expressSession = require('./express-session');

const models = require('../../../models');
const urlUtils = require('../../../../shared/url-utils');
const config = require('../../../../shared/config');
const {blogIcon} = require('../../../lib/image');
const url = require('url');

// TODO: We have too many lines here, should move functions out into a utils module

function getOriginOfRequest(req) {
    const getHeader = (name) => {
        if (req && typeof req.get === 'function') {
            return req.get(name);
        }

        const headers = req && req.headers ? req.headers : {};
        const normalizedName = name.toLowerCase();
        return headers[normalizedName];
    };

    const origin = getHeader('origin');
    const referrer = getHeader('referrer') || getHeader('referer') || urlUtils.getAdminUrl() || urlUtils.getSiteUrl();

    if (!origin && !referrer || origin === 'null') {
        return null;
    }

    if (origin) {
        return origin;
    }

    const {protocol, host} = url.parse(referrer);
    if (protocol && host) {
        return `${protocol}//${host}`;
    }
    return null;
}

const mailer = new GhostMailer();

const sessionService = createSessionService({
    getOriginOfRequest,
    getSession: expressSession.getSession,
    findUserById({id}) {
        return models.User.findOne({id, status: 'active'});
    },
    getSettingsCache(key) {
        return settingsCache.get(key);
    },
    isStaffDeviceVerificationDisabled() {
        // This config flag is set to true by default, so we need to check for false
        return config.get('security:staffDeviceVerification') !== true;
    },
    getBlogLogo() {
        return blogIcon.getIconUrl({absolute: true, fallbackToDefault: false})
            || 'https://static.ghost.org/v4.0.0/images/ghost-orb-1.png';
    },
    mailer,
    urlUtils,
    t
});

const staffOAuthService = createStaffOAuthService({
    config,
    getSession: expressSession.getSession,
    knex: models.Base.knex,
    models,
    urlUtils
});

module.exports = createSessionMiddleware({sessionService});

// Looks funky but this is a "custom" piece of middleware
module.exports.createSessionFromToken = () => {
    const ssoAdapter = adapterManager.getAdapter('sso');
    return sessionFromToken({
        callNextWithError: false,
        createSession: sessionService.createVerifiedSessionForUser,
        findUserByLookup: ssoAdapter.getUserForIdentity.bind(ssoAdapter),
        getLookupFromToken: ssoAdapter.getIdentityFromCredentials.bind(ssoAdapter),
        getTokenFromRequest: ssoAdapter.getRequestCredentials.bind(ssoAdapter)
    });
};

module.exports.initSession = async function initSession(req, res, next) {
    try {
        await expressSession.getSession(req, res);
        next();
    } catch (err) {
        next(err);
    }
};

module.exports.startOAuth = async function startOAuth(req, res) {
    try {
        const authorizationUrl = await staffOAuthService.start(req, res);
        res.redirect(302, authorizationUrl);
    } catch (err) {
        logging.warn(err);
        res.redirect(302, staffOAuthService.getSigninErrorUrl());
    }
};

module.exports.completeOAuth = async function completeOAuth(req, res) {
    try {
        const {
            session,
            user,
            returnTo
        } = await staffOAuthService.callback(req, res);

        await sessionService.assignVerifiedUserToSession({
            session,
            user,
            origin: staffOAuthService.getAdminOrigin(),
            userAgent: req.get('user-agent'),
            ip: req.ip
        });

        res.redirect(302, staffOAuthService.getSuccessUrl(returnTo));
    } catch (err) {
        logging.warn(err);
        res.redirect(302, staffOAuthService.getSigninErrorUrl());
    }
};

module.exports.getOriginOfRequest = getOriginOfRequest;
module.exports.sessionService = sessionService;
module.exports.staffOAuthService = staffOAuthService;
module.exports.deleteAllSessions = expressSession.deleteAllSessions;
