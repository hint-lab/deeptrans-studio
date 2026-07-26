/**
 * Returns whether a dashboard navigation target owns the current route.
 * `/dashboard` is the projects overview, so its project subroutes belong to it as well.
 */
export function isCurrentDashboardSection(pathname: string | null | undefined, href: string) {
    if (!pathname) return false;

    // `usePathname` is normally canonical, but direct deep links can still arrive
    // with a trailing slash before Next finishes normalizing the URL. Treat those
    // paths as the same route so the active sidebar item does not briefly disappear.
    const currentPath = normalizeLegacyDashboardPath(normalizePath(pathname));
    const sectionPath = normalizePath(href);

    if (sectionPath === '/dashboard') {
        return (
            currentPath === sectionPath ||
            currentPath === '/dashboard/projects' ||
            currentPath.startsWith('/dashboard/projects/')
        );
    }

    return currentPath === sectionPath || currentPath.startsWith(`${sectionPath}/`);
}

function normalizeLegacyDashboardPath(path: string) {
    // The former text-translation route redirects to instant translation.
    // Keep the owning sidebar item active during a client-side route transition.
    return path === '/dashboard/translation' ? '/dashboard/instant-translate' : path;
}

function normalizePath(path: string) {
    if (path === '/') return path;
    return path.replace(/\/+$/, '') || '/';
}
