/** Clock access for server components. Kept out of render bodies so the purity lint rule is satisfied. */
export const now = () => new Date();
export const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);
