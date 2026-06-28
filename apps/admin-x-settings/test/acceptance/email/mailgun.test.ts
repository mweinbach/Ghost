import {expect, test} from '@playwright/test';
import {globalDataRequests, mockApi, updatedSettingsResponse} from '@tryghost/admin-x-framework/test/acceptance';

test.describe('Mail provider settings', async () => {
    test('Supports setting up Mailgun', async ({page}) => {
        const {lastApiRequests} = await mockApi({page, requests: {
            ...globalDataRequests,
            editSettings: {method: 'PUT', path: '/settings/', response: updatedSettingsResponse([
                {key: 'email_provider', value: 'mailgun'},
                {key: 'mailgun_domain', value: 'test.com'},
                {key: 'mailgun_api_key', value: 'test'}
            ])}
        }});

        await page.goto('/');

        const section = page.getByTestId('mailgun');

        await expect(section.getByText('Mail provider')).toHaveCount(1);
        await expect(section.getByText('Mailgun is not set up')).toHaveCount(1);

        await section.getByRole('button', {name: 'Edit'}).click();

        await section.getByLabel('Mailgun domain').fill('test.com');
        await section.getByLabel('Mailgun private API key').fill('test');

        await section.getByRole('button', {name: 'Save'}).click();

        await expect(section.getByLabel('Mailgun domain')).toHaveCount(0);

        await expect(section.getByText('Mailgun is set up')).toHaveCount(1);

        expect(lastApiRequests.editSettings?.body).toEqual({
            settings: [
                {key: 'mailgun_domain', value: 'test.com'},
                {key: 'mailgun_api_key', value: 'test'}
            ]
        });
    });

    test('Supports setting up Cloudflare', async ({page}) => {
        const {lastApiRequests} = await mockApi({page, requests: {
            ...globalDataRequests,
            editSettings: {method: 'PUT', path: '/settings/', response: updatedSettingsResponse([
                {key: 'email_provider', value: 'cloudflare'},
                {key: 'cloudflare_email_account_id', value: 'account'},
                {key: 'cloudflare_email_zone_id', value: 'zone'},
                {key: 'cloudflare_email_api_token', value: 'token'},
                {key: 'cloudflare_email_sender_domain', value: 'example.com'}
            ])}
        }});

        await page.goto('/');

        const section = page.getByTestId('mailgun');

        await section.getByRole('button', {name: 'Edit'}).click();
        await section.getByLabel('Provider').click();
        await page.getByText('Cloudflare').click();
        await section.getByLabel('Cloudflare account ID').fill('account');
        await section.getByLabel('Cloudflare zone ID').fill('zone');
        await section.getByLabel('Cloudflare API token').fill('token');
        await section.getByLabel('Cloudflare sender domain').fill('example.com');

        await section.getByRole('button', {name: 'Save'}).click();

        expect(lastApiRequests.editSettings?.body).toEqual({
            settings: [
                {key: 'email_provider', value: 'cloudflare'},
                {key: 'cloudflare_email_account_id', value: 'account'},
                {key: 'cloudflare_email_zone_id', value: 'zone'},
                {key: 'cloudflare_email_api_token', value: 'token'},
                {key: 'cloudflare_email_sender_domain', value: 'example.com'}
            ]
        });
    });
});
