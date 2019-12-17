declare module "read-last-lines" {
  export function read(input_file_path: string, maxLineCount: number, encoding?: string): Promise<string>;
}
