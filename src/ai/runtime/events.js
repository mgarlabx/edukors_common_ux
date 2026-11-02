/** The account-level fields of a usage report, from its windows: the most used one leads. */
export function fromWindows(windows) {
    if (!windows.length)
        return {};
    const top = windows.reduce((a, b) => (b.used > a.used ? b : a));
    return { limitUsed: top.used, ...(top.resetsAt ? { limitResetsAt: top.resetsAt } : {}), windows };
}
