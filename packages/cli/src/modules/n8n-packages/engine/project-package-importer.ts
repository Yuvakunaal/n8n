import { LicenseState } from '@n8n/backend-common';
import { Service } from '@n8n/di';

import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { EventService } from '@/events/event.service';

import type { CredentialBindingRequest } from '../entities/credential/credential.types';
import { ProjectImporter } from '../entities/project/project-importer';
import type { PackageReader } from '../io/package-reader';
import type {
	ImportContext,
	ImportedFolderSummary,
	ImportedWorkflowSummary,
	ImportPackageRequest,
	ImportResult,
	PackageImportBindings,
} from '../n8n-packages.types';
import { mergeBindings } from '../n8n-packages.types';
import { ImportOrchestrator, type ImportOrchestrationResult } from './import-orchestrator';
import {
	assertPackageImportApiKeyScopes,
	buildImportResult,
	identifyRequirements,
	toImportedWorkflowSummaries,
	toPackageSummary,
} from './import-result';
import { emitPackageImportedEvent } from './import-telemetry';
import { N8nPackageParser } from './n8n-package-parser';
import type { ManifestEntry, PackageManifest } from '../spec/manifest.schema';

@Service()
export class ProjectPackageImporter {
	constructor(
		private readonly packageParser: N8nPackageParser,
		private readonly projectImporter: ProjectImporter,
		private readonly importOrchestrator: ImportOrchestrator,
		private readonly eventService: EventService,
		private readonly licenseState: LicenseState,
	) {}

	async import(
		request: ImportPackageRequest,
		reader: PackageReader,
		manifest: PackageManifest,
	): Promise<ImportResult> {
		this.assertAdequatePermissions(request, manifest);

		const projects = await this.packageParser.getProjects(reader);
		const plan = await this.projectImporter.plan(request.user, projects);
		const projectSummaries = await this.projectImporter.apply(request.user, plan);

		const workflows: ImportedWorkflowSummary[] = [];
		const folders: ImportedFolderSummary[] = [];
		const scopedBindings: PackageImportBindings[] = [];
		const matched: string[] = [];
		const stubbed: string[] = [];

		for (const project of manifest.projects ?? []) {
			const imported = await this.importProjectContents(request, reader, manifest, project);
			workflows.push(...toImportedWorkflowSummaries(imported.workflowOutcomes, project.id));
			folders.push(...imported.folderSummaries);
			scopedBindings.push(imported.bindings);
			matched.push(...imported.credentialResult.matched);
			stubbed.push(...imported.credentialResult.stubbed);
		}

		return buildImportResult({
			package: toPackageSummary(manifest),
			workflows,
			folders,
			projects: projectSummaries,
			bindings: mergeBindings(...scopedBindings),
			credentials: { matched, stubbed },
		});
	}

	private async importProjectContents(
		request: ImportPackageRequest,
		reader: PackageReader,
		manifest: PackageManifest,
		project: ManifestEntry,
	): Promise<ImportOrchestrationResult> {
		const basePrefix = `${project.target}/`;
		const folders = await this.packageParser.getFolders(reader, basePrefix);
		const workflows = await this.packageParser.getWorkflows(reader, basePrefix);

		const credentialRequest: CredentialBindingRequest = {
			requirements: identifyRequirements(manifest.requirements?.credentials, workflows),
			matchingMode: request.credentialMatchingMode,
			missingMode: request.credentialMissingMode,
			credentialBindings: request.bindings?.credentials,
		};

		const context: ImportContext = { user: request.user, projectId: project.id, folderId: null };

		const imported = await this.importOrchestrator.import({
			context,
			folders,
			workflows,
			credentialRequest,
			options: request,
		});

		emitPackageImportedEvent(this.eventService, {
			request,
			context,
			manifest,
			imported,
			credentialRequest,
		});

		return imported;
	}

	private assertAdequatePermissions(
		request: ImportPackageRequest,
		manifest: PackageManifest,
	): void {
		// A project package can create new projects or update matched ones (by source id), so require both —
		// mirroring the folder create+update assertion below.
		assertPackageImportApiKeyScopes(request.apiKeyScopes, ['project:create', 'project:update']);

		if ((manifest.folders?.length ?? 0) > 0) {
			if (!this.licenseState.isLicensed('feat:folders')) {
				throw new ForbiddenError(
					'Your license does not allow folders. Importing a package with folders requires a license that supports folders.',
				);
			}
			assertPackageImportApiKeyScopes(request.apiKeyScopes, ['folder:create', 'folder:update']);
		}

		if ((manifest.workflows?.length ?? 0) > 0) {
			assertPackageImportApiKeyScopes(request.apiKeyScopes, ['workflow:import']);
		}
	}
}
