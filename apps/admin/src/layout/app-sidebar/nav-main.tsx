import React from "react"

import {SidebarGroup, SidebarGroupContent, SidebarMenu} from "@tryghost/shade/components"
import {LucideIcon} from "@tryghost/shade/utils"
import { useBrowseSite } from "@tryghost/admin-x-framework/api/site";
import { useCurrentUser } from "@tryghost/admin-x-framework/api/current-user";
import { hasAdminAccess } from "@tryghost/admin-x-framework/api/users";
import { NavMenuItem } from "./nav-menu-item";
import { getAdminToolbarUrl } from "@/utils/admin-toolbar-url";

function NavMain({ ...props }: React.ComponentProps<typeof SidebarGroup>) {
    const { data: currentUser } = useCurrentUser();
    const site = useBrowseSite();
    const url = getAdminToolbarUrl(site.data?.site.url);

    // Only show NavMain for admin users
    if (!currentUser || !hasAdminAccess(currentUser)) {
        return null;
    }
    return (
        <SidebarGroup {...props}>
            <SidebarGroupContent>
                <SidebarMenu>
                    <NavMenuItem>
                        <NavMenuItem.Link to="analytics" activeOnSubpath>
                            <LucideIcon.TrendingUp />
                            <NavMenuItem.Label>Analytics</NavMenuItem.Label>
                        </NavMenuItem.Link>
                    </NavMenuItem>
                    <NavMenuItem className="group/viewsite relative">
                        <NavMenuItem.Link to="site">
                            <LucideIcon.AppWindow />
                            <NavMenuItem.Label>View site</NavMenuItem.Label>
                        </NavMenuItem.Link>
                        <a
                            href={url}
                            target="_blank"
                            aria-label="View site in new tab"
                            rel="noopener noreferrer"
                            className="absolute top-0 right-0 flex size-8 items-center justify-center rounded-full text-gray-700 opacity-0 ring-sidebar-ring outline-hidden transition-all group-hover/viewsite:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2">
                                <LucideIcon.ExternalLink size={16} />
                        </a>
                    </NavMenuItem>
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}

export default NavMain;
