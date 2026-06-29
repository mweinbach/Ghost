import APIKeys from './api-keys';
import IntegrationHeader from './integration-header';
import NiceModal from '@ebay/nice-modal-react';
import {Button, Icon, Modal} from '@tryghost/admin-x-design-system';
import {getGhostPaths} from '@tryghost/admin-x-framework/helpers';
import {useBrowseIntegrations} from '@tryghost/admin-x-framework/api/integrations';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useState} from 'react';

const fallbackContentApiUrl = () => {
    const subdir = getGhostPaths().subdir.replace(/\/$/, '');
    return `${window.location.origin}${subdir}/ghost/api/content/`;
};

const CopyableBlock = ({label, value}: {label: string; value: string}) => {
    const [copied, setCopied] = useState(false);

    const copyValue = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className='mb-5'>
            <div className='mb-2 flex items-center justify-between gap-3'>
                <h4 className='text-sm font-semibold'>{label}</h4>
                <Button color='outline' label={copied ? 'Copied' : 'Copy'} size='sm' onClick={copyValue} />
            </div>
            <pre className='overflow-x-auto rounded bg-grey-100 p-4 text-sm leading-6 text-grey-900 dark:bg-grey-950 dark:text-grey-100'><code>{value}</code></pre>
        </div>
    );
};

const CustomFrontendModal = NiceModal.create(() => {
    const modal = NiceModal.useModal();
    const {updateRoute} = useRouting();
    const {config, siteData} = useGlobalData();
    const {data: {integrations} = {integrations: []}} = useBrowseIntegrations();

    const integration = integrations.find(({slug}) => slug === 'ghost-core-content');
    const contentApiKey = integration?.api_keys?.find(key => key.type === 'content')?.secret;
    const frontendUrl = config.headless?.frontendUrl || siteData.url;
    const contentApiUrl = config.headless?.contentApiUrl || siteData.headless?.contentApiUrl || fallbackContentApiUrl();
    const headlessEnabled = config.headless?.enabled === true || siteData.headless?.enabled === true;
    const envSnippet = `NEXT_PUBLIC_GHOST_CONTENT_API_URL=${contentApiUrl}\nNEXT_PUBLIC_GHOST_CONTENT_API_KEY=${contentApiKey || ''}\nNEXT_PUBLIC_SITE_URL=${frontendUrl}`;
    const revalidationSnippet = `Event: Post published, Post updated, Post unpublished, Post deleted\nTarget URL: https://your-frontend.example.com/api/revalidate?secret=YOUR_SECRET`;

    return (
        <Modal
            afterClose={() => {
                updateRoute('integrations');
            }}
            cancelLabel=''
            footer={
                <div className='mx-8 flex w-full items-center justify-between'>
                    <Button color='outline' href='https://ghost.org/docs/content-api/' label={<span className='flex items-center gap-1'>Open docs <Icon name='arrow-top-right' size='xs' /></span>} rel='noopener noreferrer' tag='a' target='_blank' />
                    <Button color='black' label='Close' onClick={() => {
                        updateRoute('integrations');
                        modal.remove();
                    }} />
                </div>
            }
            testId='custom-frontend-modal'
            title=''
            stickyFooter
        >
            <IntegrationHeader
                detail='Use Ghost as a backend CMS for a custom frontend.'
                extra={headlessEnabled ? <span className='inline-flex rounded-full bg-[rgba(48,207,67,0.15)] px-2 py-1 text-xs font-semibold tracking-wide text-green uppercase'>Headless enabled</span> : undefined}
                icon={<Icon name='brackets' size={56} />}
                title='Custom frontend'
            />
            <div className='mt-7'>
                <p className='mb-6 text-grey-700 dark:text-grey-300'>Configure Ghost with <code>url</code> set to your frontend and <code>admin.url</code> set to this Ghost backend. Ghost will keep Admin, APIs, and uploaded assets available while your frontend owns public pages.</p>
                <APIKeys keys={[
                    {
                        label: 'Frontend URL',
                        text: frontendUrl
                    },
                    {
                        label: 'Content API URL',
                        text: contentApiUrl
                    },
                    {
                        label: 'Content API key',
                        text: contentApiKey
                    }
                ]} />
                <CopyableBlock label='Next.js / Vercel environment' value={envSnippet} />
                <CopyableBlock label='Revalidation webhook setup' value={revalidationSnippet} />
                <p className='text-sm text-grey-700 dark:text-grey-300'>Proxy or allow Ghost asset URLs such as <code>/content/images/*</code>, <code>/content/media/*</code>, and <code>/content/files/*</code> from your custom frontend.</p>
            </div>
        </Modal>
    );
});

export default CustomFrontendModal;
