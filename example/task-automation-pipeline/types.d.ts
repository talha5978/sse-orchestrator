export interface JobEventMap {
	job_started: { jobId: string; task: string };
	step_progress: { step: number; name: string; progress: number; status: string };
	artifact_ready: { artifactId: string; type: string; downloadUrl: string };
	job_completed: { jobId: string; rowsProcessed: number; durationMs: number };
}
