import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { listSearchPage } from '../helpers/listSearch';
import { resolveWorkbookRoot, validatePathSegment } from '../helpers/utils';

export async function getSheets(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const workbookRoot = await resolveWorkbookRoot.call(this);

	return await listSearchPage.call(
		this,
		`${workbookRoot}/workbook/worksheets`,
		(sheet) => ({ name: String(sheet.name), value: String(sheet.id) }),
		filter,
		paginationToken,
	);
}

export async function getTables(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const workbookRoot = await resolveWorkbookRoot.call(this);
	const worksheetId = validatePathSegment(
		this.getNode(),
		'Sheet',
		this.getNodeParameter('worksheet', undefined, { extractValue: true }) as string,
	);

	return await listSearchPage.call(
		this,
		`${workbookRoot}/workbook/worksheets/${encodeURIComponent(worksheetId)}/tables`,
		(table) => ({ name: String(table.name), value: String(table.id) }),
		filter,
		paginationToken,
	);
}
