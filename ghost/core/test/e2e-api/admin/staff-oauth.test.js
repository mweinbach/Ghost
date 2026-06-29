const nock = require('nock');
const {agentProvider, fixtureManager, configUtils} = require('../../utils/e2e-framework');
const {restore} = require('../../utils/e2e-framework-mock-manager');

describe('Staff OAuth API', function () {
    let agent;

    beforeAll(async function () {
        agent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init();
    });

    afterEach(function () {
        restore();
    });

    function enableStaffOAuth() {
        configUtils.set('staffAuth:oauth', {
            enabled: true,
            providerName: 'Example IDP',
            issuer: 'https://idp.example.com',
            clientId: 'ghost-client',
            clientSecret: 'ghost-secret',
            scope: 'openid email profile'
        });
    }

    function mockDiscovery() {
        return nock('https://idp.example.com')
            .get('/.well-known/openid-configuration')
            .reply(200, {
                issuer: 'https://idp.example.com',
                authorization_endpoint: 'https://idp.example.com/oauth/authorize',
                token_endpoint: 'https://idp.example.com/oauth/token',
                userinfo_endpoint: 'https://idp.example.com/oauth/userinfo',
                jwks_uri: 'https://idp.example.com/.well-known/jwks.json'
            });
    }

    it('redirects to the configured OIDC provider from the start route', async function () {
        enableStaffOAuth();
        const discovery = mockDiscovery();

        await agent
            .get('session/oauth/start/?returnTo=%2Fanalytics')
            .expectStatus(302)
            .expectEmptyBody()
            .expectHeader('Location', /^https:\/\/idp\.example\.com\/oauth\/authorize\?/)
            .expectHeader('Location', /client_id=ghost-client/)
            .expectHeader('Location', /scope=openid\+email\+profile/)
            .expectHeader('Location', /code_challenge_method=S256/)
            .expectHeader('Location', /state=/)
            .expectHeader('Location', /nonce=/)
            .expectHeader('Set-Cookie', /ghost-admin-api-session=/);

        discovery.done();
    });

    it('redirects callback provider errors to a generic sign-in error', async function () {
        enableStaffOAuth();
        mockDiscovery();

        const startResponse = await agent
            .get('session/oauth/start/?returnTo=%2Fanalytics')
            .expectStatus(302);
        const authorizationUrl = new URL(startResponse.headers.location);
        const state = authorizationUrl.searchParams.get('state');

        await agent
            .get(`session/oauth/callback/?error=access_denied&state=${state}`)
            .expectStatus(302)
            .expectEmptyBody()
            .expectHeader('Location', /^http:\/\/127\.0\.0\.1:\d+\/ghost\/#\/signin\?oauthError=access-denied$/);
    });
});
