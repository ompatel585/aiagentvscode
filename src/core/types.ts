export interface FileEdit {
    startLine: number;
    endLine: number;
    newText: string;
}

export interface FilePatch {
    path: string;
    edits: FileEdit[];
}

export interface BrainResponse {
    success: boolean;
    changes: FilePatch[];
}

