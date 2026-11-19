/** The grove sort orders (?sort=), shared by the home page (server) and components/GroveTrees.tsx (client). */
export const SORTS = ['docs', 'growth', 'm12', 'az'] as const;
export type Sort = (typeof SORTS)[number];
