import {describe, expect, it} from 'vitest';
import {BLOCKED_ADMIN_ROUTE_PATHS, routes} from './routes';

function getAdminRouteChildren() {
    return routes[0].children ?? [];
}

describe('admin routes', () => {
    it('redirects blocked admin routes to the site preview', async () => {
        const adminRouteChildren = getAdminRouteChildren();

        for (const path of BLOCKED_ADMIN_ROUTE_PATHS) {
            const matchingRoutes = adminRouteChildren.filter(route => route.path === path);

            expect(matchingRoutes).toHaveLength(1);
            expect(matchingRoutes[0].loader).toBeTypeOf('function');

            const loader = matchingRoutes[0].loader as () => Response | Promise<Response>;
            const response = await loader();

            expect(response).toBeInstanceOf(Response);
            expect(response.headers.get('Location')).toBe('/site');
        }
    });

    it('does not delegate blocked routes to feature apps', () => {
        const adminRouteChildren = getAdminRouteChildren();
        const postsRoute = adminRouteChildren.find(route => route.children?.some(child => child.path === 'tags'));

        expect(adminRouteChildren.some(route => route.path === 'network')).toBe(false);
        expect(adminRouteChildren.some(route => route.path === 'activitypub')).toBe(false);
        expect(adminRouteChildren.some(route => route.path === '/pages' && route.Component)).toBe(false);
        expect(adminRouteChildren.some(route => route.path === '/members' && route.element)).toBe(false);
        expect(adminRouteChildren.some(route => route.path === '/members/new' && route.Component)).toBe(false);
        expect(adminRouteChildren.some(route => route.path === '/members/:member_id' && route.Component)).toBe(false);
        expect(adminRouteChildren.some(route => route.path === '/members-activity' && route.Component)).toBe(false);
        expect(postsRoute?.children?.some(route => route.path === 'comments')).toBe(false);
    });
});
