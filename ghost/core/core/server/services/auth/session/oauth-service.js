const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const security = require('@tryghost/security');
const {getConfig, isEnabled} = require('./oauth-config');

const SESSION_KEY = 'staff_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;
const ACCESS_DENIED_MESSAGE = 'Access Denied.';
const ACTIVE_USER_STATUSES = new Set(['active', 'warn-1', 'warn-2', 'warn-3', 'warn-4']);
const PROVISIONABLE_ROLES = new Set(['Administrator', 'Editor', 'Author', 'Contributor']);

function accessDenied(err) {
    return new errors.NoPermissionError({
        message: ACCESS_DENIED_MESSAGE,
        err
    });
}

function normalizeReturnTo(returnTo) {
    if (typeof returnTo !== 'string' || returnTo.length === 0) {
        return '/';
    }

    if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
        return '/';
    }

    if ([...returnTo].some((char) => {
        const charCode = char.charCodeAt(0);
        return charCode <= 31 || charCode === 127;
    })) {
        return '/';
    }

    if (returnTo.startsWith('/signin') || returnTo.startsWith('/signup') || returnTo.startsWith('/setup')) {
        return '/';
    }

    return returnTo;
}

function getUserId(user) {
    return user.id || user.get('id');
}

function isActiveUser(user) {
    if (!user) {
        return false;
    }

    return ACTIVE_USER_STATUSES.has(user.get('status'));
}

function getEmailVerified(claims, userInfo) {
    return claims.email_verified === true || userInfo.email_verified === true;
}

function getProfileFromClaims(claims = {}, userInfo = {}) {
    const subject = claims.sub || userInfo.sub;
    const email = claims.email || userInfo.email;
    const name = claims.name || userInfo.name || claims.preferred_username || userInfo.preferred_username;

    if (!subject || typeof subject !== 'string') {
        throw accessDenied();
    }

    if (!email || typeof email !== 'string') {
        throw accessDenied();
    }

    if (!getEmailVerified(claims, userInfo)) {
        throw accessDenied();
    }

    return {
        subject,
        email: email.toLowerCase(),
        name: typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0]
    };
}

function getClaimValue(source, claimName) {
    if (!source || !claimName) {
        return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(source, claimName)) {
        return source[claimName];
    }

    if (!claimName.includes('.')) {
        return undefined;
    }

    return claimName.split('.').reduce((value, key) => {
        if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) {
            return value[key];
        }
        return undefined;
    }, source);
}

function getProvisioningConfig(oauthConfig) {
    return oauthConfig.provisioning || {};
}

function isProvisioningEnabled(oauthConfig) {
    return getProvisioningConfig(oauthConfig).enabled === true;
}

function getProvisioningClaimValues(oauthConfig, claims, userInfo) {
    const provisioningConfig = getProvisioningConfig(oauthConfig);
    const roleClaim = provisioningConfig.roleClaim || 'role';
    const claimValue = getClaimValue(claims, roleClaim) ?? getClaimValue(userInfo, roleClaim);

    if (Array.isArray(claimValue)) {
        return claimValue.filter(value => typeof value === 'string');
    }

    if (typeof claimValue === 'string') {
        return [claimValue];
    }

    return [];
}

function validateProvisioningRole(roleName) {
    if (!PROVISIONABLE_ROLES.has(roleName)) {
        throw accessDenied();
    }

    return roleName;
}

function getProvisioningRole(oauthConfig, claims, userInfo) {
    const provisioningConfig = getProvisioningConfig(oauthConfig);
    const roleMap = provisioningConfig.roleMap || {};
    const claimValues = getProvisioningClaimValues(oauthConfig, claims, userInfo);

    for (const claimValue of claimValues) {
        const mappedRole = roleMap[claimValue];
        if (mappedRole) {
            return validateProvisioningRole(mappedRole);
        }
    }

    if (claimValues.length === 0 && provisioningConfig.defaultRole) {
        return validateProvisioningRole(provisioningConfig.defaultRole);
    }

    throw accessDenied();
}

