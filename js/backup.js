// backup.js - helpers para export/import

function csvEscape(s) {
  const str = String(s).replaceAll('"', '""');
  return `"${str}"`;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
