import React from "react"

import {SidebarGroup, SidebarGroupContent, SidebarMenu} from "@tryghost/shade/components"
import {LucideIcon} from "@tryghost/shade/utils"
import { useCurrentUser } from "@tryghost/admin-x-framework/api/current-user";
import { canManageAutomations, canManageTags } from "@tryghost/admin-x-framework/api/users";
import { NavMenuItem } from "./nav-menu-item";
import { useNavigationExpanded } from "./hooks/use-navigation-preferences";
import { NavCustomViews } from "./nav-custom-views";
import { useCustomSidebarViews } from "./use-custom-sidebar-views";
import { useEmberRouting } from "@/ember-bridge";
import { useFeatureFlag } from "@/hooks/use-feature-flag";

function PostsNavItemContent({isActive, to}: {isActive: boolean; to: string}) {
    return (
        <>
            <NavMenuItem.Link
                to={to}
                isActive={isActive}
            >
                <LucideIcon.PenLine className="pointer-events-none opacity-0 transition-all sidebar:opacity-100 sidebar:group-hover/menu-item:opacity-0 sidebar:group-has-[button:focus-visible]/menu-item:opacity-0" />
                <NavMenuItem.Label>Posts</NavMenuItem.Label>
            </NavMenuItem.Link>
            <a href="#/editor/post"
                aria-label="Create new post"
                className="absolute top-0 right-0 flex size-8 items-center justify-center rounded-full p-0 text-gray-700 ring-sidebar-ring outline-hidden transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
            >
                <LucideIcon.Plus
                    size={20}
                    className="mt-px stroke-[1.5px]!"
                />
            </a>
        </>
    );
}

function NavContent({ ...props }: React.ComponentProps<typeof SidebarGroup>) {
    const { data: currentUser } = useCurrentUser();
    const [savedPostsExpanded, setPostsExpanded] = useNavigationExpanded('posts');
    const postCustomViews = useCustomSidebarViews('posts');
    const routing = useEmberRouting();
    const automationsEnabled = useFeatureFlag('automations');

    const showTags = currentUser && canManageTags(currentUser);
    const showAutomations = currentUser && canManageAutomations(currentUser);
    const isDraftPostsRouteActive = routing.isRouteActive('posts', {type: 'draft'});
    const isScheduledPostsRouteActive = routing.isRouteActive('posts', {type: 'scheduled'});
    const isPublishedPostsRouteActive = routing.isRouteActive('posts', {type: 'published'});
    const hasActivePostChild = isDraftPostsRouteActive || isScheduledPostsRouteActive || isPublishedPostsRouteActive || postCustomViews.some(view => view.isActive);
    const postsExpanded = savedPostsExpanded;
    const postsRoute = routing.getRouteUrl('posts');
    const isPostsRouteActive = routing.isRouteActive('posts');
    const postsNavActive = isPostsRouteActive || (!postsExpanded && hasActivePostChild);
    return (
        <SidebarGroup {...props}>
            <SidebarGroupContent>
                <SidebarMenu>
                    <NavMenuItem.Collapsible
                        expanded={postsExpanded}
                        id="posts-submenu"
                        onExpandedChange={setPostsExpanded}
                    >
                        <NavMenuItem.CollapsibleItem ariaLabel="Toggle post views">
                            <PostsNavItemContent
                                isActive={postsNavActive}
                                to={postsRoute}
                            />
                        </NavMenuItem.CollapsibleItem>

                        <NavMenuItem.CollapsibleMenu>
                            <NavMenuItem.SubmenuItem
                                to="posts?type=draft"
                                isActive={isDraftPostsRouteActive}
                            >
                                <NavMenuItem.Label>Drafts</NavMenuItem.Label>
                            </NavMenuItem.SubmenuItem>

                            <NavMenuItem.SubmenuItem
                                to="posts?type=scheduled"
                                isActive={isScheduledPostsRouteActive}
                            >
                                <NavMenuItem.Label>Scheduled</NavMenuItem.Label>
                            </NavMenuItem.SubmenuItem>

                            <NavMenuItem.SubmenuItem
                                to="posts?type=published"
                                isActive={isPublishedPostsRouteActive}
                            >
                                <NavMenuItem.Label>Published</NavMenuItem.Label>
                            </NavMenuItem.SubmenuItem>

                            <NavCustomViews />
                        </NavMenuItem.CollapsibleMenu>
                    </NavMenuItem.Collapsible>

                    {showTags && (
                        <NavMenuItem>
                            <NavMenuItem.Link
                                to="tags"
                                activeOnSubpath
                            >
                                <LucideIcon.Tag />
                                <NavMenuItem.Label>Tags</NavMenuItem.Label>
                            </NavMenuItem.Link>
                        </NavMenuItem>
                    )}

                    {showAutomations && automationsEnabled && (
                        <NavMenuItem>
                            <NavMenuItem.Link
                                to="automations"
                                activeOnSubpath
                            >
                                <LucideIcon.Zap />
                                <NavMenuItem.Label>Automations</NavMenuItem.Label>
                            </NavMenuItem.Link>
                        </NavMenuItem>
                    )}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}

export default NavContent;
