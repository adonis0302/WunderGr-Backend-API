import { createOperation } from '../../generated/wundergraph.factory';

export default createOperation.query({
	handler: async ({ operations, input }) => {
		return 'hello simple';
	},
});
