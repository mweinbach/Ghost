import {type Integration, type IntegrationsResponseType} from '@tryghost/admin-x-framework/api/integrations';
import {expect, test} from '@playwright/test';
import {globalDataRequests, mockApi, responseFixtures} from '@tryghost/admin-x-framework/test/acceptance';

test.describe('Custom frontend integration settings', async () => {
    test('shows headless setup details from config and the Content API integration', async ({page}) => {
        const contentIntegration = {
            id: 'content-id',
            type: 'core',
            slug: 'ghost-core-content',
            name: 'Ghost Core Content API',
            icon_image: null,
            description: 'Internal Content API integration for Admin access',
            created_at: '2023-01-01T00:00:00.000Z',
            updated_at: '2023-01-01T00:00:00.000Z',
            api_keys: [{
                id: 'content-key-id',
                type: 'content',
                secret: 'content-api-secret',
                role_id: 'role-id',
                integration_id: 'content-id',
                user_id: null,
                last_seen_at: null,
                last_seen_version: null,
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z'
            }],
            webhooks: []
        } satisfies Integration;

        await mockApi({
            page,
            requests: {
                ...globalDataRequests,
                browseConfig: {
                    ...globalDataRequests.browseConfig,
                    response: {
                        config: {
                            ...responseFixtures.config.config,
                            headless: {
                                enabled: true,
                                frontendUrl: 'https://frontend.example.com/',
                                contentApiUrl: 'https://ghost.example.com/ghost/api/content/',
                                previewUrlTemplate: null
                            }
                        }
                    }
                },
                browseSite: {
                    ...globalDataRequests.browseSite,
                    response: {
                        site: {
                            ...responseFixtures.site.site,
                            url: 'https://frontend.example.com/',
                            headless: {
                                enabled: true,
                                frontendUrl: 'https://frontend.example.com/',
                                contentApiUrl: 'https://ghost.example.com/ghost/api/content/'
                            }
                        }
                    }
                },
                browseIntegrations: {
                    method: 'GET',
                    path: '/integrations/?include=api_keys%2Cwebhooks&limit=50',
                    response: {
                        integrations: [contentIntegration]
                    } satisfies IntegrationsResponseType
                }
            }
        });

        await page.goto('/');

        const integrationsSection = page.getByTestId('integrations');
        const customFrontendIntegration = integrationsSection.getByTestId('custom-frontend-integration');

        await expect(customFrontendIntegration).toHaveText(/Custom frontend/);
        await expect(customFrontendIntegration).toHaveText(/Active/);

        await customFrontendIntegration.hover();
        await customFrontendIntegration.getByRole('button', {name: 'Configure'}).click();

        const modal = page.getByTestId('custom-frontend-modal');

        await expect(modal).toHaveText(/Headless enabled/);
        await expect(modal).toHaveText(/https:\/\/frontend\.example\.com\//);
        await expect(modal).toHaveText(/https:\/\/ghost\.example\.com\/ghost\/api\/content\//);
        await expect(modal).toHaveText(/content-api-secret/);
        await expect(modal).toHaveText(/NEXT_PUBLIC_GHOST_CONTENT_API_URL=https:\/\/ghost\.example\.com\/ghost\/api\/content\//);
        await expect(modal).toHaveText(/NEXT_PUBLIC_GHOST_CONTENT_API_KEY=content-api-secret/);
        await expect(modal).toHaveText(/Post published, Post updated, Post unpublished, Post deleted/);
        await expect(modal).toHaveText(/\/content\/images\/\*/);
    });
});
