import { LicenseState } from '@n8n/backend-common';
import { Service } from '@n8n/di';

import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { EventService } from '@/events/event.service';

import type { CredentialBindingRequest } from '../entities/credential/credential.types';
import { ProjectImporter } from '../entities/project/project-importer';
import type { PackageReader } from '../io/package-reader';
import type {
	BlockingIssue,
	ImportContext,
	ImportedFolderSummary,
	ImportedWorkflowSummary,
	ImportPackageRequest,
	ImportResult,
	PackageImportBindings,
} from '../n8n-packages.types';
import { mergeBindings } from '../n8n-packages.types';
import { toImportBlockedError } from './import-blocked.error';
import {
	ImportOrchestrator,
	type ImportOrchestrationInput,
	type ImportOrchestrationResult,
	type ImportPlan,
} from './import-orchestrator';
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
		const projectPlan = await this.projectImporter.plan(request.user, projects);
		const projectSummaries = await this.projectImporter.apply(request.user, projectPlan);

		// Plan every project's contents and gate the whole package before writing any of it, so a later
		// project's blocking issue can't leave earlier projects partially imported.
		const planned: Array<{ project: ManifestEntry; plan: ImportPlan }> = [];
		const blockingIssues: BlockingIssue[] = [];
		for (const project of manifest.projects ?? []) {
			const input = await this.buildProjectImportInput(request, reader, manifest, project);
			const plan = await this.importOrchestrator.plan(input);
			planned.push({ project, plan });
			blockingIssues.push(...plan.blockingIssues);
		}
		if (blockingIssues.length > 0) {
			throw toImportBlockedError(blockingIssues);
		}

		const workflows: ImportedWorkflowSummary[] = [];
		const folders: ImportedFolderSummary[] = [];
		const scopedBindings: PackageImportBindings[] = [];
		const matched: string[] = [];
		const stubbed: string[] = [];
		const applied: Array<{ input: ImportOrchestrationInput; imported: ImportOrchestrationResult }> =
			[];

		for (const { project, plan } of planned) {
			const imported = await this.importOrchestrator.apply(plan);
			workflows.push(...toImportedWorkflowSummaries(imported.workflowOutcomes, project.id));
			folders.push(...imported.folderSummaries);
			scopedBindings.push(imported.bindings);
			matched.push(...imported.credentialResult.matched);
			stubbed.push(...imported.credentialResult.stubbed);
			applied.push({ input: plan.input, imported });
		}

		// Emit per project, but only once every project has been applied — a gated or failed run reports
		// nothing rather than telemetry for a partial import.
		for (const { input, imported } of applied) {
			emitPackageImportedEvent(this.eventService, {
				request,
				context: input.context,
				manifest,
				imported,
				credentialRequest: input.credentialRequest,
			});
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

	/** Parses one project's scoped folders and workflows into an orchestration input (no writes). */
	private async buildProjectImportInput(
		request: ImportPackageRequest,
		reader: PackageReader,
		manifest: PackageManifest,
		project: ManifestEntry,
	): Promise<ImportOrchestrationInput> {
		const basePrefix = `${project.target}/`;
		const folders = await this.packageParser.getFolders(reader, basePrefix);
		const workflows = await this.packageParser.getWorkflows(reader, basePrefix);

		const credentialRequest: CredentialBindingRequest = {
			requirements: identifyRequirements(manifest.requirements?.credentials, workflows),
			matchingMode: request.credentialMatchingMode,
			missingMode: request.credentialMissingMode,
			credentialBindings: request.bindings?.credentials,
		};

		// The project is recreated under its source id, so scope to it; folders and workflows nest via
		// the package hierarchy, not a request folderId.
		const context: ImportContext = { user: request.user, projectId: project.id, folderId: null };
		return { context, folders, workflows, credentialRequest, options: request };
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
