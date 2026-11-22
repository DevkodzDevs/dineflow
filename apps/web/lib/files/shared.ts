/** File Manager (0192) — the few values both the page and the actions use (a "use server" file may export only functions). */
export const FILE_MAX = 50 * 1048576;
export const TEXT_MAX = 1048576;
/** What can be edited in the page: plain text kinds, by mime or by ending. */
export const isTextFile = (name: string, mime: string | null | undefined) =>
  /^text\//.test(mime ?? "") || /^application\/(json|xml|x-yaml|yaml|javascript|sql|csv)$/.test(mime ?? "") || /\.(txt|md|markdown|json|csv|tsv|log|xml|yml|yaml|html|htm|css|js|ts|sql|ini|cfg|conf|env|sh|bat|ps1)$/i.test(name);
