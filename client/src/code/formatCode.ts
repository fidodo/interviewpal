// Formats JavaScript, TypeScript and JSX with Prettier in the browser. Prettier and its plugins are loaded on first
// use, so pages that never format don't download them.
const PARSERS: Record<string, string> = { javascript: "babel", react: "babel", typescript: "typescript" };

export const canFormat = (language: string) => language in PARSERS;

export class FormatError extends Error {}

export async function formatCode(language: string, code: string): Promise<string> {
  const parser = PARSERS[language];
  if (!parser) return code;
  // Only the parser this stack needs is downloaded (TypeScript's is the biggest).
  const [prettier, estree, parserPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/estree"),
    parser === "typescript" ? import("prettier/plugins/typescript") : import("prettier/plugins/babel"),
  ]);
  try {
    // The estree plugin's typings wrap it in a default export; the module object itself is the plugin.
    const plugins = [estree, parserPlugin] as unknown as import("prettier").Plugin[];
    return await prettier.format(code, { parser, plugins, printWidth: 100 });
  } catch (err) {
    const line = (err as { loc?: { start?: { line?: number } } }).loc?.start?.line;
    throw new FormatError(line ? `Couldn't format: there's a syntax error on line ${line}.` : "Couldn't format: the code has a syntax error.");
  }
}
