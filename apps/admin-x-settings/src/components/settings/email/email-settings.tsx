import DefaultRecipients from './default-recipients';
import EnableNewsletters from './enable-newsletters';
import MailProvider from './mailgun';
import Newsletters from './newsletters';
import React from 'react';
import SearchableSection from '../../searchable-section';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {useGlobalData} from '../../providers/global-data-provider';

export const searchKeywords = {
    enableNewsletters: ['emails', 'newsletters', 'newsletter sending', 'enable', 'disable', 'turn on', 'turn off'],
    newsletters: ['newsletters', 'emails', 'design', 'customization'],
    defaultRecipients: ['newsletters', 'default recipients', 'emails'],
    mailProvider: ['mail provider', 'mailgun', 'resend', 'cloudflare', 'emails', 'newsletters']
};

const EmailSettings: React.FC = () => {
    const {settings} = useGlobalData();
    const [newslettersEnabled] = getSettingValues(settings, ['editor_default_email_recipients']) as [string];
    const hasNewslettersEnabled = newslettersEnabled !== 'disabled';
    const visibleSearchKeywords = [
        searchKeywords.enableNewsletters,
        ...(hasNewslettersEnabled ? [searchKeywords.defaultRecipients, searchKeywords.newsletters] : []),
        ...(hasNewslettersEnabled ? [searchKeywords.mailProvider] : [])
    ].flat();

    return (
        <SearchableSection keywords={visibleSearchKeywords} title='Newsletters'>
            <EnableNewsletters keywords={searchKeywords.enableNewsletters} />
            {hasNewslettersEnabled && (
                <>
                    <DefaultRecipients keywords={searchKeywords.defaultRecipients} />
                    <Newsletters keywords={searchKeywords.newsletters} />
                    <MailProvider keywords={searchKeywords.mailProvider} />
                </>
            )}
        </SearchableSection>
    );
};

export default EmailSettings;
