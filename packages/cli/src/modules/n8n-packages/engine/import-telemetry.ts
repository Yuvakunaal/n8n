import type { EventService } from '@/events/event.service';

import type { CredentialBindingRequest } from '../entities/credential/credential.types';
import type { WorkflowImportOutcome } from '../entities/workflow/workflow-import.types';
import type { ImportContext, ImportPackageRequest } from '../n8n-packages.types';
import type { ImportOrchestrationResult } from './import-orchestrator';
import type { PackageManifest } from '../spec/manifest.schema';

export interface PackageImportScope {
	context: ImportContext;
	imported: ImportOrchestrationResult;
	credentialRequest: CredentialBindingRequest;
}

export function emitPackageImportedEvent(
	eventService: EventService,
	params: {
		request: ImportPackageRequest;
		manifest: PackageManifest;
		scopes: PackageImportScope[];
	},
): void {
	const { request, manifest, scopes } = params;

	const workflowOutcomes = scopes.flatMap(({ imported }) => imported.workflowOutcomes);
	const credentialResults = scopes.map(({ imported }) => imported.credentialResult);
	const importedWorkflows = workflowOutcomes.filter(({ status }) => status !== 'skipped');
	const countByStatus = (status: WorkflowImportOutcome['status']) =>
		workflowOutcomes.filter((outcome) => outcome.status === status).length;
	const credentialRequirements = scopes.reduce(
		(total, { credentialRequest }) => total + (credentialRequest.requirements?.length ?? 0),
		0,
	);

	const matchedCredentialIds = credentialResults.flatMap(({ matched, bindings }) =>
		matched.map((sourceId) => bindings.get(sourceId)!),
	);
	const createdCredentialIds = credentialResults.flatMap(({ stubbed, bindings }) =>
		stubbed.map((sourceId) => bindings.get(sourceId)!),
	);

	const folderId = scopes.length === 1 ? scopes[0].context.folderId : null;

	eventService.emit('n8n-package-imported', {
		user: request.user,
		projectIds: scopes.map(({ context }) => context.projectId),
		folderId,
		workflowIds: importedWorkflows.map(({ workflow }) => workflow.id),
		options: {
			workflowConflictPolicy: request.workflowConflictPolicy,
			workflowIdPolicy: request.workflowIdPolicy,
			credentialMatchingMode: request.credentialMatchingMode,
			credentialMissingMode: request.credentialMissingMode,
			workflowPublishingPolicy: request.workflowPublishingPolicy,
		},
		packageSourceId: manifest.sourceId,
		packageVersion: manifest.packageFormatVersion,
		credentialIds: {
			matched: matchedCredentialIds,
			created: createdCredentialIds,
			updated: [],
		},
		counts: {
			workflows: {
				created: countByStatus('created'),
				updated: countByStatus('updated'),
				skipped: countByStatus('skipped'),
			},
			credentials: {
				matched: matchedCredentialIds.length,
				created: createdCredentialIds.length,
				requirements: credentialRequirements,
			},
		},
	});
}
