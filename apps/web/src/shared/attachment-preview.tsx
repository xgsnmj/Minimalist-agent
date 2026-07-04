export type PreviewType =
  | "markdown"
  | "plaintext"
  | "image"
  | "pdf"
  | "code"
  | "table"
  | "json"
  | "html"
  | "download";

export type UploadedAttachmentPreview = {
  id: number;
  filename: string;
  contentType: string;
  previewType: PreviewType;
  text?: string;
  dataUrl?: string;
};

export function createAttachmentPreview(file: File): UploadedAttachmentPreview {
  const previewType = inferPreviewType(file.name, file.type);
  return {
    id: Date.now(),
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    previewType,
  };
}

export function normalizeAttachmentPreviewText(previewType: PreviewType, text: string) {
  if (previewType === "json") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read file preview."));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read file preview."));
    };
    reader.readAsDataURL(file);
  });
}

export function AttachmentPreview({ preview }: { preview: UploadedAttachmentPreview }) {
  return (
    <>
      <p className="preview-label">{preview.previewType}</p>
      <h3>{preview.filename}</h3>
      {preview.previewType === "image" && preview.dataUrl ? (
        <img className="preview-media" src={preview.dataUrl} alt={`Image preview: ${preview.filename}`} />
      ) : null}
      {preview.previewType === "pdf" && preview.dataUrl ? (
        <iframe className="preview-frame" src={preview.dataUrl} title={`PDF preview: ${preview.filename}`} />
      ) : null}
      {preview.previewType === "html" ? (
        <iframe
          className="preview-frame"
          sandbox=""
          srcDoc={preview.text ?? ""}
          title={`HTML preview: ${preview.filename}`}
        />
      ) : null}
      {preview.previewType === "table" ? (
        <table className="preview-table">
          <tbody>
            {renderPreviewTableRows(preview.text ?? "")}
          </tbody>
        </table>
      ) : null}
      {preview.previewType !== "image" &&
      preview.previewType !== "pdf" &&
      preview.previewType !== "html" &&
      preview.previewType !== "table" ? (
        <pre className="preview-code">{preview.text ?? "附件已加入本次运行上下文。"}</pre>
      ) : null}
      {preview.previewType === "download" ? (
        <p className="preview-text">此类型仅保留文件元数据。</p>
      ) : null}
    </>
  );
}

function renderPreviewTableRows(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  return lines.map((line, index) => {
    const cells = line.split(/,|\t/);
    return (
      <tr key={`${index}-${line}`}>
        {cells.map((cell, cellIndex) => (
          <td key={`${index}-${cellIndex}`}>{cell.trim()}</td>
        ))}
      </tr>
    );
  });
}

function inferPreviewType(filename: string, contentType: string): PreviewType {
  const lowerName = filename.toLowerCase();
  const lowerContentType = contentType.toLowerCase();
  if (lowerContentType === "text/markdown" || lowerName.endsWith(".md")) {
    return "markdown";
  }
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm") || lowerContentType === "text/html") {
    return "html";
  }
  if (lowerContentType.startsWith("text/")) {
    return "plaintext";
  }
  if (lowerContentType.startsWith("image/")) {
    return "image";
  }
  if (lowerContentType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return "pdf";
  }
  if (lowerContentType.includes("json") || lowerName.endsWith(".json")) {
    return "json";
  }
  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) {
    return "table";
  }
  if (
    lowerName.endsWith(".py") ||
    lowerName.endsWith(".ts") ||
    lowerName.endsWith(".tsx") ||
    lowerName.endsWith(".js") ||
    lowerName.endsWith(".jsx") ||
    lowerName.endsWith(".sh") ||
    lowerName.endsWith(".css")
  ) {
    return "code";
  }
  return "download";
}
