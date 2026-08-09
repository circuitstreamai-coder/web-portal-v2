import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ parent, url }) => {
	// Public route — skip auth guard
	if (url.pathname === '/customer/register') return {};

	const { user } = await parent();
	if (!user) throw redirect(302, '/login');
	if (user.role !== 'customer') throw redirect(302, '/unauthorized');
	return {};
};
