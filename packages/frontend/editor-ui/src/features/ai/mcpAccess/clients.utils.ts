import type { Component } from 'vue';

import type {
	McpClientBrandName,
	McpClientConnectedPeriod,
	McpClientType,
	McpClientTypeFilter,
} from '@n8n/api-types';
import { MCP_CLIENT_BRAND_MATCHERS } from '@n8n/api-types';

import ClaudeIcon from './assets/client-icons/claude.svg?component';
import CursorIcon from './assets/client-icons/cursor.svg?component';
import OpenAiIcon from './assets/client-icons/openai.svg?component';
import VsCodeIcon from './assets/client-icons/vscode.svg?component';

export interface McpClientBrand {
	icon: Component | null;
	type: McpClientType | null;
}

/** Logos for the brands recognized by the shared name-pattern matchers. */
const BRAND_ICONS: Record<McpClientBrandName, Component> = {
	claude: ClaudeIcon,
	cursor: CursorIcon,
	vscode: VsCodeIcon,
	openai: OpenAiIcon,
};

export function getClientBrand(clientName: string): McpClientBrand {
	const match = MCP_CLIENT_BRAND_MATCHERS.find(({ pattern }) => pattern.test(clientName));
	if (!match) return { icon: null, type: null };
	return { icon: BRAND_ICONS[match.brand], type: match.type };
}

/**
 * i18n key suffix for a granted scope's human label, e.g. `workflow:read` →
 * `workflow.read`. Unknown scopes have no label and are rendered verbatim.
 */
export function scopeLabelKeySuffix(scope: string): string {
	return scope.replace(':', '.');
}

/** UI state of the connected-clients search + filter popover; applied server-side. */
export interface OAuthClientFilters {
	search: string;
	type: McpClientTypeFilter | null;
	ownerId: string | null;
	connected: McpClientConnectedPeriod | null;
}

export const EMPTY_OAUTH_CLIENT_FILTERS: OAuthClientFilters = {
	search: '',
	type: null,
	ownerId: null,
	connected: null,
};
