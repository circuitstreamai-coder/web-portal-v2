import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) throw redirect(302, '/login');
	if (user.role !== 'state_planner') throw redirect(302, '/unauthorized');
	return {};
};
