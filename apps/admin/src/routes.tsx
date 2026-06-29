import {type RouteObject, Outlet, lazyComponent, redirect} from "@tryghost/admin-x-framework";

// Posts (aka tags and post analytics)
import { PostsAppContextProvider, routes as postRoutes } from "@tryghost/posts/api";

// Stats (aka analytics)
import { GlobalDataProvider, routes as statsRoutes } from "@tryghost/stats/api";
import MyProfileRedirect from "./my-profile-redirect";

// Ember
import { EmberFallback, ForceUpgradeGuard } from "./ember-bridge";
import type { RouteHandle } from "./ember-bridge";
import { OnboardingRedirect } from "./onboarding/onboarding-redirect";

import { NotFound } from "./not-found";

// Routes handled by the Ember admin app. React delegates these to Ember via
// EmberFallback. When migrating a route to React, remove its entry from here.
const EMBER_ROUTES: string[] = [
    "/",
    "/dashboard",
    "/site",
    "/launch",
    "/setup",
    "/signin/*",
    "/signout",
    "/signup/*",
    "/reset/*",
    "/pro/*",
    "/posts",
    "/posts/analytics/:postId/mentions",
    "/posts/analytics/:postId/debug",
    "/restore",
    "/editor/*",
    "/tags/new",
    "/explore/*",
    "/migrate/*",
    "/designsandbox",
    "/mentions",
];

const emberFallbackHandle = { allowInForceUpgrade: true } satisfies RouteHandle;

const emberFallbackRoutes: RouteObject[] = EMBER_ROUTES.map(path => ({
    path,
    Component: EmberFallback,
    handle: emberFallbackHandle,
}));

export const BLOCKED_ADMIN_ROUTE_PATHS = [
    "/network",
    "/network/*",
    "/activitypub",
    "/activitypub/*",
    "/pages",
    "/pages/*",
    "/comments",
    "/comments/*",
    "/help",
    "/help/*",
    "/members",
    "/members/*",
    "/members-activity",
] as const;

const blockedAdminRoutes: RouteObject[] = BLOCKED_ADMIN_ROUTE_PATHS.map(path => ({
    path,
    loader: () => redirect("/site"),
}));

const BLOCKED_POST_APP_ROUTE_PATHS = new Set(["*", "comments"]);

export const routes: RouteObject[] = [
    {
        // ForceUpgradeGuard wraps all routes to redirect to /pro when in force upgrade mode.
        // Routes with handle.allowInForceUpgrade: true bypass this protection.
        element: <ForceUpgradeGuard />,
        children: [
            {
                // Override the tag detail route from the posts app to ensure we
                // correctly delegate to Ember since we can't remove the blank screen in
                // the posts app. The blank screen needs to be there to prevent the
                // router error fallback from triggering when navigating from the tag
                // list to a tag detail page.
                path: "/tags/:tagSlug",
                Component: EmberFallback,
                handle: emberFallbackHandle,
            },
            {
                element: (
                    <PostsAppContextProvider value={{ fromAnalytics: true }}>
                        <Outlet />
                    </PostsAppContextProvider>
                ),
                // Filter out catch-all and disabled routes
                children: postRoutes[0].children!.filter((route) => !BLOCKED_POST_APP_ROUTE_PATHS.has(route.path ?? "")),
            },
            {
                element: (
                    <OnboardingRedirect>
                        <GlobalDataProvider>
                            <Outlet />
                        </GlobalDataProvider>
                    </OnboardingRedirect>
                ),
                children: statsRoutes,
            },
            {
                path: "setup/onboarding",
                lazy: lazyComponent(() => import("./onboarding/onboarding-route")),
            },
            {
                path: "my-profile",
                Component: MyProfileRedirect,
                handle: { allowInForceUpgrade: true } satisfies RouteHandle,
            },
            {
                path: `settings/*`,
                lazy: lazyComponent(() => import("./settings/settings")),
                handle: { allowInForceUpgrade: true } satisfies RouteHandle,
            },
            ...blockedAdminRoutes,
            // Ember-handled routes
            ...emberFallbackRoutes,
            {
                // 404 catch-all for routes not handled by React or Ember
                path: "*",
                Component: NotFound,
            },
        ],
    },
];
