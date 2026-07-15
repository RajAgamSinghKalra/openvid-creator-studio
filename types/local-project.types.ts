import type { EditorState } from "./editor-state.types";

export interface LocalVideoProject {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    thumbnailDataUrl?: string;
    currentTime: number;
    editorState: EditorState;
    audioAssetIds: string[];
}

export type LocalVideoProjectPreview = Pick<
    LocalVideoProject,
    "id" | "name" | "createdAt" | "updatedAt" | "thumbnailDataUrl"
>;
