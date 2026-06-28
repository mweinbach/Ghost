import React from 'react';
import TopLevelGroup from '../../top-level-group';
import useSettingGroup from '../../../hooks/use-setting-group';
import {IconLabel, Link, Select, SettingGroupContent, TextField, withErrorBoundary} from '@tryghost/admin-x-design-system';
import {getSettingValues, useEditSettings} from '@tryghost/admin-x-framework/api/settings';
import {useGlobalData} from '../../providers/global-data-provider';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';

const MAILGUN_REGIONS = [
    {label: '🇺🇸 US', value: 'https://api.mailgun.net/v3'},
    {label: '🇪🇺 EU', value: 'https://api.eu.mailgun.net/v3'}
];

const MAIL_PROVIDER_OPTIONS = [
    {label: 'Mailgun', value: 'mailgun'},
    {label: 'Resend', value: 'resend'},
    {label: 'Cloudflare', value: 'cloudflare'}
];

const providerLabels: Record<string, string> = {
    mailgun: 'Mailgun',
    resend: 'Resend',
    cloudflare: 'Cloudflare'
};

const MailProvider: React.FC<{ keywords: string[] }> = ({keywords}) => {
    const {config} = useGlobalData();
    const {
        localSettings,
        isEditing,
        saveState,
        handleSave,
        handleCancel,
        updateSetting,
        handleEditingChange
    } = useSettingGroup();
    const {mutateAsync: editSettings} = useEditSettings();
    const handleError = useHandleError();

    const [
        emailProvider,
        mailgunRegion,
        mailgunDomain,
        mailgunApiKey,
        cloudflareAccountId,
        cloudflareZoneId,
        cloudflareApiToken,
        cloudflareSenderDomain
    ] = getSettingValues(localSettings, [
        'email_provider',
        'mailgun_base_url',
        'mailgun_domain',
        'mailgun_api_key',
        'cloudflare_email_account_id',
        'cloudflare_email_zone_id',
        'cloudflare_email_api_token',
        'cloudflare_email_sender_domain'
    ]) as string[];

    const selectedProvider = emailProvider || config.mailProviders?.selected || 'mailgun';
    const isMailgunSetup = mailgunDomain && mailgunApiKey;
    const isCloudflareSetup = cloudflareAccountId && cloudflareApiToken && cloudflareSenderDomain;
    const isProviderSetup = selectedProvider === 'cloudflare' ? isCloudflareSetup : selectedProvider === 'mailgun' ? isMailgunSetup : false;
    const cloudflareNewslettersEnabled = Boolean(config.mailProviders?.providers?.cloudflare?.newslettersEnabled);

    const data = isProviderSetup ? [
        {
            key: 'status',
            value: (
                <IconLabel icon='check-circle' iconColorClass='text-green'>
                    {providerLabels[selectedProvider]} is set up
                </IconLabel>
            )
        },
        {
            heading: 'Provider',
            key: 'provider',
            value: providerLabels[selectedProvider]
        },
        ...(selectedProvider === 'cloudflare' ? [{
            heading: 'Newsletters',
            key: 'newsletters',
            value: cloudflareNewslettersEnabled ? 'Enabled' : 'Requires server config'
        }, {
            heading: 'Open tracking',
            key: 'open-tracking',
            value: 'Not supported'
        }] : [])
    ] : [
        {
            heading: 'Provider',
            key: 'provider',
            value: providerLabels[selectedProvider]
        },
        {
            heading: 'Status',
            key: 'status',
            value: selectedProvider === 'resend' ? 'Resend is not available in this build' : `${providerLabels[selectedProvider]} is not set up`
        }
    ];

    const values = (
        <SettingGroupContent
            columns={1}
            values={data}
        />
    );

    const mailgunApiKeysHint = (
        <>Find your Mailgun API keys <Link href="https://app.mailgun.com/settings/api_security" rel="noopener noreferrer" target="_blank">here</Link></>
    );
    const cloudflareApiTokenHint = (
        <>Use a Cloudflare API token with Email Sending Edit and Analytics Read permissions.</>
    );

    let providerFields = null;
    if (selectedProvider === 'mailgun') {
        providerFields = (
            <div className='grid grid-cols-[120px_auto] gap-x-3 gap-y-6'>
                <Select
                    options={MAILGUN_REGIONS}
                    selectedOption={MAILGUN_REGIONS.find(option => option.value === mailgunRegion)}
                    title="Mailgun region"
                    onSelect={(option) => {
                        updateSetting('mailgun_base_url', option?.value || null);
                    }}
                />
                <TextField
                    title='Mailgun domain'
                    value={mailgunDomain || ''}
                    onChange={(e) => {
                        updateSetting('mailgun_domain', e.target.value);
                    }}
                />
                <div className='col-span-2'>
                    <TextField
                        hint={mailgunApiKeysHint}
                        title='Mailgun private API key'
                        type='password'
                        value={mailgunApiKey || ''}
                        onChange={(e) => {
                            updateSetting('mailgun_api_key', e.target.value);
                        }}
                    />
                </div>
            </div>
        );
    }

    if (selectedProvider === 'cloudflare') {
        providerFields = (
            <div className='grid grid-cols-1 gap-6'>
                <TextField
                    title='Cloudflare account ID'
                    value={cloudflareAccountId || ''}
                    onChange={(e) => {
                        updateSetting('cloudflare_email_account_id', e.target.value);
                    }}
                />
                <TextField
                    title='Cloudflare zone ID'
                    value={cloudflareZoneId || ''}
                    onChange={(e) => {
                        updateSetting('cloudflare_email_zone_id', e.target.value);
                    }}
                />
                <TextField
                    hint={cloudflareApiTokenHint}
                    title='Cloudflare API token'
                    type='password'
                    value={cloudflareApiToken || ''}
                    onChange={(e) => {
                        updateSetting('cloudflare_email_api_token', e.target.value);
                    }}
                />
                <TextField
                    title='Cloudflare sender domain'
                    value={cloudflareSenderDomain || ''}
                    onChange={(e) => {
                        updateSetting('cloudflare_email_sender_domain', e.target.value);
                    }}
                />
            </div>
        );
    }

    if (selectedProvider === 'resend') {
        providerFields = (
            <SettingGroupContent
                columns={1}
                values={[{
                    key: 'resend',
                    value: 'Resend support is not available in this checkout yet.'
                }]}
            />
        );
    }

    const inputs = (
        <SettingGroupContent columns={1}>
            <div className='grid grid-cols-1 gap-6'>
                <Select
                    options={MAIL_PROVIDER_OPTIONS}
                    selectedOption={MAIL_PROVIDER_OPTIONS.find(option => option.value === selectedProvider)}
                    title="Provider"
                    onSelect={(option) => {
                        updateSetting('email_provider', option?.value || 'mailgun');
                    }}
                />
                {providerFields}
            </div>
        </SettingGroupContent>
    );

    const groupDescription = (
        <>Choose the provider Ghost uses for email sending. Cloudflare newsletter sending requires server config because Cloudflare currently positions Email Service for transactional mail.</>
    );

    return (
        <TopLevelGroup
            description={groupDescription}
            isEditing={isEditing}
            keywords={keywords}
            navid='mailgun'
            saveState={saveState}
            testId='mailgun'
            title='Mail provider'
            onCancel={handleCancel}
            onEditingChange={handleEditingChange}
            onSave={async () => {
                // this is a special case where we need to set the region to the default if it's not set,
                // since when the Mailgun Region is not changed, the value doesn't get set in the updateSetting
                // resulting in the mailgun base url remaining null
                // this should not fire if the user has changed the region or if the region is already set
                if (selectedProvider === 'mailgun' && !mailgunRegion) {
                    try {
                        await editSettings([{key: 'mailgun_base_url', value: MAILGUN_REGIONS[0].value}]);
                    } catch (e) {
                        handleError(e);
                        return;
                    }
                }
                handleSave();
            }}
        >
            {isEditing ? inputs : values}
        </TopLevelGroup>
    );
};

export default withErrorBoundary(MailProvider, 'Mail provider');
