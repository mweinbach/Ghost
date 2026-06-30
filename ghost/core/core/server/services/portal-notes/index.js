const logging = require('@tryghost/logging');
const request = require('@tryghost/request');
const config = require('../../../shared/config');
const events = require('../../lib/common/events');

// Portal-facing cache revalidation. When a published note changes, ping the
// DiligenceStack portal so it drops its cached Notes feed immediately instead
// of waiting for the cache TTL. Configured entirely via env on the Ghost
// service (portalNotes__revalidateUrl / portalNotes__revalidateSecret); when
// either is absent this is a no-op, so it stays safe in environments that do
// not set it. Failures are logged and never thrown — a missed ping just means
// the portal refreshes on its normal TTL.

const RELEVANT_EVENTS = [
    'post.published',
    'post.published.edited',
    'post.unpublished',
    'post.deleted'
];

function getConfig() {
    return {
        url: config.get('portalNotes:revalidateUrl'),
        secret: config.get('portalNotes:revalidateSecret')
    };
}

async function portalNotesRevalidateListener(model, options) {
    // Skip bulk DB imports — they fire a storm of events, and the portal will
    // pick everything up on its next TTL refresh anyway.
    if (options && options.importing) {
        return;
    }

    const {url, secret} = getConfig();
    if (!url || !secret) {
        return;
    }

    let slug = null;
    let type = null;
    try {
        if (model && typeof model.get === 'function') {
            slug = model.get('slug') || null;
            type = model.get('type') || null;
        }
    } catch (err) {
        // best-effort metadata only; the portal can revalidate the whole feed
    }

    // Pages never appear in the Notes feed.
    if (type === 'page') {
        return;
    }

    const body = JSON.stringify({slug});

    try {
        await request(url, {
            method: 'POST',
            body,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'x-revalidate-secret': secret
            },
            timeout: {
                request: 5 * 1000
            },
            retry: {
                limit: 0
            }
        });
    } catch (err) {
        logging.warn('[portal-notes] revalidate ping failed: ' + (err && err.message));
    }
}

function listen() {
    for (const event of RELEVANT_EVENTS) {
        if (!events.hasRegisteredListener(event, 'portalNotesRevalidateListener')) {
            events.on(event, portalNotesRevalidateListener);
        }
    }
}

// Public API
module.exports = {
    listen: listen
};
