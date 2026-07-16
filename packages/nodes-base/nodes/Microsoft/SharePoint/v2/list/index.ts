import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { escapeODataFilterValue } from '../helpers/utils';
import { resolveSiteId } from '../site';
import { microsoftApiRequest } from '../transport';

type ListSearchReply = {
	'@odata.nextLink'?: string;
	value?: Array<{ id?: string; displayName?: string }>;
};

/**
 * Searches a site's lists by display name. Resolves `site` via `resolveSiteId`
 * so a URL-mode site behaves identically here and in the List actions.
 * Next-page links are requested exactly as returned (see `getSites`).
 */
export async function getLists(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	// In load-options contexts getNodeParameter's 2nd arg is the fallback, not
	// an item index (see getSharePointCredentialType) — 0 is safe here since a
	// real `site` value exists by the time this dropdown can be opened.
	const siteId = await resolveSiteId.call(this, 0);

	let response: ListSearchReply;
	if (paginationToken) {
		response = (await microsoftApiRequest.call(
			this,
			'GET',
			'',
			{},
			{},
			paginationToken,
		)) as ListSearchReply;
	} else {
		const qs: IDataObject = { $select: 'id,displayName' };
		if (filter) {
			qs.$filter = `startswith(displayName,'${escapeODataFilterValue(filter)}')`;
		}
		response = (await microsoftApiRequest.call(
			this,
			'GET',
			`/v1.0/sites/${encodeURIComponent(siteId)}/lists`,
			{},
			qs,
		)) as ListSearchReply;
	}

	// Kept in the API's order — a per-page sort would reset at every page
	// boundary once results span pages (see getSites).
	const results = (response.value ?? [])
		.filter((list) => list.id)
		.map((list) => ({ name: list.displayName ?? String(list.id), value: String(list.id) }));

	return { results, paginationToken: response['@odata.nextLink'] };
}
