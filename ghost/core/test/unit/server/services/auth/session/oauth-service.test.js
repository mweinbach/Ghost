const assert = require('node:assert/strict');
const sinon = require('sinon');
const createStaffOAuthService = require('../../../../../../core/server/services/auth/session/oauth-service');
const {SESSION_KEY} = createStaffOAuthService;

describe('Staff OAuth Service', function () {
    let config;
    let identities;
    let session;
    let users;
    let client;
    let service;
    let oidcConfig;

    function createUser(attrs) {
        return {
            id: attrs.id,
            get(key) {
                return attrs[key];
            }
        };
    }

    function createKnex() {
        return function knex(tableName) {
            assert.equal(tableName, 'oauth_identities');

            return {
                where(criteria) {
                    return {
                        async first() {
                            return identities.find((identity) => {
                                return Object.entries(criteria).every(([key, value]) => identity[key] === value);
                            });
                        }
                    };
                },
                async insert(row) {
                    const duplicate = identities.find((identity) => {
                        return identity.provider === row.provider
                            && (identity.subject === row.subject || identity.user_id === row.user_id);
                    });

                    if (duplicate) {
                        throw new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed');
                    }

                    identities.push(row);
                }
            };
        };
    }

    function createService({claims, userInfo = {}, authorizationError} = {}) {
        oidcConfig = {};
        client = {
            discovery: sinon.stub().resolves(oidcConfig),
            allowInsecureRequests: sinon.spy(),
            randomPKCECodeVerifier: sinon.stub().returns('code-verifier'),
            calculatePKCECodeChallenge: sinon.stub().resolves('code-challenge'),
            randomState: sinon.stub().returns('state-value'),
            randomNonce: sinon.stub().returns('nonce-value'),
            buildAuthorizationUrl: sinon.spy((configArg, params) => {
                const authorizationUrl = new URL('https://idp.example.com/oauth/authorize');
                authorizationUrl.searchParams.set('client_id', 'ghost-client');
                authorizationUrl.searchParams.set('response_type', 'code');

                Object.entries(params).forEach(([key, value]) => {
                    authorizationUrl.searchParams.set(key, value);
                });

                return authorizationUrl;
            }),
            authorizationCodeGrant: authorizationError
                ? sinon.stub().rejects(authorizationError)
                : sinon.stub().resolves({
                    access_token: 'access-token',
                    claims: () => claims || {
                        sub: 'subject-1',
                        email: 'OWNER@EXAMPLE.COM',
                        email_verified: true
                    }
                }),
            fetchUserInfo: sinon.stub().resolves(userInfo)
        };

        service = createStaffOAuthService({
            config,
            getSession: async () => session,
            knex: createKnex(),
            models: {
                User: {
                    async findOne({id}) {
                        return users.find(user => user.get('id') === id);
                    },
                    async getByEmail(email) {
                        return users.find(user => user.get('email').toLowerCase() === email.toLowerCase());
                    }
                }
            },
            urlUtils: {
                urlFor: sinon.stub().withArgs('admin', true).returns('https://ghost.example.com/ghost/')
            },
            importOpenIdClient: async () => client,
            idGenerator: () => 'identity-id',
            now: () => 1000,
            logger: {
                warn: sinon.spy()
            }
        });

        return service;
    }

    function createCallbackRequest(query = 'code=abc&state=state-value') {
        return {
            originalUrl: `/ghost/api/admin/session/oauth/callback?${query}`,
            query: {},
            get: sinon.stub().returns('Mozilla/5.0'),
            ip: '127.0.0.1'
        };
    }

    beforeEach(function () {
        identities = [];
        session = {};
        users = [
            createUser({
                id: 'user-1',
                email: 'owner@example.com',
                status: 'active'
            })
        ];

        config = {
            get: sinon.stub()
        };
        config.get.withArgs('staffAuth:oauth').returns({
            enabled: true,
            providerName: 'Example IDP',
            issuer: 'https://idp.example.com',
            clientId: 'ghost-client',
            clientSecret: 'ghost-secret',
            scope: 'openid email profile'
        });
        config.get.withArgs('env').returns('development');
    });

    it('generates an OIDC authorization URL and stores state in the session', async function () {
        createService();

        const authorizationUrl = await service.start({
            query: {
                returnTo: '/posts'
            }
        }, {});
        const parsedUrl = new URL(authorizationUrl);

        assert.equal(parsedUrl.origin, 'https://idp.example.com');
        assert.equal(parsedUrl.searchParams.get('redirect_uri'), 'https://ghost.example.com/ghost/api/admin/session/oauth/callback');
        assert.equal(parsedUrl.searchParams.get('scope'), 'openid email profile');
        assert.equal(parsedUrl.searchParams.get('code_challenge'), 'code-challenge');
        assert.equal(parsedUrl.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(parsedUrl.searchParams.get('state'), 'state-value');
        assert.equal(parsedUrl.searchParams.get('nonce'), 'nonce-value');

        assert.deepEqual(session[SESSION_KEY], {
            state: 'state-value',
            nonce: 'nonce-value',
            codeVerifier: 'code-verifier',
            returnTo: '/posts',
            createdAt: 1000
        });
    });

    it('returns an existing active user for a linked provider subject', async function () {
        identities.push({
            provider: 'https://idp.example.com/',
            subject: 'subject-1',
            user_id: 'user-1',
            email: 'owner@example.com'
        });
        session[SESSION_KEY] = {
            state: 'state-value',
            nonce: 'nonce-value',
            codeVerifier: 'code-verifier',
            returnTo: '/analytics',
            createdAt: 1000
        };
        createService();

        const result = await service.callback(createCallbackRequest(), {});

        assert.equal(result.user.id, 'user-1');
        assert.equal(result.returnTo, '/analytics');
        assert.equal(session[SESSION_KEY], undefined);
        sinon.assert.calledWith(client.authorizationCodeGrant, oidcConfig, sinon.match.instanceOf(URL), {
            pkceCodeVerifier: 'code-verifier',
            expectedState: 'state-value',
            expectedNonce: 'nonce-value'
        });
    });

    it('creates a first-time identity link when the verified IdP email matches an active user', async function () {
        session[SESSION_KEY] = {
            state: 'state-value',
            nonce: 'nonce-value',
            codeVerifier: 'code-verifier',
            returnTo: '/editor/post',
            createdAt: 1000
        };
        createService();

        const result = await service.callback(createCallbackRequest(), {});

        assert.equal(result.user.id, 'user-1');
        assert.equal(identities.length, 1);
        assert.equal(identities[0].provider, 'https://idp.example.com/');
        assert.equal(identities[0].subject, 'subject-1');
        assert.equal(identities[0].user_id, 'user-1');
        assert.equal(identities[0].email, 'owner@example.com');
    });

    it('uses verified UserInfo email claims when the ID token does not include an email', async function () {
        session[SESSION_KEY] = {
            state: 'state-value',
            nonce: 'nonce-value',
            codeVerifier: 'code-verifier',
            returnTo: '/',
            createdAt: 1000
        };
        createService({
            claims: {
                sub: 'subject-1'
            },
            userInfo: {
                sub: 'subject-1',
                email: 'owner@example.com',
                email_verified: true
            }
        });

        const result = await service.callback(createCallbackRequest(), {});

        assert.equal(result.user.id, 'user-1');
        sinon.assert.calledWith(client.fetchUserInfo, oidcConfig, 'access-token', 'subject-1');
    });

    it('rejects missing or unverified email claims', async function () {
        session[SESSION_KEY] = {
            state: 'state-value',
            nonce: 'nonce-value',
            codeVerifier: 'code-verifier',
            returnTo: '/',
            createdAt: 1000
        };
        createService({
            claims: {
                sub: 'subject-1',
                email: 'owner@example.com',
                email_verified: false
            }
        });

        await assert.rejects(
            service.callback(createCallbackRequest(), {}),
            {message: 'Access Denied.'}
        );
        assert.equal(identities.length, 0);
    });

    it('rejects an existing identity when the linked Ghost user is inactive', async function () {
        users = [
            createUser({
                id: 'user-1',
                email: 'owner@example.com',
                status: 'locked'
            })
        ];
        identities.push({
            provider: 'https://idp.example.com/',
            subject: 'subject-1',
            user_id: 'user-1',
            email: 'owner@example.com'
        });
        session[SESSION_KEY] = {
            state: 'state-value',
            nonce: 'nonce-value',
            codeVerifier: 'code-verifier',
            returnTo: '/',
            createdAt: 1000
        };
        createService();

        await assert.rejects(
            service.callback(createCallbackRequest(), {}),
            {message: 'Access Denied.'}
        );
    });

    it('rejects bad state or nonce responses from the provider', async function () {
        session[SESSION_KEY] = {
            state: 'state-value',
            nonce: 'nonce-value',
            codeVerifier: 'code-verifier',
            returnTo: '/',
            createdAt: 1000
        };
        createService({
            authorizationError: new Error('unexpected state')
        });

        await assert.rejects(
            service.callback(createCallbackRequest('code=abc&state=wrong'), {}),
            {message: 'Access Denied.'}
        );
    });

    it('rejects expired authorization state', async function () {
        session[SESSION_KEY] = {
            state: 'state-value',
            nonce: 'nonce-value',
            codeVerifier: 'code-verifier',
            returnTo: '/',
            createdAt: -600001
        };
        createService();

        await assert.rejects(
            service.callback(createCallbackRequest(), {}),
            {message: 'Access Denied.'}
        );
        sinon.assert.notCalled(client.authorizationCodeGrant);
    });
});
