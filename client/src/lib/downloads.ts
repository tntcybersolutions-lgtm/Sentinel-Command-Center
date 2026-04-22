export async function downloadBlob(urlOrBlob: string | Blob, filename?: string) {
  let blob: Blob;
  let inferredName = filename || "download";

  if (typeof urlOrBlob === "string") {
    const res = await fetch(urlOrBlob);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    blob = await res.blob();

    const cd = res.headers.get("content-disposition") || "";
    if (!filename && cd.includes("filename=")) {
      inferredName = cd.split("filename=")[1]?.replace(/"/g, "").trim() || "download";
    }
  } else {
    blob = urlOrBlob;
  }

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = inferredName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
