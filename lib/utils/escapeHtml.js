const HTML_ESCAPE_REGEX = /[&<>'"]/g;

const ESCAPE_LOOKUP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(HTML_ESCAPE_REGEX, (char) => ESCAPE_LOOKUP[char]);
}
