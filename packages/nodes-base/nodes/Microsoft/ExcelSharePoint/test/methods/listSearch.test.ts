import type { ILoadOptionsFunctions, INode } from 'n8n-workflow';
import type { Mock } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { getSheets, getTables } from '../../methods/listSearch';
import * as transport from '../../transport';
import type * as _importType0 from '../../transport';

// Real transport module except the network helper
vi.mock('../../transport', async () => {
	const originalModule = await vi.importActual<typeof _importType0>('../../transport');
	return {
		...originalModule,
		microsoftApiRequest: vi.fn(),
	};
});

const SITE_ID = 'contoso.sharepoint.com,g1,g2';
const WORKBOOK_ROOT = `/v1.0/sites/${encodeURIComponent(SITE_ID)}/drives/b!drive1/items/ITEM123`;
const SHEET1 = { id: '{00000000-0000-0000-0000-000000000001}', name: 'Sheet1' };
const SHEET2 = { id: '{00000000-0000-0000-0000-000000000002}', name: 'Costs' };
const TABLE1 = { id: '{00000000-0000-0000-0000-000000000011}', name: 'Table1' };
const TABLE2 = { id: '{00000000-0000-0000-0000-000000000012}', name: 'Expenses' };

describe('Microsoft Excel (SharePoint) — dropdown search methods', () => {
	let ctx: DeepMockProxy<ILoadOptionsFunctions>;
	const apiRequest = transport.microsoftApiRequest as Mock;

	const setParams = (params: Record<string, unknown>) => {
		ctx.getNodeParameter.mockImplementation(
			(name: string, fallback?: unknown) => (name in params ? params[name] : fallback) as never,
		);
	};

	const byIdParams = {
		workbook: { mode: 'id', value: 'ITEM123' },
		site: { mode: 'id', value: SITE_ID },
		library: { mode: 'id', value: 'b!drive1' },
	};

	beforeEach(() => {
		vi.clearAllMocks();
		ctx = mockDeep<ILoadOptionsFunctions>();
		ctx.getNode.mockReturnValue(mock<INode>());
	});

	describe('getSheets', () => {
		it('lists the sheets in the workbook', async () => {
			setParams(byIdParams);
			apiRequest.mockResolvedValue({ value: [SHEET1, SHEET2] });

			const result = await getSheets.call(ctx);

			expect(apiRequest).toHaveBeenCalledWith(
				'GET',
				`${WORKBOOK_ROOT}/workbook/worksheets`,
				{},
				{ $top: 100 },
			);
			expect(result.results).toEqual([
				{ name: 'Sheet1', value: SHEET1.id },
				{ name: 'Costs', value: SHEET2.id },
			]);
		});

		it('filters the page by typed text, case-insensitively', async () => {
			setParams(byIdParams);
			apiRequest.mockResolvedValue({ value: [SHEET1, SHEET2] });

			const result = await getSheets.call(ctx, 'cost');

			expect(result.results).toEqual([{ name: 'Costs', value: SHEET2.id }]);
		});

		it('follows a pagination token verbatim, without rebuilding the request', async () => {
			const nextLink =
				'https://graph.microsoft.com/v1.0/sites/s/drives/d/items/i/workbook/worksheets?$skiptoken=abc';
			setParams(byIdParams);
			apiRequest.mockResolvedValue({ value: [SHEET2] });

			const result = await getSheets.call(ctx, undefined, nextLink);

			expect(apiRequest).toHaveBeenCalledWith('GET', '', {}, {}, nextLink);
			expect(result.results).toEqual([{ name: 'Costs', value: SHEET2.id }]);
		});

		it('surfaces the next @odata.nextLink as the pagination token', async () => {
			const nextLink =
				'https://graph.microsoft.com/v1.0/sites/s/drives/d/items/i/workbook/worksheets?$skiptoken=def';
			setParams(byIdParams);
			apiRequest.mockResolvedValue({ value: [SHEET1], '@odata.nextLink': nextLink });

			const result = await getSheets.call(ctx);

			expect(result.paginationToken).toBe(nextLink);
		});
	});

	describe('getTables', () => {
		const params = { ...byIdParams, worksheet: 'Sheet1' };

		it('lists the tables in the chosen sheet', async () => {
			setParams(params);
			apiRequest.mockResolvedValue({ value: [TABLE1, TABLE2] });

			const result = await getTables.call(ctx);

			expect(apiRequest).toHaveBeenCalledWith(
				'GET',
				`${WORKBOOK_ROOT}/workbook/worksheets/Sheet1/tables`,
				{},
				{ $top: 100 },
			);
			expect(result.results).toEqual([
				{ name: 'Table1', value: TABLE1.id },
				{ name: 'Expenses', value: TABLE2.id },
			]);
		});

		it('filters the page by typed text', async () => {
			setParams(params);
			apiRequest.mockResolvedValue({ value: [TABLE1, TABLE2] });

			const result = await getTables.call(ctx, 'expense');

			expect(result.results).toEqual([{ name: 'Expenses', value: TABLE2.id }]);
		});

		it('rejects an empty Sheet', async () => {
			setParams({ ...params, worksheet: '' });

			await expect(getTables.call(ctx)).rejects.toThrow("The 'Sheet' parameter is empty");
			expect(apiRequest).not.toHaveBeenCalled();
		});
	});
});
