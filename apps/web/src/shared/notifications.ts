import { toast } from "sonner";

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export const notify = {
  error(error: unknown, fallback = "操作失败，请稍后重试。") {
    toast.error(errorMessage(error, fallback));
  },
  info(message: string) {
    toast(message);
  },
  success(message: string) {
    toast.success(message);
  },
};
