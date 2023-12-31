import { createOperation, z } from '../../../generated/wundergraph.factory';

export default createOperation.query({
	input: z.object({
		id: z.string(),
	}),
	handler: async ({ input }) => {
		return {
			id: input.id,
			name: 'Jens the Admin',
			bio: 'Founder of WunderGraph',
		};
	},
});
