import { create } from "zustand";

export type ArtifactPanelView = "preview" | "metadata";

export const conversationListPageSize = 5;

type WorkspaceUiValues = {
  artifactPanelView: ArtifactPanelView;
  commandSearch: string;
  conversationSearch: string;
  copiedArtifactId: number | null;
  draftAgentId: string;
  draftModelId: string;
  draftRevision: number;
  isCommandPaletteOpen: boolean;
  isRenaming: boolean;
  isSidebarCollapsed: boolean;
  latestAttachmentPreviewName: string | null;
  previewArtifactId: number | null;
  renameValue: string;
  selectedConversationId: string | null;
  visibleConversationCount: number;
};

type WorkspaceUiActions = {
  closeArtifactPreview: () => void;
  closeCommandPalette: () => void;
  incrementDraftRevision: () => void;
  incrementVisibleConversationCount: (totalCount: number) => void;
  openArtifactPreview: (artifactId: number) => void;
  openCommandPalette: () => void;
  resetForNewConversation: () => void;
  resetVisibleConversationCount: () => void;
  selectConversation: (conversationId: string, title?: string) => void;
  setArtifactPanelView: (view: ArtifactPanelView) => void;
  setCommandSearch: (value: string) => void;
  setConversationSearch: (value: string) => void;
  setCopiedArtifactId: (artifactId: number | null) => void;
  setDraftAgentId: (agentId: string) => void;
  setDraftModelId: (modelId: string) => void;
  setDraftSelection: (agentId: string, modelId: string) => void;
  setIsRenaming: (isRenaming: boolean) => void;
  setLatestAttachmentPreviewName: (filename: string | null) => void;
  setPreviewArtifactId: (artifactId: number | null) => void;
  setRenameValue: (value: string) => void;
  setSelectedConversationId: (conversationId: string | null) => void;
  toggleSidebar: () => void;
};

export type WorkspaceUiState = WorkspaceUiValues & WorkspaceUiActions;

export const initialWorkspaceUiState: WorkspaceUiValues = {
  artifactPanelView: "preview",
  commandSearch: "",
  conversationSearch: "",
  copiedArtifactId: null,
  draftAgentId: "",
  draftModelId: "",
  draftRevision: 0,
  isCommandPaletteOpen: false,
  isRenaming: false,
  isSidebarCollapsed: false,
  latestAttachmentPreviewName: null,
  previewArtifactId: null,
  renameValue: "",
  selectedConversationId: null,
  visibleConversationCount: conversationListPageSize,
};

export const useWorkspaceUiStore = create<WorkspaceUiState>((set) => ({
  ...initialWorkspaceUiState,
  closeArtifactPreview: () => set({ previewArtifactId: null }),
  closeCommandPalette: () => set({ commandSearch: "", isCommandPaletteOpen: false }),
  incrementDraftRevision: () => set((state) => ({ draftRevision: state.draftRevision + 1 })),
  incrementVisibleConversationCount: (totalCount) => set((state) => ({
    visibleConversationCount: Math.min(
      state.visibleConversationCount + conversationListPageSize,
      totalCount,
    ),
  })),
  openArtifactPreview: (artifactId) => set({
    artifactPanelView: "preview",
    previewArtifactId: artifactId,
  }),
  openCommandPalette: () => set({ isCommandPaletteOpen: true }),
  resetForNewConversation: () => set((state) => ({
    draftRevision: state.draftRevision + 1,
    isRenaming: false,
    latestAttachmentPreviewName: null,
    previewArtifactId: null,
    renameValue: "新对话",
    selectedConversationId: null,
  })),
  resetVisibleConversationCount: () => set({ visibleConversationCount: conversationListPageSize }),
  selectConversation: (conversationId, title = "") => set({
    isRenaming: false,
    previewArtifactId: null,
    renameValue: title,
    selectedConversationId: conversationId,
  }),
  setArtifactPanelView: (artifactPanelView) => set({ artifactPanelView }),
  setCommandSearch: (commandSearch) => set({ commandSearch }),
  setConversationSearch: (conversationSearch) => set({
    conversationSearch,
    visibleConversationCount: conversationListPageSize,
  }),
  setCopiedArtifactId: (copiedArtifactId) => set({ copiedArtifactId }),
  setDraftAgentId: (draftAgentId) => set({ draftAgentId }),
  setDraftModelId: (draftModelId) => set({ draftModelId }),
  setDraftSelection: (draftAgentId, draftModelId) => set({ draftAgentId, draftModelId }),
  setIsRenaming: (isRenaming) => set({ isRenaming }),
  setLatestAttachmentPreviewName: (latestAttachmentPreviewName) => set({ latestAttachmentPreviewName }),
  setPreviewArtifactId: (previewArtifactId) => set({ previewArtifactId }),
  setRenameValue: (renameValue) => set({ renameValue }),
  setSelectedConversationId: (selectedConversationId) => set({ selectedConversationId }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
}));

export function resetWorkspaceUiStore() {
  useWorkspaceUiStore.setState(initialWorkspaceUiState);
}
