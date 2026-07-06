import { QueryClient } from "@tanstack/react-query";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 15_000,
      },
    },
  });
}