function getSearchFromRequest(req) {
    const originalUrl = req.originalUrl || req.url || '';
    const queryIndex = originalUrl.indexOf('?');

    if (queryIndex !== -1) {
        return originalUrl.slice(queryIndex);
    }

    const params = new URLSearchParams(req.query || {});
    const search = params.toString();
    return search ? `?${search}` : '';
}

module.exports = function createStaffOAuthService({
    config,
    getSession,
    knex,
    models,
    urlUtils,
    importOpenIdClient = () => import('openid-client'),
    idGenerator = () => ObjectId().toHexString(),
    now = () => Date.now(),
    logger = logging
}) {
    let cachedClient;
    let cachedClientKey;

    function getOAuthConfig() {
        if (!isEnabled(config, logger)) {
            throw accessDenied();
        }

        return getConfig(config);
    }

    function getProvider(oauthConfig) {
        return new URL(oauthConfig.issuer).href;
    }

    function getScope(oauthConfig) {
        return oauthConfig.scope || 'openid email profile';
    }

    function getAdminUrl() {
        return new URL(urlUtils.urlFor('admin', true));
    }

    function getAdminOrigin() {
        return getAdminUrl().origin;
    }

    function getCallbackUrl() {
        return new URL('api/admin/session/oauth/callback', getAdminUrl()).href;
    }

    function getCurrentCallbackUrl(req) {
        const currentUrl = new URL(getCallbackUrl());
        currentUrl.search = getSearchFromRequest(req);
        return currentUrl;
    }

    function getSigninErrorUrl() {
        const adminUrl = getAdminUrl();
        adminUrl.hash = '/signin?oauthError=access-denied';
        return adminUrl.href;
    }

    function getSuccessUrl(returnTo) {
        const adminUrl = getAdminUrl();
        const safeReturnTo = normalizeReturnTo(returnTo);

        if (safeReturnTo === '/') {
            return adminUrl.href;
        }

        adminUrl.hash = safeReturnTo;
        return adminUrl.href;
    }

    async function getOpenIdClient(oauthConfig) {
        const client = await importOpenIdClient();
        const provider = getProvider(oauthConfig);
        const clientKey = JSON.stringify({
            provider,
            clientId: oauthConfig.clientId,
            clientSecret: oauthConfig.clientSecret
        });

        if (cachedClient && cachedClientKey === clientKey) {
            return {client, oidcConfig: cachedClient};
        }

        const oidcConfig = await client.discovery(
            new URL(provider),
            oauthConfig.clientId,
            oauthConfig.clientSecret
        );

        if (new URL(provider).protocol === 'http:' && config.get('env') !== 'production') {
            client.allowInsecureRequests(oidcConfig);
        }

        cachedClient = oidcConfig;
        cachedClientKey = clientKey;

        return {client, oidcConfig};
    }

    async function findActiveUserById(id) {
        try {
            const user = await models.User.findOne({id, status: 'all'});
            return isActiveUser(user) ? user : null;
        } catch (err) {
            return null;
        }
    }

    async function findUserByEmail(email) {
        try {
            return await models.User.getByEmail(email, {status: 'all'});
        } catch (err) {
            return null;
        }
    }

    async function findIdentity({provider, subject}) {
        return knex('oauth_identities')
            .where({provider, subject})
            .first();
    }

    async function findUserForIdentity({provider, subject}) {
        const identity = await findIdentity({provider, subject});

        if (!identity) {
            return null;
        }

        const user = await findActiveUserById(identity.user_id);

        if (!user) {
            throw accessDenied();
        }

        return user;
    }

    async function createIdentityLink({provider, subject, user, email}) {
        const createdAt = new Date();

        await knex('oauth_identities').insert({
            id: idGenerator(),
            provider,
            subject,
            user_id: getUserId(user),
            email,
            created_at: createdAt,
            updated_at: createdAt
        });
    }

    async function provisionUser({email, name, role}) {
        return models.User.add({
            email,
            name,
            password: security.identifier.uid(50),
            roles: [role]
        }, {
            context: {
                internal: true
            }
        });
    }

    async function findOrCreateUserLink({provider, subject, email, name, oauthConfig, claims, userInfo}) {
        const existingUser = await findUserForIdentity({provider, subject});
        if (existingUser) {
            return existingUser;
        }

        let user = await findUserByEmail(email);
        if (user && !isActiveUser(user)) {
            throw accessDenied();
        }

        if (!user) {
            if (!isProvisioningEnabled(oauthConfig)) {
                throw accessDenied();
            }

            user = await provisionUser({
                email,
                name,
                role: getProvisioningRole(oauthConfig, claims, userInfo)
            });
        }

        try {
            await createIdentityLink({provider, subject, user, email});
            return user;
        } catch (err) {
            const userAfterRace = await findUserForIdentity({provider, subject});
            if (userAfterRace) {
                return userAfterRace;
            }

            throw accessDenied(err);
        }
    }

    function shouldFetchUserInfo({tokens, claims, oauthConfig}) {
        if (!tokens.access_token || !claims.sub) {
            return false;
        }

        if (!claims.email || claims.email_verified !== true) {
            return true;
        }

        if (!isProvisioningEnabled(oauthConfig)) {
            return false;
        }

        const roleClaim = getProvisioningConfig(oauthConfig).roleClaim || 'role';
        return getClaimValue(claims, roleClaim) === undefined;
    }

    function getStoredState(session) {
        const storedState = session[SESSION_KEY];

        if (!storedState || !storedState.state || !storedState.nonce || !storedState.codeVerifier) {
            throw accessDenied();
        }

        if (now() - storedState.createdAt > STATE_TTL_MS) {
            throw accessDenied();
        }

        return storedState;
    }

    function clearStoredState(session) {
        delete session[SESSION_KEY];
    }

    async function start(req, res) {
        const oauthConfig = getOAuthConfig();
        const session = await getSession(req, res);
        const {client, oidcConfig} = await getOpenIdClient(oauthConfig);
        const codeVerifier = client.randomPKCECodeVerifier();
        const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
        const state = client.randomState();
        const nonce = client.randomNonce();
        const returnTo = normalizeReturnTo(req.query && req.query.returnTo);

        session[SESSION_KEY] = {
            state,
            nonce,
            codeVerifier,
            returnTo,
            createdAt: now()
        };

        return client.buildAuthorizationUrl(oidcConfig, {
            redirect_uri: getCallbackUrl(),
            scope: getScope(oauthConfig),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state,
            nonce
        }).href;
    }

    async function callback(req, res) {
        const oauthConfig = getOAuthConfig();
        const session = await getSession(req, res);
        const storedState = getStoredState(session);
        clearStoredState(session);

        const {client, oidcConfig} = await getOpenIdClient(oauthConfig);
        let tokens;
        let claims;
        let userInfo = {};

        try {
            tokens = await client.authorizationCodeGrant(oidcConfig, getCurrentCallbackUrl(req), {
                pkceCodeVerifier: storedState.codeVerifier,
                expectedState: storedState.state,
                expectedNonce: storedState.nonce
            });
            claims = typeof tokens.claims === 'function' ? (tokens.claims() || {}) : {};

            if (shouldFetchUserInfo({tokens, claims, oauthConfig})) {
                userInfo = await client.fetchUserInfo(oidcConfig, tokens.access_token, claims.sub);
            }
        } catch (err) {
            throw accessDenied(err);
        }

        const profile = getProfileFromClaims(claims, userInfo);
        const user = await findOrCreateUserLink({
            provider: getProvider(oauthConfig),
            subject: profile.subject,
            email: profile.email,
            name: profile.name,
            oauthConfig,
            claims,
            userInfo
        });

        if (!user) {
            throw accessDenied();
        }

        return {
            session,
            user,
            returnTo: storedState.returnTo || '/'
        };
    }

    return {
        start,
        callback,
        getAdminOrigin,
        getSigninErrorUrl,
        getSuccessUrl,
        normalizeReturnTo
    };
};

module.exports.ACCESS_DENIED_MESSAGE = ACCESS_DENIED_MESSAGE;
module.exports.SESSION_KEY = SESSION_KEY;
module.exports.STATE_TTL_MS = STATE_TTL_MS;
module.exports._private = {
    getProvisioningRole,
    getProfileFromClaims,
    normalizeReturnTo
};
