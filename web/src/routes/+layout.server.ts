import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => ({ account: locals.account, usage: locals.usage, live: locals.live, owner: locals.owner });
