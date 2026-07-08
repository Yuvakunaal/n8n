import type { Component } from 'vue';

import type { OAuthClientResponseDto } from '@n8n/api-types';

import ClaudeIcon from './assets/client-icons/claude.svg?component';
import CursorIcon from './assets/client-icons/cursor.svg?component';
import OpenAiIcon from './assets/client-icons/openai.svg?component';
import VsCodeIcon from './assets/client-icons/vscode.svg?component';

export type McpClientType = 'cli' | 'ide' | 'editor' | 'assistant';

export interface McpClientBrand {
	icon: Component | null;
	type: McpClientType | null;
}

/**
 * Client names are free-form (self-reported at OAuth registration), so known
 * clients are recognized by name patterns. First match wins: more specific
 * patterns (e.g. "Claude Code") must come before broader ones ("Claude").
 */
const BRAND_MATCHERS: Array<{ pattern: RegExp; brand: McpClientBrand }> = [
	{ pattern: /claude[ -]?code/i, brand: { icon: ClaudeIcon, type: 'cli' } },
	{ pattern: /claude/i, brand: { icon: ClaudeIcon, type: 'assistant' } },
	{ pattern: /cursor/i, brand: { icon: CursorIcon, type: 'ide' } },
	{ pattern: /(visual studio code|vs ?code)/i, brand: { icon: VsCodeIcon, type: 'editor' } },
	{ pattern: /codex/i, brand: { icon: OpenAiIcon, type: 'cli' } },
	{ pattern: /chatgpt|openai/i, brand: { icon: OpenAiIcon, type: 'assistant' } },
];

export function getClientBrand(clientName: string): McpClientBrand {
	return (
		BRAND_MATCHERS.find(({ pattern }) => pattern.test(clientName))?.brand ?? {
			icon: null,
			type: null,
		}
	);
}

/**
 * i18n key suffix for a granted scope's human label, e.g. `workflow:read` →
 * `workflow.read`. Unknown scopes have no label and are rendered verbatim.
 */
export function scopeLabelKeySuffix(scope: string): string {
	return scope.replace(':', '.');
}

/** Client type buckets offered by the connected-clients filter (per design). */
export type McpClientTypeFilter = 'ide' | 'cli' | 'web';

export type McpConnectedPeriod = 'last7' | 'last30' | 'older';

export interface OAuthClientFilters {
	search: string;
	type: McpClientTypeFilter | null;
	ownerId: string | null;
	connected: McpConnectedPeriod | null;
}

export const EMPTY_OAUTH_CLIENT_FILTERS: OAuthClientFilters = {
	search: '',
	type: null,
	ownerId: null,
	connected: null,
};

/**
 * The filter exposes the fixed design buckets (IDE / CLI / Web) rather than
 * the finer-grained derived brand types shown in the table rows.
 */
const TYPE_FILTER_BUCKETS: Record<McpClientTypeFilter, McpClientType[]> = {
	ide: ['ide', 'editor'],
	cli: ['cli'],
	web: ['assistant'],
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function filterOAuthClients(
	clients: OAuthClientResponseDto[],
	filters: OAuthClientFilters,
	now: number,
): OAuthClientResponseDto[] {
	const needle = filters.search.trim().toLowerCase();
	return clients.filter((client) => {
		if (needle && !client.name.toLowerCase().includes(needle)) return false;
		if (filters.type) {
			const type = getClientBrand(client.name).type;
			if (!type || !TYPE_FILTER_BUCKETS[filters.type].includes(type)) return false;
		}
		if (filters.ownerId && client.owner?.id !== filters.ownerId) return false;
		if (filters.connected === 'last7' && client.grantedAt < now - 7 * DAY_IN_MS) return false;
		if (filters.connected === 'last30' && client.grantedAt < now - 30 * DAY_IN_MS) return false;
		if (filters.connected === 'older' && client.grantedAt >= now - 30 * DAY_IN_MS) return false;
		return true;
	});
}
