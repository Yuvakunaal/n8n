import { ForbiddenError } from '@/errors/response-errors/forbidden.error';

import type {
	PreparedWorkflow,
	WorkflowImportOutcome,
} from '../entities/workflow/workflow-import.types';
import { serializeBindings } from '../n8n-packages.types';
import type {
	ImportCredentialSummary,
	ImportedFolderSummary,
	ImportedProjectSummary,
	ImportedWorkflowSummary,
	ImportPackageSummary,
	ImportResult,
	PackageImportBindings,
} from '../n8n-packages.types';
import type { PackageManifest } from '../spec/manifest.schema';
import type { PackageCredentialRequirement } from '../spec/requirements.schema';

export function toPackageSummary(manifest: PackageManifest): ImportPackageSummary {
	return {
		sourceN8nVersion: manifest.sourceN8nVersion,
		sourceId: manifest.sourceId,
		exportedAt: manifest.exportedAt,
	};
}

export function toImportedWorkflowSummaries(
	outcomes: WorkflowImportOutcome[],
	projectId: string,
): ImportedWorkflowSummary[] {
	return outcomes.map(({ workflow, sourceWorkflowId, status, publishing }) => ({
		sourceWorkflowId,
		localId: workflow.id,
		name: workflow.name,
		projectId,
		parentFolderId: workflow.parentFolder?.id ?? null,
		activeVersionId: workflow.activeVersionId ?? null,
		publishing,
		status,
	}));
}

export function buildImportResult(input: {
	package: ImportPackageSummary;
	workflows: ImportedWorkflowSummary[];
	folders: ImportedFolderSummary[];
	projects: ImportedProjectSummary[];
	bindings: PackageImportBindings;
	credentials?: ImportCredentialSummary;
}): ImportResult {
	return {
		package: input.package,
		workflows: input.workflows,
		folders: input.folders,
		projects: input.projects,
		bindings: serializeBindings(input.bindings),
		credentials: input.credentials ?? { matched: [], stubbed: [] },
	};
}

/**
 * Asserts the caller's API key carries the scopes the package's contents require (public API only).
 * Internal callers omit `apiKeyScopes` and are authorized by user RBAC alone.
 */
export function assertPackageImportApiKeyScopes(
	apiKeyScopes: string[] | undefined,
	required: string[],
): void {
	if (apiKeyScopes === undefined) return;
	for (const scope of required) {
		if (!apiKeyScopes.includes(scope)) {
			throw new ForbiddenError('Forbidden');
		}
	}
}

export function identifyRequirementsForWorkflows(
	requirements: PackageCredentialRequirement[] | undefined,
	workflows: PreparedWorkflow[],
): PackageCredentialRequirement[] | undefined {
	if (!requirements) return undefined;

	const importedIds = new Set(workflows.map((workflow) => workflow.sourceWorkflowId));
	return requirements
		.map((requirement) => ({
			...requirement,
			usedByWorkflows: requirement.usedByWorkflows.filter((id) => importedIds.has(id)),
		}))
		.filter((requirement) => requirement.usedByWorkflows.length > 0);
}
