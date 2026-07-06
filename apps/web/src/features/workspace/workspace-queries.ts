import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../../app/query-keys";
import {
  cancelAgentRun,
  createConversationDraft,
  getArtifactPreview,
  listConversations,
  listRuns,
  listWorkspaceAgents,
  renameConversation,
  uploadRunAttachment,
  type ApiConversation,
  type ApiRunAttachment,
} from "./workspace-api";

export function useWorkspaceData() {
  const queryClient = useQueryClient();
  const [agentsQuery, conversationsQuery, runsQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.workspace.agents,
        queryFn: listWorkspaceAgents,
      },
      {
        queryKey: queryKeys.workspace.conversations,
        queryFn: listConversations,
      },
      {
        queryKey: queryKeys.workspace.runs,
        queryFn: listRuns,
      },
    ],
  });

  const error = agentsQuery.error ?? conversationsQuery.error ?? runsQuery.error ?? null;

  return {
    agents: Array.isArray(agentsQuery.data) ? agentsQuery.data : [],
    conversations: Array.isArray(conversationsQuery.data) ? conversationsQuery.data : [],
    error,
    invalidateWorkspace: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.workspace.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all });
    },
    isFetching: agentsQuery.isFetching || conversationsQuery.isFetching || runsQuery.isFetching,
    isLoading: agentsQuery.isPending || conversationsQuery.isPending || runsQuery.isPending,
    runs: Array.isArray(runsQuery.data) ? runsQuery.data : [],
  };
}

export function useArtifactPreviewQuery(artifactId: number | null) {
  return useQuery({
    enabled: artifactId != null,
    queryFn: () => getArtifactPreview(artifactId as number),
    queryKey: artifactId == null
      ? queryKeys.workspace.artifactPreview(0)
      : queryKeys.workspace.artifactPreview(artifactId),
  });
}

export function useCreateConversationDraftMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createConversationDraft,
    onSuccess: (conversation) => {
      queryClient.setQueryData<ApiConversation[]>(
        queryKeys.workspace.conversations,
        (currentConversations = []) => [
          conversation,
          ...currentConversations.filter((item) => item.id !== conversation.id),
        ],
      );
      return queryClient.invalidateQueries({ queryKey: queryKeys.workspace.conversations });
    },
  });
}

export function useRenameConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) =>
      renameConversation(conversationId, title),
    onSuccess: (conversation) => {
      queryClient.setQueryData<ApiConversation[]>(
        queryKeys.workspace.conversations,
        (currentConversations = []) => currentConversations.map((item) =>
          item.id === conversation.id ? conversation : item,
        ),
      );
      return queryClient.invalidateQueries({ queryKey: queryKeys.workspace.conversations });
    },
  });
}

export function useCancelAgentRunMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelAgentRun,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspace.conversations }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspace.runs }),
      ]);
    },
  });
}

export function useUploadRunAttachmentMutation() {
  return useMutation<ApiRunAttachment, Error, { conversationId: string; file: File }>({
    mutationFn: ({ conversationId, file }) => uploadRunAttachment(conversationId, file),
  });
}
