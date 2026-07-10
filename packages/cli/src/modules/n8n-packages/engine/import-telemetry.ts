import type { EventService } from '@/events/event.service';

import type { CredentialBindingRequest } from '../entities/credential/credential.types';
import type { WorkflowImportOutcome } from '../entities/workflow/workflow-import.types';
import type { ImportContext, ImportPackageRequest } from '../n8n-packages.types';
import type { ImportOrchestrationResult } from './import-orchestrator';
import type { PackageManifest } from '../spec/manifest.schema';

/**
 * Emits the `n8n-package-imported` telemetry event for one imported scope. Shared by the workflow- and
 * project-package importers (a project package emits once per project, keyed to that project's scope).
 */
export function emitPackageImportedEvent(
	eventService: EventService,
	params: {
		request: ImportPackageRequest;
		context: ImportContext;
		manifest: PackageManifest;
		imported: ImportOrchestrationResult;
		credentialRequest: CredentialBindingRequest;
	},
): void {
	const { request, context, manifest, imported, credentialRequest } = params;
	const { workflowOutcomes, credentialResult } = imported;
	const importedWorkflows = workflowOutcomes.filter(({ status }) => status !== 'skipped');
	const countByStatus = (status: WorkflowImportOutcome['status']) =>
		workflowOutcomes.filter((outcome) => outcome.status === status).length;

	eventService.emit('n8n-package-imported', {
		user: context.user,
		projectId: context.projectId,
		folderId: context.folderId,
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
			matched: credentialResult.matched.map((sourceId) => credentialResult.bindings.get(sourceId)!),
			created: credentialResult.stubbed.map((sourceId) => credentialResult.bindings.get(sourceId)!),
			updated: [],
		},
		counts: {
			workflows: {
				created: countByStatus('created'),
				updated: countByStatus('updated'),
				skipped: countByStatus('skipped'),
			},
			credentials: {
				matched: credentialResult.matched.length,
				created: credentialResult.stubbed.length,
				requirements: credentialRequest.requirements?.length ?? 0,
			},
		},
	});
}
