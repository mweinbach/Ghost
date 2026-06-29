import React from "react"

import {SidebarGroup, SidebarGroupContent, SidebarMenu} from "@tryghost/shade/components"
import {LucideIcon} from "@tryghost/shade/utils"
import { useCurrentUser } from "@tryghost/admin-x-framework/api/current-user";
import { canAccessSettings } from "@tryghost/admin-x-framework/api/users";
import { NavMenuItem } from "./nav-menu-item";

function NavSettings({ ...props }: React.ComponentProps<typeof SidebarGroup>) {
    const { data: currentUser } = useCurrentUser();
    const showSettings = currentUser && canAccessSettings(currentUser);

    return (
        <SidebarGroup {...props}>
            <SidebarGroupContent>
                <SidebarMenu>
                    {showSettings && (
                        <NavMenuItem>
                            <NavMenuItem.Link to="settings">
                                <LucideIcon.Settings />
                                <NavMenuItem.Label>Settings</NavMenuItem.Label>
                            </NavMenuItem.Link>
                        </NavMenuItem>
                    )}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}

export default NavSettings;
