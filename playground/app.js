import { merge } from "https://cdn.jsdelivr.net/npm/@caseflux-id/pdf-bundle@0.1.0/dist/index.js";

const html = document.querySelector("#html");
const files = document.querySelector("#files");
const button = document.querySelector("#merge");
const status = document.querySelector("#status");
const download = document.querySelector("#download");
let previousUrl;

button.addEventListener("click", async () => {
  button.disabled = true;
  download.hidden = true;
  status.textContent = "Building PDF…";
  try {
    const documents = [{ mimeType: "text/html", data: html.value }];
    for (const file of files.files) {
      documents.push({ mimeType: file.type, data: new Uint8Array(await file.arrayBuffer()) });
    }
    const pdf = await merge(documents);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    previousUrl = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    download.href = previousUrl;
    download.hidden = false;
    status.textContent = "Done — " + documents.length + " document" + (documents.length === 1 ? "" : "s") + " merged.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    button.disabled = false;
  }
});
